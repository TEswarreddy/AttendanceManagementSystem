const dotenv = require("dotenv");
const path = require("path");
const mongoose = require("mongoose");

dotenv.config({ path: path.join(__dirname, "../../.env") });

const connectDatabase = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is required to clear database.");
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
  });

  console.log("✓ Connected to MongoDB");
};

const clearAllData = async () => {
  try {
    console.log("🗑️  Starting database cleanup...\n");

    const db = mongoose.connection.db;
    const collectionsInfo = await db.listCollections().toArray();

    let collectionCount = 0;

    for (const collectionInfo of collectionsInfo) {
      const collectionName = collectionInfo.name;
      
      // Skip system collections
      if (collectionName.startsWith("system.")) {
        continue;
      }

      const result = await db.collection(collectionName).deleteMany({});
      console.log(`✓ Cleared collection: ${collectionName} (${result.deletedCount} documents removed)`);
      collectionCount++;
    }

    console.log(`\n✅ Successfully cleared ${collectionCount} collections from MongoDB!`);
  } catch (error) {
    console.error("❌ Error clearing MongoDB:", error.message);
    throw error;
  }
};

const clearRedisCache = async () => {
  // Skip Redis clearing if not available - it's optional
  return;
  // Uncomment below if you have Redis running:
  /*
  try {
    const redis = require("redis");
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    
    const client = redis.createClient({ url: redisUrl });
    client.on("error", () => null); // Suppress errors
    
    const connected = await Promise.race([
      client.connect().then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 2000))
    ]);

    if (connected) {
      await client.flushAll();
      console.log("✓ Cleared Redis cache");
      await client.quit();
    }
  } catch (error) {
    // Silently skip Redis
  }
  */
};

const main = async () => {
  try {
    await connectDatabase();
    await clearAllData();
    await clearRedisCache();
    
    console.log("\n🎉 All seeded data has been successfully removed!");
    console.log("Database is now clean and ready for fresh data.\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Cleanup failed:", error.message);
    process.exit(1);
  } finally {
    try {
      await mongoose.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
  }
};

main();
