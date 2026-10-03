# Offline 3D RF flight planner

## 1. Recommended solution

Build a **static TypeScript application using Three.js**, distributed with preprocessed regional terrain packages. A small localhost launcher serves bundled files; all calculations run in the browser. No accounts, remote services, database, or application backend.

The first version supports:

- Fixed-wing aircraft and multirotors.
- One fixed ground station at the launch point.
- Fixed-pointing ground antennas, including directional antennas.
- Flights up to **100 km total mission distance**, including the return leg when selected.
- Automatic route alternatives within an adjustable corridor.
- Engineering estimates of two-way link margin, battery consumption, and aerodynamic penalties.
- Fully offline operation from first launch.

“Worldwide” means the terrain preparation process supports regions worldwide. Each installation includes selected regional packages; detailed planning is restricted to their coverage.

## 2. Terrain sources and the 500 MB budget

### Recommended sources

| Source                           | Coverage and resolution                       | Recommended use                               | Important limitation                                                                   |
| -------------------------------- | --------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Copernicus GLO-30 Public**     | Broad worldwide coverage, nominal 30 m        | Primary source                                | A surface model including vegetation and structures; some public tiles are unavailable |
| **Copernicus GLO-90**            | Worldwide, nominal 90 m                       | Explicit fallback where GLO-30 is unavailable | Coarser terrain can miss narrow ridges                                                 |
| **USGS 3DEP**                    | United States; multiple resolutions           | Optional regional replacement                 | More preprocessing and vertical-datum handling                                         |
| **Geoscience Australia / ELVIS** | Australian national and regional datasets     | Optional Australian replacement               | Coverage, resolution, and source metadata vary                                         |
| **AWS Terrain Tiles / Tilezen**  | Global mosaic with variable source resolution | Secondary source or prototyping               | Mixed sources and ages make consistent analysis harder                                 |

