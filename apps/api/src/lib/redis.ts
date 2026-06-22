import Redis from "ioredis";

let _redis: Redis | undefined;

export function getRedis(): Redis {
  if (!_redis) {
    const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    _redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => {
        if (times > 10) return null;
        return Math.min(times * 100, 3000);
      },
    });

    _redis.on("error", (err) => {
      console.error("Redis error:", err);
    });
  }
  return _redis;
}

export async function closeRedis() {
  if (_redis) {
    await _redis.quit();
    _redis = undefined;
  }
}
