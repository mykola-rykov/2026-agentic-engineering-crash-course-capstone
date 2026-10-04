import { expect, test } from 'vitest';
import { multirotorPower, multirotorTablePowerW } from '../src/energy/multirotor';
import { aircraftSchema } from '../src/contracts/mission';
import { illustrativeAircraft, energyPrerequisites } from '../src/energy/profiles';
const model = { referenceMassKg: 2, massKg: 2, hoverPowerW: 200, cruiseSpeedMps: 10, propulsiveEfficiency: .5, powerByAirspeed: [{ airspeedMps: 0, powerW: 200 }, { airspeedMps: 10, powerW: 300 }], massCorrectionExponent: 1.5, climbPowerWPerMps: 50, maxClimbMps: 3, maxAccelerationMps2: 3, maxTiltDeg: 20 };
const hover = { airspeedMps: 0, climbMps: 0, forwardAccelerationMps2: 0, lateralAccelerationMps2: 0, verticalAccelerationMps2: 0 };
test('independent hover, climb, interpolation and mass fixtures', () => {
  expect(multirotorPower(model, hover).electricalPowerW).toBe(200);
  expect(multirotorPower(model, { ...hover, climbMps: 2 }).electricalPowerW).toBe(300);
  expect(multirotorPower(model, { ...hover, climbMps: -2 }).electricalPowerW).toBe(200);
  expect(multirotorTablePowerW(model, 5)).toBe(250);
  expect(multirotorTablePowerW(model, 10.000000000000002)).toBe(300);
  expect(multirotorPower(model, hover, { massKg: 2, additionalDragAreaM2: 0 }).electricalPowerW).toBeCloseTo(565.685424949238, 9);
  const drag = multirotorPower(model, { ...hover, airspeedMps: 10 }, { massKg: 0, additionalDragAreaM2: .01 });
  expect(drag.equipmentDragPowerW).toBeCloseTo(12.25, 10);
  expect(drag.electricalPowerW).toBeCloseTo(312.25, 10);
});
test('acceleration, tilt, table support and vertical limits reject infeasible motion', () => {
  expect(() => multirotorPower(model, { ...hover, forwardAccelerationMps2: 4 })).toThrow('acceleration');
  expect(() => multirotorPower({ ...model, maxTiltDeg: 5 }, { ...hover, lateralAccelerationMps2: 2 })).toThrow('tilt');
  expect(() => multirotorPower(model, { ...hover, climbMps: 4 })).toThrow('climb');
  expect(() => multirotorPower(model, { ...hover, airspeedMps: 11 })).toThrow('table');
  expect(() => multirotorPower(model, { ...hover, airspeedMps: NaN })).toThrow('finite');
  expect(() => multirotorTablePowerW({ ...model, hoverPowerW: 199 }, 0)).toThrow('hover');
});
test('older profiles have explicit missing cruise/efficiency instead of invented defaults', () => {
  const aircraft = illustrativeAircraft('multirotor');
  expect(aircraft.kind).toBe('multirotor');
  if (aircraft.kind !== 'multirotor' || !aircraft.powerModel) throw new Error('fixture');
  const old = structuredClone(aircraft) as unknown as { powerModel: Record<string, unknown> };
  delete old.powerModel.cruiseSpeedMps; delete old.powerModel.propulsiveEfficiency;
  const parsed = aircraftSchema.parse(old);
  expect(energyPrerequisites(parsed)).toEqual(['Multirotor cruise airspeed is missing.', 'Multirotor propulsive efficiency is missing.']);
  expect(() => aircraftSchema.parse({ ...aircraft, powerModel: { ...aircraft.powerModel, propulsiveEfficiency: 0 } })).toThrow();
});
