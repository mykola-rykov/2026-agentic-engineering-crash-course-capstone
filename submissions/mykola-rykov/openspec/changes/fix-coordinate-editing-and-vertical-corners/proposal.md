# Proposal

## Why

Clearing a mission latitude or longitude currently throws during RF-view rendering and removes the application UI, risking unsaved work. Manual routes with an instantaneous climb-to-descent reversal can also be labelled feasible because the motion check considers only horizontal heading.

## What Changes

- Preserve incomplete coordinate edits without putting invalid numbers into the mission, show field validation, and recover without a reload.
- Guard RF-view projection failures and prevent analysis or export from silently using a previous coordinate while an invalid draft is visible.
- Reject abrupt changes in three-dimensional manual route direction, including vertical corners, while preserving smooth generated motion and diagnostic RF/energy evidence.
- Add browser and numerical regression coverage for both reproduced defects.

## Capabilities

### New Capabilities

- `mission-planning`: Add safe coordinate editing, draft recovery, and projection-error containment requirements.
- `aircraft-energy`: Add three-dimensional manual corner detection and feasibility propagation requirements.

The main spec inventory is currently empty. These paths intentionally reuse the capability organization in the completed but unarchived `offline-rf-flight-planner` change. This change adds distinct requirements to those capabilities; it does not duplicate their pending baseline requirements. Integrate both sets of additions when syncing or archiving either change.

### Modified Capabilities

None in the current main spec inventory.

## Impact

Coordinate editing affects `src/mission/Editor.tsx`, `src/mission/RfViews.tsx`, and draft-validity coordination through `src/App.tsx`, `AnalysisPanel.tsx`, and `Configuration.tsx`. Motion validation affects `src/energy/integration.ts` and its interaction with manual sampling in `src/rf/analysis.ts`. Existing browser, energy, manual-analysis, and routing tests provide regression locations. No new dependencies, file-format versions, power-model parameters, or worker protocol changes are intended. General form redesign, automatic vertical smoothing, and new aircraft dynamics are out of scope.
