import "server-only";

type Bucket = {
  windowStartMs: number;
  count: number;
};

const buckets: Map<string, Bucket> = new Map();

/**
 * Simple in-memory fixed-window rate limiter per key.
 * - Not persisted; process-local only
 * - Good enough for coarse protection of upstream APIs
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): { ok: true } | { ok: false; resetInMs: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket) {
    buckets.set(key, { windowStartMs: now, count: 1 });
    return { ok: true } as const;
  }
  const elapsed = now - bucket.windowStartMs;
  if (elapsed >= windowMs) {
    // reset window
    bucket.windowStartMs = now;
    bucket.count = 1;
    return { ok: true } as const;
  }
  if (bucket.count >= limit) {
    return { ok: false, resetInMs: Math.max(0, windowMs - elapsed) } as const;
  }
  bucket.count += 1;
  return { ok: true } as const;
}

/**
 * Compose a namespaced limiter key
 */
export function limiterKey(parts: (string | number | undefined | null)[]): string {
  return parts.filter((p) => p !== undefined && p !== null && String(p).length > 0).join(":");
}


