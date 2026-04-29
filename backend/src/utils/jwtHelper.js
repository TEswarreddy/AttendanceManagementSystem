const jwt = require('jsonwebtoken');
const { AppError } = require('./AppError');

const generateAccessToken = (payload) => {
  const accessPayload = {
    id: payload.id,
    email: payload.email,
    role: payload.role,
    profileId: payload.profileId,
  };

  return jwt.sign(accessPayload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const generateRefreshToken = (payload) => {
  return jwt.sign({ id: payload.id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  });
};

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError(401, 'Token expired');
    }

    throw new AppError(401, 'Invalid token');
  }
};

const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError(401, 'Refresh token expired');
    }

    throw new AppError(401, 'Invalid refresh token');
  }
};

const generateTokenPair = (user) => {
  const accessPayload = {
    id: user._id,
    email: user.email,
    role: user.role,
    profileId: user.profileId,
  };

  return {
    accessToken: generateAccessToken(accessPayload),
    refreshToken: generateRefreshToken({ id: user._id }),
  };
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTokenPair,
};
