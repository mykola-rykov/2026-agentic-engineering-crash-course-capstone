import { describe, expect, test } from 'vitest';
import { parseTerrainManifest } from '../src/contracts/terrain';
import { parseMission } from '../src/contracts/mission';
import { parseScenarioResult } from '../src/contracts/result';
import { parseWorkerRequest, parseWorkerResponse } from '../src/contracts/worker';
import { missionFixture, resultFixture, terrainFixture } from './fixtures/contracts';

describe('versioned file boundaries', () => {
  const boundaries = [
    ['terrain manifest', parseTerrainManifest, terrainFixture],
    ['mission', parseMission, missionFixture],
    ['scenario result', parseScenarioResult, resultFixture],
  ] as const;
  for (const [name, parse, fixture] of boundaries) {
    test(`${name} accepts a JSON round trip and rejects unsupported versions/fields`, () => {
      const value = fixture();
      expect(parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
      expect(() => parse({ ...value, schemaVersion: 2 })).toThrow('schemaVersion');
      expect(() => parse({ ...value, undocumentedField: true })).toThrow();
    });
  }
});

test('manifest refuses corruption declarations, traversal, unknown sources, and size boundary', () => {
  expect(() => parseTerrainManifest({ ...terrainFixture(), uncompressedBytes: 500_000_000 })).toThrow('uncompressedBytes');
  for (const change of [
    { path: '../secret' }, { sha256: 'invalid' }, { bytes: 2 },
  ]) {
    const value = terrainFixture();
    Object.assign(value.levels[0]!.tiles[0]!.display, change);
    expect(() => parseTerrainManifest(value)).toThrow();
  }
  const value = terrainFixture();
  value.levels[0]!.tiles[0]!.sourceIds = ['missing'];
  expect(() => parseTerrainManifest(value)).toThrow('unknown source');
});

test('manifest makes antimeridian convention explicit', () => {
  const value = terrainFixture();
  value.bounds = { westDeg: 179, eastDeg: -179, southDeg: 45, northDeg: 47, crossesAntimeridian: true };
  expect(parseTerrainManifest(value).bounds.crossesAntimeridian).toBe(true);
  value.bounds.crossesAntimeridian = false;
  expect(() => parseTerrainManifest(value)).toThrow('antimeridian');
});

test('mission rejects invalid numbers and preserves independent directions', () => {
  for (const frequencyHz of [NaN, Infinity, 99_999_999, 6_000_000_001]) expect(() => parseMission({ ...missionFixture(), frequencyHz })).toThrow('frequencyHz');
  expect(() => parseMission({ ...missionFixture(), totalDistanceLimitM: 100_001 })).toThrow('totalDistanceLimitM');
  const value = missionFixture();
  value.equipment[0]!.uplink.receiverSensitivityDbm = -110;
  expect(parseMission(value).equipment[0]!.downlink.receiverSensitivityDbm).toBe(-95);
});

test('mission rejects datum mixing and inverted altitude constraints', () => {
  const value = missionFixture();
  value.launch.altitude.datumId = 'ellipsoid';
  expect(() => parseMission(value)).toThrow('vertical datum');
  const limits = missionFixture();
  limits.constraints.minimumAltitude = { metres: 500, datumId: 'EGM2008', reference: 'datum' };
  limits.constraints.maximumAltitude = { metres: 400, datumId: 'EGM2008', reference: 'datum' };
  expect(() => parseMission(limits)).toThrow('ordered');
});

test('results cannot claim feasibility without radio, terrain, and energy evidence', () => {
  for (const field of ['feasibility', 'rfFeasibility', 'energyFeasibility'] as const) {
    const value = resultFixture();
    value[field] = { status: 'feasible', reasons: [] };
    expect(() => parseScenarioResult(value)).toThrow();
  }
  const value = resultFixture();
  value.feasibility = { status: 'infeasible', reasons: [] };
  expect(() => parseScenarioResult(value)).toThrow();
});

test('worker envelopes reject unsupported protocol versions and crossed job ids', () => {
  expect(parseWorkerRequest({ protocolVersion: 1, jobId: 'job', type: 'analyze', mission: missionFixture() }).type).toBe('analyze');
  expect(() => parseWorkerRequest({ protocolVersion: 2, jobId: 'job', type: 'cancel' })).toThrow('protocolVersion');
  expect(() => parseWorkerResponse({ protocolVersion: 1, jobId: 'different-job', type: 'result', results: [resultFixture()], refinement: 'final' })).toThrow('job id');
  expect(() => parseWorkerResponse({ protocolVersion: 1, jobId: 'job', type: 'progress', phase: 'sampling', fractionComplete: 1.1 })).toThrow('fractionComplete');
});

test('tile transfers validate representation length after structured clone', () => {
  const buffer = new ArrayBuffer(256 * 256 * 2);
  const value = { protocolVersion: 1, jobId: 'job', type: 'tile-buffer', packageId: 'region', level: 0, column: 0, row: 0, representation: 'display', buffer };
  const clone = structuredClone(value, { transfer: [buffer] });
  expect(buffer.byteLength).toBe(0);
  expect(parseWorkerResponse(clone).type).toBe('tile-buffer');
  expect(() => parseWorkerResponse(value)).toThrow('tile length');
});
