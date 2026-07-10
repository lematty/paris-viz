import { test, expect, type Page } from "@playwright/test";

/** Smoke tests for the /strates building-age map (tiles mocked). */

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

test("strates loads the footprints, pinned year on the clock", async ({
  page,
}) => {
  const errors = await setup(page);
  const bin = page.waitForResponse(
    (r) => r.url().includes("/strates/buildings.bin") && r.status() === 200,
    { timeout: 60_000 },
  );
  await page.goto("/strates?paused=1&t=24");
  await expect(page.locator(".sub")).toContainText("footprints", {
    timeout: 30_000,
  });
  await bin;
  // t=24 clock units → the 1850 anchor of the piecewise timeline
  await expect(page.locator(".flow-clock")).toHaveText("1850");
  await expect(page.locator(".clock-note")).toContainText("standing");
  await expect(page.locator('.viz-links a[href="/vertige"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the time filter select flips between before and after", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/strates?paused=1&t=24");
  await expect(page.locator(".sub")).toContainText("footprints", {
    timeout: 30_000,
  });
  await page.locator('select[aria-label="Time filter"]').selectOption("after");
  await expect(page.locator(".clock-note")).toContainText("after");
  expect(errors).toEqual([]);
});

test("story button pins the year at 1914, then offers the other side", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/strates?paused=1&t=0");
  await expect(page.locator(".sub")).toContainText("footprints", {
    timeout: 30_000,
  });
  await page.locator(".story-btn").click();
  // the first layer build tessellates 128k polygons and can starve the
  // animation frame that repaints the clock, hence the generous timeout
  await expect(page.locator(".flow-clock")).toHaveText("1914", {
    timeout: 15_000,
  });
  await expect(page.locator(".clock-note")).toContainText("standing");
  await expect(page.locator('button[aria-label="Play"]')).toBeVisible();
  // frozen at 1914, the button now offers everything built after
  await expect(page.locator(".story-btn")).toContainText("after 1914");
  await page.locator(".story-btn").click();
  await expect(page.locator(".clock-note")).toContainText("after");
  expect(errors).toEqual([]);
});

test("?dir=back starts the sweep backward and the toggle flips it", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/strates?paused=1&t=24&dir=back");
  await expect(page.locator(".sub")).toContainText("footprints", {
    timeout: 30_000,
  });
  await expect(page.locator(".flow-clock")).toHaveText("1850");
  // rewinding itself is timing-dependent WebGL behavior (untestable in
  // software rendering), so assert the direction STATE and its toggle
  const toggle = page.locator('button[aria-label="Time direction"]');
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveText("◀");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toHaveText("▶");
  expect(errors).toEqual([]);
});

test("pressing play advances the year", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/strates?paused=1&t=24");
  await expect(page.locator(".sub")).toContainText("footprints", {
    timeout: 30_000,
  });
  await expect(page.locator(".flow-clock")).toHaveText("1850");
  await page.click('button[aria-label="Play"]');
  await expect(page.locator(".flow-clock")).not.toHaveText("1850", {
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});
