# Left Column Redesign Plan

Date: February 7, 2026  
Scope: `packages/client/src/components/LeftSidebar/*`, `packages/client/src/hooks/*`, layout wiring in `MainLayout` + pages.

## Goal

Replace the static left sidebar with a working operator column that combines:

1. Sticky identity/header
2. Live activity timeline from chat/tool events
3. Actionable task panel (agent-suggested + user-authored tasks)

## Current Status

### Completed

- `useTaskList` with localStorage persistence (`bibboy-tasks`)
- `useActivityLog` grouped activity model wired from chat/tool state
- `LeftSidebar` desktop + `MobileActivityPanel` integration in `MainLayout`
- Left sidebar context wiring from `HomePage` and `PlaygroundPage`
- Task status cycle (`pending -> in-progress -> done`), accept/dismiss/delete flows

### Newly Implemented In This Pass

- User task creation from sidebar task panel (`+ Add` inline input)
- `LeftSidebarData` contract now includes `onAddTask`
- `HomePage` and `PlaygroundPage` now pass `taskList.addTask` into sidebar data
- Desktop left sidebar now integrates `useResizablePanel` for task-zone drag resizing
- Activity/task sections now support zone-aware sizing via configurable max-height classes
- Activity logs are now collapsible per query, with newest query auto-expanded on new user message
- Removed section-level collapsible wrappers from Activity/Tasks to reduce nested collapse UX
- Mobile panel now uses explicit activity/task zones (without drag) for desktop-parity behavior
- Added focused unit coverage for Activity/Task section collapse and auto-focus behavior

### Remaining Gaps

- Desktop/mobile visual rhythm can be tightened for clearer three-zone separation

## Incremental Implementation Roadmap

### Phase 1: Task UX Baseline (Complete)

- [x] Persisted task model (`useTaskList`)
- [x] Task status/actions (accept/dismiss/delete)
- [x] Manual task creation in sidebar
- [x] Auto-ingest `task_suggest` tool outputs into `useTaskList`

### Phase 2: Three-Zone Layout Fidelity

- [x] Promote sticky header + activity + task panel into explicit fixed zones
- [x] Integrate `useResizablePanel` for desktop task panel resize/collapse
- [x] Keep mobile panel behavior functionally equivalent without desktop drag affordance

### Phase 3: Activity Log Polish

- [ ] Preserve richer tool/action lifecycle details across response boundaries
- [x] Improve activity grouping affordances (active badge, latest-group default-open, compact previews)
- [ ] Align action detail rendering with current tool payload shapes

### Phase 4: Cleanup + Hardening

- [ ] Remove dead/unneeded sidebar variants after migration is complete
- [x] Add/update focused tests for task entry + sidebar wiring behaviors
- [ ] Final pass on accessibility labels/keyboard interactions

## Verification Checklist

Run after each incremental slice:

```bash
bunx oxlint --fix packages/client/src/components/LeftSidebar packages/client/src/pages/HomePage.tsx packages/client/src/pages/PlaygroundPage.tsx
bunx oxfmt packages/client/src/components/LeftSidebar packages/client/src/pages/HomePage.tsx packages/client/src/pages/PlaygroundPage.tsx
bun run lint
bun run test
bun run build
```

## Notes

- Follow existing visual language in this repo (monospace labels, muted grayscale + blue accent).
- Keep changes incremental and reviewable; avoid large one-shot rewrites.
- Prefer shared hook/data-contract changes over page-specific duplication.
