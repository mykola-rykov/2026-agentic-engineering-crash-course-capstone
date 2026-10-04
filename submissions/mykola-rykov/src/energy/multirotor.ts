import type { MissionConfig } from '../contracts/mission';
import { GRAVITY_MPS2, REFERENCE_AIR_DENSITY_KG_M3 } from './fixed-wing';
import type { AerodynamicLoad } from './fixed-wing';
export type MultirotorPowerModel = NonNullable<Extract<MissionConfig['aircraft'], { kind: 'multirotor' }>['powerModel']>;
export interface MultirotorMotion {
  airspeedMps: number; climbMps: number;
  forwardAccelerationMps2: number; lateralAccelerationMps2: number; verticalAccelerationMps2: number;
}
export function multirotorTablePowerW(model: MultirotorPowerModel, airspeedMps: number) {
  if (!Number.isFinite(airspeedMps) || airspeedMps < 0) throw new Error('Multirotor airspeed must be finite and nonnegative.');
  const samples = model.powerByAirspeed;
  if (samples.length < 2 || samples.some((s, i) => !Number.isFinite(s.airspeedMps) || !Number.isFinite(s.powerW) || s.airspeedMps < 0 || s.powerW <= 0 || (i > 0 && s.airspeedMps <= samples[i - 1]!.airspeedMps))) throw new Error('Multirotor power table requires ordered finite speed/power samples.');
  if (samples[0]!.airspeedMps === 0 && Math.abs(samples[0]!.powerW - model.hoverPowerW) > 1e-6) throw new Error('Zero-speed power must match hover power.');
  if (airspeedMps === 0) return model.hoverPowerW;
  const maximum = samples.at(-1)!;
  if (airspeedMps > maximum.airspeedMps) {
    if (airspeedMps - maximum.airspeedMps <= Math.max(1, maximum.airspeedMps) * 1e-12) return maximum.powerW;
    throw new Error('Multirotor airspeed exceeds calibrated power-table support.');
  }
  let previous = { airspeedMps: 0, powerW: model.hoverPowerW };
  for (const sample of samples) {
    if (sample.airspeedMps === airspeedMps) return sample.powerW;
    if (sample.airspeedMps > airspeedMps) return previous.powerW + (sample.powerW - previous.powerW) * (airspeedMps - previous.airspeedMps) / (sample.airspeedMps - previous.airspeedMps);
    previous = sample;
  }
  throw new Error('Multirotor speed is outside the power table.');
}
export function multirotorPower(model: MultirotorPowerModel, motion: MultirotorMotion, load: AerodynamicLoad = { massKg: 0, additionalDragAreaM2: 0 }) {
  const numbers = [model.referenceMassKg, model.massKg, model.hoverPowerW, model.massCorrectionExponent, model.climbPowerWPerMps, model.maxClimbMps, model.maxAccelerationMps2, model.maxTiltDeg, ...Object.values(motion), ...Object.values(load)];
  if (numbers.some((n) => !Number.isFinite(n))) throw new Error('Multirotor inputs must be finite.');
  if (model.referenceMassKg <= 0 || model.massKg <= 0 || model.hoverPowerW <= 0 || model.massCorrectionExponent < 0 || model.climbPowerWPerMps < 0 || model.maxClimbMps <= 0 || model.maxAccelerationMps2 <= 0 || model.maxTiltDeg <= 0 || model.maxTiltDeg >= 90 || load.massKg < 0 || load.additionalDragAreaM2 < 0) throw new Error('Invalid multirotor model or equipment load.');
  if (Math.abs(motion.climbMps) > model.maxClimbMps) throw new Error('Multirotor climb/descent exceeds the configured limit.');
  const acceleration = Math.hypot(motion.forwardAccelerationMps2, motion.lateralAccelerationMps2, motion.verticalAccelerationMps2);
  if (acceleration > model.maxAccelerationMps2 + 1e-10) throw new Error('Multirotor acceleration exceeds the configured limit.');
  const massKg = model.massKg + load.massKg, massRatio = massKg / model.referenceMassKg;
  const equipmentDragN = .5 * REFERENCE_AIR_DENSITY_KG_M3 * motion.airspeedMps ** 2 * load.additionalDragAreaM2;
  const verticalForceN = massKg * (GRAVITY_MPS2 + motion.verticalAccelerationMps2);
  if (verticalForceN <= 0) throw new Error('Multirotor motion requires unsupported nonpositive upward thrust.');
  const requiredTiltDeg = Math.atan2(Math.hypot(massKg * motion.forwardAccelerationMps2 + equipmentDragN, massKg * motion.lateralAccelerationMps2), verticalForceN) * 180 / Math.PI;
  if (requiredTiltDeg > model.maxTiltDeg + 1e-10) throw new Error('Multirotor tilt exceeds the configured limit.');
  const baseElectricalPowerW = multirotorTablePowerW(model, motion.airspeedMps) * massRatio ** model.massCorrectionExponent;
  const climbPowerW = model.climbPowerWPerMps * Math.max(0, motion.climbMps) * massRatio;
  if (load.additionalDragAreaM2 > 0 && (model.propulsiveEfficiency === null || !Number.isFinite(model.propulsiveEfficiency) || model.propulsiveEfficiency <= 0 || model.propulsiveEfficiency > 1)) throw new Error('Added multirotor drag requires a positive propulsive efficiency no greater than one.');
  const equipmentDragPowerW = equipmentDragN === 0 ? 0 : equipmentDragN * motion.airspeedMps / model.propulsiveEfficiency!;
  // Positive kinetic work is a conservative addition; braking/descent never regenerate energy.
  const positiveAccelerationWorkW = massKg * Math.max(0, motion.forwardAccelerationMps2 * motion.airspeedMps + motion.verticalAccelerationMps2 * motion.climbMps);
  if (positiveAccelerationWorkW > 0 && (model.propulsiveEfficiency === null || !Number.isFinite(model.propulsiveEfficiency) || model.propulsiveEfficiency <= 0 || model.propulsiveEfficiency > 1)) throw new Error('Acceleration work requires a valid multirotor propulsive efficiency.');
  const accelerationPowerW = positiveAccelerationWorkW === 0 ? 0 : positiveAccelerationWorkW / model.propulsiveEfficiency!;
  const electricalPowerW = baseElectricalPowerW + climbPowerW + equipmentDragPowerW + accelerationPowerW;
  if (!Number.isFinite(electricalPowerW)) throw new Error('Multirotor power overflows its numerical range.');
  return { electricalPowerW, baseElectricalPowerW, climbPowerW, equipmentDragPowerW, accelerationPowerW, requiredTiltDeg, massRatio };
}
