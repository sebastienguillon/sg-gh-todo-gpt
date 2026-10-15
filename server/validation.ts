import type { DataEvent } from './model.js';
export class DataError extends Error {}
export class InputError extends DataError { readonly status = 400; }
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Expected a JSON object.');
  return value as Record<string, unknown>;
}
export function textField(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || value.includes('\0')) throw new InputError(`${label} must ${required ? 'contain text and ' : ''}be ${max.toLocaleString('en')} characters or fewer.`);
  return required ? value.trim() : value;
}
export function validateChanges(value: unknown, entity: 'task' | 'list'): Record<string, unknown> {
  const changes = object(value);
  const allowed = entity === 'task' ? ['title', 'notes', 'due', 'priority', 'tags', 'listId', 'completed', 'deleted', 'sample'] : ['name'];
  if (!Object.keys(changes).length || Object.keys(changes).some(key => !allowed.includes(key))) throw new InputError('The edit contains unsupported fields.');
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(changes)) {
    switch (key) {
      case 'title': output[key] = textField(item, 'Title', 500, true); break;
      case 'notes': output[key] = textField(item, 'Notes', 20000); break;
      case 'name': output[key] = textField(item, 'List name', 80, true); break;
      case 'due': {
        if (item !== null && (typeof item !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item) || Number.isNaN(Date.parse(`${item}T00:00:00Z`)) || new Date(`${item}T00:00:00Z`).toISOString().slice(0, 10) !== item)) throw new InputError('Choose a valid calendar due date.');
        output[key] = item; break;
      }
      case 'priority': if (!['none', 'low', 'medium', 'high'].includes(item as string)) throw new InputError('Choose a supported priority.'); output[key] = item; break;
      case 'tags': if (!Array.isArray(item) || item.length > 20) throw new InputError('A task can have up to 20 tags.'); output[key] = [...new Set(item.map(tag => textField(tag, 'Tag', 40, true)))]; break;
      case 'listId': if (!isUuid(item)) throw new InputError('Choose a valid list.'); output[key] = item; break;
      default: if (typeof item !== 'boolean') throw new InputError(`${key} must be true or false.`); output[key] = item;
    }
  }
  return output;
}
export function validateHeads(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 128 || !value.every(isUuid)) throw new InputError('The task revision is missing or invalid. Reload the task and try again.');
  return [...new Set(value)];
}
export function validateRemote(value: unknown): string {
  if (typeof value !== 'string') throw new InputError('Enter a GitHub repository URL.');
  const url = value.trim();
  if (!/^(?:https:\/\/github\.com\/|git@github\.com:)[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(url) || url.length > 300 || /\/(?:\.|\.\.)$/.test(url)) throw new InputError('Use https://github.com/owner/repository or git@github.com:owner/repository, without credentials.');
  return url;
}
export function validateEvent(value: unknown): DataEvent {
  const event = object(value);
  if (event.version !== 1 || !isUuid(event.id) || !isUuid(event.entityId) || (event.entity !== 'task' && event.entity !== 'list') || typeof event.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(event.createdAt) || Number.isNaN(Date.parse(event.createdAt))) throw new InputError('The data repository contains an invalid task history file.');
  return { version: 1, id: event.id, entity: event.entity, entityId: event.entityId, createdAt: event.createdAt, parents: validateHeads(event.parents), changes: validateChanges(event.changes, event.entity) };
}
