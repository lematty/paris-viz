import { test, expect, type Page } from "@playwright/test";

/** Smoke tests for the /mirage tourist-flats map (tiles mocked). */

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

const loaded = (page: Page) =>
  expect(page.locator(".sub")).toContainText("Airbnb listings", {
    timeout: 30_000,
  });

test("mirage loads the listings, pinned month on the clock", async ({
  page,
}) => {
  const errors = await setup(page);
  const bin = page.waitForResponse(
    (r) => r.url().includes("/mirage/listings.bin") && r.status() === 200,
    { timeout: 60_000 },
  );
  await page.goto("/mirage?paused=1&t=283");
  await loaded(page);
  await bin;
  // t=283 months since January 2000 → August 2023
  await expect(page.locator(".flow-clock")).toHaveText("Aug 2023");
  await expect(page.locator(".clock-note")).toContainText("already present");
  await expect(page.locator(".mirage-legend-row")).toHaveCount(4);
  await expect(page.locator('.viz-links a[href="/strates"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the time window select and legend status filter apply", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/mirage?paused=1&t=283");
  await loaded(page);
  await page.locator('select[aria-label="Time window"]').selectOption("actif");
  await expect(page.locator(".clock-note")).toContainText("reviews around");
  const rows = page.locator(".mirage-legend-row");
  await rows.nth(1).click();
  await expect(rows.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(rows.nth(0)).toHaveClass(/dimmed/);
  // clicking the active row again returns to all statuses
  await rows.nth(1).click();
  await expect(rows.nth(1)).toHaveAttribute("aria-pressed", "false");
  await expect(rows.nth(0)).not.toHaveClass(/dimmed/);
  expect(errors).toEqual([]);
});

test("?statut=sans preselects the unregistered filter", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/mirage?paused=1&t=283&statut=sans");
  await loaded(page);
  const rows = page.locator(".mirage-legend-row");
  await expect(rows.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(rows.nth(3)).toHaveClass(/dimmed/);
  expect(errors).toEqual([]);
});

test("story button pins the median arrival month, then offers the full tide", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/mirage?paused=1&t=130");
  await loaded(page);
  await expect(page.locator(".story-btn")).toContainText("half of today's");
  await page.locator(".story-btn").click();
  await expect(page.locator('button[aria-label="Play"]')).toBeVisible();
  // pinned at the median, the button now offers the completed sweep
  await expect(page.locator(".story-btn")).toContainText("Back to");
  await page.locator(".story-btn").click();
  await expect(page.locator(".story-btn")).toContainText("half of today's");
  expect(errors).toEqual([]);
});

test("pressing play advances the month", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/mirage?paused=1&t=283");
  await loaded(page);
  await expect(page.locator(".flow-clock")).toHaveText("Aug 2023");
  await page.click('button[aria-label="Play"]');
  await expect(page.locator(".flow-clock")).not.toHaveText("Aug 2023", {
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});
