import type { CallbackPayload } from "@/lib/dose-check/dose-check";

// The dose-check callback request (Assignment 4), behind its own interface like
// every outside system. The only implementation is simulated and runs in the
// browser: nothing is sent anywhere, no pharmacist is contacted.
//
// Deduplication scope (site-contract §17): an in-memory map in this browser tab.
// It is lost on reload and is not production-grade idempotency.

/**
 * "failed" is a definite non-delivery. "unknown" means no definite answer —
 * the request may or may not have gone through, so neither may be claimed.
 */
export type CallbackResult = { status: "submitted"; reference: string } | { status: "failed" } | { status: "unknown" };

/** Reviewer scenarios only: how the simulated service answers the first attempt for a request. */
export type SimulatedOutcome = "success" | "fail-once" | "unknown-once";

export interface DoseCallbackService {
  submit(payload: CallbackPayload, opts?: { outcome?: SimulatedOutcome }): Promise<CallbackResult>;
}

export class SimulatedDoseCallbackService implements DoseCallbackService {
  /** What each request ID was "delivered" with — a repeat returns the same result (idempotency). */
  private readonly delivered = new Map<string, string>();
  /** The exact content first sent under each request ID: the same ID with other content is refused. */
  private readonly contentById = new Map<string, string>();
  private readonly attempts = new Map<string, number>();
  /** A request already on its way: asking again (a double tap, a re-run effect) waits for the same answer. */
  private readonly inflight = new Map<string, Promise<CallbackResult>>();
  /** Every payload that reached the service, for tests (in memory only). */
  readonly received: CallbackPayload[] = [];

  constructor(private readonly delayMs = 1200) {}

  submit(payload: CallbackPayload, opts: { outcome?: SimulatedOutcome } = {}): Promise<CallbackResult> {
    const pending = this.inflight.get(payload.requestId);
    if (pending) return pending;
    const attempt = this.attempt(payload, opts.outcome ?? "success").finally(() =>
      this.inflight.delete(payload.requestId),
    );
    this.inflight.set(payload.requestId, attempt);
    return attempt;
  }

  private async attempt(payload: CallbackPayload, outcome: SimulatedOutcome): Promise<CallbackResult> {
    this.received.push(payload);
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    const content = JSON.stringify(payload);
    const seen = this.contentById.get(payload.requestId);
    if (seen !== undefined && seen !== content) return { status: "failed" }; // same key, different content: refused
    this.contentById.set(payload.requestId, content);

    const done = this.delivered.get(payload.requestId);
    if (done) return { status: "submitted", reference: done };
    const n = (this.attempts.get(payload.requestId) ?? 0) + 1;
    this.attempts.set(payload.requestId, n);
    if (outcome === "fail-once" && n === 1) return { status: "failed" };
    const reference = `SIM-${String(this.delivered.size + 1).padStart(4, "0")}`;
    this.delivered.set(payload.requestId, reference);
    // Delivered, but the answer "got lost": the next try with the same ID finds it already done.
    if (outcome === "unknown-once" && n === 1) return { status: "unknown" };
    return { status: "submitted", reference };
  }

  /** Logical requests delivered (one per request ID, however many times Send was pressed). */
  get deliveredCount(): number {
    return this.delivered.size;
  }
}

let instance: DoseCallbackService = new SimulatedDoseCallbackService();
export const getDoseCallbackService = () => instance;
/** Test helper. */
export function setDoseCallbackServiceForTest(service: DoseCallbackService): void {
  instance = service;
}
