# Terrain build environment and preparation

The maintainer pipeline requires Python with GDAL >=3.7 and NumPy. The browser distribution does not need Python or GDAL. `scripts/terrain-python.mjs` selects `TERRAIN_PYTHON` when set, otherwise `.venv/bin/python`, Homebrew Python on macOS, then `python3`; it verifies bindings before running any build/tests. It never silently skips numerical fixtures. `PROJ_NETWORK=OFF` keeps coordinate transforms reproducible with installed data.

On macOS a Homebrew GDAL installation includes its compatible Python bindings. For a separate environment, install Python, GDAL, and NumPy together from conda-forge using your environment manager and set `TERRAIN_PYTHON` to its Python executable. Run the following verification with that interpreter before using the pipeline:

```sh
python -c 'from osgeo import gdal; import numpy; print(gdal.VersionInfo())'
```

## Preparing local source rasters

Download the GeoTIFFs listed by the regional source inventory separately. The prepare command accepts local single-band north-up GeoTIFFs with a common horizontal CRS, explicitly declared source vertical datum, and an empty output directory. It mosaics those rasters and reprojects into the configured regional metric grid. Grid size is rounded outward to whole cells; `prepared.json` records actual bounds and dimensions.

```sh
pnpm terrain:prepare terrain/regions/alpine-adriatic.json terrain/prepared/alpine-adriatic --source terrain/raw/tile-a.tif --source terrain/raw/tile-b.tif --source-vertical-datum EGM2008
```

Include every source covering the selected region, not just the example's two paths. Preparation emits `display.tif` with averaged elevations, `obstruction.tif` with maximum elevations, and `validity.tif` with explicit zero unknown/one source cells. Missing pixels remain invalid even if neighbouring valid samples allow an averaged height. Source COG overviews are disabled because their averages cannot preserve original peaks. No vertical shift is applied: the declared source datum must equal the package datum, or preparation rejects the input. See the [GDAL warp documentation](https://gdal.org/en/stable/programs/gdalwarp.html) for resampling, nodata, and overview behavior.

This stage creates intermediate rasters. Export fixed binary tiles and progressively halved overviews with:

```sh
pnpm terrain:tiles terrain/prepared/alpine-adriatic terrain/packages/alpine-adriatic --source-id copernicus-glo30-public
```

Use every contributing source id, including fallback ids when present. Display heights round to nearest metres; conservative heights round upward, including negative elevations. Values outside signed 16-bit range are rejected. Each tile is 256 x 256, row-major, little-endian int16 heights plus uint8 validity. Tile padding is unknown. Display overviews average known children; obstruction overviews retain maximum known peaks. Any unknown child makes the coarse footprint unknown, so averaged heights cannot conceal holes. Source peaks are retained even in unknown footprints for subsequent visualization/evidence.

Confirmed ocean (`2`) must be explicitly identified by the preparation input and have zero heights; export never infers it from absent tiles or zeros. The current source preparation emits source/unknown classes only, so missing coastal cells remain unknown. Pure confirmed-ocean overview footprints remain class 2; mixed known source/ocean footprints become class 1. `tile-index.json` records tile paths, byte counts, SHA-256, and spacing.

## Finalizing and validating a package

Provide a provenance JSON array using the source fields in `docs/CONTRACTS.md`: id, dataset/release, source URL, nominal resolution, vertical datum, accuracy description/value (null when unverified), attribution, license URL, and fallback flag. Its source ids must exactly match the exported tile index. Add locally prepared geographic context files with repeated `--context` arguments.

```sh
pnpm terrain:package finalize terrain/regions/alpine-adriatic.json terrain/prepared/alpine-adriatic terrain/packages/alpine-adriatic --provenance terrain/regions/alpine-adriatic.provenance.json --context terrain/raw/context.geojson
pnpm terrain:package validate terrain/packages/alpine-adriatic
```

Finalization derives geographic bounds from the actual projected raster footprint, includes applicable notices in `ATTRIBUTION.txt` and manifest metadata, hashes context, and records all directory bytes including the manifest itself. Validation rejects a total of 500,000,000 bytes or more, unsupported encoding/version, wrong tile lengths, gaps in the rectangular index, unsafe paths/symlinks, wrong source references, checksum corruption, invalid validity classes, and inconsistent known obstruction/ocean heights. Extra files count against the budget even when not indexed. Python-produced manifests are tested against the actual browser parser.

## Reproducing the complete first package

```sh
pnpm terrain:acquire terrain/regions/alpine-adriatic.json terrain/regions/alpine-adriatic.sources.json terrain/raw/alpine-adriatic
pnpm terrain:build terrain/regions/alpine-adriatic.json terrain/raw/alpine-adriatic/acquisition.json terrain/prepared/alpine-adriatic terrain/packages/alpine-adriatic
pnpm terrain:package validate terrain/packages/alpine-adriatic
```

Acquisition is a maintainer-invoked network operation. It selects source cells intersecting the actual regional footprint, downloads at most three concurrently, verifies local source metadata, caches downloads with SHA-256 sidecars, and records provenance plus Natural Earth archive identities. A downloaded/metadata-validated file is not labelled pixel-validated until the preparation/validation stages process it. Context features are selected within geographic bounds and carry layer/name properties in a bundled GeoJSON. Source and scratch directories are separate from the installable package size budget. Builds refuse to overwrite prepared or finalized packages; use new output directories to reproduce a build.

The first measured package is 379,354,027 bytes, under the required 500,000,000-byte limit. The initial under-350 MB planning estimate was provisional; byte masks and tile padding are included in this measured total. Six levels and one context asset are hashed and validated.

## Verification

```sh
node scripts/terrain-python.mjs -m unittest discover -s tests/terrain -p 'test_*.py'
pnpm check
```

The preparation fixture mosaics two rasters, retains negative heights and a narrow peak, propagates an interior nodata hole, executes an actual CRS change, rejects incompatible vertical references, and refuses to overwrite existing work. Fixtures are generated in temporary directories. A configured interpreter lacking bindings causes the check to fail with setup instructions.
