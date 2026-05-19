import { test, expect } from "@playwright/test";

test("import a MIDI file and see the practice view", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/midi or musicxml/i)).toBeVisible();
  await page.setInputFiles(
    'input[type="file"]',
    "src/test/fixtures/clean.mid",
  );
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("canvas")).toBeVisible();
});

test("pressing Play animates the falldown canvas", async ({ page }) => {
  // Regression: a throw from a per-frame consumer (e.g. the audio backend
  // before its CDN samples load) used to abort the rAF callback and freeze
  // the whole FrameLoop — falldown included. Exercising Play in a real
  // browser is the only thing that surfaces this; unit/e2e that never press
  // Play do not run the frame loop's consumer chain under load.
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.stack ?? e)));

  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  const canvas = page.locator("canvas.falldown-canvas");
  await canvas.waitFor({ state: "visible", timeout: 15_000 });
  // Scope to the transport play button in the top bar (the accent circle).
  const playBtn = page.locator(".top-bar .hud-play-btn");

  const snapshot = () =>
    canvas.evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      return [...ctx.getImageData(0, 0, c.width, c.height).data].join(",");
    });

  // Click via JS to avoid the z-index overlay from the always-visible accordion bar.
  await playBtn.evaluate((el: HTMLButtonElement) => el.click());
  const before = await snapshot();
  await page.waitForTimeout(1500);
  const after = await snapshot();

  expect(pageErrors, "no uncaught errors should escape the frame loop").toEqual(
    [],
  );
  expect(after, "falldown canvas must keep animating while playing").not.toBe(
    before,
  );
});

test("the Tools popover opens and exposes loop controls", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });

  // The Tools button is always visible in the top bar.
  const toolsBtn = page.getByRole("button", { name: "Tools" });
  await expect(toolsBtn).toBeVisible();

  // Before opening, the popover is not present.
  await expect(page.getByRole("dialog", { name: "Tools" })).toBeHidden();

  // Open the popover.
  await toolsBtn.click();
  await expect(page.getByRole("dialog", { name: "Tools" })).toBeVisible();

  // The Loop chip is visible inside the popover.
  const loopChip = page.getByRole("button", { name: "Loop", exact: true });
  await expect(loopChip).toBeVisible();

  // Sections start open, so the Loop controls are visible without a click.
  await expect(loopChip).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: /loop measure/i }),
  ).toBeVisible();

  // Clicking elsewhere does not close the popover — it floats until the Tools
  // button is pressed again.
  await page.locator(".top-bar-logo").click();
  await expect(page.getByRole("dialog", { name: "Tools" })).toBeVisible();

  // Re-pressing the Tools button closes it.
  await toolsBtn.click();
  await expect(page.getByRole("dialog", { name: "Tools" })).toBeHidden();
});

test("arrow keys jump the playhead by measure", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });
  const time = page.locator(".top-bar .hud-time");
  const before = await time.textContent();
  await page.locator("body").press("ArrowRight");
  await expect(time).not.toHaveText(before ?? "");
});

test("switching view modes keeps the panels rendering", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("input[type=\"file\"]", "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });

  // Score-only: the falldown canvas is hidden, the score panel stays visible.
  await page.getByRole("button", { name: /score only/i }).click();
  await expect(page.locator("canvas")).toBeHidden();

  // Back to Both: the same canvas must render again (it was never unmounted).
  await page.getByRole("button", { name: /^both$/i }).click();
  await expect(page.locator("canvas")).toBeVisible();

  // Falldown-only: the canvas is still there and visible.
  await page.getByRole("button", { name: /falldown only/i }).click();
  await expect(page.locator("canvas")).toBeVisible();

  // And once more back to Both — no blank panels.
  await page.getByRole("button", { name: /^both$/i }).click();
  await expect(page.locator("canvas")).toBeVisible();
});

test("MIDI Practice tab: reading lane is visible and can be toggled", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });

  // Switch to the MIDI Practice tab.
  await page.getByRole("button", { name: "MIDI Practice" }).click();

  // The reading-lane strip should be present (not collapsed by default).
  const readingLane = page.locator("[data-testid='reading-lane']");
  await expect(readingLane).toBeVisible();

  // The in-lane collapse toggle button is visible when expanded.
  const collapseBtn = page.getByRole("button", {
    name: /collapse reading lane/i,
  });
  await expect(collapseBtn).toBeVisible();
  await expect(collapseBtn).toHaveAttribute("aria-expanded", "true");

  // Collapse via the in-lane toggle.
  await collapseBtn.click();

  // After collapsing, the in-lane toggle is not rendered (it would be clipped
  // by overflow:hidden on the collapsed lane). The TopBar "Reading lane" toggle
  // is the only control for re-expanding — verify it shows the lane is collapsed.
  const topBarToggle = page.locator(".top-bar").getByRole("button", {
    name: /reading lane/i,
  });
  await expect(topBarToggle).toHaveAttribute("aria-pressed", "false");

  // The falldown canvas must still be present and visible.
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible();

  // Expand via the TopBar "Reading lane" button (always accessible in the bar).
  await topBarToggle.click();
  await expect(
    page.getByRole("button", { name: /collapse reading lane/i }),
  ).toHaveAttribute("aria-expanded", "true");

  // Switch back to Play tab — canvas must still be visible (not remounted).
  // Use the ModeSwitch's Play button (has aria-pressed attribute).
  await page.locator(".top-bar-modes").getByRole("button", { name: "Play" }).click();
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible();
});

test("MIDI Practice tab: Tools popover exposes MIDI controls and status chip shows disconnected state", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });

  // Switch to the MIDI Practice tab.
  await page.getByRole("button", { name: "MIDI Practice" }).click();

  // The status chip must appear in the top bar.
  // Web MIDI is unavailable in Playwright → status is "unsupported" or "no-device"
  // → chip shows the disconnected (○) state.
  const chip = page.locator(".midi-status-chip");
  await expect(chip).toBeVisible();
  // Disconnected states all show "Connect keyboard" text.
  await expect(chip).toContainText("Connect keyboard");

  // Open the Tools popover.
  const toolsBtn = page.locator(".top-bar").getByRole("button", { name: "Tools" });
  await toolsBtn.click();
  await expect(page.getByRole("dialog", { name: "Tools" })).toBeVisible();

  // Device select is present (shows "No device" when no MIDI hardware).
  const deviceSelect = page.getByRole("combobox", { name: /midi device/i });
  await expect(deviceSelect).toBeVisible();

  // "Wait for me" and "Input sound" checkboxes are present.
  await expect(
    page.getByRole("checkbox", { name: /wait for me/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /input sound/i }),
  ).toBeVisible();

  // Left / Right / Both hand buttons are present.
  await expect(page.getByRole("button", { name: /^left$/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^right$/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^both$/i })).toBeVisible();

  // The MIDI status line shows the computer-keyboard fallback message
  // (Web MIDI unavailable in Playwright).
  const statusLine = page.locator(".midi-status-line");
  await expect(statusLine).toBeVisible();
  await expect(statusLine).toContainText(/computer keyboard/i);
});
