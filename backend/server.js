const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.join(__dirname, ".env") });

const app = require("./src/app");
const { connectDB, disconnectDB } = require("./src/config/db");
const { seedIndexes } = require("./src/models");
const { connectRedis, disconnectRedis, redisClient } = require("./src/config/redis");
const { registerAllCronJobs } = require("./src/jobs/cronJobs");

const PORT = process.env.PORT || 5000;
let server;

const shutdown = async (signal) => {
  console.log(`${signal} received. Starting graceful shutdown...`);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            return reject(error);
          }
          return resolve();
        });
      });
      console.log("HTTP server closed.");
    }

    await disconnectDB();
    console.log("MongoDB connection closed.");

    if (redisClient.status !== "end") {
      await disconnectRedis();
    }

    process.exit(0);
  } catch (error) {
    console.error("Graceful shutdown failed:", error.message);
    process.exit(1);
  }
};

const startServer = async () => {
  try {
    await connectDB();
    await seedIndexes();
    try {
      await connectRedis();
    } catch (error) {
      console.warn(`Redis unavailable, continuing without cache: ${error.message}`);
    }

    server = app.listen(PORT, () => {
      console.log(`Server started successfully on port ${PORT}`);
      registerAllCronJobs(app);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

startServer();
