import { JobRunner } from './lifecycle';
import { AnalysisCache, analyzeMission } from '../rf/analysis';
import { TerrainStore } from '../terrain/store';
import { evaluateRfView } from '../rf/views';
import type { WorkerResponse } from '../contracts/worker';
const scope = self as unknown as { location: Location; postMessage: (message: WorkerResponse, transfers: Transferable[]) => void; onmessage: ((event: MessageEvent) => void) | null };
let store: TerrainStore | null = null;
let cache = new AnalysisCache();
const runner = new JobRunner(async (request, context) => {
  if (request.type === 'search') throw new Error('Automatic routing is not implemented yet.');
  const reference = request.mission.terrain;
  if (!store || store.manifest.id !== reference.packageId || store.manifest.packageVersion !== reference.packageVersion) {
    // The static launcher serves the application and packages at its localhost root.
    const url = new URL(`/terrain/${reference.packageId}/manifest.json`, scope.location.href);
    const response = await fetch(url); if (!response.ok) throw new Error('Referenced terrain package is not installed.');
    const manifest = await response.json(); await context.checkpoint();
    const loaded = new TerrainStore(manifest, new URL('.', url).href);
    store?.clear(); store = loaded; cache = new AnalysisCache();
  }
  if (request.type === 'rf-view') {
    const grid = await evaluateRfView(request.mission, request.equipmentId, request.view, store, context, cache);
    await context.checkpoint(); context.emit(grid, [grid.marginBuffer, grid.powerBuffer, grid.validityBuffer]); return;
  }
  const results = await analyzeMission(request.mission, store, context, cache);
  await context.checkpoint();
  context.emit({ protocolVersion: 1, type: 'result', jobId: context.jobId, results, refinement: 'final' });
}, (message, transfers) => scope.postMessage(message, transfers));
scope.onmessage = (event) => { void runner.handle(event.data).catch((reason: unknown) => { console.error('Rejected worker request:', String(reason)); }); };
