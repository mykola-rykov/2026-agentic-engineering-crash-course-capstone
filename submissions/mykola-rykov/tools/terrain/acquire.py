"""Maintainer-invoked acquisition of listed regional sources and local map context."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import subprocess
import zipfile

from osgeo import gdal
from package import digest, geographic_bounds
from prepare import aligned_grid

CONTEXT = [
    ('ne_10m_coastline', 'physical', '4.1.0'),
    ('ne_10m_admin_0_boundary_lines_land', 'cultural', '5.1.0'),
    ('ne_10m_populated_places_simple', 'cultural', '5.1.2'),
]


def download(url, destination):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    sidecar = destination.with_suffix(destination.suffix + '.sha256')
    if destination.exists() and sidecar.exists() and digest(destination) == sidecar.read_text().strip():
        return
    temporary = destination.with_suffix(destination.suffix + '.partial')
    subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error', '--retry', '2',
                    '--connect-timeout', '20', '--max-time', '300', '--output', str(temporary), url], check=True)
    checksum = digest(temporary)
    temporary.replace(destination)
    sidecar.write_text(checksum + '\n')


def acquire(region_path, inventory_path, output):
    region = json.loads(Path(region_path).read_text())
    inventory = json.loads(Path(inventory_path).read_text())
    if inventory['regionId'] != region['id']:
        raise ValueError('Inventory belongs to a different region.')
    output = Path(output)
    bounds = geographic_bounds(region['projection'], aligned_grid(region)[0])
    if bounds['crossesAntimeridian']:
        raise ValueError('This acquisition selector requires split source inventories for antimeridian regions.')
    selected = [tile for tile in inventory['tiles']
                if tile['westDeg'] < math.ceil(bounds['eastDeg']) and tile['westDeg'] + 1 > math.floor(bounds['westDeg'])
                and tile['southDeg'] < math.ceil(bounds['northDeg']) and tile['southDeg'] + 1 > math.floor(bounds['southDeg'])]
    if not selected or any(not tile['downloadUrl'] for tile in selected):
        raise ValueError('Missing listed source coverage for the actual regional footprint.')
    def fetch_tile(tile):
        url = tile['downloadUrl']
        path = output / 'dem' / url.rsplit('/', 1)[-1]
        download(url, path)
        raster = gdal.Open(str(path), gdal.GA_ReadOnly)
        if raster.RasterCount != 1 or not raster.GetProjection():
            raise ValueError(f'Invalid source raster: {path}')
        print(json.dumps({'downloaded': path.name, 'bytes': path.stat().st_size}), flush=True)
        return {**tile, 'path': str(path.resolve()), 'downloaded': True, 'contentValidated': False,
                'metadataValidated': True, 'sha256': digest(path), 'bytes': path.stat().st_size}
    with ThreadPoolExecutor(max_workers=3) as pool:
        sources = list(pool.map(fetch_tile, selected))
    contexts = []
    for name, category, version in CONTEXT:
        url = f'https://naciscdn.org/naturalearth/10m/{category}/{name}.zip'
        archive = output / 'natural-earth' / f'{name}.zip'
        download(url, archive)
        extract = archive.parent / name
        extract.mkdir(exist_ok=True)
        with zipfile.ZipFile(archive) as zipped:
            for member in zipped.infolist():
                target = (extract / member.filename).resolve()
                if extract.resolve() not in target.parents:
                    raise ValueError('Unsafe context archive path.')
            zipped.extractall(extract)
        contexts.append({'name': name, 'version': version, 'url': url, 'sha256': digest(archive),
                         'path': str((extract / f'{name}.shp').resolve()), 'license': 'Public domain; Natural Earth'})
        print(json.dumps({'downloaded': archive.name, 'bytes': archive.stat().st_size}), flush=True)
    result = {'schemaVersion': 1, 'regionId': region['id'], 'checkedAtUtc': datetime.now(timezone.utc).isoformat(),
              'actualFootprintBounds': bounds, 'sources': sources, 'context': contexts}
    (output / 'acquisition.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('region', type=Path)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    result = acquire(args.region, args.inventory, args.output)
    print(json.dumps({'sources': len(result['sources']), 'contextLayers': len(result['context'])}), flush=True)


if __name__ == '__main__':
    main()
