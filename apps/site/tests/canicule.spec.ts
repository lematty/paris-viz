import { test, expect, type Page } from "@playwright/test";

/** Smoke tests for the /canicule heat-island map (tiles mocked). */

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

test("canicule loads the blocks, night hazard by default", async ({ page }) => {
  const errors = await setup(page);
  const bin = page.waitForResponse(
    (r) => r.url().includes("/canicule/blocks.bin") && r.status() === 200,
    { timeout: 60_000 },
  );
  await page.goto("/canicule");
  await expect(page.locator(".sub")).toContainText("blocks", {
    timeout: 30_000,
  });
  await bin;
  const momentToggle = page.locator('button[aria-label="Day or night"]');
  await expect(momentToggle).toHaveAttribute("aria-pressed", "true");
  await expect(momentToggle).toContainText("night");
  await expect(page.locator('.viz-links a[href="/strates"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the day/night toggle flips the moment", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/canicule");
  await expect(page.locator(".sub")).toContainText("blocks", {
    timeout: 30_000,
  });
  const momentToggle = page.locator('button[aria-label="Day or night"]');
  await momentToggle.click();
  await expect(momentToggle).toHaveAttribute("aria-pressed", "false");
  await expect(momentToggle).toContainText("day");
  expect(errors).toEqual([]);
});

test("?vue=vuln-jour selects vulnerability by day", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/canicule?vue=vuln-jour");
  await expect(page.locator(".sub")).toContainText("blocks", {
    timeout: 30_000,
  });
  await expect(page.locator('select[aria-label="Map variable"]')).toHaveValue(
    "vuln",
  );
  await expect(
    page.locator('button[aria-label="Day or night"]'),
  ).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("story button flips to night vulnerability and back", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/canicule");
  await expect(page.locator(".sub")).toContainText("blocks", {
    timeout: 30_000,
  });
  await page.locator(".story-btn").click();
  await expect(page.locator('select[aria-label="Map variable"]')).toHaveValue(
    "vuln",
  );
  await expect(page.locator(".story-btn")).toContainText("heat itself");
  await page.locator(".story-btn").click();
  await expect(page.locator('select[aria-label="Map variable"]')).toHaveValue(
    "alea",
  );
  expect(errors).toEqual([]);
});

test("the variable select swaps the legend", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/canicule");
  await expect(page.locator(".sub")).toContainText("blocks", {
    timeout: 30_000,
  });
  const swatches = () =>
    page.locator(".iso-swatches .iso-swatch").evaluateAll((spans) =>
      spans.map((span) => (span as HTMLElement).style.background),
    );
  const aleaSwatches = await swatches();
  await page
    .locator('select[aria-label="Map variable"]')
    .selectOption("vuln");
  expect(await swatches()).not.toEqual(aleaSwatches);
  expect(errors).toEqual([]);
});
