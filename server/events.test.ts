import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { projectEvents } from './events.js';
import { BOOTSTRAP_EVENT, PERSONAL_LIST_ID, taskDefaults, type DataEvent } from './model.js';
const taskId = randomUUID();
function event(changes: Record<string, unknown>, parents: string[] = [], id = randomUUID()): DataEvent {
  return { version: 1, id, entity: 'task', entityId: taskId, parents, changes, createdAt: new Date().toISOString() };
}
test('causal writes compose fields; concurrent values are retained until resolution', () => {
  const creation = event({ ...taskDefaults('Original', PERSONAL_LIST_ID) });
  const a = event({ title: 'Laptop title', notes: 'Laptop notes' }, [creation.id]);
  const b = event({ title: 'Desktop title', completed: true }, [creation.id]);
  const projected = projectEvents([b, BOOTSTRAP_EVENT, creation, a]);
  assert.equal(projected.tasks[0]!.notes, 'Laptop notes');
  assert.equal(projected.tasks[0]!.completed, true);
  assert.equal(projected.conflicts.length, 1);
  assert.equal(projected.conflicts[0]!.field, 'title');
  assert.deepEqual(new Set(projected.conflicts[0]!.values.map(item => item.value)), new Set(['Laptop title', 'Desktop title']));
  const resolution = event({ title: 'Chosen title' }, [a.id, b.id]);
  const resolved = projectEvents([creation, a, b, resolution, BOOTSTRAP_EVENT]);
  assert.equal(resolved.conflicts.length, 0);
  assert.equal(resolved.tasks[0]!.title, 'Chosen title');
  assert.equal(resolved.tasks[0]!.notes, 'Laptop notes');
});
test('same-value concurrent edits do not require a choice', () => {
  const creation = event({ ...taskDefaults('Original', PERSONAL_LIST_ID) });
  const a = event({ completed: true }, [creation.id]);
  const b = event({ completed: true }, [creation.id]);
  assert.equal(projectEvents([creation, a, b, BOOTSTRAP_EVENT]).conflicts.length, 0);
});
test('a long app-generated causal history does not recurse or stop after 512 edits', () => {
  const events = [BOOTSTRAP_EVENT, event({ ...taskDefaults('Original', PERSONAL_LIST_ID) })];
  for (let i = 1; i <= 1200; i++) events.push(event({ notes: `Edit ${i}` }, [events.at(-1)!.id]));
  const projected = projectEvents([...events].reverse());
  assert.equal(projected.tasks[0]!.notes, 'Edit 1200');
  assert.equal(projected.tasks[0]!.heads.length, 1);
  assert.equal(projected.conflicts.length, 0);
});
test('invalid cyclic, missing, or cross-task parents fail safely', () => {
  const a = event({ title: 'A' });
  const b = event({ title: 'B' }, [a.id]);
  a.parents = [b.id];
  assert.throws(() => projectEvents([a, b]), /cycle/);
  assert.throws(() => projectEvents([event({ title: 'A' }, [randomUUID()])]), /incomplete/);
  assert.throws(() => projectEvents([BOOTSTRAP_EVENT, event({ title: 'A' }, [BOOTSTRAP_EVENT.id])]), /cross-task/);
});
test('concurrent deletion and edits remain visible until an explicit deletion choice', () => {
  const creation = event({ ...taskDefaults('Original', PERSONAL_LIST_ID) });
  const deletion = event({ deleted: true }, [creation.id]);
  const edit = event({ notes: 'Work from the other machine' }, [creation.id]);
  const graph = [creation, deletion, edit, BOOTSTRAP_EVENT];
  const projected = projectEvents(graph);
  assert.equal(projected.tasks[0]!.deleted, false);
  assert.equal(projected.conflicts[0]!.field, 'deleted');
  assert.deepEqual(new Set(projected.conflicts[0]!.values.map(value => value.value)), new Set([false, true]));
  const laterNote = event({ notes: 'An unrelated follow-up' }, projected.tasks[0]!.heads);
  const stillConflicted = projectEvents([...graph, laterNote]);
  assert.equal(stillConflicted.tasks[0]!.deleted, false);
  assert.equal(stillConflicted.conflicts.length, 1);
  const choice = event({ deleted: true }, stillConflicted.tasks[0]!.heads);
  const resolved = projectEvents([...graph, laterNote, choice]);
  assert.equal(resolved.tasks[0]!.deleted, true);
  assert.equal(resolved.conflicts.length, 0);
  assert.equal(resolved.tasks[0]!.notes, 'An unrelated follow-up');
});
