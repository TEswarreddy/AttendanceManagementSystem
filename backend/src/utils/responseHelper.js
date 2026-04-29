const sendSuccess = (res, statusCode, message, data = {}, meta = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...(Object.keys(meta).length && { meta }),
  });
};

const sendError = (res, statusCode, message, errors = []) => {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(errors.length && { errors }),
  });
};

const sendPaginated = (res, statusCode, message, data = [], meta = {}) => {
  return sendSuccess(res, statusCode, message, data, meta);
};

module.exports = {
  sendSuccess,
  sendError,
  sendPaginated,
};
