import { useState } from 'react';
import type { MissionConfig } from '../contracts/mission';
import { parseMission } from '../contracts/mission';
import type { TerrainPackageManifest } from '../contracts/terrain';
import { exportMission, importMission, requiredInputs } from './files';
interface Props { mission: MissionConfig; terrain: TerrainPackageManifest; onChange: (mission: MissionConfig) => void }
function NumberField({ label, value, onChange, min, max }: { label: string; value: number | null; onChange: (n: number | null) => void; min?: number; max?: number }) {
  return <label>{label}<input type="number" step="any" value={value ?? ''} min={min} max={max} onChange={(e) => onChange(e.target.value === '' ? null : e.target.valueAsNumber)} /></label>;
}
export default function Configuration({ mission, terrain, onChange }: Props) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const equipment = mission.equipment[0]!;
  const update = (next: MissionConfig) => { onChange(next); setError(null); };
  const radio = (direction: 'uplink' | 'downlink', field: 'transmitPowerDbm' | 'receiverSensitivityDbm', value: number) => update({ ...mission, equipment: mission.equipment.map((item, index) => index === 0 ? { ...item, [direction]: { ...item[direction], [field]: value } } : item) });
  const constraints = (field: 'requiredMarginDb' | 'batteryReserveFraction' | 'minimumTerrainClearanceM' | 'corridorWidthM', value: number | null) => update({ ...mission, constraints: { ...mission.constraints, [field]: value === null && field !== 'minimumTerrainClearanceM' ? NaN : value } });
  const altitude = (field: 'minimumAltitude' | 'maximumAltitude', value: number | null) => update({ ...mission, constraints: { ...mission.constraints, [field]: value === null ? null : { metres: value, reference: 'datum', datumId: terrain.verticalDatum.id } } });
  function save() {
    try {
      const url = URL.createObjectURL(new Blob([exportMission(mission)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `${mission.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setError(null);
    } catch (reason) { setError(String(reason)); }
  }
  const missing = requiredInputs(mission);
  return <>
    <details><summary>Aircraft, radio and constraints</summary>
      <p>Aircraft and isotropic antenna examples are illustrative and uncalibrated. Configure measured values using the complete mission editor below.</p>
      <label>Aircraft type<select aria-label="Aircraft type" value={mission.aircraft.kind} onChange={(e) => update({ ...mission, aircraft: { ...mission.aircraft, kind: e.target.value as 'fixed-wing' | 'multirotor', powerModel: null } })}><option value="fixed-wing">Fixed-wing</option><option value="multirotor">Multirotor</option></select></label>
      <NumberField label="Battery capacity (Wh)" value={mission.aircraft.batteryCapacityWh} min={.001} onChange={(batteryCapacityWh) => update({ ...mission, aircraft: { ...mission.aircraft, batteryCapacityWh } })} />
      <NumberField label="Frequency (MHz)" value={mission.frequencyHz / 1e6} min={100} max={6000} onChange={(n) => update({ ...mission, frequencyHz: (n ?? NaN) * 1e6 })} />
      {(['uplink', 'downlink'] as const).map((direction) => <fieldset key={direction}><legend>{direction === 'uplink' ? 'Uplink · ground → aircraft' : 'Downlink · aircraft → ground'}</legend><NumberField label={`${direction} transmit power (dBm)`} value={equipment[direction].transmitPowerDbm} onChange={(n) => radio(direction, 'transmitPowerDbm', n ?? NaN)} /><NumberField label={`${direction} receiver sensitivity (dBm)`} value={equipment[direction].receiverSensitivityDbm} onChange={(n) => radio(direction, 'receiverSensitivityDbm', n ?? NaN)} /></fieldset>)}
      <NumberField label="Ground station height above DSM (m)" value={mission.groundAntennaHeightAboveSurfaceM} min={0} onChange={(n) => update({ ...mission, groundAntennaHeightAboveSurfaceM: n ?? NaN })} />
      {(['azimuthDeg', 'elevationDeg'] as const).map((field) => <NumberField key={field} label={`Fixed ground ${field === 'azimuthDeg' ? 'azimuth' : 'elevation'} (°)`} value={equipment.groundPointing[field]} onChange={(n) => update({ ...mission, equipment: mission.equipment.map((item, index) => index === 0 ? { ...item, groundPointing: { ...item.groundPointing, [field]: n ?? NaN } } : item) })} />)}
      <NumberField label="Required two-way margin (dB)" value={mission.constraints.requiredMarginDb} min={0} onChange={(n) => constraints('requiredMarginDb', n)} />
      <NumberField label="Battery reserve (%)" value={mission.constraints.batteryReserveFraction * 100} min={0} max={100} onChange={(n) => constraints('batteryReserveFraction', (n ?? NaN) / 100)} />
      <NumberField label={`Minimum altitude (m above ${terrain.verticalDatum.id}) · required`} value={mission.constraints.minimumAltitude?.metres ?? null} onChange={(n) => altitude('minimumAltitude', n)} />
      <NumberField label={`Maximum altitude (m above ${terrain.verticalDatum.id}) · required`} value={mission.constraints.maximumAltitude?.metres ?? null} onChange={(n) => altitude('maximumAltitude', n)} />
      <NumberField label="Minimum DSM clearance (m) · required" value={mission.constraints.minimumTerrainClearanceM} min={0} onChange={(n) => constraints('minimumTerrainClearanceM', n)} />
      <NumberField label="Terrain height uncertainty (m)" value={mission.assumptions.terrainHeightUncertaintyM} min={0} onChange={(n) => update({ ...mission, assumptions: { ...mission.assumptions, terrainHeightUncertaintyM: n ?? NaN } })} />
      <NumberField label="RF loss allowance (dB)" value={mission.assumptions.rfLossAllowanceDb} min={0} onChange={(n) => update({ ...mission, assumptions: { ...mission.assumptions, rfLossAllowanceDb: n ?? NaN } })} />
      <NumberField label="Effective Earth radius factor" value={mission.assumptions.effectiveEarthRadiusFactor} min={.001} onChange={(n) => update({ ...mission, assumptions: { ...mission.assumptions, effectiveEarthRadiusFactor: n ?? NaN } })} />
      <NumberField label="Wind speed (m/s)" value={mission.wind.speedMps} min={0} onChange={(n) => update({ ...mission, wind: { ...mission.wind, speedMps: n ?? NaN } })} />
      <NumberField label="Wind from direction (°)" value={mission.wind.fromDirectionDeg} min={0} max={360} onChange={(n) => update({ ...mission, wind: { ...mission.wind, fromDirectionDeg: n ?? NaN } })} />
    </details>
    {missing.length > 0 && <p>Required before routing: {missing.join(', ')}.</p>}
    <details><summary>Complete mission configuration and files</summary>
      <p>Edit aircraft power models, antenna patterns/polarization/mounting/mass/drag, radio modes/losses/electrical draw, and equipment combinations in this versioned configuration. Values carry units in field names.</p>
      <button onClick={() => { try { setDraft(exportMission(mission)); setError(null); } catch (reason) { setError(String(reason)); } }}>Load configuration into editor</button>
      <label>Mission JSON<textarea aria-label="Mission JSON" rows={16} value={draft} onChange={(e) => setDraft(e.target.value)} /></label>
      <button onClick={() => { try { const next = importMission(draft, terrain); update(parseMission(next)); } catch (reason) { setError(String(reason)); } }}>Apply configuration</button>
      <label>Import mission JSON<input type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void file.text().then((text) => { try { update(importMission(text, terrain)); } catch (reason) { setError(String(reason)); } }).catch((reason: unknown) => setError(String(reason))); e.target.value = ''; }} /></label>
      <button onClick={save}>Export mission JSON</button>
    </details>
    {error && <p role="alert">{error}</p>}
  </>;
}
