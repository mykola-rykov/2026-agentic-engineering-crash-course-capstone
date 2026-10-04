import { parseWorkerRequest, parseWorkerResponse } from '../contracts/worker';
import type { WorkerRequest, WorkerResponse } from '../contracts/worker';
type JobRequest = Exclude<WorkerRequest, { type: 'cancel' }>;
export interface JobContext {
  readonly jobId: string;
  checkpoint: () => Promise<void>;
  progress: (phase: string, fractionComplete: number) => void;
  emit: (message: WorkerResponse, transfers?: ArrayBuffer[]) => void;
}
export class CancelledJob extends Error {}
export type Executor = (request: JobRequest, context: JobContext) => Promise<void>;

// Yield through a task, not a microtask: worker message events can then run.
const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
export class JobRunner {
  private active: { id: string; cancelled: boolean } | null = null;
  constructor(private readonly execute: Executor, private readonly send: (message: WorkerResponse, transfers: ArrayBuffer[]) => void, private readonly yieldWork = yieldTask) {}
  async handle(value: unknown) {
    const request = parseWorkerRequest(value);
    if (request.type === 'cancel') {
      if (this.active?.id === request.jobId) this.active.cancelled = true;
      return;
    }
    if (this.active) this.active.cancelled = true;
    const job = { id: request.jobId, cancelled: false }; this.active = job;
    const current = () => this.active === job && !job.cancelled;
    const context: JobContext = {
      jobId: job.id,
      checkpoint: async () => { if (!current()) throw new CancelledJob(); await this.yieldWork(); if (!current()) throw new CancelledJob(); },
      progress: (phase, fractionComplete) => { if (current()) this.send(parseWorkerResponse({ protocolVersion: 1, jobId: job.id, type: 'progress', phase, fractionComplete }), []); },
      emit: (message, transfers = []) => {
        if (message.jobId !== job.id) throw new Error('Executor emitted a different job id.');
        if (current()) this.send(parseWorkerResponse(message), transfers);
      },
    };
    try { await this.execute(request, context); }
    catch (error) {
      if (error instanceof CancelledJob || job.cancelled) this.send({ protocolVersion: 1, jobId: job.id, type: 'cancelled' }, []);
      else if (current()) this.send({ protocolVersion: 1, jobId: job.id, type: 'error', code: 'numerical-failure', message: String(error) }, []);
    } finally { if (this.active === job) this.active = null; }
  }
}

export interface WorkerPort {
  postMessage: (message: WorkerRequest, transfers: Transferable[]) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
}
export class JobClient {
  private activeId: string | null = null;
  private counter = 0;
  private readonly listener = (event: MessageEvent) => {
    const message = parseWorkerResponse(event.data);
    if (message.jobId !== this.activeId) return;
    if (message.type === 'result' && message.refinement === 'coarse') this.receive(message);
    else {
      if (['result', 'error', 'cancelled', 'no-route'].includes(message.type)) this.activeId = null;
      this.receive(message);
    }
  };
  constructor(private readonly port: WorkerPort, private readonly receive: (message: WorkerResponse) => void) { port.addEventListener('message', this.listener); }
  start(request: Omit<JobRequest, 'jobId' | 'protocolVersion'>) {
    this.cancel();
    const jobId = `job-${++this.counter}`; this.activeId = jobId;
    this.port.postMessage(parseWorkerRequest({ ...request, protocolVersion: 1, jobId }), []);
    return jobId;
  }
  cancel() {
    if (this.activeId) this.port.postMessage({ protocolVersion: 1, jobId: this.activeId, type: 'cancel' }, []);
    this.activeId = null;
  }
  dispose() { this.cancel(); this.port.removeEventListener('message', this.listener); }
}

// Cache remains owned by its original realm. Only a fresh copy is detached.
export function transferCopy(source: Int16Array | Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(source.byteLength);
  copy.set(new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
  return copy.buffer;
}
