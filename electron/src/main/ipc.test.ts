import test from 'node:test';
import assert from 'node:assert/strict';
import { IPC_CHANNELS, registerIpc, type IpcDeps } from './ipc';
import { KernelHttpError, type KernelClient } from './kernelClient';

type Handler = (event: { sender: unknown }, ...args: unknown[]) => unknown;

function setup(opts: { kernel?: boolean; client?: Partial<KernelClient> } = {}) {
  const handlers = new Map<string, Handler>();
  const calls: { method: string; args: unknown[] }[] = [];
  const clipboard: string[] = [];
  let hidden = 0;
  const record = (method: string, result: unknown = {}) => async (...args: unknown[]) => {
    calls.push({ method, args });
    return result;
  };
  const client = {
    health: record('health', { status: 'UP', app: 'kb-kernel' }),
    search: record('search', { query: 'docker', total: 0, hits: [] }),
    listSnippets: record('listSnippets'),
    getSnippet: record('getSnippet'),
    createSnippet: record('createSnippet'),
    updateSnippet: record('updateSnippet'),
    deleteSnippet: record('deleteSnippet', null),
    ...opts.client,
  } as unknown as KernelClient;
  const trusted = { id: 'panel' };
  const deps: IpcDeps = {
    ipcMain: { handle: (ch, fn) => { handlers.set(ch, fn); } },
    getKernel: () => (opts.kernel === false ? null : { port: 17321, client }),
    isTrustedSender: (s) => s === trusted,
    writeClipboard: (t) => { clipboard.push(t); },
    hidePanel: () => { hidden++; },
  };
  registerIpc(deps);
  const invoke = (ch: string, ...args: unknown[]) => handlers.get(ch)!({ sender: trusted }, ...args);
  const invokeAs = (sender: unknown, ch: string, ...args: unknown[]) => handlers.get(ch)!({ sender }, ...args);
  return { handlers, calls, clipboard, hiddenCount: () => hidden, invoke, invokeAs };
}

test('registers all 10 channels', () => {
  const { handlers } = setup();
  assert.equal(IPC_CHANNELS.length, 10);
  assert.deepEqual([...handlers.keys()].sort(), [...IPC_CHANNELS].sort());
});

test('untrusted sender gets 403 and kernel is not called', async () => {
  const { invokeAs, calls } = setup();
  const r = await invokeAs({ id: 'evil' }, 'kb:search', 'docker', {});
  assert.deepEqual(r, { ok: false, error: { status: 403, error: 'FORBIDDEN', message: 'untrusted sender' } });
  assert.equal(calls.length, 0);
});

test('invalid argument gets 400 INVALID_ARGUMENT and kernel is not called', async () => {
  const { invoke, calls } = setup();
  const r = (await invoke('kb:getSnippet', -1)) as { ok: false; error: { status: number; error: string } };
  assert.equal(r.ok, false);
  assert.equal(r.error.status, 400);
  assert.equal(r.error.error, 'INVALID_ARGUMENT');
  assert.equal(calls.length, 0);
});

test('search forwards validated args and wraps data', async () => {
  const { invoke, calls } = setup();
  const r = await invoke('kb:search', ' docker ', { kind: 'CODE', limit: 5 });
  assert.deepEqual(calls[0], { method: 'search', args: ['docker', { kind: 'CODE', limit: 5 }] });
  assert.deepEqual(r, { ok: true, data: { query: 'docker', total: 0, hits: [] } });
});

test('meta returns port; delete returns null data', async () => {
  const { invoke } = setup();
  assert.deepEqual(await invoke('kb:meta'), { ok: true, data: { port: 17321 } });
  assert.deepEqual(await invoke('kb:deleteSnippet', 3), { ok: true, data: null });
});

test('kernel not started gives 503 KERNEL_UNAVAILABLE', async () => {
  const { invoke } = setup({ kernel: false });
  const r = (await invoke('kb:health')) as { ok: false; error: { status: number; error: string } };
  assert.equal(r.error.status, 503);
  assert.equal(r.error.error, 'KERNEL_UNAVAILABLE');
});

test('KernelHttpError is passed through with fieldErrors', async () => {
  const fieldErrors = [{ field: 'title', message: 'title is required' }];
  const { invoke } = setup({
    client: {
      createSnippet: async () => {
        throw new KernelHttpError(400, 'request validation failed', 'VALIDATION_FAILED', '/api/snippets', fieldErrors);
      },
    },
  });
  const r = await invoke('kb:createSnippet', { title: 'x' });
  assert.deepEqual(r, {
    ok: false,
    error: { status: 400, error: 'VALIDATION_FAILED', message: 'request validation failed', fieldErrors },
  });
});

test('connection failure gives 503 KERNEL_UNREACHABLE', async () => {
  const { invoke } = setup({ client: { health: async () => { throw new TypeError('fetch failed'); } } });
  const r = (await invoke('kb:health')) as { ok: false; error: { status: number; error: string; message: string } };
  assert.equal(r.error.status, 503);
  assert.equal(r.error.error, 'KERNEL_UNREACHABLE');
  assert.match(r.error.message, /fetch failed/);
});

test('copyText writes clipboard; hidePanel hides', async () => {
  const s = setup();
  assert.deepEqual(await s.invoke('kb:copyText', 'docker ps'), { ok: true, data: null });
  assert.deepEqual(s.clipboard, ['docker ps']);
  assert.deepEqual(await s.invoke('kb:hidePanel'), { ok: true, data: null });
  assert.equal(s.hiddenCount(), 1);
  const bad = (await s.invoke('kb:copyText', 5)) as { ok: boolean };
  assert.equal(bad.ok, false);
});

test('createSnippet drops source before forwarding', async () => {
  const { invoke, calls } = setup();
  await invoke('kb:createSnippet', { title: 't', kind: 'CLIP', source: 'ALMA' });
  assert.deepEqual(calls[0], { method: 'createSnippet', args: [{ title: 't', kind: 'CLIP' }] });
});

test('updateSnippet validates id and body', async () => {
  const { invoke, calls } = setup();
  await invoke('kb:updateSnippet', 4, { title: 't2' });
  assert.deepEqual(calls[0], { method: 'updateSnippet', args: [4, { title: 't2' }] });
});
