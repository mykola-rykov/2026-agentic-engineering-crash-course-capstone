import type { MissionConfig } from '../contracts/mission';
import type { ScenarioResult } from '../contracts/result';
import type { TerrainStore } from '../terrain/store';
import type { JobContext } from '../workers/lifecycle';
import { CancelledJob } from '../workers/lifecycle';
import { BoundedCache } from '../workers/cache';
import { createProjection, resolveAltitude } from '../terrain/coordinates';
import { sampleTerrain } from '../terrain/sampling';
import { AnalysisCache, analyzeMission } from '../rf/analysis';
import { energyPrerequisites } from '../energy/profiles';
import { fixedWingPower } from '../energy/fixed-wing';
import { multirotorPower } from '../energy/multirotor';
import { radioInputPowerW } from '../energy/integration';
import { freeSpaceLossDb } from '../rf/propagation';
import { twoWayBudget } from '../rf/budget';
import { requiredInputs } from '../mission/files';
import { missionCorridor } from './corridor';
import { bearing, coarsePrimitives, motionBucket, primitiveState, samplePrimitive, verifyMotion, HORIZONTAL_SPACING_M } from './motion';
import type { MotionPoint, MotionState, Primitive } from './motion';
import { goalConnectors } from './connectors';
import { dominates, labelGeometry, searchLabels } from './labels';
import type { Objective, Resources, SearchEdge } from './labels';

