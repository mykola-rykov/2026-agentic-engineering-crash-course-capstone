import { useEffect, useRef, useState } from 'react';
import type { MissionConfig } from '../contracts/mission';
import type { ScenarioResult } from '../contracts/result';
import type { TerrainStore } from '../terrain/store';
import { JobClient } from '../workers/lifecycle';
import ComparisonCards from './ComparisonCards';
import { routeObjective } from './comparison';
interface Props { mission: MissionConfig; store: TerrainStore; sampleIndex: number; onInspect: (index: number) => void; onScenario: (result: ScenarioResult | null) => void; coordinatesValid: boolean }
const numeric = (value: number | null, unit: string) => value === null ? 'Unavailable' : `${value.toFixed(2)} ${unit}`;
export default function AnalysisPanel({ mission, store, sampleIndex, onInspect, onScenario, coordinatesValid }: Props) {
  const client = useRef<JobClient | null>(null);
  const [results, setResults] = useState<ScenarioResult[]>([]);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ phase: '', fraction: 0 });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' });
    const connection = new JobClient(worker, (message) => {
      if (message.type === 'progress') setProgress({ phase: message.phase, fraction: message.fractionComplete });
      else if (message.type === 'result') { setRunning(message.refinement !== 'final'); setResults(message.results); setScenarioIndex(0); onScenario(message.results[0] ?? null); onInspect(0); }
      else if (message.type === 'no-route') { setRunning(false); setResults([]); onScenario(null); setError(message.reason); }
      else if (message.type === 'error') { setRunning(false); setError(message.message); }
      else if (message.type === 'cancelled') setRunning(false);
    });
    client.current = connection;
    return () => { connection.dispose(); client.current = null; worker.terminate(); };
  }, [store, onScenario, onInspect]);
  useEffect(() => {
    client.current?.cancel();
    let live = true;
    queueMicrotask(() => { if (live) { setRunning(false); setResults([]); setError(null); onScenario(null); onInspect(0); } });
    return () => { live = false; };
  }, [mission, onScenario, onInspect]);
  useEffect(() => {
    if (coordinatesValid) return;
    client.current?.cancel();
    queueMicrotask(() => { setRunning(false); setResults([]); onScenario(null); onInspect(0); });
  }, [coordinatesValid, onScenario, onInspect]);
  function start(type: 'analyze' | 'search') {
    try { if (!coordinatesValid) throw new Error('Correct invalid mission coordinates before analysis.'); if (!client.current) throw new Error('Analysis worker is preparing.'); client.current.start({ type, mission }); setResults([]); onScenario(null); setError(null); setProgress({ phase: 'Preparing route', fraction: 0 }); setRunning(true); }
    catch (reason) { setError(String(reason)); }
  }
  const result = results[scenarioIndex], sample = result?.routeSamples[sampleIndex];
  return <section className="analysis-panel" aria-label="Manual route analysis">
    <button disabled={!coordinatesValid} title={!coordinatesValid ? 'Correct mission coordinates before analysis.' : undefined} onClick={() => start('analyze')}>Analyze manual route RF</button>
    <button disabled={!coordinatesValid} title={!coordinatesValid ? 'Correct mission coordinates before analysis.' : undefined} onClick={() => start('search')}>Find verified route alternatives</button>
    {running && <><button onClick={() => { client.current?.cancel(); setRunning(false); setProgress({ phase: 'Cancelled', fraction: 0 }); }}>Cancel analysis</button><label>{progress.phase}<progress aria-label="Analysis progress" max={1} value={progress.fraction} /></label></>}
    {error && <p role="alert">{error}</p>}
    {result && <>
      <button disabled={!coordinatesValid} title={!coordinatesValid ? 'Correct mission coordinates before exporting.' : undefined} onClick={() => {
        if (!coordinatesValid) { setError('Correct invalid mission coordinates before exporting.'); return; }
        const blob = new Blob([JSON.stringify({ schemaVersion: 1, mission, results }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = `${mission.id}-results.json`; anchor.click(); URL.revokeObjectURL(url);
      }}>Export scenario results JSON</button>
      <label>Equipment scenario<select aria-label="Equipment scenario" value={scenarioIndex} onChange={(e) => { const index = Number(e.target.value); setScenarioIndex(index); onScenario(results[index] ?? null); onInspect(0); }}>{results.map((r, i) => <option key={r.scenarioId} value={i}>{r.equipmentId}{routeObjective(r) ? ` · ${routeObjective(r)}` : ''}</option>)}</select></label>
      <p data-testid="rf-result-status">RF: {result.rfFeasibility.status} · Overall: {result.feasibility.status}</p>
      <dl><dt>Uplink / downlink minimum available margin</dt><dd>{numeric(result.summary.minimumUplinkMarginDb, 'dB')} / {numeric(result.summary.minimumDownlinkMarginDb, 'dB')}</dd><dt>Total sampled distance / climb</dt><dd>{numeric(result.summary.distanceM / 1000, 'km')} / {numeric(result.summary.climbM, 'm')}</dd><dt>Energy</dt><dd>{result.energyFeasibility.reasons.join(' ') || result.energyFeasibility.status}</dd></dl>
      <ComparisonCards results={results} selected={scenarioIndex} requiredMarginDb={mission.constraints.requiredMarginDb} onSelect={index => { setScenarioIndex(index); onScenario(results[index] ?? null); onInspect(0); }} />
      {result.rfFeasibility.reasons.map((reason) => <p key={reason}>{reason}</p>)}
      {result.constraintViolations.length > 0 && <p>{result.constraintViolations.length} evaluated constraint violations. {result.constraintViolations[0]!.reason}</p>}
      <label>Inspect route sample<input aria-label="Inspect route sample" type="range" min={0} max={result.routeSamples.length - 1} value={sampleIndex} onChange={(e) => onInspect(Number(e.target.value))} /></label>
      {sample && <details open><summary>Point evidence · sample {sampleIndex + 1}</summary>
        <p>{sample.leg} · {(sample.distanceAlongRouteM / 1000).toFixed(2)} km · {sample.position.latitudeDeg.toFixed(6)}°, {sample.position.longitudeDeg.toFixed(6)}° · {sample.altitude.metres.toFixed(1)} m {sample.altitude.datumId}</p>
        {sample.terrainEvidence?.status === 'known' && <p>Local DSM: display {sample.terrainEvidence.displayElevationM.toFixed(1)} m · obstruction {sample.terrainEvidence.obstructionElevationM.toFixed(1)} m · {sample.terrainEvidence.datumId}</p>}
        {sample.clearance.status === 'unknown' ? <p>Unknown clearance: {sample.clearance.reason}</p> : <dl><dt>Obstruction-grid terrain / conservative clearance</dt><dd>{sample.clearance.terrainElevation.metres.toFixed(1)} m / {sample.clearance.terrainClearanceM.toFixed(1)} m</dd><dt>Minimum first-Fresnel clearance</dt><dd>{(sample.clearance.minimumFirstFresnelClearanceFraction * 100).toFixed(1)}% · {sample.clearance.meetsSixtyPercentFresnel ? 'meets' : 'below'} 60%</dd><dt>Limiting obstruction</dt><dd>{sample.clearance.limitingObstruction ? `${sample.clearance.limitingObstruction.elevation.metres.toFixed(1)} m at ${(sample.clearance.limitingObstruction.distanceFromStationM / 1000).toFixed(2)} km from station` : 'Unavailable'}</dd></dl>}
        {(['uplink', 'downlink'] as const).map((direction) => { const link = sample[direction]; return <details key={direction} aria-label={`${direction} link budget`}><summary>{direction} budget</summary>{link ? <dl><dt>Received power / available margin</dt><dd>{link.receivedPowerDbm.toFixed(2)} dBm / {link.availableMarginDb.toFixed(2)} dB</dd><dt>Transmit power / Tx gain / Rx gain</dt><dd>{link.transmitPowerDbm} dBm / {link.transmitGainDbi.toFixed(2)} dBi / {link.receiveGainDbi.toFixed(2)} dBi</dd><dt>Free-space / diffraction</dt><dd>{link.freeSpaceLossDb.toFixed(2)} dB / {link.diffractionLossDb.toFixed(2)} dB</dd><dt>Cable / installation / polarization / RF allowance</dt><dd>{link.cableLossDb} / {link.installationLossDb} / {link.polarizationLossDb} / {link.uncertaintyAllowanceDb} dB</dd><dt>Receiver sensitivity</dt><dd>{link.receiverSensitivityDbm} dBm</dd></dl> : <p>Unavailable because required evidence is missing.</p>}</details>; })}
      </details>}
      <details><summary>Model assumptions</summary>{result.assumptions.map((assumption) => <p key={assumption}>{assumption}</p>)}</details>
    </>}
  </section>;
}
