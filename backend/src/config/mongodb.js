const mongoose = require("mongoose");
const dns = require("dns");

let isListenersRegistered = false;

const dropLegacyAttendanceSessionIndex = async () => {
  try {
    const collection = mongoose.connection.collection("attendances");
    const indexes = await collection.indexes();

    const legacyIndex = indexes.find((index) => {
      const keys = Object.keys(index.key || {});
      return (
        index.unique === true &&
        keys.length === 4 &&
        keys.includes("studentId") &&
        keys.includes("subjectId") &&
        keys.includes("date") &&
        keys.includes("session")
      );
    });

    if (!legacyIndex) {
      return;
    }

    await collection.dropIndex(legacyIndex.name);
    console.info(`Dropped legacy attendance index: ${legacyIndex.name}`);
  } catch (error) {
    const notFound =
      error?.codeName === "IndexNotFound" ||
      error?.code === 27 ||
      String(error?.message || "").includes("index not found");

    if (!notFound) {
      throw error;
    }
  }
};

const registerConnectionListeners = () => {
  if (isListenersRegistered) {
    return;
  }

  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB Atlas disconnected.");
  });

  mongoose.connection.on("reconnected", () => {
    console.info("MongoDB Atlas reconnected.");
  });

  mongoose.connection.on("error", (error) => {
    console.error("MongoDB Atlas connection error:", error.message);
  });

  isListenersRegistered = true;
};

const connectDB = async () => {
  try {
    if (process.env.MONGO_DNS_SERVERS) {
      dns.setServers(
        process.env.MONGO_DNS_SERVERS.split(",")
          .map((server) => server.trim())
          .filter(Boolean)
      );
    }

    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error("MongoDB URI is missing. Set MONGODB_URI in .env");
    }

    registerConnectionListeners();

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    await dropLegacyAttendanceSessionIndex();

    console.log("MongoDB Atlas connected:", mongoose.connection.host);
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
};

const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
};

module.exports = {
  connectDB,
  disconnectDB,
  mongoose,
};
