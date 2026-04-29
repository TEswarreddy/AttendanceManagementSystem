const Redis = require("ioredis");

const { AppError } = require("../utils/AppError");

const redisHost = process.env.REDIS_HOST || "127.0.0.1";
const redisPort = Number(process.env.REDIS_PORT || 6379);
const isRemoteRedis =
  process.env.REDIS_TLS === "true" ||
  redisHost.includes("upstash.io") ||
  redisHost.includes("redis.cloud");

const redisOptions = {
  host: redisHost,
  port: redisPort,
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(100 * 2 ** (times - 1), 3000);
  },
};

if (isRemoteRedis) {
  redisOptions.tls = {
    servername: redisHost,
  };
}

const redisClient = new Redis(redisOptions);

redisClient.on("connect", () => {
  console.log("Redis connected successfully.");
});

redisClient.on("error", (error) => {
  console.warn("Redis warning:", error.message);
});

redisClient.on("reconnecting", (delay) => {
  console.warn(`Redis reconnecting in ${delay}ms...`);
});

const throwCacheUnavailable = () => {
  throw new AppError(503, "Cache unavailable");
};

const setEx = async (key, seconds, value) => {
  try {
    await redisClient.set(key, value, "EX", seconds);
  } catch (error) {
    throwCacheUnavailable();
  }
};

const get = async (key) => {
  try {
    return await redisClient.get(key);
  } catch (error) {
    throwCacheUnavailable();
  }
};

const del = async (key) => {
  try {
    await redisClient.del(key);
  } catch (error) {
    throwCacheUnavailable();
  }
};

const exists = async (key) => {
  try {
    const result = await redisClient.exists(key);
    return result === 1;
  } catch (error) {
    throwCacheUnavailable();
  }
};

const setAdd = async (key, member, ttlSeconds) => {
  try {
    await redisClient.sadd(key, member);
    await redisClient.expire(key, ttlSeconds);
  } catch (error) {
    throwCacheUnavailable();
  }
};

const setMembers = async (key) => {
  try {
    return await redisClient.smembers(key);
  } catch (error) {
    throwCacheUnavailable();
  }
};

const connectRedis = async () => {
  try {
    if (redisClient.status === "ready") {
      return redisClient;
    }

    await redisClient.connect();
    console.log("Redis client is ready.");
    return redisClient;
  } catch (error) {
    throw new Error(`Redis connection failed: ${error.message}`);
  }
};

const disconnectRedis = async () => {
  try {
    if (redisClient.status === "end") {
      return;
    }

    await redisClient.quit();
    console.log("Redis disconnected gracefully.");
  } catch (error) {
    try {
      redisClient.disconnect();
    } catch (disconnectError) {
      // Ignore forced disconnect errors during shutdown cleanup.
    }
  }
};

module.exports = {
  setEx,
  get,
  del,
  exists,
  setAdd,
  setMembers,
  connectRedis,
  disconnectRedis,
  redisClient,
};
