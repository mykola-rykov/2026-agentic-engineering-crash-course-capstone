# Spec Delta

## Purpose

Find and verify useful aircraft-feasible route alternatives within explicit regional, corridor, resolution, radio, and energy constraints.

## ADDED Requirements

### Requirement: Bounded search and alternatives

Search SHALL start within an adjustable 10 km-wide corridor around the direct route or user waypoints and installed terrain coverage. It SHALL seek shortest feasible, lowest-energy, and highest-minimum-margin alternatives and expose corridor/resolution limits.

#### Scenario: Adjust corridor

- **WHEN** the user changes the search corridor width
- **THEN** new alternatives are searched only within the selected corridor and package coverage

#### Scenario: No result

- **WHEN** bounded search finds no verified alternative
- **THEN** the result says no feasible route was found within this corridor and search resolution without claiming that no possible route exists

### Requirement: Aircraft and mission constraints

Accepted routes SHALL satisfy total distance, battery reserve, terrain clearance, altitude, climb, turn, and minimum two-way-margin constraints. Fixed-wing routes SHALL respect heading-dependent feasible turning motion.

#### Scenario: Tight fixed-wing corner

- **WHEN** a positional shortcut requires a turn tighter than the aircraft allows
- **THEN** the shortcut is rejected or replaced with feasible turning geometry

#### Scenario: Constraint violation

- **WHEN** a candidate violates any configured distance, energy, clearance, altitude, motion, or RF constraint
- **THEN** it is excluded from feasible alternatives with a recorded reason

### Requirement: Independent return evaluation

Return missions SHALL evaluate inbound geometry, heading, wind, antenna orientation, margins, and energy separately and include both legs in all total constraints.

#### Scenario: Outbound-only success

- **WHEN** outbound satisfies margin and reserve but the complete return mission does not
- **THEN** the mission is not accepted as feasible

### Requirement: Final verification

Promising routes SHALL be refined and re-evaluated against the finest available terrain. Final samples SHALL be spaced no farther apart than terrain cell size with extra samples near turns, ridges, and threshold crossings. Smoothing SHALL trigger revalidation.

#### Scenario: Coarse missed ridge

- **WHEN** a coarse candidate crosses a ridge visible in the finest terrain
- **THEN** final verification rejects or repairs the clearance/RF violation

#### Scenario: Smoothed path

- **WHEN** smoothing changes candidate geometry
- **THEN** the changed route is fully checked again before it can be presented as feasible

#### Scenario: Unknown final ray

- **WHEN** a final route's radio path crosses missing terrain
- **THEN** the candidate cannot become a confidently feasible alternative

### Requirement: Distinct nondominated results

Returned alternatives SHALL be deduplicated and nondominated with respect to total distance, electrical energy, and minimum two-way margin.

#### Scenario: Redundant candidates

- **WHEN** two candidates are equivalent or one is no better in any comparison metric and worse in another
- **THEN** duplicates and dominated alternatives are excluded from the final comparison set
