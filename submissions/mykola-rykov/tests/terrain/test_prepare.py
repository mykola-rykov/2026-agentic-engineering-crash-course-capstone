import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
from osgeo import gdal

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("prepare", ROOT / "tools/terrain/prepare.py")
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


def fixture(path, origin_x, data, projection="EPSG:32633"):
    raster = gdal.GetDriverByName("GTiff").Create(str(path), data.shape[1], data.shape[0], 1, gdal.GDT_Float32)
    raster.SetGeoTransform([origin_x, 10, 0, 5100000, 0, -10])
    raster.SetProjection(builder.spatial_reference(projection).ExportToWkt())
    raster.GetRasterBand(1).SetNoDataValue(-9999)
    raster.GetRasterBand(1).WriteArray(data)
    raster.FlushCache()
    raster = None


class PreparationTest(unittest.TestCase):
    def region(self):
        return {"schemaVersion": 1, "id": "fixture", "projection": "EPSG:32633", "targetCellSizeM": 20,
                "verticalDatum": {"id": "EGM2008", "units": "metres"},
                "projectedBoundsM": {"minX": 500000, "maxX": 500080, "minY": 5099960, "maxY": 5100000}}

    def test_mosaic_preserves_peak_and_unknown_cells(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            left, right = directory / "left.tif", directory / "right.tif"
            a = np.full((4, 4), -20, dtype=np.float32)
            a[1, 1] = 100
            a[3, 3] = -9999
            fixture(left, 500000, a)
            fixture(right, 500040, np.full((4, 4), 10, dtype=np.float32))
            metadata = builder.prepare(self.region(), [left, right], directory / "prepared", "EGM2008")
            self.assertEqual((metadata["width"], metadata["height"]), (4, 2))
            display = gdal.Open(str(directory / "prepared/display.tif")).ReadAsArray()
            obstruction = gdal.Open(str(directory / "prepared/obstruction.tif")).ReadAsArray()
            validity = gdal.Open(str(directory / "prepared/validity.tif")).ReadAsArray()
            self.assertAlmostEqual(float(display[0, 0]), 10)
            self.assertEqual(float(obstruction[0, 0]), 100)
            self.assertEqual(int(validity[1, 1]), 0)
            self.assertEqual(int(validity[0, 2]), 1)
            self.assertTrue(np.any(display < 0))
            self.assertEqual(json.loads((directory / "prepared/prepared.json").read_text())["sourceOverviewPolicy"], "NONE")

    def test_actual_horizontal_reprojection_and_datum_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            source = directory / "source.tif"
            fixture(source, 500000, np.full((4, 4), 40, dtype=np.float32))
            region = self.region()
            region["projection"] = "+proj=aeqd +lat_0=46.053933 +lon_0=15 +datum=WGS84 +units=m"
            region["targetCellSizeM"] = 10
            region["projectedBoundsM"] = {"minX": -10, "maxX": 50, "minY": -50, "maxY": 10}
            metadata = builder.prepare(region, [source], directory / "prepared", "EGM2008")
            self.assertEqual(metadata["width"], 6)
            actual = gdal.Open(str(directory / "prepared/display.tif"))
            self.assertIn("Azimuthal_Equidistant", actual.GetProjection())
            self.assertTrue(np.any(actual.ReadAsArray() == 40))
            with self.assertRaisesRegex(ValueError, "vertical datum"):
                builder.prepare(region, [source], directory / "wrong-datum", "ellipsoid")
            with self.assertRaisesRegex(ValueError, "empty"):
                builder.prepare(region, [source], directory / "prepared", "EGM2008")


if __name__ == "__main__":
    unittest.main()
