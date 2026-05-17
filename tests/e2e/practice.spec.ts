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
