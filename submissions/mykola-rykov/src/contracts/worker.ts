import { z } from 'zod';
import { attitudeSchema, finite, fraction, identifier, nonnegative, parseContract, positive, text } from './common';
import { missionSchema } from './mission';
import { scenarioResultSchema } from './result';

const envelope = { protocolVersion: z.literal(1), jobId: identifier };
export const rfViewSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('slice'), columns: positive.int().min(2).max(64), rows: positive.int().min(2).max(64), minXM: finite, maxXM: finite, minYM: finite, maxYM: finite, altitudeM: finite, attitude: attitudeSchema }),
  z.strictObject({ kind: z.literal('heatmap'), columns: positive.int().min(2).max(64), rows: positive.int().min(2).max(32), minimumAltitudeM: finite, maximumAltitudeM: finite, path: z.array(z.strictObject({ xM: finite, yM: finite, altitudeM: finite })).min(2).max(8192), attitude: attitudeSchema }),
]).superRefine((view, ctx) => {
  if (view.columns * view.rows > 2048) ctx.addIssue({ code: 'custom', message: 'RF views are bounded to 2048 cells.' });
  if (view.kind === 'slice' ? view.maxXM <= view.minXM || view.maxYM <= view.minYM : view.maximumAltitudeM <= view.minimumAltitudeM) ctx.addIssue({ code: 'custom', message: 'RF view bounds must be ordered and nonempty.' });
});
export const workerRequestSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('analyze'), mission: missionSchema }),
  z.strictObject({ ...envelope, type: z.literal('search'), mission: missionSchema }),
  z.strictObject({ ...envelope, type: z.literal('rf-view'), mission: missionSchema, equipmentId: identifier, view: rfViewSchema }),
  z.strictObject({ ...envelope, type: z.literal('cancel') }),
]);
export const workerResponseSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('progress'), phase: text, fractionComplete: fraction }),
  z.strictObject({ ...envelope, type: z.literal('result'), results: z.array(scenarioResultSchema).min(1), refinement: z.enum(['coarse', 'final']) }),
  z.strictObject({ ...envelope, type: z.literal('no-route'), corridorWidthM: positive, horizontalSpacingM: positive, verticalSpacingM: positive, reason: text }),
  z.strictObject({ ...envelope, type: z.literal('cancelled') }),
  z.strictObject({ ...envelope, type: z.literal('view-grid'), kind: z.enum(['slice', 'heatmap']), columns: positive.int().max(64), rows: positive.int().max(64), horizontalLabel: text, verticalLabel: text, horizontalMinimum: finite, horizontalMaximum: finite, verticalMinimum: finite, verticalMaximum: finite, assumptions: z.array(text).min(1), marginBuffer: z.instanceof(ArrayBuffer), powerBuffer: z.instanceof(ArrayBuffer), validityBuffer: z.instanceof(ArrayBuffer) }),
  z.strictObject({ ...envelope, type: z.literal('error'), code: z.enum(['invalid-input', 'missing-terrain', 'unsupported-version', 'numerical-failure']), message: text }),
  z.strictObject({ ...envelope, type: z.literal('tile-buffer'), packageId: identifier, level: nonnegative.int(), column: nonnegative.int(), row: nonnegative.int(), representation: z.enum(['display', 'obstruction', 'validity']), buffer: z.instanceof(ArrayBuffer) }),
]).superRefine((message, ctx) => {
  if (message.type === 'result' && message.results.some((r) => r.jobId !== message.jobId)) ctx.addIssue({ code: 'custom', message: 'Result job id differs from its envelope.', path: ['results'] });
  if (message.type === 'tile-buffer') {
    const bytes = 256 * 256 * (message.representation === 'validity' ? 1 : 2);
    if (message.buffer.byteLength !== bytes) ctx.addIssue({ code: 'custom', message: 'Transferred tile length does not match the declared representation.', path: ['buffer'] });
  }
  if (message.type === 'view-grid') {
    const count = message.columns * message.rows;
    if (count > 2048 || message.marginBuffer.byteLength !== count * 4 || message.powerBuffer.byteLength !== count * 4 || message.validityBuffer.byteLength !== count) ctx.addIssue({ code: 'custom', message: 'RF grid buffers must match bounded grid dimensions.' });
    else {
      const mask = new Uint8Array(message.validityBuffer), margin = new Float32Array(message.marginBuffer), power = new Float32Array(message.powerBuffer);
      if (mask.some((v, i) => v > 1 || (v === 1 && (!Number.isFinite(margin[i]) || !Number.isFinite(power[i]))))) ctx.addIssue({ code: 'custom', message: 'Known RF grid cells must have finite values and explicit validity.' });
    }
  }
});

export type WorkerRequest = z.infer<typeof workerRequestSchema>;
export type WorkerResponse = z.infer<typeof workerResponseSchema>;
export type RfView = z.infer<typeof rfViewSchema>;
export function parseWorkerRequest(value: unknown): WorkerRequest {
  return parseContract(workerRequestSchema, value, 'worker request');
}
export function parseWorkerResponse(value: unknown): WorkerResponse {
  return parseContract(workerResponseSchema, value, 'worker response');
}
