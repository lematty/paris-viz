import { test, expect, type Page } from "@playwright/test";

/** Smoke tests for the /air visualization (tiles mocked). */

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

test("air loads stations and a year series", async ({ page }) => {
  const errors = await setup(page);
  const bin = page.waitForResponse(
    (r) => r.url().includes("/air/no2-2025.bin") && r.status() === 200,
    { timeout: 60_000 },
  );
  await page.goto("/air?paused=1&t=200&year=2025");
  await expect(page.locator(".sub")).toContainText("stations", {
    timeout: 30_000,
  });
  await bin;
  // clock shows a date once running (Jan 9 = hour 200)
  await expect(page.locator(".flow-clock")).toContainText("Jan", {
    timeout: 15_000,
  });
  // the displayed rolling-mean window follows the playback speed
  await expect(page.locator(".clock-note")).toHaveText("24 h mean");
  await page.getByLabel("Speed").selectOption("168");
  await expect(page.locator(".clock-note")).toHaveText("7 d mean");
  await page.getByLabel("Speed").selectOption("6");
  await expect(page.locator(".clock-note")).toHaveText("hourly values");
  expect(errors).toEqual([]);
});

test("pollutant and year selectors load the right series", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/air?paused=1&t=200&year=2025");
  await expect(page.locator(".sub")).toContainText("stations", {
    timeout: 30_000,
  });
  const pmBin = page.waitForResponse(
    (r) => r.url().includes("/air/pm25-2025.bin") && r.status() === 200,
    { timeout: 60_000 },
  );
  await page.getByRole("radio", { name: "PM₂.₅" }).click();
  await pmBin;
  const y2020 = page.waitForResponse(
    (r) => r.url().includes("/air/pm25-2020.bin") && r.status() === 200,
    { timeout: 60_000 },
  );
  await page.getByRole("radio", { name: "2020" }).click();
  await y2020;
  expect(errors).toEqual([]);
});

test("lockdown story button jumps to March 2020", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/air?paused=1&t=200&year=2025");
  await expect(page.locator(".sub")).toContainText("stations", {
    timeout: 30_000,
  });
  const y2020 = page.waitForResponse(
    (r) => r.url().includes("/air/no2-2020.bin") && r.status() === 200,
    { timeout: 60_000 },
  );
  await page.locator(".story-btn").click();
  await y2020;
  await expect(page.locator(".flow-clock")).toContainText("Mar", {
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});
