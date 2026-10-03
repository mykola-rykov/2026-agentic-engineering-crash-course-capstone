import { z } from 'zod';
import { fraction, identifier, nonnegative, parseContract, positive, text } from './common';
import { missionSchema } from './mission';
import { scenarioResultSchema } from './result';

const envelope = { protocolVersion: z.literal(1), jobId: identifier };
export const workerRequestSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('analyze'), mission: missionSchema }),
  z.strictObject({ ...envelope, type: z.literal('search'), mission: missionSchema }),
  z.strictObject({ ...envelope, type: z.literal('cancel') }),
]);
export const workerResponseSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('progress'), phase: text, fractionComplete: fraction }),
  z.strictObject({ ...envelope, type: z.literal('result'), results: z.array(scenarioResultSchema).min(1), refinement: z.enum(['coarse', 'final']) }),
  z.strictObject({ ...envelope, type: z.literal('no-route'), corridorWidthM: positive, horizontalSpacingM: positive, verticalSpacingM: positive, reason: text }),
  z.strictObject({ ...envelope, type: z.literal('cancelled') }),
  z.strictObject({ ...envelope, type: z.literal('error'), code: z.enum(['invalid-input', 'missing-terrain', 'unsupported-version', 'numerical-failure']), message: text }),
  z.strictObject({ ...envelope, type: z.literal('tile-buffer'), packageId: identifier, level: nonnegative.int(), column: nonnegative.int(), row: nonnegative.int(), representation: z.enum(['display', 'obstruction', 'validity']), buffer: z.instanceof(ArrayBuffer) }),
]).superRefine((message, ctx) => {
  if (message.type === 'result' && message.results.some((r) => r.jobId !== message.jobId)) ctx.addIssue({ code: 'custom', message: 'Result job id differs from its envelope.', path: ['results'] });
  if (message.type === 'tile-buffer') {
    const bytes = 256 * 256 * (message.representation === 'validity' ? 1 : 2);
    if (message.buffer.byteLength !== bytes) ctx.addIssue({ code: 'custom', message: 'Transferred tile length does not match the declared representation.', path: ['buffer'] });
  }
});

export type WorkerRequest = z.infer<typeof workerRequestSchema>;
export type WorkerResponse = z.infer<typeof workerResponseSchema>;
export function parseWorkerRequest(value: unknown): WorkerRequest {
  return parseContract(workerRequestSchema, value, 'worker request');
}
export function parseWorkerResponse(value: unknown): WorkerResponse {
  return parseContract(workerResponseSchema, value, 'worker response');
}
