import { test, expect } from "@playwright/test";

test("imported pieces appear in the library after reload", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });
  // Reload — the piece should now be listed in the library on the landing.
  await page.goto("/");
  await expect(page.getByText("clean.mid")).toBeVisible({ timeout: 10_000 });
});
