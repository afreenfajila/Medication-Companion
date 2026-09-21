// Prototype-grade in-memory limiter: per-key sliding window. On serverless it is
// per-instance (best effort), which is acceptable for a demo cost guard.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit = 10, windowMs = 60_000, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear(); // bound memory
  return true;
}

export function resetRateLimit(): void {
  hits.clear();
}
