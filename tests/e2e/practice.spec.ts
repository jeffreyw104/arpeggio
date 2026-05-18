import { test, expect } from "@playwright/test";

test("import a MIDI file and see the practice view", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/midi or musicxml/i)).toBeVisible();
  await page.setInputFiles(
    'input[type="file"]',
    "src/test/fixtures/clean.mid",
  );
  await expect(page.getByRole("button", { name: /play/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("canvas")).toBeVisible();
});

test("switching view modes keeps the panels rendering", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("input[type=\"file\"]", "src/test/fixtures/clean.mid");
  await expect(page.getByRole("button", { name: /play/i })).toBeVisible({
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
