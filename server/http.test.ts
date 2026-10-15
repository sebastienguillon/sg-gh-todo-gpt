import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AppState, Task } from '../shared/types.js';
import { createApp } from './app.js';
import { DataStore } from './store.js';

const run = promisify(execFile);

async function fixture(t: TestContext) {
  const dataDir = await mkdtemp(join(tmpdir(), 'gh-todo-http-'));
  let store: DataStore | undefined;
  let server: Server | undefined;
  let origin = '';
  async function start() {
    store = await DataStore.open({ dataDir, autoSync: false });
    server = createApp(store).listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server!.once('listening', resolve);
      server!.once('error', reject);
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  async function stop() {
    if (server) {
      const current = server;
      server = undefined;
      await new Promise<void>((resolve, reject) => current.close(error => error ? reject(error) : resolve()));
    }
    if (store) { await store.close(); store = undefined; }
  }
  t.after(async () => { await stop(); await rm(dataDir, { recursive: true, force: true }); });
  await start();
  async function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    return fetch(`${origin}${path}`, {
      method,
      headers: { ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', Origin: origin }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function state(method = 'GET', path = '/api/state', body?: unknown, status = 200) {
    const response = await request(method, path, body);
    assert.equal(response.status, status, await response.clone().text());
    return response.json() as Promise<AppState>;
  }
  return {
    dataDir, request, state,
    origin: () => origin,
    restart: async () => { await stop(); await start(); },
  };
}

function task(state: AppState, id: string): Task {
  const found = state.tasks.find(item => item.id === id);
  assert.ok(found, 'task must exist in the returned state');
  return found;
}

async function jsonError(response: Response, status: number) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  const body = await response.json() as { error?: unknown };
  assert.equal(typeof body.error, 'string');
  assert.ok((body.error as string).length > 0);
  return body.error as string;
}

test('tasks, lists, completion and undo survive a service restart', async t => {
  const f = await fixture(t);
  let state = await f.state();
  assert.equal(state.tasks.length, 0);
  assert.equal(state.demo, false);
  assert.equal(state.sync.remote, null);
  const initialList = state.lists[0]!.id;
  state = await f.state('POST', '/api/tasks', { title: 'Plan the trip', listId: initialList }, 201);
  const id = state.tasks[0]!.id;
  state = await f.state('POST', '/api/lists', { name: 'Travel' }, 201);
  const travel = state.lists.find(list => list.name === 'Travel')!;
  state = await f.state('PATCH', `/api/tasks/${id}`, {
    baseHeads: task(state, id).heads,
    changes: { title: 'Plan the autumn trip', notes: 'Book a train\nCheck the weather', due: '2026-11-04', priority: 'high', tags: ['travel', 'weekend'], listId: travel.id },
  });
  state = await f.state('PATCH', `/api/tasks/${id}`, { baseHeads: task(state, id).heads, changes: { completed: true } });
  assert.equal(task(state, id).completed, true);
  state = await f.state('PATCH', `/api/tasks/${id}`, { baseHeads: task(state, id).heads, changes: { deleted: true } });
  assert.equal(task(state, id).deleted, true);
  await f.restart();
  state = await f.state();
  assert.equal(task(state, id).deleted, true);
  assert.equal(task(state, id).completed, true);
  state = await f.state('PATCH', `/api/tasks/${id}`, { baseHeads: task(state, id).heads, changes: { completed: false, deleted: false } });
  const saved = task(state, id);
  await f.restart();
  state = await f.state();
  assert.deepEqual(task(state, id), saved);
  assert.equal(saved.title, 'Plan the autumn trip');
  assert.equal(saved.notes, 'Book a train\nCheck the weather');
  assert.equal(saved.due, '2026-11-04');
  assert.equal(saved.priority, 'high');
  assert.deepEqual(saved.tags, ['travel', 'weekend']);
  assert.equal(saved.listId, travel.id);
  assert.equal(saved.deleted, false);
  assert.equal(saved.completed, false);
  assert.equal(state.conflicts.length, 0);
  assert.ok(state.lists.some(list => list.id === travel.id && list.name === 'Travel'));
});

test('invalid edits and malformed requests return JSON without changing saved tasks', async t => {
  const f = await fixture(t);
  let state = await f.state();
  const listId = state.lists[0]!.id;
  await jsonError(await f.request('POST', '/api/tasks', { title: '   ', listId }), 400);
  await jsonError(await f.request('POST', '/api/tasks', { title: 'Wrong list', listId: randomUUID() }), 400);
  state = await f.state('POST', '/api/tasks', { title: 'Preserve me', listId }, 201);
  const saved = state.tasks[0]!;
  for (const changes of [
    { title: '' }, { due: '2026-02-30' }, { priority: 'urgent' },
    { listId: randomUUID() }, { tags: [42] }, { unknown: true },
  ]) {
    await jsonError(await f.request('PATCH', `/api/tasks/${saved.id}`, { baseHeads: saved.heads, changes }), 400);
  }
  await jsonError(await f.request('PATCH', `/api/tasks/${saved.id}`, { baseHeads: [], changes: { title: 'No revision' } }), 400);
  await jsonError(await fetch(`${f.origin()}/api/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: f.origin() }, body: '{' }), 400);
  await jsonError(await fetch(`${f.origin()}/api/tasks`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: f.origin() }, body: '{}' }), 415);
  await jsonError(await f.request('GET', '/api/does-not-exist'), 404);
  assert.deepEqual((await f.state()).tasks, [saved]);
  await f.restart();
  assert.deepEqual((await f.state()).tasks, [saved]);
});

test('the local HTTP API rejects foreign hosts and origins before accepting writes', async t => {
  const f = await fixture(t);
  const listId = (await f.state()).lists[0]!.id;
  const body = { title: 'Untrusted write', listId };
  await jsonError(await f.request('POST', '/api/tasks', body, { Origin: 'https://unrelated.example' }), 403);
  await jsonError(await f.request('POST', '/api/tasks', body, { Origin: 'null' }), 403);
  // Node's fetch controls Host itself; use HTTP directly to exercise DNS-rebinding protection.
  const foreignHost = await new Promise<Response>((resolve, reject) => {
    const request = httpRequest(`${f.origin()}/api/tasks`, {
      method: 'POST',
      headers: { Host: 'unrelated.example', Origin: f.origin(), 'Content-Type': 'application/json' },
    }, response => {
      let payload = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { payload += chunk; });
      response.on('end', () => resolve(new Response(payload, {
        status: response.statusCode,
        headers: { 'Content-Type': response.headers['content-type'] ?? '' },
      })));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end(JSON.stringify(body));
  });
  await jsonError(foreignHost, 403);
  await jsonError(await f.request('POST', '/api/tasks', body, { Origin: 'http://127.0.0.1:1' }), 403);
  assert.equal((await f.state()).tasks.length, 0);
  const accepted = await f.request('POST', '/api/tasks', { title: 'Trusted write', listId }, { Origin: f.origin().replace('127.0.0.1', 'localhost') });
  assert.equal(accepted.status, 201);
  await accepted.arrayBuffer();
  assert.equal((await f.state()).tasks[0]!.title, 'Trusted write');
});

test('sample tasks are opt-in and clearing them preserves a user task', async t => {
  const f = await fixture(t);
  let state = await f.state();
  assert.equal(state.demo, false);
  assert.equal(state.tasks.length, 0);
  state = await f.state('POST', '/api/tasks', { title: 'My own task', listId: state.lists[0]!.id }, 201);
  const ownTask = state.tasks[0]!;
  state = await f.state('POST', '/api/demo', {});
  const sampleIds = state.tasks.filter(item => item.sample && !item.deleted).map(item => item.id).sort();
  assert.ok(sampleIds.length > 0);
  assert.equal(state.demo, true);
  state = await f.state('POST', '/api/demo', {});
  assert.deepEqual(state.tasks.filter(item => item.sample && !item.deleted).map(item => item.id).sort(), sampleIds);
  state = await f.state('DELETE', '/api/demo', {});
  assert.equal(state.demo, false);
  assert.deepEqual(task(state, ownTask.id), ownTask);
  assert.deepEqual(state.tasks.filter(item => !item.deleted), [ownTask]);
  await f.restart();
  state = await f.state();
  assert.equal(state.demo, false);
  assert.deepEqual(state.tasks.filter(item => !item.deleted), [ownTask]);
});

test('invalid remote URLs neither store credentials nor create a Git remote', async t => {
  const f = await fixture(t);
  const { stdout: before } = await run('git', ['remote', '-v'], { cwd: f.dataDir });
  const urls = [
    'https://test-user:test-secret@github.com/owner/repository',
    'https://github.com/owner/repository?token=test-secret',
    'https://unrelated.example/owner/repository',
    '/tmp/unrelated-repository',
  ];
  for (const url of urls) {
    const error = await jsonError(await f.request('PUT', '/api/remote', { url }), 400);
    assert.equal(error.includes('test-secret'), false);
  }
  const { stdout: after } = await run('git', ['remote', '-v'], { cwd: f.dataDir });
  assert.equal(after, before);
  assert.equal((await f.state()).sync.remote, null);
  await f.restart();
  assert.equal((await f.state()).sync.remote, null);
});
