"""Finalize and validate a local terrain package, including all uncompressed bytes."""

import argparse
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import shutil

import numpy as np
from osgeo import osr

LIMIT = 500_000_000
ENCODING = {"elevation": "int16", "byteOrder": "little-endian", "elevationUnitM": 1,
            "tileCells": 256, "displayResampling": "average", "obstructionResampling": "maximum",
            "validity": "uint8-0-unknown-1-source-2-confirmed-ocean"}


def size_gate(size):
    if size >= LIMIT:
        raise ValueError(f"Package has {size} bytes; must be less than {LIMIT} uncompressed bytes.")


def package_files(root):
    files = []
    for path in Path(root).rglob('*'):
        if path.is_symlink():
            raise ValueError("Package symlinks are not allowed.")
        if path.is_file():
            files.append(path)
    return files


def digest(path):
    sha = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            sha.update(block)
    return sha.hexdigest()


def geographic_bounds(projection, bounds):
    source, target = osr.SpatialReference(), osr.SpatialReference()
    source.SetFromUserInput(projection)
    target.ImportFromEPSG(4326)
    source.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    target.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    transform = osr.CoordinateTransformation(source, target)
    x0, y0, x1, y1 = bounds
    coordinates = []
    for i in range(129):
        f = i / 128
        for x, y in [(x0 + (x1-x0)*f, y0), (x0 + (x1-x0)*f, y1), (x0, y0 + (y1-y0)*f), (x1, y0 + (y1-y0)*f)]:
            longitude, latitude, _ = transform.TransformPoint(x, y)
            coordinates.append((((longitude + 180) % 360) - 180, latitude))
    longitudes = sorted(point[0] for point in coordinates)
    gaps = [((longitudes[(i+1) % len(longitudes)] - longitude) % 360, i) for i, longitude in enumerate(longitudes)]
    _, index = max(gaps)
    west = longitudes[(index + 1) % len(longitudes)]
    east = longitudes[index]
    return {"westDeg": west, "eastDeg": east, "southDeg": min(p[1] for p in coordinates),
            "northDeg": max(p[1] for p in coordinates), "crossesAntimeridian": west > east}


def finalize(region, prepared, root, provenance, version="1", context_paths=()):
    root, prepared = Path(root), Path(prepared)
    if (root / 'manifest.json').exists():
        raise ValueError("Package is already finalized; rebuild in a new directory.")
    metadata = json.loads((prepared / 'prepared.json').read_text())
    index = json.loads((root / 'tile-index.json').read_text())
    if metadata['regionId'] != region['id'] or metadata['verticalDatum']['id'] != region['verticalDatum']['id']:
        raise ValueError("Prepared region or vertical datum differs from configuration.")
    source_ids = {source['id'] for source in provenance}
    indexed_ids = {source for level in index['levels'] for tile in level['tiles'] for source in tile['sourceIds']}
    if source_ids != indexed_ids:
        raise ValueError("Provenance ids must match the sources indexed by tiles.")
    contexts = []
    for path in map(Path, context_paths):
        destination = root / 'context' / path.name
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            raise ValueError("Context asset names must be unique.")
        shutil.copyfile(path, destination)
        contexts.append({"path": destination.relative_to(root).as_posix(), "bytes": destination.stat().st_size,
                         "sha256": digest(destination)})
    x0, y0, x1, y1 = metadata['projectedBoundsM']
    notices = [entry['notice'] for entry in region['attributionRequirements']]
    (root / 'ATTRIBUTION.txt').write_text('\n\n'.join(notices) + '\n')
    manifest = {
        "schemaVersion": 1, "id": region['id'], "packageVersion": version, "name": region['name'],
        "center": region['center'], "bounds": geographic_bounds(region['projection'], metadata['projectedBoundsM']),
        "projectedBounds": {"minXM": x0, "maxXM": x1, "minYM": y0, "maxYM": y1},
        "projection": {"definition": region['projection'], "horizontalDatum": "WGS84", "units": "metres"},
        "verticalDatum": {"id": region['verticalDatum']['id'], "description": f"{region['verticalDatum']['id']} orthometric metre heights; DSM surface"},
        "encoding": ENCODING, "sources": provenance,
        "oceanMask": {"source": region['oceanIdentification']['source'], "version": region['oceanIdentification']['version'],
                      "method": "No inferred ocean fill; uncertain cells remain unknown", "coastalUncertaintyM": 0},
        "levels": index['levels'], "contextAssets": contexts, "uncompressedBytes": 0, "attribution": notices,
    }
    # The size includes manifest bytes themselves: solve until the decimal length stabilizes.
    base_size = sum(path.stat().st_size for path in package_files(root))
    for _ in range(10):
        payload = json.dumps(manifest, indent=2) + '\n'
        size = base_size + len(payload.encode())
        size_gate(size)
        if size == manifest['uncompressedBytes']:
            (root / 'manifest.json').write_text(payload)
            validate_package(root)
            return manifest
        manifest['uncompressedBytes'] = size
    raise ValueError("Package byte accounting did not converge.")


