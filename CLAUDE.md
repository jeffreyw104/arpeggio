# Claude Code working notes for arpeggio

## Feature docs are part of the contract

`docs/features/` is the canonical map of what this app does. There's one
`<letter>-<feature>.md` per feature (see existing `A` through `J`) with a
**Scope**, **Dependencies**, **Changes log**, **Keywords**, **Testing**, and
**Manual checklist** section.

Whenever you change anything under `src/`, before you commit or push:

1. **Touched an existing feature?** Append a dated bullet to that feature's
   `## Changes log`. Update Keywords / Testing / Manual checklist if those
   sections drifted.
2. **Introduced a new feature?** Create `docs/features/<next-letter>-<slug>.md`
   following the format used by `J-midi-section-navigator.md` (the most
   recent template).
3. **Pure refactor / test-only / typo / chore?** No doc update needed.

A PreToolUse hook in `.claude/settings.json` runs
`scripts/check-feature-docs.sh` before any `git commit` or `git push` and
prints a non-blocking reminder to stderr if `src/` changed without a
corresponding `docs/features/` change. The reminder is a prompt, not a
gate — judgement still applies.

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
