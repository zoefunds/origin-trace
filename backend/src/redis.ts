import { Redis } from "ioredis";

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL is not set");
}

export const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  // Upstash closes idle TCP connections; ioredis reconnects automatically,
  // but keep the backoff bounded so a Redis blip never blocks the poller
  // loop for more than a few seconds.
  retryStrategy: (times: number) => Math.min(times * 200, 3000),
});

redis.on("error", (err: Error) => {
  // Redis is a cache/rate-limit guard, never the source of truth — log and
  // keep running. A Redis outage degrades to "poll less efficiently and
  // skip caching," never a hard crash of the backend.
  console.error("[redis] connection error:", err.message);
});

/**
 * GenLayer enforces a hard 5000 requests/day ceiling. This backend is the
 * ONLY thing that talks to GenLayer RPC directly (the frontend always reads
 * through this backend's cached API instead), so this counter is the single
 * choke point that protects the whole app from an outage caused by burning
 * through the daily quota.
 *
 * DAILY_BUDGET is set comfortably under the real 5000 ceiling to leave
 * headroom for the user's own manual `genlayer call`/`genlayer write`
 * usage and for retries.
 */
const DAILY_BUDGET = 4000;

function todayKey(): string {
  const d = new Date();
  return `genlayer:rpc_count:${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

export async function tryReserveGenlayerRequest(cost = 1): Promise<boolean> {
  try {
    const key = todayKey();
    const count = await redis.incrby(key, cost);
    if (count === cost) {
      // first increment of the day -- set expiry so the counter self-resets
      await redis.expire(key, 60 * 60 * 26); // 26h safety margin over a UTC day
    }
    if (count > DAILY_BUDGET) {
      // Over budget -- undo this reservation and refuse the call. Callers
      // must fall back to serving stale cached/DB data instead of hitting
      // GenLayer RPC.
      await redis.decrby(key, cost);
      return false;
    }
    return true;
  } catch (err) {
    // If Redis itself is down we cannot safely count requests. Fail CLOSED
    // for write-triggering paths is wrong here (this is a read-side guard
    // for the poller only, never gates user-submitted transactions), so we
    // allow the call through rather than stalling the whole indexer on a
    // Redis outage -- the actual GenLayer-side rate limit still applies as
    // the hard backstop.
    console.error("[redis] rate-limit reservation failed, allowing call:", err);
    return true;
  }
}

export async function getGenlayerBudgetRemaining(): Promise<number> {
  try {
    const used = Number((await redis.get(todayKey())) ?? 0);
    return Math.max(0, DAILY_BUDGET - used);
  } catch {
    return DAILY_BUDGET;
  }
}

/** Generic read-through cache helper for contract view calls. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch (err) {
    console.error(`[redis] cache read failed for ${key}:`, err);
  }

  const value = await fetcher();

  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    console.error(`[redis] cache write failed for ${key}:`, err);
  }

  return value;
}
