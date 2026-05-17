import { test, expect } from "@playwright/test";

test("app loads and shows the import screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/midi or musicxml/i)).toBeVisible();
});
