# Feature A: Scaffold & Deploy

**Status:** Not started
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
