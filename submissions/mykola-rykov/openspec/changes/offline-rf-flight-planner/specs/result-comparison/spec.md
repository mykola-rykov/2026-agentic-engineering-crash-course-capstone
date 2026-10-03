# Spec Delta

## Purpose

Make numerical route and equipment tradeoffs inspectable through consistent shared visualizations, quantified comparisons, and explicit feasibility evidence.

## ADDED Requirements

### Requirement: Route and coverage views

Results SHALL provide route received-power or margin colouring, a horizontal coverage slice at a selected altitude, and a distance-versus-altitude route heatmap. Coverage slices SHALL expose airborne heading/attitude assumptions.

#### Scenario: Directional coverage slice

- **WHEN** the selected aircraft antenna is directional
- **THEN** the coverage view displays the heading/attitude assumed for its values

#### Scenario: Change visual mode

- **WHEN** a user switches between power and margin colouring
- **THEN** legend units and values reflect the selected metric

### Requirement: Point evidence

Selecting a route point SHALL expose terrain, Fresnel clearance, and the limiting obstruction, together with directional link information and missing-data status.

#### Scenario: Inspect weak point

- **WHEN** a user selects a low-margin sample
- **THEN** the view identifies its obstruction and weaker direction with clearance evidence

#### Scenario: Inspect unknown point

- **WHEN** a selected sample lacks required terrain
- **THEN** the view marks that evidence as unknown rather than displaying a confident clearance

### Requirement: Comparable scenario metrics

Comparison cards SHALL show minimum two-way margin, distance, duration, climb, energy breakdown, reserve, and feasibility reasons for each route/antenna/power combination. Equivalent metrics SHALL use identical colour scales across comparisons.

#### Scenario: Compare equipment

- **WHEN** a user selects multiple antenna/power combinations
- **THEN** their cards and shared scene use consistent units and scales and identify each limiting constraint

### Requirement: Computed explanations

Scenario pros and cons SHALL derive from computed differences and disclose model assumptions and unavailable metrics.

#### Scenario: Route tradeoff

- **WHEN** one computed route is 7 km longer and has 5 dB greater minimum margin than another
- **THEN** the explanation reports those measured differences rather than a generic equipment claim

#### Scenario: Incomplete energy

- **WHEN** RF metrics are available but the power model is missing
- **THEN** energy/reserve are marked unavailable and explanations do not invent energy advantages
