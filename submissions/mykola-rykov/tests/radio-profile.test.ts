import { expect, test } from 'vitest';
import { curvatureM, curvedTerrain, sampleRadioRay } from '../src/rf/profile';
import { terrainFixture } from './fixtures/contracts';
import type { TerrainTile } from '../src/terrain/sampling';
function tile(): TerrainTile { return { display: new Int16Array(65536), obstruction: new Int16Array(65536), validity: new Uint8Array(65536).fill(1) }; }
function manifest() { const m = terrainFixture(); m.projectedBounds = { minXM: 0, maxXM: 7680, minYM: 0, maxYM: 7680 }; return m; }
test('entire radio ray samples at no more than finest spacing and exposes a gap away from route', async () => {
  const data = tile(); data.obstruction.fill(100); data.display.fill(100);
  // A stationary ground station and destination can both be valid while the intervening ray is not.
  data.validity[100 * 256 + 100] = 0;
  const profile = await sampleRadioRay(manifest(), async () => data, { xM: 15, yM: 4665 }, { xM: 7605, yM: 4665 });
  expect(profile.status).toBe('unknown'); expect(profile.missingSampleCount).toBeGreaterThan(0);
  expect(profile.validity[0]).toBe(1); expect(profile.validity.at(-1)).toBe(1);
  for (let i = 1; i < profile.distanceM.length; i++) expect(profile.distanceM[i]! - profile.distanceM[i - 1]!).toBeLessThanOrEqual(30.000000001);
  expect(Array.from(profile.terrainM).some(Number.isNaN)).toBe(true);
});
test('100 km curvature is 147.15 m at k=4/3 and zero at endpoints', () => {
  expect(curvatureM(50_000, 100_000)).toBeCloseTo(147.151153665, 8);
  expect(curvatureM(0, 100_000)).toBe(0); expect(curvatureM(100_000, 100_000)).toBe(0);
  expect(curvatureM(50_000, 100_000, 1)).toBeGreaterThan(curvatureM(50_000, 100_000));
});
test('unknown validity stays unknown; uncertainty and curvature are applied once', async () => {
  const data = tile(); data.obstruction.fill(-5); data.display.fill(-5);
  const profile = await sampleRadioRay(manifest(), async () => data, { xM: 15, yM: 4665 }, { xM: 3015, yM: 4665 });
  const curved = curvedTerrain(profile, 4 / 3, 3);
  expect(profile.terrainM[50]).toBe(-5); expect(curved[50]).toBeCloseTo(-2 + curvatureM(1500, 3000), 10);
});
test('cancellation is checked after yielded bounded sampling work', async () => {
  const controller = new AbortController(), data = tile(); let progressCalls = 0;
  await expect(sampleRadioRay(manifest(), async () => data, { xM: 15, yM: 4665 }, { xM: 7605, yM: 4665 }, { signal: controller.signal, checkpoint: async () => { controller.abort(); }, progress: () => { progressCalls++; } })).rejects.toThrow();
  expect(progressCalls).toBe(1);
});
