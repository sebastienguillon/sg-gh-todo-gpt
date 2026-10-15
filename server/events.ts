import { DataError } from './validation.js';
import type { Conflict, DataEvent, Task, TaskList } from './model.js';
export interface Projection { tasks: Task[]; lists: TaskList[]; conflicts: Conflict[] }

/** Project an immutable causal graph without recursion or quadratic ancestor caches. */
export function projectEvents(events: DataEvent[]): Projection {
  const byId = new Map(events.map(event => [event.id, event]));
  if (byId.size !== events.length) throw new DataError('Task history contains duplicate event identifiers.');
  const children = new Map<string, string[]>();
  const remaining = new Map<string, number>();
  const ready: DataEvent[] = [];
  for (const event of events) {
    remaining.set(event.id, event.parents.length);
    if (!event.parents.length) ready.push(event);
    for (const parentId of event.parents) {
      const parent = byId.get(parentId);
      if (!parent) throw new DataError('Task history is incomplete. Your existing data has been preserved.');
      if (parent.entity !== event.entity || parent.entityId !== event.entityId) throw new DataError('Task history contains an invalid cross-task revision.');
      const siblings = children.get(parentId) ?? [];
      siblings.push(event.id); children.set(parentId, siblings);
    }
  }
  const sorted: DataEvent[] = [];
  for (let cursor = 0; cursor < ready.length; cursor++) {
    const event = ready[cursor]!;
    sorted.push(event);
    for (const childId of children.get(event.id) ?? []) {
      const count = remaining.get(childId)! - 1;
      remaining.set(childId, count);
      if (!count) ready.push(byId.get(childId)!);
    }
  }
  if (sorted.length !== events.length) throw new DataError('Task history contains an invalid cycle. Your existing data has been preserved.');
  const positions = new Map(sorted.map((event, index) => [event.id, index]));
  const isAncestor = (ancestorId: string, descendant: DataEvent): boolean => {
    const floor = positions.get(ancestorId)!;
    if (floor >= positions.get(descendant.id)!) return false;
    const stack = [...descendant.parents];
    const visited = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (id === ancestorId) return true;
      if (visited.has(id) || positions.get(id)! < floor) continue;
      visited.add(id);
      stack.push(...byId.get(id)!.parents);
    }
    return false;
  };
  const groups = new Map<string, DataEvent[]>();
  for (const event of sorted) {
    const key = `${event.entity}:${event.entityId}`;
    const group = groups.get(key) ?? [];
    group.push(event); groups.set(key, group);
  }
  const result: Projection = { tasks: [], lists: [], conflicts: [] };
  const order = (a: DataEvent, b: DataEvent) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  for (const entityEvents of groups.values()) {
    const fields = new Map<string, DataEvent[]>();
    const heads = new Set<string>();
    for (const event of entityEvents) {
      for (const parent of event.parents) heads.delete(parent);
      heads.add(event.id);
      for (const field of Object.keys(event.changes)) {
        const candidates = fields.get(field) ?? [];
        fields.set(field, [...candidates.filter(candidate => !isAncestor(candidate.id, event)), event]);
      }
    }
    const dated = [...entityEvents].sort(order);
    const first = dated[0]!;
    const values: Record<string, unknown> = {};
    for (const [field, candidates] of fields) {
      const unique = new Map<string, DataEvent>();
      for (const event of candidates.sort(order)) unique.set(JSON.stringify(event.changes[field]), event);
      const winners = [...unique.values()].sort(order);
      values[field] = winners.at(-1)!.changes[field];
      if (winners.length > 1) result.conflicts.push({ id: `${first.entity}:${first.entityId}:${field}`, entity: first.entity, entityId: first.entityId, field, values: winners.map(event => ({ eventId: event.id, value: event.changes[field], createdAt: event.createdAt })) });
    }
    // Deletion competes with concurrent work on any task field. Retain that choice even
    // when later unrelated saves causally include both sides; only a deleted-field write resolves it.
    if (first.entity === 'task') {
      const deletionConflict = result.conflicts.find(conflict => conflict.entityId === first.entityId && conflict.field === 'deleted');
      if (deletionConflict) values.deleted = false;
      else if (values.deleted === true) {
        const deletions = (fields.get('deleted') ?? []).filter(event => event.changes.deleted === true);
        const competing = new Map<string, DataEvent>();
        for (const deletion of deletions) {
          const ancestors = new Set<string>();
          const pending = [...deletion.parents];
          while (pending.length) {
            const id = pending.pop()!;
            if (ancestors.has(id)) continue;
            ancestors.add(id); pending.push(...byId.get(id)!.parents);
          }
          for (const edit of entityEvents) {
            if (edit.id === deletion.id || ancestors.has(edit.id) || isAncestor(deletion.id, edit)) continue;
            if (Object.keys(edit.changes).some(field => !['deleted', 'sample'].includes(field))) competing.set(edit.id, edit);
          }
        }
        if (competing.size) {
          result.conflicts.push({ id: `task:${first.entityId}:deleted`, entity: 'task', entityId: first.entityId, field: 'deleted', values: [
            ...deletions.map(event => ({ eventId: event.id, value: true, createdAt: event.createdAt })),
            ...[...competing.values()].sort(order).slice(-1).map(event => ({ eventId: event.id, value: false, createdAt: event.createdAt })),
          ] });
          values.deleted = false;
        }
      }
    }
    const entity = { ...values, id: first.entityId, heads: [...heads].sort(), createdAt: first.createdAt, updatedAt: dated.at(-1)!.createdAt };
    if (first.entity === 'task') result.tasks.push(entity as unknown as Task);
    else result.lists.push(entity as unknown as TaskList);
  }
  result.tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  result.lists.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return result;
}
