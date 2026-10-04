import { useEffect, useState } from 'react';
import type { MissionConfig } from '../contracts/mission';
import type { TerrainStore } from '../terrain/store';
import { createProjection, resolveAltitude } from '../terrain/coordinates';
import { sampleTerrain } from '../terrain/sampling';
import { accountDistance, launchCoverage } from './geometry';
import { missionCorridor } from '../routing/corridor';
type Point = MissionConfig['launch'];
interface Props { mission: MissionConfig; store: TerrainStore; onChange: (mission: MissionConfig) => void }
function PointFields({ name, point, onChange }: { name: string; point: Point; onChange: (p: Point) => void }) {
  return <fieldset><legend>{name}</legend>
    <label>{name} latitude<input type="number" min="-90" max="90" step="any" value={point.position.latitudeDeg} onChange={(e) => onChange({ ...point, position: { ...point.position, latitudeDeg: e.target.valueAsNumber } })} /></label>
    <label>{name} longitude<input type="number" min="-180" max="180" step="any" value={point.position.longitudeDeg} onChange={(e) => onChange({ ...point, position: { ...point.position, longitudeDeg: e.target.valueAsNumber } })} /></label>
    <label>{name} altitude (m)<input type="number" step="any" value={point.altitude.metres} onChange={(e) => onChange({ ...point, altitude: { ...point.altitude, metres: e.target.valueAsNumber } })} /></label>
    <label>Altitude reference<select value={point.altitude.reference} onChange={(e) => onChange({ ...point, altitude: { ...point.altitude, reference: e.target.value as 'datum' | 'above-dsm' } })}><option value="above-dsm">Above DSM surface</option><option value="datum">Above {point.altitude.datumId}</option></select></label>
  </fieldset>;
}
export default function Editor({ mission, store, onChange }: Props) {
  const [distance, setDistance] = useState<ReturnType<typeof accountDistance> | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    <PointFields name="Launch" point={mission.launch} onChange={(launch) => onChange({ ...mission, launch })} />
    <PointFields name="Destination" point={mission.destination} onChange={(destination) => onChange({ ...mission, destination })} />
    {mission.waypoints.map((point, index) => <div key={index}><PointFields name={`Waypoint ${index + 1}`} point={point} onChange={(p) => onChange({ ...mission, waypoints: mission.waypoints.map((value, i) => i === index ? p : value) })} /><button onClick={() => onChange({ ...mission, waypoints: mission.waypoints.filter((_, i) => i !== index) })}>Remove waypoint {index + 1}</button></div>)}
    <button onClick={() => onChange({ ...mission, waypoints: [...mission.waypoints, structuredClone(mission.destination)] })}>Add waypoint</button>
    <label>Flight mode<select aria-label="Flight mode" value={mission.flightMode} onChange={(e) => onChange({ ...mission, flightMode: e.target.value as MissionConfig['flightMode'] })}><option value="one-way">One-way</option><option value="return">Return along waypoints</option></select></label>
    <label>Total distance limit (km)<input type="number" min=".001" max="100" step="any" value={mission.totalDistanceLimitM / 1000} onChange={(e) => onChange({ ...mission, totalDistanceLimitM: e.target.valueAsNumber * 1000 })} /></label>
    <p>One fixed ground station at launch · {mission.groundAntennaHeightAboveSurfaceM} m above local DSM.</p>
    {corridor && <p data-testid="search-corridor">Search corridor {(corridor.widthM / 1000).toFixed(2)} km wide · clipped to {(corridor.bounds.minXM / 1000).toFixed(2)}–{(corridor.bounds.maxXM / 1000).toFixed(2)} km easting and {(corridor.bounds.minYM / 1000).toFixed(2)}–{(corridor.bounds.maxYM / 1000).toFixed(2)} km northing. Valid terrain is required along the route and every radio ray.</p>}
    {error && <p role="alert">{error}</p>}
    {distance && <p data-testid="mission-distance">Outbound {(distance.outboundM / 1000).toFixed(2)} km · return {(distance.inboundM / 1000).toFixed(2)} km · total {(distance.totalM / 1000).toFixed(2)} km{!distance.complete && ' (horizontal lower bound; terrain height missing)'}{distance.exceedsLimit && ' · Distance limit exceeded'}</p>}
    {coverage?.limited && <p data-testid="edge-coverage">{coverage.inside ? `Limited coverage: nearest package edge ${(coverage.edgeDistanceM / 1000).toFixed(2)} km from launch.` : 'Launch is outside regional coverage.'} Station-to-aircraft paths must remain inside valid terrain.</p>}
  </details>;
}
