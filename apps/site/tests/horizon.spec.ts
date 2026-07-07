import { test, expect, type Page } from "@playwright/test";

/** Smoke tests for the /horizon isochrone map (tiles mocked). */

const TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAABAAAAAQCAYAAAAf8/9hAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function setup(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.route("**/*.basemaps.cartocdn.com/**", (route) =>
    route.fulfill({ contentType: "image/png", body: TILE_PNG }),
  );
  return errors;
}

test("horizon loads stations and the matrix, pinned budget on the clock", async ({
  page,
}) => {
  const errors = await setup(page);
  const matrix = page.waitForResponse(
    (r) => r.url().includes("/horizon/matrix.bin") && r.status() === 200,
    { timeout: 60_000 },
  );
  await page.goto("/horizon?paused=1&t=45");
  await expect(page.locator(".sub")).toContainText("stations", {
    timeout: 30_000,
  });
  await matrix;
  await expect(page.locator(".flow-clock")).toHaveText("45 min");
  // default origin resolved once stations arrived
  await expect(page.locator(".clock-note")).toContainText(
    "Châtelet - Les Halles",
  );
  await expect(page.locator('.viz-links a[href="/flux"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("?from= sets the origin station", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/horizon?paused=1&t=30&from=Nation");
  await expect(page.locator(".clock-note")).toContainText("Nation", {
    timeout: 30_000,
  });
  expect(errors).toEqual([]);
});

test("search re-roots the isochrone at the picked station", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/horizon?paused=1&t=30");
  await expect(page.locator(".sub")).toContainText("stations", {
    timeout: 30_000,
  });
  await page.locator(".horizon-search input").fill("défense");
  const option = page.locator(".search-results li", {
    hasText: "La Défense",
  });
  await option.first().click();
  await expect(page.locator(".clock-note")).toContainText("La Défense");
  await expect(page.locator(".search-results")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("pressing play advances the travel-time budget", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/horizon?paused=1&t=10");
  await expect(page.locator(".sub")).toContainText("stations", {
    timeout: 30_000,
  });
  await expect(page.locator(".flow-clock")).toHaveText("10 min");
  await page.click('button[aria-label="Play"]');
  await expect(page.locator(".flow-clock")).not.toHaveText("10 min", {
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});
