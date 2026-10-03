# Offline RF Flight Planner

Implementation follows `openspec/changes/offline-rf-flight-planner/` and `docs/INITIAL_PLAN.md`.

## Development

Use Node.js 22.12 or newer and pnpm. Install dependencies with `pnpm install --frozen-lockfile`, then run `pnpm dev`. The development server listens on localhost. `pnpm build` produces static files in `dist/`; `pnpm preview` serves that build locally.

Run `pnpm check` before accepting changes. Python 3.9 or newer is also required for source-inventory tests. The command checks TypeScript, ESLint, TypeScript/Python validation tests, the production build, and the built HTML's local asset references. This entry check does not certify the full offline workflow or the numerical models; those have separate acceptance gates in the change tasks.

## Current state

The foundation provides an empty Three.js scene preview, application shell, and versioned runtime-validated data contracts (see `docs/CONTRACTS.md`). The first region is centered on 46.205722° N, 13.689917° E; its checked metadata inventory and outstanding GDAL setup are described in `docs/FIRST_REGION.md`. Terrain installation, mission editing, RF/energy analysis, route generation, and a packaged launcher are still pending. The preview grid represents no terrain or geographic coordinates and cannot support feasibility estimates.

The production build bundles dependencies locally and uses system fonts. Dependency installation requires network access; the eventual installed application must operate offline from first launch.
