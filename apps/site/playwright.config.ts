import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// On systems where Playwright's bundled Chromium can't run (e.g. NixOS),
// fall back to an installed Chrome. CI uses the bundled browser.
const systemChrome = [
  "/run/current-system/sw/bin/google-chrome-stable",
  "/usr/bin/google-chrome-stable",
].find(existsSync);

export default defineConfig({
  testDir: "tests",
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      // CI runners have no GPU; SwiftShader gives deck.gl a software WebGL
      // context. Tests only assert on DOM state, never on painted pixels.
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
      ...(!process.env.CI && systemChrome
        ? { executablePath: systemChrome }
        : {}),
    },
  },
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
