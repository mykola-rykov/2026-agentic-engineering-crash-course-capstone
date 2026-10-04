import { expect, test } from 'vitest';
import type { TerrainStore } from '../src/terrain/store';
import type { JobContext } from '../src/workers/lifecycle';
import { CancelledJob } from '../src/workers/lifecycle';
import { terrainFixture, resultFixture } from './fixtures/contracts';
import { newMission } from '../src/mission/defaults';
import { illustrativeAircraft } from '../src/energy/profiles';
import { createProjection } from '../src/terrain/coordinates';
import { AnalysisCache, analyzeMission } from '../src/rf/analysis';
import { searchLabels } from '../src/routing/labels';
import type { Objective } from '../src/routing/labels';
import { nondominatedResults, revalidateSmoothing, sampledRoute, searchMission, SEARCH_LIMITS, smoothPrimitives, verifyRoute } from '../src/routing/search';
import type { Primitive } from '../src/routing/motion';
import { goalConnectors } from '../src/routing/connectors';
function context(): JobContext { return { jobId: 'test-job', checkpoint: async () => {}, progress: () => {}, emit: () => {} }; }
function fixture() {
  const manifest = terrainFixture(); manifest.projectedBounds = { minXM: 0, maxXM: 7680, minYM: 0, maxYM: 7680 };
  const tile = { display: new Int16Array(65536), obstruction: new Int16Array(65536), validity: new Uint8Array(65536).fill(1) };
  const store = { manifest, get: async () => tile } as unknown as TerrainStore;
  const mission = newMission(manifest), projection = createProjection(manifest);
  mission.launch.position = projection.inverse({ xM: 1005, yM: 4665 }); mission.destination.position = projection.inverse({ xM: 2005, yM: 4665 });
  mission.launch.altitude = { metres: 100, reference: 'datum', datumId: manifest.verticalDatum.id }; mission.destination.altitude = { ...mission.launch.altitude };
  mission.constraints.minimumAltitude = { ...mission.launch.altitude, metres: 50 }; mission.constraints.maximumAltitude = { ...mission.launch.altitude, metres: 500 }; mission.constraints.minimumTerrainClearanceM = 20;
  mission.aircraft = illustrativeAircraft('fixed-wing'); mission.groundAntennaHeightAboveSurfaceM = 10; mission.assumptions.terrainHeightUncertaintyM = 0;
  const primitive: Primitive = { start: { xM: 1005, yM: 4665, altitudeM: 100, headingDeg: 90 }, lengthM: 1000, turnDeg: 0, altitudeChangeM: 0, leg: 'outbound' };
  return { mission, store, tile, primitive };
}
const limits = { ...SEARCH_LIMITS, maximumExpansions: 2, maximumEdgeEvaluations: 100, maximumFinalCandidates: 3 };
test('resource accounting retains useful labels and produces distinct objective winners', async () => {
  const paths = [
    { state: 'goal', geometry: 'short', resources: { distanceM: 10, energyWh: 9, marginDb: 12 } },
    { state: 'goal', geometry: 'energy', resources: { distanceM: 15, energyWh: 5, marginDb: 18 } },
    { state: 'goal', geometry: 'margin', resources: { distanceM: 20, energyWh: 8, marginDb: 30 } },
  ];
  for (const objective of ['shortest', 'energy', 'margin'] as Objective[]) {
    const result = await searchLabels({ start: 'start', objective, bucket: state => state, goal: state => state === 'goal', neighbors: async () => paths, lowerBoundM: () => 0, maximumDistanceM: 30, maximumEnergyWh: 10, requiredMarginDb: 10, checkpoint: async () => {}, maximumExpansions: 10, maximumLabels: 100, labelsPerBucket: 6 });
    expect(result.goals[0]!.geometry).toBe(objective === 'shortest' ? 'short' : objective);
  }
  const result = await searchLabels({ start: 'start', objective: 'shortest', bucket: state => state, goal: state => state === 'goal', neighbors: async state => state === 'start' ? [{ state: 'middle', geometry: 'short-expensive', resources: { distanceM: 1, energyWh: 9, marginDb: 20 } }, { state: 'middle', geometry: 'long-efficient', resources: { distanceM: 2, energyWh: 2, marginDb: 20 } }] : [{ state: 'goal', geometry: 'finish', resources: { distanceM: 1, energyWh: 2, marginDb: 20 } }], lowerBoundM: () => 0, maximumDistanceM: 10, maximumEnergyWh: 10, requiredMarginDb: 10, checkpoint: async () => {}, maximumExpansions: 10, maximumLabels: 100, labelsPerBucket: 6 });
  expect(result.goals[0]!.resources).toEqual({ distanceM: 3, energyWh: 4, marginDb: 20 });
});
test('final verification rejects distance, reserve, clearance, altitude and each directional margin', async () => {
  for (const constraint of ['distance', 'reserve', 'clearance', 'altitude', 'uplink', 'downlink'] as const) {
    const { mission, store, primitive } = fixture();
    if (constraint === 'distance') mission.totalDistanceLimitM = 900;
    if (constraint === 'reserve') mission.aircraft.batteryCapacityWh = 1;
    if (constraint === 'clearance') mission.constraints.minimumTerrainClearanceM = 101;
    if (constraint === 'altitude') mission.constraints.maximumAltitude!.metres = 99;
    if (constraint === 'uplink' || constraint === 'downlink') mission.equipment[0]![constraint].transmitPowerDbm = -40;
    const result = (await verifyRoute([primitive], mission, store, context(), new AnalysisCache()))[0]!;
    expect(result.feasibility.status, constraint).toBe('infeasible');
    expect(nondominatedResults([result])).toEqual([]);
  }
});
test('actual graph search publishes only verified routes with independent equipment identities', async () => {
  const { mission, store } = fixture();
  const second = structuredClone(mission.equipment[0]!); second.id = 'second'; second.uplink.transmitPowerDbm += 3; mission.equipment.push(second);
  const emitted: unknown[] = [], ctx = context(); ctx.emit = message => emitted.push(message);
  const result = await searchMission(mission, store, ctx, new AnalysisCache(), limits);
  expect(result.results).toHaveLength(2);
  expect(new Set(result.results.map(r => r.equipmentId))).toEqual(new Set([mission.equipment[0]!.id, 'second'])); expect(emitted.length).toBeGreaterThan(0);
  expect(result.results.every(r => r.feasibility.status === 'feasible')).toBe(true);
  expect(result.results[0]!.summary.distanceM).toBeCloseTo(1000, 5);
  expect(new Set(result.results.map(r => r.scenarioId)).size).toBe(result.results.length);
  const direct = result.results.filter(r => Math.abs(r.summary.distanceM - 1000) < 1e-4);
  expect(direct).toHaveLength(2);
  expect(direct[1]!.summary.minimumUplinkMarginDb! - direct[0]!.summary.minimumUplinkMarginDb!).toBeCloseTo(3, 8);
});
test('coarse-missed ridge is rejected at finest half-cell sampling and unknown RF stays unknown', async () => {
  const { mission, store, tile, primitive } = fixture();
  // Isolated 30 m column at x=1200..1230, between coarse x=1130 and x=1255 samples.
  for (let row = 0; row < 256; row++) tile.obstruction[row * 256 + 40] = 95;
  const coarse = sampledRoute([primitive], mission, 125);
  const coarseResult = (await analyzeMission(mission, store, context(), new AnalysisCache(), { ...coarse, assumptions: ['coarse fixture'] }))[0]!;
  expect(coarseResult.constraintViolations.some(v => v.constraint === 'DSM-clearance')).toBe(false);
  const final = (await verifyRoute([primitive], mission, store, context(), new AnalysisCache()))[0]!;
  expect(final.constraintViolations.some(v => v.constraint === 'DSM-clearance')).toBe(true);
  expect(final.feasibility.status).toBe('infeasible');
  tile.obstruction.fill(0); tile.validity[100 * 256 + 45] = 0;
  const unknown = (await verifyRoute([primitive], mission, store, context(), new AnalysisCache()))[0]!;
  expect(unknown.rfFeasibility.status).toBe('indeterminate'); expect(unknown.feasibility.status).not.toBe('feasible');
});
test('circle-tangent return has finite geometry and inbound RF/wind/energy are recomputed', async () => {
  const { mission, store, primitive } = fixture(); mission.wind = { speedMps: 5, fromDirectionDeg: 270 };
  const out = (await verifyRoute([primitive], mission, store, context(), new AnalysisCache()))[0]!;
  expect(out.feasibility.status).toBe('feasible');
  const inbound = goalConnectors({ xM: 2005, yM: 4665, altitudeM: 100, headingDeg: 90 }, primitive.start, 250, 'return')[0]!;
  expect(inbound.length).toBe(2);
  const endpoint = sampledRoute(inbound, mission, 15).points.at(-1)!;
  expect(endpoint.xM).toBeCloseTo(primitive.start.xM, 6); expect(endpoint.yM).toBeCloseTo(primitive.start.yM, 6);
  mission.flightMode = 'return';
  const back = (await verifyRoute([primitive, ...inbound], mission, store, context(), new AnalysisCache()))[0]!;
  expect(back.feasibility.status).toBe('feasible');
  expect(back.routeSamples.some(s => s.leg === 'return')).toBe(true); expect(back.summary.energy!.totalWh).toBeGreaterThan(out.summary.energy!.totalWh);
  const outboundTime = back.routeSamples.filter(s => s.leg === 'outbound').at(-1)!.elapsedTimeS!;
  expect(back.summary.durationS! - outboundTime).toBeGreaterThan(outboundTime);
  mission.aircraft.batteryCapacityWh = out.summary.energy!.totalWh / .8 + .01;
  expect((await verifyRoute([primitive], mission, store, context(), new AnalysisCache()))[0]!.feasibility.status).toBe('feasible');
  expect((await verifyRoute([primitive, ...inbound], mission, store, context(), new AnalysisCache()))[0]!.energyFeasibility.status).toBe('infeasible');
});
test('directional outbound RF success cannot satisfy the complete return mission', async () => {
  const { mission, store, primitive } = fixture();
  mission.equipment[0]!.airborneAntenna.gainPattern = { kind: 'sampled', interpolation: 'linear', samples: [0, 90, 180, 270].flatMap(azimuthDeg => [-90, 0, 90].map(elevationDeg => ({ azimuthDeg, elevationDeg, gainDbi: azimuthDeg === 180 ? 10 : -60 }))) };
  const out = (await verifyRoute([primitive], mission, store, context(), new AnalysisCache()))[0]!;
  expect(out.rfFeasibility.status).toBe('feasible');
  const inbound = goalConnectors({ xM: 2005, yM: 4665, altitudeM: 100, headingDeg: 90 }, primitive.start, 250, 'return')[0]!;
  const complete = (await verifyRoute([primitive, ...inbound], mission, store, context(), new AnalysisCache()))[0]!;
  expect(complete.rfFeasibility.status).toBe('infeasible');
  expect(complete.routeSamples.filter(s => s.leg === 'return').some(s => s.uplink!.availableMarginDb < mission.constraints.requiredMarginDb)).toBe(true);
});
test('automatic return search includes the turnaround and complete inbound mission', async () => {
  const { mission, store } = fixture(); mission.flightMode = 'return';
  const complete = await searchMission(mission, store, context(), new AnalysisCache(), { ...limits, maximumExpansions: 5, maximumEdgeEvaluations: 200 });
  expect(complete.results.length).toBeGreaterThan(0);
  expect(complete.results.every(r => r.routeSamples.some(s => s.leg === 'return') && r.summary.distanceM > 2000)).toBe(true);
});
test('smoothing cannot reuse feasibility and cancellation propagates through bounded search', async () => {
  const { mission, store, primitive } = fixture();
  const original = await verifyRoute([primitive], mission, store, context(), new AnalysisCache());
  const modified = [{ ...primitive, start: { ...primitive.start, altitudeM: 10 } }];
  expect(await revalidateSmoothing(original, modified, mission, store, context(), new AnalysisCache())).toBe(original);
  const tight = [{ ...primitive, lengthM: 30, turnDeg: 90 }];
  expect(await revalidateSmoothing(original, tight, mission, store, context(), new AnalysisCache())).toBe(original);
  const ctx = context(); let count = 0; ctx.checkpoint = async () => { if (++count === 10) throw new CancelledJob(); };
  await expect(searchMission(mission, store, ctx, new AnalysisCache(), limits)).rejects.toBeInstanceOf(CancelledJob);
  expect(count).toBe(10);
  mission.constraints.minimumTerrainClearanceM = 1000;
  const noRoute = await searchMission(mission, store, context(), new AnalysisCache(), limits);
  expect(noRoute.results).toEqual([]); expect(noRoute.reason).toContain('250 m horizontal / 50 m vertical'); expect(noRoute.reason).toContain('does not establish');
});
test('automatic vertical smoothing that removes ridge clearance keeps the verified original', async () => {
  const { mission, store, tile, primitive } = fixture();
  mission.destination.position = createProjection(store.manifest).inverse({ xM: 3005, yM: 4665 });
  mission.equipment[0]!.uplink.transmitPowerDbm = 40; mission.equipment[0]!.downlink.transmitPowerDbm = 40;
  mission.equipment[0]!.uplink.receiverSensitivityDbm = -130; mission.equipment[0]!.downlink.receiverSensitivityDbm = -130;
  for (let row = 0; row < 256; row++) tile.obstruction[row * 256 + 66] = 125;
  const geometry: Primitive[] = [{ ...primitive, altitudeChangeM: 50 }, { ...primitive, start: { ...primitive.start, xM: 2005, altitudeM: 150 }, altitudeChangeM: -50 }];
  const original = await verifyRoute(geometry, mission, store, context(), new AnalysisCache());
  expect(original[0]!.feasibility.status, JSON.stringify(original[0]!.constraintViolations)).toBe('feasible');
  const smoothed = smoothPrimitives(geometry, []); expect(smoothed).toHaveLength(1);
  const changed = await verifyRoute(smoothed, mission, store, context(), new AnalysisCache());
  expect(changed[0]!.feasibility.status).not.toBe('feasible');
  expect(changed[0]!.constraintViolations.some(v => v.constraint === 'DSM-clearance')).toBe(true);
  expect(await revalidateSmoothing(original, smoothed, mission, store, context(), new AnalysisCache())).toBe(original);
  expect(smoothPrimitives(geometry, [geometry[1]!.start])).toHaveLength(2);
});
test('edge caches respect working budgets and release obsolete search entries', async () => {
  const { mission, store } = fixture();
  const result = await searchMission(mission, store, context(), new AnalysisCache(), { ...limits, maximumEdgeCacheBytes: 4096 });
  expect(result.peakEdgeCacheBytes).toBeLessThanOrEqual(4096);
  expect(result.retainedEdgeCacheBytes).toBe(0);
});
test('duplicate route/equipment pairs and dominated metrics across equipment are removed', () => {
  const make = (id: string, d: number, e: number, margin: number) => { const r = resultFixture(); r.scenarioId = id; r.feasibility = { status: 'feasible', reasons: [] }; r.summary.distanceM = d; r.summary.minimumTwoWayMarginDb = margin; r.summary.energy = { totalWh: e, propulsionWh: e, avionicsWh: 0, radioWh: 0, takeoffLandingWh: 0, remainingReserveFraction: .8 }; r.routeSamples[1]!.altitude.metres = d; return r; };
  const a = make('short', 10, 9, 12), b = make('energy', 15, 5, 18), c = make('margin', 20, 8, 30), dominated = make('dominated', 30, 10, 10), duplicate = structuredClone(a);
  duplicate.scenarioId = 'duplicate';
  const otherEquipment = structuredClone(dominated); otherEquipment.equipmentId = 'other';
  expect(nondominatedResults([a, b, c, dominated, duplicate, otherEquipment]).map(r => r.scenarioId)).toEqual(['short', 'energy', 'margin']);
});
