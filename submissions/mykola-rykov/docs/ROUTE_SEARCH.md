# Route search and verification

Supply a supported aircraft power model, battery, minimum/maximum altitude and minimum DSM clearance, then choose **Find verified route alternatives**. The corridor defaults to 10 km and is clipped to package coverage. Waypoints remain mandatory in order. Return missions visit destination, reverse waypoints and launch with a finite turnaround; inbound heading, wind, antenna attitude, both RF links and energy are recalculated.

The three objectives seek shortest feasible distance, lowest electrical energy and highest minimum two-way margin. The solver retains nondominated distance/energy/margin labels in heading/altitude buckets so a short but battery-expensive partial route cannot discard a longer efficient route. Distance and energy include both legs; takeoff/landing allowance is charged once. Identical route/equipment pairs and metric-dominated final alternatives are removed. Equipment settings remain part of scenario identity.

Dominance comparisons suppress numerical noise within 10⁻⁶ m and 10⁻⁹ Wh/dB; these arithmetic tolerances do not relax mission constraints or describe field accuracy.

## Geometry and bounds

The lazy graph uses approximately 250 m horizontal and 50 m vertical buckets and 22.5° heading buckets. Straight and circular primitives span 250, 500 or 750 m, with 0/±22.5°/±45° turns and 0/±50 m height changes. Longer primitives permit a 50 m climb without exceeding normal fixed-wing climb limits. Cubic vertical easing reaches zero climb at joins. Exact endpoint positions/headings are retained; buckets merge nearby search labels without snapping the physical geometry. Circle-tangent goal connections reach exact endpoints and waypoints, including destinations behind the current heading. Required bank/acceleration comes from the analytic curve's wind-corrected velocity derivative; equipment loads participate in tilt checks.

Distance lower bounds use the remaining straight-line distances between mandatory points. Energy lower bounds use level, zero-bank power and the maximum possible ground speed; positive climb/bank/acceleration costs never reduce that bound. Margin upper bounds use maximum supported antenna gains, zero diffraction and free-space losses at mandatory points. These bounds prune labels only when they cannot improve a found objective candidate. State merging and caps still prevent a global optimality claim.

Per objective/equipment: at most 256 expanded states, 4,096 retained labels, six labels per bucket and eight goal labels. Edge evaluations are capped at 4,096 per equipment across objectives. At most 24 candidates per equipment undergo final verification. Edge results use a 16 MiB LRU cache, cleared between equipment configurations. Final stored results have a 64 MiB estimated object-storage limit; the shared numerical analyzer separately guards 128 MiB allocations. Motion primitives have at most 20,001 samples, combined geometry at most 100,000. Existing terrain/profile/propagation caches remain bounded at 32/32/16 MiB. No dense regional RF volume is allocated.

Workers checkpoint between graph edges, labels, terrain batches and final analysis batches. Cancellation and superseded-job guards apply to progress and results. Progressive cards contain already verified candidates found so far while other objective/configuration searches continue. A final result ends the job. If none survives, the message identifies corridor, 250/50 m resolution and working limits and says that no feasible route was found within those bounds; it does not claim universal impossibility. Missing terrain anywhere along a final radio ray prevents acceptance.

## Final geometry

Coarse RF/clearance samples use intervals no greater than 125 m, plus ≤5° turn intervals. Promising candidates are resampled from their analytic geometry at half the finest terrain-cell spacing (15 m for the installed 30 m region), plus ≤5° turn intervals. The horizontal/vertical derivative bound controls subdivisions, so three-dimensional sample separation does not exceed this interval. Half-cell samples add evidence between coarse nodes, including near ridges and constraint thresholds; every radio ray separately samples finest terrain at ≤one cell spacing. Unknown terrain remains unknown and cannot justify a feasible route.

Final analysis repeats all altitude, conservative DSM clearance, motion, distance, reserve and directional RF constraints. Known local clearance failures remain evaluated failures even if RF evidence is unknown. Coalescing adjacent straight segments can smooth vertical easing; mandatory waypoint joins are preserved. Every changed geometry repeats complete final verification. A failing smoothing proposal leaves the verified original in place.

Motion uses the existing quasi-steady models: constant cruise airspeed, constant density/wind, no descent/braking regeneration and no configured roll-rate or jerk model. Multirotor turn acceleration/tilt is checked and changes antenna attitude; the speed-power table does not contain an independently calibrated turn-induced power correction. Illustrative presets remain uncalibrated. These are explicit exported model assumptions.

## Verification evidence

`tests/routing-motion.test.ts` checks the independent quarter-circle endpoint and bank formula, wind-dependent bank, feasible coarse climb, and climb/acceleration/tilt rejection. `tests/routing-search.test.ts` checks resource-aware labels, distinct objective winners, all mission rejection classes, real graph search, independent return RF/energy, finest-grid ridge rejection, smoothing rejection, cancellation, bounded edge caches, deduplication and domination. `browser/routing.spec.ts` exercises real local worker search, cards, JSON export, cancellation and a qualified no-result with external requests blocked.

Run `pnpm check`, then `pnpm test:browser` against that completed build. These are functional checks. The separate 24 GB, 30 FPS, 5/30 second, 12-configuration benchmark targets are not claimed by these fixtures.

Recorded validation on 2026-10-04: `pnpm check` passed (83 TypeScript tests, 10 Python terrain tests, TypeScript/ESLint/build/local-asset validation). All eight Playwright tests passed in 26.8 seconds, including the offline routing workflow. Strict OpenSpec validation passed. Browser suite duration is not a routing-performance benchmark.
