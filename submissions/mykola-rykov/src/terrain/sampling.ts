import type { TerrainPackageManifest } from '../contracts/terrain';
import type { ProjectedPoint } from './coordinates';

export interface TerrainTile {
  display: Int16Array;
  obstruction: Int16Array;
  validity: Uint8Array;
}
export type TileLookup = (level: number, column: number, row: number) => Promise<TerrainTile | null>;
export type TerrainSample = { status: 'known'; displayHeightM: number; obstructionHeightM: number; datumId: string; surface: 'DSM'; confirmedOcean: boolean }
  | { status: 'unknown'; reason: string };

export async function sampleTerrain(manifest: TerrainPackageManifest, lookup: TileLookup, point: ProjectedPoint, levelIndex = 0): Promise<TerrainSample> {
  const level = manifest.levels[levelIndex];
  if (!level) throw new Error('Terrain level is not installed.');
  const { minXM, maxXM, minYM, maxYM } = manifest.projectedBounds;
  if (!Number.isFinite(point.xM) || !Number.isFinite(point.yM)) throw new Error('Sample coordinates must be finite.');
  if (point.xM < minXM || point.xM >= maxXM || point.yM <= minYM || point.yM > maxYM) return { status: 'unknown', reason: 'Outside regional terrain coverage.' };
  const width = Math.ceil((maxXM - minXM) / level.cellSizeM);
  const height = Math.ceil((maxYM - minYM) / level.cellSizeM);
  const u = Math.max(0, Math.min(width - 1, (point.xM - minXM) / level.cellSizeM - 0.5));
  const v = Math.max(0, Math.min(height - 1, (maxYM - point.yM) / level.cellSizeM - 0.5));
  const x0 = Math.floor(u), y0 = Math.floor(v);
  const x1 = Math.min(x0 + 1, width - 1), y1 = Math.min(y0 + 1, height - 1);
  const locations = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const;
  const pending = new Map<string, Promise<TerrainTile | null>>();
  const cells = await Promise.all(locations.map(async ([x, y]) => {
    const column = Math.floor(x / 256), row = Math.floor(y / 256);
    const key = `${column}:${row}`;
    let promise = pending.get(key);
    if (!promise) { promise = lookup(levelIndex, column, row); pending.set(key, promise); }
    const tile = await promise;
    if (!tile) return null;
    if (tile.display.length !== 65536 || tile.obstruction.length !== 65536 || tile.validity.length !== 65536) throw new Error('Invalid terrain tile lengths.');
    const offset = (y % 256) * 256 + x % 256;
    const validity = tile.validity[offset]!;
    if (validity === 0) return null;
    if (validity !== 1 && validity !== 2) throw new Error('Invalid terrain validity class.');
    return { display: tile.display[offset]!, obstruction: tile.obstruction[offset]!, ocean: validity === 2 };
  }));
  if (cells.some((cell) => cell === null)) return { status: 'unknown', reason: 'Missing terrain in the sampled footprint.' };
  const [a, b, c, d] = cells;
  if (!a || !b || !c || !d) throw new Error('Incomplete sample footprint.');
  const tx = u - x0, ty = v - y0;
  const displayHeightM = a.display * (1-tx)*(1-ty) + b.display*tx*(1-ty) + c.display*(1-tx)*ty + d.display*tx*ty;
  return { status: 'known', displayHeightM, obstructionHeightM: Math.max(a.obstruction, b.obstruction, c.obstruction, d.obstruction),
    datumId: manifest.verticalDatum.id, surface: 'DSM', confirmedOcean: cells.every((cell) => cell?.ocean) };
}
