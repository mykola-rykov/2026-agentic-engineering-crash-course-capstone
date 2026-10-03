# Spec Delta

## Purpose

Estimate terrain-dependent two-way radio margins and clearance with explicit direction, orientation, uncertainty, and model limitations.

## ADDED Requirements

### Requirement: Directional link budgets

Analysis SHALL compute each direction's received power from transmit power, directional gains, and free-space, diffraction, cable, polarization, and installation losses. Available margin SHALL subtract receiver sensitivity and RF uncertainty; the weaker direction SHALL govern the required-margin constraint.

#### Scenario: Asymmetric link

- **WHEN** one direction exceeds required margin while the other falls below it
- **THEN** RF feasibility fails with the limiting direction identified

#### Scenario: Power adjustment

- **WHEN** one direction's transmit power rises by 3 dB with all other inputs fixed
- **THEN** that direction's received power and margin rise by 3 dB while the other direction remains unchanged

### Requirement: Validated propagation scope

Analysis SHALL support 100 MHz through 6 GHz using ITU-R P.525 free-space loss and the selected ITU-R P.526 delta-Bullington terrain-profile diffraction method, with documented editions and independent reference validation.

#### Scenario: Flat unobstructed path

- **WHEN** a flat unobstructed fixture is evaluated
- **THEN** free-space results match the analytical reference within recorded numerical tolerance

#### Scenario: Ridge fixtures

- **WHEN** single-ridge and multiple-ridge fixtures are evaluated
- **THEN** diffraction results match independent references within documented tolerances

#### Scenario: Unsupported frequency

- **WHEN** a frequency is outside 100 MHz through 6 GHz
- **THEN** configuration is rejected instead of producing an in-scope estimate

### Requirement: Curvature and Fresnel evidence

Analysis SHALL include Earth curvature with configurable effective-radius factor defaulting to 4/3 and report first-Fresnel-zone clearance and its 60% threshold separately from diffraction, without an arbitrary extra Fresnel loss.

#### Scenario: Long path

- **WHEN** a 100 km fixture is evaluated with curvature enabled
- **THEN** reported clearance shows a measurable curvature effect relative to the no-curvature reference

#### Scenario: Fresnel obstruction

- **WHEN** a profile crosses the 60% Fresnel clearance threshold
- **THEN** clearance status changes and the loss budget contains only the selected diffraction method's loss

### Requirement: Antenna attitude

Gains SHALL be evaluated in each antenna's coordinate frame, including ground pointing and airborne heading, climb attitude, and fixed-wing bank.

#### Scenario: Beam departure

- **WHEN** aircraft motion or ground pointing moves the ray outside a directional beam
- **THEN** gain and directional margin change according to the configured pattern

#### Scenario: Return heading

- **WHEN** an aircraft traverses the same locations in reverse with a directional antenna
- **THEN** gains are recomputed for return heading rather than copied from outbound samples

### Requirement: Uncertainty and incomplete evidence

Analysis SHALL expose terrain-height uncertainty and RF-loss allowance separately and SHALL not declare confident RF feasibility when required terrain or height-reference data is missing.

#### Scenario: Missing profile data

- **WHEN** an RF path contains an invalid terrain sample
- **THEN** the result identifies missing evidence and reports indeterminate RF feasibility

#### Scenario: Engineering assumptions

- **WHEN** a user inspects an estimate
- **THEN** surface-model limits and excluded interference, multipath, foliage, and weather effects are available alongside explicit uncertainty assumptions
