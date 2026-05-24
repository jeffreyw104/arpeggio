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
  // button is pressed again. Use the time display: it's a non-interactive span
  // in the top bar (the logo wordmark is now the Library button).
  await page.locator(".hud-time").click();
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
  // View-mode buttons (Score only / Both / Falldown only) are only shown for
  // non-MIDI-source files, so we load a MusicXML fixture here.
  await page.goto("/");
  await page.setInputFiles("input[type=\"file\"]", "src/test/fixtures/simple.musicxml");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });

  // The View pill opens a dropdown; pick options via menuitem.
  const viewPill = page.getByRole("button", { name: /^View:/ });

  // Score-only: the falldown canvas is hidden, the score panel stays visible.
  await viewPill.click();
  await page.getByRole("menuitem", { name: "Score only" }).click();
  await expect(page.locator("canvas")).toBeHidden();

  // Back to Both: the same canvas must render again (it was never unmounted).
  await viewPill.click();
  await page.getByRole("menuitem", { name: "Both" }).click();
  await expect(page.locator("canvas")).toBeVisible();

  // Falldown-only: the canvas is still there and visible.
  await viewPill.click();
  await page.getByRole("menuitem", { name: "Falldown only" }).click();
  await expect(page.locator("canvas")).toBeVisible();

  // And once more back to Both — no blank panels.
  await viewPill.click();
  await page.getByRole("menuitem", { name: "Both" }).click();
  await expect(page.locator("canvas")).toBeVisible();
});

test("MIDI Practice tab: layout toggles between reading-lane and split", async ({
  page,
}) => {
  // Reading-lane / Split layout controls are only shown for non-MIDI-source
  // files (isMidiSource hides those top-bar buttons), so we use MusicXML.
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/simple.musicxml");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });

  // Switch to the MIDI Practice tab — the reading-lane layout is the default.
  // Mode is now a pill+menu; the pill shows the current mode, opens a dropdown.
  const modePill = page.locator("button[aria-haspopup='menu']").filter({ hasText: /^(Play|MIDI Practice)$/ });
  await modePill.click();
  await page.getByRole("menuitem", { name: "MIDI Practice" }).click();

  // The Layout pill shows "Layout: Reading lane" by default.
  const layoutPill = page.getByRole("button", { name: /^Layout:/ });
  await expect(layoutPill).toContainText("Reading lane");

  // The score panel and the falldown canvas are both present in lane layout.
  await expect(page.locator("[data-testid='reading-lane']")).toBeVisible();
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible();

  // Switch to the split layout via the Layout pill menu.
  await layoutPill.click();
  await page.getByRole("menuitem", { name: "Split" }).click();
  await expect(layoutPill).toContainText("Split");
  // The canvas must still be the same element — never remounted.
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible();

  // Back to the reading-lane layout.
  await layoutPill.click();
  await page.getByRole("menuitem", { name: "Reading lane" }).click();
  await expect(layoutPill).toContainText("Reading lane");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible();

  // Switching back to the Play tab keeps the canvas visible (not remounted).
  await modePill.click();
  await page.getByRole("menuitem", { name: "Play" }).click();
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

  // Switch to the MIDI Practice tab via the mode pill+menu.
  const modePill = page.locator("button[aria-haspopup='menu']").filter({ hasText: /^(Play|MIDI Practice)$/ });
  await modePill.click();
  await page.getByRole("menuitem", { name: "MIDI Practice" }).click();

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

  // "Wait for me" checkbox and hand buttons have moved to the top-bar wait
  // pill (Tasks 11–12). Verify they are NOT in the Tools popover.
  await expect(
    page.getByRole("checkbox", { name: /wait for me/i }),
  ).toBeHidden();
  await expect(page.getByRole("button", { name: /^left$/i })).toBeHidden();
  await expect(page.getByRole("button", { name: /^right$/i })).toBeHidden();

  // The wait pill is in the top bar instead.
  const waitPill = page.locator(".top-bar-wait-pill");
  await expect(waitPill).toBeVisible();

  // "Input sound" is now inside the General settings accordion section.
  await expect(
    page.getByRole("checkbox", { name: /input sound/i }),
  ).toBeVisible();

  // The MIDI status line shows the computer-keyboard fallback message
  // (Web MIDI unavailable in Playwright).
  const statusLine = page.locator(".midi-status-line");
  await expect(statusLine).toBeVisible();
  await expect(statusLine).toContainText(/computer keyboard/i);
});

test("playback does not carry over between the Play and Practice tabs", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });

  const time = page.locator(".top-bar .hud-time");
  const playBtn = page.locator(".top-bar .hud-play-btn");

  // Play on the Play tab for a moment, then pause.
  await playBtn.evaluate((el: HTMLButtonElement) => el.click());
  await page.waitForTimeout(1200);
  await playBtn.evaluate((el: HTMLButtonElement) => el.click());
  // Ensure the clock visibly advanced past 0:00 before snapshotting the time,
  // so the comparison below is independent of wall-clock precision. Playwright's
  // auto-retry absorbs scheduling jitter on slow machines.
  await expect(time).not.toHaveText("0:00");
  const playTabTime = await time.textContent();

  // Switch to MIDI Practice — its playhead is independent of the Play tab.
  // Mode is now a pill+menu; the pill label shows the current mode.
  const modePill = page.locator("button[aria-haspopup='menu']").filter({ hasText: /^(Play|MIDI Practice)$/ });
  await modePill.click();
  await page.getByRole("menuitem", { name: "MIDI Practice" }).click();
  await expect(time).not.toHaveText(playTabTime ?? "");

  // Switch back to Play — its playhead is restored where it was left.
  await modePill.click();
  await page.getByRole("menuitem", { name: "Play" }).click();
  await expect(time).toHaveText(playTabTime ?? "");
});

test("MIDI Practice tab: Tools popover includes the shared Loop, Tempo, and Metronome sections", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });

  // Switch to the MIDI Practice tab and open the Tools popover.
  // Mode is now a pill+menu.
  const modePill = page.locator("button[aria-haspopup='menu']").filter({ hasText: /^(Play|MIDI Practice)$/ });
  await modePill.click();
  await page.getByRole("menuitem", { name: "MIDI Practice" }).click();
  await page
    .locator(".top-bar")
    .getByRole("button", { name: "Tools" })
    .click();
  await expect(page.getByRole("dialog", { name: "Tools" })).toBeVisible();

  // "Wait for me" has moved to the top-bar wait pill (Task 11).
  // The MIDI device select confirms we're in the MIDI section.
  await expect(
    page.getByRole("combobox", { name: /midi device/i }),
  ).toBeVisible();

  // The Practice popover still has the sections shared with the Play tab.
  await expect(
    page.getByRole("button", { name: "Loop", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tempo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Metronome", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "General settings" }),
  ).toBeVisible();
});
