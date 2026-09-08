import { redis } from '../config/redis';

/**
 * Lua script for atomic rate-limit check + increment.
 *
 * Logic:
 *   1. INCR the key (atomic, returns new value)
 *   2. If it became 1 (first increment this window), set EXPIRE 3600
 *   3. If value > max, DECR to roll back and return 0 (over limit)
 *   4. Otherwise return the new count (allowed)
 *
 * Using a Lua script ensures atomicity across multiple concurrent
 * worker processes — no TOCTOU race conditions.
 *
 * KEYS[1]: the rate-limit Redis key, e.g. ratelimit:{senderId}:{yyyyMMddHH}
 * ARGV[1]: maxEmailsPerHour (string, converted to number inside Lua)
 */
const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local max = tonumber(ARGV[1])
local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, 3600)
end
if current > max then
  redis.call('DECR', key)
  return 0
end
return current
`;

/**
 * Attempt to increment the rate-limit counter for a given key.
 *
 * @returns 0 if the limit was exceeded (caller should reschedule),
 *          or the new counter value (> 0) if allowed.
 */
export async function checkAndIncrementRateLimit(
  key: string,
  maxPerHour: number,
): Promise<number> {
  const result = await redis.eval(RATE_LIMIT_SCRIPT, 1, key, String(maxPerHour));
  return result as number;
}

/**
 * Returns the Redis key for the hourly rate-limit counter.
 * Key is scoped to sender + UTC hour to avoid timezone skew across workers.
 */
export function getRateLimitKey(senderId: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const h = String(now.getUTCHours()).padStart(2, '0');
  return `ratelimit:${senderId}:${y}${m}${d}${h}`;
}
