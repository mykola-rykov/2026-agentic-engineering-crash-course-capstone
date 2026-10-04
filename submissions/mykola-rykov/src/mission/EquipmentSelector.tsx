import { useState } from 'react';
import type { MissionConfig } from '../contracts/mission';
import { parseMission } from '../contracts/mission';
import { enumerateCombinations, parsePowerSelection } from './combinations';
interface Props { mission: MissionConfig; onChange: (mission: MissionConfig) => void }
const unique = <T,>(items: T[], key: (item: T) => string) => [...new Map(items.map(item => [key(item), item])).values()];
export default function EquipmentSelector({ mission, onChange }: Props) {
  const [catalog, setCatalog] = useState(() => mission.equipment);
  const [groundSelection, setGroundSelection] = useState<string[] | null>(null), [airSelection, setAirSelection] = useState<string[] | null>(null);
  const [upPowers, setUpPowers] = useState(() => String(mission.equipment[0]!.uplink.transmitPowerDbm));
  const [downPowers, setDownPowers] = useState(() => String(mission.equipment[0]!.downlink.transmitPowerDbm));
  const [error, setError] = useState<string | null>(null);
  const available = unique([...catalog, ...mission.equipment], item => JSON.stringify([item.groundAntenna.id, item.groundPointing, item.airborneAntenna.id]));
  const grounds = unique(available.map(item => ({ groundAntenna: item.groundAntenna, groundPointing: item.groundPointing })), item => JSON.stringify([item.groundAntenna.id, item.groundPointing]));
  const airborne = unique(available.map(item => item.airborneAntenna), item => item.id);
  const groundKey = (item: typeof grounds[number]) => JSON.stringify([item.groundAntenna.id, item.groundPointing]);
  const groundKeys = groundSelection ?? grounds.map(groundKey), airKeys = airSelection ?? airborne.map(item => item.id);
  const toggle = (values: string[], key: string) => values.includes(key) ? values.filter(value => value !== key) : [...values, key];
  function apply() {
    try {
      const equipment = enumerateCombinations(mission.equipment[0]!, { ground: grounds.filter(item => groundKeys.includes(groundKey(item))), airborne: airborne.filter(item => airKeys.includes(item.id)), uplinkPowersDbm: parsePowerSelection(upPowers), downlinkPowersDbm: parsePowerSelection(downPowers) });
      const next = parseMission({ ...mission, equipment });
      setCatalog(available); onChange(next); setError(null);
    } catch (reason) { setError(String(reason)); }
  }
  return <details><summary>Equipment combinations</summary>
    <p>Select antennas from the mission's editable profiles and comma-separated transmit powers. Combinations share the first scenario's radio modes, losses and electrical models. Add measured patterns in the complete mission editor.</p>
    <fieldset><legend>Ground antennas and fixed pointing</legend>{grounds.map(item => <label className="checkbox-label" key={groundKey(item)}><input type="checkbox" checked={groundKeys.includes(groundKey(item))} onChange={() => setGroundSelection(toggle(groundKeys, groundKey(item)))} />{item.groundAntenna.name} · {item.groundPointing.azimuthDeg}° / {item.groundPointing.elevationDeg}° · {item.groundAntenna.calibration}</label>)}</fieldset>
    <fieldset><legend>Airborne antennas</legend>{airborne.map(item => <label className="checkbox-label" key={item.id}><input type="checkbox" checked={airKeys.includes(item.id)} onChange={() => setAirSelection(toggle(airKeys, item.id))} />{item.name} · {item.calibration}</label>)}</fieldset>
    <label>Selected uplink powers (dBm)<input value={upPowers} onChange={event => setUpPowers(event.target.value)} /></label>
    <label>Selected downlink powers (dBm)<input value={downPowers} onChange={event => setDownPowers(event.target.value)} /></label>
    <button onClick={apply}>Use selected combinations</button>
    <p>{mission.equipment.length} selected equipment combinations. Powers and gains are analysed independently.</p>
    {error && <p role="alert">{error}</p>}
  </details>;
}
