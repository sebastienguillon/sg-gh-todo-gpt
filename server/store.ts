import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BOOTSTRAP_EVENT, FORMAT, FORMAT_FILE, PERSONAL_LIST_ID, taskDefaults, type AppState, type DataEvent, type TaskFields, type SyncStatus } from './model.js';
import { projectEvents, type Projection } from './events.js';
import { git, GitError, safeGitFailure } from './git.js';
import { DataError, InputError, isUuid, textField, validateChanges, validateEvent, validateHeads, validateRemote } from './validation.js';

export interface StoreOptions { dataDir: string; autoSync?: boolean; remoteValidator?: (value: unknown) => string }
export class DataStore {
  readonly dataDir: string;
  private events: DataEvent[] = [];
  private projection: Projection = { tasks: [], lists: [], conflicts: [] };
  private queue: Promise<unknown> = Promise.resolve();
  private syncing: Promise<void> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private readonly networkAbort = new AbortController();
  private readonly remoteValidator: (value: unknown) => string;
  private status: SyncStatus = { phase: 'local', remote: null, lastSyncedAt: null, pending: 0, message: null };
  private constructor(options: StoreOptions) { this.dataDir = resolve(options.dataDir); this.remoteValidator = options.remoteValidator ?? validateRemote; }
  static async open(options: StoreOptions): Promise<DataStore> {
    const store = new DataStore(options);
    await store.initialize();
    if (options.autoSync !== false) {
      store.interval = setInterval(() => { void store.syncNow(); }, 30000);
      store.interval.unref();
      if (store.status.remote) void store.syncNow();
    }
    return store;
  }
  private async initialize(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const entries = await readdir(this.dataDir);
    const hasGit = entries.includes('.git');
    if (!hasGit && entries.some(name => name !== '.DS_Store')) throw new DataError('The data directory is not empty. Choose an empty directory or an existing GH to-do data repository.');
    if (!hasGit) await git(this.dataDir, ['init', '-b', 'main']);
    const root = await git(this.dataDir, ['rev-parse', '--show-toplevel']);
    if (await realpath(root) !== await realpath(this.dataDir)) throw new DataError('The data directory must have its own Git repository.');
    const marker = await readFile(join(this.dataDir, FORMAT_FILE), 'utf8').catch(() => null);
    if (marker === null) {
      if ((await readdir(this.dataDir)).some(name => !['.git', '.DS_Store'].includes(name))) throw new DataError('This repository contains unrelated files. Use a separate repository for task data.');
      await writeFile(join(this.dataDir, FORMAT_FILE), `${JSON.stringify(FORMAT, null, 2)}\n`, { mode: 0o600 });
    } else this.checkMarker(marker);
    for (const [key, fallback] of [['user.name', 'GH to-do'], ['user.email', 'gh-todo@localhost']] as const) {
      const current = await git(this.dataDir, ['config', key]).catch(() => '');
      if (!current) await git(this.dataDir, ['config', '--local', key, fallback]);
    }
    await this.reload();
    if (!this.events.length) {
      await this.persistEvent(BOOTSTRAP_EVENT);
    }
    await this.commitChanges('Initialize task data');
    const remote = await git(this.dataDir, ['remote', 'get-url', 'origin']).catch(() => '');
    if (remote) {
      try { this.status.remote = this.remoteValidator(remote); }
      catch { this.status.phase = 'error'; this.status.message = 'The stored remote is unsupported. Choose a GitHub repository URL without embedded credentials.'; }
    }
    this.status.pending = await this.countPending();
    try {
      const settings = JSON.parse(await readFile(join(this.dataDir, '.git', 'gh-todo-settings.json'), 'utf8')) as { lastSyncedAt?: unknown };
      if (typeof settings.lastSyncedAt === 'string' && !Number.isNaN(Date.parse(settings.lastSyncedAt))) this.status.lastSyncedAt = settings.lastSyncedAt;
    } catch { /* First run has no device-local sync metadata. */ }
  }
  private checkMarker(content: string): void {
    let marker: unknown;
    try { marker = JSON.parse(content); } catch { throw new DataError('The repository is not a compatible GH to-do data repository.'); }
    if (JSON.stringify(marker) !== JSON.stringify(FORMAT)) throw new DataError('The repository is not a compatible GH to-do data repository.');
  }
  private lock<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
  state(): AppState {
    return structuredClone({ ...this.projection, sync: this.status, demo: this.projection.tasks.some(task => task.sample && !task.deleted) });
  }
  private async reload(): Promise<void> {
    const events: DataEvent[] = [];
    const root = join(this.dataDir, 'events');
    const months = await readdir(root, { withFileTypes: true }).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; });
    for (const month of months) {
      if (!month.isDirectory() || !/^\d{4}-\d{2}$/.test(month.name)) throw new DataError('The task repository contains an unsupported history path.');
      for (const file of await readdir(join(root, month.name), { withFileTypes: true })) {
        if (!file.isFile() || !/^[0-9a-f-]{36}\.json$/i.test(file.name)) throw new DataError('The task repository contains an unsupported history file.');
        const path = join(root, month.name, file.name);
        if ((await stat(path)).size > 200000) throw new DataError('A task history file exceeds the supported size.');
        const event = validateEvent(JSON.parse(await readFile(path, 'utf8')));
        if (file.name !== `${event.id}.json` || month.name !== event.createdAt.slice(0, 7)) throw new DataError('A task history filename does not match its contents.');
        events.push(event);
        if (events.length > 100000) throw new DataError('This repository exceeds the supported task history size.');
      }
    }
    if (new Set(events.map(event => event.id)).size !== events.length) throw new DataError('Task history contains duplicate event identifiers.');
    const byId = new Map(events.map(event => [event.id, event]));
    for (const event of events) for (const parentId of event.parents) {
      const parent = byId.get(parentId);
      if (parent && (parent.entity !== event.entity || parent.entityId !== event.entityId)) throw new DataError('Task history contains an invalid cross-task revision.');
    }
    const projection = projectEvents(events);
    for (const list of projection.lists) if (typeof list.name !== 'string' || !list.name.trim()) throw new DataError('Task history is missing a required list name.');
    for (const task of projection.tasks) {
      if (typeof task.title !== 'string' || typeof task.notes !== 'string' || typeof task.listId !== 'string' || !Array.isArray(task.tags) || typeof task.completed !== 'boolean' || typeof task.deleted !== 'boolean' || !['none', 'low', 'medium', 'high'].includes(task.priority) || !(task.due === null || typeof task.due === 'string')) throw new DataError('Task history is missing required task fields.');
      if (!projection.lists.some(list => list.id === task.listId)) throw new DataError('A task references a missing list.');
    }
    this.events = events;
    this.projection = projection;
  }
  private async persistEvent(event: DataEvent): Promise<void> {
    const dir = join(this.dataDir, 'events', event.createdAt.slice(0, 7));
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${event.id}.json`);
    const temporary = join(this.dataDir, '.git', `gh-todo-${event.id}.tmp`);
    await writeFile(temporary, `${JSON.stringify(event, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, path);
    this.events.push(event);
    this.projection = projectEvents(this.events);
  }
  private async commitChanges(message: string): Promise<void> {
    await git(this.dataDir, ['add', '--', FORMAT_FILE, 'events']);
    const changed = await git(this.dataDir, ['diff', '--cached', '--name-only']);
    if (changed) await git(this.dataDir, ['commit', '--quiet', '-m', message]);
  }
  private async countPending(): Promise<number> {
    const hasRemoteHead = await git(this.dataDir, ['rev-parse', '--verify', 'refs/remotes/origin/main']).then(() => true, () => false);
    const count = await git(this.dataDir, ['rev-list', '--count', hasRemoteHead ? 'refs/remotes/origin/main..HEAD' : 'HEAD']).catch(() => '0');
    return Math.max(0, Number.parseInt(count, 10) || 0);
  }
  private newEvent(entity: DataEvent['entity'], entityId: string, changes: Record<string, unknown>, parents: string[]): DataEvent {
    return { version: 1, id: randomUUID(), entity, entityId, parents, changes, createdAt: new Date().toISOString() };
  }
  private async append(event: DataEvent): Promise<void> {
    await this.persistEvent(event);
    try {
      await this.commitChanges(event.entity === 'task' ? 'Update task' : 'Update list');
      this.status.pending = await this.countPending();
      if (this.status.phase !== 'syncing' && !['offline', 'error'].includes(this.status.phase)) { this.status.phase = this.projection.conflicts.length ? 'conflict' : 'local'; this.status.message = null; }
    } catch {
      this.status.phase = 'error';
      this.status.message = 'Your edit is saved on this machine, but Git could not commit it. Check write access to the data directory and retry sync.';
      throw new DataError(this.status.message);
    }
  }
  async addTask(input: { id?: unknown; title: unknown; listId: unknown }): Promise<AppState> {
    return this.lock(async () => {
      const title = textField(input.title, 'Title', 500, true);
      if (!isUuid(input.listId) || !this.projection.lists.some(list => list.id === input.listId)) throw new InputError('Choose an existing list.');
      if (input.id !== undefined && !isUuid(input.id)) throw new InputError('The task identifier is invalid.');
      const id = input.id ?? randomUUID();
      if (this.projection.tasks.some(task => task.id === id)) throw new InputError('That task already exists.');
      await this.append(this.newEvent('task', id, { ...taskDefaults(title, input.listId) }, []));
      return this.state();
    });
  }
  async patchTask(id: string, changesValue: unknown, headsValue: unknown): Promise<AppState> {
    return this.patchEntity('task', id, changesValue, headsValue);
  }
  async addList(input: { id?: unknown; name: unknown }): Promise<AppState> {
    return this.lock(async () => {
      const name = textField(input.name, 'List name', 80, true);
      if (input.id !== undefined && !isUuid(input.id)) throw new InputError('The list identifier is invalid.');
      const id = input.id ?? randomUUID();
      if (this.projection.lists.some(list => list.id === id)) throw new InputError('That list already exists.');
      await this.append(this.newEvent('list', id, { name }, []));
      return this.state();
    });
  }
  async patchList(id: string, changes: unknown, heads: unknown): Promise<AppState> { return this.patchEntity('list', id, changes, heads); }
  private async patchEntity(entity: 'task' | 'list', id: string, changesValue: unknown, headsValue: unknown): Promise<AppState> {
    return this.lock(async () => {
      const existing = (entity === 'task' ? this.projection.tasks : this.projection.lists).find(item => item.id === id);
      if (!existing) throw new InputError(entity === 'task' ? 'This task is no longer available.' : 'This list is no longer available.');
      const changes = validateChanges(changesValue, entity);
      if (changes.listId && !this.projection.lists.some(list => list.id === changes.listId)) throw new InputError('Choose an existing list.');
      const heads = validateHeads(headsValue);
      if (!heads.length || !heads.every(head => this.events.some(event => event.id === head && event.entity === entity && event.entityId === id))) throw new InputError('The task revision is no longer available. Reload the task and try again.');
      await this.append(this.newEvent(entity, id, changes, heads));
      return this.state();
    });
  }
  async resolveConflict(id: string, value: unknown): Promise<AppState> {
    return this.lock(async () => {
      const conflict = this.projection.conflicts.find(item => item.id === id);
      if (!conflict) throw new InputError('This conflict has already been resolved.');
      const entity = (conflict.entity === 'task' ? this.projection.tasks : this.projection.lists).find(item => item.id === conflict.entityId)!;
      const changes = validateChanges({ [conflict.field]: value }, conflict.entity);
      if (changes.listId && !this.projection.lists.some(list => list.id === changes.listId)) throw new InputError('Choose an existing list.');
      await this.append(this.newEvent(conflict.entity, entity.id, changes, entity.heads));
      return this.state();
    });
  }
  async addDemo(): Promise<AppState> {
    return this.lock(async () => {
      if (this.projection.tasks.some(task => task.sample && !task.deleted)) return this.state();
      const listByName = new Map(this.projection.lists.map(list => [list.name, list.id]));
      for (const name of ['Personal', 'Home', 'GitHub to-do']) if (!listByName.has(name)) {
        const id = randomUUID();
        await this.append(this.newEvent('list', id, { name }, []));
        listByName.set(name, id);
      }
      const dateAfter = (days: number) => {
        const date = new Date(); date.setDate(date.getDate() + days);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      };
      const sampleTasks: Array<[string, string, Partial<TaskFields>]> = [
        ['Review sync conflict behavior', 'GitHub to-do', { priority: 'high', due: dateAfter(0), tags: ['sync'], notes: 'Try changing the same task on two machines.' }],
        ['Draft main task screen', 'GitHub to-do', { priority: 'medium', due: dateAfter(1), tags: ['design'] }],
        ['Check GitHub repository access', 'GitHub to-do', { priority: 'medium', due: dateAfter(1), tags: ['setup'] }],
        ['Compare task data formats', 'GitHub to-do', { priority: 'low', due: dateAfter(4), tags: ['research'] }],
        ['Write installation notes', 'GitHub to-do', { priority: 'low', tags: ['docs'] }],
        ['Create project directory', 'GitHub to-do', { completed: true, tags: ['setup'] }],
      ];
      for (const [title, listName, fields] of sampleTasks) await this.append(this.newEvent('task', randomUUID(), { ...taskDefaults(title, listByName.get(listName)!), ...fields, sample: true }, []));
      return this.state();
    });
  }
  async removeDemo(): Promise<AppState> {
    return this.lock(async () => {
      for (const task of this.projection.tasks.filter(task => task.sample && !task.deleted)) await this.append(this.newEvent('task', task.id, { deleted: true }, task.heads));
      return this.state();
    });
  }
  async setRemote(value: unknown): Promise<AppState> {
    const remote = this.remoteValidator(value);
    if (this.syncing) await this.syncing;
    return this.lock(async () => {
      if (this.status.remote) await git(this.dataDir, ['remote', 'set-url', 'origin', remote]);
      else {
        const exists = await git(this.dataDir, ['remote']).then(output => output.split('\n').includes('origin'));
        await git(this.dataDir, ['remote', exists ? 'set-url' : 'add', 'origin', remote]);
      }
      await git(this.dataDir, ['update-ref', '-d', 'refs/remotes/origin/main']);
      this.status = { ...this.status, remote, phase: 'local', lastSyncedAt: null, message: null, pending: await this.countPending() };
      return this.state();
    });
  }
  syncNow(): Promise<void> {
    if (this.closed || !this.status.remote) return Promise.resolve();
    if (this.syncing) return this.syncing;
    this.syncing = this.runSync().finally(() => { this.syncing = null; });
    return this.syncing;
  }
  private async checkRemoteData(): Promise<void> {
    const marker = await git(this.dataDir, ['show', `refs/remotes/origin/main:${FORMAT_FILE}`]).catch(() => { throw new DataError('This GitHub repository contains unrelated content. Use an empty repository or an existing GH to-do data repository.'); });
    this.checkMarker(marker);
    const files = (await git(this.dataDir, ['ls-tree', '-r', '--name-only', 'refs/remotes/origin/main'])).split('\n').filter(Boolean);
    if (files.some(file => file !== FORMAT_FILE && !/^events\/\d{4}-\d{2}\/[0-9a-f-]{36}\.json$/i.test(file))) throw new DataError('This GitHub repository contains unrelated files. Use a dedicated GH to-do data repository.');
  }
  private async runSync(): Promise<void> {
    this.status.phase = 'syncing'; this.status.message = null;
    try {
      await this.lock(() => this.commitChanges('Save pending task changes'));
      for (let attempt = 0; attempt < 3; attempt++) {
        const heads = await git(this.dataDir, ['ls-remote', '--heads', 'origin'], true, this.networkAbort.signal);
        const branches = heads.split('\n').filter(Boolean);
        const hasMain = branches.some(line => line.endsWith('\trefs/heads/main'));
        if (branches.length && !hasMain) throw new DataError('The remote repository has no main branch. Use an empty repository or a compatible GH to-do data repository on main.');
        if (hasMain) {
          await git(this.dataDir, ['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main'], true, this.networkAbort.signal);
          await this.checkRemoteData();
          await this.lock(async () => {
            const before = await git(this.dataDir, ['rev-parse', 'HEAD']);
            try {
              await git(this.dataDir, ['merge', '--no-edit', '--allow-unrelated-histories', 'refs/remotes/origin/main']);
              await this.reload();
            } catch (error) {
              await git(this.dataDir, ['merge', '--abort']).catch(() => undefined);
              const after = await git(this.dataDir, ['rev-parse', 'HEAD']);
              // A successful merge of invalid remote data is rolled back only to our own pre-merge commit.
              if (after !== before) await git(this.dataDir, ['reset', '--hard', before]);
              await this.reload();
              if (error instanceof GitError) throw new DataError('The task history could not merge safely. Your local edits were preserved; review the data repository before retrying.');
              throw error;
            }
          });
        }
        try {
          await git(this.dataDir, ['push', 'origin', 'HEAD:refs/heads/main'], true, this.networkAbort.signal);
          await this.lock(async () => {
            this.status.pending = await this.countPending();
            this.status.lastSyncedAt = new Date().toISOString();
            this.status.phase = this.projection.conflicts.length ? 'conflict' : this.status.pending ? 'local' : 'synced';
            this.status.message = this.projection.conflicts.length ? 'Some edits need your choice. Both versions are preserved.' : null;
            await writeFile(join(this.dataDir, '.git', 'gh-todo-settings.json'), JSON.stringify({ lastSyncedAt: this.status.lastSyncedAt }), { mode: 0o600 });
          });
          return;
        } catch (error) {
          if (attempt < 2 && error instanceof GitError && /non-fast-forward|fetch first|rejected/i.test(error.detail)) continue;
          throw error;
        }
      }
    } catch (error) {
      const failure = safeGitFailure(error);
      this.status.phase = failure.phase; this.status.message = failure.message;
      this.status.pending = await this.countPending();
    }
  }
  async close(): Promise<void> {
    this.closed = true;
    this.networkAbort.abort();
    if (this.interval) clearInterval(this.interval);
    await this.syncing;
    await this.queue;
  }
}
