# Spec Delta

## Purpose

Provide trustworthy regional elevation and geographic context for offline rendering, radio-path analysis, and terrain-clearance validation.

## ADDED Requirements

### Requirement: Versioned regional metadata

Each package SHALL identify its version, bounds, projection, vertical datum, resolutions, elevation representations, tile encoding, validity, provenance, attribution, and checksums.

#### Scenario: Inspect installed region

- **WHEN** a user selects a package
- **THEN** its coverage, source resolution, datum, and attribution are available before planning

#### Scenario: Unsupported or corrupted package

- **WHEN** a package version is unsupported or a required checksum fails
- **THEN** the package is rejected with a reason and its affected data is not used for feasibility

### Requirement: Separate display and obstruction elevations

Packages SHALL supply display elevations and conservative obstruction elevations that preserve source peaks through resampling and overview generation.

#### Scenario: Narrow ridge

- **WHEN** a source fixture contains a narrow ridge
- **THEN** the obstruction representation retains that ridge at each applicable coarser level even if the display surface is smoother

### Requirement: Explicit validity and complete radio paths

Analysis SHALL retain terrain validity across each entire ground-station-to-aircraft path. Missing land SHALL remain unknown; only positively identified ocean SHALL be treated as sea level.

#### Scenario: Gap away from flight path

- **WHEN** a flight route has terrain but its radio path crosses missing land
- **THEN** the affected analysis is indeterminate and cannot support confident feasibility

#### Scenario: Known ocean

- **WHEN** a sample lies in positively identified ocean coverage
- **THEN** sea-level elevation is used with recorded validity

### Requirement: Uncompressed package size limit

The package builder SHALL reject a regional package whose total uncompressed contents are 500,000,000 bytes or more, including elevations, overviews, masks, padding, metadata, and regional context.

#### Scenario: Budget boundary

- **WHEN** a built package totals 500,000,000 bytes
- **THEN** validation fails regardless of its compressed size

### Requirement: Geographic and vertical integrity

Terrain access SHALL preserve negative elevations, maintain consistent tile seams, and handle antimeridian and high-latitude regions using explicit coordinate and vertical-datum metadata.

#### Scenario: Seams and negative terrain

- **WHEN** a path crosses adjacent tiles containing negative elevations
- **THEN** sampling retains the negative heights and introduces no artificial seam obstruction

#### Scenario: Wrapped longitude and high latitude

- **WHEN** a supported regional fixture crosses the antimeridian or lies at high latitude
- **THEN** coordinate lookup maps the path to the correct coverage without longitude discontinuities

#### Scenario: Incompatible datums

- **WHEN** input heights use incompatible datums without a defined conversion
- **THEN** analysis rejects the combination rather than silently mixing heights
