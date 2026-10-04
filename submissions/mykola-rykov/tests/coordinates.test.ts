import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';
import { createProjection, resolveAltitude } from '../src/terrain/coordinates';
import { sampleTerrain } from '../src/terrain/sampling';
import { terrainFixture } from './fixtures/contracts';

test('regional, antimeridian and high-latitude transforms agree with GDAL within one metre', () => {
  for (const [latitude, longitude] of [[46.2057222222, 13.6899166667], [65, 179.8], [85, 20]]) {
    const manifest = terrainFixture();
    manifest.projection.definition = `+proj=aeqd +lat_0=${latitude} +lon_0=${longitude} +datum=WGS84 +units=m`;
    const points = [[0, 0], [110000, 0], [-110000, -110000], [0, 110000]];
    const script = 'import sys,json; from osgeo import osr; a=osr.SpatialReference(); a.SetFromUserInput(sys.argv[1]); b=osr.SpatialReference(); b.ImportFromEPSG(4326); a.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER); b.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER); t=osr.CoordinateTransformation(a,b); print(json.dumps([t.TransformPoint(*p)[:2] for p in json.loads(sys.argv[2])]))';
    const response = spawnSync(process.execPath, ['scripts/terrain-python.mjs', '-c', script, manifest.projection.definition, JSON.stringify(points)], { encoding: 'utf8', timeout: 30000 });
    expect(response.status, response.stderr).toBe(0);
    const references = JSON.parse(response.stdout) as [number, number][];
    const projection = createProjection(manifest);
    references.forEach(([longitudeDeg, latitudeDeg], index) => {
      const expected = points[index]!;
      const projected = projection.forward({ latitudeDeg, longitudeDeg });
      expect(Math.hypot(projected.xM - expected[0]!, projected.yM - expected[1]!)).toBeLessThan(1);
      const geographic = projection.inverse({ xM: expected[0]!, yM: expected[1]! });
      const roundTrip = projection.forward(geographic);
      expect(Math.hypot(roundTrip.xM - expected[0]!, roundTrip.yM - expected[1]!)).toBeLessThan(1);
    });
  }
}, 100000);

test('datum heights and DSM-relative heights cannot silently mix datums or missing surfaces', () => {
  expect(resolveAltitude({ metres: 10, datumId: 'EGM2008', reference: 'above-dsm' }, 'EGM2008', -20)).toBe(-10);
  expect(resolveAltitude({ metres: 10, datumId: 'EGM2008', reference: 'above-dsm' }, 'EGM2008', null)).toBeNull();
  expect(() => resolveAltitude({ metres: 10, datumId: 'ellipsoid', reference: 'datum' }, 'EGM2008', 0)).toThrow('Incompatible');
});

test('sampling across a tile seam preserves negative heights, maxima and unknown cells', async () => {
  const manifest = terrainFixture();
  manifest.projectedBounds = { minXM: 0, maxXM: 512 * 30, minYM: 0, maxYM: 256 * 30 };
  const left = { display: new Int16Array(65536).fill(-20), obstruction: new Int16Array(65536).fill(-10), validity: new Uint8Array(65536).fill(1) };
  const right = { display: new Int16Array(65536).fill(-40), obstruction: new Int16Array(65536).fill(100), validity: new Uint8Array(65536).fill(1) };
  const lookup = async (_level: number, column: number) => column === 0 ? left : right;
  const point = { xM: 256 * 30, yM: manifest.projectedBounds.maxYM - 30 };
  const sample = await sampleTerrain(manifest, lookup, point);
  expect(sample).toMatchObject({ status: 'known', displayHeightM: -30, obstructionHeightM: 100, datumId: 'EGM2008' });
  right.validity[0] = 0;
  expect(await sampleTerrain(manifest, lookup, point)).toMatchObject({ status: 'unknown' });
  expect(await sampleTerrain(manifest, lookup, { xM: -1, yM: point.yM })).toMatchObject({ status: 'unknown' });
});
