"""Export prepared rasters as fixed binary tiles and conservative overviews."""

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from osgeo import gdal

gdal.UseExceptions()
TILE_CELLS = 256


def quantize(display, obstruction, validity):
    if display.shape != obstruction.shape or display.shape != validity.shape:
        raise ValueError("Height and validity dimensions must match.")
    if not np.isin(validity, [0, 1, 2]).all():
        raise ValueError("Validity must use explicit unknown/source/ocean classes.")
    valid = validity != 0
    if not np.isfinite(display[valid]).all() or not np.isfinite(obstruction[valid]).all():
        raise ValueError("Known cells require finite elevations.")
    if np.any(obstruction[valid] < display[valid]):
        raise ValueError("Conservative obstruction heights cannot be below display heights.")
    ocean = validity == 2
    if np.any(display[ocean] != 0) or np.any(obstruction[ocean] != 0):
        raise ValueError("Confirmed ocean must use sea-level heights.")
    d = np.where(valid, np.rint(display), 0)
    o = np.where(valid, np.ceil(obstruction), 0)
    if np.any(d < -32768) or np.any(d > 32767) or np.any(o < -32768) or np.any(o > 32767):
        raise ValueError("Elevation is outside signed 16-bit metre range.")
    return d.astype('<i2'), o.astype('<i2'), validity.astype(np.uint8)


def coarsen(display, obstruction, validity):
    height, width = display.shape
    shape = (math.ceil(height / 2), math.ceil(width / 2))
    d = np.zeros((shape[0] * 2, shape[1] * 2), dtype=np.int16)
    o = np.full_like(d, -32768)
    v = np.zeros(d.shape, dtype=np.uint8)
    d[:height, :width], o[:height, :width], v[:height, :width] = display, obstruction, validity
    blocks = lambda array: array.reshape(shape[0], 2, shape[1], 2).transpose(0, 2, 1, 3)
    vb = blocks(v)
    known = vb != 0
    counts = np.sum(known, axis=(2, 3))
    total = np.sum(np.where(known, blocks(d), 0), axis=(2, 3), dtype=np.float64)
    averages = np.rint(np.divide(total, counts, out=np.zeros(shape), where=counts != 0)).astype('<i2')
    # Retain peaks from unknown coarse footprints too: their mask can be unknown
    # because of a neighbouring hole, while their obstruction evidence is real.
    maxima = np.max(blocks(o), axis=(2, 3)).astype('<i2')
    # Any unknown input makes the conservative coarse footprint unknown.
    mask = np.where(np.all(known, axis=(2, 3)), 1, 0).astype(np.uint8)
    mask[np.all(vb == 2, axis=(2, 3))] = 2
    maxima[counts == 0] = 0
    return averages, maxima, mask


def write_asset(root, relative, data):
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = data.tobytes(order='C')
    path.write_bytes(payload)
    return {"path": relative, "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}


def export_arrays(display, obstruction, validity, cell_size, output, source_ids):
    if not math.isfinite(cell_size) or cell_size <= 0 or not source_ids:
        raise ValueError("A positive cell size and declared sources are required.")
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError("Tile output directory must be empty.")
    display, obstruction, validity = quantize(display, obstruction, validity)
    levels = []
    level = 0
    while True:
        height, width = display.shape
        columns, rows = math.ceil(width / TILE_CELLS), math.ceil(height / TILE_CELLS)
        tiles = []
        for row in range(rows):
            for column in range(columns):
                y, x = row * TILE_CELLS, column * TILE_CELLS
                h, w = min(TILE_CELLS, height - y), min(TILE_CELLS, width - x)
                tile = {"column": column, "row": row, "sourceIds": list(source_ids)}
                for name, array, dtype in [("display", display, '<i2'), ("obstruction", obstruction, '<i2'), ("validity", validity, 'u1')]:
                    data = np.zeros((TILE_CELLS, TILE_CELLS), dtype=dtype)
                    data[:h, :w] = array[y:y+h, x:x+w]
                    tile[name] = write_asset(output, f"tiles/{level}/{row}-{column}-{name}.bin", data)
                tiles.append(tile)
        levels.append({"level": level, "cellSizeM": cell_size * 2 ** level,
                       "columns": columns, "rows": rows, "tiles": tiles})
        if width <= TILE_CELLS and height <= TILE_CELLS:
            break
        display, obstruction, validity = coarsen(display, obstruction, validity)
        level += 1
    index = {"schemaVersion": 1, "levels": levels}
    (output / "tile-index.json").write_text(json.dumps(index, indent=2) + "\n")
    return index


def export_prepared(prepared, output, source_ids):
    prepared = Path(prepared)
    metadata = json.loads((prepared / "prepared.json").read_text())
    rasters = [gdal.Open(str(prepared / f"{name}.tif")) for name in ["display", "obstruction", "validity"]]
    if any(r.RasterXSize != metadata["width"] or r.RasterYSize != metadata["height"] for r in rasters):
        raise ValueError("Prepared raster dimensions differ from recorded metadata.")
    if any(r.GetGeoTransform() != rasters[0].GetGeoTransform() or r.GetProjection() != rasters[0].GetProjection() for r in rasters):
        raise ValueError("Prepared raster grids must be identical.")
    return export_arrays(*(r.ReadAsArray() for r in rasters), metadata["cellSizeM"], output, source_ids)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("prepared", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source-id", action="append", required=True)
    args = parser.parse_args()
    result = export_prepared(args.prepared, args.output, args.source_id)
    print(json.dumps({"levels": len(result["levels"]), "output": str(args.output)}))


if __name__ == "__main__":
    main()
