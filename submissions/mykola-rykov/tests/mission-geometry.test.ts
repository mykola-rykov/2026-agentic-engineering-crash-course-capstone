import { expect, test } from 'vitest';
import { accountDistance, launchCoverage } from '../src/mission/geometry';
import { createProjection } from '../src/terrain/coordinates';
import { missionFixture, terrainFixture } from './fixtures/contracts';
import { newMission } from '../src/mission/defaults';
import { parseMission } from '../src/contracts/mission';
test('60 km outbound plus return violates a 100 km total cap', () => {
  const points = [{ xM: 0, yM: 0, altitudeM: 100 }, { xM: 60_000, yM: 0, altitudeM: 100 }];
  expect(accountDistance(points, 'return', 100_000)).toMatchObject({ outboundM: 60_000, inboundM: 60_000, totalM: 120_000, exceedsLimit: true });
  expect(accountDistance(points, 'one-way', 100_000).exceedsLimit).toBe(false);
});
test('waypoints and climbs count; unknown altitudes give only a lower bound', () => {
  const points = [{ xM: 0, yM: 0, altitudeM: 0 }, { xM: 3, yM: 0, altitudeM: 4 }, { xM: 6, yM: 0, altitudeM: 0 }];
  expect(accountDistance(points, 'return', 100).totalM).toBe(20);
  expect(accountDistance([{ xM: 0, yM: 0, altitudeM: null }, { xM: 3, yM: 0, altitudeM: 4 }], 'one-way', 100)).toMatchObject({ complete: false, totalM: 3 });
});
test('edge launches expose limited radius and defaults are explicit', () => {
  const terrain = terrainFixture(), mission = missionFixture();
  mission.launch.position = createProjection(terrain).inverse({ xM: 109_000, yM: 0 });
  const coverage = launchCoverage(terrain, mission); expect(coverage.limited).toBe(true); expect(coverage.edgeDistanceM).toBeCloseTo(1000, 4);
  const defaults = parseMission(newMission(terrain));
  expect(defaults.flightMode).toBe('one-way'); expect(defaults.wind.speedMps).toBe(0);
  expect(defaults.constraints).toMatchObject({ batteryReserveFraction: .2, requiredMarginDb: 10, minimumAltitude: null, maximumAltitude: null, minimumTerrainClearanceM: null });
});
