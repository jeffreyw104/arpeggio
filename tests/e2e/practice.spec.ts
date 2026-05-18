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
  const playBtn = page.getByLabel("Play");

  const snapshot = () =>
    canvas.evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      return [...ctx.getImageData(0, 0, c.width, c.height).data].join(",");
    });

  await playBtn.click();
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

test("switching to Practice mode reveals the extended control bar", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });

  // Play mode: the speed stepper is present, the loop controls are not.
  await expect(
    page.getByRole("button", { name: /increase speed/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /loop measure/i })).toHaveCount(0);

  // Switch to Practice — the extended bar and metronome checkbox appear.
  await page.locator(".top-bar-modes").getByRole("button", { name: "Practice" }).click();
  await expect(
    page.getByRole("button", { name: /loop measure/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /metronome/i }),
  ).toBeVisible();

  // Collapse the extended bar — the loop controls hide.
  await page.getByRole("button", { name: /collapse control bar/i }).click();
  await expect(page.getByRole("button", { name: /loop measure/i })).toHaveCount(0);

  // Back to Play — the speed stepper is back.
  await page.locator(".top-bar-modes").getByRole("button", { name: "Play" }).click();
  await expect(
    page.getByRole("button", { name: /increase speed/i }),
  ).toBeVisible();
});

test("arrow keys jump the playhead by measure", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });
  const time = page.locator(".floating-hud > span").first();
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
