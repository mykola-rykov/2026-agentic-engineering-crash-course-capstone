import importlib.util
from pathlib import Path
import tempfile
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("tiles", ROOT / "tools/terrain/tiles.py")
tiles = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tiles)


class BinaryTilesTest(unittest.TestCase):
    def test_quantization_negative_peaks_and_ocean(self):
        display = np.array([[-20.4, 10.1], [0, -999999]], dtype=np.float32)
        obstruction = np.array([[-20.1, 100.2], [0, -999999]], dtype=np.float32)
        validity = np.array([[1, 1], [2, 0]], dtype=np.uint8)
        d, o, v = tiles.quantize(display, obstruction, validity)
        self.assertEqual(int(d[0, 0]), -20)
        self.assertEqual(int(o[0, 1]), 101)
        self.assertEqual(int(v[1, 0]), 2)
        self.assertEqual(int(v[1, 1]), 0)
        obstruction[1, 0] = 2
        with self.assertRaisesRegex(ValueError, "sea-level"):
            tiles.quantize(display, obstruction, validity)

    def test_overviews_preserve_peaks_and_unknown_footprints(self):
        d = np.full((4, 4), -20, dtype=np.int16)
        o = d.copy()
        o[0, 0] = 101
        v = np.ones((4, 4), dtype=np.uint8)
        v[3, 3] = 0
        coarse_d, coarse_o, coarse_v = tiles.coarsen(d, o, v)
        self.assertEqual(int(coarse_o[0, 0]), 101)
        self.assertEqual(int(coarse_v[1, 1]), 0)
        self.assertEqual(int(coarse_d[0, 0]), -20)
        _, highest, _ = tiles.coarsen(coarse_d, coarse_o, coarse_v)
        self.assertEqual(int(highest[0, 0]), 101)
        v[0, 1] = 0
        cd, co, cv = tiles.coarsen(d, o, v)
        self.assertEqual(int(cv[0, 0]), 0)
        _, retained, _ = tiles.coarsen(cd, co, cv)
        self.assertEqual(int(retained[0, 0]), 101)
        ocean = np.full((2, 2), 2, dtype=np.uint8)
        _, _, reduced = tiles.coarsen(np.zeros((2, 2)), np.zeros((2, 2)), ocean)
        self.assertEqual(int(reduced[0, 0]), 2)

    def test_tiles_have_fixed_lengths_little_endian_and_unknown_padding(self):
        with tempfile.TemporaryDirectory() as directory:
            d = np.full((257, 257), -100, dtype=np.float32)
            v = np.ones(d.shape, dtype=np.uint8)
            index = tiles.export_arrays(d, d, v, 30, directory, ["fixture"])
            self.assertEqual(len(index["levels"]), 2)
            self.assertEqual(len(index["levels"][0]["tiles"]), 4)
            asset = index["levels"][0]["tiles"][3]
            heights = (Path(directory) / asset["obstruction"]["path"]).read_bytes()
            mask = (Path(directory) / asset["validity"]["path"]).read_bytes()
            self.assertEqual(len(heights), 131072)
            self.assertEqual(heights[:2], b'\x9c\xff')
            self.assertEqual(len(mask), 65536)
            self.assertEqual(mask[0], 1)
            self.assertEqual(mask[1], 0)


if __name__ == "__main__":
    unittest.main()
