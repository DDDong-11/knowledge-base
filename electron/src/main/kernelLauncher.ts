import { type ChildProcess, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKernelClient, type KernelClient } from './kernelClient';
import { generateToken } from './token';

export type StartKernelOptions = {
  jarPath: string;
  javaPath?: string;
  dataDir: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  readyFetch?: typeof fetch;
  /** Called once if the JVM exits after a successful start (not after stop()). */
  onExit?: (info: { code: number | null; signal: NodeJS.Signals | null }) => void;
};

export type RunningKernel = {
  port: number;
  token: string;
  client: KernelClient;
  stop: () => Promise<void>;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Detach startup exit/error listeners, SIGTERM → wait → SIGKILL, remove port file.
 * Safe to call from start-failure paths and from RunningKernel.stop().
 */
export async function forceStop(
  child: ChildProcess,
  portFile: string,
  opts?: { settleMs?: number },
): Promise<void> {
  const settleMs = opts?.settleMs ?? 3000;
  child.removeAllListeners('exit');
  child.removeAllListeners('error');
  // Attach a no-op error handler so a late 'error' cannot become unhandled.
  child.on('error', () => {});

  try {
    child.stdout?.destroy();
  } catch {
    // ignore
  }
  try {
    child.stderr?.destroy();
  } catch {
    // ignore
  }

  // Still alive (or kill issued but not reaped yet): await exit with SIGTERM→SIGKILL.
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise<void>((resolve) => {
      let settled = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      let graceTimer: ReturnType<typeof setTimeout> | undefined;
      const done = () => {
        if (settled) return;
        settled = true;
        if (killTimer !== undefined) clearTimeout(killTimer);
        if (graceTimer !== undefined) clearTimeout(graceTimer);
        resolve();
      };
      child.once('exit', done);

      if (!child.killed) {
        try {
          child.kill('SIGTERM');
        } catch {
          done();
          return;
        }
      }

      killTimer = setTimeout(() => {
        try {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL');
          }
        } catch {
          // ignore
        }
        // Do not hang forever if SIGKILL is ignored; resolve after a short grace.
        graceTimer = setTimeout(done, 500);
      }, settleMs);
    });
  }

  await fs.rm(portFile, { force: true });
}

async function waitForPortFile(
  portFile: string,
  timeoutMs: number,
  pollIntervalMs: number,
  signal: AbortSignal,
): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (signal.aborted) {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }
    try {
      const text = (await fs.readFile(portFile, 'utf8')).trim();
      if (text) {
        const port = Number(text);
        if (Number.isInteger(port) && port > 0) return port;
      }
    } catch {
      // not yet
    }
    await sleep(pollIntervalMs, signal);
  }
  throw new Error(`timed out waiting for KB_PORT_FILE at ${portFile}`);
}

async function waitForHealth(
  client: KernelClient,
  timeoutMs: number,
  pollIntervalMs: number,
  signal: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal.aborted) {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }
    try {
      const health = await client.health();
      if (health.status === 'UP') return;
    } catch {
      // keep polling
    }
    await sleep(pollIntervalMs, signal);
  }
  // one last check so the thrown error is precise
  const health = await client.health();
  if (health.status !== 'UP') {
    throw new Error('kernel health not UP');
  }
}

export async function startKernel(opts: StartKernelOptions): Promise<RunningKernel> {
  const token = generateToken();
  const portFile = path.join(os.tmpdir(), `kb-port-${process.pid}-${Date.now()}.txt`);
  await fs.rm(portFile, { force: true });
  await fs.mkdir(opts.dataDir, { recursive: true });

  const javaPath = opts.javaPath ?? 'java';
  const child = spawn(
    javaPath,
    ['-jar', opts.jarPath],
    {
      env: {
        ...process.env,
        KB_PORT: '0',
        KB_TOKEN: token,
        KB_PORT_FILE: portFile,
        KB_DATA_DIR: opts.dataDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let stderrBuf = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString('utf8');
    if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-8000);
  });
  child.stdout?.on('data', (chunk: Buffer) => {
    const line = chunk.toString('utf8');
    if (line.includes('KB_READY')) {
      process.stdout.write(line);
    }
  });

  const bootAbort = new AbortController();

  // Shared "child died during startup" signal. Rejects once; callers race against it.
  // forceStop removes these listeners before kill so a late exit cannot unhandled-reject.
  const exitPromise = new Promise<never>((_resolve, reject) => {
    child.on('exit', (code, signal) => {
      bootAbort.abort();
      reject(new Error(`kernel exited early code=${code} signal=${signal}: ${stderrBuf}`));
    });
    child.on('error', (err) => {
      bootAbort.abort();
      reject(err);
    });
  });
  // Prevent unhandledRejection if exit fires after we abandon the race without forceStop
  // (forceStop is the normal path; this is belt-and-suspenders for the reject itself).
  exitPromise.catch(() => {});

  const pollIntervalMs = opts.pollIntervalMs ?? 200;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  let port: number;
  try {
    port = await Promise.race([
      waitForPortFile(portFile, timeoutMs, pollIntervalMs, bootAbort.signal),
      exitPromise,
    ]);
  } catch (e) {
    bootAbort.abort();
    await forceStop(child, portFile);
    throw e;
  }

  const client = createKernelClient({
    baseUrl: `http://127.0.0.1:${port}`,
    token,
    fetchImpl: opts.readyFetch,
  });

  try {
    await Promise.race([
      waitForHealth(client, timeoutMs, pollIntervalMs, bootAbort.signal),
      exitPromise,
    ]);
  } catch (e) {
    bootAbort.abort();
    await forceStop(child, portFile);
    throw new Error(`kernel did not become healthy: ${e instanceof Error ? e.message : e}`);
  }

  // Startup succeeded — drop startup exit/error listeners so they cannot unhandled-reject.
  child.removeAllListeners('exit');
  child.removeAllListeners('error');

  let stopped = false;
  let exitNotified = false;

  // Supervise post-ready crashes: notify once, never as unhandledRejection.
  child.on('exit', (code, signal) => {
    if (stopped || exitNotified) return;
    exitNotified = true;
    try {
      opts.onExit?.({ code, signal });
    } catch {
      // swallow callback errors
    }
  });
  child.on('error', () => {
    // ignore late spawn errors after ready; onExit covers real exits
  });

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await forceStop(child, portFile);
  };

  return { port, token, client, stop };
}

/** Resolve jar relative to compiled main: electron/dist/main → repo/java-kernel/target/... */
export function defaultJarPath(): string {
  return path.resolve(__dirname, '..', '..', '..', 'java-kernel', 'target', 'kb-kernel-0.1.0-SNAPSHOT.jar');
}
