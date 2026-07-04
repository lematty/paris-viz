import { test, expect, type Page } from "@playwright/test";

/**
 * Hermetic smoke test: all external services (CARTO basemap tiles, the BAN
 * geocoder) are mocked so the suite only exercises our own code and fails
 * only for our own regressions.
 */

const TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
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

test("renders the map with heatmap, stops and French UI", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("Noctilien");
  await expect(page.locator(".panel-sub")).toHaveText(
    "fréquence des bus de nuit",
  );
  await expect(page.locator(".leaflet-container")).toBeVisible();
  // stops render on a canvas; the heat overlay is an <img> in its own pane
  await expect(page.locator(".leaflet-overlay-pane canvas")).toBeVisible();
  await expect(page.locator(".leaflet-pane.leaflet-heat-pane img, .leaflet-image-layer").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("address search flies to the result and lists nearest stops", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/");
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
  await page.goto("/");
  const weekend = page.getByRole("radio", { name: "Nuits ven–sam" });
  await weekend.click();
  await expect(weekend).toHaveAttribute("aria-checked", "true");
  await expect(page).toHaveURL(/night=weekend/);
  expect(errors).toEqual([]);
});

test("line highlight from the panel and shareable URL round-trip", async ({
  page,
}) => {
  const errors = await setup(page);
  await page.goto("/");
  await page.fill('input[type="search"]', "10 rue de rivoli paris");
  await page.click(".search-results li");
  await page.locator(".nearest .line-link").first().click();
  await expect(page.locator(".line-chip")).toBeVisible();
  await expect(page).toHaveURL(/line=N\d+/);

  // a pasted link must restore the same situation (reload re-parses the hash
  // from scratch, same as opening the link fresh)
  await page.reload();
  await expect(page.locator(".line-chip")).toBeVisible();
  await expect(page.locator(".nearest li").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("language toggle switches to English and persists", async ({ page }) => {
  const errors = await setup(page);
  await page.goto("/");
  await page.getByRole("radio", { name: "EN", exact: true }).click();
  await expect(page.locator(".panel-sub")).toHaveText("night-bus frequency");
  await page.reload();
  await expect(page.locator(".panel-sub")).toHaveText("night-bus frequency");
  expect(errors).toEqual([]);
});
