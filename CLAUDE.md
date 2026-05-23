# Claude Code working notes for arpeggio

## Feature docs are part of the contract

`docs/features/` is the canonical map of what this app does — one
`<letter>-<feature>.md` per feature (`A` through `J` today) with **Scope**,
**Dependencies**, **Changes log**, **Keywords**, **Testing**, and **Manual
checklist** sections.

**Before every commit or push, self-check:** did this work touch `src/`?
If yes, ask yourself:

1. **Did I extend an existing feature?** Append a dated bullet to that
   feature's `## Changes log`. Update Keywords / Testing / Manual checklist
   if those sections drifted.
2. **Did I introduce a new feature?** Create
   `docs/features/<next-letter>-<slug>.md` following the format used by
   `J-midi-section-navigator.md` (the most recent template).
3. **Pure refactor / test-only / typo / chore?** Skip — no doc update needed.

This is a self-check, not an external gate. Run it at the same point you
run the verify gate. If you'd be embarrassed for a teammate to read the
diff and ask "where's the doc update?", update the doc first.

## Verify gate

Before claiming work is done:

```
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

## Other context

- `HANDOVER.md` is the human-facing handover doc (architecture overview,
  known issues). Keep it accurate when shipping anything user-visible.
- `implementation.md` is the master plan/dashboard.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` hold per-feature
  design specs and bite-sized implementation plans.
