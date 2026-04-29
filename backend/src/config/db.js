const { connectDB, disconnectDB, mongoose } = require("./mongodb");

module.exports = {
  connectDB,
  disconnectDB,
  mongoose,
};
