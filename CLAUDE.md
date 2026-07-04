# paris-viz

Monorepo for Paris open-data visualizations. pnpm workspace:

- `apps/site` - the Next.js site; each visualization is a route
  (`/flux` deck.gl animated network, `/noctilien` Leaflet frequency heatmap).
  Noctilien code lives namespaced under `src/{components,lib}/noctilien/`.
- `packages/gtfs` - shared IDFM GTFS download/parse utilities, consumed by
  per-visualization build scripts (run with tsx; never imported by the app at
  runtime). Each visualization ships a static prebuilt artifact in
  `apps/site/public/`; no database, no backend.

## Rules

- Use pnpm, never npm.
- Never use em dashes anywhere in the project: code, UI strings, docs,
  comments, or commit messages. Use a colon, comma, or hyphen instead.

## Git commits

- Single-line commit messages only (no body or multi-line descriptions)
- Use conventional commit prefixes: `feat:`, `fix:`, `refactor:`, etc.
- Do not add `Co-Authored-By` lines
- Only commit when explicitly asked
