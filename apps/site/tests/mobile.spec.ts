import { test, expect, type Page } from "@playwright/test";

/** Mobile: panels are bottom sheets, collapsed by default; noctilien has a
 * geolocate button. Same mocks as the desktop suites. */

const TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAABAAAAAQCAYAAAAf8/9hAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test.use({
  viewport: { width: 390, height: 844 },
  geolocation: { latitude: 48.8555, longitude: 2.36041 },
  permissions: ["geolocation"],
});

async function setup(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.route("**/*.basemaps.cartocdn.com/**", (route) =>
    route.fulfill({ contentType: "image/png", body: TILE_PNG }),
  );
  return errors;
}

test("noctilien sheet starts collapsed and expands", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/noctilien");
  await expect(page.locator(".panel")).toHaveClass(/collapsed/);
  await expect(page.locator(".panel-hint")).toBeHidden();
  // search stays available even when collapsed
  await expect(page.locator('input[type="search"]')).toBeVisible();
  await page.click(".sheet-toggle");
  await expect(page.locator(".panel-hint")).toBeVisible();
  expect(errors).toEqual([]);
});

test("geolocate button lists nearest stops and opens the sheet", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/noctilien");
  await page.click(".locate-btn");
  await expect(page.locator(".nearest li").first()).toBeVisible();
  await expect(page.locator(".nearest-header")).toContainText("My location");
  await expect(page.locator(".panel")).not.toHaveClass(/collapsed/);
  expect(errors).toEqual([]);
});

test("flux sheet keeps clock and controls when collapsed", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/flux?modes=tram&paused=1&t=30600");
  await page.waitForFunction(() => !document.querySelector(".mode-loading"), {
    timeout: 60_000,
  });
  await expect(page.locator(".flow-panel")).toHaveClass(/collapsed/);
  await expect(page.locator(".flow-clock")).toBeVisible();
  await expect(page.locator(".flow-modes")).toBeHidden();
  await page.click(".sheet-toggle");
  await expect(page.locator(".flow-modes")).toBeVisible();
  expect(errors).toEqual([]);
});
