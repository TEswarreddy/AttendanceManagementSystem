const jwtHelper = require("../utils/jwtHelper");
const { get } = require("../config/redis");
const { User } = require("../models");
const { AppError, catchAsync } = require("../utils/AppError");

const extractBearerToken = (authorizationHeader) => {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.split(" ")[1] || null;
};

const protect = catchAsync(async (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    throw new AppError(401, "Please log in to access this resource");
  }

  const decoded = jwtHelper.verifyAccessToken(token);

  const blacklistedToken = await get(`blacklist:${token}`);
  if (blacklistedToken) {
    throw new AppError(401, "Token invalidated. Please log in again");
  }

  const user = await User.findById(decoded.id).select("+passwordHash");
  if (!user || user.isActive === false) {
    throw new AppError(401, "User no longer exists");
  }

  if (user.changedPasswordAfter(decoded.iat)) {
    throw new AppError(401, "Password recently changed. Please log in again");
  }

  req.user = user;
  req.token = token;
  next();
});

const optionalAuth = catchAsync(async (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    next();
    return;
  }

  try {
    const decoded = jwtHelper.verifyAccessToken(token);

    const blacklistedToken = await get(`blacklist:${token}`);
    if (blacklistedToken) {
      next();
      return;
    }

    const user = await User.findById(decoded.id).select("+passwordHash");
    if (!user || user.isActive === false) {
      next();
      return;
    }

    if (user.changedPasswordAfter(decoded.iat)) {
      next();
      return;
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    next();
  }
});

const restrictToSelf = catchAsync(async (req, res, next) => {
  if (!req.user) {
    throw new AppError(401, "Please log in to access this resource");
  }

  const requestedId = req.params.studentId || req.params.facultyId;
  const isSelf = req.user._id.toString() === requestedId;
  const isElevatedRole = req.user.role === "admin" || req.user.role === "hod" || req.user.role === "time_table_coordinator" || req.user.role === "attendance_coordinator";

  if (!isSelf && !isElevatedRole) {
    throw new AppError(403, "You can only access your own data");
  }

  next();
});

module.exports = {
  protect,
  optionalAuth,
  restrictToSelf,
};
