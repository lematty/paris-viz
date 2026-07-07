import { test, expect, type Page } from "@playwright/test";

/** Smoke tests for the /vertige building-heights map (tiles mocked). */

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

test("vertige loads the buildings, pinned ceiling on the clock", async ({
  page,
}) => {
  const errors = await setup(page);
  const bin = page.waitForResponse(
    (r) => r.url().includes("/vertige/buildings.bin") && r.status() === 200,
    { timeout: 60_000 },
  );
  await page.goto("/vertige?paused=1&t=36");
  await expect(page.locator(".sub")).toContainText("buildings", {
    timeout: 30_000,
  });
  await bin;
  // t=36 clock units → an 18 m ceiling
  await expect(page.locator(".flow-clock")).toHaveText("18 m");
  await expect(page.locator(".clock-note")).toContainText("below");
  await expect(page.locator('.viz-links a[href="/flux"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the ceiling mode select flips the filter direction", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/vertige?paused=1&t=36");
  await expect(page.locator(".sub")).toContainText("buildings", {
    timeout: 30_000,
  });
  await page.locator('select[aria-label="Ceiling mode"]').selectOption("above");
  await expect(page.locator(".clock-note")).toContainText("above");
  expect(errors).toEqual([]);
});

test("story button pins the ceiling at 37 m and shows what rises above", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/vertige?paused=1&t=0");
  await expect(page.locator(".sub")).toContainText("buildings", {
    timeout: 30_000,
  });
  await page.locator(".story-btn").click();
  // the first layer build tessellates 110k polygons and can starve the
  // animation frame that repaints the clock, hence the generous timeout
  await expect(page.locator(".flow-clock")).toHaveText("37 m", {
    timeout: 15_000,
  });
  await expect(page.locator(".clock-note")).toContainText("above");
  await expect(page.locator('button[aria-label="Play"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("pressing play raises the ceiling", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/vertige?paused=1&t=20");
  await expect(page.locator(".sub")).toContainText("buildings", {
    timeout: 30_000,
  });
  await expect(page.locator(".flow-clock")).toHaveText("10 m");
  await page.click('button[aria-label="Play"]');
  await expect(page.locator(".flow-clock")).not.toHaveText("10 m", {
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});
