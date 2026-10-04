# Spec Delta

## Purpose

Estimate aircraft electrical energy and battery reserve from class-specific power models, route motion, environmental assumptions, and installed equipment.

## ADDED Requirements

### Requirement: Three-dimensional manual corner validation

For both aircraft classes, a manual route with an abrupt change in three-dimensional travel direction SHALL be reported as a motion violation unless finite transition geometry is supplied. Validation SHALL include vertical slope changes, horizontal turns, and reversals. Collinear travel in the same direction SHALL NOT be rejected solely because the route contains additional samples or waypoints.

#### Scenario: Reproduced climb-to-descent corner

- **WHEN** a fixed-wing manual route travels 1 km horizontally while climbing from 100 m to 200 m, then continues 1 km on the same horizontal bearing while descending to 100 m, with each segment individually within configured limits
- **THEN** the intermediate waypoint produces a motion violation for its abrupt vertical direction change

#### Scenario: Multirotor vertical direction changes

- **WHEN** a multirotor manual route abruptly changes from climb to descent, climb to level travel, or upward to downward vertical travel without a finite transition
- **THEN** the route has a motion violation even if horizontal heading or aircraft pitch remains unchanged

#### Scenario: Horizontal turns remain invalid

- **WHEN** a manual route makes a sharp horizontal turn or immediate return-leg reversal without finite transition geometry
- **THEN** the existing motion rejection remains effective

#### Scenario: Collinear samples and duplicate join samples

- **WHEN** a straight level or constant-slope route contains extra collinear samples, roundoff differences, or duplicate samples at a join
- **THEN** sampling alone does not create a motion violation, and duplicate samples do not hide a direction change between the surrounding nonzero segments

### Requirement: Corner violations propagate to feasibility and evidence

An evaluated manual corner violation SHALL make energy/motion and overall feasibility infeasible even when RF, battery, and per-segment limits pass. It SHALL carry an in-range route sample reference and an explanation that finite transition geometry is required. Available RF evidence and computable diagnostic energy SHALL remain inspectable and exportable without being labelled feasible.

#### Scenario: Adequate radio margin and battery do not override a corner

- **WHEN** the reproduced vertical-corner mission has complete RF evidence, sufficient battery, valid terrain clearance, and all required inputs
- **THEN** RF may remain feasible, but energy/motion and overall status are infeasible, with the corner violation present in the inspected and exported result

### Requirement: Smooth generated motion retains its validation path

Automatically generated routes with finite analytic transitions SHALL continue to use their motion, bank, climb, acceleration, and tilt checks. Changes in direction between samples on a validated smooth curve SHALL NOT be treated as unsmoothed manual corners. Existing power-model prerequisites and physical limits SHALL remain enforced.

#### Scenario: Smooth climb and descent

- **WHEN** a generated route uses continuous finite transitions between climb and descent and satisfies motion, terrain, RF, and reserve constraints
- **THEN** the manual corner check does not prevent a feasible result

#### Scenario: Generated motion exceeds a limit

- **WHEN** a generated transition exceeds configured climb, bank, acceleration, or tilt limits
- **THEN** it remains rejected by the corresponding motion validation
