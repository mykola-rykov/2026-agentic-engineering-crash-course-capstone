import { z } from 'zod';
import { altitudeSchema, attitudeSchema, coordinateSchema, degrees, finite, fraction, identifier, modelIdentitySchema, nonnegative, parseContract, positive, text } from './common';

const gainPatternSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('isotropic'), gainDbi: finite }),
  z.strictObject({ kind: z.literal('sampled'), samples: z.array(z.strictObject({
    azimuthDeg: degrees, elevationDeg: finite.min(-90).max(90), gainDbi: finite,
  })).min(1).refine((samples) => new Set(samples.map((s) => `${s.azimuthDeg}:${s.elevationDeg}`)).size === samples.length, 'Pattern sample directions must be unique.'), interpolation: z.literal('linear') }),
]);
const antennaSchema = z.strictObject({
  id: identifier, name: text, calibration: z.enum(['illustrative', 'measured']), provenance: text,
  gainPattern: gainPatternSchema,
  polarization: z.enum(['linear', 'circular-left', 'circular-right']),
  mounting: attitudeSchema, massKg: nonnegative, additionalDragAreaM2: nonnegative,
});
const radioDrawSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('efficiency'), amplifierEfficiency: fraction.positive(), idlePowerW: nonnegative }),
  z.strictObject({ kind: z.literal('measured'), provenance: text, samples: z.array(z.strictObject({ outputDbm: finite, inputW: nonnegative })).min(2) }),
]);
const radioDirectionSchema = z.strictObject({
  mode: text, transmitPowerDbm: finite, receiverSensitivityDbm: finite,
  cableLossDb: nonnegative, installationLossDb: nonnegative, polarizationLossDb: nonnegative,
  electricalDraw: radioDrawSchema,
});
const equipmentSchema = z.strictObject({
  id: identifier, groundAntenna: antennaSchema, airborneAntenna: antennaSchema,
  groundPointing: z.strictObject({ azimuthDeg: degrees, elevationDeg: finite.min(-90).max(90) }),
  uplink: radioDirectionSchema, downlink: radioDirectionSchema,
});
const fixedWingPowerSchema = z.strictObject({
  massKg: positive, wingAreaM2: positive, zeroLiftDragCoefficient: nonnegative,
  inducedDragFactor: positive, propulsiveEfficiency: fraction.positive(), cruiseSpeedMps: positive,
  maxClimbMps: positive, maxBankDeg: positive.lt(90),
});
const multirotorPowerSchema = z.strictObject({
  referenceMassKg: positive, massKg: positive, hoverPowerW: positive,
  powerByAirspeed: z.array(z.strictObject({ airspeedMps: nonnegative, powerW: positive })).min(2).refine(
    (samples) => samples.every((sample, index) => index === 0 || sample.airspeedMps > samples[index - 1]!.airspeedMps),
    'Airspeed samples must be strictly increasing.',
  ),
  massCorrectionExponent: nonnegative, climbPowerWPerMps: nonnegative,
  maxClimbMps: positive, maxAccelerationMps2: positive, maxTiltDeg: positive.lt(90),
});
const profileBase = {
  id: identifier, version: text, name: text, calibration: z.enum(['illustrative', 'measured']), provenance: text,
  batteryCapacityWh: positive.nullable(), avionicsPowerW: nonnegative, takeoffLandingEnergyWh: nonnegative,
};
export const aircraftSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...profileBase, kind: z.literal('fixed-wing'), powerModel: fixedWingPowerSchema.nullable() }),
  z.strictObject({ ...profileBase, kind: z.literal('multirotor'), powerModel: multirotorPowerSchema.nullable() }),
]);
const waypointSchema = z.strictObject({ position: coordinateSchema, altitude: altitudeSchema });
export const missionSchema = z.strictObject({
  schemaVersion: z.literal(1), id: identifier, name: text,
  terrain: z.strictObject({ packageId: identifier, packageVersion: text, verticalDatumId: text }),
  launch: waypointSchema, destination: waypointSchema, waypoints: z.array(waypointSchema),
  flightMode: z.enum(['one-way', 'return']), totalDistanceLimitM: positive.max(100_000),
  groundAntennaHeightAboveSurfaceM: nonnegative,
  aircraft: aircraftSchema, equipment: z.array(equipmentSchema).min(1),
  frequencyHz: finite.min(100_000_000).max(6_000_000_000),
  constraints: z.strictObject({
    requiredMarginDb: nonnegative, batteryReserveFraction: fraction,
    minimumAltitude: altitudeSchema.nullable(), maximumAltitude: altitudeSchema.nullable(),
    minimumTerrainClearanceM: nonnegative.nullable(), corridorWidthM: positive,
  }),
  wind: z.strictObject({ speedMps: nonnegative, fromDirectionDeg: degrees }),
  assumptions: z.strictObject({
    rfModel: modelIdentitySchema, energyModel: modelIdentitySchema,
    effectiveEarthRadiusFactor: positive, terrainHeightUncertaintyM: nonnegative, rfLossAllowanceDb: nonnegative,
  }),
}).superRefine((mission, ctx) => {
  const points = [mission.launch, mission.destination, ...mission.waypoints];
  const altitudes = [...points.map((p) => p.altitude), mission.constraints.minimumAltitude, mission.constraints.maximumAltitude].filter((a) => a !== null);
  if (altitudes.some((a) => a.datumId !== mission.terrain.verticalDatumId)) ctx.addIssue({ code: 'custom', message: 'All mission altitudes must use the declared terrain vertical datum.', path: ['terrain', 'verticalDatumId'] });
  const { minimumAltitude: min, maximumAltitude: max } = mission.constraints;
  if (min && max && (min.reference !== max.reference || min.metres > max.metres)) ctx.addIssue({ code: 'custom', message: 'Altitude limits must share a reference and be ordered.', path: ['constraints'] });
  if (new Set(mission.equipment.map((e) => e.id)).size !== mission.equipment.length) ctx.addIssue({ code: 'custom', message: 'Equipment combination ids must be unique.', path: ['equipment'] });
});

export const MISSION_DEFAULTS = Object.freeze({
  flightMode: 'one-way' as const, windSpeedMps: 0, windFromDirectionDeg: 0,
  batteryReserveFraction: 0.2, requiredMarginDb: 10, corridorWidthM: 10_000,
  effectiveEarthRadiusFactor: 4 / 3,
});
export type MissionConfig = z.infer<typeof missionSchema>;
export function parseMission(value: unknown): MissionConfig {
  return parseContract(missionSchema, value, 'mission');
}
