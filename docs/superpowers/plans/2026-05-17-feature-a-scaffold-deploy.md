# Feature A — Scaffold & Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Arpeggio project foundation — Vite + TypeScript + React, test harnesses, linting, CI, Vercel deploy, and an installable PWA — so every later feature has a working base.

**Architecture:** A static client-side single-page app. Config files are written explicitly (no interactive `npm create` scaffolding, since the repo already contains `docs/`). React renders the shell; later features add the engines.

**Tech Stack:** Vite, TypeScript, React 19, Vitest + React Testing Library, Playwright, ESLint + Prettier, `vite-plugin-pwa`, GitHub Actions, Vercel.

**Branch:** `feature/a-scaffold-deploy`

---

## Notes for the implementer

- The repo root is `~/Desktop/arpeggio` and already contains `docs/`, `.gitignore`, `implementation.md`. Do not delete them.
- Run all commands from the repo root.
- `node` ≥ 20 is required. Verify with `node --version` before starting.
- After each task's commit, update `docs/features/A-scaffold-deploy.md` changes log if the task changed scope.

---

## Task 1: package.json and dependencies

**Files:**

- Create: `package.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "arpeggio",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  }
}
```

- [ ] **Step 2: Install runtime dependencies**

Run:

```bash
npm install react react-dom
```

Expected: packages added under `dependencies`, `node_modules/` created.

- [ ] **Step 3: Install dev dependencies**

Run:

```bash
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom \
  vitest @testing-library/react @testing-library/jest-dom jsdom \
  @playwright/test eslint prettier vite-plugin-pwa
```

Expected: all packages added under `devDependencies`.

- [ ] **Step 4: Verify install**

Run: `npx vite --version`
Expected: prints a Vite version number, no error.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add package.json and dependencies"
```

---

## Task 2: TypeScript and Vite configuration

**Files:**

- Create: `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 2: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts", "playwright.config.ts"]
}
```

(`playwright.config.ts` is added in Task 6; until then `vite.config.ts` is the
only input, which is enough for the build to succeed.)

- [ ] **Step 3: Create `vite.config.ts`** (PWA plugin added in Task 7)

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json tsconfig.node.json vite.config.ts
git commit -m "chore: add TypeScript and Vite config"
```

These config files cannot be verified standalone (no source files exist yet) —
they are exercised by `npm run build` in Task 3, Step 6.

---

## Task 3: App shell, entry point, and theme

**Files:**

- Create: `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/theme.css`

- [ ] **Step 1: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Arpeggio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/styles/theme.css`** (dark, modern, minimal tokens)

```css
:root {
  --bg: #15151a;
  --panel: #1c1c22;
  --border: #34343c;
  --text: #e6e6ea;
  --text-dim: #9a9aa6;
  --accent: #4a8;
  --hand-right: #4a90d9;
  --hand-left: #e08a3c;
  --font: system-ui, -apple-system, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
  margin: 0;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
}
```

- [ ] **Step 3: Create `src/App.tsx`**

```tsx
export default function App() {
  return (
    <main>
      <h1>Arpeggio</h1>
      <p>Piano practice tool — scaffold ready.</p>
    </main>
  );
}
```

- [ ] **Step 4: Create `src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/theme.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 5: Verify the dev server runs**

Run: `npm run dev` (then stop it with Ctrl+C)
Expected: Vite prints a `localhost` URL and "ready" with no errors.

- [ ] **Step 6: Verify the production build**

Run: `npm run build`
Expected: `tsc -b` passes, Vite writes `dist/` with no errors.

- [ ] **Step 7: Commit**

```bash
git add index.html src/main.tsx src/App.tsx src/styles/theme.css
git commit -m "feat: add React app shell and dark theme tokens"
```

---

## Task 4: Vitest setup and App smoke test

**Files:**

- Create: `src/test/setup.ts`, `src/App.test.tsx`

- [ ] **Step 1: Create `src/test/setup.ts`**

```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 2: Write the failing test — `src/App.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

