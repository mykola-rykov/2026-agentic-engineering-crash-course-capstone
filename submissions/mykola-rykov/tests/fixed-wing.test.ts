import { expect, test } from 'vitest';
import { fixedWingPower, fixedWingTurnRadiusM, fixedWingBankForRadiusDeg } from '../src/energy/fixed-wing';
const model = { massKg: 2, wingAreaM2: .5, zeroLiftDragCoefficient: .03, inducedDragFactor: .06, propulsiveEfficiency: .8, cruiseSpeedMps: 20, maxClimbMps: 3, maxBankDeg: 45 };
const straight = { airspeedMps: 20, climbMps: 0, bankDeg: 0 };
test('fixed-wing polar and 45° turn agree with independent hand fixtures', () => {
  const result = fixedWingPower(model, straight);
  expect(result.parasiteDragN).toBeCloseTo(3.675, 10);
  expect(result.inducedDragN).toBeCloseTo(.18841544664, 10);
  expect(result.electricalPowerW).toBeCloseTo(96.585386166, 9);
  expect(fixedWingTurnRadiusM(20, 45)).toBeCloseTo(40.78864851911713, 9);
  expect(fixedWingTurnRadiusM(20, 0)).toBe(Infinity);
  expect(fixedWingBankForRadiusDeg(20, 40.78864851911713, 45).feasible).toBe(true);
  expect(fixedWingBankForRadiusDeg(20, 30, 45).feasible).toBe(false);
});
test('bank, mass, equipment drag, climb and efficiency affect energy independently', () => {
  const base = fixedWingPower(model, straight);
  const bank = fixedWingPower(model, { ...straight, bankDeg: 45 });
  expect(bank.inducedDragN).toBeCloseTo(.37683089328, 10);
  expect(bank.electricalPowerW).toBeGreaterThan(base.electricalPowerW);
  const mass = fixedWingPower(model, straight, { massKg: 1, additionalDragAreaM2: 0 });
  expect(mass.inducedDragN / base.inducedDragN).toBeCloseTo(2.25, 10);
  const drag = fixedWingPower(model, straight, { massKg: 0, additionalDragAreaM2: .01 });
  expect(drag.electricalPowerW - base.electricalPowerW).toBeCloseTo(61.25, 9);
  expect(fixedWingPower(model, { ...straight, climbMps: 2 }).electricalPowerW - base.electricalPowerW).toBeCloseTo(49.03325, 9);
  expect(fixedWingPower(model, { ...straight, climbMps: -2 }).electricalPowerW).toBe(base.electricalPowerW);
  expect(fixedWingPower({ ...model, propulsiveEfficiency: .4 }, straight).electricalPowerW).toBeCloseTo(base.electricalPowerW * 2, 9);
});
test('fixed-wing limits reject impossible motion and malformed numerical inputs', () => {
  expect(() => fixedWingPower(model, { ...straight, bankDeg: 46 })).toThrow('bank');
  expect(() => fixedWingPower(model, { ...straight, climbMps: 4 })).toThrow('climb');
  expect(() => fixedWingPower(model, { ...straight, airspeedMps: 0 })).toThrow('airspeed');
  expect(() => fixedWingPower(model, { ...straight, bankDeg: NaN })).toThrow('finite');
  expect(() => fixedWingPower({ ...model, propulsiveEfficiency: 0 }, straight)).toThrow('model');
});
