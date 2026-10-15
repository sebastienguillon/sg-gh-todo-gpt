import type { TaskFields } from '../shared/types.js';
export type { Priority, TaskFields, Task, TaskList, Conflict, SyncStatus, AppState } from '../shared/types.js';
export interface DataEvent { version: 1; id: string; entity: 'task' | 'list'; entityId: string; parents: string[]; changes: Record<string, unknown>; createdAt: string }
export const PERSONAL_LIST_ID = '00000000-0000-4000-8000-000000000001';
export const BOOTSTRAP_EVENT: DataEvent = { version: 1, id: '00000000-0000-4000-8000-000000000000', entity: 'list', entityId: PERSONAL_LIST_ID, parents: [], changes: { name: 'Personal' }, createdAt: '2026-01-01T00:00:00.000Z' };
export const FORMAT_FILE = '.gh-todo-format.json';
export const FORMAT = { app: 'gh-todo', version: 1 };
export function taskDefaults(title: string, listId: string): TaskFields { return { title, listId, notes: '', due: null, priority: 'none', tags: [], completed: false, deleted: false }; }
