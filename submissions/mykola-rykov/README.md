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

Mission editing, versioned JSON import/export, cancellable manual-route RF/energy analysis and equipment comparisons run locally. Route colours show received power or margin using a shared legend; selecting a sample exposes terrain, Fresnel, obstruction, and both directional budgets. See [RF models and validation](docs/RF_NUMERICAL_REFERENCE.md). Missing evidence remains indeterminate. Automatic routing and release benchmarks remain tracked in the OpenSpec change. Fonts and application dependencies are bundled locally or use system fonts.

Editable fixed-wing and multirotor demonstration profiles are available under Aircraft, radio and constraints. Their provenance explicitly identifies synthetic values. Cruise airspeed and propulsion efficiency are editable for both classes. See [energy model inputs and limits](docs/ENERGY_MODELS.md) for independent arithmetic fixtures, equipment accounting, wind, reserve and motion assumptions.

Use Equipment combinations to select antenna profiles and transmit powers, then analyse the manual route. Cards share the scene's margin thresholds and expose directional minima, time, climb, energy breakdown, reserve, assumptions and computed tradeoffs. Sharp corners/turnarounds require finite motion geometry and cannot be accepted by the constant-speed manual estimate.

Coverage and altitude views calculate a bounded horizontal slice or distance–altitude heatmap for the selected scenario. Enter datum altitude(s) and the fixed airborne heading/pitch/bank used across the grid. Values use the shared power/margin scales; grey marks incomplete evidence. These are sampled RF views, not verified flight routes. Changing mission/scenario/view inputs cancels obsolete work; [contract and memory limits](docs/CONTRACTS.md) apply.
