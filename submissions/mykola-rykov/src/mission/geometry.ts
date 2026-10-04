import type { MissionConfig } from '../contracts/mission';
import type { TerrainPackageManifest } from '../contracts/terrain';
import { createProjection } from '../terrain/coordinates';
import type { ProjectedPoint } from '../terrain/coordinates';
export function accountDistance(points: readonly (ProjectedPoint & { altitudeM: number | null })[], mode: MissionConfig['flightMode'], limitM: number) {
  if (!Number.isFinite(limitM) || limitM <= 0 || points.some((p) => !Number.isFinite(p.xM) || !Number.isFinite(p.yM) || (p.altitudeM !== null && !Number.isFinite(p.altitudeM)))) throw new Error('Distance accounting requires finite coordinates, heights, and a positive limit.');
  let outboundM = 0;
  const complete = points.every((p) => p.altitudeM !== null);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    outboundM += Math.hypot(b.xM - a.xM, b.yM - a.yM, complete ? b.altitudeM! - a.altitudeM! : 0);
  }
  const inboundM = mode === 'return' ? outboundM : 0;
  const totalM = outboundM + inboundM;
  return { outboundM, inboundM, totalM, exceedsLimit: totalM > limitM, complete };
}
export function launchCoverage(manifest: TerrainPackageManifest, mission: MissionConfig) {
  const p = createProjection(manifest).forward(mission.launch.position), b = manifest.projectedBounds;
  const edgeDistanceM = Math.min(p.xM - b.minXM, b.maxXM - p.xM, p.yM - b.minYM, b.maxYM - p.yM);
  return { edgeDistanceM, inside: edgeDistanceM >= 0, limited: edgeDistanceM < mission.totalDistanceLimitM };
}
