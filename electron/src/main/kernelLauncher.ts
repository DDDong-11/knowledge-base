import { spawn } from 'node:child_process';
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
};

export type RunningKernel = {
  port: number;
  token: string;
  client: KernelClient;
  stop: () => Promise<void>;
};

async function waitForPortFile(portFile: string, timeoutMs: number, pollIntervalMs: number): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const text = (await fs.readFile(portFile, 'utf8')).trim();
      if (text) {
        const port = Number(text);
        if (Number.isInteger(port) && port > 0) return port;
      }
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(`timed out waiting for KB_PORT_FILE at ${portFile}`);
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
  child.stderr.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString('utf8');
    if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-8000);
  });
  child.stdout.on('data', (chunk: Buffer) => {
    const line = chunk.toString('utf8');
    if (line.includes('KB_READY')) {
      process.stdout.write(line);
    }
  });

  const exitPromise = new Promise<never>((_resolve, reject) => {
    child.on('exit', (code, signal) => {
      reject(new Error(`kernel exited early code=${code} signal=${signal}: ${stderrBuf}`));
    });
    child.on('error', reject);
  });

  const pollIntervalMs = opts.pollIntervalMs ?? 200;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  let port: number;
  try {
    port = await Promise.race([
      waitForPortFile(portFile, timeoutMs, pollIntervalMs),
      exitPromise,
    ]);
  } catch (e) {
    child.kill('SIGTERM');
    throw e;
  }

  const client = createKernelClient({
    baseUrl: `http://127.0.0.1:${port}`,
    token,
    fetchImpl: opts.readyFetch,
  });

  const readyDeadline = Date.now() + timeoutMs;
  while (Date.now() < readyDeadline) {
    try {
      const health = await client.health();
      if (health.status === 'UP') break;
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  try {
    const health = await client.health();
    if (health.status !== 'UP') {
      throw new Error('kernel health not UP');
    }
  } catch (e) {
    child.kill('SIGTERM');
    throw new Error(`kernel did not become healthy: ${e instanceof Error ? e.message : e}`);
  }

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    child.removeAllListeners('exit');
    if (!child.killed) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 3000);
        child.once('exit', () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    await fs.rm(portFile, { force: true });
  };

  return { port, token, client, stop };
}

/** Resolve jar relative to compiled main: electron/dist/main → repo/java-kernel/target/... */
export function defaultJarPath(): string {
  return path.resolve(__dirname, '..', '..', '..', 'java-kernel', 'target', 'kb-kernel-0.1.0-SNAPSHOT.jar');
}
