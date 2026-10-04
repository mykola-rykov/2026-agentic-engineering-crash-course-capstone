import { z } from 'zod';
import { altitudeSchema, attitudeSchema, coordinateSchema, finite, identifier, modelIdentitySchema, nonnegative, parseContract, text } from './common';

export const feasibilitySchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('feasible'), reasons: z.array(text).length(0) }),
  z.strictObject({ status: z.literal('infeasible'), reasons: z.array(text).min(1) }),
  z.strictObject({ status: z.literal('indeterminate'), reasons: z.array(text).min(1) }),
]);
export const linkBudgetSchema = z.strictObject({
  transmitPowerDbm: finite, transmitGainDbi: finite, receiveGainDbi: finite,
  freeSpaceLossDb: nonnegative, diffractionLossDb: nonnegative, cableLossDb: nonnegative,
  polarizationLossDb: nonnegative, installationLossDb: nonnegative,
  receivedPowerDbm: finite, receiverSensitivityDbm: finite, uncertaintyAllowanceDb: nonnegative,
  availableMarginDb: finite,
});
const knownClearance = z.strictObject({
  status: z.literal('known'), terrainElevation: altitudeSchema,
  terrainClearanceM: finite, minimumFirstFresnelClearanceFraction: finite,
  meetsSixtyPercentFresnel: z.boolean(),
  limitingObstruction: z.strictObject({ position: coordinateSchema, elevation: altitudeSchema, distanceFromStationM: nonnegative }).nullable(),
});
const unknownClearance = z.strictObject({ status: z.literal('unknown'), reason: text });
const routeSampleSchema = z.strictObject({
  distanceAlongRouteM: nonnegative, elapsedTimeS: nonnegative.nullable(),
  leg: z.enum(['outbound', 'return']), position: coordinateSchema, altitude: altitudeSchema, attitude: attitudeSchema,
  uplink: linkBudgetSchema.nullable(), downlink: linkBudgetSchema.nullable(),
  terrainEvidence: z.discriminatedUnion('status', [
    z.strictObject({ status: z.literal('known'), displayElevationM: finite, obstructionElevationM: finite, datumId: text }),
    z.strictObject({ status: z.literal('unknown'), reason: text }),
  ]).optional(),
  clearance: z.discriminatedUnion('status', [knownClearance, unknownClearance]),
});
const energySchema = z.strictObject({
  totalWh: nonnegative, propulsionWh: nonnegative, avionicsWh: nonnegative, radioWh: nonnegative,
  takeoffLandingWh: nonnegative, remainingReserveFraction: finite.max(1),
});

export const scenarioResultSchema = z.strictObject({
  schemaVersion: z.literal(1), jobId: identifier, scenarioId: identifier, missionId: identifier, equipmentId: identifier,
  terrain: z.strictObject({ packageId: identifier, packageVersion: text, verticalDatumId: text }),
  models: z.strictObject({ rf: modelIdentitySchema, energy: modelIdentitySchema }),
  assumptions: z.array(text).min(1), routeSamples: z.array(routeSampleSchema).min(2),
  summary: z.strictObject({
    distanceM: nonnegative, durationS: nonnegative.nullable(), climbM: nonnegative,
    minimumUplinkMarginDb: finite.nullable(), minimumDownlinkMarginDb: finite.nullable(),
    minimumTwoWayMarginDb: finite.nullable(), energy: energySchema.nullable(),
  }),
  feasibility: feasibilitySchema, rfFeasibility: feasibilitySchema, energyFeasibility: feasibilitySchema,
  constraintViolations: z.array(z.strictObject({ constraint: text, reason: text, sampleIndex: nonnegative.int().nullable() })),
}).superRefine((result, ctx) => {
  if (result.energyFeasibility.status === 'feasible' && (!result.summary.energy || result.summary.durationS === null)) ctx.addIssue({ code: 'custom', message: 'Feasible energy requires computed energy and duration.', path: ['energyFeasibility'] });
  if (result.rfFeasibility.status === 'feasible' && (result.summary.minimumTwoWayMarginDb === null || result.routeSamples.some((s) => !s.uplink || !s.downlink || s.clearance.status === 'unknown'))) ctx.addIssue({ code: 'custom', message: 'Feasible RF requires complete two-way and terrain evidence.', path: ['rfFeasibility'] });
  if (result.feasibility.status === 'feasible' && (result.rfFeasibility.status !== 'feasible' || result.energyFeasibility.status !== 'feasible' || result.constraintViolations.length)) ctx.addIssue({ code: 'custom', message: 'Overall feasibility requires valid RF/energy and no violations.', path: ['feasibility'] });
  result.routeSamples.forEach((sample, index) => {
    const previous = result.routeSamples[index - 1];
    if (previous && sample.distanceAlongRouteM < previous.distanceAlongRouteM) ctx.addIssue({ code: 'custom', message: 'Route distances must be nondecreasing.', path: ['routeSamples', index] });
    if (sample.altitude.datumId !== result.terrain.verticalDatumId || (sample.clearance.status === 'known' && sample.clearance.terrainElevation.datumId !== result.terrain.verticalDatumId)) ctx.addIssue({ code: 'custom', message: 'Sample datum differs from terrain datum.', path: ['routeSamples', index] });
  });
  if (result.constraintViolations.some((v) => v.sampleIndex !== null && v.sampleIndex >= result.routeSamples.length)) ctx.addIssue({ code: 'custom', message: 'Violation sample index is out of range.', path: ['constraintViolations'] });
});

export type ScenarioResult = z.infer<typeof scenarioResultSchema>;
export function parseScenarioResult(value: unknown): ScenarioResult {
  return parseContract(scenarioResultSchema, value, 'scenario result');
}
