# Feature G: Layout & View Modes

**Status:** Not started
**Owner:** subagent
**Detailed plan:** _(write before build)_

## Scope
Side-by-side layout (falldown+piano column left, score panel right); resizable
divider with a piano-favoring default split; view toggle Both / Falldown-only /
Score-only with single-view modes expanding to full width.

## Dependencies
E (Falldown View), F (Score View).

## Changes log
- 2026-05-17 — Feature defined.

## Keywords
src/layout/Layout.tsx, src/layout/Divider.tsx, src/layout/viewMode.ts,
resizable divider, view modes.

## Testing
- Component: view-mode state transitions; divider resize updates split.
- Manual checklist: piano stays aligned under falldown at all splits; toggle
  modes; divider drag persists per session.
- Current status: not started.
