import { BufferAttribute, BufferGeometry } from 'three';
import type { TerrainStore } from '../terrain/store';

// Geometry uses kilometres and a labelled 3x display-only vertical scale.
export async function terrainGeometry(store: TerrainStore, levelIndex: number, cancelled: () => boolean) {
  const { manifest } = store;
  const level = manifest.levels[levelIndex]!;
  const bounds = manifest.projectedBounds;
  const width = Math.ceil((bounds.maxXM - bounds.minXM) / level.cellSizeM);
  const height = Math.ceil((bounds.maxYM - bounds.minYM) / level.cellSizeM);
  const positions = new Float32Array(width * height * 3);
  const valid = new Uint8Array(width * height);
  for (let tileRow = 0; tileRow < level.rows; tileRow++) {
    const tiles = await Promise.all(Array.from({ length: level.columns }, (_, column) => store.get(levelIndex, column, tileRow)));
    if (cancelled()) return null;
    for (let y = tileRow * 256; y < Math.min(height, (tileRow + 1) * 256); y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[Math.floor(x / 256)];
        const cell = y % 256 * 256 + x % 256, index = y * width + x;
        positions[index * 3] = (bounds.minXM + (x + .5) * level.cellSizeM) / 1000;
        positions[index * 3 + 1] = (tile?.display[cell] ?? 0) * .003;
        positions[index * 3 + 2] = -(bounds.maxYM - (y + .5) * level.cellSizeM) / 1000;
        valid[index] = tile?.validity[cell] ?? 0;
      }
      if (y % 32 === 0) { await new Promise((resolve) => setTimeout(resolve, 0)); if (cancelled()) return null; }
    }
  }
  const indices: number[] = [];
  for (let y = 0; y < height - 1; y++) for (let x = 0; x < width - 1; x++) {
    const a = y * width + x, b = a + 1, c = a + width, d = c + 1;
    if (valid[a] && valid[b] && valid[c]) indices.push(a, c, b);
    if (valid[b] && valid[c] && valid[d]) indices.push(b, c, d);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}
