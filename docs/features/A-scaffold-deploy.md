# Feature A: Scaffold & Deploy

**Status:** In progress
**Owner:** subagent
**Detailed plan:** docs/superpowers/plans/2026-05-17-feature-a-scaffold-deploy.md

## Scope
Vite + TypeScript + React project setup; dark, modern, minimal theme tokens;
Vitest + Playwright test harnesses; ESLint + Prettier; GitHub Actions CI;
Vercel deploy config; installable PWA (offline, manifest, service worker).
Does NOT cover any app logic — only the foundation other features build on.

## Dependencies
None — this is the foundation.

## Changes log
- 2026-05-17 — Feature defined; detailed plan written.
- 2026-05-17 — Task 1: package.json + dependencies installed.
- 2026-05-17 — Task 2: tsconfig.json, tsconfig.node.json, vite.config.ts added.
- 2026-05-17 — Task 3: React app shell (index.html, main.tsx, App.tsx),
  dark theme tokens, src/vite-env.d.ts added; dev server + production build verified.
- 2026-05-17 — Build-config fix: a referenced composite project cannot disable
  emit (TS6310), so tsconfig.node.json emits to node_modules/.tmp/ (incl.
  .tsbuildinfo files) to keep the repo root clean; typecheck script changed
  from `tsc -b --noEmit` to `tsc -b`. vite.config.ts imports defineConfig from
  `vitest/config` so the `test` field type-checks.

## Keywords
vite.config.ts, vitest.config.ts, playwright.config.ts, vercel.json,
.github/workflows/ci.yml, public/manifest.webmanifest, vite-plugin-pwa,
src/main.tsx, src/App.tsx, src/styles/theme.css.

## Testing
- Smoke test: App renders without crashing.
- CI verifies lint, typecheck, and Vitest pass.
- Manual checklist: dev server runs; production build serves; PWA install prompt
  appears; app loads offline after first visit.
- Current status: not started.
