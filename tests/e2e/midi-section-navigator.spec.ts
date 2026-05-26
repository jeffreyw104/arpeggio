import { test, expect } from "@playwright/test";

const MIDI_FIXTURE = "src/test/fixtures/clean.mid";
const XML_FIXTURE = "src/test/fixtures/simple.musicxml";

test.describe("MIDI section navigator", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Clear stored library + practice state to start clean each test.
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases?.();
      for (const d of dbs ?? []) if (d.name) indexedDB.deleteDatabase(d.name);
      localStorage.clear();
    });
    await page.reload();
  });

  test("strip appears for MIDI uploads, engraved score is hidden", async ({
    page,
  }) => {
    await page.setInputFiles('input[type="file"]', MIDI_FIXTURE);
    await expect(page.locator(".section-strip")).toBeVisible({
      timeout: 15_000,
    });
    // Score and reading-lane panels are hidden via CSS for MIDI-source files.
    await expect(page.locator(".practice-score-panel")).toBeHidden();
    await expect(page.locator(".practice-lane-panel")).toBeHidden();
    // The slim scrubber input is absent for MIDI sources (TopBar renders it
    // only when isMidiSource is false).
    await expect(page.locator(".hud-scrubber")).toHaveCount(0);
  });

  test("clicking a section block seeks the transport", async ({ page }) => {
    await page.setInputFiles('input[type="file"]', MIDI_FIXTURE);
    await expect(page.locator(".section-strip__block").first()).toBeVisible({
      timeout: 15_000,
    });
    const blocks = page.locator(".section-strip__block");
    const blockCount = await blocks.count();
    if (blockCount >= 2) {
      // Click the second block so we seek to a position > 0.
      await blocks.nth(1).click();
      // After click, the playhead should be at the second section's start (>0%).
      const left = await page
        .locator(".section-strip__playhead")
        .evaluate((el: HTMLElement) => el.style.left);
      expect(left).not.toBe("0%");
    }
  });

  test("renaming a section persists across reload", async ({ page }) => {
    await page.setInputFiles('input[type="file"]', MIDI_FIXTURE);
    const firstBlock = page.locator(".section-strip__block").first();
    await expect(firstBlock).toBeVisible({ timeout: 15_000 });
    // Renaming is triggered via the right-click context menu (dblclick on a
    // section block now creates a bookmark instead).
    await firstBlock.click({ button: "right" });
    await page.getByRole("button", { name: "Rename" }).click();
    const input = page.getByLabel("Rename section");
    await input.fill("My Section");
    await input.press("Enter");
    await expect(
      page.locator(".section-strip__block").first(),
    ).toContainText("My Section");
    // Give the async IndexedDB write time to commit before reloading.
    await page.waitForTimeout(500);

    // Reload takes us back to the library screen; re-open the piece to verify
    // the renamed section was persisted via IndexedDB.
    await page.reload();
    await page.getByRole("button", { name: /Resume practice/i }).click({ timeout: 15_000 });
    await expect(
      page.locator(".section-strip__block").first(),
    ).toContainText("My Section", { timeout: 15_000 });
  });

  test("toggling strip position via the Tools popover survives reload", async ({
    page,
  }) => {
    await page.setInputFiles('input[type="file"]', MIDI_FIXTURE);
    await expect(page.locator(".section-strip--bottom")).toBeVisible({
      timeout: 15_000,
    });
    // Strip position is now controlled via the Tools popover radio buttons
    // (the inline ↕ button was removed in the dark UI refresh).
    const toolsBtn = page.locator(".top-bar").getByRole("button", { name: "Tools" });
    await toolsBtn.click();
    await expect(page.getByRole("dialog", { name: "Tools" })).toBeVisible();
    await page.getByRole("radio", { name: "Top" }).click();
    await expect(page.locator(".section-strip--top")).toBeVisible();
    // Close the Tools popover.
    await toolsBtn.click();

    // Reload takes us back to the library screen; re-open the piece to verify
    // the strip position was persisted via localStorage.
    await page.reload();
    await page.getByRole("button", { name: /Resume practice/i }).click({ timeout: 15_000 });
    await expect(page.locator(".section-strip--top")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("MusicXML upload does NOT show the strip", async ({ page }) => {
    await page.setInputFiles('input[type="file"]', XML_FIXTURE);
    // Wait for the falldown canvas to confirm the practice view loaded.
    await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator(".section-strip")).toHaveCount(0);
    // The slim scrubber is present for non-MIDI sources.
    await expect(page.locator(".hud-scrubber")).toBeVisible();
  });
});
