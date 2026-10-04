import { expect, test } from 'vitest';
import { TerrainStore } from '../src/terrain/store';
import { terrainFixture } from './fixtures/contracts';

async function fixtureStore(options: { corrupt?: boolean; invalidMask?: boolean } = {}) {
  const manifest = terrainFixture();
  const buffers = new Map<string, Uint8Array>();
  const first = manifest.levels[0]!.tiles[0]!;
  manifest.levels[0]!.columns = 2;
  manifest.uncompressedBytes = 700000;
  manifest.levels[0]!.tiles.push({ ...structuredClone(first), column: 1 });
  for (const tile of manifest.levels[0]!.tiles) {
    for (const name of ['display', 'obstruction', 'validity'] as const) {
      const asset = tile[name];
      asset.path = `tiles/0/${tile.column}-${name}.bin`;
      const buffer = new Uint8Array(asset.bytes);
      if (name === 'validity') buffer.fill(options.invalidMask ? 3 : 1);
      const hash = await crypto.subtle.digest('SHA-256', buffer);
      asset.sha256 = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
      buffers.set(asset.path, buffer);
    }
  }
  let requests = 0;
  const fetchAsset: typeof fetch = async (input) => {
    requests++;
    const path = new URL(String(input)).pathname.replace('/region/', '');
    const data = buffers.get(path)!;
    const response = data.slice();
    if (options.corrupt) response[0] = response[0]! ^ 1;
    return new Response(response.buffer);
  };
  return { store: new TerrainStore(manifest, 'http://localhost/region/', { fetch: fetchAsset, maxCacheBytes: 327680 }), requests: () => requests };
}

test('local tile loading deduplicates work and evicts inactive data within its byte bound', async () => {
  const { store, requests } = await fixtureStore();
  const [a, b] = await Promise.all([store.get(0, 0, 0), store.get(0, 0, 0)]);
  expect(a).toBe(b);
  expect(requests()).toBe(3);
  await store.get(0, 1, 0);
  expect(store.stats()).toMatchObject({ cacheTiles: 1, cacheBytes: 327680, pendingTiles: 0 });
  await store.get(0, 0, 0);
  expect(requests()).toBe(9);
  expect(await store.get(0, 100, 100)).toBeNull();
  store.clear();
  expect(store.stats().cacheBytes).toBe(0);
});

test('corrupted or invalid terrain cannot enter the analysis cache', async () => {
  for (const options of [{ corrupt: true }, { invalidMask: true }]) {
    const { store } = await fixtureStore(options);
    await expect(store.get(0, 0, 0)).rejects.toThrow();
    expect(store.stats()).toMatchObject({ cacheBytes: 0, pendingTiles: 0 });
  }
  expect(() => new TerrainStore({ ...terrainFixture(), schemaVersion: 2 }, 'http://localhost/region/')).toThrow();
});
