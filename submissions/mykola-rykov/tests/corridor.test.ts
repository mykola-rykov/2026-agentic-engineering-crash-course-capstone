import { expect, test } from 'vitest';
import { createCorridor, knownCorridorPoint, missionCorridor } from '../src/routing/corridor';
import { terrainFixture } from './fixtures/contracts';
import { newMission } from '../src/mission/defaults';
import type { TerrainStore } from '../src/terrain/store';
test('corridor width and waypoint legs restrict candidates within clipped package bounds', () => {
  const path = [{ xM: 0, yM: 0 }, { xM: 1000, yM: 0 }, { xM: 1000, yM: 1000 }];
  const bounds = { minXM: 0, maxXM: 2000, minYM: -500, maxYM: 1500 };
  const narrow = createCorridor(path, 100, bounds), wide = createCorridor(path, 1000, bounds);
  expect(narrow.bounds.minXM).toBe(0); expect(wide.bounds.minYM).toBe(-500);
  expect(narrow.contains({ xM: 500, yM: 100 })).toBe(false); expect(wide.contains({ xM: 500, yM: 100 })).toBe(true);
  expect(narrow.contains({ xM: 1020, yM: 500 })).toBe(true);
  expect(wide.contains({ xM: -1, yM: 0 })).toBe(false);
  const manifest = terrainFixture(), mission = newMission(manifest);
  expect(missionCorridor(mission, manifest).widthM).toBe(10_000);
});
test('geometric coverage never substitutes for missing terrain validity', async () => {
  const manifest = terrainFixture(); manifest.projectedBounds = { minXM: 0, maxXM: 7680, minYM: 0, maxYM: 7680 };
  const tile = { display: new Int16Array(65536), obstruction: new Int16Array(65536), validity: new Uint8Array(65536) };
  const store = { manifest, get: async () => tile } as unknown as TerrainStore;
  const point = { xM: 1000, yM: 4500 }, corridor = createCorridor([{ xM: 15, yM: 4500 }, point], 1000, manifest.projectedBounds);
  expect(corridor.contains(point)).toBe(true);
  expect((await knownCorridorPoint(store, corridor, point)).status).toBe('unknown');
  tile.validity.fill(1);
  expect((await knownCorridorPoint(store, corridor, point)).status).toBe('known');
  expect((await knownCorridorPoint(store, corridor, { xM: 1000, yM: 6000 })).status).toBe('unknown');
});
