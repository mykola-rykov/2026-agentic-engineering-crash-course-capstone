# Tasks

## 1. Recoverable coordinate editing and RF views

- [x] 1.1 Introduce validated latitude/longitude string drafts for launch, destination, and waypoints in the editor/App state boundary, preserving the last valid domain coordinate and unrelated settings; add browser regressions for clearing each coordinate kind, correction, incomplete/out-of-range input, and inclusive bounds, and verify no `pageerror` or UI unmount occurs.
- [x] 1.2 Synchronize drafts on import, region changes, selected-point assignment, and waypoint removal using stable editor-only waypoint identities; verify browser cases preserve unrelated drafts and never transfer a removed waypoint's error to its neighbor, including replacement with the same last committed coordinate.
- [x] 1.3 Propagate aggregate coordinate validity to analysis, RF-view, and export controls; cancel jobs and clear obsolete results on invalid drafts, guard action handlers, and keep correction/import available. Verify browser regressions for blocked actions, late-result suppression, removal-based recovery, and successful fresh calculation/export after correction.
- [x] 1.4 Make RF-view projection failures explicit local error values rather than render exceptions; add a focused failure/recovery regression that exercises projection independently of input validation and verify the editor remains mounted even with collapsed RF controls.
- [x] 1.5 Document draft validation, recovery, and temporarily unavailable actions in `docs/VIEWER_VALIDATION.md`; run `pnpm test:browser browser/viewer.spec.ts` and verify the documented recovery cases are covered by passing assertions.

## 2. Three-dimensional manual motion validation

- [x] 2.1 Replace the heading-only manual corner check with nonzero three-dimensional segment-direction validation in `src/energy/integration.ts`, using documented angular/length tolerances and explicit analytic-motion classification. Add tests in `tests/energy-integration.test.ts` for both aircraft classes covering climb/descent, climb/level, vertical reversal, horizontal turn, collinear slopes, numerical noise, and duplicate join samples; verify the tests pass.
- [x] 2.2 Preserve computable diagnostic energy and attach an in-range sample reference and finite-transition explanation to each detected corner. Add the reproduced two-leg 100→200→100 m mission to `tests/manual-analysis.test.ts` with flat terrain, sufficient RF/battery, and valid constraints; verify RF remains feasible while energy/motion and overall feasibility are infeasible and serialized results retain the violation.
- [x] 2.3 Add a smooth generated climb/descent control case and retain generated limit-rejection coverage in `tests/routing-motion.test.ts` or `tests/routing-search.test.ts`; run those tests together with the energy and manual-analysis tests, verifying smooth curves pass and existing turn/physical-limit checks still reject invalid motion.
- [x] 2.4 Update `docs/ENERGY_MODELS.md` to describe vertical as well as horizontal manual corners, numerical tolerance, and diagnostic energy on rejected geometry; verify the documentation matches the implemented rule and the regression outcomes.

## 3. Integration validation

- [x] 3.1 Run `pnpm check` and `pnpm test:browser` after both fixes; require green results and confirm existing mission import/export and worker cancellation scenarios remain covered.
- [x] 3.2 Run `openspec validate fix-coordinate-editing-and-vertical-corners --strict` and review the implementation against both delta specs; verify every scenario is supported by a test or recorded observation and preserve the additive relationship with the unarchived baseline specs.
