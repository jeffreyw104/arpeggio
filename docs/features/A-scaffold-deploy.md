# Feature A: Scaffold & Deploy

**Status:** Done
**Owner:** subagent
**Detailed plan:** docs/superpowers/plans/2026-05-17-feature-a-scaffold-deploy.md
**Production URL:** https://arpeggio-piano.vercel.app/

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
- 2026-05-17 — Task 4: Vitest setup (src/test/setup.ts) and App smoke test.
- 2026-05-17 — Task 5: ESLint flat config + Prettier; repo formatting normalized.
- 2026-05-17 — Task 6: Playwright e2e harness and smoke test; added @types/node
  (tsconfig.node.json checks playwright.config.ts which uses process.env).
- 2026-05-17 — Task 7: installable PWA via vite-plugin-pwa; public/icons/icon.svg;
  build emits manifest.webmanifest + service worker.
- 2026-05-17 — Task 8: GitHub Actions CI (lint/typecheck/test/build).
- 2026-05-17 — Task 9: vercel.json deploy config. Feature A complete.
- 2026-05-25 — PWA polish for iPad: `apple-mobile-web-app-capable`,
  `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`, and
  `viewport-fit=cover` added to `index.html`. Generated
  `public/icons/apple-touch-icon.png` (180×180) from the existing SVG.
  Safe-area-inset CSS rules added under `.app--touch` for the TopBar
  and practice-content padding (env(safe-area-inset-*)).

## Keywords

vite.config.ts (Vitest config + VitePWA), tsconfig.json, tsconfig.node.json,
playwright.config.ts, vercel.json, eslint.config.js, .prettierrc,
.github/workflows/ci.yml, vite-plugin-pwa, public/icons/icon.svg,
src/main.tsx, src/App.tsx, src/styles/theme.css, src/test/setup.ts,
tests/e2e/smoke.spec.ts.

## Testing

- `src/App.test.tsx` — Vitest unit smoke test: App renders the Arpeggio heading.
- `tests/e2e/smoke.spec.ts` — Playwright e2e: app loads, heading visible.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, Vitest, build on push/PR.
  Note: e2e is run locally, not in CI (Playwright browser binaries) — per plan.

Automated pass/fail (verified 2026-05-17):

- [x] `npm run lint` — passes
- [x] `npm run typecheck` — passes
- [x] `npm test` — 1/1 passing
- [x] `npm run build` — passes; `dist/` includes `manifest.webmanifest` + `sw.js`
- [x] `npm run e2e` — 1/1 passing

Manual checklist (needs a human with Chrome DevTools):

- [x] `npm run dev` starts and serves the app
- [x] `npm run preview` serves the production build; `manifest.webmanifest` + `sw.js` reachable
- [ ] PWA install icon appears in the browser address bar
- [ ] App loads offline after one visit (DevTools → Network → Offline → reload)

Deployment:

- [x] GitHub repo connected to Vercel; auto-deploys on push to `main`, preview
      URL per branch/PR.
- [x] Production URL live: https://arpeggio-piano.vercel.app/ (verified HTTP 200,
      serves the app and `manifest.webmanifest`).
