import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { TerrainStore } from './terrain/store';
import { createProjection } from './terrain/coordinates';
import type { Coordinate, ProjectedPoint } from './terrain/coordinates';
import { sampleTerrain } from './terrain/sampling';

const Scene = lazy(() => import('./scene/Scene'));
const registrySchema = z.object({ schemaVersion: z.literal(1), regions: z.array(z.object({ id: z.string(), name: z.string(), manifestPath: z.string().regex(/^\.\/terrain\/[a-zA-Z0-9._-]+\/manifest\.json$/) })) });
export default function App() {
  const [store, setStore] = useState<TerrainStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'top' | 'perspective'>('perspective');
  const [latitude, setLatitude] = useState('46.20572222'), [longitude, setLongitude] = useState('13.68991667');
  const [selected, setSelected] = useState<(ProjectedPoint & { surfaceM: number }) | null>(null);
  const pointJob = useRef(0);
  useEffect(() => {
    let live = true;
    void (async () => {
      const response = await fetch('./regions.json'); if (!response.ok) throw new Error('Unable to read installed regions.');
      const registry = registrySchema.parse(await response.json());
      const first = registry.regions[0]; if (!first) return;
      const url = new URL(first.manifestPath, document.baseURI);
      const manifestResponse = await fetch(url); if (!manifestResponse.ok) throw new Error('Unable to read region manifest.');
      const loaded = new TerrainStore(await manifestResponse.json(), new URL('.', url).href);
      if (live) { setStore(loaded); setLatitude(String(loaded.manifest.center.latitudeDeg)); setLongitude(String(loaded.manifest.center.longitudeDeg)); }
    })().catch((reason: unknown) => { if (live) setError(String(reason)); });
    const jobs = pointJob;
    return () => { live = false; jobs.current++; };
  }, []);
  async function place(coordinate: Coordinate) {
    if (!store) return;
    const job = ++pointJob.current;
    try {
      const projected = createProjection(store.manifest).forward(coordinate);
      const sample = await sampleTerrain(store.manifest, (level, column, row) => store.get(level, column, row), projected);
      if (job !== pointJob.current) return;
      if (sample.status === 'unknown') { setSelected(null); setError(sample.reason); return; }
      setError(null); setSelected({ ...projected, surfaceM: sample.displayHeightM });
      setLatitude(coordinate.latitudeDeg.toFixed(8)); setLongitude(coordinate.longitudeDeg.toFixed(8));
    } catch (reason) { if (job === pointJob.current) setError(String(reason)); }
  }
  const manifest = store?.manifest;
  return <main>
    <header><span className="eyebrow">REGIONAL FLIGHT PLANNING</span><h1>RF Flight Planner</h1><p>Terrain, radio links, and aircraft endurance in one offline workspace.</p></header>
    <section className="workspace" aria-labelledby="region-title">
      <div className="region-panel"><span className="status">{manifest ? 'Local terrain installed' : 'No terrain installed'}</span><h2 id="region-title">{manifest?.name ?? 'Install a region'}</h2>
        {error && <p role="alert">{error}</p>}
        {manifest ? <>
          <form onSubmit={(event) => { event.preventDefault(); void place({ latitudeDeg: Number(latitude), longitudeDeg: Number(longitude) }); }}>
            <label>Latitude (°N)<input required type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></label>
            <label>Longitude (°E)<input required type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></label><button type="submit">Place coordinate</button>
          </form>
          {selected && <p data-testid="selected-point">DSM elevation: {selected.surfaceM.toFixed(1)} m · {manifest.verticalDatum.id}</p>}
          <dl><dt>Coverage</dt><dd>{((manifest.projectedBounds.maxXM - manifest.projectedBounds.minXM) / 1000).toFixed(1)} × {((manifest.projectedBounds.maxYM - manifest.projectedBounds.minYM) / 1000).toFixed(1)} km</dd><dt>Grid / source resolution</dt><dd>{manifest.levels[0]!.cellSizeM} m / {manifest.sources[0]!.nominalResolutionM} m nominal</dd><dt>Surface / vertical reference</dt><dd>DSM · {manifest.verticalDatum.id}</dd></dl>
          <details><summary>Terrain attribution and accuracy</summary>{manifest.attribution.map((line) => <p key={line}>{line}</p>)}<p>{manifest.sources[0]!.accuracyDescription}</p></details>
          <p>Click terrain or enter coordinates. RF and energy analysis are being implemented.</p>
        </> : <p>Install a regional package using the documented local installation command.</p>}
      </div>
      <div className="scene-panel">{store ? <><div className="view-controls"><button aria-pressed={mode === 'perspective'} onClick={() => setMode('perspective')}>Perspective</button><button aria-pressed={mode === 'top'} onClick={() => setMode('top')}>Top-down</button></div><Suspense fallback={<p role="status">Loading viewer…</p>}><Scene store={store} mode={mode} selected={selected} onPick={(point) => { void place(point); }} /></Suspense></> : <p className="placeholder">Your terrain workspace</p>}</div>
    </section><footer>Desktop WebGL2 · Local files · Engineering estimates</footer>
  </main>;
}
