import { BufferAttribute, BufferGeometry, CanvasTexture, Group, LineBasicMaterial, LineSegments, Sprite, SpriteMaterial } from 'three';
import { z } from 'zod';
import type { TerrainStore } from '../terrain/store';
import { createProjection } from '../terrain/coordinates';
import { sampleTerrain } from '../terrain/sampling';
const pointSchema = z.tuple([z.number().finite(), z.number().finite()]);
const schema = z.object({ features: z.array(z.object({ properties: z.object({ name: z.string().nullable() }).passthrough(), geometry: z.discriminatedUnion('type', [z.object({ type: z.literal('Point'), coordinates: pointSchema }), z.object({ type: z.literal('LineString'), coordinates: z.array(pointSchema) }), z.object({ type: z.literal('MultiLineString'), coordinates: z.array(z.array(pointSchema)) })]) })) });
export async function geographicContext(store: TerrainStore, cancelled: () => boolean) {
  const group = new Group(), projection = createProjection(store.manifest), bounds = store.manifest.projectedBounds;
  const level = store.manifest.levels.length - 1;
  const positions: number[] = [];
  let labels = 0;
  async function vertex(point: [number, number]) {
    const p = projection.forward({ longitudeDeg: point[0], latitudeDeg: point[1] });
    if (p.xM < bounds.minXM || p.xM >= bounds.maxXM || p.yM <= bounds.minYM || p.yM > bounds.maxYM) return null;
    const sample = await sampleTerrain(store.manifest, (l, c, r) => store.get(l, c, r), p, level);
    if (sample.status !== 'known') return null;
    return [p.xM / 1000, sample.displayHeightM * .003 + .1, -p.yM / 1000] as const;
  }
  for (const asset of store.manifest.contextAssets) {
    if (!asset.path.endsWith('.geojson')) continue;
    const data = schema.parse(JSON.parse(new TextDecoder().decode(await store.contextAsset(asset))));
    for (const feature of data.features) {
      if (cancelled()) { disposeContext(group); return null; }
      const geometry = feature.geometry;
      if (geometry.type === 'Point') {
        if (!feature.properties.name || labels >= 18) continue;
        const p = await vertex(geometry.coordinates); if (!p) continue;
        const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 64;
        const ctx = canvas.getContext('2d'); if (!ctx) continue;
        ctx.font = '28px system-ui'; ctx.fillStyle = '#eef2f4'; ctx.fillText(feature.properties.name, 4, 40);
        const sprite = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), depthTest: false }));
        sprite.position.set(p[0], p[1] + 1, p[2]); sprite.scale.set(20, 3.33, 1); group.add(sprite); labels++;
      } else {
        const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
        for (const line of lines) {
          let previous: Awaited<ReturnType<typeof vertex>> = null;
          for (let i = 0; i < line.length; i++) {
            const current = await vertex(line[i]!);
            if (previous && current) positions.push(...previous, ...current);
            previous = current;
            if (i % 256 === 0) { await new Promise((resolve) => setTimeout(resolve, 0)); if (cancelled()) { disposeContext(group); return null; } }
          }
        }
      }
    }
  }
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  group.add(new LineSegments(geometry, new LineBasicMaterial({ color: '#cccccc', transparent: true, opacity: .55 })));
  return group;
}
export function disposeContext(group: Group) {
  group.traverse((object) => {
    if (object instanceof LineSegments) { object.geometry.dispose(); (object.material as LineBasicMaterial).dispose(); }
    if (object instanceof Sprite) { (object.material as SpriteMaterial).map?.dispose(); object.material.dispose(); }
  });
}
