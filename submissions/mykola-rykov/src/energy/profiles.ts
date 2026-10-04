import type { MissionConfig } from '../contracts/mission';
export function illustrativeAircraft(kind: 'fixed-wing' | 'multirotor'): MissionConfig['aircraft'] {
  const base = { id: `illustrative-${kind}`, version: '1', name: `Illustrative ${kind}`, calibration: 'illustrative' as const, provenance: 'Synthetic editable demonstration values. No measured aircraft dataset is bundled.', avionicsPowerW: 5, takeoffLandingEnergyWh: 3 };
  return kind === 'fixed-wing' ? { ...base, kind, batteryCapacityWh: 150, powerModel: { massKg: 2.5, wingAreaM2: .5, zeroLiftDragCoefficient: .035, inducedDragFactor: .065, propulsiveEfficiency: .65, cruiseSpeedMps: 22, maxClimbMps: 3, maxBankDeg: 35 } } : { ...base, kind, batteryCapacityWh: 120, powerModel: { referenceMassKg: 1.5, massKg: 1.5, hoverPowerW: 240, cruiseSpeedMps: 10, propulsiveEfficiency: .65, powerByAirspeed: [{ airspeedMps: 0, powerW: 240 }, { airspeedMps: 5, powerW: 220 }, { airspeedMps: 10, powerW: 260 }, { airspeedMps: 15, powerW: 390 }], massCorrectionExponent: 1.5, climbPowerWPerMps: 55, maxClimbMps: 3, maxAccelerationMps2: 2, maxTiltDeg: 30 } };
}
export function energyPrerequisites(aircraft: MissionConfig['aircraft']) {
  const reasons: string[] = [];
  if (aircraft.powerModel === null) reasons.push('Aircraft power model is missing.');
  if (aircraft.batteryCapacityWh === null) reasons.push('Battery capacity is missing.');
  if (aircraft.kind === 'multirotor' && aircraft.powerModel) {
    if (aircraft.powerModel.cruiseSpeedMps === null) reasons.push('Multirotor cruise airspeed is missing.');
    if (aircraft.powerModel.propulsiveEfficiency === null) reasons.push('Multirotor propulsive efficiency is missing.');
  }
  return reasons;
}