Copernicus is available as public Cloud Optimized GeoTIFFs without an AWS account. Retain its required attribution in the application and package metadata. [Copernicus data registry](https://registry.opendata.aws/copernicus-dem/), [licensing and attribution](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM).

USGS 3DEP products are public domain. Australian alternatives include national approximately 30 m models and regional higher-resolution data. [USGS dataset](https://catalog.data.gov/dataset/1-arc-second-digital-elevation-models-dems-usgs-national-map-3dep-downloadable-data-collec), [Geoscience Australia](https://www.ga.gov.au/scientific-topics/national-location-information/digital-elevation-data).

Tilezen is convenient, but its documented source mixture and resampling artefacts make it a secondary choice for this tool. [Source documentation](https://github.com/tilezen/joerd/blob/master/docs/data-sources.md).

### Package preparation

Use a maintainer-operated **Python + GDAL build process**, separate from the shipped application:

1. Manually download source tiles covering the chosen region.
2. Mosaic and reproject into a regional metric coordinate system centred on the package.
3. Produce tiled elevation grids and progressively coarser levels.
4. Add coverage masks, source metadata, checksums, and attribution.
5. Validate and ship the resulting package alongside the application.

GDAL supports the required reprojection and average/max resampling operations. [GDAL documentation](https://gdal.org/en/stable/programs/gdalwarp.html).

Store two elevation representations:

- **Display heights:** smoothly resampled terrain for rendering.
- **Conservative obstruction heights:** maximum-based resampling for RF and clearance checks, preserving peaks present in the source.

Use signed 16-bit metre elevations, a separate validity mask, and 256 × 256-cell binary tiles. Quantization adds approximately metre-scale error; it does not improve the source’s actual accuracy.

### Concrete size estimate

For a **220 × 220 km package at 30 m spacing**:

| Component                                           | Approximate uncompressed size |
| --------------------------------------------------- | ----------------------------: |
| One elevation grid                                  |                        108 MB |
| Display and obstruction grids                       |                        216 MB |
| All progressively halved overview levels            |                         72 MB |
| Masks, tile padding, metadata and local map context |            Budget up to 60 MB |
| **Target package size**                             |              **Under 350 MB** |

These are calculated storage estimates, not measured downloads. Enforce a build-time limit of **less than 500,000,000 bytes**, without depending on compression.

A package centred near launch covers a 100 km operating radius with additional border space. Launches near its boundary have less available coverage.

Crucially, retain terrain across the **whole ground-station-to-aircraft radio path**. A narrow strip beneath the route is insufficient. Missing land data remains unknown; only positively identified ocean coverage becomes sea level.

## 3. Application architecture and interaction

### Runtime

| Layer                            | Implementation                                                        |
| -------------------------------- | --------------------------------------------------------------------- |
| Interface                        | TypeScript, Vite, small React interface                               |
| Terrain and route rendering      | Three.js, WebGL2                                                      |
| RF, energy and route computation | TypeScript Web Workers                                                |
| Terrain access                   | Local static binary tiles with bounded memory cache                   |
| Mission persistence              | Download/import versioned JSON                                        |
| Distribution                     | Bundled application, assets, regional packages and localhost launcher |

Use one Three.js canvas with top-down and perspective modes. This avoids integrating two map engines and makes altitude slices, elevated flight paths, and vertical RF cross-sections straightforward.

Render grayscale terrain with fixed directional lighting and distance-based mesh detail. Three.js provides buffered geometry and level-of-detail primitives. [BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html), [LOD](https://threejs.org/docs/pages/LOD.html).

Bundle coastlines, boundaries and selected place labels from public-domain Natural Earth for geographic context. Provide coordinate entry for precise placement; no online geocoder or map tiles. [Natural Earth terms](https://www.naturalearthdata.com/about/).

### User workflow

1. Select an installed region and click the launch point.
2. Enter total mission distance and select one-way or return flight.
3. Click the destination; optionally add waypoints.
4. Select an aircraft profile, frequency, receiver configuration, minimum margin, altitude limits and battery reserve.
5. Multiselect ground/aircraft antenna configurations and available transmit-power settings.
6. Generate and compare alternatives.

Antenna profiles include gain pattern, polarization, mounting orientation, mass and additional drag area. Ground antennas also have fixed azimuth and elevation. Supply clearly labelled illustrative presets and allow users to enter actual equipment values.

### Results

Show one interactive scene plus lightweight comparison cards, rather than multiple live 3D canvases:

- Flight path coloured by received power or margin.
- Horizontal coverage slice at a selected altitude.
- Distance-versus-altitude heatmap along the route.
- Terrain, Fresnel clearance and limiting obstruction at the selected point.
- Minimum two-way margin, distance, duration, climb, energy and reserve.
- Quantified pros and cons for each antenna/power/route combination.

Keep identical colour scales across comparisons. Display heading assumptions on coverage slices: a directional aircraft antenna means coverage is not solely a function of position.

Generate explanatory text from computed differences, such as “adds 7 km but improves minimum margin by 5 dB,” rather than generic equipment descriptions.

### Interfaces

Define versioned local types for:

- `TerrainPackageManifest`: bounds, projection, vertical datum, resolution, tiles, validity, provenance and checksums.
- `MissionConfig`: endpoints, range, aircraft, radio configurations, constraints and model assumptions.
- `ScenarioResult`: route samples, directional link budgets, clearance, energy breakdown and feasibility reasons.

Worker requests carry a job ID and support progress, cancellation and rejection of stale results. No HTTP application API is required.

## 4. RF, aircraft and route models

### RF calculations

Evaluate both communication directions independently:

```text
Received power =
  transmit power
  + direction-dependent transmit and receive antenna gains
  − free-space loss
  − diffraction loss
  − cable, polarization and installation losses

Available margin =
  received power − receiver sensitivity − explicit uncertainty allowance

Pass =
  available margin ≥ user-required margin
```

Use free-space attenuation from **ITU-R P.525**, with terrain-profile diffraction based on the **delta-Bullington method in P.526**. Implement and validate the selected method explicitly rather than describing the application as a complete propagation simulator. [P.525](https://www.itu.int/rec/R-REC-P.525/en), [P.526](https://www.itu.int/rec/R-REC-P.526).

Include:

- Earth curvature and configurable effective-Earth-radius factor; default `k = 4/3`.
- First Fresnel-zone clearance; report the 60% clearance threshold separately.
- Antenna gain evaluated in each antenna’s coordinate frame.
- Aircraft heading, climb attitude and fixed-wing bank effects on antenna orientation.
- Receiver sensitivity tied to the selected radio mode.
- Separate transmit powers and sensitivities for uplink and downlink.
- Explicit terrain-height and RF-loss uncertainty settings.

The weaker link controls feasibility. Do not add arbitrary Fresnel penalties on top of diffraction losses.

Initial frequency scope: **100 MHz–6 GHz**. Exclude detailed multipath, dynamic interference, foliage penetration and weather simulation. Surface-model elevations do not resolve individual trees, wires or buildings reliably; display the result as an engineering estimate.

### Energy and aerodynamic cost

Range alone cannot determine endurance. Require a battery capacity and an aircraft power model before declaring energy feasibility.

Use different models for the two aircraft classes:

- **Fixed wing:** lift/drag polar, propulsive efficiency, aircraft mass, wing area, cruise speed, climb limits and maximum bank. Derive turn-radius and bank-induced drag penalties.
- **Multirotor:** calibrated power-versus-airspeed table with mass and climb corrections, hover power, acceleration limits and maximum tilt.
- **Both:** additional antenna mass, drag area, avionics power, radio electrical consumption and takeoff/landing energy allowance.

Calculate energy by integrating electrical power over time. RF output watts must not be treated as radio electrical input watts; use a measured input-power table or amplifier-efficiency model.

Use zero wind by default, with optional constant wind speed/direction. Do not credit descents with energy regeneration. Keep illustrative aircraft presets visibly uncalibrated; research models support this distinction between aircraft classes but do not supply reliable parameters for arbitrary drones. [Fixed-wing model research](https://arxiv.org/abs/1608.01828), [rotary-wing experimental validation](https://arxiv.org/abs/2005.01305).

### Route search

Start with a **10 km-wide corridor** around the direct route or user waypoints, adjustable within package coverage.

Use hierarchical search:

1. Build a coarse position/altitude graph at approximately 250 m horizontal and 50 m vertical spacing.
2. Include heading and feasible turning motion for fixed-wing aircraft.
3. Search for shortest feasible, lowest-energy and highest-minimum-margin alternatives.
4. Refine promising corridors and re-evaluate final routes against the finest available terrain.
5. Deduplicate routes and show nondominated alternatives.

Enforce distance, battery reserve, terrain clearance, altitude, climb, turn and minimum-margin constraints. Evaluate the return leg separately because heading, antenna orientation and wind change its costs.

Check final routes at intervals no larger than the terrain cell size, with extra samples around turns, ridges and threshold crossings. Revalidate any smoothing.

Report “no feasible route found within this corridor and search resolution” when appropriate. A bounded search does not establish that no possible route exists.

### Performance strategy

- Keep numerical work in workers; use transferable typed arrays.
- Cache terrain profiles and propagation loss by station, frequency, position and altitude.
- Reuse propagation results when only transmit power or antenna selection changes.
- Use coarse grids for exploration and fine sampling for shortlisted routes.
- Never allocate a dense full-region 3D RF volume.
- Retain only active terrain tiles and bounded result caches.
- Show progressive results and allow immediate cancellation.

Initial benchmark targets on a documented 16 GB laptop: at least 30 FPS interaction, a coarse result within 5 seconds, and refined results within 30 seconds for 12 equipment configurations. These are acceptance targets to measure, not established performance claims.

## 5. Validation, delivery and defaults

### Acceptance tests

- Flat terrain reproduces analytical free-space results.
- Single-ridge and multiple-ridge fixtures match independent diffraction references.
- A 100 km path includes measurable Earth-curvature effects.
- Antenna rotations, beam departure and uplink/downlink asymmetry change results correctly.
- Increasing RF output improves the appropriate link by the expected dB amount.
- Narrow ridges survive conservative terrain preprocessing.
- Missing terrain prevents a confident feasibility result.
- Constant-power energy cases match hand calculations.
- Antenna mass/drag, climbs, turns, wind and return legs affect energy consistently.
- Final routes satisfy sampled constraints after refinement and smoothing.
- Package seams, negative elevations, antimeridian regions and high latitudes are handled.
- A clean installation works with external networking disabled, including fonts, workers and exports.
- Package size stays below 500 MB; runtime memory and timing are measured separately.

### Delivery sequence

1. Build one regional terrain package and the offline viewer.
2. Implement RF analysis on manually drawn routes.
3. Add aircraft models and equipment comparisons.
4. Add bounded automatic routing and final-route verification.
5. Benchmark, validate additional regions and package the launcher.

### Explicit defaults

- Desktop browsers with WebGL2; mobile optimisation is deferred.
- One-way mission, zero wind, 20% battery reserve.
- User-adjustable 10 dB required link margin.
- Altitude and terrain-clearance limits are supplied by the user.
- Ground antenna height is measured above the local reference surface.
- All altitude calculations retain an explicit vertical datum; DSM-relative heights are labelled accordingly.
- Results are planning estimates; automatic aircraft control, live telemetry and airspace-rule checking are outside v1.
