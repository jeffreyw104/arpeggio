import { test, expect } from "@playwright/test";

test("app loads and shows the Arpeggio heading", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /arpeggio/i }),
  ).toBeVisible();
});
