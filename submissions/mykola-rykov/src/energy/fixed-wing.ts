import type { MissionConfig } from '../contracts/mission';

export type FixedWingPowerModel = NonNullable<Extract<MissionConfig['aircraft'], { kind: 'fixed-wing' }>['powerModel']>;
export const GRAVITY_MPS2 = 9.80665;
export const REFERENCE_AIR_DENSITY_KG_M3 = 1.225;
export interface AerodynamicLoad { massKg: number; additionalDragAreaM2: number }
export interface FixedWingMotion { airspeedMps: number; climbMps: number; bankDeg: number }
const radians = (degrees: number) => degrees * Math.PI / 180;

export function fixedWingTurnRadiusM(airspeedMps: number, bankDeg: number) {
  if (!Number.isFinite(airspeedMps) || airspeedMps <= 0 || !Number.isFinite(bankDeg) || Math.abs(bankDeg) >= 90) throw new Error('Turn speed must be positive and bank must be within ±90°.');
  return bankDeg === 0 ? Infinity : airspeedMps ** 2 / (GRAVITY_MPS2 * Math.tan(radians(Math.abs(bankDeg))));
}

/** Quasi-steady polar, conservative level-load lift in climbs; drag area is equivalent Cd × area. */
export function fixedWingPower(model: FixedWingPowerModel, motion: FixedWingMotion, load: AerodynamicLoad = { massKg: 0, additionalDragAreaM2: 0 }, airDensityKgM3 = REFERENCE_AIR_DENSITY_KG_M3) {
  const values = [...Object.values(model), ...Object.values(motion), ...Object.values(load), airDensityKgM3];
  if (values.some((value) => !Number.isFinite(value))) throw new Error('Fixed-wing inputs must be finite.');
  if (model.massKg <= 0 || model.wingAreaM2 <= 0 || model.inducedDragFactor <= 0 || model.zeroLiftDragCoefficient < 0 || model.propulsiveEfficiency <= 0 || model.propulsiveEfficiency > 1 || model.maxBankDeg <= 0 || model.maxBankDeg >= 90 || model.maxClimbMps <= 0 || airDensityKgM3 <= 0 || load.massKg < 0 || load.additionalDragAreaM2 < 0) throw new Error('Invalid fixed-wing model or equipment load.');
  if (motion.airspeedMps <= 0 || Math.abs(motion.climbMps) >= motion.airspeedMps) throw new Error('Fixed-wing motion requires positive airspeed with a smaller vertical component.');
  if (Math.abs(motion.bankDeg) > model.maxBankDeg) throw new Error('Fixed-wing bank exceeds the configured limit.');
  if (Math.abs(motion.climbMps) > model.maxClimbMps) throw new Error('Fixed-wing climb/descent exceeds the configured vertical-speed limit.');
  const massKg = model.massKg + load.massKg;
  const dynamicPressurePa = .5 * airDensityKgM3 * motion.airspeedMps ** 2;
  const loadFactor = 1 / Math.cos(radians(motion.bankDeg));
  const liftCoefficient = massKg * GRAVITY_MPS2 * loadFactor / (dynamicPressurePa * model.wingAreaM2);
  const parasiteDragN = dynamicPressurePa * model.wingAreaM2 * model.zeroLiftDragCoefficient;
  const inducedDragN = dynamicPressurePa * model.wingAreaM2 * model.inducedDragFactor * liftCoefficient ** 2;
  const equipmentDragN = dynamicPressurePa * load.additionalDragAreaM2;
  const dragPowerW = (parasiteDragN + inducedDragN + equipmentDragN) * motion.airspeedMps / model.propulsiveEfficiency;
  const climbPowerW = massKg * GRAVITY_MPS2 * Math.max(0, motion.climbMps) / model.propulsiveEfficiency;
  const electricalPowerW = dragPowerW + climbPowerW;
  if (!Number.isFinite(electricalPowerW)) throw new Error('Fixed-wing power overflows its numerical range.');
  return { electricalPowerW, dragPowerW, climbPowerW, parasiteDragN, inducedDragN, equipmentDragN, liftCoefficient, loadFactor, turnRadiusM: fixedWingTurnRadiusM(motion.airspeedMps, motion.bankDeg) };
}

export function fixedWingBankForRadiusDeg(airspeedMps: number, radiusM: number, maxBankDeg: number) {
  if (!Number.isFinite(airspeedMps) || airspeedMps <= 0 || !Number.isFinite(radiusM) || radiusM <= 0 || !Number.isFinite(maxBankDeg) || maxBankDeg <= 0 || maxBankDeg >= 90) throw new Error('Invalid fixed-wing turn constraint.');
  const bankDeg = Math.atan(airspeedMps ** 2 / (GRAVITY_MPS2 * radiusM)) * 180 / Math.PI;
  return { bankDeg, feasible: bankDeg <= maxBankDeg + 1e-10 };
}
