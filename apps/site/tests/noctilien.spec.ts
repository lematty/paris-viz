import { test, expect, type Page } from "@playwright/test";

/**
 * Smoke tests for the /noctilien frequency map, migrated from the standalone
 * repo. External services (CARTO tiles, BAN geocoder) are mocked.
 */

const TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAABAAAAAQCAYAAAAf8/9hAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const GEO_FIXTURE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [2.36041, 48.8555] },
      properties: { label: "10 Rue de Rivoli 75004 Paris" },
    },
  ],
};

async function setup(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  await page.route("**/*.basemaps.cartocdn.com/**", (route) =>
    route.fulfill({ contentType: "image/png", body: TILE_PNG }),
  );
  await page.route("**/api-adresse.data.gouv.fr/**", (route) =>
    route.fulfill({ json: GEO_FIXTURE }),
  );
  return errors;
}

test("renders the map with heatmap, stops and English-default UI", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/noctilien");
  await expect(page.locator("h1")).toContainText("Noctilien");
  await expect(page.locator(".panel-sub")).toHaveText(
    "night-bus frequency",
  );
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.locator(".leaflet-overlay-pane canvas")).toBeVisible();
  await expect(page.locator(".leaflet-image-layer").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("address search flies to the result and lists nearest stops", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/noctilien");
  await page.fill('input[type="search"]', "10 rue de rivoli paris");
  await page.click(".search-results li");
  await expect(page.locator(".target-pin")).toBeVisible();
  await expect(page.locator(".nearest li").first()).toBeVisible();
  expect(page.url()).toContain("q=10+Rue+de+Rivoli");
  expect(errors).toEqual([]);
});

test("night toggle switches to weekend and updates the URL", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/noctilien");
  const weekend = page.getByRole("radio", { name: "Fri–Sat nights" });
  await weekend.click();
  await expect(weekend).toHaveAttribute("aria-checked", "true");
  await expect(page).toHaveURL(/night=weekend/);
  expect(errors).toEqual([]);
});

test("line highlight from the panel and shareable URL round-trip", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/noctilien");
  await page.fill('input[type="search"]', "10 rue de rivoli paris");
  await page.click(".search-results li");
  await page.locator(".nearest .line-link").first().click();
  await expect(page.locator(".line-chip")).toBeVisible();
  await expect(page).toHaveURL(/line=N\d+/);

  await page.reload();
  await expect(page.locator(".line-chip")).toBeVisible();
  await expect(page.locator(".nearest li").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("story button switches to weekend night at Châtelet", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/noctilien");
  await page.locator(".story-btn").click();
  await expect(
    page.getByRole("radio", { name: "Fri–Sat nights" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".nearest li").first()).toBeVisible();
  await expect(page.locator(".nearest-header")).toContainText("Châtelet");
  await expect(page).toHaveURL(/night=weekend/);
  // cross-links to the sibling visualizations are present
  await expect(page.locator('.viz-links a[href="/flux"]')).toHaveCount(1);
  await expect(page.locator('.viz-links a[href="/air"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("language toggle switches to French and persists", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/noctilien");
  await page.getByRole("radio", { name: "FR", exact: true }).click();
  await expect(page.locator(".panel-sub")).toHaveText("fréquence des bus de nuit");
  await page.reload();
  await expect(page.locator(".panel-sub")).toHaveText("fréquence des bus de nuit");
  expect(errors).toEqual([]);
});
