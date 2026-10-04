import { expect, test } from 'vitest';
import { newMission } from '../src/mission/defaults';
import { illustrativeAircraft } from '../src/energy/profiles';
import { evaluateRouteEnergy, integrateConstantPowerWh, manualCornerSamples, radioInputPowerW, segmentMotion, reserveFeasibility } from '../src/energy/integration';
import { terrainFixture } from './fixtures/contracts';
const start = { xM: 0, yM: 0, altitudeM: 100, headingDeg: 90, pitchDeg: 0, leg: 'outbound' as const };
const end = { ...start, xM: 18_000 };
function fixture() {
  const mission = newMission(terrainFixture()); mission.aircraft = illustrativeAircraft('multirotor');
  if (mission.aircraft.kind !== 'multirotor' || !mission.aircraft.powerModel) throw new Error('fixture');
  mission.aircraft.powerModel.powerByAirspeed = [{ airspeedMps: 0, powerW: 240 }, { airspeedMps: 10, powerW: 240 }];
  mission.aircraft.batteryCapacityWh = 500;
  return mission;
}
test('constant electrical integration and complete hand-calculated aircraft breakdown', () => {
  expect(integrateConstantPowerWh(50, 720)).toBe(10);
  const mission = fixture(), result = evaluateRouteEnergy(mission, mission.equipment[0]!, [start, end]);
  expect(result.durationS).toBeCloseTo(1800, 9);
  expect(result.energy).toEqual({ propulsionWh: 120, avionicsWh: 2.5, radioWh: .625, takeoffLandingWh: 3, totalWh: 126.125, remainingReserveFraction: 1 - 126.125 / 500 });
  expect(result.feasibility.status).toBe('feasible');
  expect(result.elapsedTimeS).toEqual([0, 1800]);
});
test('radio electrical power uses efficiency or measured input, and ground power is excluded', () => {
  const mission = fixture(), equipment = mission.equipment[0]!;
  expect(radioInputPowerW(equipment.downlink)).toBeCloseTo(1.25, 10);
  const before = evaluateRouteEnergy(mission, equipment, [start, end]);
  equipment.uplink.transmitPowerDbm = 40;
  expect(evaluateRouteEnergy(mission, equipment, [start, end]).energy).toEqual(before.energy);
  equipment.downlink.transmitPowerDbm = 30;
  expect(evaluateRouteEnergy(mission, equipment, [start, end]).energy!.radioWh).toBeCloseTo(1.75, 10);
  equipment.downlink.electricalDraw = { kind: 'measured', provenance: 'Independent synthetic electrical fixture', samples: [{ outputDbm: 20, inputW: 4 }, { outputDbm: 30, inputW: 8 }] };
  equipment.downlink.transmitPowerDbm = 25;
  expect(radioInputPowerW(equipment.downlink)).toBe(6);
  equipment.downlink.transmitPowerDbm = 31;
  const unsupported = evaluateRouteEnergy(mission, equipment, [start, end]);
  expect(unsupported.energy).toBeNull(); expect(unsupported.feasibility.status).toBe('indeterminate');
});
test('only airborne antenna loads affect propulsion and descents never regenerate', () => {
  const mission = fixture(), equipment = mission.equipment[0]!;
  const base = evaluateRouteEnergy(mission, equipment, [start, end]);
  equipment.groundAntenna.massKg = 50; equipment.groundAntenna.additionalDragAreaM2 = 5;
  expect(evaluateRouteEnergy(mission, equipment, [start, end]).energy).toEqual(base.energy);
  equipment.airborneAntenna.massKg = .5; equipment.airborneAntenna.additionalDragAreaM2 = .01;
  expect(evaluateRouteEnergy(mission, equipment, [start, end]).energy!.propulsionWh).toBeGreaterThan(base.energy!.propulsionWh);
  const climb = evaluateRouteEnergy(mission, equipment, [start, { ...end, altitudeM: 300 }]);
  const descent = evaluateRouteEnergy(mission, equipment, [{ ...start, altitudeM: 300 }, end]);
  expect(climb.energy!.propulsionWh).toBeGreaterThan(descent.energy!.propulsionWh);
  expect(descent.energy!.propulsionWh).toBeCloseTo(evaluateRouteEnergy(mission, equipment, [start, end]).energy!.propulsionWh, 8);
});
test('wind gives independent reverse durations and crab heading without negative time', () => {
  const to = { ...start, xM: 1000 }, back = { ...start, headingDeg: 270, leg: 'return' as const };
  expect(segmentMotion(start, to, 20, { speedMps: 5, fromDirectionDeg: 270 }, 'fixed-wing', 3).durationS).toBeCloseTo(40, 9);
  expect(segmentMotion(to, back, 20, { speedMps: 5, fromDirectionDeg: 270 }, 'fixed-wing', 3).durationS).toBeCloseTo(66.66666666666667, 9);
  const cross = segmentMotion(start, to, 20, { speedMps: 5, fromDirectionDeg: 0 }, 'fixed-wing', 3);
  expect(cross.durationS).toBeCloseTo(51.63977794943222, 9);
  expect(cross.headingDeg).toBeCloseTo(75.52248781407008, 9);
  expect(() => segmentMotion(start, to, 20, { speedMps: 21, fromDirectionDeg: 90 }, 'fixed-wing', 3)).toThrow('progress');
  expect(() => segmentMotion(start, to, 20, { speedMps: 21, fromDirectionDeg: 0 }, 'fixed-wing', 3)).toThrow('progress');
});
test('return energy totals both legs; reserve boundary and impossible motion are explicit', () => {
  const mission = fixture(); mission.wind = { speedMps: 5, fromDirectionDeg: 270 };
  const to = { ...start, xM: 1000 }, back = { ...start, headingDeg: 270, leg: 'return' as const };
  const result = evaluateRouteEnergy(mission, mission.equipment[0]!, [start, to, { ...to, headingDeg: 270, leg: 'return' }, back]);
  expect(result.durationS).toBeCloseTo(266.6666666666667, 9);
  expect(result.energy!.propulsionWh).toBeCloseTo(17.77777777777778, 9);
  expect(result.feasibility.status).toBe('infeasible'); // an unsmoothed instantaneous turnaround
  expect(result.violations.some(v => v.constraint === 'motion')).toBe(true);
  expect(reserveFeasibility(80, 100, .2).status).toBe('feasible');
  expect(reserveFeasibility(80.001, 100, .2).status).toBe('infeasible');
  mission.wind = { speedMps: 11, fromDirectionDeg: 90 };
  const impossible = evaluateRouteEnergy(mission, mission.equipment[0]!, [start, to]);
  expect(impossible.durationS).toBeNull(); expect(impossible.energy).toBeNull(); expect(impossible.feasibility.status).toBe('infeasible');
});
test('manual motion validation detects vertical corners for both aircraft classes', () => {
  for (const kind of ['fixed-wing', 'multirotor'] as const) {
    const mission = fixture(); mission.aircraft = illustrativeAircraft(kind);
    const points = [
      { ...start, xM: 0, altitudeM: 100 },
      { ...start, xM: 1000, altitudeM: 200 },
      { ...start, xM: 2000, altitudeM: 100 },
    ];
    const result = evaluateRouteEnergy(mission, mission.equipment[0]!, points);
    expect(manualCornerSamples(points)).toEqual([1]);
    expect(result.energy).not.toBeNull();
    expect(result.violations).toContainEqual(expect.objectContaining({ constraint: 'motion', sampleIndex: 1 }));
    expect(result.feasibility.status).toBe('infeasible');
  }
});
test('manual motion validation covers climb-to-level, vertical reversal, and horizontal turns', () => {
  const climbToLevel = [{ ...start, xM: 0, altitudeM: 100 }, { ...start, xM: 1000, altitudeM: 200 }, { ...start, xM: 2000, altitudeM: 200 }];
  const verticalReversal = [{ ...start, xM: 0, altitudeM: 100 }, { ...start, xM: 0, altitudeM: 200 }, { ...start, xM: 0, altitudeM: 100 }];
  const horizontalTurn = [{ ...start, xM: 0, yM: 0 }, { ...start, xM: 1000, yM: 0 }, { ...start, xM: 1000, yM: 1000 }];
  expect(manualCornerSamples(climbToLevel)).toEqual([1]);
  expect(manualCornerSamples(verticalReversal)).toEqual([1]);
  expect(manualCornerSamples(horizontalTurn)).toEqual([1]);
});
test('manual corners bridge duplicate samples and ignore collinear projection noise', () => {
  const duplicateJoin = [
    { ...start, xM: 0, altitudeM: 100 },
    { ...start, xM: 1000, altitudeM: 200 },
    { ...start, xM: 1000, altitudeM: 200, leg: 'return' as const },
    { ...start, xM: 2000, altitudeM: 100, leg: 'return' as const },
  ];
  const noisyCollinear = [{ ...start, xM: 0, altitudeM: 100 }, { ...start, xM: 1000, altitudeM: 200 }, { ...start, xM: 2000, yM: 1e-10, altitudeM: 300 }];
  expect(manualCornerSamples(duplicateJoin)).toEqual([2]);
  expect(manualCornerSamples(noisyCollinear)).toEqual([]);
});
