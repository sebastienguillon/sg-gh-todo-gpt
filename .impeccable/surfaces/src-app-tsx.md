---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/styles.css"]
---

# Main task screen

Mode: Operate. Target: src/App.tsx and src/styles.css; local route /.

The user confirmed this screen and selected .impeccable/mocks/decision/assigned.html (Margin notes), code-first, on 2026-10-15. Treat its arrangement, palette, type and density as the approved first-viewport reference. The implementation must adapt beyond its fixed 1440 x 900 preview.

## Confirmed UX brief

- Ink-blue named-list navigation, task rows with aligned due-date and priority columns, selected-task editor on the right. Narrow screens show full-width details; Back restores the originating list position.
- Each task belongs to one list. Title required; optional notes, calendar due date, priority None/Low/Medium/High, and multiple tags. The editor can move tasks between lists.
- Enter adds to the active list. A task opens its details. Edits autosave locally. Completion offers Undo; completed tasks remain available to reopen.
- Compact sync status remains visible with the editor closed. Distinguish saved on this machine from synced to GitHub. Preserve drafts on save failure and focused edits during incoming sync. Review both conflicting versions; keep unrelated tasks usable.
- Cover empty/completed lists, long content, keyboard operation, narrow layouts, save errors, offline/pending sync, missing credentials, conflicts. App account/authentication screens are outside scope.

## Implementation decisions

React/TypeScript/Vite UI and Node/TypeScript loopback service using installed Git; pnpm. Dedicated local data repository, optional user-configured GitHub remote, immutable causal change records, field-level semantic conflicts, ~30-second background sync with bounded retries. Examples are opt-in and visibly labeled. Never commit task data or credentials to the app source repository. No GitHub remote is provisioned by this build.

## Direction contract

THESIS: The working task list leads, with rich details beside it and persistence feedback always reachable; there is no dashboard preamble.

OWN-WORLD: Ink-blue navigation #173e53, cool working ground #f3f6f8, white rows/editor, teal #148078 selection and primary actions, system UI sans, precise compact controls.

STORY: Choose a list, capture a task, inspect or edit its details, complete it, and understand whether changes are saved here or also on GitHub.

FIRST VIEWPORT: At desktop width, a roughly 240px list rail, broad task column with title-only quick-add and aligned due/priority metadata, and roughly 350px selected-task editor. Content begins at the top; a persistent sync disclosure survives editor closure. Selection reveals adjacent details without losing list context.

FORM: Technical-book margin grids translated into task metadata alignment, grounded candidate 3, seed 9a1aedbf, assigned direction explicitly selected by the user. Standard web navigation and controls; the signature move is the readable metadata margin, not physical-book decoration.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
