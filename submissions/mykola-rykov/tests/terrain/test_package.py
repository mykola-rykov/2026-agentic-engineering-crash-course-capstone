import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f'tools/terrain/{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


package = load('package')
tiles = load('tiles')


def make_package(directory):
    directory = Path(directory)
    region = json.loads((ROOT / 'terrain/regions/alpine-adriatic.json').read_text())
    prepared = directory / 'prepared'
    prepared.mkdir()
    (prepared / 'prepared.json').write_text(json.dumps({"regionId": region['id'], "verticalDatum": region['verticalDatum'],
        "projectedBoundsM": [-120, -120, 120, 120]}))
    root = directory / 'package'
    data = np.ones((8, 8), dtype=np.float32)
    tiles.export_arrays(data, data, np.ones((8, 8), dtype=np.uint8), 30, root, ['fixture'])
    provenance = [{"id": "fixture", "dataset": "Synthetic fixture", "release": "1", "sourceUrl": "https://example.com/fixture",
                   "nominalResolutionM": 30, "verticalDatum": {"id": "EGM2008", "description": "Fixture orthometric heights"},
                   "verticalAccuracyM": None, "accuracyDescription": "Synthetic fixture, not actual accuracy",
                   "attribution": "Synthetic fixture", "licenseUrl": "https://example.com/license", "isFallback": False}]
    context = directory / 'context.geojson'
    context.write_text('{"type":"FeatureCollection","features":[]}')
    package.finalize(region, prepared, root, provenance, context_paths=[context])
    return root


class PackageTest(unittest.TestCase):
    def test_size_gate_boundary(self):
        package.size_gate(499999999)
        with self.assertRaisesRegex(ValueError, 'less than'):
            package.size_gate(500000000)

    def test_manifest_full_size_context_and_checksums(self):
        with tempfile.TemporaryDirectory() as directory:
            root = make_package(directory)
            result = package.validate_package(root)
            self.assertEqual(result['status'], 'valid')
            manifest = json.loads((root / 'manifest.json').read_text())
            self.assertEqual(result['uncompressedBytes'], sum(p.stat().st_size for p in root.rglob('*') if p.is_file()))
            self.assertEqual(len(manifest['contextAssets']), 1)
            self.assertTrue((root / 'ATTRIBUTION.txt').is_file())
            asset = root / manifest['levels'][0]['tiles'][0]['display']['path']
            payload = bytearray(asset.read_bytes())
            payload[0] ^= 1
            asset.write_bytes(payload)
            with self.assertRaisesRegex(ValueError, 'Checksum'):
                package.validate_package(root)

    def test_unknown_version_and_unindexed_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = make_package(directory)
            path = root / 'manifest.json'
            original = path.read_text()
            path.write_text(original.replace('"schemaVersion": 1', '"schemaVersion": 2', 1))
            with self.assertRaisesRegex(ValueError, 'Unsupported'):
                package.validate_package(root)
            path.write_text(original)
            (root / 'unindexed.bin').write_bytes(b'new bytes')
            with self.assertRaisesRegex(ValueError, 'actual package contents'):
                package.validate_package(root)


if __name__ == '__main__':
    unittest.main()
