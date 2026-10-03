# Tasks

All items describe future implementation and remain unchecked. Follow the five delivery stages from `docs/INITIAL_PLAN.md`; specs define acceptance behavior and `design.md` defines the approach. Region, measured profile datasets, launcher packaging, and benchmark hardware are deferrable selections recorded in the relevant tasks, not assumed choices. Run `pnpm check` at each stage once established; release acceptance additionally requires package, offline-installation, and performance evidence.

## 1. Stage 1 - Foundation, regional terrain, and offline viewer

- [x] 1.1 Scaffold TypeScript/Vite/React/Three.js and a static build; establish `pnpm check` for type checks, code quality, and automated validation, and verify a clean install, build, and check pass.
- [x] 1.2 Define versioned terrain manifest, mission, result, and worker message contracts with explicit units, validity, coordinate/vertical references, and feasibility states; verify valid fixtures and invalid/unsupported-version rejection cases.
- [x] 1.3 Select and record first-region bounds, projection, source tiles, datum, ocean-identification source, and required attribution; verify the acquisition inventory covers intended station-to-aircraft paths and explicitly marks gaps or coarser fallback.
- [ ] 1.4 Establish the Python/GDAL package builder with mosaicking/reprojection and reproducible setup instructions; verify a small source fixture builds using the documented commands.
- [ ] 1.5 Emit signed 16-bit metre 256 x 256 tiles, smooth display grids, maximum-preserving obstruction grids, masks, and halved overviews; verify narrow-ridge preservation, negative elevations, and missing-land/known-ocean fixtures.
- [ ] 1.6 Add manifest generation, checksums, provenance/attribution, and uncompressed byte-budget validation; verify corruption/version rejection and failure at 500,000,000 bytes including regional context.
- [ ] 1.7 Implement regional coordinate transforms, datum compatibility, and tile seam handling; verify seam, antimeridian, high-latitude, and incompatible-datum fixtures before RF work uses sampling.
- [ ] 1.8 Build the selected approximately 220 x 220 km regional package and bundle Natural Earth context; verify measured output is below the size cap and the manifest accurately reports actual coverage/resolution.
- [ ] 1.9 Implement local tile loading and bounded cache eviction; verify repeated navigation releases inactive tiles and invalid/corrupt tiles cannot enter analysis.
- [ ] 1.10 Implement one WebGL2 scene with grayscale terrain, fixed lighting, distance-based detail, top-down/perspective modes, coordinate entry, and coverage metadata; verify placement/view switching and the unsupported-WebGL2 message.
- [ ] 1.11 Establish the worker job-id/progress/cancel lifecycle and transferable-array ownership; verify cancellation is processed during batched work and superseded progress/results never overwrite current state.
- [ ] 1.12 Bundle all runtime dependencies/assets and provide a development static launcher; verify a clean viewer starts with external networking blocked, document package installation and surface/datum semantics, and pass `pnpm check` for this stage.

## 2. Stage 2 - Mission editing and manual-route RF

- [ ] 2.1 Implement region/launch/destination/waypoint editing, one-way/return distance accounting, and one fixed launch-point station; verify 60 km out plus 60 km back violates a 100 km limit and edge launches expose limited coverage.
- [ ] 2.2 Implement aircraft/radio/antenna inputs, fixed pointing, independent directional powers/sensitivities, constraints, uncertainty, and explicit defaults; verify one-way, zero wind, 20% reserve, adjustable 10 dB margin, and required altitude/clearance inputs.
- [ ] 2.3 Implement versioned mission JSON import/export with configuration and terrain/model references; verify round-trip reproduction and actionable rejection of unsupported versions/invalid numbers without replacing the active mission.
- [ ] 2.4 Pin the selected P.525/P.526 editions and equations, units, tolerances, and independently sourced single/multiple-ridge fixtures; deliver a numerical-reference document and verify fixtures are independent of the implementation being tested.
- [ ] 2.5 Implement full radio-ray terrain sampling with validity and curvature default k = 4/3; verify a gap away from the route makes analysis indeterminate and a 100 km fixture shows the documented curvature difference.
- [ ] 2.6 Implement free-space attenuation and delta-Bullington diffraction; verify flat analytical and independent single/multiple-ridge cases within recorded tolerances and reject frequencies outside 100 MHz-6 GHz.
- [ ] 2.7 Implement first-Fresnel-zone/60% clearance and limiting-obstruction evidence; verify threshold crossings alter clearance without adding an arbitrary Fresnel penalty to the RF budget.
- [ ] 2.8 Implement gain coordinate frames, heading/climb/bank rotations, fixed ground pointing, and polarization/cable/installation losses; verify beam departure and reverse heading change the expected antenna gains.
- [ ] 2.9 Compose separate directional budgets, uncertainty, and weaker-link feasibility; verify asymmetry, exact expected 3 dB power effects, and explicit unknown-data status.
- [ ] 2.10 Add worker-based manual-route analysis and version-aware bounded profile/propagation caching; verify progress/cancel behavior and reuse for power-only changes with unchanged results.
- [ ] 2.11 Implement route power/margin colours and point inspection of terrain, Fresnel, obstruction, and both links; verify low-margin/unknown samples expose evidence, document model scope and uncertainty, and pass `pnpm check` for this stage.

