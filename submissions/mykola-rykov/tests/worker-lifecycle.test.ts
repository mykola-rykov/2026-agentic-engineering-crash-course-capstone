import { describe, expect, it } from 'vitest';
import { JobRunner, JobClient, transferCopy } from '../src/workers/lifecycle';
import type { WorkerPort } from '../src/workers/lifecycle';
import type { WorkerRequest, WorkerResponse } from '../src/contracts/worker';
import { missionFixture, resultFixture } from './fixtures/contracts';
const request = (jobId: string): WorkerRequest => ({ type: 'analyze', protocolVersion: 1, jobId, mission: missionFixture() });
describe('worker lifecycle', () => {
  it('processes cancellation between bounded work batches', async () => {
    const responses: WorkerResponse[] = [];
    let batches = 0;
    const runner = new JobRunner(async (_, ctx) => { for (let i = 0; i < 20; i++) { batches++; ctx.progress('batch', i / 20); await ctx.checkpoint(); } }, (message) => responses.push(message));
    const work = runner.handle(request('old'));
    await runner.handle({ type: 'cancel', protocolVersion: 1, jobId: 'old' }); await work;
    expect(batches).toBe(1); expect(responses.at(-1)?.type).toBe('cancelled');
  });
  it('ignores late progress and results from replaced or cancelled jobs', () => {
    let listener: ((event: MessageEvent) => void) | null = null;
    const sent: WorkerRequest[] = [], received: WorkerResponse[] = [];
    const port: WorkerPort = { postMessage: (message) => sent.push(message), addEventListener: (_, handler) => { listener = handler; }, removeEventListener: () => { listener = null; } };
    const client = new JobClient(port, (message) => received.push(message));
    const old = client.start({ type: 'analyze', mission: missionFixture() });
    const next = client.start({ type: 'analyze', mission: missionFixture() });
    const deliver = (data: unknown) => { if (listener) listener({ data } as MessageEvent); };
    deliver({ type: 'progress', protocolVersion: 1, jobId: old, phase: 'old', fractionComplete: 1 });
    const staleResult = resultFixture(); staleResult.jobId = old;
    deliver({ type: 'result', protocolVersion: 1, jobId: old, results: [staleResult], refinement: 'final' });
    deliver({ type: 'progress', protocolVersion: 1, jobId: next, phase: 'next', fractionComplete: .5 });
    expect(received).toHaveLength(1); expect(received[0]?.jobId).toBe(next);
    client.cancel(); deliver({ type: 'progress', protocolVersion: 1, jobId: next, phase: 'late', fractionComplete: 1 });
    expect(received).toHaveLength(1); expect(sent.filter((message) => message.type === 'cancel')).toHaveLength(2); client.dispose();
  });
  it('replacement stops old execution without suppressing the new job', async () => {
    const output: WorkerResponse[] = [];
    const runner = new JobRunner(async (_, ctx) => { await ctx.checkpoint(); ctx.progress('done', 1); }, (message) => output.push(message));
    await Promise.all([runner.handle(request('a')), runner.handle(request('b'))]);
    expect(output.filter((message) => message.type === 'progress').map((message) => message.jobId)).toEqual(['b']);
  });
  it('transfers an isolated view copy without detaching cached arrays', () => {
    const cached = new Int16Array([3, 5, 7]);
    const copy = transferCopy(cached.subarray(1));
    const transferred = structuredClone(copy, { transfer: [copy] });
    expect(copy.byteLength).toBe(0); expect(cached.byteLength).toBe(6);
    expect(Array.from(new Int16Array(transferred))).toEqual([5, 7]);
  });
});
