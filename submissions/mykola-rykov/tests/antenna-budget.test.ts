import { expect, test } from 'vitest';
import { antennaGain, directionAngles, intoFrame, patternGain, twoEndGains } from '../src/rf/antenna';
import { twoWayBudget } from '../src/rf/budget';
import { missionFixture } from './fixtures/contracts';
const straight = { headingDeg: 0, pitchDeg: 0, rollDeg: 0 };
test('fixed pointing, beam departure and reverse aircraft heading change gains', () => {
  const equipment = missionFixture().equipment[0]!;
  const pattern = { kind: 'sampled' as const, interpolation: 'linear' as const, samples: [{ azimuthDeg: 0, elevationDeg: 0, gainDbi: 10 }, { azimuthDeg: 90, elevationDeg: 0, gainDbi: -10 }, { azimuthDeg: 180, elevationDeg: 0, gainDbi: -20 }, { azimuthDeg: 270, elevationDeg: 0, gainDbi: -10 }] };
  equipment.groundAntenna.gainPattern = pattern; equipment.airborneAntenna.gainPattern = pattern;
  expect(twoEndGains(equipment, { east: 0, north: 1, up: 0 }, straight)).toMatchObject({ groundGainDbi: 10, airborneGainDbi: -20 });
  expect(twoEndGains(equipment, { east: 0, north: 1, up: 0 }, { ...straight, headingDeg: 180 }).airborneGainDbi).toBeCloseTo(10, 10);
  expect(twoEndGains(equipment, { east: 1, north: 0, up: 0 }, straight).groundGainDbi).toBe(-10);
  expect(patternGain(pattern, 315, 0)).toBe(0); expect(patternGain(pattern, 0, 20)).toBeNull();
});
test('pitch, bank and mounting use the documented independent coordinate frames', () => {
  const pitched = directionAngles(intoFrame({ north: Math.sqrt(.5), east: 0, up: Math.sqrt(.5) }, { ...straight, pitchDeg: 45 }));
  expect(pitched.elevationDeg).toBeCloseTo(0, 10);
  const banked = directionAngles(intoFrame({ north: 0, east: 1, up: 0 }, { ...straight, rollDeg: 30 }));
  expect(banked.elevationDeg).toBeCloseTo(30, 10);
  const antenna = missionFixture().equipment[0]!.airborneAntenna;
  antenna.mounting.headingDeg = 90; antenna.gainPattern = { kind: 'sampled', interpolation: 'linear', samples: [{ azimuthDeg: 0, elevationDeg: 0, gainDbi: 8 }, { azimuthDeg: 180, elevationDeg: 0, gainDbi: -8 }] };
  expect(antennaGain(antenna, { east: 1, north: 0, up: 0 }, straight)).toBe(8);
});
test('two-dimensional piecewise linear patterns reproduce linear surfaces', () => {
  const pattern = { kind: 'sampled' as const, interpolation: 'linear' as const, samples: [0, 90, 180, 270].flatMap((azimuthDeg) => [-90, 0, 90].map((elevationDeg) => ({ azimuthDeg, elevationDeg, gainDbi: elevationDeg / 10 }))) };
  expect(patternGain(pattern, 45, 30)).toBeCloseTo(3, 10);
  expect(patternGain(pattern, 359, -20)).toBeCloseTo(-2, 10);
});
test('asymmetric directional budgets obey exact 3 dB power changes and explicit losses', () => {
  const equipment = missionFixture().equipment[0]!, propagation = { freeSpaceLossDb: 100, diffractionLossDb: 2 };
  equipment.downlink.receiverSensitivityDbm = -80;
  const before = twoWayBudget(equipment, 0, 0, propagation, 3, 10);
  expect(before.status).toBe('infeasible');
  if (before.status === 'indeterminate') throw new Error('Expected computed budgets');
  expect(before.limitingDirection).toBe('downlink'); expect(before.uplink.availableMarginDb).toBe(13); expect(before.downlink.availableMarginDb).toBe(-7);
  equipment.uplink.transmitPowerDbm += 3;
  const after = twoWayBudget(equipment, 0, 0, propagation, 3, 10);
  if (after.status === 'indeterminate') throw new Error('Expected computed budgets');
  expect(after.uplink.receivedPowerDbm - before.uplink.receivedPowerDbm).toBe(3); expect(after.uplink.availableMarginDb - before.uplink.availableMarginDb).toBe(3); expect(after.downlink).toEqual(before.downlink);
  expect(twoWayBudget(equipment, null, 0, propagation, 3, 10).status).toBe('indeterminate'); expect(twoWayBudget(equipment, 0, 0, null, 3, 10).status).toBe('indeterminate');
});
