# Spec Delta

## Purpose

Estimate aircraft electrical energy and battery reserve from class-specific power models, route motion, environmental assumptions, and installed equipment.

## ADDED Requirements

### Requirement: Model prerequisites

Energy feasibility SHALL require battery capacity and an aircraft power model. Illustrative profiles SHALL remain visibly uncalibrated; distance alone SHALL not establish endurance.

#### Scenario: Missing power model

- **WHEN** a mission has a distance limit but no valid aircraft power model
- **THEN** energy feasibility is unavailable with a reason while valid RF results remain accessible

### Requirement: Fixed-wing energy and turns

Fixed-wing estimates SHALL account for mass, wing area, lift/drag polar, propulsive efficiency, cruise speed, climb limits, bank limits, turn radius, and bank-induced drag.

#### Scenario: Banked route

- **WHEN** two otherwise equivalent fixed-wing routes differ in turning bank
- **THEN** turn radius/limits and bank-induced energy penalties follow the configured model

#### Scenario: Added aerodynamic load

- **WHEN** antenna mass or drag increases with route and aircraft otherwise fixed
- **THEN** the energy breakdown reflects the configured additional load

### Requirement: Multirotor energy and motion

Multirotor estimates SHALL use calibrated electrical power-versus-airspeed data, hover power, mass and climb corrections, editable cruise airspeed and propulsive efficiency, acceleration limits, and maximum tilt. Propulsive efficiency SHALL convert added antenna drag work to electrical power without reapplying conversion to the calibrated electrical power table. Missing cruise or efficiency inputs SHALL withhold energy feasibility without inventing values.

#### Scenario: Editable multirotor cruise and efficiency

- **WHEN** a user changes multirotor cruise airspeed or propulsive efficiency
- **THEN** the mission retains those values and time/added-drag energy calculations use them independently

#### Scenario: Hover and climb

- **WHEN** a multirotor route includes hovering and climbing
- **THEN** the corresponding calibrated hover/climb power and duration contribute to energy

#### Scenario: Invalid motion

- **WHEN** a route segment exceeds multirotor acceleration or tilt limits
- **THEN** the violation is reported instead of accepted as a feasible motion

### Requirement: Electrical integration and equipment

Energy SHALL integrate electrical power over time, including antenna mass/drag, avionics, radio draw, and takeoff/landing allowance. Radio draw SHALL use measured input power or amplifier efficiency, not RF output watts as electrical input. Descents SHALL receive no regenerative energy credit.

#### Scenario: Hand calculation

- **WHEN** constant electrical power P is sustained for duration t
- **THEN** integrated energy equals P times t in consistent units within the recorded tolerance

#### Scenario: Radio consumption

- **WHEN** RF output is changed using a configured amplifier efficiency or input-power table
- **THEN** electrical energy uses that model and the radio contribution is reported

#### Scenario: Descent

- **WHEN** a route loses altitude
- **THEN** no regenerated battery energy is credited

### Requirement: Wind and reserve

Estimates SHALL default to zero wind, support optional constant wind speed/direction, evaluate return-leg timing/energy separately, and enforce the user reserve against usable battery energy.

#### Scenario: Wind and reverse travel

- **WHEN** a return mission is evaluated in nonzero constant wind
- **THEN** outbound and inbound durations and energy use their respective headings and wind components

#### Scenario: Reserve exceeded

- **WHEN** mission energy leaves less than the configured reserve
- **THEN** energy feasibility fails with energy and remaining reserve reported

#### Scenario: Impossible ground progress

- **WHEN** wind and configured airspeed prevent progress along a segment
- **THEN** that motion is rejected rather than assigned a negative or invalid travel time
