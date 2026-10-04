import { expect, test } from 'vitest';
import { AnalysisCache, analyzeMission } from '../src/rf/analysis';
import { newMission } from '../src/mission/defaults';
import { terrainFixture } from './fixtures/contracts';
import { createProjection } from '../src/terrain/coordinates';
import type { TerrainStore } from '../src/terrain/store';
import type { JobContext } from '../src/workers/lifecycle';
import { BoundedCache } from '../src/workers/cache';
import { illustrativeAircraft } from '../src/energy/profiles';
function fixture() {
  const manifest = terrainFixture(); manifest.projectedBounds = { minXM: 0, maxXM: 7680, minYM: 0, maxYM: 7680 };
  const tile = { display: new Int16Array(65536), obstruction: new Int16Array(65536), validity: new Uint8Array(65536).fill(1) };
  const store = { manifest, get: async () => tile } as unknown as TerrainStore;
  const mission = newMission(manifest), projection = createProjection(manifest);
  mission.launch.position = projection.inverse({ xM: 15, yM: 4665 }); mission.launch.altitude = { metres: 100, reference: 'datum', datumId: manifest.verticalDatum.id };
  mission.destination.position = projection.inverse({ xM: 1015, yM: 4665 }); mission.destination.altitude = { ...mission.launch.altitude };
  mission.groundAntennaHeightAboveSurfaceM = 10; mission.assumptions.terrainHeightUncertaintyM = 0;
  return { mission, store, tile };
}
function context(): JobContext { return { jobId: 'test-job', checkpoint: async () => {}, progress: () => {}, emit: () => {} }; }
test('manual RF results retain separate links and reuse propagation for power-only changes', async () => {
  const { mission, store } = fixture(), cache = new AnalysisCache();
  const before = (await analyzeMission(mission, store, context(), cache))[0]!;
  const misses = cache.propagationMisses;
  mission.equipment[0]!.uplink.transmitPowerDbm += 3;
  const after = (await analyzeMission(mission, store, context(), cache))[0]!;
  expect(cache.propagationMisses).toBe(misses);
  expect(after.summary.minimumUplinkMarginDb! - before.summary.minimumUplinkMarginDb!).toBeCloseTo(3, 9);
  expect(after.summary.minimumDownlinkMarginDb).toBe(before.summary.minimumDownlinkMarginDb);
  expect(after.summary.energy).toBeNull(); expect(after.energyFeasibility.status).toBe('indeterminate');
  expect(after.routeSamples.every((sample) => sample.clearance.status === 'known')).toBe(true);
  expect(after.routeSamples.at(-1)!.distanceAlongRouteM).toBeCloseTo(1000, 4);
});
test('return flight recomputes heading and complete distance; missing ray evidence stays unknown', async () => {
  const { mission, store, tile } = fixture(); mission.flightMode = 'return';
  const result = (await analyzeMission(mission, store, context()))[0]!;
  expect(result.summary.distanceM).toBeCloseTo(2000, 4);
  const outbound = result.routeSamples.find((s) => s.leg === 'outbound')!, inbound = result.routeSamples.find((s) => s.leg === 'return')!;
  expect((outbound.attitude.headingDeg - inbound.attitude.headingDeg + 360) % 360).toBeCloseTo(180, 7);
  tile.validity[100 * 256 + 10] = 0;
  const missing = (await analyzeMission(mission, store, context()))[0]!;
  expect(missing.rfFeasibility.status).toBe('indeterminate'); expect(missing.routeSamples.some((s) => s.uplink === null)).toBe(true);
});
test('bounded caches evict oldest data and reject oversized items', () => {
  const cache = new BoundedCache<number>(500);
  cache.set('a', 1, 150); cache.set('b', 2, 150);
  expect(cache.get('a')).toBeUndefined(); expect(cache.get('b')).toBe(2);
  cache.set('oversized', 3, 1000); expect(cache.get('oversized')).toBeUndefined(); expect(cache.stats().bytes).toBeLessThanOrEqual(500);
});
test('manual terrain work honors cancellation checkpoints', async () => {
  const { mission, store } = fixture(); let checkpoints = 0;
  const ctx = context(); ctx.checkpoint = async () => { if (++checkpoints === 4) throw new Error('cancelled'); };
  await expect(analyzeMission(mission, store, ctx)).rejects.toThrow('cancelled'); expect(checkpoints).toBe(4);
});
test('missing model and missing battery independently retain available RF evidence', async () => {
  const { mission, store } = fixture();
  for (const missing of ['batteryCapacityWh', 'powerModel'] as const) {
    mission.aircraft = illustrativeAircraft('fixed-wing');
    mission.aircraft[missing] = null;
    const result = (await analyzeMission(mission, store, context()))[0]!;
    expect(result.energyFeasibility.status).toBe('indeterminate');
    expect(result.summary.energy).toBeNull();
    expect(result.summary.minimumTwoWayMarginDb).not.toBeNull();
    expect(result.routeSamples.every((sample) => sample.uplink && sample.downlink)).toBe(true);
  }
});
test('complete straight manual mission integrates timing, energy and user constraints', async () => {
  const { mission, store } = fixture(); mission.aircraft = illustrativeAircraft('fixed-wing');
  mission.constraints.minimumAltitude = { ...mission.launch.altitude, metres: 50 };
  mission.constraints.maximumAltitude = { ...mission.launch.altitude, metres: 500 };
  mission.constraints.minimumTerrainClearanceM = 20;
  const result = (await analyzeMission(mission, store, context()))[0]!;
  expect(result.summary.durationS).toBeCloseTo(1000 / 22, 4);
  expect(result.summary.energy!.totalWh).toBeGreaterThan(3);
  expect(result.routeSamples.at(-1)!.elapsedTimeS).toBe(result.summary.durationS);
  expect(result.energyFeasibility.status).toBe('feasible');
  expect(result.feasibility.status).toBe('feasible');
  mission.aircraft.batteryCapacityWh = 1;
  const reserve = (await analyzeMission(mission, store, context()))[0]!;
  expect(reserve.energyFeasibility.status).toBe('infeasible');
  expect(reserve.constraintViolations.some(v => v.constraint === 'battery-reserve')).toBe(true);
});
test('multiple equipment scenarios reuse propagation and do not change other results', async () => {
  const { mission, store } = fixture(); mission.aircraft = illustrativeAircraft('fixed-wing');
  const second = structuredClone(mission.equipment[0]!); second.id = 'second'; second.downlink.transmitPowerDbm += 3;
  mission.equipment.push(second);
  const cache = new AnalysisCache(), before = await analyzeMission(mission, store, context(), cache);
  expect(before[0]!.scenarioId).not.toBe(before[1]!.scenarioId);
  expect(cache.propagationMisses).toBe(before[0]!.routeSamples.length);
  const misses = cache.propagationMisses;
  mission.equipment[1]!.airborneAntenna.massKg = 1;
  const after = await analyzeMission(mission, store, context(), cache);
  expect(after[0]).toEqual(before[0]);
  expect(after[1]!.summary.energy!.propulsionWh).toBeGreaterThan(before[1]!.summary.energy!.propulsionWh);
  expect(cache.propagationMisses).toBe(misses);
});
