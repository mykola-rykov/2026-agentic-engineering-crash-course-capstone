import type { MissionConfig } from '../contracts/mission';
import type { RfView, WorkerResponse } from '../contracts/worker';
import { rfViewSchema } from '../contracts/worker';
import type { TerrainStore } from '../terrain/store';
import { createProjection } from '../terrain/coordinates';
import { sampleTerrain } from '../terrain/sampling';
import type { JobContext } from '../workers/lifecycle';
import { AnalysisCache, propagationAt } from './analysis';
import { twoEndGains } from './antenna';
import { twoWayBudget } from './budget';
type Grid = Extract<WorkerResponse, { type: 'view-grid' }>;
export function viewLocations(input: RfView) {
  const view = rfViewSchema.parse(input);
  const cumulative: number[] = [0];
  if (view.kind === 'heatmap') for (let i = 1; i < view.path.length; i++) { const a = view.path[i - 1]!, b = view.path[i]!; cumulative.push(cumulative.at(-1)! + Math.hypot(b.xM - a.xM, b.yM - a.yM, b.altitudeM - a.altitudeM)); }
  const totalM = cumulative.at(-1)!;
  if (view.kind === 'heatmap' && totalM <= 0) throw new Error('Heatmap requires a nonzero route distance.');
  const locations: { xM: number; yM: number; altitudeM: number }[] = [];
  for (let row = 0; row < view.rows; row++) for (let column = 0; column < view.columns; column++) {
    const x = column / (view.columns - 1), y = row / (view.rows - 1);
    if (view.kind === 'slice') locations.push({ xM: view.minXM + (view.maxXM - view.minXM) * x, yM: view.maxYM - (view.maxYM - view.minYM) * y, altitudeM: view.altitudeM });
    else {
      const alongM = totalM * x;
      let end = 1; while (end < cumulative.length - 1 && cumulative[end]! < alongM) end++;
      while (end < cumulative.length - 1 && cumulative[end] === cumulative[end - 1]) end++;
      const a = view.path[end - 1]!, b = view.path[end]!, length = cumulative[end]! - cumulative[end - 1]!, t = length === 0 ? 0 : (alongM - cumulative[end - 1]!) / length;
      locations.push({ xM: a.xM + (b.xM - a.xM) * t, yM: a.yM + (b.yM - a.yM) * t, altitudeM: view.maximumAltitudeM - (view.maximumAltitudeM - view.minimumAltitudeM) * y });
    }
  }
  return { locations, totalM };
}
export async function evaluateRfView(mission: MissionConfig, equipmentId: string, view: RfView, store: TerrainStore, context: JobContext, cache = new AnalysisCache()): Promise<Grid> {
  const manifest = store.manifest;
  if (mission.terrain.packageId !== manifest.id || mission.terrain.packageVersion !== manifest.packageVersion || mission.terrain.verticalDatumId !== manifest.verticalDatum.id) throw new Error('RF view terrain references differ.');
  if (mission.assumptions.rfModel.id !== 'p525-p526-delta-bullington' || mission.assumptions.rfModel.version !== '1') throw new Error('Unsupported RF view model.');
  const equipment = mission.equipment.find(item => item.id === equipmentId); if (!equipment) throw new Error('Selected view equipment is absent from the mission.');
  const launch = createProjection(manifest).forward(mission.launch.position);
  const surface = await sampleTerrain(manifest, (l, c, r) => store.get(l, c, r), launch);
  if (surface.status !== 'known') throw new Error('Ground-station DSM is missing.');
  const station = { ...launch, altitudeM: surface.displayHeightM + mission.groundAntennaHeightAboveSurfaceM };
  const { locations, totalM } = viewLocations(view), count = locations.length;
  const margin = new Float32Array(count), power = new Float32Array(count), validity = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const point = locations[i]!, ray = { east: point.xM - station.xM, north: point.yM - station.yM, up: point.altitudeM - station.altitudeM };
    const propagation = await propagationAt(mission, store, station, { ...point, headingDeg: view.attitude.headingDeg, pitchDeg: view.attitude.pitchDeg, distanceM: 0, leg: 'outbound' }, cache, context);
    const gains = Math.hypot(ray.east, ray.north, ray.up) === 0 ? { groundGainDbi: null, airborneGainDbi: null } : twoEndGains(equipment, ray, view.attitude);
    const budget = twoWayBudget(equipment, gains.groundGainDbi, gains.airborneGainDbi, propagation.status === 'known' ? propagation : null, mission.assumptions.rfLossAllowanceDb, mission.constraints.requiredMarginDb);
    if (budget.status !== 'indeterminate') { margin[i] = budget.minimumMarginDb; power[i] = Math.min(budget.uplink.receivedPowerDbm, budget.downlink.receivedPowerDbm); validity[i] = 1; }
    if (i % 8 === 0 || i === count - 1) { context.progress('RF view', (i + 1) / count); await context.checkpoint(); }
  }
  return { protocolVersion: 1, jobId: context.jobId, type: 'view-grid', kind: view.kind, columns: view.columns, rows: view.rows, horizontalLabel: view.kind === 'slice' ? 'Regional easting (km)' : 'Distance along route (km)', verticalLabel: view.kind === 'slice' ? 'Regional northing (km)' : `Altitude above ${manifest.verticalDatum.id} (m)`, horizontalMinimum: view.kind === 'slice' ? view.minXM / 1000 : 0, horizontalMaximum: view.kind === 'slice' ? view.maxXM / 1000 : totalM / 1000, verticalMinimum: view.kind === 'slice' ? view.minYM / 1000 : view.minimumAltitudeM, verticalMaximum: view.kind === 'slice' ? view.maxYM / 1000 : view.maximumAltitudeM, assumptions: [`Fixed airborne heading ${view.attitude.headingDeg}°, pitch ${view.attitude.pitchDeg}°, bank ${view.attitude.rollDeg}° at every grid cell; coverage is orientation-dependent.`, ...(view.kind === 'slice' ? [`Selected altitude ${view.altitudeM} m above ${manifest.verticalDatum.id}.`] : []), 'RF grid is a sampled visual estimate; it does not verify motion, energy or terrain-clearance constraints between cells.', 'Complete radio rays use the finest installed terrain, explicit uncertainty and the configured directional budgets.'], marginBuffer: margin.buffer, powerBuffer: power.buffer, validityBuffer: validity.buffer };
}