## 3. Stage 3 - Aircraft energy and equipment comparisons

- [ ] 3.1 Implement editable aircraft/equipment profiles and clearly illustrative presets; record provenance for any selected measured datasets and verify missing battery/model data withholds energy feasibility without hiding available RF output.
- [ ] 3.2 Implement fixed-wing lift/drag, efficiency, cruise/climb power, bank drag, and turn-radius constraints; verify analytical turn fixtures and energy trends for mass, drag, climbs, and bank.
- [ ] 3.3 Implement multirotor calibrated speed-power data, hover, mass/climb corrections, acceleration, and tilt constraints; verify hover/climb fixtures and rejection of infeasible motion.
- [ ] 3.4 Integrate electrical power over segment time, including antenna loads, avionics, measured/efficiency-based radio input, and takeoff/landing allowance; verify hand-calculated constant-power cases, radio power accounting, and no descent regeneration.
- [ ] 3.5 Implement constant wind, independent return-leg timing/energy, and reserve checks; verify reverse-heading wind cases, impossible progress rejection, and reserve boundary failures.
- [ ] 3.6 Enumerate selected antenna/power combinations while reusing invariant propagation; verify one configuration's equipment changes do not alter another and all selected combinations receive distinct scenario identities.
- [ ] 3.7 Implement comparison cards with common scales, directional minima, distance/time/climb, energy breakdown, reserve, and feasibility reasons; verify consistent units/scales and unavailable energy metrics.
- [ ] 3.8 Implement altitude coverage slices and route distance-altitude heatmaps using bounded worker requests; verify directional heading/attitude assumptions are displayed and obsolete view jobs are cancelled.
- [ ] 3.9 Generate pros/cons from numerical differences; verify the 7 km/5 dB comparison fixture and no invented unavailable metrics, document power-model inputs/calibration limits, and pass `pnpm check` for this stage.

## 4. Stage 4 - Bounded automatic routing and final verification

- [ ] 4.1 Implement adjustable waypoint/direct-route corridors with a 10 km default and package clipping; verify corridor changes restrict explored candidates and unknown coverage cannot support feasible routes.
- [ ] 4.2 Build the coarse approximately 250 m horizontal/50 m vertical graph and aircraft motion states; verify fixed-wing heading-aware turn geometry and multirotor climb/acceleration/tilt constraints.
- [ ] 4.3 Implement shortest-feasible search with distance/energy resource accounting and all mission constraints; verify rejection fixtures for distance, reserve, clearance, altitude, climb/turn, and either directional margin.
- [ ] 4.4 Add lowest-energy and highest-minimum-margin searches, deduplication, and nondominated filtering; verify a fixture with distinct objective winners plus duplicate/dominated candidates.
- [ ] 4.5 Implement return-mission evaluation with separate inbound heading, wind, orientation, RF, and energy; verify outbound-only success cannot pass the complete return mission.
- [ ] 4.6 Refine promising corridors against finest available terrain and verify samples at no more than terrain cell spacing with extra ridge/turn/threshold samples; verify a ridge missed by the coarse graph invalidates or repairs the final route.
- [ ] 4.7 Add route smoothing only with full revalidation of modified geometry; verify a smoothing-induced clearance or motion violation is rejected before publication as feasible.
- [ ] 4.8 Add progressive bounded search, cancellation, and qualified no-result messages; verify abort responsiveness, memory eviction, and wording that identifies corridor/resolution without asserting universal impossibility.
- [ ] 4.9 Integrate verified route alternatives with scenario cards and JSON assumptions; document objectives, search bounds, sampling guarantees, and outcome states, and pass end-to-end fixtures and `pnpm check` for this stage.

## 5. Stage 5 - Benchmarks, additional regions, and release integration

- [ ] 5.1 Record the 16 GB benchmark laptop/browser, representative mission/region, altitude/corridor bounds, 12 equipment configurations, versions, and cache conditions; deliver a reproducible benchmark protocol and verify its setup runs as documented.
- [ ] 5.2 Measure interaction FPS, coarse/refined latency, cancellation, and peak memory under repeated comparisons; verify at least 30 FPS, coarse results within 5 seconds, refined results within 30 seconds, and bounded caches, profiling/remediating failures before acceptance.
- [ ] 5.3 Build and validate additional regional fixtures/packages using the established pipeline, including fallback-source metadata and cross-region geographic edge cases; verify package budgets, checksums, attribution, seams, datum handling, negative elevations, antimeridian, and high-latitude behavior remain correct.
- [ ] 5.4 Select/document the first-release desktop OS/browser support matrix and package the static localhost launcher with application, workers, fonts, context, and regions; verify clean installation and launch on every declared supported target.
- [ ] 5.5 Run the full mission-edit/import/analyze/compare/search/export workflow from a clean networking-disabled installation; verify zero external runtime dependencies and inspect exported mission reproduction with the distributed versions.
- [ ] 5.6 Publish local release instructions, model/terrain attribution, measured acceptance results, package installation, troubleshooting, version compatibility, and rollback procedure; verify each documented launch/validation step against the release bundle.
- [ ] 5.7 Complete release integration validation: verify `pnpm check` is green, package validators pass, final-route numerical/constraint fixtures pass, and offline/performance evidence is recorded before marking implementation complete.
