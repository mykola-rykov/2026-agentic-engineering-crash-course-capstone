import proj4 from 'proj4';
import { altitudeSchema, coordinateSchema } from '../contracts/common';
import type { z } from 'zod';
import type { TerrainPackageManifest } from '../contracts/terrain';

export type Coordinate = z.infer<typeof coordinateSchema>;
export type Altitude = z.infer<typeof altitudeSchema>;
export interface ProjectedPoint { xM: number; yM: number }

export function createProjection(manifest: TerrainPackageManifest) {
  const conversion = proj4('EPSG:4326', manifest.projection.definition);
  return {
    forward(position: Coordinate): ProjectedPoint {
      coordinateSchema.parse(position);
      const [xM, yM] = conversion.forward([position.longitudeDeg, position.latitudeDeg]);
      if (!Number.isFinite(xM) || !Number.isFinite(yM)) throw new Error('Coordinate cannot be projected in this region.');
      return { xM, yM };
    },
    inverse(point: ProjectedPoint): Coordinate {
      if (!Number.isFinite(point.xM) || !Number.isFinite(point.yM)) throw new Error('Projected coordinates must be finite.');
      const [longitude, latitudeDeg] = conversion.inverse([point.xM, point.yM]);
      const longitudeDeg = ((longitude + 180) % 360 + 360) % 360 - 180;
      return coordinateSchema.parse({ longitudeDeg, latitudeDeg });
    },
  };
}

export function resolveAltitude(altitude: Altitude, datumId: string, surfaceM: number | null): number | null {
  altitudeSchema.parse(altitude);
  if (altitude.datumId !== datumId) throw new Error('Incompatible vertical datums; an explicit conversion is required.');
  if (altitude.reference === 'datum') return altitude.metres;
  if (surfaceM === null) return null;
  if (!Number.isFinite(surfaceM)) throw new Error('Reference surface must be finite or explicitly unknown.');
  return surfaceM + altitude.metres;
}
