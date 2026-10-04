# Design

## Context

See `proposal.md` for motivation and `docs/INITIAL_PLAN.md` for the source plan. The repository currently contains documentation and OpenSpec configuration, without application code, a package manifest, or tests. This is a new architecture, with numerical correctness, regional data packaging, and desktop performance as primary constraints.

## Goals / Non-Goals

**Goals:** isolate deterministic numerical models from presentation; make validity, datums, units, and model assumptions explicit across interfaces; share reusable terrain/propagation work across equipment comparisons; deliver independently verifiable milestones.

**Non-Goals:** a complete propagation simulator, a global terrain download service, a dense regional 3D RF volume, or a backend owning mission state. Product exclusions are defined in the proposal.

## Decisions

### 1. Static browser application and local distribution

Use TypeScript, Vite, a small React interface, and one Three.js/WebGL2 scene with top-down and perspective modes. Bundle fonts, dependencies, workers, geographic context, and installed regional packages. A small localhost launcher serves static files only; calculations remain in the browser. This avoids file-URL worker/fetch restrictions and makes a clean first launch offline possible. A service-worker-only distribution would require a prior installation/cache warm-up; a remote backend would contradict offline operation. Launcher OS packaging details can be resolved during delivery without changing the runtime interfaces.

Keep mission/editor state independent of Three.js scene objects. Use buffered terrain meshes with distance-based detail, grayscale elevation, and fixed directional lighting. Share one scene between comparisons to limit GPU/memory costs. Natural Earth coastlines, boundaries, and selected labels provide local geographic context; coordinate entry handles precise placement.

### 2. Maintainer-built regional terrain

Prepare packages outside the application with Python and GDAL. Manually obtained Copernicus GLO-30 is the primary source; record an explicit GLO-90 fallback where needed. Optional USGS/Geoscience Australia inputs must retain provenance, resolution, and datum metadata. Source references and attribution requirements remain those in the initial plan and must be checked during package preparation.

Mosaic and reproject into a regional metric coordinate system centered on the package. Emit 256 x 256-cell tiles with signed 16-bit metre elevations, explicit byte order, independent validity masks, and progressively halved overviews. Display grids use smooth resampling; obstruction grids preserve maximum source peaks at each level. Quantization error remains distinct from source accuracy. Tile padding and seams must not introduce invalid zero heights or lose ridges. Mark only positively identified ocean as zero; land gaps remain unknown.

`TerrainPackageManifest` records schema version, region id, geographic/projected bounds, coordinate-system definition, vertical datum, source resolution/accuracy, grid spacing, tile and level indexes, representation/encoding, masks, provenance, attribution, and checksums. Validate unsupported formats and corruption before analysis uses a tile. A build-time byte count rejects packages of 500,000,000 bytes or more, including terrain, overviews, masks, metadata, padding, and bundled regional context, without relying on compression.

Start with one approximately 220 x 220 km region at 30 m spacing; the under-350 MB estimate is provisional until measured. Coverage must include each entire station-to-aircraft path, not only the route corridor. Treat antimeridian longitude wrapping, high-latitude projection behavior, negative heights, and edge launches as explicit fixtures. Keep WGS84 horizontal coordinates for interchange and project for regional rendering/search; all vertical values carry their datum. Incompatible datums require a documented transformation or an invalid result, never silent mixing.

### 3. Versioned interfaces and deterministic workers

`MissionConfig` includes region/version reference, endpoints/waypoints, total distance cap, one-way/return selection, aircraft/power model, battery/reserve, radio modes, independent powers/sensitivities, ground/aircraft antenna configurations, orientation, constraints, wind, uncertainty, and datum-bearing altitudes. Reject invalid values and unsupported import versions with actionable messages. JSON exports retain model assumptions for reproducible comparisons; no database is needed.

`ScenarioResult` includes scenario/model/terrain identity, route samples with heading/attitude, separate link-budget components, clearance/obstruction evidence, distance/time/climb, energy breakdown, reserve, violations, and feasibility status. Distinguish feasible, evaluated infeasible, and indeterminate due to incomplete data. A successful bounded search produces verified routes; a failed search is a qualified search outcome rather than a universal infeasibility claim.

Workers accept versioned messages with job ids, report progress, transfer typed arrays, and support cancellation. Check cancellation between bounded work batches and yield so cancel messages can be handled. Reject stale progress/results at the UI when mission or equipment state changes. Never block scene interaction on numerical loops. Use bounded terrain/profile/result caches with eviction and cancellation-safe ownership of transferred buffers; avoid retaining arrays for every compared scenario indefinitely.

### 4. Independently validated RF kernel

Implement the selected ITU-R P.525 free-space calculation and P.526 delta-Bullington terrain-profile method explicitly. During implementation, pin the recommendation editions, equation references, units, and independent reference fixtures. No validation claim is made by this planning change.

For each direction compute received power as transmit power plus gains minus free-space, diffraction, cable, polarization, and installation losses. Subtract receiver sensitivity and explicit uncertainty allowance to obtain available margin, then compare with the user-required margin. The smaller directional margin governs the RF constraint. Frequency inputs are limited to 100 MHz through 6 GHz.

Apply curvature using configurable effective Earth radius (default k = 4/3); report first-Fresnel-zone and 60% clearance separately from diffraction loss. Do not add an arbitrary Fresnel loss. Evaluate ground gains in the fixed azimuth/elevation frame and airborne gains using heading, climb attitude, and fixed-wing bank. Terrain-height uncertainty affects the evaluated obstruction envelope; RF-loss uncertainty is a separately reported allowance. Record both to avoid double counting.

