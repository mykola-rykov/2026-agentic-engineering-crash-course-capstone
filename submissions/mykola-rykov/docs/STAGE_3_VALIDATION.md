# Aircraft energy and comparison validation

Stage 3 adds editable synthetic aircraft profiles, the independently tested fixed-wing and multirotor kernels, segment-time electrical integration, constant wind and reserve checks, equipment selections, comparison cards and sampled RF views. The first terrain package remains Alpine–Adriatic GLO-30/EGM2008; no measured aircraft preset is claimed.

`pnpm check` passes type/lint checks, 67 TypeScript tests, 10 required Python terrain tests, production build and bundled-entry validation. `pnpm test:browser` passes seven desktop Chromium tests using the static localhost launcher and SwiftShader. External requests are blocked for the RF/energy/equipment/view workflow. This is functional browser evidence; SwiftShader does not establish the 24 GB laptop's hardware-GPU performance targets.

| Evidence | Verification |
| --- | --- |
| Editable cruise/efficiency | Browser changes multirotor inputs independently; old profiles retain missing fields as null |
| Missing battery/model | Manual RF output remains accessible and energy is unavailable |
| Fixed-wing model | Independent polar, 45° radius, mass, drag, bank, climb and efficiency fixtures |
| Multirotor model | Hover, speed interpolation, mass, climb and added-drag hand fixtures; acceleration/tilt/table-support rejection |
| Electrical accounting | 240 W/1800 s plus avionics/radio/allowance totals 126.125 Wh; ground equipment is excluded |
| Wind/reserve | Separate reverse durations, crosswind air heading, impossible-progress rejection, equality/exceedance boundaries |
| Equipment isolation | Twelve cartesian selections have distinct ids and nested ownership; changing one leaves another unchanged and reuses propagation |
| Comparison scales | Scene and cards call the same threshold function with identical dB/dBm units |
| Computed tradeoffs | 7 km/5 dB fixture; incomplete RF/energy yields unavailable comparisons |
| Coverage/heatmap | Ordered axes/altitude rows, explicit attitude, finest-grid radio rays, masks, buffer lengths, bounded dimensions and stale-result rejection |
| Browser workflow | Four scenarios, computed Wh/time/reserve, scenario selection, slice/heatmap switching, cancellation and replacement attitude |

RF view requests are bounded to 2048 cells (UI default 144), with 8192 path points maximum. Fresh Float32 power/margin and Uint8 validity buffers are transferred, never cached arrays. One route worker and one view worker each own bounded terrain/profile/propagation caches; a view allocates no regional 3D volume. Cache configuration is documented in [contracts](CONTRACTS.md); peak process memory and timing still require Stage 5 measurement.

The [energy model document](ENERGY_MODELS.md) records constants, equations, arithmetic tolerances, electrical scope, calibration and motion approximations. Sharp manual corners and immediate turnarounds lack admissible continuous geometry and cannot pass motion feasibility; their energy remains a diagnostic estimate. Stage 4 must generate and verify finite turn/acceleration geometry. Unknown radio rays or absent user altitude/clearance constraints cannot produce overall feasibility. Coverage/heatmap samples show RF values, not accepted flight routes.
