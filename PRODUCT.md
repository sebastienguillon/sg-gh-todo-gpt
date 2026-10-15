# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: the user asked Codex to recommend and choose the stack for a local web app on each machine using installed Git.

- React and TypeScript for the browser interface.
- Vite for frontend development and builds.
- Node.js and TypeScript for a local HTTP service that invokes the installed Git executable. This keeps one implementation language across the interface and local integration.
- Serve the app and its local API over loopback. Git operations and credential access belong in the local service.
- Use pnpm consistently for scaffolding, dependency installation, scripts, CI, and documentation. Keep pnpm-lock.yaml as the lockfile when the application is scaffolded.

The stack was chosen under the user's delegation and is implemented in this repository. package.json and pnpm-lock.yaml own the installed dependency versions.

## Users

One person managing a personal to-do list across several client machines. This is a single-user product, even when more than one installation is active.

## Product Purpose

Provide a simple to-do app whose persistent data is managed through Git and a GitHub remote. The same user should be able to use the app on multiple machines without a separate application account or login.

## Positioning

Git-backed task persistence with a GitHub remote is the defining mechanism. The local web app uses the user's installed Git rather than requiring a centrally hosted application backend.

## Operating Context

- Run a local web app on each client machine and use it through a browser.
- Each installation accesses the same user's task data through Git and a GitHub remote.
- The user initially proposed using the same GitHub credentials across machines. Exact provisioning and whether each device receives its own credential remain open.
- No separate application authentication is desired. Authenticated access to GitHub is still required for writes and private repository access.
- Project directory: /Users/seb/dev/projects/sebastienguillon/sg-gh-todo-gpt.

## Capabilities and Constraints

Confirmed product behavior:

- Named lists; each task belongs to one list and can move between lists.
- Required task title; optional notes, calendar due date, priority None/Low/Medium/High, and multiple tags.
- Enter adds a task to the active list. Selecting a task opens its editor. Edits autosave locally.
- Completion with Undo, a completed section, and reopening completed tasks.
- Automatic background synchronization with compact status and details on demand. Local persistence and GitHub synchronization have separate outcomes.
- Unsaved drafts survive save failures. Incoming synchronization must not overwrite a focused draft. Conflicts preserve both versions for review while unrelated tasks remain usable.
- Narrow screens use full-width task details with a return to the originating list position. Keyboard access and visible focus are required.
- Empty lists, long content, local save errors, offline/pending synchronization, credential failures, and conflicts are part of the main-screen scope.

Implementation choices made for this build:

- A dedicated local data repository, separate from the application source repository. Connect a GitHub data remote through the app; no remote is provisioned automatically.
- Immutable causal change records and field-level conflict detection, using installed Git for local commits and remote synchronization. No forced pushes.
- Approximately 30-second automatic synchronization with bounded retries. Git credentials remain with installed Git.
- Example tasks are optional and visibly identified. Actual task data and runtime state are ignored by the source repository.

Still open:

- Final product name and branding beyond the selected main-screen direction.
- Broader task views, attachments, recurring tasks, and list deletion; none is implied by this build.
- Broader operating-system/browser support and distribution beyond the local Node.js/browser workflow.

## Approved Main Screen

The user selected the Margin notes preview at .impeccable/mocks/decision/assigned.html and confirmed the task-screen UX brief. The surface brief at .impeccable/surfaces/src-app-tsx.md carries the screen-specific strategy. DESIGN.md records the implemented visual system after review.

## Evidence on Hand

The user's concept, delivery decisions, selected HTML sketch, and confirmed UX brief are the sources of product truth. The preview's example tasks are synthetic, not the user's existing task data. The repository name is not a confirmed product name. No measured performance benchmark or specific GitHub approval is claimed.

## Product Principles

- Keep the product focused on one person's task management across their own machines.
- Preserve Git and GitHub persistence as a core product constraint.
- Keep everyday use free of a separate application sign-in.
- Make local persistence and cross-machine synchronization behavior explicit as those workflows are designed.
