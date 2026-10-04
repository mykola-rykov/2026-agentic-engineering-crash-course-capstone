"""Mosaic local elevations and prepare aligned display/obstruction/validity rasters."""

import argparse
import json
import math
from pathlib import Path
import tempfile

import numpy as np
from osgeo import gdal, osr

gdal.UseExceptions()
NODATA = -999999.0


def aligned_grid(region):
    cell = float(region["targetCellSizeM"])
    bounds = region["projectedBoundsM"]
    if not math.isfinite(cell) or cell <= 0:
        raise ValueError("Cell size must be positive and finite.")
    min_x, max_x = float(bounds["minX"]), float(bounds["maxX"])
    min_y, max_y = float(bounds["minY"]), float(bounds["maxY"])
    if not all(map(math.isfinite, [min_x, max_x, min_y, max_y])) or min_x >= max_x or min_y >= max_y:
        raise ValueError("Projected bounds must be finite and ordered.")
    width = math.ceil((max_x - min_x) / cell)
    height = math.ceil((max_y - min_y) / cell)
    return [min_x, max_y - height * cell, min_x + width * cell, max_y], width, height


def spatial_reference(definition):
    srs = osr.SpatialReference()
    srs.SetFromUserInput(definition)
    srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return srs


def source_mask(source, output):
    """Zero is actual invalid-mask data, never a nodata value to be skipped."""
    mask = gdal.GetDriverByName("GTiff").Create(str(output), source.RasterXSize, source.RasterYSize, 1, gdal.GDT_Byte,
                                                 options=["TILED=YES", "COMPRESS=DEFLATE"])
    mask.SetGeoTransform(source.GetGeoTransform())
    mask.SetProjection(source.GetProjection())
    band = source.GetRasterBand(1)
    for y in range(0, source.RasterYSize, 256):
        rows = min(256, source.RasterYSize - y)
        heights = band.ReadAsArray(0, y, source.RasterXSize, rows)
        valid = (band.GetMaskBand().ReadAsArray(0, y, source.RasterXSize, rows) != 0) & np.isfinite(heights)
        mask.GetRasterBand(1).WriteArray(valid.astype(np.uint8), 0, y)
    mask.FlushCache()
    mask = None


def prepare(region, source_paths, output, source_vertical_datum):
    if region.get("schemaVersion") != 1:
        raise ValueError("Unsupported region configuration version.")
    if source_vertical_datum != region["verticalDatum"]["id"]:
        raise ValueError("Source vertical datum must match the region; no implicit vertical conversion is supported.")
    bounds, width, height = aligned_grid(region)
    target = spatial_reference(region["projection"])
    if not target.IsProjected() or not math.isclose(target.GetLinearUnits(), 1.0):
        raise ValueError("Target projection must use metric coordinates.")
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError("Preparation output directory must be empty; existing work is never overwritten.")
    if not source_paths:
        raise ValueError("At least one local source raster is required.")
    sources = []
    for path in source_paths:
        source = gdal.Open(str(Path(path).resolve()), gdal.GA_ReadOnly)
        if source.RasterCount != 1 or not source.GetProjection():
            raise ValueError(f"Expected a single-band georeferenced elevation raster: {path}")
        transform = source.GetGeoTransform()
        if transform[2] or transform[4] or transform[1] <= 0 or transform[5] >= 0:
            raise ValueError("Sources must use north-up rasters.")
        if sources and not spatial_reference(source.GetProjection()).IsSame(spatial_reference(sources[0].GetProjection())):
            raise ValueError("Source rasters must share a horizontal CRS before mosaicking.")
        sources.append(source)
    with tempfile.TemporaryDirectory(prefix="rf-mosaic-", dir=output) as temp:
        temp = Path(temp)
        mosaic = gdal.BuildVRT(str(temp / "elevations.vrt"), [str(Path(p).resolve()) for p in source_paths],
                               options=gdal.BuildVRTOptions(resolution="highest", VRTNodata=NODATA))
        if mosaic is None:
            raise ValueError("Source mosaic could not be constructed.")
        masks = []
        for index, source in enumerate(sources):
            path = temp / f"mask-{index}.tif"
            source_mask(source, path)
            masks.append(str(path))
        transform = mosaic.GetGeoTransform()
        # A one-source-cell zero border makes partial footprints at dataset edges unknown.
        mask_bounds = [transform[0] - transform[1], transform[3] + transform[5] * (mosaic.RasterYSize + 1),
                       transform[0] + transform[1] * (mosaic.RasterXSize + 1), transform[3] - transform[5]]
        validity_mosaic = gdal.BuildVRT(str(temp / "validity.vrt"), masks,
                                        options=gdal.BuildVRTOptions(resolution="highest", outputBounds=mask_bounds))
        common = dict(format="GTiff", dstSRS=target.ExportToWkt(), outputBounds=bounds,
                      width=width, height=height, overviewLevel="NONE", warpMemoryLimit=128,
                      creationOptions=["TILED=YES", "COMPRESS=DEFLATE"],
                      errorThreshold=0, warpOptions=["NUM_THREADS=1"])
        for name, algorithm in [("display", "average"), ("obstruction", "max")]:
            raster = gdal.Warp(str(output / f"{name}.tif"), mosaic,
                               options=gdal.WarpOptions(**common, resampleAlg=algorithm, outputType=gdal.GDT_Float32,
                                                        dstNodata=NODATA, options=["-novshift"]))
            if raster is None:
                raise ValueError(f"Failed to prepare {name} raster.")
            raster.FlushCache()
            raster = None
        validity = gdal.Warp(str(output / "validity.tif"), validity_mosaic,
                             options=gdal.WarpOptions(**common, resampleAlg="min", outputType=gdal.GDT_Byte, dstNodata=255))
        # Distinct warp nodata avoids GDAL changing genuine zero classes to one.
        band = validity.GetRasterBand(1)
        for y in range(0, height, 256):
            rows = min(256, height - y)
            block = band.ReadAsArray(0, y, width, rows)
            block[block == 255] = 0
            band.WriteArray(block, 0, y)
        band.DeleteNoDataValue()
        validity.FlushCache()
        validity = None
        mosaic = None
        validity_mosaic = None
    metadata = {"schemaVersion": 1, "regionId": region["id"], "gdalVersion": gdal.VersionInfo(),
                "projection": region["projection"], "verticalDatum": region["verticalDatum"],
                "cellSizeM": region["targetCellSizeM"], "projectedBoundsM": bounds, "width": width, "height": height,
                "sources": [str(Path(p).resolve()) for p in source_paths], "sourceVerticalDatum": source_vertical_datum,
                "validityEncoding": "0-unknown-1-source", "sourceOverviewPolicy": "NONE"}
    (output / "prepared.json").write_text(json.dumps(metadata, indent=2) + "\n")
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("region", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source", type=Path, action="append", required=True)
    parser.add_argument("--source-vertical-datum", required=True)
    args = parser.parse_args()
    result = prepare(json.loads(args.region.read_text()), args.source, args.output, args.source_vertical_datum)
    print(json.dumps({"output": str(args.output), "width": result["width"], "height": result["height"]}))


if __name__ == "__main__":
    main()
