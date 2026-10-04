import type { MissionConfig } from '../contracts/mission';
import { parseMission } from '../contracts/mission';
import type { ScenarioResult } from '../contracts/result';
import { parseScenarioResult } from '../contracts/result';
import { createProjection, resolveAltitude } from '../terrain/coordinates';
import type { ProjectedPoint } from '../terrain/coordinates';
import type { TerrainStore } from '../terrain/store';
import { sampleTerrain } from '../terrain/sampling';
import { accountDistance } from '../mission/geometry';
import type { JobContext } from '../workers/lifecycle';
import { BoundedCache } from '../workers/cache';
import { sampleRadioRay } from './profile';
import type { RadioProfile } from './profile';
import { deltaBullington, freeSpaceLossDb, SPEED_OF_LIGHT_MPS } from './propagation';
import { fresnelEvidence } from './fresnel';
import { twoEndGains } from './antenna';
import { twoWayBudget } from './budget';
interface RoutePoint extends ProjectedPoint { altitudeM: number; distanceM: number; headingDeg: number; pitchDeg: number; leg: 'outbound' | 'return' }
type Propagation = { status: 'known'; freeSpaceLossDb: number; diffractionLossDb: number; fraction: number; meetsFresnel: boolean; limitingPoint: ProjectedPoint; limitingHeightM: number; limitingDistanceM: number } | { status: 'unknown'; reason: string };
export class AnalysisCache {
  readonly profiles = new BoundedCache<RadioProfile>(32 * 1024 * 1024);
  readonly propagation = new BoundedCache<Propagation>(16 * 1024 * 1024);
  profileMisses = 0; propagationMisses = 0;
  stats() { return { profiles: this.profiles.stats(), propagation: this.propagation.stats(), profileMisses: this.profileMisses, propagationMisses: this.propagationMisses }; }
}
const angle = (x: number, y: number) => (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
async function routePoints(mission: MissionConfig, store: TerrainStore, context: JobContext): Promise<{ points: RoutePoint[]; totalM: number }> {
  const projection = createProjection(store.manifest);
  const resolved: (ProjectedPoint & { altitudeM: number })[] = [];
  for (const point of [mission.launch, ...mission.waypoints, mission.destination]) {
    const xy = projection.forward(point.position);
    const sample = await sampleTerrain(store.manifest, (l, c, r) => store.get(l, c, r), xy);
    const altitudeM = resolveAltitude(point.altitude, store.manifest.verticalDatum.id, sample.status === 'known' ? sample.displayHeightM : null);
    if (altitudeM === null) throw new Error('Missing DSM data for a surface-relative route height.');
    resolved.push({ ...xy, altitudeM }); await context.checkpoint();
  }
  const accounting = accountDistance(resolved, mission.flightMode, mission.totalDistanceLimitM);
  if (accounting.totalM === 0) throw new Error('Choose a destination different from the flight start.');
  if (accounting.totalM > 200_000) throw new Error('Manual analysis is bounded to 200 km of sampled route; the mission distance limit is at most 100 km.');
  const points: RoutePoint[] = [], spacing = store.manifest.levels[0]!.cellSizeM;
  function leg(path: typeof resolved, legName: RoutePoint['leg'], offset: number) {
    let travelled = offset;
    for (let segment = 1; segment < path.length; segment++) {
      const a = path[segment - 1]!, b = path[segment]!, dx = b.xM - a.xM, dy = b.yM - a.yM, dz = b.altitudeM - a.altitudeM;
      const length = Math.hypot(dx, dy, dz); if (length === 0) continue;
      const intervals = Math.max(1, Math.ceil(length / spacing));
      for (let index = segment === 1 ? 0 : 1; index <= intervals; index++) {
        const t = index / intervals;
        points.push({ xM: a.xM + dx * t, yM: a.yM + dy * t, altitudeM: a.altitudeM + dz * t, distanceM: travelled + length * t, headingDeg: angle(dx, dy), pitchDeg: Math.atan2(dz, Math.hypot(dx, dy)) * 180 / Math.PI, leg: legName });
      }
      travelled += length;
    }
  }
  leg(resolved, 'outbound', 0);
  if (mission.flightMode === 'return') leg([...resolved].reverse(), 'return', accounting.outboundM);
  return { points, totalM: accounting.totalM };
}
async function propagationAt(mission: MissionConfig, store: TerrainStore, station: ProjectedPoint & { altitudeM: number }, target: RoutePoint, cache: AnalysisCache, context: JobContext): Promise<Propagation> {
  const identity = `${store.manifest.id}/${store.manifest.packageVersion}/${store.manifest.verticalDatum.id}/${store.manifest.projection.definition}/${store.manifest.levels[0]!.cellSizeM}`;
  const xyKey = `${identity}/${station.xM}/${station.yM}/${target.xM}/${target.yM}`;
  const key = `${xyKey}/${station.altitudeM}/${target.altitudeM}/${mission.frequencyHz}/${mission.assumptions.effectiveEarthRadiusFactor}/${mission.assumptions.terrainHeightUncertaintyM}/${mission.assumptions.rfModel.id}/${mission.assumptions.rfModel.version}`;
  const cached = cache.propagation.get(key); if (cached) return cached;
  cache.propagationMisses++;
  const horizontal = Math.hypot(target.xM - station.xM, target.yM - station.yM), slant = Math.hypot(horizontal, target.altitudeM - station.altitudeM);
  let value: Propagation;
  if (slant === 0) value = { status: 'unknown', reason: 'Coincident radio terminals cannot be evaluated with a far-field loss model.' };
  else if (horizontal < 1e-6) {
    const surface = await sampleTerrain(store.manifest, (l, c, r) => store.get(l, c, r), station);
    if (surface.status !== 'known') value = { status: 'unknown', reason: surface.reason };
    else if (Math.min(station.altitudeM, target.altitudeM) <= surface.obstructionHeightM + mission.assumptions.terrainHeightUncertaintyM) value = { status: 'unknown', reason: 'A radio terminal is within the conservative DSM obstruction envelope.' };
    else {
      const fraction = ((station.altitudeM + target.altitudeM) / 2 - surface.obstructionHeightM - mission.assumptions.terrainHeightUncertaintyM) / Math.sqrt(SPEED_OF_LIGHT_MPS / mission.frequencyHz * slant / 4);
      value = { status: 'known', freeSpaceLossDb: freeSpaceLossDb(slant, mission.frequencyHz), diffractionLossDb: 0, fraction, meetsFresnel: fraction >= .6, limitingPoint: station, limitingHeightM: surface.obstructionHeightM, limitingDistanceM: slant / 2 };
    }
  } else if (horizontal > 100_000) value = { status: 'unknown', reason: 'Radio path exceeds the 100 km analysis bound.' };
  else {
    let profile = cache.profiles.get(xyKey);
    if (!profile) {
      cache.profileMisses++;
      profile = await sampleRadioRay(store.manifest, (l, c, r) => store.get(l, c, r), station, target, { checkpoint: context.checkpoint });
      cache.profiles.set(xyKey, profile, profile.distanceM.byteLength + profile.terrainM.byteLength + profile.validity.byteLength);
    }
    if (profile.status !== 'known') value = { status: 'unknown', reason: `${profile.missingSampleCount} missing terrain samples along the radio ray.` };
    else {
      try {
        const heights = profile.terrainM.map((h, i) => h + (profile!.validity[i] === 2 ? 0 : mission.assumptions.terrainHeightUncertaintyM));
        const loss = deltaBullington(profile.distanceM, heights, station.altitudeM, target.altitudeM, mission.frequencyHz, { effectiveEarthRadiusM: 6371000 * mission.assumptions.effectiveEarthRadiusFactor });
        const evidence = fresnelEvidence(profile, station.altitudeM, target.altitudeM, mission.frequencyHz, mission.assumptions.effectiveEarthRadiusFactor, mission.assumptions.terrainHeightUncertaintyM);
        if (evidence.status !== 'known') value = { status: 'unknown', reason: evidence.reason };
        else { const t = evidence.limitingDistanceM / horizontal; value = { status: 'known', freeSpaceLossDb: freeSpaceLossDb(slant, mission.frequencyHz), diffractionLossDb: loss.deltaBullingtonLossDb, fraction: evidence.minimumFirstFresnelClearanceFraction, meetsFresnel: evidence.meetsSixtyPercentFresnel, limitingPoint: { xM: station.xM + (target.xM - station.xM) * t, yM: station.yM + (target.yM - station.yM) * t }, limitingHeightM: evidence.limitingTerrainElevationM, limitingDistanceM: evidence.limitingDistanceM }; }
      } catch (reason) { value = { status: 'unknown', reason: String(reason) }; }
    }
  }
  cache.propagation.set(key, value, 512);
  return value;
}
export async function analyzeMission(input: MissionConfig, store: TerrainStore, context: JobContext, cache = new AnalysisCache()): Promise<ScenarioResult[]> {
  const mission = parseMission(input), manifest = store.manifest, projection = createProjection(manifest);
  if (mission.terrain.packageId !== manifest.id || mission.terrain.packageVersion !== manifest.packageVersion || mission.terrain.verticalDatumId !== manifest.verticalDatum.id) throw new Error('Mission and installed terrain references differ.');
  if (mission.assumptions.rfModel.id !== 'p525-p526-delta-bullington' || mission.assumptions.rfModel.version !== '1') throw new Error('Unsupported RF model identity/version.');
  const launch = projection.forward(mission.launch.position), launchSurface = await sampleTerrain(manifest, (l, c, r) => store.get(l, c, r), launch);
  if (launchSurface.status !== 'known') throw new Error('Ground-station DSM elevation is missing.');
  const station = { ...launch, altitudeM: launchSurface.displayHeightM + mission.groundAntennaHeightAboveSurfaceM };
  const route = await routePoints(mission, store, context);
  // Bound output storage before allocating per-equipment sample objects.
  if (route.points.length * mission.equipment.length * 2048 > 128 * 1024 * 1024) throw new Error('Requested manual result exceeds the 128 MiB working budget. Analyze fewer equipment combinations per job.');
  const results: ScenarioResult[] = [];
  for (let scenario = 0; scenario < mission.equipment.length; scenario++) {
    const equipment = mission.equipment[scenario]!, samples: ScenarioResult['routeSamples'] = [], violations: ScenarioResult['constraintViolations'] = [];
    let minUp = Infinity, minDown = Infinity, missing = false, climbM = 0;
    if (route.totalM > mission.totalDistanceLimitM) violations.push({ constraint: 'total-distance', reason: `Total mission ${(route.totalM / 1000).toFixed(2)} km exceeds ${(mission.totalDistanceLimitM / 1000).toFixed(2)} km.`, sampleIndex: null });
    for (let i = 0; i < route.points.length; i++) {
      const point = route.points[i]!, position = projection.inverse(point);
      const surface = await sampleTerrain(manifest, (l, c, r) => store.get(l, c, r), point);
      const propagation = await propagationAt(mission, store, station, point, cache, context);
      const attitude = { headingDeg: point.headingDeg, pitchDeg: point.pitchDeg, rollDeg: 0 };
      const gains = Math.hypot(point.xM - station.xM, point.yM - station.yM, point.altitudeM - station.altitudeM) === 0 ? { groundGainDbi: null, airborneGainDbi: null } : twoEndGains(equipment, { east: point.xM - station.xM, north: point.yM - station.yM, up: point.altitudeM - station.altitudeM }, attitude);
      const budget = twoWayBudget(equipment, gains.groundGainDbi, gains.airborneGainDbi, propagation.status === 'known' ? propagation : null, mission.assumptions.rfLossAllowanceDb, mission.constraints.requiredMarginDb);
      const altitude = { metres: point.altitudeM, reference: 'datum' as const, datumId: manifest.verticalDatum.id };
      const clearance: ScenarioResult['routeSamples'][number]['clearance'] = surface.status === 'known' && propagation.status === 'known' ? { status: 'known', terrainElevation: { ...altitude, metres: surface.obstructionHeightM }, terrainClearanceM: point.altitudeM - surface.obstructionHeightM - mission.assumptions.terrainHeightUncertaintyM, minimumFirstFresnelClearanceFraction: propagation.fraction, meetsSixtyPercentFresnel: propagation.meetsFresnel, limitingObstruction: { position: projection.inverse(propagation.limitingPoint), elevation: { ...altitude, metres: propagation.limitingHeightM }, distanceFromStationM: propagation.limitingDistanceM } } : { status: 'unknown', reason: propagation.status === 'unknown' ? propagation.reason : 'Missing route terrain.' };
      if (budget.status === 'indeterminate' || clearance.status === 'unknown') missing = true;
      else { minUp = Math.min(minUp, budget.uplink.availableMarginDb); minDown = Math.min(minDown, budget.downlink.availableMarginDb); }
      if (budget.status === 'infeasible') violations.push({ constraint: 'radio-margin', reason: `${budget.limitingDirection} margin ${budget.minimumMarginDb.toFixed(2)} dB is below ${mission.constraints.requiredMarginDb} dB.`, sampleIndex: i });
      if (clearance.status === 'known' && mission.constraints.minimumTerrainClearanceM !== null && clearance.terrainClearanceM < mission.constraints.minimumTerrainClearanceM) violations.push({ constraint: 'DSM-clearance', reason: 'Aircraft is below required conservative DSM clearance.', sampleIndex: i });
      for (const [bound, less] of [[mission.constraints.minimumAltitude, true], [mission.constraints.maximumAltitude, false]] as const) {
        if (!bound || surface.status !== 'known') continue;
        const limit = resolveAltitude(bound, manifest.verticalDatum.id, surface.displayHeightM)!;
        if (less ? point.altitudeM < limit : point.altitudeM > limit) violations.push({ constraint: 'altitude', reason: 'Aircraft altitude violates the configured bound.', sampleIndex: i });
      }
      if (i > 0) climbM += Math.max(0, point.altitudeM - route.points[i - 1]!.altitudeM);
      samples.push({ distanceAlongRouteM: point.distanceM, elapsedTimeS: null, leg: point.leg, position, altitude, attitude, uplink: budget.status === 'indeterminate' ? null : budget.uplink, downlink: budget.status === 'indeterminate' ? null : budget.downlink, clearance });
      if (i % 16 === 0 || i === route.points.length - 1) { context.progress('Manual route RF', (scenario + (i + 1) / route.points.length) / mission.equipment.length); await context.checkpoint(); }
    }
    const rfViolations = violations.filter((v) => v.constraint === 'radio-margin');
    const rfFeasibility: ScenarioResult['rfFeasibility'] = missing ? { status: 'indeterminate', reasons: ['Missing radio-ray terrain, height-reference or antenna evidence.'] } : rfViolations.length ? { status: 'infeasible', reasons: ['At least one directional link falls below the required margin.'] } : { status: 'feasible', reasons: [] };
    const energyFeasibility: ScenarioResult['energyFeasibility'] = { status: 'indeterminate', reasons: ['Energy and motion models are not yet evaluated.'] };
    results.push(parseScenarioResult({ schemaVersion: 1, jobId: context.jobId, scenarioId: `${mission.id}-${equipment.id}`, missionId: mission.id, equipmentId: equipment.id, terrain: mission.terrain, models: { rf: mission.assumptions.rfModel, energy: mission.assumptions.energyModel }, assumptions: ['ITU-R P.525-5 / P.526-15; scalar β=1 spherical approximation.', 'DSM and matching vertical datum; terrain uncertainty and RF allowance are separate.', 'Straight-segment headings and climb attitudes; bank/motion verification pending.', 'No interference, multipath, explicit foliage or weather simulation.', `Manual route sampled at no more than ${manifest.levels[0]!.cellSizeM} m; all radio rays use the finest installed grid.`], routeSamples: samples, summary: { distanceM: route.totalM, durationS: null, climbM, minimumUplinkMarginDb: Number.isFinite(minUp) ? minUp : null, minimumDownlinkMarginDb: Number.isFinite(minDown) ? minDown : null, minimumTwoWayMarginDb: Number.isFinite(minUp) && Number.isFinite(minDown) ? Math.min(minUp, minDown) : null, energy: null }, rfFeasibility, energyFeasibility, feasibility: violations.length || rfFeasibility.status === 'infeasible' ? { status: 'infeasible', reasons: ['Evaluated route constraints fail.'] } : { status: 'indeterminate', reasons: ['Energy, motion and complete routing constraints remain unevaluated.'] }, constraintViolations: violations }));
  }
  return results;
}
