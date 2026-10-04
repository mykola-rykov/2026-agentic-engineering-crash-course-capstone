import type { MissionConfig } from '../contracts/mission';
import type { EnergyRoutePoint } from '../energy/integration';
import { fixedWingPower, GRAVITY_MPS2 } from '../energy/fixed-wing';
import { multirotorPower } from '../energy/multirotor';

export const HORIZONTAL_SPACING_M = 250;
export const VERTICAL_SPACING_M = 50;
export interface MotionState { xM: number; yM: number; altitudeM: number; headingDeg: number }
/** Horizontal arc length parametrization; cubic vertical easing has zero endpoint climb. */
export interface Primitive { start: MotionState; lengthM: number; turnDeg: number; altitudeChangeM: number; leg: 'outbound' | 'return' }
export interface ComputedMotion {
  durationS: number; airspeedMps: number; climbMps: number; headingDeg: number; pitchDeg: number;
  forwardAccelerationMps2: number; lateralAccelerationMps2: number; verticalAccelerationMps2: number;
}
export interface MotionPoint extends EnergyRoutePoint { distanceM: number; bankDeg: number; motion: ComputedMotion }
const rad = (n: number) => n * Math.PI / 180;
const deg = (n: number) => n * 180 / Math.PI;
export const bearing = (x: number, y: number) => (deg(Math.atan2(x, y)) + 360) % 360;
export function primitiveState(p: Primitive, fraction: number): MotionState {
  if (p.lengthM <= 0 || !Number.isFinite(p.lengthM) || !Number.isFinite(p.turnDeg) || !Number.isFinite(p.altitudeChangeM) || fraction < 0 || fraction > 1) throw new Error('Invalid motion primitive.');
  const theta = rad(p.start.headingDeg), delta = rad(p.turnDeg), angle = theta + delta * fraction;
  const xM = p.start.xM + (delta === 0 ? p.lengthM * fraction * Math.sin(theta) : p.lengthM / delta * (Math.cos(theta) - Math.cos(angle)));
  const yM = p.start.yM + (delta === 0 ? p.lengthM * fraction * Math.cos(theta) : p.lengthM / delta * (Math.sin(angle) - Math.sin(theta)));
  return { xM, yM, altitudeM: p.start.altitudeM + p.altitudeChangeM * fraction ** 2 * (3 - 2 * fraction), headingDeg: (p.start.headingDeg + p.turnDeg * fraction + 720) % 360 };
}
function velocity(p: Primitive, t: number, mission: MissionConfig) {
  const state = primitiveState(p, t), theta = rad(state.headingDeg);
  const model = mission.aircraft.powerModel, speed = model?.cruiseSpeedMps;
  if (!model || !speed) throw new Error('Automatic routing requires an aircraft power model and cruise airspeed.');
  const slope = p.altitudeChangeM * 6 * t * (1 - t) / p.lengthM;
  const wx = -mission.wind.speedMps * Math.sin(rad(mission.wind.fromDirectionDeg));
  const wy = -mission.wind.speedMps * Math.cos(rad(mission.wind.fromDirectionDeg));
  const along = wx * Math.sin(theta) + wy * Math.cos(theta);
  const factor = mission.aircraft.kind === 'fixed-wing' ? 1 + slope ** 2 : 1;
  const discriminant = along ** 2 + factor * (speed ** 2 - mission.wind.speedMps ** 2);
  if (discriminant < 0) throw new Error('Wind prevents progress along this motion primitive.');
  const progress = (along + Math.sqrt(discriminant)) / factor;
  if (progress <= 1e-8) throw new Error('Wind prevents positive ground progress.');
  const east = progress * Math.sin(theta) - wx, north = progress * Math.cos(theta) - wy, up = progress * slope;
  return { east, north, up, progress, headingDeg: bearing(east, north), airspeedMps: mission.aircraft.kind === 'fixed-wing' ? Math.hypot(east, north, up) : Math.hypot(east, north), pitchDeg: mission.aircraft.kind === 'fixed-wing' ? deg(Math.atan2(up, Math.hypot(east, north))) : 0 };
}
/** Differentiation of the analytic curve, independent of terrain/search node spacing. */
export function samplePrimitive(p: Primitive, mission: MissionConfig, spacingM: number): MotionPoint[] {
  if (!Number.isFinite(spacingM) || spacingM <= 0) throw new Error('Motion sampling spacing must be positive.');
  const intervals = Math.max(2, Math.ceil(Math.hypot(p.lengthM, 1.5 * p.altitudeChangeM) / spacingM), Math.ceil(Math.abs(p.turnDeg) / 5));
  if (intervals > 20_000) throw new Error('Motion primitive exceeds the bounded sample count.');
  const points: MotionPoint[] = [];
  let distanceM = 0;
  for (let i = 0; i <= intervals; i++) {
    const t = i / intervals, state = primitiveState(p, t), v = velocity(p, t, mission);
    const epsilon = 1e-5, left = Math.max(0, t - epsilon), right = Math.min(1, t + epsilon);
    const a = velocity(p, left, mission), b = velocity(p, right, mission);
    const dt = (right - left) * p.lengthM / v.progress;
    const ax = (b.east - a.east) / dt, ay = (b.north - a.north) / dt, az = (b.up - a.up) / dt;
    const yaw = rad(v.headingDeg), forward = ax * Math.sin(yaw) + ay * Math.cos(yaw), lateral = ax * Math.cos(yaw) - ay * Math.sin(yaw);
    const bankDeg = mission.aircraft.kind === 'fixed-wing' ? deg(Math.atan2(lateral, GRAVITY_MPS2)) : 0;
    const previous = points.at(-1);
    const previousVelocity = i ? velocity(p, (i - 1) / intervals, mission) : v;
    const durationS = i ? p.lengthM / intervals * 2 / (v.progress + previousVelocity.progress) : 0;
    if (previous) {
      const speed = (f: number) => Math.hypot(1, p.altitudeChangeM * 6 * f * (1 - f) / p.lengthM);
      distanceM += p.lengthM / intervals / 6 * (speed((i - 1) / intervals) + 4 * speed((i - .5) / intervals) + speed(t));
    }
    points.push({ ...state, distanceM, pitchDeg: v.pitchDeg, bankDeg, leg: p.leg, motion: { durationS, airspeedMps: v.airspeedMps, climbMps: v.up, headingDeg: v.headingDeg, pitchDeg: v.pitchDeg, forwardAccelerationMps2: forward, lateralAccelerationMps2: lateral, verticalAccelerationMps2: az } });
  }
  return points;
}
export function verifyMotion(points: MotionPoint[], mission: MissionConfig, equipment: MissionConfig['equipment'][number]) {
  const load = { massKg: equipment.airborneAntenna.massKg, additionalDragAreaM2: equipment.airborneAntenna.additionalDragAreaM2 };
  for (const point of points) {
    if (mission.aircraft.kind === 'fixed-wing') fixedWingPower(mission.aircraft.powerModel!, { ...point.motion, bankDeg: point.bankDeg }, load);
    else multirotorPower(mission.aircraft.powerModel!, point.motion, load);
  }
}
/** Lazy heading graph: endpoints retain exact geometry; quantization only merges search buckets. */
export function coarsePrimitives(state: MotionState, leg: Primitive['leg']): Primitive[] {
  const primitives: Primitive[] = [];
  for (const lengthM of [HORIZONTAL_SPACING_M, 2 * HORIZONTAL_SPACING_M, 3 * HORIZONTAL_SPACING_M])
    for (const turnDeg of [-45, -22.5, 0, 22.5, 45])
      for (const altitudeChangeM of [-VERTICAL_SPACING_M, 0, VERTICAL_SPACING_M])
        primitives.push({ start: state, lengthM, turnDeg, altitudeChangeM, leg });
  return primitives;
}
export function motionBucket(state: MotionState, stage: number) {
  return `${stage}/${Math.round(state.xM / HORIZONTAL_SPACING_M)}/${Math.round(state.yM / HORIZONTAL_SPACING_M)}/${Math.round(state.altitudeM / VERTICAL_SPACING_M)}/${Math.round(state.headingDeg / 22.5) % 16}`;
}
