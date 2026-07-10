---
name: verify
description: Build, launch and drive the paris-viz site to verify a change end-to-end with Playwright screenshots.
---

# Verifying apps/site changes

## Build and launch (prod server, not dev)

Dev StrictMode leaks an offset Deck canvas, so always verify against a
prod build:

```bash
cd apps/site
pnpm build            # runs scripts/ensure-data.mjs first; data artifacts live in public/
pnpm exec next start -p 4123 &
```

## Before running `pnpm test`

playwright.config.ts starts `pnpm start` on port 3000 with
`reuseExistingServer`, so a leftover `next-server` from an earlier session
poisons the whole suite: it keeps its boot-time route manifest while the
rebuilt `.next` changes under it (new routes 404, viz pages load no JS,
every spec fails with "element(s) not found" on `.sub`). `lsof -i :3000`
can miss it; use `ss -tlnp | grep 3000` and kill the pid before testing.
Piping the test run through `tail` also swallows the real exit code -
capture to a file instead.

The same boot-time snapshot applies to `public/`: a file written there
after `next start` boots (e.g. a freshly generated thumbnail) 404s until
the server restarts. And kill your own `next start` when done - a
leftover becomes the next session's poisoned server.

## Driving with Playwright

- The raw `playwright` package is not a top-level dep; require
  `@playwright/test` instead (it re-exports `chromium`). From a script
  outside the repo use `createRequire("<repo>/apps/site/package.json")`.
- Playwright's bundled chromium does not run on this NixOS host
  (missing libnspr4.so). Launch the system browser instead:

```js
const browser = await chromium.launch({
  executablePath: "/run/current-system/sw/bin/google-chrome-stable",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
```

- Headless WebGL is software-rendered, and heavy scenes (vertige's 1.1 M
  vertices) take seconds per frame, which starves requestAnimationFrame.
  Anything in Playwright that waits on RAF then times out while the page
  is actually fine: pass `{ polling: 250 }` to waitForFunction, click with
  `{ force: true }` (skips the two-RAF stability check), and read text via
  `page.$eval` instead of locator.evaluate. Light pages (horizon) do not
  need any of this.

## Useful selectors and hooks

- Panel: `.clock-note` (current origin), `.story-btn`, `.lang-toggle button`,
  `.horizon-search input` + `.search-results li` (horizon station search).
- URL params on /horizon: `?from=<station>`, `?t=<minutes>`, `?paused=1`.
- `window.__horizon.setTime(t)` jumps the animation clock; `__vertige` and
  `__strates` add `setView({zoom, pitch, bearing, ...})` for screenshots.
- URL params on /vertige: `?t=<0-90>&mode=above&dir=down&paused=1`; on
  /strates: `?t=<0-90>&mode=after&dir=back&paused=1` (t=24 → 1850, 60 → 1914).
- Deck.gl paints take a few seconds; wait before screenshots.
