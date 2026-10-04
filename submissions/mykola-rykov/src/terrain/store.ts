import { parseTerrainManifest } from '../contracts/terrain';
import type { TerrainPackageManifest } from '../contracts/terrain';
import type { TerrainTile } from './sampling';

type Asset = TerrainPackageManifest['levels'][number]['tiles'][number]['display'];
export interface TerrainStoreOptions { maxCacheBytes?: number; fetch?: typeof fetch }
const TILE_BYTES = 256 * 256 * 5;

export async function verifyAsset(asset: Asset, buffer: ArrayBuffer): Promise<void> {
  if (buffer.byteLength !== asset.bytes) throw new Error(`Wrong byte count: ${asset.path}`);
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  const hex = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (hex !== asset.sha256) throw new Error(`Checksum mismatch: ${asset.path}`);
}

function decodeHeights(buffer: ArrayBuffer): Int16Array {
  const view = new DataView(buffer);
  const heights = new Int16Array(buffer.byteLength / 2);
  for (let i = 0; i < heights.length; i++) heights[i] = view.getInt16(i * 2, true);
  return heights;
}

export class TerrainStore {
  readonly manifest: TerrainPackageManifest;
  private readonly baseUrl: URL;
  private readonly fetchAsset: typeof fetch;
  private readonly limit: number;
  private readonly cache = new Map<string, TerrainTile>();
  private readonly pending = new Map<string, Promise<TerrainTile>>();
  private cacheBytes = 0;

  constructor(manifest: unknown, baseUrl: string, options: TerrainStoreOptions = {}) {
    this.manifest = parseTerrainManifest(manifest);
    this.baseUrl = new URL(baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
    this.fetchAsset = options.fetch ?? fetch.bind(globalThis);
    this.limit = options.maxCacheBytes ?? 32 * 1024 * 1024;
    if (!Number.isSafeInteger(this.limit) || this.limit < TILE_BYTES) throw new Error('Terrain cache must hold at least one complete tile.');
  }

  stats() { return { cacheBytes: this.cacheBytes, cacheTiles: this.cache.size, pendingTiles: this.pending.size, maxCacheBytes: this.limit }; }
  clear() { this.cache.clear(); this.cacheBytes = 0; }

  private async read(asset: Asset): Promise<ArrayBuffer> {
    const url = new URL(asset.path, this.baseUrl);
    if (url.origin !== this.baseUrl.origin || !url.pathname.startsWith(this.baseUrl.pathname)) throw new Error('Asset escapes terrain package.');
    const response = await this.fetchAsset(url, { redirect: 'error' });
    if (!response.ok) throw new Error(`Unable to load terrain asset: ${asset.path} (${response.status})`);
    const length = response.headers.get('content-length');
    if (length !== null && Number(length) !== asset.bytes) throw new Error(`Wrong byte count: ${asset.path}`);
    if (!response.body) throw new Error(`Empty terrain asset: ${asset.path}`);
    const reader = response.body.getReader();
    const bytes = new Uint8Array(asset.bytes);
    let offset = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (offset + value.byteLength > bytes.byteLength) {
          await reader.cancel();
          throw new Error(`Oversized terrain asset: ${asset.path}`);
        }
        bytes.set(value, offset); offset += value.byteLength;
      }
    } finally { reader.releaseLock(); }
    if (offset !== bytes.byteLength) throw new Error(`Truncated terrain asset: ${asset.path}`);
    const data = bytes.buffer;
    await verifyAsset(asset, data);
    return data;
  }

  async contextAsset(asset: Asset): Promise<ArrayBuffer> {
    if (!this.manifest.contextAssets.some((item) => item.path === asset.path && item.sha256 === asset.sha256)) throw new Error('Unindexed context asset.');
    return this.read(asset);
  }

  async get(levelIndex: number, column: number, row: number): Promise<TerrainTile | null> {
    const level = this.manifest.levels[levelIndex];
    const tile = level?.tiles.find((candidate) => candidate.column === column && candidate.row === row);
    if (!tile) return null;
    const key = `${levelIndex}:${column}:${row}`;
    const cached = this.cache.get(key);
    if (cached) { this.cache.delete(key); this.cache.set(key, cached); return cached; }
    const existing = this.pending.get(key);
    if (existing) return existing;
    // Bound concurrent decoding/fetches as well as retained tiles.
    while (this.pending.size >= 4) {
      await Promise.race(this.pending.values());
      const loaded = this.cache.get(key);
      if (loaded) return loaded;
      const inProgress = this.pending.get(key);
      if (inProgress) return inProgress;
    }
    const request = (async () => {
      const [display, obstruction, validity] = await Promise.all([this.read(tile.display), this.read(tile.obstruction), this.read(tile.validity)]);
      const decoded = { display: decodeHeights(display), obstruction: decodeHeights(obstruction), validity: new Uint8Array(validity) };
      for (let i = 0; i < decoded.validity.length; i++) {
        const v = decoded.validity[i]!;
        if (v > 2 || (v !== 0 && decoded.obstruction[i]! < decoded.display[i]!) || (v === 2 && (decoded.display[i] !== 0 || decoded.obstruction[i] !== 0))) throw new Error('Terrain tile has invalid validity or obstruction/ocean values.');
      }
      while (this.cacheBytes + TILE_BYTES > this.limit) {
        const oldest = this.cache.keys().next().value;
        if (oldest === undefined) break;
        this.cache.delete(oldest); this.cacheBytes -= TILE_BYTES;
      }
      this.cache.set(key, decoded); this.cacheBytes += TILE_BYTES;
      return decoded;
    })();
    this.pending.set(key, request);
    try { return await request; } finally { this.pending.delete(key); }
  }
}
