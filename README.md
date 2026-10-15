# GitHub-backed tasks

A personal to-do app that runs on your machine. The browser UI talks to a local Node.js service; installed Git persists task changes and synchronizes a separate data repository with an optional GitHub remote.

## Run locally

Use Node.js 22.12 or newer, installed Git, and pnpm (the packageManager field pins the project version).

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173. The local API runs on 127.0.0.1:4317. The first launch creates a local data repository and a Personal list. Add a task, or choose **Try example tasks** to explore the selected screen with labeled examples.

For a built UI served by the local service:

```sh
pnpm build
pnpm start
```

Open http://127.0.0.1:4317. Keep the local service running while using the app.

## Connect GitHub

1. Create a dedicated empty GitHub repository for task data. A private repository is suitable for personal tasks.
2. Make sure installed Git on this machine can access that repository using your existing SSH key or credential helper.
3. Open **Sync details** in the app and enter the repository's HTTPS or SSH URL. The app uses the `main` branch.

Each machine uses its own local data directory and the same GitHub data repository. GitHub authentication stays with Git; the app does not collect or embed an access token. Connecting the app's source-code repository as a data repository is unsupported.

Changes save locally before remote synchronization. The status distinguishes local saves, pending synchronization, completed synchronization, and failures. Automatic sync runs approximately every 30 seconds; the details panel also offers a manual retry. With no remote configured, tasks remain usable on this machine.

## Task workflows

- Add a task to the current named list with Enter.
- Open a row to edit its title, notes, due date, priority, tags, and list.
- Complete a task, undo completion, or reopen it from the completed section.
- Move a task to another list from the editor.
- Review conflicting field values in the sync details. Choose or combine a value to resolve a conflict; unrelated tasks stay available.

The required title is the only field needed for quick entry. Due dates are calendar dates, not timestamps. Drafts are retained when a save fails; remote updates do not replace an active draft.

## Data and configuration

The default data directory is `.gh-todo-data/`, ignored by the application source repository. It contains its own Git repository and immutable JSON change records. Field changes carry causal parents, allowing independent edits to combine while concurrent different values of the same field remain reviewable. Deletions are tombstones and historical content remains in Git history.

Set a different data location when launching if needed:

```sh
GH_TODO_DATA_DIR=/absolute/path/to/task-data pnpm dev
```

`GH_TODO_PORT` changes the local service's port. The default development proxy expects 4317; update vite.config.ts if using a different API port during development. The server binds to loopback and checks request origins; this is a local single-user application.

Examples are opt-in. **Clear examples** removes sample tasks while retaining tasks you created. No real task data, credentials, or application runtime state belongs in the source repository.

## Checks

```sh
pnpm test
pnpm build
```

Tests use temporary directories and local bare Git remotes. They do not contact a real GitHub repository.

The approved first-viewport reference is `.impeccable/mocks/decision/assigned.html`. The confirmed screen strategy is `.impeccable/surfaces/src-app-tsx.md`.
