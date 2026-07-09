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

## Driving with Playwright

- The raw `playwright` package is not a top-level dep; require
  `@playwright/test` instead (it re-exports `chromium`). From a script
  outside the repo use `createRequire("<repo>/apps/site/package.json")`.
- Playwright's bundled chromium does not run on this NixOS host
  (missing libnspr4.so). Launch the system browser instead:

```js
const browser = await chromium.launch({
  executablePath: "/run/current-system/sw/bin/google-chrome-stable",
});
```

## Useful selectors and hooks

- Panel: `.clock-note` (current origin), `.story-btn`, `.lang-toggle button`,
  `.horizon-search input` + `.search-results li` (horizon station search).
- URL params on /horizon: `?from=<station>`, `?t=<minutes>`, `?paused=1`.
- `window.__horizon.setTime(t)` jumps the animation clock.
- Deck.gl paints take a few seconds; wait before screenshots.