export const SEARCH_LIMITS = { maximumExpansions: 256, maximumLabels: 4096, labelsPerBucket: 6, maximumEdgeEvaluations: 4096, maximumFinalCandidates: 24, maximumResultBytes: 64 * 1024 * 1024, maximumEdgeCacheBytes: 16 * 1024 * 1024 } as const;
type SearchLimits = { [K in keyof typeof SEARCH_LIMITS]: number };
interface State extends MotionState { stage: number }
type Goal = Omit<MotionState, 'headingDeg'>;
export function sampledRoute(primitives: Primitive[], mission: MissionConfig, spacingM: number) {
  const points: MotionPoint[] = [];
  let totalM = 0;
  for (const primitive of primitives) {
    const previous = points.at(-1);
    if (previous && (Math.hypot(previous.xM - primitive.start.xM, previous.yM - primitive.start.yM, previous.altitudeM - primitive.start.altitudeM) > 1e-4 || Math.abs(((previous.headingDeg - primitive.start.headingDeg + 540) % 360) - 180) > 1e-5)) throw new Error('Generated geometry has a discontinuous position, height or heading.');
    const part = samplePrimitive(primitive, mission, spacingM);
    if (points.length + part.length > 100_000) throw new Error('Generated route exceeds the 100,000-sample working limit.');
    for (const point of part) points.push({ ...point, distanceM: totalM + point.distanceM });
    totalM = points.at(-1)!.distanceM;
  }
  return { points, totalM };
}
const resultResources = (result: ScenarioResult): Resources => ({ distanceM: result.summary.distanceM, energyWh: result.summary.energy?.totalWh ?? Infinity, marginDb: result.summary.minimumTwoWayMarginDb ?? -Infinity });
/** Deduplicate exact route/equipment pairs and remove metric-dominated alternatives. */
export function nondominatedResults(results: ScenarioResult[]) {
  const unique: ScenarioResult[] = [], seen = new Set<string>();
  for (const result of results) {
    if (result.feasibility.status !== 'feasible') continue;
    const key = JSON.stringify([result.equipmentId, result.routeSamples.map(s => [s.position.longitudeDeg, s.position.latitudeDeg, s.altitude.metres, s.leg])]);
    if (!seen.has(key)) { seen.add(key); unique.push(result); }
  }
  return unique.filter(candidate => !unique.some(other => other !== candidate && dominates(resultResources(other), resultResources(candidate))));
}
export async function verifyRoute(primitives: Primitive[], mission: MissionConfig, store: TerrainStore, context: JobContext, cache: AnalysisCache, assumptions: string[] = []) {
  // Half-cell intervals provide extra ridge/threshold samples; ≤5° on every turn.
  const route = sampledRoute(primitives, mission, store.manifest.levels[0]!.cellSizeM / 2);
  const corridor = missionCorridor(mission, store.manifest);
  if (route.points.some(point => !corridor.contains(point))) return [];
  for (const equipment of mission.equipment) verifyMotion(route.points, mission, equipment);
  return analyzeMission(mission, store, context, cache, { ...route, assumptions: [...assumptions, `Final analytic geometry verified at ≤${store.manifest.levels[0]!.cellSizeM / 2} m and ≤5° turn intervals; half-cell samples supplement coarse nodes at ridges/thresholds. All RF rays use finest terrain.`, 'Constant cruise airspeed, cubic vertical easing with zero climb at joins, quasi-steady bank transitions; no roll-rate or jerk model is configured.'] });
}
/** A smoothing proposal is never accepted using its original route's feasibility. */
export async function revalidateSmoothing(original: ScenarioResult[], modified: Primitive[], mission: MissionConfig, store: TerrainStore, context: JobContext, cache: AnalysisCache) {
  try {
    const checked = await verifyRoute(modified, mission, store, context, cache, ['Smoothing changed geometry and triggered full motion, terrain, RF and energy revalidation.']);
    if (!checked.length || checked.some(result => result.feasibility.status !== 'feasible')) return original;
    return checked.map((result, index) => ({ ...result, assumptions: [...original[index]!.assumptions, ...result.assumptions.filter(a => !original[index]!.assumptions.includes(a))] }));
  } catch (reason) { if (reason instanceof CancelledJob) throw reason; return original; }
}
/** Coalesce consecutive straight pieces: removes unnecessary intermediate vertical easing. */
export function smoothPrimitives(primitives: Primitive[], mandatoryPoints: Goal[]) {
  const result: Primitive[] = [];
  for (const primitive of primitives) {
    const previous = result.at(-1);
    const mandatoryJoin = mandatoryPoints.some(point => Math.hypot(point.xM - primitive.start.xM, point.yM - primitive.start.yM) < 1e-4);
    if (previous && !mandatoryJoin && previous.leg === primitive.leg && previous.turnDeg === 0 && primitive.turnDeg === 0 && Math.abs(previous.start.headingDeg - primitive.start.headingDeg) < 1e-5) result[result.length - 1] = { ...previous, lengthM: previous.lengthM + primitive.lengthM, altitudeChangeM: previous.altitudeChangeM + primitive.altitudeChangeM };
    else result.push(primitive);
  }
  return result;
}
export async function searchMission(mission: MissionConfig, store: TerrainStore, context: JobContext, cache = new AnalysisCache(), limits: SearchLimits = SEARCH_LIMITS) {
  const missing = [...requiredInputs(mission), ...energyPrerequisites(mission.aircraft)];
  if (missing.length) throw new Error(`Automatic routing needs: ${missing.join(', ')}.`);
  const corridor = missionCorridor(mission, store.manifest), projection = createProjection(store.manifest);
  const routePoints: Goal[] = [];
  let stationAltitudeM = 0;
  for (const point of [mission.launch, ...mission.waypoints, mission.destination]) {
    await context.checkpoint();
    const xy = projection.forward(point.position), surface = await sampleTerrain(store.manifest, (l, c, r) => store.get(l, c, r), xy);
    const altitudeM = resolveAltitude(point.altitude, store.manifest.verticalDatum.id, surface.status === 'known' ? surface.displayHeightM : null);
    if (surface.status !== 'known' || altitudeM === null) throw new Error('An endpoint or waypoint lacks known terrain/matching altitude datum.');
    if (routePoints.length === 0) stationAltitudeM = surface.displayHeightM + mission.groundAntennaHeightAboveSurfaceM;
    routePoints.push({ ...xy, altitudeM });
  }
  const outboundStages = routePoints.length - 1;
  const goals = [...routePoints.slice(1), ...(mission.flightMode === 'return' ? routePoints.slice(0, -1).reverse() : [])];
  const start: State = { ...routePoints[0]!, headingDeg: bearing(goals[0]!.xM - routePoints[0]!.xM, goals[0]!.yM - routePoints[0]!.yM), stage: 0 };
  const lowerBoundM = (state: State) => {
    let distance = 0, previous: Goal = state;
    for (let stage = state.stage; stage < goals.length; stage++) { const next = goals[stage]!; distance += Math.hypot(next.xM - previous.xM, next.yM - previous.yM, next.altitudeM - previous.altitudeM); previous = next; }
    return distance;
  };
  const candidates: ScenarioResult[] = [], reasons = new Set<string>();
  let resultBytes = 0, finalCount = 0, edgeCount = 0, peakEdgeCacheBytes = 0, retainedEdgeCacheBytes = 0;
  const objectives: Objective[] = ['shortest', 'energy', 'margin'];
  for (let equipmentIndex = 0; equipmentIndex < mission.equipment.length; equipmentIndex++) {
    const equipment = mission.equipment[equipmentIndex]!, configured = { ...mission, equipment: [equipment] };
    const model = mission.aircraft.powerModel!, airspeed = model.cruiseSpeedMps!;
    const load = { massKg: equipment.airborneAntenna.massKg, additionalDragAreaM2: equipment.airborneAntenna.additionalDragAreaM2 };
    const basePowerW = (mission.aircraft.kind === 'fixed-wing' ? fixedWingPower(mission.aircraft.powerModel!, { airspeedMps: airspeed, climbMps: 0, bankDeg: 0 }, load).electricalPowerW : multirotorPower(mission.aircraft.powerModel!, { airspeedMps: airspeed, climbMps: 0, forwardAccelerationMps2: 0, lateralAccelerationMps2: 0, verticalAccelerationMps2: 0 }, load).electricalPowerW) + mission.aircraft.avionicsPowerW + radioInputPowerW(equipment.downlink);
    const maximumGroundSpeedMps = mission.aircraft.kind === 'fixed-wing' ? airspeed + mission.wind.speedMps : Math.hypot(airspeed + mission.wind.speedMps, model.maxClimbMps);
    const maxGain = (antenna: typeof equipment.airborneAntenna) => antenna.gainPattern.kind === 'isotropic' ? antenna.gainPattern.gainDbi : Math.max(...antenna.gainPattern.samples.map(s => s.gainDbi));
    const mandatoryMarginBound = Math.min(...[routePoints[0]!, ...goals].map(goal => {
      const slant = Math.hypot(goal.xM - routePoints[0]!.xM, goal.yM - routePoints[0]!.yM, goal.altitudeM - stationAltitudeM);
      if (slant < 1e-6) return Infinity;
      const optimistic = twoWayBudget(equipment, maxGain(equipment.groundAntenna), maxGain(equipment.airborneAntenna), { freeSpaceLossDb: freeSpaceLossDb(slant, mission.frequencyHz), diffractionLossDb: 0 }, mission.assumptions.rfLossAllowanceDb, mission.constraints.requiredMarginDb);
      return optimistic.status === 'indeterminate' ? Infinity : optimistic.minimumMarginDb;
    }));
    let equipmentFinalCount = 0;
    // Includes heading, altitude, leg, geometry and equipment; never uses one leg's RF on the other.
    const edges = new BoundedCache<SearchEdge<State, Primitive[]>[]>(limits.maximumEdgeCacheBytes);
    let equipmentEdgeCount = 0;
    const neighbors = async (state: State): Promise<SearchEdge<State, Primitive[]>[]> => {
      const key = JSON.stringify(state), cached = edges.get(key); if (cached) return cached;
      const leg = state.stage < outboundStages ? 'outbound' : 'return', goal = goals[state.stage]!;
      const speed = mission.aircraft.powerModel!.cruiseSpeedMps!, wind = mission.wind.speedMps;
      // Conservative all-heading radius, plus a larger option for climb/tilt and corridor tradeoffs.
      const radius = mission.aircraft.kind === 'fixed-wing' ? speed * (speed + wind) ** 2 / (9.80665 * Math.tan(mission.aircraft.powerModel!.maxBankDeg * Math.PI / 180) * Math.sqrt(Math.max(1e-6, speed ** 2 - wind ** 2))) * 1.05 : Math.max(50, (speed + wind) ** 2 / mission.aircraft.powerModel!.maxAccelerationMps2 * 1.25);
      const geometries = [radius, Math.max(250, radius * 2)].flatMap(r => goalConnectors(state, goal, r, leg));
      const proposals = [...geometries.map(geometry => ({ geometry, completesStage: true })), ...coarsePrimitives(state, leg).map(primitive => ({ geometry: [primitive], completesStage: false }))];
      const accepted: SearchEdge<State, Primitive[]>[] = [];
      for (const proposal of proposals) {
        await context.checkpoint();
        if (++equipmentEdgeCount > limits.maximumEdgeEvaluations) { reasons.add('Edge-evaluation working limit reached.'); break; }
        edgeCount++;
        try {
          const fineMotion = sampledRoute(proposal.geometry, configured, 30);
          if (fineMotion.points.some(point => !corridor.contains(point))) continue;
          verifyMotion(fineMotion.points, configured, equipment);
          const coarse = sampledRoute(proposal.geometry, configured, HORIZONTAL_SPACING_M / 2);
          const evaluated = (await analyzeMission(configured, store, context, cache, { ...coarse, assumptions: ['Coarse search samples; awaiting final verification.'] }))[0]!;
          if (evaluated.feasibility.status !== 'feasible') { for (const v of evaluated.constraintViolations) if (reasons.size < 16) reasons.add(v.constraint); continue; }
          const last = proposal.geometry.at(-1)!, end = primitiveState(last, 1);
          accepted.push({ state: { ...end, stage: state.stage + Number(proposal.completesStage) }, geometry: proposal.geometry, resources: { ...resultResources(evaluated), energyWh: evaluated.summary.energy!.totalWh - mission.aircraft.takeoffLandingEnergyWh } });
        } catch (reason) { if (reason instanceof CancelledJob) throw reason; if (reasons.size < 16) reasons.add(String(reason)); }
      }
      edges.set(key, accepted, 1024 + accepted.reduce((sum, edge) => sum + edge.geometry.length * 256, 0));
      peakEdgeCacheBytes = Math.max(peakEdgeCacheBytes, edges.stats().bytes);
      return accepted;
    };
    for (const objective of objectives) {
      context.progress(`Searching ${objective} · ${equipment.id}`, (equipmentIndex + objectives.indexOf(objective) / 3) / mission.equipment.length);
      const found = await searchLabels({ start, objective, bucket: state => motionBucket(state, state.stage), goal: state => state.stage === goals.length, neighbors, lowerBoundM, lowerBoundEnergyWh: state => lowerBoundM(state) * basePowerW / maximumGroundSpeedMps / 3600, upperBoundMarginDb: () => mandatoryMarginBound, maximumDistanceM: mission.totalDistanceLimitM, maximumEnergyWh: mission.aircraft.batteryCapacityWh! * (1 - mission.constraints.batteryReserveFraction) - mission.aircraft.takeoffLandingEnergyWh, requiredMarginDb: mission.constraints.requiredMarginDb, checkpoint: context.checkpoint, ...limits });
      if (found.limited) reasons.add('Heading/resource-label search working limit reached.');
      for (const label of found.goals) {
        if (equipmentFinalCount >= limits.maximumFinalCandidates || resultBytes >= limits.maximumResultBytes) { reasons.add('Final-result working limit reached.'); break; }
        finalCount++; equipmentFinalCount++;
        const geometry = labelGeometry(label).flat();
        // Coarse alternatives are explicitly provisional and cannot claim final feasibility.
        context.progress(`Verifying ${objective} · ${equipment.id}`, (equipmentIndex + .8) / mission.equipment.length);
        try {
          let verified = await verifyRoute(geometry, configured, store, context, cache, [`Bounded ${objective} objective; 250 m horizontal / 50 m vertical states, 22.5° headings; ${mission.constraints.corridorWidthM} m corridor.`, `Search limits: ${JSON.stringify(limits)}. Objective labels identify best found candidates, without a global optimality claim.`, `Complete ${mission.flightMode} mission; inbound geometry, wind, attitude, RF and electrical energy evaluated independently.`]);
          const smoothed = smoothPrimitives(geometry, routePoints);
          if (smoothed.length < geometry.length && verified.every(result => result.feasibility.status === 'feasible')) verified = await revalidateSmoothing(verified, smoothed, configured, store, context, cache);
          for (const result of verified) {
            if (result.feasibility.status !== 'feasible') { reasons.add('Final terrain/RF/energy verification rejected a coarse candidate.'); continue; }
            result.scenarioId += `-${objective}-${finalCount}`;
            const bytes = result.routeSamples.length * 2048;
            if (resultBytes + bytes > limits.maximumResultBytes) { reasons.add('Final-result working limit reached.'); continue; }
            resultBytes += bytes; candidates.push(result);
          }
        } catch (reason) { if (reason instanceof CancelledJob) throw reason; if (reasons.size < 16) reasons.add(String(reason)); }
      }
      const progressive = nondominatedResults(candidates);
      if (progressive.length) context.emit({ protocolVersion: 1, type: 'result', jobId: context.jobId, refinement: 'coarse', results: progressive });
      await context.checkpoint();
    }
    edges.clear();
    retainedEdgeCacheBytes += edges.stats().bytes;
  }
  const results = nondominatedResults(candidates);
  return { results, edgeCount, peakEdgeCacheBytes, retainedEdgeCacheBytes, reason: `No feasible route was found within the ${mission.constraints.corridorWidthM / 1000} km corridor and 250 m horizontal / 50 m vertical search resolution and bounded working limits. This does not establish that no possible route exists. ${[...reasons].join(' ')}` };
}
