import { useEffect, useRef, useState } from 'react';
import type { MissionConfig } from '../contracts/mission';
import type { TerrainStore } from '../terrain/store';
import { createProjection, resolveAltitude } from '../terrain/coordinates';
import { sampleTerrain } from '../terrain/sampling';
import { accountDistance, launchCoverage } from './geometry';
import { missionCorridor } from '../routing/corridor';
type Point = MissionConfig['launch'];
interface Props { mission: MissionConfig; store: TerrainStore; onCoordinatesValid: (id: string, valid: boolean) => void; onChange: (mission: MissionConfig) => void }
function CoordinateField({ id, label, value, minimum, maximum, onValid, onChange }: { id: string; label: string; value: number; minimum: number; maximum: number; onValid: (id: string, valid: boolean) => void; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const lastCommitted = useRef(value);
  const errorId = `${id}-error`;
  useEffect(() => { onValid(id, true); }, [id, onValid]);
  useEffect(() => {
    if (value !== lastCommitted.current) { lastCommitted.current = value; setDraft(String(value)); }
  }, [value]);
  const trimmed = draft.trim();
  const parsed = trimmed !== '' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed) ? Number(trimmed) : NaN;
  const valid = Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum;
  return <label>{label}<input aria-label={label} type="text" inputMode="decimal" value={draft} aria-invalid={!valid} aria-describedby={!valid ? errorId : undefined} onChange={(event) => {
    const next = event.target.value; setDraft(next);
    const text = next.trim(), number = text !== '' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) ? Number(text) : NaN;
    const accepted = Number.isFinite(number) && number >= minimum && number <= maximum;
    onValid(id, accepted);
    if (accepted) { lastCommitted.current = number; onChange(number); }
  }} />{!valid && <span id={errorId} role="alert">Enter a number from {minimum} to {maximum}.</span>}</label>;
}
function PointFields({ id, name, point, onValid, onChange }: { id: string; name: string; point: Point; onValid: (id: string, valid: boolean) => void; onChange: (p: Point) => void }) {
  return <fieldset><legend>{name}</legend>
    <CoordinateField id={`${id}-latitude`} label={`${name} latitude`} value={point.position.latitudeDeg} minimum={-90} maximum={90} onValid={onValid} onChange={(latitudeDeg) => onChange({ ...point, position: { ...point.position, latitudeDeg } })} />
    <CoordinateField id={`${id}-longitude`} label={`${name} longitude`} value={point.position.longitudeDeg} minimum={-180} maximum={180} onValid={onValid} onChange={(longitudeDeg) => onChange({ ...point, position: { ...point.position, longitudeDeg } })} />
    <label>{name} altitude (m)<input type="number" step="any" value={point.altitude.metres} onChange={(e) => onChange({ ...point, altitude: { ...point.altitude, metres: e.target.valueAsNumber } })} /></label>
    <label>Altitude reference<select value={point.altitude.reference} onChange={(e) => onChange({ ...point, altitude: { ...point.altitude, reference: e.target.value as 'datum' | 'above-dsm' } })}><option value="above-dsm">Above DSM surface</option><option value="datum">Above {point.altitude.datumId}</option></select></label>
  </fieldset>;
}
export default function Editor({ mission, store, onCoordinatesValid, onChange }: Props) {
  const [distance, setDistance] = useState<ReturnType<typeof accountDistance> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waypointIds, setWaypointIds] = useState(() => mission.waypoints.map(() => crypto.randomUUID()));
  useEffect(() => {
    let live = true;
    void (async () => {
      const projection = createProjection(store.manifest);
      const points = await Promise.all([mission.launch, ...mission.waypoints, mission.destination].map(async (point) => {
        const projected = projection.forward(point.position);
        const sample = point.altitude.reference === 'above-dsm' ? await sampleTerrain(store.manifest, (l, c, r) => store.get(l, c, r), projected) : null;
        const altitudeM = resolveAltitude(point.altitude, store.manifest.verticalDatum.id, sample?.status === 'known' ? sample.displayHeightM : null);
        return { ...projected, altitudeM };
      }));
      if (live) { setDistance(accountDistance(points, mission.flightMode, mission.totalDistanceLimitM)); setError(null); }
    })().catch((reason: unknown) => { if (live) { setError(String(reason)); setDistance(null); } });
    return () => { live = false; };
  }, [mission, store]);
  let coverage: ReturnType<typeof launchCoverage> | null = null;
  let corridor: ReturnType<typeof missionCorridor> | null = null;
  try { coverage = launchCoverage(store.manifest, mission); } catch { /* Invalid coordinate is shown by the distance effect. */ }
  try { corridor = missionCorridor(mission, store.manifest); } catch { /* Invalid geometry is shown by existing mission validation. */ }
  return <details open className="mission-editor"><summary>Mission geometry</summary>
    <PointFields id="launch" name="Launch" point={mission.launch} onValid={onCoordinatesValid} onChange={(launch) => onChange({ ...mission, launch })} />
    <PointFields id="destination" name="Destination" point={mission.destination} onValid={onCoordinatesValid} onChange={(destination) => onChange({ ...mission, destination })} />
    {mission.waypoints.map((point, index) => { const id = waypointIds[index] ?? `pending-${index}`; return <div key={id}><PointFields id={id} name={`Waypoint ${index + 1}`} point={point} onValid={onCoordinatesValid} onChange={(p) => onChange({ ...mission, waypoints: mission.waypoints.map((value, i) => i === index ? p : value) })} /><button onClick={() => { onCoordinatesValid(`${id}-latitude`, true); onCoordinatesValid(`${id}-longitude`, true); setWaypointIds((ids) => ids.filter((_, i) => i !== index)); onChange({ ...mission, waypoints: mission.waypoints.filter((_, i) => i !== index) }); }}>Remove waypoint {index + 1}</button></div>; })}
    <button onClick={() => { setWaypointIds((ids) => [...ids, crypto.randomUUID()]); onChange({ ...mission, waypoints: [...mission.waypoints, structuredClone(mission.destination)] }); }}>Add waypoint</button>
    <label>Flight mode<select aria-label="Flight mode" value={mission.flightMode} onChange={(e) => onChange({ ...mission, flightMode: e.target.value as MissionConfig['flightMode'] })}><option value="one-way">One-way</option><option value="return">Return along waypoints</option></select></label>
    <label>Total distance limit (km)<input type="number" min=".001" max="100" step="any" value={mission.totalDistanceLimitM / 1000} onChange={(e) => onChange({ ...mission, totalDistanceLimitM: e.target.valueAsNumber * 1000 })} /></label>
    <p>One fixed ground station at launch · {mission.groundAntennaHeightAboveSurfaceM} m above local DSM.</p>
    {corridor && <p data-testid="search-corridor">Search corridor {(corridor.widthM / 1000).toFixed(2)} km wide · clipped to {(corridor.bounds.minXM / 1000).toFixed(2)}–{(corridor.bounds.maxXM / 1000).toFixed(2)} km easting and {(corridor.bounds.minYM / 1000).toFixed(2)}–{(corridor.bounds.maxYM / 1000).toFixed(2)} km northing. Valid terrain is required along the route and every radio ray.</p>}
    {error && <p role="alert">{error}</p>}
    {distance && <p data-testid="mission-distance">Outbound {(distance.outboundM / 1000).toFixed(2)} km · return {(distance.inboundM / 1000).toFixed(2)} km · total {(distance.totalM / 1000).toFixed(2)} km{!distance.complete && ' (horizontal lower bound; terrain height missing)'}{distance.exceedsLimit && ' · Distance limit exceeded'}</p>}
    {coverage?.limited && <p data-testid="edge-coverage">{coverage.inside ? `Limited coverage: nearest package edge ${(coverage.edgeDistanceM / 1000).toFixed(2)} km from launch.` : 'Launch is outside regional coverage.'} Station-to-aircraft paths must remain inside valid terrain.</p>}
  </details>;
}
