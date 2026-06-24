// In-memory cache for Shopee API route responses (per server instance).
// Helps repeat loads / refresh within TTL without re-hitting Shopee.

type Entry = { data: unknown; expires: number };

const store = new Map<string, Entry>();

export function getShopeeCache<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return null;
  }
  return hit.data as T;
}

export function setShopeeCache(key: string, data: unknown, ttlMs = 180_000): void {
  store.set(key, { data, expires: Date.now() + ttlMs });
}

/** Run async tasks with limited concurrency. */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