test("App renders the Arpeggio heading", () => {
  render(<App />);
  expect(
    screen.getByRole("heading", { name: /arpeggio/i }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — `App.test.tsx` 1 passed. (App from Task 3 already renders the
heading; this test pins that behavior and proves the Vitest harness works.)

- [ ] **Step 4: Verify the harness fails correctly**

Temporarily change the test's expected name to `/nonexistent/i`, run `npm test`,
confirm it FAILS, then revert the change and confirm it PASSES again.

- [ ] **Step 5: Commit**

```bash
git add src/test/setup.ts src/App.test.tsx
git commit -m "test: add Vitest harness and App smoke test"
```

---

## Task 5: ESLint and Prettier

**Files:**

- Create: `eslint.config.js`, `.prettierrc`, `.prettierignore`

- [ ] **Step 1: Install ESLint plugins**

Run:

```bash
npm install -D @eslint/js typescript-eslint eslint-plugin-react-hooks \
  eslint-plugin-react-refresh globals
```

- [ ] **Step 2: Create `eslint.config.js`**

```js
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "playwright-report", "dev-dist"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "warn",
    },
  },
);
```

- [ ] **Step 3: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all"
}
```

- [ ] **Step 4: Create `.prettierignore`**

```
dist
dev-dist
node_modules
playwright-report
package-lock.json
```

- [ ] **Step 5: Verify lint passes**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Verify formatting**

Run: `npm run format`
Expected: Prettier reports files formatted, no errors.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js .prettierrc .prettierignore package.json package-lock.json
git commit -m "chore: add ESLint and Prettier config"
```

---

## Task 6: Playwright end-to-end harness

**Files:**

- Create: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Install Playwright browsers**

Run: `npx playwright install chromium`
Expected: Chromium downloaded.

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:4173" },
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Write the failing test — `tests/e2e/smoke.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("app loads and shows the Arpeggio heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /arpeggio/i })).toBeVisible();
});
```

- [ ] **Step 4: Run the e2e test**

Run: `npm run e2e`
Expected: PASS — Playwright builds, previews, and the heading is visible.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/smoke.spec.ts
git commit -m "test: add Playwright e2e harness and smoke test"
```

---

## Task 7: Installable PWA

**Files:**

- Modify: `vite.config.ts`
- Create: `public/icons/icon.svg`

- [ ] **Step 1: Create the app icon — `public/icons/icon.svg`**

A single scalable SVG avoids binary-image generation and is valid for PWA
installability in modern browsers. Write exactly:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#15151a"/>
  <text x="256" y="368" font-family="system-ui, sans-serif" font-size="340"
        font-weight="700" fill="#44aa88" text-anchor="middle">A</text>
</svg>
```

It can be replaced with a richer icon later (a backlog polish item).

- [ ] **Step 2: Update `vite.config.ts` to add the PWA plugin**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon.svg"],
      manifest: {
        name: "Arpeggio",
        short_name: "Arpeggio",
        description:
          "Piano practice tool — falldown notes and interactive sheet music.",
        theme_color: "#15151a",
        background_color: "#15151a",
        display: "standalone",
        icons: [
          {
            src: "icons/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
```

- [ ] **Step 3: Add `dev-dist` to `.gitignore`**

Append `dev-dist/` to `.gitignore` (the PWA plugin's dev output directory).

- [ ] **Step 4: Verify the PWA build**

Run: `npm run build`
Expected: build succeeds; `dist/` now contains `manifest.webmanifest` and a
service worker file (`sw.js`).

- [ ] **Step 5: Verify install + offline manually**

Run `npm run preview`, open the URL in Chrome. Confirm: (a) an install icon
appears in the address bar; (b) after one load, toggling DevTools → Network →
Offline and reloading still shows the app. Record the result in
`docs/features/A-scaffold-deploy.md` testing checklist.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts .gitignore public/icons/icon.svg
git commit -m "feat: add installable PWA support"
```

---

## Task 8: GitHub Actions CI

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Verify the workflow locally**

Run each CI command in order and confirm all pass:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all four succeed.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions lint/typecheck/test/build workflow"
```

---

## Task 9: Vercel deploy configuration

**Files:**

- Create: `vercel.json`

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

The SPA rewrite ensures deep links resolve to the app. Vercel auto-detects Vite,
but this pins the build explicitly.

- [ ] **Step 2: Verify the build command matches**

Run: `npm run build`
Expected: `dist/` produced — confirms `vercel.json` points at the right output.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore: add Vercel deploy configuration"
```

- [ ] **Step 4: Connect the repo to Vercel (manual, one-time — owner action)**

This step is performed by the project owner, not the agent: push the branch to
GitHub, then in the Vercel dashboard "Add New Project" → import the `arpeggio`
repo. Vercel will auto-deploy every push and give each branch a preview URL.
Record the production URL in `docs/features/A-scaffold-deploy.md`.

---

## Feature A — Definition of Done

- `npm run dev`, `npm run build`, `npm run preview` all work.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run e2e` all pass.
- CI workflow runs green on push.
- Production build emits a PWA manifest + service worker; app installs and loads
  offline.
- `vercel.json` present; repo importable to Vercel.
- `docs/features/A-scaffold-deploy.md` updated: status Done, testing checklist
  filled, production URL recorded.
