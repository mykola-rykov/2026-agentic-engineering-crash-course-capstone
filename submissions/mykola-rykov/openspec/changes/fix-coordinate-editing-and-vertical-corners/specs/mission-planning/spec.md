# Spec Delta

## Purpose

Let users define reproducible regional aircraft missions, radio equipment, and explicit physical constraints and exchange them as local versioned files.

## ADDED Requirements

### Requirement: Recoverable mission coordinate editing

The planner SHALL allow incomplete or invalid latitude and longitude drafts for launch, destination, and waypoints without crashing or replacing the last valid mission coordinate. It SHALL identify invalid fields and preserve unrelated mission settings. Finite values within inclusive latitude [-90, 90] and longitude [-180, 180] bounds SHALL be accepted; blank drafts SHALL NOT be interpreted as zero.

#### Scenario: Clear and correct a coordinate

- **WHEN** a user clears a launch, destination, or waypoint coordinate and then enters a valid replacement
- **THEN** the application remains mounted throughout, identifies the blank draft as invalid, accepts the replacement, and preserves other mission settings without requiring a reload

#### Scenario: Out-of-range or incomplete coordinate

- **WHEN** a user enters an out-of-range coordinate or an incomplete numeric value such as a lone minus sign
- **THEN** the planner shows a field-specific validation message and does not commit an invalid numeric value to the mission

### Requirement: Coordinate drafts cannot silently reuse old inputs

While any coordinate draft is invalid, the planner SHALL prevent new manual analysis, automatic search, RF-view calculation, mission export, and result export. It SHALL cancel active calculations and invalidate displayed analysis results when the draft becomes invalid. The editor SHALL remain usable for correction, waypoint removal, or mission replacement.

#### Scenario: Invalid draft during analysis

- **WHEN** a user clears a coordinate while a calculation is running
- **THEN** the calculation is cancelled, obsolete results are not published, and calculation and export actions explain that a coordinate needs correction

#### Scenario: Recovery from an invalid draft

- **WHEN** the user corrects every invalid draft or removes the waypoint containing the only invalid draft
- **THEN** coordinate validation no longer blocks calculation or export, and future calculations use the accepted mission geometry

### Requirement: Coordinate drafts follow mission replacement

The planner SHALL synchronize coordinate drafts with externally replaced mission geometry. A successful import, region switch, or selected-point assignment SHALL replace affected drafts and clear their obsolete errors. Removing a waypoint SHALL NOT transfer its draft or validation error to another waypoint.

#### Scenario: Import replaces an invalid draft

- **WHEN** a valid mission is imported while a coordinate draft is invalid
- **THEN** the coordinate fields display the imported geometry and no stale draft prevents calculation or export

#### Scenario: Point assignment and waypoint removal

- **WHEN** a selected map point replaces a launch coordinate draft or a waypoint with an invalid draft is removed
- **THEN** the affected draft and its validation error are cleared without altering another point's coordinate

### Requirement: Recoverable coverage projection failures

If mission coordinates cannot be projected for an RF view, the planner SHALL show an actionable local error and withhold the affected calculation without unmounting the application or losing the mission. Correcting the geometry SHALL restore the view controls without a reload.

#### Scenario: Projection failure while rendering coverage controls

- **WHEN** RF-view geometry projection fails before the user requests a calculation, including while the coverage controls are collapsed
- **THEN** the planner retains the editor and mission, reports the geometry error locally, and permits correction
