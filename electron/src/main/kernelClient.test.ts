import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernelClient, KernelHttpError } from './kernelClient';

test('health sends X-KB-Token and parses body', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ status: 'UP', app: 'kb-kernel' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const client = createKernelClient({
    baseUrl: 'http://127.0.0.1:19090',
    token: 'secret',
    fetchImpl,
  });
  const body = await client.health();
  assert.deepEqual(body, { status: 'UP', app: 'kb-kernel' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:19090/api/health');
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get('X-KB-Token'), 'secret');
});

test('createSnippet POSTs JSON and returns snippet', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    assert.equal(init?.method, 'POST');
    assert.equal(JSON.parse(String(init?.body)).title, 'Docker 清理');
    return new Response(
      JSON.stringify({
        id: 1,
        title: 'Docker 清理',
        content: 'docker system prune -af',
        tags: ['docker'],
        createTime: '2026-11-01T12:00:00',
        updateTime: '2026-11-01T12:00:00',
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    );
  };
  const client = createKernelClient({
    baseUrl: 'http://127.0.0.1:1',
    token: 't',
    fetchImpl,
  });
  const created = await client.createSnippet({
    title: 'Docker 清理',
    content: 'docker system prune -af',
    tags: ['docker', 'shell'],
  });
  assert.equal(created.id, 1);
  assert.deepEqual(created.tags, ['docker']);
});

test('search encodes q and limit', async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ query: 'docker', total: 0, hits: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const client = createKernelClient({ baseUrl: 'http://127.0.0.1:9', token: 't', fetchImpl });
  await client.search('docker prune', { limit: 10 });
  assert.equal(urls[0], 'http://127.0.0.1:9/api/snippets/search?q=docker+prune&limit=10');
});

test('non-2xx throws with status and error code', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ status: 401, error: 'UNAUTHORIZED', message: 'nope', path: '/api/health' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  const client = createKernelClient({ baseUrl: 'http://127.0.0.1:1', token: 'bad', fetchImpl });
  await assert.rejects(() => client.health(), (err: Error & { status?: number; error?: string }) => {
    assert.equal(err.status, 401);
    assert.equal(err.error, 'UNAUTHORIZED');
    return true;
  });
});

type Call = { url: string; method: string; body?: string };
function recorder(status = 200, payload: unknown = {}) {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body as string | undefined });
    if (status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, client: createKernelClient({ baseUrl: 'http://127.0.0.1:9', token: 't', fetchImpl }) };
}

test('listSnippets encodes only given params', async () => {
  const { calls, client } = recorder(200, { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
  await client.listSnippets({ size: 20, kind: 'CODE' });
  await client.listSnippets();
  assert.equal(calls[0].url, 'http://127.0.0.1:9/api/snippets?size=20&kind=CODE');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[1].url, 'http://127.0.0.1:9/api/snippets');
});

test('getSnippet GETs by id', async () => {
  const { calls, client } = recorder(200, { id: 7 });
  await client.getSnippet(7);
  assert.equal(calls[0].url, 'http://127.0.0.1:9/api/snippets/7');
  assert.equal(calls[0].method, 'GET');
});

test('updateSnippet PUTs JSON including kind', async () => {
  const { calls, client } = recorder(200, { id: 7 });
  await client.updateSnippet(7, { title: 'x', kind: 'NOTE' });
  assert.equal(calls[0].url, 'http://127.0.0.1:9/api/snippets/7');
  assert.equal(calls[0].method, 'PUT');
  assert.deepEqual(JSON.parse(String(calls[0].body)), { title: 'x', kind: 'NOTE' });
});

test('deleteSnippet DELETEs and resolves null on 204', async () => {
  const { calls, client } = recorder(204);
  const r = await client.deleteSnippet(7);
  assert.equal(r, null);
  assert.equal(calls[0].method, 'DELETE');
  assert.equal(calls[0].url, 'http://127.0.0.1:9/api/snippets/7');
});

test('search with options encodes q, limit and kind; default limit 50', async () => {
  const { calls, client } = recorder(200, { query: '', total: 0, hits: [] });
  await client.search('docker prune', { kind: 'CLIP', limit: 10 });
  await client.search('x');
  assert.equal(calls[0].url, 'http://127.0.0.1:9/api/snippets/search?q=docker+prune&limit=10&kind=CLIP');
  assert.equal(calls[1].url, 'http://127.0.0.1:9/api/snippets/search?q=x&limit=50');
});

test('400 keeps fieldErrors on KernelHttpError', async () => {
  const fieldErrors = [{ field: 'title', message: 'title is required' }];
  const { client } = recorder(400, { status: 400, error: 'VALIDATION_FAILED', message: 'request validation failed', path: '/api/snippets', fieldErrors });
  await assert.rejects(() => client.createSnippet({ title: '' }), (err: unknown) => {
    assert.ok(err instanceof KernelHttpError);
    assert.equal(err.status, 400);
    assert.equal(err.error, 'VALIDATION_FAILED');
    assert.deepEqual(err.fieldErrors, fieldErrors);
    return true;
  });
});
