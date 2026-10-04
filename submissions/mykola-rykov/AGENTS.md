# Working in this repository

Offline RF Flight Planner is a local React/TypeScript application for terrain-based mission planning, directional radio-link analysis, aircraft energy estimates, and bounded route search. Vite builds the UI, Three.js renders terrain, Web Workers run analysis, and Python/GDAL prepares terrain packages.

## Setup and commands

- Use Node.js >=22.12 and the pnpm version declared in `package.json`. Install dependencies with `pnpm install --frozen-lockfile`.
- Run `pnpm dev` for development. Servers bind to localhost.
- Python with GDAL >=3.7 and NumPy is required even for the full test suite. Set `TERRAIN_PYTHON` if needed; use the existing `scripts/terrain-python.mjs` wrapper. See `docs/TERRAIN_BUILD.md` for setup.
- `pnpm check` runs TypeScript, ESLint, Vitest, Python terrain tests, the production build, and local build-asset validation.
- Browser acceptance is separate: run `pnpm browser:install` once, then `pnpm test:browser` after a fresh build. Playwright serves `dist/`, not the development source.
- To run the built app, use `pnpm build` then `pnpm start` (default `http://127.0.0.1:4173`).

## Definition of done

**`pnpm check` must be green.** Run it before declaring work complete. Do not skip Python fixtures or weaken checks to get a pass. If a prerequisite or existing failure blocks validation, report the exact blocker and which checks ran; do not claim completion.

For changes to UI interactions, scene rendering, workers, or offline workflows, also run the relevant Playwright tests against the rebuilt app. Add regression coverage for changed behavior and independent numerical fixtures for model changes. Documentation-only edits do not need new tests.

## Where to work

| Area                                                 | Location                                 |
| ---------------------------------------------------- | ---------------------------------------- |
| App composition, styles                              | `src/App.tsx`, `src/styles.css`          |
| Mission editing, import/export, equipment, result UI | `src/mission/`                           |
| Terrain scene and shared colour scales               | `src/scene/`                             |
| Runtime schemas and inferred types                   | `src/contracts/`                         |
| Coordinates, sampling, validated tile loading        | `src/terrain/`                           |
| RF, energy, and route-search kernels                 | `src/rf/`, `src/energy/`, `src/routing/` |
| Worker protocol execution, cancellation, caches      | `src/workers/`                           |
| Terrain acquisition/build tooling                    | `tools/terrain/`, `terrain/regions/`     |
| Unit/numerical fixtures, Python tests, browser tests | `tests/`, `tests/terrain/`, `browser/`   |
| Local server, build validation, tool wrappers        | `scripts/`                               |

Read the relevant implementation and tests before editing. Keep numerical logic in the domain modules rather than React components, and use the existing worker lifecycle for expensive work. Follow the surrounding code style and strict TypeScript settings; preserve explicit handling of optional fields and unchecked array access.

## Domain rules to preserve

- **Offline runtime:** bundle dependencies/assets locally or use system fonts. Do not add CDN assets, remote map tiles, telemetry, or runtime service dependencies. Network acquisition belongs to maintainer terrain tooling.
- **Validate boundaries:** use the parsers in `src/contracts/` for imported JSON and worker messages. Retain current state on invalid imports. Schema/protocol changes need an explicit compatibility decision and corresponding fixtures; do not silently accept unsupported versions.
- **Keep units and references explicit:** follow existing unit suffixes. Geographic coordinates use WGS84; projected distances use metres. Datum altitudes and above-DSM heights require a terrain-aware conversion and matching vertical datum.
- **Unknown is not zero:** missing terrain, RF, or energy evidence stays unknown/indeterminate. Never infer ocean from missing data or zero elevation, invent missing aircraft inputs, or mark a route feasible without complete required evidence. Preserve the distinction between known failures and incomplete evidence.
- **Use conservative terrain for analysis:** display averages and visual exaggeration are presentation only. Obstruction sampling must retain peaks and unknown validity. DSM-relative height is not bare-earth clearance. Preserve package checksums, byte limits, and path-containment validation.
- **Check both radio directions and complete missions:** return-leg geometry, antenna attitude, wind, motion constraints, energy, and reserves matter. Synthetic aircraft presets must remain labelled as illustrative.
- **Verify route candidates:** preserve final fine-resolution terrain/RF/energy verification, including after smoothing. A bounded search with no candidate does not prove universal infeasibility or global optimality. Sampled coverage/altitude views are not verified routes.
- **Bound work and memory:** retain cache/grid/search limits, yield between numerical batches, cancel superseded jobs, and reject stale progress/results. Do not detach buffers still owned by a cache or allocate a dense regional RF volume.

## Design references and workflow

- Read `docs/CONTRACTS.md` for schemas, units, terrain sampling, and worker ownership.
- Use `docs/RF_NUMERICAL_REFERENCE.md`, `docs/ENERGY_MODELS.md`, and `docs/ROUTE_SEARCH.md` for model assumptions and validation evidence.
- Use `docs/TERRAIN_BUILD.md` for package construction and `docs/VIEWER_VALIDATION.md` for viewer acceptance. `README.md` describes setup and current capabilities; `docs/INITIAL_PLAN.md` provides original planning context.
- When working on an OpenSpec change, read its proposal, design, specs, and tasks under `openspec/changes/<change>/`. Keep those artifacts consistent with the implemented scope and mark tasks complete only after verification. Do not treat archived changes or unchecked plans as proof of current behavior.
- Update relevant documentation when changing contracts, model assumptions, setup, or user-visible behavior. Functional tests do not establish performance benchmark targets; report measured evidence separately.

## Repository hygiene

- Inspect `git status` before editing and preserve unrelated in-progress changes.
- Keep changes focused; avoid unrelated refactors and new dependencies unless needed for the task.
- Do not commit generated builds, caches, browser reports, or large terrain outputs. Ignored locations include `dist/`, `.cache/`, `terrain/raw/`, `terrain/prepared/`, `terrain/packages/`, and `public/terrain/`.
- Terrain builders/installers refuse to overwrite existing packages. Use fresh output directories; install with `pnpm terrain:install <package-directory>` and rebuild to include installed terrain in `dist/`.
- In the handoff, summarize what changed, validation actually run, and any remaining blockers or limitations.
