import type { MissionConfig } from '../contracts/mission';
import type { ScenarioResult } from '../contracts/result';
import { energyPrerequisites } from './profiles';
import { fixedWingPower, GRAVITY_MPS2, REFERENCE_AIR_DENSITY_KG_M3 } from './fixed-wing';
import { multirotorPower } from './multirotor';
import type { ComputedMotion } from '../routing/motion';
export interface EnergyRoutePoint { xM: number; yM: number; altitudeM: number; headingDeg: number; pitchDeg: number; leg: 'outbound' | 'return'; bankDeg?: number; motion?: ComputedMotion }
type Equipment = MissionConfig['equipment'][number];
type Attitude = ScenarioResult['routeSamples'][number]['attitude'];
export interface EnergyEvaluation {
  energy: ScenarioResult['summary']['energy']; durationS: number | null;
  elapsedTimeS: (number | null)[]; attitudes: Attitude[];
  feasibility: ScenarioResult['energyFeasibility']; violations: ScenarioResult['constraintViolations']; assumptions: string[];
}
const CORNER_ANGLE_TOLERANCE_DEG = 1e-5;
const ZERO_SEGMENT_LENGTH_M = 1e-8;
/** Return route-sample indices at which consecutive nonzero 3D manual directions change abruptly. */
export function manualCornerSamples(points: EnergyRoutePoint[]) {
  const corners: number[] = [];
  let previousDirection: { x: number; y: number; z: number } | null = null;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]!, current = points[index]!;
    const x = current.xM - previous.xM, y = current.yM - previous.yM, z = current.altitudeM - previous.altitudeM;
    const length = Math.hypot(x, y, z);
    if (length <= ZERO_SEGMENT_LENGTH_M) continue;
    const direction = { x: x / length, y: y / length, z: z / length };
    if (previousDirection) {
      const crossX = previousDirection.y * direction.z - previousDirection.z * direction.y;
      const crossY = previousDirection.z * direction.x - previousDirection.x * direction.z;
      const crossZ = previousDirection.x * direction.y - previousDirection.y * direction.x;
      const angleDeg = Math.atan2(Math.hypot(crossX, crossY, crossZ), previousDirection.x * direction.x + previousDirection.y * direction.y + previousDirection.z * direction.z) * 180 / Math.PI;
      if (angleDeg > CORNER_ANGLE_TOLERANCE_DEG) corners.push(index - 1);
    }
    previousDirection = direction;
  }
  return corners;
}
const radians = (degrees: number) => degrees * Math.PI / 180;
const heading = (east: number, north: number) => (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
function rotorAttitude(model: NonNullable<Extract<MissionConfig['aircraft'], { kind: 'multirotor' }>['powerModel']>, motion: ComputedMotion, load: { massKg: number; additionalDragAreaM2: number }): Attitude {
  const mass = model.massKg + load.massKg, verticalForce = mass * (GRAVITY_MPS2 + motion.verticalAccelerationMps2);
  const forwardForce = mass * motion.forwardAccelerationMps2 + .5 * REFERENCE_AIR_DENSITY_KG_M3 * motion.airspeedMps ** 2 * load.additionalDragAreaM2;
  const lateralForce = mass * motion.lateralAccelerationMps2;
  return { headingDeg: motion.headingDeg, pitchDeg: -Math.atan2(forwardForce, verticalForce) * 180 / Math.PI, rollDeg: Math.atan2(lateralForce, Math.hypot(verticalForce, forwardForce)) * 180 / Math.PI };
}

export function integrateConstantPowerWh(powerW: number, durationS: number) {
  if (!Number.isFinite(powerW) || powerW < 0 || !Number.isFinite(durationS) || durationS < 0) throw new Error('Power and duration must be finite and nonnegative.');
  const result = powerW * durationS / 3600;
  if (!Number.isFinite(result)) throw new Error('Electrical energy overflows its numerical range.');
  return result;
}
/** Table values include the airborne transmitter and its quiescent/receiver electronics. */
export function radioInputPowerW(direction: Equipment['downlink']) {
  const draw = direction.electricalDraw;
  if (draw.kind === 'efficiency') {
    const result = draw.idlePowerW + 10 ** ((direction.transmitPowerDbm - 30) / 10) / draw.amplifierEfficiency;
    if (!Number.isFinite(result)) throw new Error('Radio electrical draw overflows its numerical range.');
    return result;
  }
  const rows = draw.samples;
  if (rows.some((row, i) => i > 0 && row.outputDbm <= rows[i - 1]!.outputDbm)) throw new Error('Measured radio table must have strictly increasing output powers.');
  if (direction.transmitPowerDbm < rows[0]!.outputDbm || direction.transmitPowerDbm > rows.at(-1)!.outputDbm) throw new Error('Transmit power is outside measured electrical-input table support.');
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (direction.transmitPowerDbm === row.outputDbm) return row.inputW;
    if (direction.transmitPowerDbm < row.outputDbm) { const previous = rows[i - 1]!; return previous.inputW + (row.inputW - previous.inputW) * (direction.transmitPowerDbm - previous.outputDbm) / (row.outputDbm - previous.outputDbm); }
  }
  throw new Error('Radio input power is unavailable.');
}
/** Constant wind is FROM the entered bearing, in east/north/up metres per second. */
export function segmentMotion(a: EnergyRoutePoint, b: EnergyRoutePoint, airspeedMps: number, wind: MissionConfig['wind'], kind: MissionConfig['aircraft']['kind'], maxClimbMps: number) {
  const dx = b.xM - a.xM, dy = b.yM - a.yM, dz = b.altitudeM - a.altitudeM, horizontalM = Math.hypot(dx, dy), distanceM = Math.hypot(horizontalM, dz);
  if (!Number.isFinite(airspeedMps) || airspeedMps <= 0 || !Number.isFinite(wind.speedMps) || wind.speedMps < 0 || !Number.isFinite(wind.fromDirectionDeg) || [dx, dy, dz, maxClimbMps].some(n => !Number.isFinite(n)) || maxClimbMps <= 0) throw new Error('Invalid segment motion inputs.');
  const wx = -wind.speedMps * Math.sin(radians(wind.fromDirectionDeg)), wy = -wind.speedMps * Math.cos(radians(wind.fromDirectionDeg));
  if (distanceM < 1e-8) return { durationS: 0, airspeedMps, climbMps: 0, headingDeg: b.headingDeg, pitchDeg: b.pitchDeg, eastMps: 0, northMps: 0, upMps: 0 };
  if (horizontalM < 1e-8) {
    if (kind === 'fixed-wing') throw new Error('Fixed-wing motion cannot follow a vertical-only segment.');
    const climbMps = Math.sign(dz) * maxClimbMps;
    return { durationS: Math.abs(dz) / maxClimbMps, airspeedMps: wind.speedMps, climbMps, headingDeg: wind.speedMps ? heading(-wx, -wy) : b.headingDeg, pitchDeg: 0, eastMps: 0, northMps: 0, upMps: climbMps };
  }
  const divisor = kind === 'fixed-wing' ? distanceM : horizontalM;
  const ux = dx / divisor, uy = dy / divisor, uz = kind === 'fixed-wing' ? dz / distanceM : 0;
  const alongWind = wx * ux + wy * uy;
  const discriminant = airspeedMps ** 2 - wind.speedMps ** 2 + alongWind ** 2;
  if (discriminant < 0) throw new Error('Wind prevents progress along the requested segment.');
  const groundProgressMps = alongWind + Math.sqrt(discriminant);
  if (groundProgressMps <= 1e-8) throw new Error('Wind prevents positive ground progress.');
  const durationS = divisor / groundProgressMps;
  const eastMps = dx / durationS, northMps = dy / durationS, upMps = dz / durationS;
  const airEast = eastMps - wx, airNorth = northMps - wy;
  const horizontalAir = Math.hypot(airEast, airNorth);
  return { durationS, airspeedMps: kind === 'fixed-wing' ? Math.hypot(horizontalAir, upMps) : horizontalAir, climbMps: upMps, headingDeg: heading(airEast, airNorth), pitchDeg: kind === 'fixed-wing' ? Math.atan2(upMps, horizontalAir) * 180 / Math.PI : 0, eastMps, northMps, upMps, verticalTrackFraction: uz };
}
export function reserveFeasibility(totalWh: number, batteryWh: number, requiredReserveFraction: number): ScenarioResult['energyFeasibility'] {
  if (![totalWh, batteryWh, requiredReserveFraction].every(Number.isFinite) || totalWh < 0 || batteryWh <= 0 || requiredReserveFraction < 0 || requiredReserveFraction > 1) throw new Error('Invalid battery/reserve inputs.');
  const usableWh = batteryWh * (1 - requiredReserveFraction);
  return totalWh <= usableWh + 1e-9 ? { status: 'feasible', reasons: [] } : { status: 'infeasible', reasons: [`Mission energy ${totalWh.toFixed(3)} Wh exceeds usable battery ${usableWh.toFixed(3)} Wh at ${(requiredReserveFraction * 100).toFixed(1)}% reserve.`] };
}
export function evaluateRouteEnergy(mission: MissionConfig, equipment: Equipment, points: EnergyRoutePoint[]): EnergyEvaluation {
  const attitudes = points.map(point => ({ headingDeg: point.headingDeg, pitchDeg: point.pitchDeg, rollDeg: point.bankDeg ?? 0 }));
  const elapsedTimeS: (number | null)[] = points.map(() => null);
  const violations: EnergyEvaluation['violations'] = [];
  const analyticRoute = points.length > 1 && points.slice(1).every(point => point.motion !== undefined);
  if (!analyticRoute) for (const sampleIndex of manualCornerSamples(points)) violations.push({ constraint: 'motion', reason: 'A manual route corner changes three-dimensional travel direction without finite transition geometry; refine the path before accepting it.', sampleIndex });
  const assumptions = [
    'Quasi-steady aircraft power; constant air density 1.225 kg/m³; no descent/braking regeneration.',
    'Only airborne antenna mass/CdA and airborne downlink radio input draw charge the flight battery; radio idle/table input includes receiving electronics.',
    `Aircraft profile ${mission.aircraft.id}/${mission.aircraft.version}: ${mission.aircraft.calibration}. ${mission.aircraft.provenance}`,
    'Straight manual segments use constant configured airspeed; takeoff/landing allowance covers endpoint transients. Sharp corners require motion refinement.',
  ];
  const unavailable = (reasons: string[]): EnergyEvaluation => ({ energy: null, durationS: null, elapsedTimeS: points.map(() => null), attitudes, feasibility: { status: violations.length ? 'infeasible' : 'indeterminate', reasons }, violations, assumptions });
  const prerequisites = energyPrerequisites(mission.aircraft);
  if (mission.assumptions.energyModel.id !== 'aircraft-electrical' || mission.assumptions.energyModel.version !== '1') prerequisites.push('Unsupported energy model identity/version.');
  if (prerequisites.length) return unavailable(prerequisites);
  if (points.length < 2) return unavailable(['At least two route samples are required.']);
  let propulsionWh = 0, durationS = 0, radioW: number;
  try { radioW = radioInputPowerW(equipment.downlink); } catch (reason) { return unavailable([String(reason)]); }
  elapsedTimeS[0] = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!, b = points[index]!;
    const aircraft = mission.aircraft;
    try {
      const model = aircraft.powerModel!;
      const motion = b.motion ?? segmentMotion(a, b, model.cruiseSpeedMps!, mission.wind, aircraft.kind, model.maxClimbMps);
      attitudes[index] = { headingDeg: motion.headingDeg, pitchDeg: motion.pitchDeg, rollDeg: b.bankDeg ?? 0 };
      if (index === 1) attitudes[0] = { ...attitudes[index]! };
      let powerW: number;
      const load = { massKg: equipment.airborneAntenna.massKg, additionalDragAreaM2: equipment.airborneAntenna.additionalDragAreaM2 };
      if (aircraft.kind === 'fixed-wing') powerW = fixedWingPower(aircraft.powerModel!, { airspeedMps: motion.airspeedMps, climbMps: motion.climbMps, bankDeg: b.bankDeg ?? 0 }, load).electricalPowerW;
      else {
        const rotor = multirotorPower(aircraft.powerModel!, { airspeedMps: motion.airspeedMps, climbMps: motion.climbMps, forwardAccelerationMps2: b.motion?.forwardAccelerationMps2 ?? 0, lateralAccelerationMps2: b.motion?.lateralAccelerationMps2 ?? 0, verticalAccelerationMps2: b.motion?.verticalAccelerationMps2 ?? 0 }, load);
        powerW = rotor.electricalPowerW;
        attitudes[index] = b.motion ? rotorAttitude(aircraft.powerModel!, b.motion, load) : { headingDeg: motion.headingDeg, pitchDeg: -rotor.requiredTiltDeg, rollDeg: 0 };
        if (index === 1) attitudes[0] = { ...attitudes[index]! };
      }
      const initial = points[0]!;
      if (index === 1 && initial.motion) attitudes[0] = aircraft.kind === 'fixed-wing' ? { headingDeg: initial.motion.headingDeg, pitchDeg: initial.motion.pitchDeg, rollDeg: initial.bankDeg ?? 0 } : rotorAttitude(aircraft.powerModel!, initial.motion, load);
      propulsionWh += integrateConstantPowerWh(powerW, motion.durationS); durationS += motion.durationS; elapsedTimeS[index] = durationS;
    } catch (reason) {
      const message = String(reason);
      // A table gap is unknown evidence; an evaluated physical limit is infeasible motion.
      if (!message.includes('table') && !message.includes('efficiency')) violations.push({ constraint: 'motion', reason: message, sampleIndex: index });
      return unavailable([message]);
    }
  }
  const avionicsWh = integrateConstantPowerWh(mission.aircraft.avionicsPowerW, durationS), radioWh = integrateConstantPowerWh(radioW, durationS), takeoffLandingWh = mission.aircraft.takeoffLandingEnergyWh;
  const totalWh = propulsionWh + avionicsWh + radioWh + takeoffLandingWh;
  const reserve = reserveFeasibility(totalWh, mission.aircraft.batteryCapacityWh!, mission.constraints.batteryReserveFraction);
  if (reserve.status === 'infeasible') violations.push({ constraint: 'battery-reserve', reason: reserve.reasons[0]!, sampleIndex: null });
  return { energy: { totalWh, propulsionWh, avionicsWh, radioWh, takeoffLandingWh, remainingReserveFraction: 1 - totalWh / mission.aircraft.batteryCapacityWh! }, durationS, elapsedTimeS, attitudes, feasibility: violations.length ? { status: 'infeasible', reasons: [...new Set(violations.map(v => v.reason))] } : reserve, violations, assumptions };
}
