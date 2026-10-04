# Spec Delta

## Purpose

Deliver responsive desktop terrain interaction and cancellable numerical analysis using only files bundled with the installed application.

## ADDED Requirements

### Requirement: Offline first launch

The installed application SHALL support region selection, editing, analysis, comparison, and mission import/export with external networking disabled from its first launch.

#### Scenario: Clean offline installation

- **WHEN** a clean installation is launched with external networking disabled
- **THEN** bundled fonts, assets, geographic context, workers, and installed regions support the full workflow without accounts or remote services

### Requirement: Desktop terrain interaction

The application SHALL support desktop WebGL2 browsers with one interactive terrain scene offering top-down and perspective modes and precise coordinate placement.

#### Scenario: View transition

- **WHEN** a user switches between top-down and perspective while selecting a route point
- **THEN** the same mission and selected location remain visible

#### Scenario: Unsupported graphics

- **WHEN** the browser lacks WebGL2
- **THEN** the application explains the unsupported requirement instead of presenting a usable planner

### Requirement: Job lifecycle

Numerical jobs SHALL report progress and support cancellation. Results and progress from superseded job ids SHALL not replace current mission state.

#### Scenario: Cancel and replace

- **WHEN** a user cancels an analysis and starts a changed mission
- **THEN** the previous computation stops, interaction remains responsive, and late messages from the old job are ignored

### Requirement: Bounded working memory

Runtime terrain and result storage SHALL use bounded working sets and SHALL avoid allocating a dense full-region three-dimensional RF volume.

#### Scenario: Repeated comparisons

- **WHEN** a user repeatedly changes locations and equipment
- **THEN** obsolete working data is evicted or released and measured storage respects documented cache limits

### Requirement: Measured performance targets

Acceptance SHALL demonstrate at least 30 FPS interaction, a coarse result within 5 seconds, and refined results within 30 seconds for 12 equipment configurations on a documented 24 GB laptop benchmark.

#### Scenario: Reproducible benchmark

- **WHEN** the benchmark is run for the recorded mission, region, hardware, browser, versions, and cache conditions
- **THEN** frame rate, coarse/refined timings, and peak memory are recorded and failures are reported against the targets
