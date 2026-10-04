import { expect, test } from 'vitest';
import { deltaBullington, freeSpaceLossDb, knifeEdgeLossDb, sphericalLossDb } from '../src/rf/propagation';
import published from './fixtures/rf/itu-delta-bullington.json';
import single from './fixtures/rf/analytical-single-ridge.json';
test('all twenty independently published ITU losses and intermediate heights agree', () => {
  for (const fixture of published.cases) {
    const profile = published.profiles[fixture.profileId as keyof typeof published.profiles];
    const result = deltaBullington(profile.map((p) => p[0]!), profile.map((p) => p[1]!), profile[0]![1]! + fixture.transmitterAboveTerrainM, profile.at(-1)![1]! + fixture.receiverAboveTerrainM, fixture.frequencyHz, { effectiveEarthRadiusM: published.referenceEffectiveEarthRadiusM, speedOfLightMps: published.referenceSpeedOfLightMps });
    for (const key of Object.keys(fixture.expected) as (keyof typeof result)[]) expect(Math.abs(result[key] - fixture.expected[key]), `${fixture.profileId}/${fixture.frequencyHz}/${key}`).toBeLessThan(key.includes('Height') ? .000001 : published.lossToleranceDb);
  }
});
test('independent single ridge matches the pre-recorded hand result', () => {
  const result = deltaBullington(single.distanceM, single.terrainHeightM, single.transmitterHeightDatumM, single.receiverHeightDatumM, single.frequencyHz, { effectiveEarthRadiusM: single.effectiveEarthRadiusM, speedOfLightMps: single.speedOfLightMps });
  expect(Math.abs(result.deltaBullingtonLossDb - single.expectedDeltaBullingtonLossDb)).toBeLessThan(single.toleranceDb);
});
test('flat analytical free-space, inverse-square trend and frequency limits', () => {
  expect(freeSpaceLossDb(1000, 1e9)).toBeCloseTo(92.44778322188337, 9);
  expect(freeSpaceLossDb(2000, 1e9) - freeSpaceLossDb(1000, 1e9)).toBeCloseTo(6.020599913279624, 9);
  for (const frequency of [99e6, 6e9 + 1, NaN]) expect(() => freeSpaceLossDb(1000, frequency)).toThrow();
  expect(() => freeSpaceLossDb(0, 1e9)).toThrow(); expect(knifeEdgeLossDb(-1)).toBe(0);
  expect(sphericalLossDb(1000, 100, 100, 8500000, .3)).toBe(0);
});
test('unknown, unordered and buried-terminal profiles cannot produce a loss estimate', () => {
  for (const distances of [[0, 500, 500], [0, NaN, 1000]]) expect(() => deltaBullington(distances, [0, 0, 0], 10, 10, 1e9)).toThrow();
  expect(() => deltaBullington([0, 500, 1000], [0, NaN, 0], 10, 10, 1e9)).toThrow();
  expect(() => deltaBullington([0, 500, 1000], [0, 0, 0], -10, -10, 1e9)).toThrow();
});
