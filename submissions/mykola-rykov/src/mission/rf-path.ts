import type { MissionConfig } from '../contracts/mission';
import type { ScenarioResult } from '../contracts/result';
import type { TerrainStore } from '../terrain/store';
import { createProjection } from '../terrain/coordinates';

export function projectRfPath(mission: MissionConfig, route: ScenarioResult | null, store: TerrainStore) {
  try {
    const projection = createProjection(store.manifest);
    const path = route ? route.routeSamples.map(sample => ({ ...projection.forward(sample.position), altitudeM: sample.altitude.metres })) : [mission.launch, ...mission.waypoints, mission.destination].map(point => ({ ...projection.forward(point.position), altitudeM: point.altitude.metres }));
    return { path, error: null as string | null };
  } catch (reason) {
    return { path: [] as { xM: number; yM: number; altitudeM: number }[], error: String(reason) };
  }
}
