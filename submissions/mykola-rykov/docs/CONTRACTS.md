# Local data contracts, version 1

Schemas in `src/contracts/` are the runtime validation boundary for untrusted local JSON and worker messages. Exported TypeScript types are inferred from the same schemas. Use `parseTerrainManifest`, `parseMission`, `parseScenarioResult`, `parseWorkerRequest`, and `parseWorkerResponse` before consuming external data. Unknown fields, unsupported versions, nonfinite numbers, and invalid ranges produce errors with field paths; callers must retain their current state on failure.

Files carry `schemaVersion: 1`; structured-clone worker messages carry `protocolVersion: 1` and a job id. Version changes require an explicit compatibility decision rather than silently accepting a newer shape. Workers validate job-envelope identity; stale-job rejection and cancellation behavior are implemented separately in the lifecycle task.

## Units and references

Field suffixes define units: metres (`M` or `metres`), seconds (`S`), metres/second (`Mps`), kilograms (`Kg`), watt-hours (`Wh`), watts (`W`), hertz (`Hz`), degrees (`Deg`), dB losses/margins, dBm powers, and dBi gains. Fractions use 0-1. Negative datum elevations and dB margins are valid. Remaining battery fraction can be negative for an overspent, infeasible mission.

Horizontal coordinates are WGS84 latitude/longitude degrees. Bounds explicitly identify antimeridian crossing; projected coordinates and grid spacing use metres. Altitudes carry a vertical datum id and either `datum` or `above-dsm` reference. Mission waypoints and constraints must use the package's vertical datum. Above-DSM heights cannot be mixed with datum heights without a terrain-aware transformation. Missing altitude bounds, clearance, aircraft model, or battery can be retained while editing; analysis/routing must separately enforce its prerequisites.

## Terrain packages

The manifest indexes each tile's display, obstruction, and validity assets, byte counts, SHA-256, source ids, and overview level. Version 1 uses 256 x 256 signed 16-bit little-endian metre elevations. Display overviews use average resampling; obstruction overviews use maximum resampling. Validity is one unsigned byte per cell: `0` unknown, `1` source elevation, `2` confirmed ocean. Never infer ocean from a missing tile or zero elevation.

The parser checks metadata structure, tile lengths/locations, duplicate asset paths/source ids, source references, ordered overview spacing, and the declared package-size limit. Actual checksums, file coverage, source peak preservation, datum transformations, and measured full-directory byte totals belong to the package builder/loader validators, not to JSON shape validation. Context assets also carry checksums and sizes. Asset paths must be relative and free of traversal; the loader must additionally enforce path containment.

## Missions and results

Missions retain one launch station, optional waypoints, outbound/return choice, the total distance cap, independent radio directions, antenna patterns/mounting, aircraft-class power model, equipment combinations, wind, uncertainty, and model versions. Empty power/battery data is represented as `null`, never inferred from range. The defaults constant documents the plan's initial values; it does not silently populate a malformed import.

Multirotor power profiles have editable `cruiseSpeedMps` and `propulsiveEfficiency`. Missing fields in older version-1 profiles normalize to null with explicit energy prerequisites, without substituting illustrative values. Propulsive efficiency converts additional drag work; the speed–power table is already electrical. Zero-speed table data must agree with hover power.

Results distinguish feasible, infeasible, and indeterminate states, with reasons required for the latter two. Unknown radio budgets, timing, or energy use `null`; missing terrain uses explicit unknown clearance with a reason. Overall feasibility requires computed RF/energy evidence and no recorded violations. A bounded search that finds no candidate sends `no-route` with its corridor and horizontal/vertical spacing rather than asserting universal infeasibility. Numerical budget equality, physical motion, final-route verification, and summary aggregation are validated by their respective numerical kernels, not by these structural schemas.

Route samples may include `terrainEvidence` with local display/obstruction elevations and datum, independently of radio clearance. This allows the inspector to show known local DSM even when a terminal's conservative height or a distant radio-ray gap prevents a budget. A known constraint failure makes overall feasibility infeasible while incomplete RF evidence can still make aggregate RF indeterminate.

## Runtime terrain coordinates and sampling

`src/terrain/coordinates.ts` converts WGS84 longitude/latitude to the package's metric projection through bundled Proj4js; GDAL reference fixtures check regional, antimeridian, and high-latitude cases. Vertical conversion is separate: datum mismatch raises an error; resolving a DSM-relative altitude requires a known surface elevation. `src/terrain/sampling.ts` uses pixel-center alignment, row-major north-to-south indexing, interpolation across tile seams for display, and maximum neighbouring obstruction heights. Missing neighbouring samples remain unknown. Geographic bounds are an overview; exact coverage is enforced in projected coordinates and validity masks.

`src/terrain/store.ts` validates the manifest before opening assets, enforces package-relative URLs with redirects disabled, bounds streamed tile bytes, checks SHA-256, decodes little-endian heights, and rejects invalid classes or known obstruction/ocean values before caching. The default tile cache is 32 MiB with least-recently-used eviction and at most four concurrent tile requests. A complete tile holds 327,680 bytes of decoded heights/mask. Requests for absent index entries return unknown; corrupt indexed assets raise errors. Renderers and workers must release their own obsolete references when switching regions/jobs.

## Worker transfer ownership

Worker envelopes cover analysis/search requests, cancellation, progress, coarse/final results, qualified no-route outcomes, errors, and tile-buffer transfers. Tile and RF-grid transfers contain `ArrayBuffer`; these are structured-clone values rather than JSON file content. Tile lengths must match representation. Transferring a buffer detaches it from the sender; validate before transfer and do not continue reading a detached buffer. The runtime must discard all obsolete job messages and yield between bounded numerical batches.

The `rf-view` request adds an explicit slice or heatmap, selected equipment, ordered bounds, and fixed airborne attitude. A heatmap path is limited to 8192 points. Both views are bounded to 2048 cells; UI defaults to 12 × 12 and allows up to 32 × 32. The `view-grid` response transfers newly allocated Float32 margin/power buffers and a Uint8 validity buffer, requiring matching dimensions and finite known values. Validity 0 is unknown, not zero power/margin. Axis labels/bounds and assumptions accompany the grid. View completion ends its job; stale results are discarded just like route results. Its worker owns separate bounded terrain/profile/propagation caches (32/32/16 MiB), avoiding a full-region 3D RF allocation.

Run `pnpm check` for contract fixtures covering JSON round trips, unsupported versions/fields, invalid numeric inputs, datum mixing, unknown-data feasibility, package declarations, envelope identity, and transferred-buffer length. Fixtures are explicitly synthetic and are not geographic or numerical validation references.
