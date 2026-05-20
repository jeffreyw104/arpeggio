import { test, expect } from "@playwright/test";

test("MIDI imports show the piano-roll lane, not the engraved one", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles(
    'input[type="file"]',
    "src/test/fixtures/clean.mid",
  );
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });

  // Switch to the MIDI Practice tab — the ModeSwitch button is labelled "MIDI Practice".
  await page.getByRole("button", { name: "MIDI Practice" }).click();

  // The piano-roll lane becomes visible (CSS reveals it in midi-roll + layout-lane).
  await expect(page.getByTestId("piano-roll-lane")).toBeVisible({
    timeout: 5_000,
  });

  // The engraved reading-lane panel is hidden in the piano-roll layout.
  await expect(page.getByTestId("reading-lane")).toBeHidden();
});

test("clicking a measure on the progress bar lights it as current", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles(
    'input[type="file"]',
    "src/test/fixtures/clean.mid",
  );
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });

  const bar = page.getByTestId("measure-progress-bar");
  await expect(bar).toBeVisible();

  const cells = bar.locator(".measure-cell");
  const count = await cells.count();

  // The clean fixture has multiple measures; first cell starts as current (t=0).
  // Click the second cell and assert it becomes current.
  if (count >= 2) {
    await cells.nth(1).click();
    await expect(cells.nth(1)).toHaveClass(/measure-cell--current/);
  }
});