def validate_package(root):
    root = Path(root).resolve()
    manifest = json.loads((root / 'manifest.json').read_text())
    if manifest.get('schemaVersion') != 1 or manifest.get('encoding') != ENCODING:
        raise ValueError("Unsupported manifest version or tile encoding.")
    actual = sum(path.stat().st_size for path in package_files(root))
    size_gate(actual)
    if actual != manifest['uncompressedBytes']:
        raise ValueError("Recorded uncompressed size differs from actual package contents.")
    if not manifest['attribution'] or not manifest['sources']:
        raise ValueError("Attribution and provenance are required.")
    ids = {source['id'] for source in manifest['sources']}
    if len(ids) != len(manifest['sources']):
        raise ValueError("Provenance ids must be unique.")
    paths = set()
    assets = list(manifest['contextAssets'])
    for i, level in enumerate(manifest['levels']):
        if level['level'] != i or level['cellSizeM'] != manifest['levels'][0]['cellSizeM'] * 2 ** i:
            raise ValueError("Invalid overview level spacing.")
        locations = set()
        for tile in level['tiles']:
            location = (tile['column'], tile['row'])
            if location in locations or not (0 <= location[0] < level['columns'] and 0 <= location[1] < level['rows']):
                raise ValueError("Duplicate or out-of-range tile location.")
            locations.add(location)
            if not tile['sourceIds'] or any(source not in ids for source in tile['sourceIds']):
                raise ValueError("Missing or unknown source provenance.")
            for name, size in [('display', 131072), ('obstruction', 131072), ('validity', 65536)]:
                if tile[name]['bytes'] != size:
                    raise ValueError("Invalid fixed tile length.")
                assets.append(tile[name])
        if len(locations) != level['columns'] * level['rows']:
            raise ValueError("The rectangular tile index must include unknown tiles for gaps.")
    for asset in assets:
        path = PurePosixPath(asset['path'])
        if path.is_absolute() or '..' in path.parts or path.as_posix() != asset['path'] or asset['path'] in paths:
            raise ValueError("Unsafe or duplicated asset path.")
        paths.add(asset['path'])
        file = (root / path).resolve()
        if root not in file.parents or not file.is_file() or file.stat().st_size != asset['bytes']:
            raise ValueError(f"Missing or wrong-sized asset: {asset['path']}")
        if digest(file) != asset['sha256']:
            raise ValueError(f"Checksum mismatch: {asset['path']}")
    for level in manifest['levels']:
        for tile in level['tiles']:
            validity = np.fromfile(root / tile['validity']['path'], dtype=np.uint8)
            if not np.isin(validity, [0, 1, 2]).all():
                raise ValueError("Invalid validity class.")
            d = np.fromfile(root / tile['display']['path'], dtype='<i2')
            o = np.fromfile(root / tile['obstruction']['path'], dtype='<i2')
            if np.any(o[validity != 0] < d[validity != 0]) or np.any(d[validity == 2]) or np.any(o[validity == 2]):
                raise ValueError("Invalid obstruction or confirmed-ocean heights.")
    return {"id": manifest['id'], "uncompressedBytes": actual, "levels": len(manifest['levels']), "status": "valid"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    finalize_parser = commands.add_parser('finalize')
    finalize_parser.add_argument('region', type=Path)
    finalize_parser.add_argument('prepared', type=Path)
    finalize_parser.add_argument('package', type=Path)
    finalize_parser.add_argument('--provenance', type=Path, required=True)
    finalize_parser.add_argument('--version', default='1')
    finalize_parser.add_argument('--context', type=Path, action='append', default=[])
    validate_parser = commands.add_parser('validate')
    validate_parser.add_argument('package', type=Path)
    args = parser.parse_args()
    if args.command == 'finalize':
        finalize(json.loads(args.region.read_text()), args.prepared, args.package,
                 json.loads(args.provenance.read_text()), args.version, args.context)
    print(json.dumps(validate_package(args.package)))


if __name__ == '__main__':
    main()
