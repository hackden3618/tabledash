const store = new Map<string, { count: number; resetAt: number }>();
const MAX_TRACKED_KEYS = 10_000;

export const rateLimiter = (opts: { windowMs: number; maxAttempts: number }) => {
  return (key: string): { allowed: boolean; remaining: number; resetIn: number } => {
    const now = Date.now();
    if (store.size > MAX_TRACKED_KEYS) {
      for (const [storedKey, storedRecord] of store) {
        if (storedRecord.resetAt <= now) store.delete(storedKey);
        if (store.size <= MAX_TRACKED_KEYS) break;
      }
    }
    const record = store.get(key);

    if (!record || now > record.resetAt) {
      store.set(key, { count: 1, resetAt: now + opts.windowMs });
      return { allowed: true, remaining: opts.maxAttempts - 1, resetIn: opts.windowMs };
    }

    record.count += 1;
    if (record.count > opts.maxAttempts) {
      return { allowed: false, remaining: 0, resetIn: record.resetAt - now };
    }

    return { allowed: true, remaining: opts.maxAttempts - record.count, resetIn: record.resetAt - now };
  };
};

export const AUTH_LIMITER = rateLimiter({ windowMs: 60_000, maxAttempts: 5 });
