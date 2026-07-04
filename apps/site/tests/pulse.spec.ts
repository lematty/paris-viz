import { test, expect, type Page } from "@playwright/test";

/** Smoke tests for the /pulse ridership visualization (tiles mocked). */

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

test("pulse loads stations and shows the pinned clock", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/pulse?paused=1&t=30600");
  // subtitle shows the station count once pulse.json arrives
  await expect(page.locator(".sub")).toContainText("stations", {
    timeout: 30_000,
  });
  await expect(page.locator(".flow-clock")).toHaveText("08:30");
  expect(errors).toEqual([]);
});

test("day selector switches and play advances the clock", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/pulse?paused=1&t=30600");
  await expect(page.locator(".sub")).toContainText("stations", {
    timeout: 30_000,
  });
  const sunday = page.getByRole("radio", { name: "Sunday" });
  await sunday.click();
  await expect(sunday).toHaveAttribute("aria-checked", "true");
  await page.click('button[aria-label="Play"]');
  await expect(page.locator(".flow-clock")).not.toHaveText("08:30", {
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});
