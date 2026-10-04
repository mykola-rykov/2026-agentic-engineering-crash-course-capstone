import { expect, test } from 'vitest';
import { missionFixture } from './fixtures/contracts';
import { illustrativeAircraft } from '../src/energy/profiles';
import { coarsePrimitives, motionBucket, primitiveState, samplePrimitive, verifyMotion } from '../src/routing/motion';
import type { Primitive } from '../src/routing/motion';
import { evaluateRouteEnergy } from '../src/energy/integration';
const primitive: Primitive = { start: { xM: 0, yM: 0, altitudeM: 400, headingDeg: 0 }, lengthM: Math.PI * 100 / 2, turnDeg: 90, altitudeChangeM: 0, leg: 'outbound' };
function fixture(kind: 'fixed-wing' | 'multirotor') { const m = missionFixture(); m.aircraft = illustrativeAircraft(kind); m.assumptions.energyModel = { id: 'aircraft-electrical', version: '1' }; return m; }
test('analytic quarter circle and heading state distinguish turns from positional shortcuts', () => {
  const m = fixture('fixed-wing'), points = samplePrimitive(primitive, m, 30), end = primitiveState(primitive, 1);
  expect(end.xM).toBeCloseTo(100, 9); expect(end.yM).toBeCloseTo(100, 9); expect(end.headingDeg).toBe(90);
  // Independently: tan(bank) = V²/(gR), yaw rate = V/R.
  expect(points[9]!.bankDeg).toBeCloseTo(Math.atan(22 ** 2 / (9.80665 * 100)) * 180 / Math.PI, 6);
  expect(() => verifyMotion(points, m, m.equipment[0]!)).not.toThrow();
  expect(() => verifyMotion(samplePrimitive({ ...primitive, lengthM: Math.PI * 20 / 2 }, m, 10), m, m.equipment[0]!)).toThrow('bank');
  expect(motionBucket(end, 0)).not.toBe(motionBucket({ ...end, headingDeg: 270 }, 0));
  expect(coarsePrimitives(primitive.start, 'outbound')).toHaveLength(45);
  const climb = coarsePrimitives(primitive.start, 'outbound').find(p => p.lengthM === 750 && p.turnDeg === 0 && p.altitudeChangeM === 50)!;
  expect(() => verifyMotion(samplePrimitive(climb, m, 30), m, m.equipment[0]!)).not.toThrow();
  const energy = evaluateRouteEnergy(m, m.equipment[0]!, samplePrimitive(climb, m, 30));
  expect(energy.attitudes[0]!.pitchDeg).toBe(0);
  expect(energy.attitudes[1]!.pitchDeg).toBeGreaterThan(0);
});
test('vertical easing, climb, acceleration and tilt are checked with installed loads', () => {
  const m = fixture('multirotor');
  const rise = { ...primitive, lengthM: 500, turnDeg: 0, altitudeChangeM: 50 };
  const points = samplePrimitive(rise, m, 30);
  expect(points[0]!.motion.climbMps).toBe(0); expect(points.at(-1)!.motion.climbMps).toBe(0);
  expect(() => verifyMotion(points, m, m.equipment[0]!)).not.toThrow();
  const steep = samplePrimitive({ ...rise, lengthM: 100 }, m, 10);
  expect(() => verifyMotion([steep[Math.floor(steep.length / 2)]!], m, m.equipment[0]!)).toThrow('climb');
  expect(() => verifyMotion(samplePrimitive({ ...primitive, lengthM: Math.PI * 10 / 2 }, m, 2), m, m.equipment[0]!)).toThrow('acceleration');
  if (m.aircraft.kind !== 'multirotor') throw new Error('fixture');
  m.aircraft.powerModel!.maxAccelerationMps2 = 100; m.aircraft.powerModel!.maxTiltDeg = 2;
  expect(() => verifyMotion(samplePrimitive(primitive, m, 20), m, m.equipment[0]!)).toThrow('tilt');
});
test('wind affects turn bank and sampled primitive durations/energy without bypassing limits', () => {
  const m = fixture('fixed-wing'), calm = samplePrimitive(primitive, m, 20);
  const energy = evaluateRouteEnergy(m, m.equipment[0]!, calm);
  expect(energy.feasibility.status).toBe('feasible');
  expect(energy.durationS).toBeCloseTo(primitive.lengthM / 22, 9);
  m.wind = { speedMps: 8, fromDirectionDeg: 180 };
  const windy = samplePrimitive(primitive, m, 20);
  expect(windy[0]!.bankDeg).toBeGreaterThan(calm[0]!.bankDeg);
  expect(() => verifyMotion(windy, m, m.equipment[0]!)).toThrow('bank');
  m.wind = { speedMps: 30, fromDirectionDeg: 0 };
  expect(() => samplePrimitive(primitive, m, 20)).toThrow('progress');
});
test('generated finite climb-to-descent transitions are not treated as manual corners', () => {
  const mission = fixture('fixed-wing');
  const climb = samplePrimitive({ start: { xM: 0, yM: 0, altitudeM: 400, headingDeg: 90 }, lengthM: 500, turnDeg: 0, altitudeChangeM: 30, leg: 'outbound' }, mission, 25);
  const descent = samplePrimitive({ start: { xM: 500, yM: 0, altitudeM: 430, headingDeg: 90 }, lengthM: 500, turnDeg: 0, altitudeChangeM: -30, leg: 'outbound' }, mission, 25);
  const result = evaluateRouteEnergy(mission, mission.equipment[0]!, [...climb, ...descent]);
  expect(result.violations.filter(v => v.constraint === 'motion')).toEqual([]);
  expect(result.feasibility.status).toBe('feasible');
});
