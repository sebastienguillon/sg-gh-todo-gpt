import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataStore } from './store.js';
import { git } from './git.js';
import { PERSONAL_LIST_ID } from './model.js';
const localRemote = (value: unknown): string => { if (typeof value !== 'string' || !value.startsWith('/')) throw new Error('Invalid test remote.'); return value; };

test('offline local writes survive restart, and stale bases retain both values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gh-todo-local-'));
  let store: DataStore | undefined;
  try {
    store = await DataStore.open({ dataDir: directory, autoSync: false });
    assert.equal(store.state().tasks.length, 0);
    await store.addTask({ title: 'Persist me', listId: PERSONAL_LIST_ID });
    const task = store.state().tasks[0]!;
    await store.patchTask(task.id, { notes: 'A note' }, task.heads);
    await store.patchTask(task.id, { title: 'New name' }, task.heads);
    assert.equal(store.state().conflicts.length, 0);
    await store.patchTask(task.id, { title: 'Concurrent name' }, task.heads);
    assert.equal(store.state().conflicts.length, 1);
    await store.close();
    store = await DataStore.open({ dataDir: directory, autoSync: false });
    assert.equal(store.state().tasks[0]!.notes, 'A note');
    assert.equal(store.state().conflicts.length, 1);
    await store.resolveConflict(store.state().conflicts[0]!.id, 'Kept name');
    assert.equal(store.state().tasks[0]!.title, 'Kept name');
    assert.equal(store.state().conflicts.length, 0);
    const wrongHeads = store.state().lists[0]!.heads;
    await assert.rejects(store.patchTask(task.id, { title: 'Bad parent' }, wrongHeads), /revision/);
  } finally { await store?.close(); await rm(directory, { recursive: true, force: true }); }
});

test('two local devices synchronize via a bare remote, merge fields and preserve conflicts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gh-todo-sync-'));
  const remote = join(root, 'remote.git');
  let a: DataStore | undefined; let b: DataStore | undefined;
  try {
    await mkdir(remote); await git(remote, ['init', '--bare', '-b', 'main']);
    a = await DataStore.open({ dataDir: join(root, 'a'), autoSync: false, remoteValidator: localRemote });
    b = await DataStore.open({ dataDir: join(root, 'b'), autoSync: false, remoteValidator: localRemote });
    await a.setRemote(remote); await b.setRemote(remote);
    await a.addTask({ title: 'Shared task', listId: PERSONAL_LIST_ID });
    await a.syncNow(); assert.equal(a.state().sync.phase, 'synced');
    await b.syncNow(); assert.equal(b.state().sync.phase, 'synced');
    const taskA = a.state().tasks[0]!; const taskB = b.state().tasks[0]!;
    await a.patchTask(taskA.id, { notes: 'Laptop notes' }, taskA.heads);
    await b.patchTask(taskB.id, { completed: true }, taskB.heads);
    await a.syncNow(); await b.syncNow(); await a.syncNow();
    assert.equal(a.state().conflicts.length, 0);
    assert.equal(a.state().tasks[0]!.notes, 'Laptop notes');
    assert.equal(a.state().tasks[0]!.completed, true);
    await a.patchTask(taskA.id, { title: 'Laptop name' }, a.state().tasks[0]!.heads);
    await b.patchTask(taskA.id, { title: 'Desktop name' }, b.state().tasks[0]!.heads);
    await a.syncNow(); await b.syncNow(); await a.syncNow();
    assert.equal(a.state().sync.phase, 'conflict');
    assert.equal(a.state().conflicts.length, 1);
    assert.deepEqual(new Set(a.state().conflicts[0]!.values.map(item => item.value)), new Set(['Laptop name', 'Desktop name']));
    await a.resolveConflict(a.state().conflicts[0]!.id, 'Chosen name');
    await a.syncNow(); await b.syncNow();
    assert.equal(b.state().tasks[0]!.title, 'Chosen name');
    assert.equal(b.state().conflicts.length, 0);
    await rm(remote, { recursive: true, force: true });
    await a.patchTask(taskA.id, { notes: 'Saved while remote unavailable' }, a.state().tasks[0]!.heads);
    await a.syncNow();
    assert.notEqual(a.state().sync.phase, 'synced');
    assert.equal(a.state().tasks[0]!.notes, 'Saved while remote unavailable');
    await a.close();
    a = await DataStore.open({ dataDir: join(root, 'a'), autoSync: false, remoteValidator: localRemote });
    assert.equal(a.state().tasks[0]!.notes, 'Saved while remote unavailable');
  } finally { await a?.close(); await b?.close(); await rm(root, { recursive: true, force: true }); }
});

test('an unrelated remote is rejected before merge or push', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gh-todo-unrelated-'));
  let store: DataStore | undefined;
  try {
    const remote = join(root, 'unrelated'); await mkdir(remote);
    await git(remote, ['init', '-b', 'main']);
    await git(remote, ['config', '--local', 'user.name', 'Test']); await git(remote, ['config', '--local', 'user.email', 'test@localhost']);
    await writeFile(join(remote, 'README.md'), 'Other project\n'); await git(remote, ['add', '.']); await git(remote, ['commit', '-m', 'Other project']);
    const before = await git(remote, ['rev-parse', 'HEAD']);
    store = await DataStore.open({ dataDir: join(root, 'data'), autoSync: false, remoteValidator: localRemote });
    await store.addTask({ title: 'My task', listId: PERSONAL_LIST_ID });
    await store.setRemote(remote); await store.syncNow();
    assert.equal(store.state().sync.phase, 'error');
    assert.match(store.state().sync.message!, /unrelated/);
    assert.equal(store.state().tasks.length, 1);
    assert.equal(await git(remote, ['rev-parse', 'HEAD']), before);
    assert.equal(await git(store.dataDir, ['ls-files', 'README.md']), '');
  } finally { await store?.close(); await rm(root, { recursive: true, force: true }); }
});

test('malformed compatible remote history rolls back safely without exposing raw content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gh-todo-invalid-history-'));
  let a: DataStore | undefined;
  try {
    const remote = join(root, 'remote.git'); await mkdir(remote); await git(remote, ['init', '--bare', '-b', 'main']);
    a = await DataStore.open({ dataDir: join(root, 'a'), autoSync: false, remoteValidator: localRemote });
    await a.addTask({ title: 'Preserve my local work', listId: PERSONAL_LIST_ID });
    await a.setRemote(remote); await a.syncNow();
    const before = await git(a.dataDir, ['rev-parse', 'HEAD']);
    const other = join(root, 'other'); await git(root, ['clone', remote, other]);
    await git(other, ['config', '--local', 'user.name', 'Test']); await git(other, ['config', '--local', 'user.email', 'test@localhost']);
    const month = '2026-01'; await mkdir(join(other, 'events', month), { recursive: true });
    await writeFile(join(other, 'events', month, '11111111-1111-4111-8111-111111111111.json'), 'https://secret-token@github.com/private/repo');
    await git(other, ['add', '.']); await git(other, ['commit', '-m', 'Invalid remote data']); await git(other, ['push', 'origin', 'main']);
    await a.syncNow();
    assert.equal(a.state().sync.phase, 'error');
    assert.doesNotMatch(a.state().sync.message!, /secret-token|private\/repo|var\/folders/);
    assert.equal(a.state().tasks[0]!.title, 'Preserve my local work');
    assert.equal(await git(a.dataDir, ['rev-parse', 'HEAD']), before);
    assert.equal(await git(a.dataDir, ['status', '--porcelain']), '');
  } finally { await a?.close(); await rm(root, { recursive: true, force: true }); }
});
