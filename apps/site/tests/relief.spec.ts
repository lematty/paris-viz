import { test, expect, type Page } from "@playwright/test";

/** Smoke tests for the /relief ridership spike map (tiles mocked). */

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

test("relief loads the stations, pinned time on the clock", async ({ page }) => {
  const errors = await setup(page);
  const json = page.waitForResponse(
    (r) => r.url().includes("/relief/stations.json") && r.status() === 200,
    { timeout: 60_000 },
  );
  await page.goto("/relief?paused=1&t=30600");
  await expect(page.locator(".sub")).toContainText("stations", {
    timeout: 30_000,
  });
  await json;
  await expect(page.locator(".flow-clock")).toHaveText("08:30");
  await expect(page.locator(".clock-note")).toContainText("weekday");
  await expect(page.locator(".flow-canvas")).toBeVisible();
  await expect(page.locator('.viz-links a[href="/canicule"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the day select switches the day type", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/relief?paused=1&t=30600");
  await expect(page.locator(".sub")).toContainText("stations", {
    timeout: 30_000,
  });
  await page.locator('select[aria-label="Day type"]').selectOption("sunday");
  await expect(page.locator(".clock-note")).toContainText("Sunday");
  expect(errors).toEqual([]);
});

test("?day=saturday starts on a Saturday", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/relief?paused=1&t=30600&day=saturday");
  await expect(page.locator(".sub")).toContainText("stations", {
    timeout: 30_000,
  });
  await expect(page.locator(".clock-note")).toContainText("Saturday");
  expect(errors).toEqual([]);
});

test("story button pins 6pm on a weekday", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/relief?paused=1&t=0&day=sunday");
  await expect(page.locator(".sub")).toContainText("stations", {
    timeout: 30_000,
  });
  await page.locator(".story-btn").click();
  await expect(page.locator(".flow-clock")).toHaveText("18:00", {
    timeout: 15_000,
  });
  await expect(page.locator(".clock-note")).toContainText("weekday");
  await expect(page.locator('button[aria-label="Play"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("pressing play advances the clock", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/relief?paused=1&t=30600");
  await expect(page.locator(".sub")).toContainText("stations", {
    timeout: 30_000,
  });
  await expect(page.locator(".flow-clock")).toHaveText("08:30");
  await page.click('button[aria-label="Play"]');
  await expect(page.locator(".flow-clock")).not.toHaveText("08:30", {
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});