Cache terrain profiles and propagation by station/height, terrain identity, frequency, position/altitude, curvature, and terrain uncertainty/model version. Equipment gain, sensitivity, power, and non-propagation losses are applied separately, allowing propagation reuse when only power or antenna selection changes. Coverage slices require an explicit airborne heading/attitude assumption. Full simulation of multipath or weather is outside the selected model; richer methods would require more data and validation than v1 supports.

### 5. Aircraft energy and motion share physical constraints

Fixed-wing power uses mass, wing area, lift/drag polar, cruise speed, propulsive efficiency, climb limits, and maximum bank. Derive turning radius and bank-induced drag so the route solver and energy integrator use compatible turn geometry. Multirotor power uses a calibrated power-versus-airspeed table, hover power, mass/climb corrections, acceleration limits, and maximum tilt. A single generic power model cannot represent both classes adequately.

Both models include antenna mass/additional drag area, avionics, radio electrical consumption, and takeoff/landing allowance. Convert RF output to electrical draw through a measured input-power table or amplifier efficiency model. Integrate electrical power over segment duration using airspeed and optional constant wind to derive ground speed; invalid/impossible segment motion cannot produce negative durations. Do not credit descent regeneration. If battery capacity or model data is missing, withhold energy feasibility while preserving available RF results. Illustrative presets remain explicitly uncalibrated.

### 6. Bounded hierarchical route search

Begin with a user-adjustable 10 km-wide corridor around the direct path or waypoints, constrained by installed coverage. Build a coarse graph near 250 m horizontal/50 m vertical spacing; use heading state and feasible turns for fixed-wing routes. Search shortest feasible, lowest-energy, and highest-minimum-margin objectives, retaining resource-aware labels where distance and energy constraints would otherwise discard valid solutions. A purely positional shortest-path search would miss aircraft dynamics and battery constraints.

Enforce total mission distance, reserve, clearance, user altitude bounds, climb/turn limits, and margin on both legs. Search/refine promising corridors with finer terrain; evaluate return legs independently for wind and heading-dependent gains. Re-evaluate final geometry at intervals no larger than the finest available terrain cell, with additional turn/ridge/threshold samples. Any smoothing triggers the same verification again. Reject unverified candidates, deduplicate routes, and expose nondominated alternatives across distance, energy, and minimum margin. Search cancellation and bounded working sets take precedence over exhaustive enumeration.

### 7. Results and evidence

Use shared colour scales across scenario cards and the main scene. Provide route power/margin colouring, selected-altitude coverage slices, distance-altitude heatmaps, and point inspection of terrain, Fresnel clearance, and limiting obstruction. Cards expose directional minimum margins, distance, duration, climb, energy, reserve, assumptions, and feasibility reasons. Derive pros/cons from computed metric differences; avoid unsupported generic equipment claims.

### 8. Validation and performance gates

Establish `pnpm check` for type, code-quality, and automated validation checks. Make terrain validation reproducible through fixture generation and documented Python/GDAL setup; the final delivery gate also runs the package validator and offline/benchmark checks rather than pretending lint alone covers them.

Validate analytical free-space, independent single/multiple-ridge diffraction fixtures, measurable 100 km curvature, rotations, asymmetric radios, and expected power dB changes. Validate constant-power energy by hand calculations and trends for mass, drag, climbs, turns, wind, and return legs. Verify final sampled constraints after refinement/smoothing and unknown-data behavior.

Benchmark on a documented 24 GB desktop-class laptop: at least 30 FPS interaction, coarse results within 5 seconds, and refined results within 30 seconds for 12 equipment configurations. Record region, terrain resolution, mission/corridor/altitude bounds, hardware/browser, cache state, memory peaks, timing, and dataset/configuration versions. Treat these as acceptance targets, not achieved claims. If a gate fails, profile and revise implementation before accepting that stage; do not silently weaken the target.

## Risks / Trade-offs

- Surface-model and quantized terrain can miss obstacles or overestimate ground heights -> retain provenance/error settings, use conservative grids, label DSM-relative heights, and present engineering estimates.
- Missing terrain anywhere along a radio ray creates false confidence -> propagate validity through profile, analysis, search, and UI; refuse confident feasibility.
- Projection/datum mistakes cause geometric errors -> test seams, antimeridian, high latitudes and negative elevations; reject incompatible inputs.
- Heading/altitude graph and resource constraints can grow rapidly -> hierarchical corridors, bounded caches, progressive results, cancellation, and measured benchmarks.
- Numerical references or equipment presets can be misleading -> pin independent fixtures and model editions; label uncalibrated examples and show assumptions.
- Package budget may exclude a desired region/resolution -> measure uncompressed output and adjust geographic coverage or explicitly document coarser sources, never hide gaps.

## Migration Plan

No existing application data needs migration. Deliver sequentially: one package/offline viewer; manual-route RF; aircraft/equipment comparison; bounded routing/final verification; measured multi-region validation and launcher distribution. Preserve versioned manifests and mission formats between stages. Release immutable application/package versions with matching manifests/checksums; rollback selects the previous compatible bundle and leaves exported mission files intact. Unsupported newer mission/package versions are rejected explicitly.

## Open Questions

- Which geographic bounds should the first shipped region cover? Select before source acquisition; the builder and coverage contract are region-independent.
- Which reference hardware/browser combination will be recorded for the 24 GB benchmark?
- Which measured aircraft/radio datasets will supplement the visibly illustrative presets?
- Which launcher packaging conventions and supported desktop OS combinations should the first release document?
