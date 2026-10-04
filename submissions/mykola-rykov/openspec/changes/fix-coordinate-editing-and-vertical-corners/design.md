# Design

## Context

See `proposal.md` for motivation and the two delta specs for acceptance behavior. `PointFields` in `src/mission/Editor.tsx` publishes `valueAsNumber` directly; `RfViews` projects coordinates during render without catching failures. The distance effect already catches projection errors, but that does not protect the sibling RF view. `App` owns the mission; analysis and RF-view workers currently cancel and clear results when it changes.

`evaluateRouteEnergy` in `src/energy/integration.ts` rejects manual corners using heading alone. `segmentMotion` computes actual segment velocities, whereas multirotor attitude pitch is not its vertical travel direction. Manual sampling in `src/rf/analysis.ts` omits repeated segment starts and duplicates the outbound/return join; generated primitives carry analytic `motion` data and can repeat positions at joins. Existing tests cover horizontal turnaround rejection and smooth generated motion but miss the reproduced vertical corner.

The main spec inventory is empty. The completed `offline-rf-flight-planner` change contains pending baseline specs for these same capability paths. Both changes add different requirement names and must be merged additively when archived; this proposal does not archive or modify the earlier change.

## Goals / Non-Goals

**Goals:** Keep domain coordinates valid during editing, make draft validity explicit across consumers, and apply a common geometric definition of manual corners to both aircraft classes.

**Non-Goals:** A general form-state framework, new persistence, a new worker protocol, changed mission/result JSON versions, automatic smoothing of manual routes, or additional aircraft dynamics such as stall, jerk, and roll-rate models.

## Decisions

### 1. Separate coordinate drafts from committed mission geometry

Use controlled string drafts for latitude and longitude. Explicitly test for blank/incomplete values, finiteness, and the existing coordinate bounds before publishing a numeric update. Commit valid values on change to retain the current immediate-update behavior; invalid drafts remain visible with accessible field errors and never become `NaN` or implicit zero in the mission.

Keep coordinate-draft ownership and aggregate validity at the `App`/editor boundary so sibling consumers can share the same validity state. Reset drafts on explicit mission replacement, selected-point assignment, and region changes, rather than on every unrelated mission edit. Track waypoint drafts with stable editor-only identities and remove them with their waypoint; do not persist those identities in mission JSON or key drafts solely by a shifting array index. External replacement resets drafts even when the incoming coordinate happens to equal the last committed value.

Alternative: committing `NaN` and adding an error boundary would preserve the invalid shared state and force every consumer to tolerate it. A broad error boundary alone would also hide the editor needed for correction. Local drafts address the source of the defect.

### 2. Prevent stale calculations while drafts are invalid

Pass aggregate coordinate validity to `AnalysisPanel`, `RfViews`, and `Configuration`. An invalid draft cancels active jobs, clears results and the selected route, and disables manual analysis, search, RF calculations, and mission/result export with a visible correction reason. Guard handlers as well as button state. Import and geometry correction remain available. Returning to valid input permits fresh work; it does not resurrect stale results.

This is necessary because retaining the last valid mission would otherwise let users analyze or export geometry different from the visible input. Merely keeping the previous result visible without a validity distinction is rejected for the same reason.

### 3. Contain RF-view projection errors locally

Make the memoized projection return either a valid path or an error value. Render the message and withhold calculation when it fails; do not throw during render or set state from inside the memo. Do not substitute an empty or zero-valued path. Recompute on geometry or terrain changes so the view recovers normally. Keep the existing worker-side contract validation.

This provides a second layer for projection failures even when geographic coordinates satisfy numeric bounds. A global fallback is unnecessary for this expected input error.

### 4. Validate manual corners from three-dimensional segment directions

Use incoming and outgoing nonzero projected displacement vectors (east, north, altitude) to detect abrupt manual travel-direction changes, rather than rendered attitude or horizontal bearing alone. Compute angular separation using a stable cross/dot `atan2` formulation. Retain a small documented angular tolerance of 1e-5 degrees for roundoff, and use the existing 1e-8 metre near-zero segment threshold. These are numerical tolerances, not newly permitted maneuver angles.

Carry the previous nonzero manual segment across duplicate samples, including return-leg join duplicates; do not divide by zero or let duplicates hide a corner. Reference the shared waypoint sample, or the first outgoing sample if necessary, using a valid index in the emitted route. The first and last route samples have no internal corner; existing takeoff/landing allowances remain unchanged.

Deriving pitch alone was considered but rejected: multirotor attitude may be level while travel climbs, and nearly vertical motion makes horizontal heading uninformative. Displacement vectors describe the geometry independently of aircraft attitude and constant wind. Leave existing segment timing and power calculations intact.

### 5. Preserve the generated-route and diagnostic contracts

Apply the new corner rule to manual geometry without analytic motion evidence. Use explicit `motion` presence for the generated path, not merely the presence of a bank number; keep generated analytic validation in `verifyMotion` and the existing energy kernels. Do not treat each pair of samples on a smooth generated arc as a sharp corner.

With complete model inputs, record a `motion` violation and continue diagnostic integration where computable. `analyzeMission` already propagates energy violations to overall infeasibility and retains RF evidence; verify this with a full analyzer regression. Preserve existing missing-model and unsupported-table outcomes rather than inventing motion or energy evidence.

## Risks / Trade-offs

- Draft state can survive an import or attach to a different waypoint → Reset on explicit replacement and use stable editor-only waypoint identities; cover import, removal, selected-point assignment, and unrelated edits in browser tests.
- Cancellation can race with worker completion → Reuse `JobClient.cancel()` and its active-job filtering; test that invalid drafts cannot publish late results.
- Floating-point noise can create false corners → Test the documented tolerance with collinear subdivided paths and negligible perturbations, alongside large vertical reversals.
- Duplicate samples or generated arcs can confuse corner classification → Test nonzero segment bridging, return joins, and existing generated-route fixtures separately.
- A newly detected corner changes previously optimistic results → Keep file formats compatible and explain the required finite transition in the violation and energy documentation.

## Migration Plan

No data migration or dependency change is required. Implement the coordinate and motion fixes as separate task groups, then run the relevant browser regressions and `pnpm check`. Update `docs/ENERGY_MODELS.md` to explicitly include vertical manual corners. Existing saved missions remain loadable and are reevaluated under the corrected validation. If rollback is needed, revert the implementation commits; existing saved files remain compatible, though rollback restores the reviewed defects.
