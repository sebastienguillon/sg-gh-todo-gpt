export type Priority = 'none' | 'low' | 'medium' | 'high';

export interface TaskFields {
  title: string;
  notes: string;
  due: string | null;
  priority: Priority;
  tags: string[];
  listId: string;
  completed: boolean;
  deleted: boolean;
  sample?: boolean;
}

export interface Task extends TaskFields {
  id: string;
  heads: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskList {
  id: string;
  name: string;
  heads: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Conflict {
  id: string;
  entity: 'task' | 'list';
  entityId: string;
  field: string;
  values: Array<{ eventId: string; value: unknown; createdAt: string }>;
}

export interface SyncStatus {
  phase: 'local' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict';
  remote: string | null;
  lastSyncedAt: string | null;
  pending: number;
  message: string | null;
}

export interface AppState {
  tasks: Task[];
  lists: TaskList[];
  conflicts: Conflict[];
  sync: SyncStatus;
  demo: boolean;
}

export interface TaskPatch {
  changes: Partial<TaskFields>;
  baseHeads: string[];
}
