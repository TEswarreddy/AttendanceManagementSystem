class AppError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.message = message;
    this.errors = errors;
    this.isOperational = true;
    this.status = statusCode >= 500 ? 'error' : 'fail';

    Error.captureStackTrace(this, this.constructor);
  }
}

const catchAsync = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const createError = (statusCode, message) => new AppError(statusCode, message);

module.exports = {
  AppError,
  catchAsync,
  createError,
};
