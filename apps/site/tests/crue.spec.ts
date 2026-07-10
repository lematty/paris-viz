import { test, expect, type Page } from "@playwright/test";

/** Smoke tests for the /crue flood map (tiles mocked, Hub'Eau mocked out). */

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
  // keep the suite hermetic: no live Seine level in tests
  await page.route("**/hubeau.eaufrance.fr/**", (route) =>
    route.fulfill({ contentType: "application/json", body: '{"data":[]}' }),
  );
  return errors;
}

test("crue loads terrain and buildings, pinned gauge on the clock", async ({
  page,
}) => {
  const errors = await setup(page);
  const water = page.waitForResponse(
    (r) => r.url().includes("/crue/water.bin") && r.status() === 200,
    { timeout: 60_000 },
  );
  await page.goto("/crue?paused=1&g=6.1");
  await expect(page.locator(".sub")).toContainText("buildings", {
    timeout: 30_000,
  });
  await water;
  await expect(page.locator(".flow-clock")).toHaveText("6.10 m");
  // 6.10 m is the June 2016 mark
  await expect(page.locator(".clock-note")).toContainText("2016");
  await expect(page.locator('.viz-links a[href="/vertige"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("story button pins the 1910 record, then offers 2016", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/crue?paused=1&g=1");
  await expect(page.locator(".sub")).toContainText("buildings", {
    timeout: 30_000,
  });
  await page.locator(".story-btn").first().click();
  await expect(page.locator(".flow-clock")).toHaveText("8.62 m", {
    timeout: 15_000,
  });
  await expect(page.locator(".clock-note")).toContainText("1910");
  await expect(page.locator(".story-btn").first()).toContainText("2016");
  expect(errors).toEqual([]);
});

test("?dir=down starts the water receding and the toggle flips it", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/crue?paused=1&g=6.1&dir=down");
  await expect(page.locator(".sub")).toContainText("buildings", {
    timeout: 30_000,
  });
  const toggle = page.locator('button[aria-label="Water direction"]');
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveText("▼");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toHaveText("▲");
  expect(errors).toEqual([]);
});

test("pressing play raises the water", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/crue?paused=1&g=3");
  await expect(page.locator(".sub")).toContainText("buildings", {
    timeout: 30_000,
  });
  await expect(page.locator(".flow-clock")).toHaveText("3.00 m");
  await page.click('button[aria-label="Play"]');
  await expect(page.locator(".flow-clock")).not.toHaveText("3.00 m", {
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});
