import Delaunator from 'delaunator';
import type { MissionConfig } from '../contracts/mission';
type Antenna = MissionConfig['equipment'][number]['groundAntenna'];
type Attitude = Antenna['mounting'];
export interface DirectionENU { east: number; north: number; up: number }
const radians = (angle: number) => angle * Math.PI / 180;
// Heading clockwise from north, pitch nose-up, roll right-wing-down.
export function intoFrame(direction: DirectionENU, attitude: Attitude): DirectionENU {
  const h = radians(attitude.headingDeg), p = radians(attitude.pitchDeg), r = radians(attitude.rollDeg);
  const forward = Math.cos(h) * direction.north + Math.sin(h) * direction.east;
  const right = Math.cos(h) * direction.east - Math.sin(h) * direction.north;
  const pitchedForward = Math.cos(p) * forward + Math.sin(p) * direction.up;
  const pitchedUp = -Math.sin(p) * forward + Math.cos(p) * direction.up;
  return { north: pitchedForward, east: Math.cos(r) * right - Math.sin(r) * pitchedUp, up: Math.sin(r) * right + Math.cos(r) * pitchedUp };
}
export function directionAngles(direction: DirectionENU) {
  if (![direction.east, direction.north, direction.up].every(Number.isFinite) || Math.hypot(direction.east, direction.north, direction.up) === 0) throw new Error('Antenna ray must be a nonzero finite direction.');
  return { azimuthDeg: (Math.atan2(direction.east, direction.north) * 180 / Math.PI + 360) % 360, elevationDeg: Math.atan2(direction.up, Math.hypot(direction.east, direction.north)) * 180 / Math.PI };
}
type Sampled = Extract<Antenna['gainPattern'], { kind: 'sampled' }>;
const triangulations = new WeakMap<Sampled, { points: { azimuthDeg: number; elevationDeg: number; gainDbi: number }[]; triangles: Uint32Array }>();
export function patternGain(pattern: Antenna['gainPattern'], azimuthDeg: number, elevationDeg: number): number | null {
  if (![azimuthDeg, elevationDeg].every(Number.isFinite)) throw new Error('Pattern angles must be finite.');
  if (pattern.kind === 'isotropic') return pattern.gainDbi;
  const azimuth = (azimuthDeg % 360 + 360) % 360;
  const exact = pattern.samples.find((s) => Math.abs(s.azimuthDeg - azimuth) < 1e-9 && Math.abs(s.elevationDeg - elevationDeg) < 1e-9);
  if (exact) return exact.gainDbi;
  const sameElevation = pattern.samples.every((s) => s.elevationDeg === pattern.samples[0]!.elevationDeg);
  if (sameElevation) {
    if (Math.abs(elevationDeg - pattern.samples[0]!.elevationDeg) > 1e-9) return null;
    const sorted = [...pattern.samples].sort((a, b) => a.azimuthDeg - b.azimuthDeg);
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i]!, b = sorted[(i + 1) % sorted.length]!;
      const right = b.azimuthDeg + (i === sorted.length - 1 ? 360 : 0);
      const query = azimuth < a.azimuthDeg ? azimuth + 360 : azimuth;
      if (query >= a.azimuthDeg && query <= right) return a.gainDbi + (b.gainDbi - a.gainDbi) * (query - a.azimuthDeg) / (right - a.azimuthDeg);
    }
    return null;
  }
  let triangulation = triangulations.get(pattern);
  if (!triangulation) {
    const points = [-360, 0, 360].flatMap((offset) => pattern.samples.map((s) => ({ ...s, azimuthDeg: s.azimuthDeg + offset })));
    triangulation = { points, triangles: Delaunator.from(points, (s) => s.azimuthDeg, (s) => s.elevationDeg).triangles };
    triangulations.set(pattern, triangulation);
  }
  const { points, triangles } = triangulation;
  for (let i = 0; i < triangles.length; i += 3) {
    const a = points[triangles[i]!]!, b = points[triangles[i + 1]!]!, c = points[triangles[i + 2]!]!;
    const determinant = (b.elevationDeg - c.elevationDeg) * (a.azimuthDeg - c.azimuthDeg) + (c.azimuthDeg - b.azimuthDeg) * (a.elevationDeg - c.elevationDeg);
    if (determinant === 0) continue;
    const wa = ((b.elevationDeg - c.elevationDeg) * (azimuth - c.azimuthDeg) + (c.azimuthDeg - b.azimuthDeg) * (elevationDeg - c.elevationDeg)) / determinant;
    const wb = ((c.elevationDeg - a.elevationDeg) * (azimuth - c.azimuthDeg) + (a.azimuthDeg - c.azimuthDeg) * (elevationDeg - c.elevationDeg)) / determinant;
    const wc = 1 - wa - wb;
    if (Math.min(wa, wb, wc) >= -1e-9) return wa * a.gainDbi + wb * b.gainDbi + wc * c.gainDbi;
  }
  return null; // Do not invent gain outside the sampled elevation support.
}
export function antennaGain(antenna: Antenna, ray: DirectionENU, platform: Attitude) {
  const angles = directionAngles(intoFrame(intoFrame(ray, platform), antenna.mounting));
  return patternGain(antenna.gainPattern, angles.azimuthDeg, angles.elevationDeg);
}
export function twoEndGains(equipment: MissionConfig['equipment'][number], stationToAircraft: DirectionENU, aircraftAttitude: Attitude) {
  const ground = antennaGain(equipment.groundAntenna, stationToAircraft, { headingDeg: equipment.groundPointing.azimuthDeg, pitchDeg: equipment.groundPointing.elevationDeg, rollDeg: 0 });
  const airborne = antennaGain(equipment.airborneAntenna, { east: -stationToAircraft.east, north: -stationToAircraft.north, up: -stationToAircraft.up }, aircraftAttitude);
  return { groundGainDbi: ground, airborneGainDbi: airborne };
}
