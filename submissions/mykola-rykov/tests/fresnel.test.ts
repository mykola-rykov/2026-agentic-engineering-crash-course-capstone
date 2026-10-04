import { expect, test } from 'vitest';
import { fresnelEvidence } from '../src/rf/fresnel';
import { curvatureM } from '../src/rf/profile';
import type { RadioProfile } from '../src/rf/profile';
const profile: RadioProfile = { status: 'known', distanceM: new Float64Array([0, 500, 1000]), terrainM: new Float64Array([0, 0, 0]), validity: new Uint8Array([1, 1, 1]), pathLengthM: 1000, missingSampleCount: 0, terrainDatumId: 'EGM2008' };
test('the 60 percent threshold changes clearance evidence without adding any loss', () => {
  const radius = Math.sqrt(299792458 / 1e9 * 250), thresholdHeight = .6 * radius + curvatureM(500, 1000);
  const below = fresnelEvidence(profile, thresholdHeight - .001, thresholdHeight - .001, 1e9);
  const above = fresnelEvidence(profile, thresholdHeight + .001, thresholdHeight + .001, 1e9);
  expect(below.status === 'known' && below.meetsSixtyPercentFresnel).toBe(false);
  expect(above.status === 'known' && above.meetsSixtyPercentFresnel).toBe(true);
  expect(above.status === 'known' && above.limitingDistanceM).toBe(500);
  expect(Object.keys(above).some((key) => /loss/i.test(key))).toBe(false);
});
test('missing terrain is unknown and height uncertainty affects clearance only', () => {
  expect(fresnelEvidence({ ...profile, status: 'unknown' }, 10, 10, 1e9).status).toBe('unknown');
  const nominal = fresnelEvidence(profile, 10, 10, 1e9), uncertain = fresnelEvidence(profile, 10, 10, 1e9, 4 / 3, 2);
  if (nominal.status !== 'known' || uncertain.status !== 'known') throw new Error('Expected known fixture');
  expect(nominal.clearanceM[1]! - uncertain.clearanceM[1]!).toBeCloseTo(2, 12);
});
