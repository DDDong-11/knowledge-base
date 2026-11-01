import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernelClient } from './kernelClient';

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
  await client.search('docker prune', 10);
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
