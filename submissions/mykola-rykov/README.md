# Offline RF Flight Planner

Implementation follows `openspec/changes/offline-rf-flight-planner/` and `docs/INITIAL_PLAN.md`.

## Development

Use Node.js 22.12 or newer and pnpm. Run `pnpm install --frozen-lockfile`, then `pnpm dev`. All development servers listen on localhost. Terrain preparation and required Python checks need GDAL 3.7+ Python bindings and NumPy; see [terrain setup](docs/TERRAIN_BUILD.md).

Run `pnpm check` before accepting changes. It checks TypeScript, ESLint, numerical/data validation fixtures, the production build, and local entry assets. Browser acceptance is separate: `pnpm browser:install`, then `pnpm test:browser`.

## Install terrain and launch locally

Build a package following [the terrain instructions](docs/TERRAIN_BUILD.md), then run:

```sh
pnpm terrain:install terrain/packages/alpine-adriatic
pnpm build
pnpm start
```

Open `http://127.0.0.1:4173`. The launcher uses Node's standard library and needs no pnpm dependencies at runtime. A distributed development build consists of `dist/`, `scripts/serve.mjs`, and Node; launch with `node scripts/serve.mjs dist 4173`. Terrain installation copies validated packages into `public/terrain/` and updates `public/regions.json`; rebuild after installing. Existing packages are not overwritten. Build/install require maintainer tools; the built viewer reads local files with external networking disabled.

## Current state

The regional viewer renders grayscale terrain, bundled Natural Earth context, top-down/perspective modes, and precise coordinate placement. Its first region is centered on 46.205722° N, 13.689917° E. See [region evidence](docs/FIRST_REGION.md), [viewer checks](docs/VIEWER_VALIDATION.md), and [contracts](docs/CONTRACTS.md).

Terrain is a digital surface model (DSM), with heights in the manifest's vertical datum (EGM2008 for this region). A surface-relative height is relative to that DSM, including represented vegetation/buildings, not bare-earth ground clearance. Grid spacing, nominal source resolution, quantization, and source accuracy are separate. Missing cells remain unknown. The viewer labels its display-only 3× vertical exaggeration.

Mission editing, RF/energy analysis, equipment comparisons, automatic routing, and release acceptance remain tracked in the OpenSpec change. No feasibility estimates are available yet. Fonts and application dependencies are bundled locally or use system fonts.
