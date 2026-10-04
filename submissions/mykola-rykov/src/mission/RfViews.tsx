import { useEffect, useMemo, useRef, useState } from 'react';
import type { MissionConfig } from '../contracts/mission';
import type { ScenarioResult } from '../contracts/result';
import type { RfView, WorkerResponse } from '../contracts/worker';
import type { TerrainStore } from '../terrain/store';
import { projectRfPath } from './rf-path';
import { JobClient } from '../workers/lifecycle';
import { metricColor } from '../scene/scales';
type Grid = Extract<WorkerResponse, { type: 'view-grid' }>;
interface Props { mission: MissionConfig; store: TerrainStore; route: ScenarioResult | null; metric: 'margin' | 'power'; coordinatesValid: boolean }
export default function RfViews({ mission, store, route, metric, coordinatesValid }: Props) {
  const client = useRef<JobClient | null>(null);
  const [kind, setKind] = useState<'slice' | 'heatmap'>('slice');
  const [altitudeM, setAltitudeM] = useState(1500), [minimumM, setMinimumM] = useState(500), [maximumM, setMaximumM] = useState(2500);
  const [headingDeg, setHeadingDeg] = useState(0), [pitchDeg, setPitchDeg] = useState(0), [rollDeg, setRollDeg] = useState(0), [resolution, setResolution] = useState(12);
  const [grid, setGrid] = useState<Grid | null>(null), [selected, setSelected] = useState(0), [running, setRunning] = useState(false), [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' });
    const connection = new JobClient(worker, message => {
      if (message.type === 'progress') setProgress(message.fractionComplete);
      else if (message.type === 'view-grid') { setGrid(message); setSelected(0); setRunning(false); }
      else if (message.type === 'error') { setError(message.message); setRunning(false); }
      else if (message.type === 'cancelled') setRunning(false);
    });
    client.current = connection;
    return () => { connection.dispose(); client.current = null; worker.terminate(); };
  }, [store]);
  useEffect(() => {
    client.current?.cancel(); let live = true;
    queueMicrotask(() => { if (live) { setGrid(null); setRunning(false); setError(null); } });
    return () => { live = false; };
  }, [mission, route, kind, altitudeM, minimumM, maximumM, headingDeg, pitchDeg, rollDeg, resolution, coordinatesValid]);
  const projected = useMemo(() => projectRfPath(mission, route, store), [mission, route, store]);
  const path = projected.path;
  function start() {
    try {
      if (!coordinatesValid) throw new Error('Correct invalid mission coordinates before calculating an RF view.');
      if (projected.error) throw new Error(`RF view geometry cannot be projected: ${projected.error}`);
      if (!client.current) throw new Error('RF view worker is preparing.');
      if (kind === 'heatmap' && !route) throw new Error('Analyze and select a route before requesting its distance–altitude heatmap.');
      const attitude = { headingDeg, pitchDeg, rollDeg };
      const bounds = store.manifest.projectedBounds, padding = mission.constraints.corridorWidthM / 2;
      const view: RfView = kind === 'slice' ? { kind, columns: resolution, rows: resolution, minXM: Math.max(bounds.minXM, Math.min(...path.map(p => p.xM)) - padding), maxXM: Math.min(bounds.maxXM, Math.max(...path.map(p => p.xM)) + padding), minYM: Math.max(bounds.minYM, Math.min(...path.map(p => p.yM)) - padding), maxYM: Math.min(bounds.maxYM, Math.max(...path.map(p => p.yM)) + padding), altitudeM, attitude } : { kind, columns: resolution, rows: resolution, path, minimumAltitudeM: minimumM, maximumAltitudeM: maximumM, attitude };
      client.current.start({ type: 'rf-view', mission, equipmentId: route?.equipmentId ?? mission.equipment[0]!.id, view });
      setGrid(null); setError(null); setProgress(0); setRunning(true);
    } catch (reason) { setError(String(reason)); }
  }
  const values = grid ? new Float32Array(metric === 'margin' ? grid.marginBuffer : grid.powerBuffer) : null, validity = grid ? new Uint8Array(grid.validityBuffer) : null;
  const selectedValue = values && validity?.[selected] === 1 ? values[selected] : null;
  return <details className="rf-views"><summary>Coverage and altitude views</summary>
    <label>RF view type<select aria-label="RF view type" value={kind} onChange={event => setKind(event.target.value as 'slice' | 'heatmap')}><option value="slice">Horizontal coverage slice</option><option value="heatmap">Route distance–altitude heatmap</option></select></label>
    {kind === 'slice' ? <label>Coverage altitude above {store.manifest.verticalDatum.id} (m)<input aria-label="Coverage altitude (m)" type="number" value={altitudeM} onChange={event => setAltitudeM(event.target.valueAsNumber)} /></label> : <><label>Heatmap minimum altitude (m)<input type="number" value={minimumM} onChange={event => setMinimumM(event.target.valueAsNumber)} /></label><label>Heatmap maximum altitude (m)<input type="number" value={maximumM} onChange={event => setMaximumM(event.target.valueAsNumber)} /></label></>}
    <label>RF grid samples per axis<input type="number" min={2} max={32} value={resolution} onChange={event => setResolution(event.target.valueAsNumber)} /></label>
    <label>Assumed airborne heading (°)<input type="number" min={0} max={359.999} value={headingDeg} onChange={event => setHeadingDeg(event.target.valueAsNumber)} /></label>
    <label>Assumed airborne pitch (°)<input type="number" min={-90} max={90} value={pitchDeg} onChange={event => setPitchDeg(event.target.valueAsNumber)} /></label>
    <label>Assumed airborne bank (°)<input type="number" min={-180} max={180} value={rollDeg} onChange={event => setRollDeg(event.target.valueAsNumber)} /></label>
    <p>Fixed attitude: heading {headingDeg}°, pitch {pitchDeg}°, bank {rollDeg}°. Uses {route?.equipmentId ?? mission.equipment[0]!.id}. Coverage is orientation-dependent; grey cells have missing RF evidence. The slice covers the route bounds plus the selected corridor, clipped to the package.</p>
    {!coordinatesValid && <p role="status">RF view is unavailable until all mission coordinates are valid.</p>}
    {projected.error && <p role="alert">RF view geometry cannot be projected: {projected.error}</p>}
    <button disabled={!coordinatesValid || !!projected.error} onClick={start}>Calculate RF view</button>
    {running && <><button onClick={() => { client.current?.cancel(); setRunning(false); }}>Cancel RF view</button><progress aria-label="RF view progress" max={1} value={progress} /></>}
    {error && <p role="alert">{error}</p>}
    {grid && <section aria-label={grid.kind === 'slice' ? 'Horizontal coverage slice' : 'Route distance–altitude heatmap'}>
      <p>{grid.horizontalLabel}: {grid.horizontalMinimum.toFixed(2)}–{grid.horizontalMaximum.toFixed(2)} · {grid.verticalLabel}: {grid.verticalMinimum.toFixed(2)}–{grid.verticalMaximum.toFixed(2)}. Top row is the highest ordinate.</p>
      <p>{metric === 'margin' ? `Margin scale: red <${mission.constraints.requiredMarginDb} dB; amber below ${mission.constraints.requiredMarginDb + 10} dB; green above.` : 'Power scale: red <−100 dBm; amber <−90 dBm; green ≥−90 dBm.'}</p>
      <div className="rf-grid" data-testid="rf-view-grid" style={{ gridTemplateColumns: `repeat(${grid.columns}, 1fr)` }}>{Array.from({ length: grid.columns * grid.rows }, (_, index) => <button key={index} aria-label={`Inspect RF grid cell ${index + 1}`} aria-pressed={selected === index} style={{ background: metricColor(validity?.[index] === 1 ? values![index]! : null, metric, mission.constraints.requiredMarginDb) }} onClick={() => setSelected(index)} />)}</div>
      <p data-testid="rf-grid-inspection">Cell {selected + 1}: {selectedValue === null || selectedValue === undefined ? 'Unknown RF evidence' : `${selectedValue.toFixed(2)} ${metric === 'margin' ? 'dB available margin' : 'dBm received power'}`}</p>
      {grid.assumptions.map(assumption => <p key={assumption}>{assumption}</p>)}
    </section>}
  </details>;
}
