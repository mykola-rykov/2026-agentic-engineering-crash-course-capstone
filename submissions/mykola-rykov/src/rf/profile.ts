import type { TerrainPackageManifest } from '../contracts/terrain';
import type { ProjectedPoint } from '../terrain/coordinates';
import type { TileLookup } from '../terrain/sampling';
import { sampleTerrain } from '../terrain/sampling';
export const EARTH_RADIUS_M = 6_371_000;
export function curvatureM(distanceAlongM: number, pathLengthM: number, effectiveRadiusFactor = 4 / 3) {
  if (![distanceAlongM, pathLengthM, effectiveRadiusFactor].every(Number.isFinite) || pathLengthM <= 0 || effectiveRadiusFactor <= 0 || distanceAlongM < 0 || distanceAlongM > pathLengthM) throw new Error('Invalid curved-ray geometry.');
  return distanceAlongM * (pathLengthM - distanceAlongM) / (2 * EARTH_RADIUS_M * effectiveRadiusFactor);
}
export interface RadioProfile {
  status: 'known' | 'unknown';
  distanceM: Float64Array;
  terrainM: Float64Array;
  validity: Uint8Array;
  missingSampleCount: number;
  pathLengthM: number;
  terrainDatumId: string;
}
interface Options { signal?: AbortSignal; checkpoint?: () => Promise<void>; progress?: (fraction: number) => void }
export async function sampleRadioRay(manifest: TerrainPackageManifest, lookup: TileLookup, station: ProjectedPoint, aircraft: ProjectedPoint, options: Options = {}): Promise<RadioProfile> {
  if (![station.xM, station.yM, aircraft.xM, aircraft.yM].every(Number.isFinite)) throw new Error('Radio endpoints must be finite.');
  const distance = Math.hypot(aircraft.xM - station.xM, aircraft.yM - station.yM);
  if (distance <= 0 || distance > 100_000) throw new Error('Radio-ray separation must be positive and no more than 100 km.');
  const intervals = Math.max(2, Math.ceil(distance / manifest.levels[0]!.cellSizeM));
  const distanceM = new Float64Array(intervals + 1), terrainM = new Float64Array(intervals + 1), validity = new Uint8Array(intervals + 1);
  terrainM.fill(NaN);
  let missingSampleCount = 0;
  for (let i = 0; i <= intervals; i++) {
    options.signal?.throwIfAborted();
    const t = i / intervals; distanceM[i] = t * distance;
    const sample = await sampleTerrain(manifest, lookup, { xM: station.xM + (aircraft.xM - station.xM) * t, yM: station.yM + (aircraft.yM - station.yM) * t });
    if (sample.status === 'known') { terrainM[i] = sample.obstructionHeightM; validity[i] = sample.confirmedOcean ? 2 : 1; }
    else missingSampleCount++;
    if (i % 64 === 0 || i === intervals) {
      options.progress?.(t);
      if (options.checkpoint) await options.checkpoint(); else await new Promise((resolve) => setTimeout(resolve, 0));
      options.signal?.throwIfAborted();
    }
  }
  return { status: missingSampleCount === 0 ? 'known' : 'unknown', distanceM, terrainM, validity, missingSampleCount, pathLengthM: distance, terrainDatumId: manifest.verticalDatum.id };
}
export function curvedTerrain(profile: RadioProfile, effectiveRadiusFactor = 4 / 3, uncertaintyM = 0): Float64Array {
  if (!Number.isFinite(uncertaintyM) || uncertaintyM < 0) throw new Error('Terrain uncertainty must be nonnegative.');
  return profile.terrainM.map((height, index) => height + curvatureM(profile.distanceM[index]!, profile.pathLengthM, effectiveRadiusFactor) + (profile.validity[index] === 2 ? 0 : uncertaintyM));
}
