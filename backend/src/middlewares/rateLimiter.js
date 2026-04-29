const rateLimit = require("express-rate-limit");
const { AppError } = require("../utils/AppError");

const createLimiter = (options, errorMessage) => {
  return rateLimit({
    ...options,
    message: new AppError(429, errorMessage),
    handler(req, res, next, handlerOptions) {
      return next(handlerOptions.message);
    },
  });
};

const globalLimiter = createLimiter(
  {
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.GLOBAL_RATE_LIMIT_MAX || 1000),
    standardHeaders: true,
    legacyHeaders: false,
  },
  "Too many requests, please try again in 15 minutes"
);

const authLimiter = createLimiter(
  {
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
  },
  "Too many login attempts. Account temporarily locked for 15 minutes"
);

const reportLimiter = createLimiter(
  {
    windowMs: 60 * 60 * 1000,
    max: Number(process.env.REPORT_RATE_LIMIT_MAX || 20),
  },
  "Report generation limit reached. Try again in an hour"
);

const markAttendanceLimiter = createLimiter(
  {
    windowMs: 60 * 1000,
    max: 30,
  },
  "Attendance marking rate exceeded"
);

module.exports = {
  globalLimiter,
  authLimiter,
  reportLimiter,
  markAttendanceLimiter,
};
