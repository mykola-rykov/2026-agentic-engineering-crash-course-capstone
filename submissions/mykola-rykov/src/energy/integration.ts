import type { MissionConfig } from '../contracts/mission';
import type { ScenarioResult } from '../contracts/result';
import { energyPrerequisites } from './profiles';
import { fixedWingPower } from './fixed-wing';
import { multirotorPower } from './multirotor';
export interface EnergyRoutePoint { xM: number; yM: number; altitudeM: number; headingDeg: number; pitchDeg: number; leg: 'outbound' | 'return'; bankDeg?: number }
type Equipment = MissionConfig['equipment'][number];
type Attitude = ScenarioResult['routeSamples'][number]['attitude'];
export interface EnergyEvaluation {
  energy: ScenarioResult['summary']['energy']; durationS: number | null;
  elapsedTimeS: (number | null)[]; attitudes: Attitude[];
  feasibility: ScenarioResult['energyFeasibility']; violations: ScenarioResult['constraintViolations']; assumptions: string[];
}
const radians = (degrees: number) => degrees * Math.PI / 180;
const heading = (east: number, north: number) => (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;

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
    const angleChange = Math.abs(((b.headingDeg - a.headingDeg + 540) % 360) - 180);
    if (angleChange > 1e-5 && a.bankDeg === undefined && b.bankDeg === undefined) violations.push({ constraint: 'motion', reason: 'A sharp route corner or turnaround has no finite acceleration/turn geometry; refine the path before accepting it.', sampleIndex: index });
    const aircraft = mission.aircraft;
    try {
      const model = aircraft.powerModel!;
      const motion = segmentMotion(a, b, model.cruiseSpeedMps!, mission.wind, aircraft.kind, model.maxClimbMps);
      attitudes[index] = { headingDeg: motion.headingDeg, pitchDeg: motion.pitchDeg, rollDeg: b.bankDeg ?? 0 };
      if (index === 1) attitudes[0] = { ...attitudes[index]! };
      let powerW: number;
      const load = { massKg: equipment.airborneAntenna.massKg, additionalDragAreaM2: equipment.airborneAntenna.additionalDragAreaM2 };
      if (aircraft.kind === 'fixed-wing') powerW = fixedWingPower(aircraft.powerModel!, { airspeedMps: motion.airspeedMps, climbMps: motion.climbMps, bankDeg: b.bankDeg ?? 0 }, load).electricalPowerW;
      else {
        const rotor = multirotorPower(aircraft.powerModel!, { airspeedMps: motion.airspeedMps, climbMps: motion.climbMps, forwardAccelerationMps2: 0, lateralAccelerationMps2: 0, verticalAccelerationMps2: 0 }, load);
        powerW = rotor.electricalPowerW;
        attitudes[index] = { headingDeg: motion.headingDeg, pitchDeg: -rotor.requiredTiltDeg, rollDeg: 0 };
        if (index === 1) attitudes[0] = { ...attitudes[index]! };
      }
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
