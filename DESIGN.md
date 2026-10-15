---
name: "Tasks"
description: "The implemented Margin notes visual system for the local task interface."
colors:
  ink: "#173e53"
  teal: "#148078"
  teal-hover: "#106d66"
  teal-disabled: "#5b928d"
  ground: "#f3f6f8"
  surface: "#ffffff"
  muted: "#526b78"
  helper: "#627986"
  border: "#d5dfe5"
  field-border: "#cbd8de"
  row-divider: "#e0e7eb"
  selected: "#e6f3f0"
  selected-ink: "#12685f"
  rail-active: "#296178"
  rail-hover: "#234d62"
  rail-text: "#e4edf2"
  rail-count: "#c6dce5"
  danger: "#9b432f"
  urgent: "#9a442e"
  warning-ground: "#fff0e9"
  warning-ink: "#8b432e"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  editor-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.32
    letterSpacing: "-0.025em"
  task-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "16px"
    fontWeight: 560
    lineHeight: 1.45
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  field:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.5
  helper:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  check: "4px"
  control: "5px"
  field: "6px"
  action: "7px"
  container: "9px"
spacing:
  xs: "6px"
  sm: "8px"
  compact: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  workspace: "40px"
components:
  button-primary:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.surface}"
    rounded: "{rounded.action}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.teal-hover}"
    textColor: "{colors.surface}"
  button-primary-disabled:
    backgroundColor: "{colors.teal-disabled}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "8px 13px"
  button-text:
    textColor: "#126b64"
    padding: "0"
  button-icon:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "5px"
    size: "30px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.control}"
    padding: "8px 9px"
    height: "39px"
  input-quick-add:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.action}"
    padding: "13px 15px 13px 42px"
  navigation-item:
    backgroundColor: "transparent"
    textColor: "{colors.rail-text}"
    rounded: "{rounded.action}"
    padding: "12px 16px"
  navigation-item-active:
    backgroundColor: "{colors.rail-active}"
    textColor: "{colors.surface}"
  task-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "17px"
  conflict-version:
    backgroundColor: "{colors.ground}"
    rounded: "{rounded.control}"
    padding: "12px"
  sync-control:
    backgroundColor: "{colors.rail-hover}"
    textColor: "#e3f1f2"
    rounded: "{rounded.field}"
    padding: "10px"
    height: "39px"
---

# Design System: Tasks

## Overview

**Creative North Star: "Margin notes"**

Margin notes gives everyday task work the calm order of a technical-book margin grid. Ink-blue navigation anchors a cool working ground, while white task rows and an adjacent white editor keep the content readable and directly editable. The repeated metadata margin is the signature; the interface does not simulate paper or book ornament.

The density is compact and practical. One system UI sans family, restrained curves, light rules, and small helper copy support quick capture and sustained editing. “Tasks” is the current interface label; this document does not establish a final product name. The system uses vector interface icons and requires no raster imagery.

**Key Characteristics:**

- Ink-blue navigation and cool neutral working surfaces.
- A teal action and selection language.
- Aligned task metadata with wrapping titles and tags.
- Compact system typography with explicit local-save and sync feedback.
- Responsive list-to-details navigation with a persistent sync disclosure.

## Colors

The palette combines a steady blue foundation, cool light neutrals, and a concentrated teal state color. Frontmatter is the normative source for values; the names below explain their use.

### Primary

- **Ink** (`ink`): navigation rail, principal text, and Undo surface.
- **Teal** (`teal`): primary actions, checked controls, selected-row edge, successful-save icon, and focus. Its hover and disabled variants belong to actions.
- **Selected wash / Selected ink** (`selected`, `selected-ink`): a light task-row selection fill with a stronger selected title.

### Neutral

- **Cool ground / White surface** (`ground`, `surface`): the working field and its task-list/editor surfaces.
- **Muted / Helper** (`muted`, `helper`): metadata, field labels, and small explanatory copy.
- **Border / Field border / Row divider** (`border`, `field-border`, `row-divider`): quiet boundaries between fields, rows, and panels.
- **Rail active / Rail hover / Rail text / Rail count**: blue tonal states and light labels within navigation.
- **Danger / Urgent / Warning ground / Warning ink**: semantic state colors for errors, destructive actions, overdue dates, high priority, and warning notices. They are not decorative accents.

**The Teal State Rule.** Use teal to identify primary actions, completion, selection edges, and keyboard focus. Use warm warning colors only for an actual warning, error, overdue date, or high-priority state.

## Typography

**Interface Font:** the platform system UI stack in frontmatter. It is shared by headings, task content, labels, and controls; there is no separate display face or monospace label system.

**Character:** direct, compact, and readable. Hierarchy comes from size, weight, and spacing; metadata uses tabular numerals where dates or counts align. Text stays in ordinary sentence case.

### Hierarchy

- **Headline:** list heading, with the largest working-view emphasis. It reduces to (25px) in the middle desktop band and uses (27px) on narrow screens.
- **Editor title:** an editable title, slightly tracked and deliberately able to wrap. It becomes (25px) in the full-width editor and (23px) at the smallest breakpoint.
- **Task title:** strong enough to lead each row without competing with the list heading. It reduces to (15px), then (14px), then (13px) as the layout narrows.
- **Body:** the baseline interface text. Notes use (14px) with a more open line height (1.6), increasing to (15px) on narrow screens.
- **Field:** property values and controls. Properties reach (15px) on narrow screens.
- **Label:** field labels and compact list metadata; due and priority labels use regular weight except for meaningful emphasis.
- **Helper:** save feedback, sample markers, and explanatory copy. Very compact task metadata and secondary hints reach (10–11px) only in the narrowest list or dense desktop band.

## Layout

