import { test, expect, type Page } from "@playwright/test";

/** Smoke tests for the /logis social-housing map (tiles mocked). */

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
  expect(page.locator(".sub")).toContainText("social dwellings", {
    timeout: 30_000,
  });

test("logis loads the dwellings, pinned year on the clock", async ({
  page,
}) => {
  const errors = await setup(page);
  const bin = page.waitForResponse(
    (r) => r.url().includes("/logis/groups.bin") && r.status() === 200,
    { timeout: 60_000 },
  );
  await page.goto("/logis?paused=1&t=30");
  await loaded(page);
  await bin;
  // t=30 on the piecewise timeline is 1945
  await expect(page.locator(".flow-clock")).toHaveText("1945");
  await expect(page.locator(".clock-note")).toContainText("already built");
  await expect(page.locator(".mirage-legend-row")).toHaveCount(6);
  // each financing row explains itself on hover
  await expect(page.locator(".mirage-legend-row").nth(0)).toHaveAttribute(
    "title",
    /1894/,
  );
  await expect(page.locator('.viz-links a[href="/mirage"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the legend financing filter applies", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/logis?paused=1&t=90");
  await loaded(page);
  const rows = page.locator(".mirage-legend-row");
  await rows.nth(0).click();
  await expect(rows.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(rows.nth(1)).toHaveClass(/dimmed/);
  // clicking the active row again returns to all categories
  await rows.nth(0).click();
  await expect(rows.nth(0)).toHaveAttribute("aria-pressed", "false");
  await expect(rows.nth(1)).not.toHaveClass(/dimmed/);
  expect(errors).toEqual([]);
});

test("?finan=hbm preselects the pink-belt filter", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/logis?paused=1&t=90&finan=hbm");
  await loaded(page);
  const rows = page.locator(".mirage-legend-row");
  await expect(rows.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(rows.nth(3)).toHaveClass(/dimmed/);
  expect(errors).toEqual([]);
});

test("the year dimension toggles between built and first let", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/logis?paused=1&t=30");
  await loaded(page);
  await expect(page.locator(".clock-note")).toContainText("already built");
  await page.selectOption('select[aria-label="Year dimension"]', "let");
  await expect(page.locator(".clock-note")).toContainText("already in service");
  expect(errors).toEqual([]);
});

test("story button pins the 1935 belt, then offers the whole stock", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/logis?paused=1&t=0");
  await loaded(page);
  await expect(page.locator(".story-btn")).toContainText("pink belt");
  await page.locator(".story-btn").click();
  await expect(page.locator(".flow-clock")).toHaveText("1935");
  // pinned at the belt, the button now offers today's stock
  await expect(page.locator(".story-btn")).toContainText("Back to today");
  await page.locator(".story-btn").click();
  await expect(page.locator(".story-btn")).toContainText("pink belt");
  expect(errors).toEqual([]);
});

test("pressing play advances the year", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/logis?paused=1&t=30");
  await loaded(page);
  await expect(page.locator(".flow-clock")).toHaveText("1945");
  await page.click('button[aria-label="Play"]');
  await expect(page.locator(".flow-clock")).not.toHaveText("1945", {
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});
