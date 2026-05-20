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

test("dragging across the progress bar sets a loop", async ({ page }) => {
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
  if (count < 3) return; // Skip if the fixture is too short to span 3 cells.

  // Drag from the first cell to the third using low-level mouse events so
  // React's onMouseEnter fires on the intermediate cell. A plain dragTo
  // doesn't trip onMouseEnter on cells the pointer crosses through.
  const box0 = await cells.nth(0).boundingBox();
  const box1 = await cells.nth(1).boundingBox();
  const box2 = await cells.nth(2).boundingBox();
  if (!box0 || !box1 || !box2) return;

  await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
  await page.mouse.down();
  await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
  await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
  await page.mouse.up();

  // The three swept cells should all carry the loop class.
  await expect(cells.nth(0)).toHaveClass(/measure-cell--in-loop/);
  await expect(cells.nth(1)).toHaveClass(/measure-cell--in-loop/);
  await expect(cells.nth(2)).toHaveClass(/measure-cell--in-loop/);
});
