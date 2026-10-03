# First regional terrain package

The user-selected launch point is **46°12'20.6"N 13°41'23.7"E**, or **46.20572222222222° N, 13.689916666666667° E**. Configuration is in `terrain/regions/alpine-adriatic.json`; acquisition evidence is in `terrain/regions/alpine-adriatic.sources.json`.

## Bounds and coordinate references

Use a WGS84 azimuthal equidistant regional projection centered at the selected launch, with metre bounds x/y from -110,000 to +110,000. This approximately 220 x 220 km square includes the intended 100 km operating radius with border space when launched at the center. Actual mission distance is capped at 100 km including a chosen return leg; the package radius is not a separate flight-distance authorization. Launches near edges have reduced usable coverage.

The acquisition envelope is longitude 11-16° E, latitude 44-48° N. It is deliberately wider than the square, to cover source interpolation and the entire radio path. `source_inventory.py` verifies containment using the square's maximum radial distance and a lower bound on WGS84 curvature radius, not a flat degrees-to-metres conversion. The eventual GDAL builder must validate the actual reprojected footprint and keep radio-ray terrain beyond the narrow flight corridor.

Vertical heights are orthometric metres relative to EGM2008 (EPSG:3855); terrain is a DSM surface rather than bare ground. Source and package metadata retain that datum, nominal source spacing, and actual output spacing. No ellipsoidal/orthometric conversion is silently assumed.

## Source acquisition evidence

The checked public lists contain all **20** one-degree cells spanning N44-N47, E011-E015 in GLO-30 Public, with **0** GLO-90 fallbacks and **0** absent cells. The inventory records the retrieval time, source-list hashes, exact tile URLs, and per-cell status. Listing does not establish pixel validity, source accuracy, successful download, or package feasibility: `downloaded` and `contentValidated` remain false until those operations occur. Source gaps found inside downloaded tiles remain unknown despite listing availability.

Reproduce the metadata check with:

```sh
python3 tools/terrain/source_inventory.py terrain/regions/alpine-adriatic.json terrain/regions/alpine-adriatic.sources.json
```

This maintainer command requires network access; runtime planning does not use it. It reads tile lists, not elevation payloads. Tile organization and resolution codes follow the provider's [COG documentation](https://copernicus-dem-30m.s3.amazonaws.com/readme.html). The selected AWS public COG release is recorded separately from newer releases available through other access routes; see the [dataset registry](https://registry.opendata.aws/copernicus-dem/).

## Ocean, fallback, and attribution

Natural Earth 1:10m ocean polygons version 5.1.1 are the selected [ocean/context source](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-ocean/). They do not independently authorize filling a missing coastal DEM cell. Confirm ocean against source/water evidence before assigning the explicit ocean validity class. Where confirmation is unavailable, preserve unknown data. No source-list absence is interpreted as ocean.

If a primary tile later becomes unavailable, the inventory selects and explicitly labels an available GLO-90 tile at its actual nominal 90 m spacing. A 30 m output grid must not claim that such fallback has 30 m source detail. Absence in both lists is recorded as unknown and requires further acquisition or withholding confident feasibility.

The regional configuration retains the required modified-data attribution notices for GLO-30 and conditional GLO-90 plus Natural Earth credit. The builder and application must carry applicable notices into the shipped package and interface. Licensing, datum, and accuracy metadata are documented by the [Copernicus provider](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM); Natural Earth documents its [public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/).

## Current implementation boundary

No elevation files have been downloaded and no terrain package has been built. The current environment has Python 3.9 but lacks `gdalwarp`, `gdalinfo`, and the `osgeo` Python bindings. Task 1.4 requires a working Python/GDAL environment to build and verify even its small reprojection fixture. Region selection and the acquisition inventory are complete independently of that setup.
