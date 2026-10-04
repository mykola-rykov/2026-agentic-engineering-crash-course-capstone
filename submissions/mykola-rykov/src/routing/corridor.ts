import type { TerrainPackageManifest } from '../contracts/terrain';
import type { MissionConfig } from '../contracts/mission';
import { createProjection } from '../terrain/coordinates';
import type { ProjectedPoint } from '../terrain/coordinates';
import { sampleTerrain } from '../terrain/sampling';
import type { TerrainStore } from '../terrain/store';
type Bounds = TerrainPackageManifest['projectedBounds'];
export function distanceToSegmentM(point: ProjectedPoint, a: ProjectedPoint, b: ProjectedPoint) {
  const dx = b.xM - a.xM, dy = b.yM - a.yM, squared = dx * dx + dy * dy;
  const fraction = squared === 0 ? 0 : Math.max(0, Math.min(1, ((point.xM - a.xM) * dx + (point.yM - a.yM) * dy) / squared));
  return Math.hypot(point.xM - a.xM - fraction * dx, point.yM - a.yM - fraction * dy);
}
export function createCorridor(path: ProjectedPoint[], widthM: number, packageBounds: Bounds) {
  if (path.length < 2 || !Number.isFinite(widthM) || widthM <= 0 || path.some(point => !Number.isFinite(point.xM) || !Number.isFinite(point.yM))) throw new Error('Corridor needs a finite path and positive width.');
  const radiusM = widthM / 2;
  const bounds = {
    minXM: Math.max(packageBounds.minXM, Math.min(...path.map(p => p.xM)) - radiusM),
    maxXM: Math.min(packageBounds.maxXM, Math.max(...path.map(p => p.xM)) + radiusM),
    minYM: Math.max(packageBounds.minYM, Math.min(...path.map(p => p.yM)) - radiusM),
    maxYM: Math.min(packageBounds.maxYM, Math.max(...path.map(p => p.yM)) + radiusM),
  };
  if (bounds.minXM >= bounds.maxXM || bounds.minYM >= bounds.maxYM) throw new Error('Search corridor does not intersect installed package coverage.');
  const segments = path.slice(1).map((point, index) => ({ a: path[index]!, b: point }));
  return {
    widthM, bounds,
    contains: (point: ProjectedPoint) => point.xM >= bounds.minXM && point.xM <= bounds.maxXM && point.yM >= bounds.minYM && point.yM <= bounds.maxYM && segments.some(({ a, b }) => distanceToSegmentM(point, a, b) <= radiusM + 1e-8),
  };
}
export function missionCorridor(mission: MissionConfig, manifest: TerrainPackageManifest) {
  const projection = createProjection(manifest);
  return createCorridor([mission.launch, ...mission.waypoints, mission.destination].map(point => projection.forward(point.position)), mission.constraints.corridorWidthM, manifest.projectedBounds);
}
export async function knownCorridorPoint(store: TerrainStore, corridor: ReturnType<typeof createCorridor>, point: ProjectedPoint) {
  if (!corridor.contains(point)) return { status: 'unknown' as const, reason: 'Point is outside the selected corridor or package.' };
  return sampleTerrain(store.manifest, (level, column, row) => store.get(level, column, row), point);
}
