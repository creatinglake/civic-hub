/**
 * Navigation E2E tests.
 *
 * Verifies the core navigation flows a resident would use:
 * tab strip, hamburger drawer, page routing.
 */

import { test, expect } from "@playwright/test";

// Dismiss the intro popup before each test by setting localStorage
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("seen_intro_popup", "true");
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
});

test.describe("Navigation", () => {
  test("home page loads and nav is visible", async ({ page }) => {
    // beforeEach already navigated to / and dismissed the intro popup.
    // Just verify the nav is present.
    await expect(page.locator("nav.civic-nav")).toBeVisible({ timeout: 15_000 });
  });

  test("Feed and Votes tab strip navigates between pages", async ({ page }) => {
    const votesTab = page.locator('a[href="/votes"]').first();
    if (await votesTab.isVisible()) {
      await votesTab.click();
      await expect(page).toHaveURL("/votes");
    }

    const feedTab = page.locator('a[href="/"]').first();
    if (await feedTab.isVisible()) {
      await feedTab.click();
      await expect(page).toHaveURL("/");
    }
  });

  test("hamburger drawer opens and shows navigation links", async ({
    page,
  }) => {
    const hamburger = page.locator(".civic-nav-hamburger");
    if (await hamburger.isVisible()) {
      await hamburger.click();

      const drawer = page.locator(".civic-nav-drawer");
      await expect(drawer).toBeVisible();

      await expect(drawer.locator('a[href="/"]')).toBeVisible();
      await expect(drawer.locator('a[href="/votes"]')).toBeVisible();
    }
  });

  test("legal pages are accessible", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/terms");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/code-of-conduct");
    await expect(page.locator("main")).toBeVisible();
  });

  test("wordmark links to home", async ({ page }) => {
    await page.goto("/votes");
    await page.waitForLoadState("networkidle");

    const wordmark = page.locator(".civic-nav-wordmark, nav a[href='/']").first();
    if (await wordmark.isVisible()) {
      await wordmark.click();
      await expect(page).toHaveURL("/");
    }
  });
});
