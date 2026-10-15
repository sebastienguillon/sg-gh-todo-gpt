import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, CheckCheck, ChevronDown, ChevronRight, CircleAlert, Cloud, CloudOff, Folder, GitBranch, LoaderCircle, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import type { AppState, Conflict, Task, TaskFields } from '../shared/types';
import './styles.css';

type Draft = { task: Task; base: Task; version: number };
type Undo = { label: string; taskId: string; changes: Partial<TaskFields>; baseHeads: string[] };
const fields: Array<keyof TaskFields> = ['title', 'notes', 'due', 'priority', 'tags', 'listId', 'completed', 'deleted', 'sample'];
const recoveryKey = 'gh-todo:unsaved-draft:v1';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function difference(task: Task, base: Task): Partial<TaskFields> {
  return Object.fromEntries(fields.filter((field) => !same(task[field], base[field])).map((field) => [field, task[field]]));
}
const isDirty = (draft: Draft | null) => !!draft && Object.keys(difference(draft.task, draft.base)).length > 0;
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
async function request(path: string, method = 'GET', data?: unknown): Promise<AppState> {
  const writing = method !== 'GET' && method !== 'HEAD';
  const response = await fetch(path, { method, headers: writing || data !== undefined ? { 'Content-Type': 'application/json' } : undefined, body: data === undefined ? (writing ? '{}' : undefined) : JSON.stringify(data) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || `The local service returned ${response.status}. Try again.`);
  return result as AppState;
}
function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function dueLabel(value: string | null) {
  if (!value) return 'No date';
  if (value === localDate()) return 'Today';
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  if (value === localDate(tomorrow)) return 'Tomorrow';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', ...(year !== new Date().getFullYear() ? { year: 'numeric' } : {}) }).format(new Date(year, month - 1, day));
}
function syncLabel(state: AppState) {
  if (state.conflicts.length) return `Review ${state.conflicts.length} ${state.conflicts.length === 1 ? 'conflict' : 'conflicts'}`;
  switch (state.sync.phase) {
    case 'syncing': return 'Syncing with GitHub';
    case 'synced': return state.sync.pending ? 'Saved here · Sync pending' : 'Synced with GitHub';
    case 'offline': return 'Saved here · GitHub unavailable';
    case 'error': return 'Saved here · Sync needs attention';
    case 'conflict': return 'Review sync conflicts';
    default: return state.sync.remote ? 'Saved here · Sync pending' : 'Saved on this machine';
  }
}
function displayValue(value: unknown, state: AppState, field: string): string {
  if (field === 'listId') return state.lists.find((list) => list.id === value)?.name || String(value);
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'No tags';
  if (value === null || value === '') return field === 'due' ? 'No due date' : 'Empty';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function ConflictItem({ conflict, state, busy, resolve }: { conflict: Conflict; state: AppState; busy: boolean; resolve: (conflict: Conflict, value: unknown) => void }) {
  const [combined, setCombined] = useState('');
  const [composing, setComposing] = useState(false);
  const task = state.tasks.find((item) => item.id === conflict.entityId);
  const list = state.lists.find((item) => item.id === conflict.entityId);
  const textField = ['title', 'notes', 'name'].includes(conflict.field);
  return <section className="conflict-item">
    <h4>{conflict.entity === 'task' ? task?.title || 'Task' : list?.name || 'List'}</h4>
    <p className="conflict-field">{conflict.field === 'listId' ? 'List' : conflict.field.charAt(0).toUpperCase() + conflict.field.slice(1)} has different versions</p>
    <div className="conflict-versions">{conflict.values.map((version, index) => <div key={version.eventId} className="conflict-version"><span className="version-label">Version {index + 1} <time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></span><p>{displayValue(version.value, state, conflict.field)}</p><button className="text-button" disabled={busy} onClick={() => resolve(conflict, version.value)}>Use this version</button></div>)}</div>
    {(textField || conflict.field === 'tags') && <>{!composing ? <button className="text-button" onClick={() => { setComposing(true); setCombined(conflict.values.map((v) => Array.isArray(v.value) ? v.value.join(', ') : String(v.value ?? '')).join(textField ? '\n\n' : ', ')); }}>Combine versions</button> : <div className="combine-editor"><label htmlFor={`combine-${conflict.id}`}>Combined {conflict.field}</label><textarea id={`combine-${conflict.id}`} value={combined} onChange={(event) => setCombined(event.target.value)} rows={4} /><button className="button small" disabled={busy || ((conflict.field === 'title' || conflict.field === 'name') && !combined.trim())} onClick={() => resolve(conflict, conflict.field === 'tags' ? [...new Set(combined.split(',').map((tag) => tag.trim()).filter(Boolean))] : combined)}>Save combined version</button></div>}</>}
  </section>;
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const stateRef = useRef<AppState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [activeList, setActiveList] = useState('');
  const activeListRef = useRef('');
  const [draft, setDraftState] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [quickTitle, setQuickTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [newList, setNewList] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [listName, setListName] = useState('');
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState('');
  const [completedOpen, setCompletedOpen] = useState(false);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [remoteInput, setRemoteInput] = useState('');
  const [remoteDirty, setRemoteDirty] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [exampleBusy, setExampleBusy] = useState(false);
  const [busyTasks, setBusyTasks] = useState<Set<string>>(new Set());
  const editorRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const syncRef = useRef<HTMLDivElement | null>(null);
  const syncButtonRef = useRef<HTMLButtonElement | null>(null);
  const quickAddRef = useRef<HTMLInputElement | null>(null);
  const lastTaskButton = useRef<HTMLButtonElement | null>(null);
  const renameHeads = useRef<string[]>([]);
  const scrollPosition = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pendingMutations = useRef(0);
  const mutationEpoch = useRef(0);
  const savePromise = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(true);
  const initialized = useRef(false);

  const setDraft = useCallback((next: Draft | null) => {
    draftRef.current = next;
    setDraftState(next);
    try {
      if (isDirty(next)) localStorage.setItem(recoveryKey, JSON.stringify(next));
      else localStorage.removeItem(recoveryKey);
    } catch { /* Memory remains the source of truth if storage is unavailable. */ }
  }, []);

  const applyState = useCallback((next: AppState) => {
    stateRef.current = next;
    setState(next);
    if (!activeListRef.current || !next.lists.some((list) => list.id === activeListRef.current)) {
      activeListRef.current = next.lists[0]?.id || '';
      setActiveList(activeListRef.current);
    }
    if (!initialized.current) {
      initialized.current = true;
      try {
        const stored = localStorage.getItem(recoveryKey);
        if (stored) {
          const recovered = JSON.parse(stored) as Draft;
          if (recovered.task?.id && recovered.base?.heads && isDirty(recovered)) {
            setDraft(recovered);
            activeListRef.current = recovered.task.listId;
            setActiveList(recovered.task.listId);
            setSaveState('error');
            setSaveError('Your unsaved draft was restored. Review it, then retry saving.');
          }
        }
      } catch { /* Ignore an obsolete or unreadable recovery draft. */ }
      return;
    }
    const current = draftRef.current;
    const focused = !!editorRef.current?.contains(document.activeElement);
    if (current && !isDirty(current) && !focused && !savePromise.current) {
      const incoming = next.tasks.find((task) => task.id === current.task.id && !task.deleted);
      if (incoming) setDraft({ task: incoming, base: incoming, version: current.version });
      else setDraft(null);
    }
  }, [setDraft]);

  const mutate = useCallback((path: string, method: string, data?: unknown): Promise<AppState> => {
    pendingMutations.current += 1;
    mutationEpoch.current += 1;
    const operation = queue.current.catch(() => undefined).then(() => request(path, method, data)).then((next) => {
      if (mounted.current) applyState(next);
      return next;
    }).finally(() => { pendingMutations.current -= 1; mutationEpoch.current += 1; });
    queue.current = operation;
    return operation;
  }, [applyState]);

  const load = useCallback(async () => {
    const epoch = mutationEpoch.current;
    try {
      const next = await request('/api/state');
      if (mounted.current && epoch === mutationEpoch.current && !pendingMutations.current) {
        applyState(next); setLoadError('');
      }
    } catch (error) {
      if (mounted.current) setLoadError(errorText(error));
    }
  }, [applyState]);

  useEffect(() => {
    mounted.current = true;
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 3000);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    const beforeUnload = (event: BeforeUnloadEvent) => { if (isDirty(draftRef.current)) { event.preventDefault(); } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { mounted.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('beforeunload', beforeUnload); };
  }, [load]);

  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (savePromise.current) return savePromise.current;
    const operation = (async () => {
      let current = draftRef.current;
      while (current && isDirty(current)) {
        if (!current.task.title.trim()) { setSaveState('error'); setSaveError('A task needs a title. Your draft is still here.'); return false; }
        const sent = current;
        setSaveState('saving'); setSaveError('');
        try {
          const next = await mutate(`/api/tasks/${encodeURIComponent(sent.task.id)}`, 'PATCH', { changes: difference(sent.task, sent.base), baseHeads: sent.base.heads });
          const saved = next.tasks.find((task) => task.id === sent.task.id);
          if (!saved) throw new Error('The saved task was not returned. Your draft is still here.');
          const latest = draftRef.current;
          if (latest?.task.id === sent.task.id) {
            const furtherChanges = difference(latest.task, sent.task);
            const merged = { ...saved, ...furtherChanges };
            const updated = { task: merged, base: saved, version: latest.version };
            setDraft(updated);
            current = updated;
          } else current = null;
        } catch (error) {
          setSaveState('error'); setSaveError(errorText(error)); return false;
        }
      }
      setSaveState('saved'); setSaveError(''); setAnnouncement('Changes saved on this machine.');
      return true;
    })();
    savePromise.current = operation;
    try { return await operation; } finally { savePromise.current = null; }
  }, [mutate, setDraft]);

  useEffect(() => {
    if (!isDirty(draft) || saveState === 'error') return;
    const timer = setTimeout(() => void saveDraft(), 600);
    return () => clearTimeout(timer);
  }, [draft, saveDraft, saveState]);

  const change = useCallback(<K extends keyof TaskFields>(field: K, value: TaskFields[K]) => {
    const current = draftRef.current;
    if (!current) return;
    setDraft({ ...current, task: { ...current.task, [field]: value }, version: current.version + 1 });
    setSaveState('dirty'); setSaveError('');
  }, [setDraft]);

  const leaveEditor = async (action: () => void) => {
    if (!(await saveDraft())) { setAnnouncement('Save your draft before leaving task details.'); return false; }
    action(); return true;
  };
  const selectList = async (id: string) => {
    await leaveEditor(() => { activeListRef.current = id; setActiveList(id); setDraft(null); setCompletedOpen(false); setRenaming(false); setListError(''); workspaceRef.current?.scrollTo(0, 0); quickAddRef.current?.focus(); });
  };
  const selectTask = async (task: Task, button: HTMLButtonElement) => {
    if (draftRef.current?.task.id === task.id) return;
    await leaveEditor(() => {
      const latest = stateRef.current?.tasks.find((item) => item.id === task.id) || task;
      scrollPosition.current = workspaceRef.current?.scrollTop || 0;
      lastTaskButton.current = button;
      setDraft({ task: latest, base: latest, version: 0 }); setSaveState('saved'); setSaveError('');
      if (window.matchMedia('(max-width: 760px)').matches) setTimeout(() => editorRef.current?.querySelector<HTMLButtonElement>('.editor-back')?.focus(), 0);
    });
  };
  const closeEditor = async () => {
    await leaveEditor(() => { setDraft(null); requestAnimationFrame(() => { workspaceRef.current?.scrollTo(0, scrollPosition.current); if (lastTaskButton.current?.isConnected) lastTaskButton.current.focus(); else quickAddRef.current?.focus(); }); });
  };

  const addTask = async (event: FormEvent) => {
    event.preventDefault();
    const title = quickTitle.trim();
    if (!title || !activeList || adding) return;
    setAdding(true); setNotice('');
    try { await mutate('/api/tasks', 'POST', { title, listId: activeList, id: crypto.randomUUID() }); setQuickTitle(''); setAnnouncement(`Added ${title}.`); quickAddRef.current?.focus(); }
    catch (error) { setNotice(`Task could not be added. ${errorText(error)}`); }
    finally { setAdding(false); }
  };

  const patchTask = async (task: Task, changes: Partial<TaskFields>, undoChanges?: Partial<TaskFields>) => {
    if (busyTasks.has(task.id)) return;
    setBusyTasks((previous) => new Set(previous).add(task.id)); setNotice('');
    try {
      if (draftRef.current?.task.id === task.id) {
        const current = draftRef.current;
        setDraft({ ...current, task: { ...current.task, ...changes }, version: current.version + 1 });
        setSaveState('dirty');
        if (!(await saveDraft())) return;
      } else await mutate(`/api/tasks/${encodeURIComponent(task.id)}`, 'PATCH', { changes, baseHeads: task.heads });
      const latest = stateRef.current?.tasks.find((item) => item.id === task.id);
      if (undoChanges && latest) setUndo({ label: changes.deleted ? 'Task deleted' : 'Task completed', taskId: task.id, changes: undoChanges, baseHeads: latest.heads });
      setAnnouncement(changes.deleted ? 'Task deleted. Undo is available.' : changes.completed ? 'Task completed. Undo is available.' : 'Task reopened.');
      if (changes.deleted && draftRef.current?.task.id === task.id) setDraft(null);
    } catch (error) { setNotice(errorText(error)); }
    finally { setBusyTasks((previous) => { const next = new Set(previous); next.delete(task.id); return next; }); }
  };

  const undoAction = async () => {
    if (!undo) return;
    try {
      const next = await mutate(`/api/tasks/${encodeURIComponent(undo.taskId)}`, 'PATCH', { changes: undo.changes, baseHeads: undo.baseHeads });
      const saved = next.tasks.find((task) => task.id === undo.taskId);
      if (saved && draftRef.current?.task.id === saved.id && !isDirty(draftRef.current)) setDraft({ task: saved, base: saved, version: 0 });
      setUndo(null); setAnnouncement('Action undone.');
    } catch (error) { setNotice(`Could not undo. ${errorText(error)}`); }
  };

  const saveList = async (event: FormEvent) => {
    event.preventDefault();
    const name = (newList !== null ? newList : listName).trim();
    if (!name || listBusy || !state) return;
    setListBusy(true); setListError('');
    try {
      if (newList !== null) {
        if (!(await saveDraft())) return;
        const id = crypto.randomUUID();
        await mutate('/api/lists', 'POST', { id, name });
        activeListRef.current = id; setActiveList(id); setDraft(null); setNewList(null);
        setAnnouncement(`Created ${name}.`);
      } else {
        const list = state.lists.find((item) => item.id === activeList);
        if (list) await mutate(`/api/lists/${encodeURIComponent(list.id)}`, 'PATCH', { changes: { name }, baseHeads: renameHeads.current });
        setRenaming(false); setAnnouncement('List renamed.');
      }
    } catch (error) { setListError(errorText(error)); }
    finally { setListBusy(false); }
  };

  const examples = async (clear: boolean) => {
    if (!(await saveDraft())) return;
    setExampleBusy(true); setNotice('');
    try {
      const next = await mutate('/api/demo', clear ? 'DELETE' : 'POST');
      if (clear) setDraft(null);
      else {
        const sample = next.tasks.find((task) => task.sample && !task.deleted && task.title === 'Review sync conflict behavior') || next.tasks.find((task) => task.sample && !task.deleted);
        if (sample) { activeListRef.current = sample.listId; setActiveList(sample.listId); setDraft({ task: sample, base: sample, version: 0 }); }
      }
      setAnnouncement(clear ? 'Example tasks cleared.' : 'Example tasks added. These are synthetic sample tasks.');
    } catch (error) { setNotice(errorText(error)); }
    finally { setExampleBusy(false); }
  };

  useEffect(() => {
    if (state && !remoteDirty) setRemoteInput(state.sync.remote || '');
  }, [state?.sync.remote, remoteDirty]);
  useEffect(() => {
    if (!syncOpen) return;
    const outside = (event: PointerEvent) => { if (!syncRef.current?.contains(event.target as Node) && !syncButtonRef.current?.contains(event.target as Node)) setSyncOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSyncOpen(false); syncButtonRef.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [syncOpen]);

  const configureRemote = async (event: FormEvent) => {
    event.preventDefault();
    const url = remoteInput.trim();
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?\/?$/.test(url) && !/^git@github\.com:[\w.-]+\/[\w.-]+(?:\.git)?$/.test(url)) { setSyncError('Enter a GitHub repository URL, such as git@github.com:you/tasks.git.'); return; }
    if (!(await saveDraft())) return;
    setSyncBusy(true); setSyncError('');
    try { await mutate('/api/remote', 'PUT', { url }); setRemoteDirty(false); setAnnouncement('GitHub data repository configured.'); }
    catch (error) { setSyncError(errorText(error)); }
    finally { setSyncBusy(false); }
  };
  const syncNow = async () => {
    if (!(await saveDraft())) return;
    setSyncBusy(true); setSyncError('');
    try { await mutate('/api/sync', 'POST'); }
    catch (error) { setSyncError(errorText(error)); }
    finally { setSyncBusy(false); }
  };
  const resolve = async (conflict: Conflict, value: unknown) => {
    if (!(await saveDraft())) return;
    setSyncBusy(true); setSyncError('');
    try {
      const next = await mutate(`/api/conflicts/${encodeURIComponent(conflict.id)}/resolve`, 'POST', { value });
      const current = draftRef.current;
      if (current && current.task.id === conflict.entityId) {
        const updated = next.tasks.find((task) => task.id === current.task.id);
        if (updated) setDraft({ task: updated, base: updated, version: current.version + 1 });
      }
      setAnnouncement('Conflict resolved.');
    } catch (error) { setSyncError(errorText(error)); }
    finally { setSyncBusy(false); }
  };

  if (!state) return <div className="boot"><div className="boot-brand"><CheckCheck size={28} /> Tasks</div>{loadError ? <><CircleAlert size={30} /><h1>Cannot reach the local service</h1><p>{loadError}</p><p>Start the app with <code>pnpm dev</code>, then try again.</p><button className="primary" onClick={() => void load()}>Try again</button></> : <><LoaderCircle className="spin" size={25} /><p>Opening your tasks…</p></>}</div>;

  const currentList = state.lists.find((list) => list.id === activeList);
  const tasks = state.tasks.filter((task) => !task.deleted && task.listId === activeList).sort((a, b) => (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31') || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const active = tasks.filter((task) => !task.completed);
  const completed = tasks.filter((task) => task.completed);
  const selected = draft?.task;
  const localPending = isDirty(draft) || saveState === 'saving';
  const syncText = saveState === 'error' ? 'Draft needs saving' : localPending ? 'Saving on this machine' : syncLabel(state);
  const statusAlert = saveState === 'error' || ['error', 'offline', 'conflict'].includes(state.sync.phase) || state.conflicts.length > 0;
  const SyncIcon = saveState === 'error' || state.conflicts.length ? CircleAlert : localPending || state.sync.phase === 'syncing' ? LoaderCircle : state.sync.phase === 'offline' ? CloudOff : state.sync.remote ? Cloud : GitBranch;

  const taskRow = (task: Task) => {
    const shown = selected?.id === task.id ? selected : task;
    return <div className={`task-row${selected?.id === task.id ? ' selected' : ''}${shown.completed ? ' completed-task' : ''}`} key={task.id}>
      <label className="task-check"><input type="checkbox" checked={shown.completed} disabled={busyTasks.has(task.id)} aria-label={`${shown.completed ? 'Reopen' : 'Complete'} ${shown.title}`} onChange={() => void patchTask(task, { completed: !shown.completed }, !shown.completed ? { completed: false } : undefined)} /><span className="checkbox-art"><Check size={13} strokeWidth={3} /></span></label>
      <div className="task-content"><button className="task-title" aria-pressed={selected?.id === task.id} onClick={(event) => void selectTask(task, event.currentTarget)}>{shown.title || 'Untitled task'}</button>{shown.tags.length > 0 && <span className="task-tags">{shown.tags.join(' · ')}</span>}</div>
      <span className={`due${shown.due === localDate() ? ' today' : ''}${shown.due && shown.due < localDate() && !shown.completed ? ' overdue' : ''}`} title={shown.due || undefined}>{dueLabel(shown.due)}</span>
      <span className={`priority ${shown.priority}`}>{shown.priority === 'none' ? '—' : shown.priority.charAt(0).toUpperCase() + shown.priority.slice(1)}</span>
    </div>;
  };

  return <div className={`app${selected ? ' has-editor' : ''}`}>
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    <aside className="rail" aria-label="List navigation">
      <div className="brand"><CheckCheck size={24} strokeWidth={2.2} /><span>Tasks</span></div>
      <div className="rail-label"><span>Lists</span><button className="rail-icon" aria-label="Create a list" onClick={() => { setNewList(''); setListError(''); }}><Plus size={17} /></button></div>
      <nav aria-label="Task lists">{state.lists.map((list) => <button key={list.id} className={`nav-item${list.id === activeList ? ' active' : ''}`} aria-current={list.id === activeList ? 'page' : undefined} onClick={() => void selectList(list.id)}><span className="nav-name">{list.name}</span><span className="nav-count">{state.tasks.filter((task) => !task.deleted && !task.completed && task.listId === list.id).length}</span></button>)}</nav>
      {newList !== null && <form className="new-list-form" onSubmit={(event) => void saveList(event)}><label className="sr-only" htmlFor="new-list-name">New list name</label><input autoFocus id="new-list-name" placeholder="List name" value={newList} onChange={(event) => setNewList(event.target.value)} maxLength={80} onKeyDown={(event) => { if (event.key === 'Escape') setNewList(null); }} /><div><button className="rail-action" disabled={listBusy || !newList.trim()} type="submit">{listBusy ? 'Creating…' : 'Create list'}</button><button className="rail-action" type="button" onClick={() => setNewList(null)}>Cancel</button></div></form>}
      {listError && <p className="rail-error" role="alert">{listError}</p>}
      <div className="rail-bottom"><GitBranch size={15} /><span>Your tasks, on this machine.</span></div>
    </aside>
    <main className="workspace" ref={workspaceRef} aria-label="Tasks" aria-hidden={undefined}>
      <div className="mobile-list-bar"><label className="sr-only" htmlFor="mobile-list">Task list</label><Folder size={17} /><select id="mobile-list" value={activeList} onChange={(event) => void selectList(event.target.value)}>{state.lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select><button className="icon-button" aria-label="Create a list" onClick={() => { setNewList(''); setListError(''); }}><Plus size={19} /></button></div>
      {newList !== null && <form className="mobile-new-list" onSubmit={(event) => void saveList(event)}><label className="sr-only" htmlFor="mobile-new-list-name">New list name</label><input id="mobile-new-list-name" placeholder="List name" value={newList} onChange={(event) => setNewList(event.target.value)} /><button className="primary" disabled={listBusy || !newList.trim()}>Create</button><button className="icon-button" type="button" aria-label="Cancel new list" onClick={() => setNewList(null)}><X size={19} /></button>{listError && <p role="alert">{listError}</p>}</form>}
      <header className="page-head"><div className="heading-group">{renaming ? <form className="rename-form" onSubmit={(event) => void saveList(event)}><label className="sr-only" htmlFor="rename-list">List name</label><input id="rename-list" autoFocus value={listName} onChange={(event) => setListName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setRenaming(false); }} /><button className="icon-button" aria-label="Save list name" disabled={listBusy || !listName.trim()}><Check size={20} /></button><button className="icon-button" type="button" aria-label="Cancel rename" onClick={() => setRenaming(false)}><X size={18} /></button></form> : <div className="heading-line"><h1>{currentList?.name || 'Your tasks'}</h1><button className="icon-button rename-button" aria-label="Rename this list" onClick={() => { setListName(currentList?.name || ''); renameHeads.current = currentList?.heads || []; setRenaming(true); setListError(''); }}><Pencil size={15} /></button></div>}<p>{active.length} active <span aria-hidden="true">·</span> {completed.length} completed</p></div><span className="list-heading-icon" aria-hidden="true"><MoreHorizontal size={24} /></span></header>
      {listError && renaming && <p className="inline-error" role="alert">{listError}</p>}
      {state.demo && <div className="sample-banner"><span>Sample tasks</span><button className="text-button" disabled={exampleBusy} onClick={() => void examples(true)}>{exampleBusy ? 'Clearing…' : 'Clear examples'}</button></div>}
      {loadError && <div className="notice warning" role="alert"><CloudOff size={17} /><div><strong>Local service unavailable.</strong> Your draft stays here. <button className="text-button" onClick={() => void load()}>Retry</button></div></div>}
      {notice && <div className="notice warning" role="alert"><CircleAlert size={17} /><span>{notice}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}
      <form className="add-form" onSubmit={(event) => void addTask(event)}><div className="quick-add-wrap"><Plus size={19} aria-hidden="true" /><label className="sr-only" htmlFor="quick-add">Add a task to {currentList?.name}</label><input ref={quickAddRef} id="quick-add" placeholder="Add task" value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} autoComplete="off" maxLength={500} /></div><button type="submit" className="primary" disabled={adding || !quickTitle.trim()}>{adding ? 'Adding…' : 'Add task'}</button></form>
      {active.length ? <><div className="list-caption" aria-hidden="true"><span>Task</span><span>Due</span><span>Priority</span></div><section className="task-list" aria-label="Active tasks">{active.map(taskRow)}</section></> : <section className="empty-list"><div className="empty-symbol"><CheckCheck size={29} strokeWidth={1.7} /></div><h2>{completed.length ? 'A little room to breathe.' : 'Make room for what matters.'}</h2><p>{completed.length ? 'Everything in this list is done. Add the next thing whenever you’re ready.' : 'Add your first task above. You can give it notes, a due date, priority, and tags as you go.'}</p>{!state.tasks.some((task) => !task.deleted) && !state.demo && <button className="button" disabled={exampleBusy} onClick={() => void examples(false)}>{exampleBusy ? 'Adding examples…' : 'Try example tasks'}</button>}</section>}
      {completed.length > 0 && <div className="completed-section"><button className="completed-toggle" aria-expanded={completedOpen} onClick={() => setCompletedOpen(!completedOpen)}>{completedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}Completed <span>· {completed.length}</span></button>{completedOpen && <section className="task-list" aria-label="Completed tasks">{completed.map(taskRow)}</section>}</div>}
      <footer className="workspace-footer"><span>{state.demo ? 'Synthetic examples · Explore, then make it yours.' : 'A clear place for your next thing.'}</span><span className="keyboard-hint"><kbd>Enter</kbd> to add a task</span></footer>
    </main>
    {selected && <aside className="editor" aria-label="Task details" ref={editorRef} onBlur={() => { setTimeout(() => { const current = draftRef.current; const incoming = stateRef.current?.tasks.find((task) => task.id === current?.task.id); if (current && incoming && !isDirty(current) && !editorRef.current?.contains(document.activeElement) && !savePromise.current) setDraft({ task: incoming, base: incoming, version: current.version }); }, 0); }}>
      <div className="editor-head"><button className="editor-back text-button" onClick={() => void closeEditor()}><ArrowLeft size={17} /> Back</button><span className="editor-heading">Task details</span><button className="editor-close icon-button" aria-label="Close task details" onClick={() => void closeEditor()}><X size={18} /></button></div>
      <div className="editor-scroll"><div className="editor-title-group"><label className="task-check editor-check"><input type="checkbox" checked={selected.completed} disabled={busyTasks.has(selected.id)} aria-label={selected.completed ? 'Reopen selected task' : 'Complete selected task'} onChange={() => void patchTask(selected, { completed: !selected.completed }, !selected.completed ? { completed: false } : undefined)} /><span className="checkbox-art"><Check size={13} strokeWidth={3} /></span></label><label className="sr-only" htmlFor="task-title">Task title, required</label><textarea id="task-title" className="editor-title" value={selected.title} required placeholder="Task title" rows={Math.min(7, Math.max(2, Math.ceil(selected.title.length / 23)))} onChange={(event) => change('title', event.target.value)} aria-invalid={!selected.title.trim()} maxLength={500} /></div>
      <div className="notes-field"><label className="field-label" htmlFor="task-notes">Notes</label><textarea id="task-notes" value={selected.notes} placeholder="Add a little context…" onChange={(event) => change('notes', event.target.value)} rows={6} /></div>
      <div className="properties"><div className="property"><label htmlFor="task-due">Due</label><input type="date" id="task-due" value={selected.due || ''} onInput={(event) => change('due', event.currentTarget.value || null)} onChange={(event) => change('due', event.target.value || null)} /></div><div className="property"><label htmlFor="task-priority">Priority</label><select id="task-priority" value={selected.priority} onChange={(event) => change('priority', event.target.value as TaskFields['priority'])}><option value="none">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div><TagInput tags={selected.tags} onChange={(tags) => change('tags', tags)} taskId={selected.id} /><div className="property"><label htmlFor="task-list">List</label><select id="task-list" value={selected.listId} onChange={(event) => change('listId', event.target.value)}>{state.lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></div></div>
      {selected.sample && <p className="sample-note">This is a sample task.</p>}
      <button className="delete-button" disabled={busyTasks.has(selected.id)} onClick={() => void patchTask(selected, { deleted: true }, { deleted: false })}><Trash2 size={15} /> Delete task</button>
      </div>
      <div className={`save-feedback${saveState === 'error' ? ' error' : ''}`} role={saveState === 'error' ? 'alert' : undefined}>{saveState === 'error' ? <><div><CircleAlert size={16} /><span>Draft not saved</span></div><p>{saveError}</p><button className="text-button" onClick={() => void saveDraft()}>Retry saving</button><span className="draft-help">Your draft stays open until it is saved.</span></> : <div>{saveState === 'saving' ? <LoaderCircle size={15} className="spin" /> : saveState === 'dirty' ? <span className="save-dot" /> : <Check size={16} />}<span>{saveState === 'saving' ? 'Saving on this machine…' : saveState === 'dirty' ? 'Unsaved changes' : 'Saved on this machine'}</span></div>}</div>
    </aside>}
    <div className="sync-dock"><button ref={syncButtonRef} className={`sync-control${statusAlert ? ' attention' : ''}`} onClick={() => { setSyncOpen(!syncOpen); setSyncError(''); }} aria-expanded={syncOpen} aria-controls="sync-details"><SyncIcon size={16} className={localPending || state.sync.phase === 'syncing' ? 'spin' : ''} /><span>{syncText}</span><ChevronDown size={14} className={syncOpen ? 'rotated' : ''} /></button></div>
    {syncOpen && <div className="sync-popover" ref={syncRef} id="sync-details" role="region" aria-label="GitHub synchronization details"><header><h2>Synchronization</h2><button className="icon-button" aria-label="Close sync details" onClick={() => { setSyncOpen(false); syncButtonRef.current?.focus(); }}><X size={18} /></button></header><div className="sync-popover-content"><p className="sync-summary"><SyncIcon size={17} />{syncText}</p>{state.sync.message && <p className="sync-message">{state.sync.message}</p>}{syncError && <p className="inline-error" role="alert">{syncError}</p>}
      {state.sync.remote && <><dl className="sync-facts"><div><dt>Data repository</dt><dd>{state.sync.remote}</dd></div><div><dt>Last synced</dt><dd>{state.sync.lastSyncedAt ? new Date(state.sync.lastSyncedAt).toLocaleString() : 'Not yet synced'}</dd></div><div><dt>Pending changes</dt><dd>{state.sync.pending}</dd></div></dl><button className="button sync-now" onClick={() => void syncNow()} disabled={syncBusy || state.sync.phase === 'syncing'}><RefreshCw size={15} className={syncBusy ? 'spin' : ''} />{syncBusy || state.sync.phase === 'syncing' ? 'Syncing…' : 'Sync now'}</button></>}
      {state.conflicts.length > 0 && <div className="conflicts"><h3>Choose what to keep</h3><p>Two machines changed the same field. Compare the versions below. Your other tasks are ready to use.</p>{state.conflicts.map((conflict) => <ConflictItem key={conflict.id} conflict={conflict} state={state} busy={syncBusy} resolve={(item, value) => void resolve(item, value)} />)}</div>}
      <details className="remote-config" open={!state.sync.remote}><summary>{state.sync.remote ? 'Change data repository' : 'Connect GitHub'}</summary><p>{state.sync.remote ? 'Use a dedicated repository for your task data.' : 'Your tasks are saved locally. Connect a private GitHub repository to use them across your machines.'}</p><form onSubmit={(event) => void configureRemote(event)}><label htmlFor="remote-url">GitHub data repository URL</label><input id="remote-url" value={remoteInput} onChange={(event) => { setRemoteInput(event.target.value); setRemoteDirty(true); }} placeholder="git@github.com:you/tasks.git" autoComplete="off" spellCheck={false} /><p className="field-help">Uses installed Git and its existing credentials. The repository holds task data separately from the app source.</p><button className="primary" disabled={syncBusy || !remoteInput.trim()}>{syncBusy ? 'Connecting…' : state.sync.remote ? 'Update repository' : 'Connect repository'}</button></form></details>
    </div></div>}
    {undo && <div className="undo-toast" role="status"><Check size={17} /><span>{undo.label}</span><button onClick={() => void undoAction()}>Undo</button><button className="toast-dismiss" aria-label="Dismiss undo" onClick={() => setUndo(null)}><X size={16} /></button></div>}
  </div>;
}

function TagInput({ tags, onChange, taskId }: { tags: string[]; onChange: (tags: string[]) => void; taskId: string }) {
  const [text, setText] = useState(tags.join(', '));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(tags.join(', ')); }, [tags, focused, taskId]);
  useEffect(() => { setText(tags.join(', ')); }, [taskId]);
  return <div className="property tags-property"><label htmlFor="task-tags">Tags</label><div><input id="task-tags" value={text} placeholder="Add tags" onFocus={() => setFocused(true)} onChange={(event) => { const value = event.target.value; setText(value); onChange([...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))]); }} onBlur={() => setFocused(false)} aria-describedby="tags-help" /><span id="tags-help" className="field-help">Separate with commas</span></div></div>;
}
