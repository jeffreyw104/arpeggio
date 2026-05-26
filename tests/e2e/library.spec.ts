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

test("opened piece appears in the hero after reload with 'Continue practicing' eyebrow", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });
  // Return to the library landing.
  await page.goto("/");
  // Hero should render with the just-imported piece — import counts as an
  // open via touchPiece in App.tsx, so the eyebrow is "Continue practicing".
  const hero = page.getByTestId("library-hero");
  await expect(hero).toBeVisible({ timeout: 10_000 });
  await expect(hero).toContainText("clean.mid");
  await expect(hero).toContainText(/Continue practicing/i);
});

test("opening an older piece promotes it to the hero", async ({ page }) => {
  await page.goto("/");
  // Import piece A.
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });
  await page.goto("/");
  // Import piece B — it becomes the most-recently-touched, taking the hero slot.
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/performance.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });
  await page.goto("/");
  // performance.mid should now be in the hero; clean.mid as a row.
  await expect(page.getByTestId("library-hero")).toContainText(
    "performance.mid",
  );
  // Click the clean.mid row's name button (it's in the All Other Pieces list).
  const rows = page.getByTestId("lib-row");
  await expect(rows).toHaveCount(1);
  await rows.getByRole("button", { name: "clean.mid", exact: true }).click();
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });
  // Return to library — clean.mid should now be the hero (it was just opened).
  await page.goto("/");
  await expect(page.getByTestId("library-hero")).toContainText("clean.mid");
  await expect(page.getByTestId("library-hero")).toContainText(
    /Continue practicing/i,
  );
});
