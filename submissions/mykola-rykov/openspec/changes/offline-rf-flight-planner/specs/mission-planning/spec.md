# Spec Delta

## Purpose

Let users define reproducible regional aircraft missions, radio equipment, and explicit physical constraints and exchange them as local versioned files.

## ADDED Requirements

### Requirement: Mission geometry and distance

Users SHALL select an installed region, launch point, destination, optional waypoints, total distance limit, and one-way or return flight. V1 SHALL limit total mission distance to at most 100 km, including the selected return leg, with one fixed ground station at launch.

#### Scenario: Return distance accounting

- **WHEN** a return mission has 60 km outbound and 60 km inbound under a 100 km limit
- **THEN** its total distance violates the mission limit

#### Scenario: Boundary launch

- **WHEN** the launch lies near a package edge
- **THEN** the planner exposes reduced available coverage rather than assuming a full operating radius

### Requirement: Aircraft and independent radio configuration

Users SHALL configure aircraft type, battery/power model, frequency, radio modes, independent uplink/downlink powers and sensitivities, minimum margin, altitude/clearance limits, reserve, and uncertainty.

#### Scenario: Distinct radio directions

- **WHEN** the user changes only one direction's receiver sensitivity
- **THEN** the mission preserves the other sensitivity and subsequent analysis uses the changed direction independently

### Requirement: Equipment combinations

Users SHALL multiselect ground/aircraft antenna configurations and available transmit powers. Antenna profiles SHALL include gain pattern, polarization, mounting orientation, mass, and drag area; ground antennas SHALL include fixed azimuth/elevation.

#### Scenario: Directional installation

- **WHEN** a fixed directional ground antenna and rotated airborne antenna are configured
- **THEN** the exported mission retains their patterns and orientations for the selected combinations

#### Scenario: Illustrative values

- **WHEN** a user selects an illustrative aircraft or antenna preset
- **THEN** it is visibly identified as illustrative or uncalibrated and editable actual equipment values are supported

### Requirement: Explicit defaults and altitude references

New missions SHALL default to one-way flight, zero wind, 20% battery reserve, and adjustable 10 dB required margin. Users SHALL supply altitude/clearance limits. Altitudes SHALL retain a datum, DSM-relative heights SHALL be labelled, and ground antenna height SHALL be above the local reference surface.

#### Scenario: New mission

- **WHEN** a user creates a mission
- **THEN** defaults are shown and required altitude/clearance inputs must be supplied before feasible routing

#### Scenario: Height reference

- **WHEN** a user enters ground antenna height above surface
- **THEN** the station altitude incorporates local surface elevation and retains its vertical reference

### Requirement: Versioned mission files

Mission export/import SHALL use versioned JSON retaining geometry, equipment, constraints, terrain reference, and model assumptions. Invalid or unsupported files SHALL be rejected with an actionable reason without replacing the current mission.

#### Scenario: Round trip

- **WHEN** a supported mission is exported and imported
- **THEN** the restored configuration and assumptions reproduce the same inputs

#### Scenario: Invalid import

- **WHEN** a file contains an unsupported version or invalid numeric values
- **THEN** the import is rejected and the existing mission remains intact
