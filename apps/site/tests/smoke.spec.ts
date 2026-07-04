import { test, expect, type Page } from "@playwright/test";

/**
 * Smoke tests for the flux animated map. CARTO basemap tiles are mocked
 * (hermetic); the flow data comes from our own public/ directory. Tests pin
 * the page to the smallest mode (tram), paused at a fixed time, and assert
 * on DOM/app state — CI runners rasterize WebGL in software, so painted
 * pixels are deliberately never asserted.
 */

const TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAABAAAAAQCAYAAAAf8/9hAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const FLUX_URL = "/flux?modes=tram&paused=1&t=30600";

async function setup(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.route("**/*.basemaps.cartocdn.com/**", (route) =>
    route.fulfill({ contentType: "image/png", body: TILE_PNG }),
  );
  return errors;
}

const dataReady = (page: Page) =>
  page.waitForFunction(() => !document.querySelector(".mode-loading"), {
    timeout: 60_000,
  });

test("landing page lists the visualizations", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Paris Viz");
  await expect(page.locator(".card")).toHaveCount(2);
  await page.click('.card:has-text("Flux")');
  await expect(page).toHaveURL(/\/flux/);
  expect(errors).toEqual([]);
});

test("flux loads tram data, pinned time shows on the clock", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto(FLUX_URL);
  await dataReady(page);
  await expect(page.locator(".flow-clock")).toHaveText("08:30");
  // meta arrived: trip count in the subtitle, line chips rendered
  await expect(page.locator(".sub")).toContainText("trajets");
  expect(await page.locator(".line-chip").count()).toBeGreaterThan(10);
  // URL params respected: only Tramway checked
  await expect(
    page.locator('.flow-mode:has-text("Tramway") input'),
  ).toBeChecked();
  await expect(
    page.locator('.flow-mode:has-text("Métro") input'),
  ).not.toBeChecked();
  expect(errors).toEqual([]);
});

test("mode checkbox hides its line chips", async ({ page }) => {
  const errors = await setup(page);
  await page.goto(FLUX_URL);
  await dataReady(page);
  await page.locator('.flow-mode:has-text("Tramway") input').uncheck();
  await expect(page.locator(".line-chip")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("clicking a line chip solos it, clicking again restores", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto(FLUX_URL);
  await dataReady(page);
  const chip = page.locator('.line-chip:has-text("T1")').first();
  await chip.click();
  await expect(chip).toHaveClass(/solo/);
  expect(await page.locator(".line-chip.dimmed").count()).toBeGreaterThan(5);
  await chip.click();
  await expect(page.locator(".line-chip.dimmed")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("pressing play advances the clock", async ({ page }) => {
  const errors = await setup(page);
  await page.goto(FLUX_URL);
  await dataReady(page);
  await expect(page.locator(".flow-clock")).toHaveText("08:30");
  await page.click('button[aria-label="Lecture"]');
  // ×60: one real second ≈ one simulated minute
  await expect(page.locator(".flow-clock")).not.toHaveText("08:30", {
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});
