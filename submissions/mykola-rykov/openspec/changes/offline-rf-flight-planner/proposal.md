# Proposal

## Why

Flight planners need to compare terrain-dependent radio connectivity and aircraft endurance without network access. This change turns `docs/INITIAL_PLAN.md` into a verifiable v1 contract for an offline regional 3D RF flight planner.

## What Changes

- Deliver a static desktop application with installed terrain packages and a localhost launcher, usable offline from first launch.
- Support manually drawn and automatically generated fixed-wing and multirotor missions, one fixed launch-point ground station, and at most 100 km total mission distance including a selected return leg.
- Estimate independent uplink/downlink margins, terrain and Fresnel clearance, aircraft energy, battery reserve, and equipment mass/drag effects.
- Compare routes, antenna configurations, and transmit-power settings with consistent visual scales and explanations derived from numerical differences.
- Validate numerical models, terrain integrity, offline distribution, and measured performance in five delivery stages.
- Exclude accounts, remote services, an application backend, mobile optimization, live telemetry, aircraft control, airspace-rule checks, and detailed interference, multipath, foliage, or weather simulation.

## Capabilities

### New Capabilities

- `terrain-packages`: Regional package preparation, provenance, size limits, validity, conservative elevations, and local tile access.
- `offline-runtime`: Bundled desktop runtime, 3D terrain interaction, worker lifecycle, offline distribution, and performance limits.
- `mission-planning`: Mission editing, equipment and aircraft configuration, explicit units/datums, defaults, and versioned JSON persistence.
- `rf-analysis`: Directional two-way RF budgets, terrain diffraction, Earth curvature, Fresnel reporting, and uncertainty handling.
- `aircraft-energy`: Distinct aircraft power models, equipment penalties, wind, time integration, and reserve feasibility.
- `route-search`: Bounded hierarchical alternatives, aircraft motion constraints, return legs, final-route verification, and qualified search outcomes.
- `result-comparison`: Shared scene, coverage/profile views, comparison metrics, computed explanations, and feasibility evidence.

### Modified Capabilities

None. The project has no existing capability specs.

## Impact

Introduces TypeScript, Vite, React, Three.js/WebGL2, numerical Web Workers, a Python/GDAL maintainer build process, bundled Natural Earth context, and a local static-file launcher. Interfaces are versioned terrain manifests, mission JSON, scenario results, and worker messages; no HTTP application API is required. Source licensing/attribution and offline assets become distribution obligations. Implementation must establish a `pnpm check` gate; no package manifest or runnable application currently exists.