The desktop shell is a full-height grid: a list rail (240px), a flexible work column, and an optional details column (350px). The workspace uses side padding (40px); the editor uses (26px). The task list has a continuous white container. Each default row has a checkbox track (24px), flexible content, due (87px), and priority (86px), with column gaps (12px), padding (17px), and a minimum height (86px). The header labels share those same metadata edges.

At widths of at least (1550px), content is capped at (1050px), workspace side padding becomes (55px), and details grow to (370px). At (1200px) and below, the rail/details contract to (210px)/(320px); metadata tracks become (64px)/(59px). From (761px) through (1000px), the rail/details are (180px)/(300px), and an open editor places due and priority in one right-hand track (55px), stacked vertically.

At (760px) and below, the rail becomes a compact list selector. The workspace and full-width details view alternate; Back returns to the originating list position. The details panel has its own scrolling content and a stable save-feedback region. Sync stays in a bottom dock in both views. At (390px) and below, workspace side padding is (16px), editor side padding is (20px), and the task metadata tracks are (60px)/(48px). The supported CSS minimum viewport is (320px).

Use the compact spacing steps in frontmatter. Keep section separations comfortable: notes begin after (24px), property groups after (26px), and completed tasks after (26px). Preserve the recurring alignment rather than forcing every measurement onto an invented scale.

**The Metadata Margin Rule.** Align due dates and priority to shared columns across the task list. When width contracts, compress or stack that margin before sacrificing readable task content.

## Elevation & Depth

Depth is mostly tonal: dark navigation, cool ground, white content, light rules, and a pale selected row. Ordinary rows and the editor have no shadow. The synchronization disclosure uses a diffuse ink shadow (`0 10px 38px -8px #173e5338`); Undo uses a smaller transient shadow (`0 7px 25px -5px #173e5340`). The exact shadow and motion values are retained in the sidecar.

**The Quiet Surface Rule.** Keep the rail, working ground, task list, and editor flat. Use soft elevation for the synchronization disclosure and Undo feedback.

## Shapes

Corners are restrained and functional. Checkbox artwork uses the smallest radius; property fields and compact icon controls use the control radius; notes and secondary actions use the field radius; primary actions and navigation use the action radius; list containers and sync disclosures use the container radius. One-pixel borders and row rules carry most boundaries. The selected row adds a one-pixel teal inset outline. There is no decorative clipping or unusual card silhouette.

## Components

### Buttons

Primary actions are compact, teal, white-text controls with a medium emphasis (600). Hover darkens the fill; disabled actions use the muted teal variant and opacity (.85). Secondary actions are white with a quiet border, changing to a pale tint on hover. Text actions are underlined teal; destructive actions use a warm color and a separating rule. Icon controls are transparent squares (30px) with a pale hover fill. General keyboard focus is a teal outline (3px) offset by (3px).

Button color and border transitions last (.14s). The rotating sync disclosure chevron uses (.18s). Motion responds to state rather than ornament; reduced-motion preferences collapse transitions and animations.

### Cards / Containers

The task list is one white container with the container radius, a light border, and separating row rules. It is not a grid of independently elevated cards. Conflict versions are compact cool-ground blocks, with a label/time line, preserved text formatting, and a text action. Sync details is a floating white disclosure with a header rule and bounded scrolling content; it keeps its structural shadow.

### Inputs / Fields

Quick add is a white, lightly bordered line with a vector plus icon and the action radius. Property controls are compact white fields with the control radius and a minimum desktop height (39px); they reach (42px) on narrow screens. Notes use a multiline white field with the field radius and internal padding (11px). Textareas resize vertically. Caret and focus use teal. The editable title has a distinct softer focus outline (2px, `#b3d9d3`) offset by (5px). Inputs have explicit labels; helper copy stays small and adjacent.

### Navigation

Named lists occupy the ink-blue rail. Each item puts its wrapping name on the left and tabular task count on the right. Active items use the lighter rail-blue fill and stronger weight (650); hover uses a related darker blue. Mobile replaces the rail with a native list selector and an add-list control in a white top bar (62px). There is no separate mobile navigation system to learn.

### Task Rows and Metadata Margin

The task title opens details; the checkbox completes or reopens it. Tags are a quiet comma-separated text line below the title. Due and priority stay in their aligned margin tracks. Selection uses a pale wash, teal outline, and stronger selected title color. Hover is a near-white tint; completed titles use strike-through and a muted color (400 weight). Checkbox state and text treatments accompany color changes. Long titles, tags, and metadata wrap instead of forcing horizontal scrolling.

### Persistence Feedback

The editor distinguishes unsaved changes, saving on this machine, successful local save, and a retained draft that needs retry. The always-reachable sync control separately discloses GitHub state and opens synchronization details, repository configuration, and conflict comparison. Keep these status messages precise and modest; local success must remain distinguishable from remote synchronization. Undo is a compact ink-blue transient message with a direct action.

## Do's and Don'ts

### Do:

- **Do** use the same ink-blue, cool ground, white surfaces, and teal state roles on adjacent screens.
- **Do** keep task titles, due dates, and priority aligned to a stable margin grid; let long text wrap.
- **Do** preserve visible focus, readable labels, and a reachable sync disclosure at every supported width.
- **Do** describe local saving and GitHub synchronization as separate states using plain, small helper copy.
- **Do** use the full-width details view with Back at the established narrow-screen breakpoint.

### Don't:

- **Don't** add physical-book ornament to the Margin notes grid.
- **Don't** introduce a separate display face or promotional type treatment into the task workspace.
- **Don't** use shadows to lift ordinary task rows or the editor.
- **Don't** turn the plain-text tag line into decorative chips without an approved system change.
- **Don't** encode selection, completion, errors, or sync outcomes through color alone.
