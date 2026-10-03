import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("source_inventory", ROOT / "tools/terrain/source_inventory.py")
inventory = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(inventory)


class SourceInventoryTest(unittest.TestCase):
    def setUp(self):
        self.region = json.loads((ROOT / "terrain/regions/alpine-adriatic.json").read_text())

    def test_full_square_and_radio_rays_are_covered(self):
        required = inventory.validate_coverage(self.region)
        self.assertLess(required["south"], 45)
        self.assertGreater(required["north"], 47)
        self.assertLess(required["west"], 12)
        self.assertGreater(required["east"], 15)
        self.region["sourceEnvelopeDeg"]["west"] = 13
        with self.assertRaisesRegex(ValueError, "entire projected square"):
            inventory.validate_coverage(self.region)

    def test_primary_fallback_and_unknown_are_explicit(self):
        primary = inventory.tile_id(44, 11, "10")
        fallback = inventory.tile_id(44, 12, "30")
        result = inventory.build_inventory(self.region, primary, fallback, "fixture-date")
        self.assertEqual(len(result["tiles"]), 20)
        self.assertEqual(result["tiles"][0]["status"], "primary-listed")
        self.assertEqual(result["tiles"][1]["status"], "fallback-listed")
        self.assertEqual(result["tiles"][1]["nominalResolutionM"], 90)
        self.assertEqual(result["tiles"][2]["status"], "unknown")
        self.assertIsNone(result["tiles"][2]["downloadUrl"])
        self.assertFalse(any(tile["downloaded"] or tile["contentValidated"] for tile in result["tiles"]))


if __name__ == "__main__":
    unittest.main()
