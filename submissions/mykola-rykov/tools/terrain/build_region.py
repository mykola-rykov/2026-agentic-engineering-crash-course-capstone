"""Build a selected region from previously acquired local files."""

import argparse
import json
from pathlib import Path

import numpy as np
from osgeo import gdal, ogr
from package import finalize, validate_package
from prepare import prepare
from tiles import export_prepared


def context_geojson(context, bounds, output):
    features = []
    for source in context:
        dataset = ogr.Open(source['path'])
        layer = dataset.GetLayer(0)
        layer.SetSpatialFilterRect(bounds['westDeg'], bounds['southDeg'], bounds['eastDeg'], bounds['northDeg'])
        for feature in layer:
            geometry = feature.GetGeometryRef()
            if not geometry:
                continue
            name = feature.GetField('name') if layer.GetLayerDefn().GetFieldIndex('name') >= 0 else None
            features.append({'type': 'Feature', 'geometry': json.loads(geometry.ExportToJson()),
                             'properties': {'layer': source['name'], 'name': name}})
    Path(output).write_text(json.dumps({'type': 'FeatureCollection', 'features': features}) + '\n')


def build_region(region_path, acquisition_path, prepared_path, package_path):
    region = json.loads(Path(region_path).read_text())
    acquisition = json.loads(Path(acquisition_path).read_text())
    if acquisition['regionId'] != region['id']:
        raise ValueError('Acquired sources belong to another region.')
    sources = acquisition['sources']
    print('Preparing regional display, obstruction, and validity rasters.', flush=True)
    prepare(region, [source['path'] for source in sources], prepared_path, region['verticalDatum']['id'])
    source_ids = sorted({source['sourceId'] for source in sources})
    print('Exporting binary tiles and conservative overviews.', flush=True)
    export_prepared(prepared_path, package_path, source_ids)
    context_path = Path(prepared_path) / 'context.geojson'
    context_geojson(acquisition['context'], acquisition['actualFootprintBounds'], context_path)
    provenance = []
    for source_id in source_ids:
        source = region['primary'] if source_id == region['primary']['id'] else region['fallback']
        notice = next(a['notice'] for a in region['attributionRequirements'] if ('WorldDEM-30' if source['nominalResolutionM'] == 30 else 'WorldDEM-90') in a['source'])
        provenance.append({'id': source_id, 'dataset': source_id, 'release': source['release'], 'sourceUrl': source['baseUrl'],
                           'nominalResolutionM': source['nominalResolutionM'],
                           'verticalDatum': {'id': region['verticalDatum']['id'], 'description': 'EGM2008 orthometric DSM heights'},
                           'verticalAccuracyM': None, 'accuracyDescription': 'Source product accuracy is not independently calibrated for this package.',
                           'attribution': notice, 'licenseUrl': region['attributionRequirements'][0]['licenseUrl'],
                           'isFallback': source_id != region['primary']['id']})
    finalize(region, prepared_path, package_path, provenance, context_paths=[context_path])
    report = validate_package(package_path)
    raster = gdal.Open(str(Path(prepared_path) / 'validity.tif'))
    mask = raster.ReadAsArray()
    report['knownCellFraction'] = float(np.count_nonzero(mask) / mask.size)
    report['widthCells'], report['heightCells'] = raster.RasterXSize, raster.RasterYSize
    Path(prepared_path, 'validation-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report), flush=True)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('region', type=Path)
    parser.add_argument('acquisition', type=Path)
    parser.add_argument('prepared', type=Path)
    parser.add_argument('package', type=Path)
    args = parser.parse_args()
    build_region(args.region, args.acquisition, args.prepared, args.package)


if __name__ == '__main__':
    main()
