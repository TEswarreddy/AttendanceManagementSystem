const errorHandler = (err, req, res, next) => {
  let statusCode = 500;
  let message = "Something went wrong. Please try again.";
  let errors;
  let stack;

  if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid ID format";
  } else if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Validation failed";
    errors = Object.values(err.errors).map((error) => ({
      field: error.path,
      message: error.message,
    }));
  } else if (err.code === 11000 && err.keyValue) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0] || "Field";
    message = `${field} already exists`;
  } else if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token. Please log in again";
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired. Please log in again";
  } else if (err.isOperational === true) {
    statusCode = err.statusCode || 500;
    message = err.message;
    if (Array.isArray(err.errors) && err.errors.length > 0) {
      errors = err.errors;
    }
  } else {
    statusCode = 500;

    if (process.env.NODE_ENV === "development") {
      message = err.message || "Internal Server Error";
      stack = err.stack;
    } else {
      message = "Something went wrong. Please try again.";
      console.error("Unexpected error:", err);
    }
  }

  const response = {
    success: false,
    statusCode,
    message,
    ...(Array.isArray(errors) && errors.length > 0 && { errors }),
    ...(process.env.NODE_ENV === "development" && stack && { stack }),
  };

  return res.status(statusCode).json(response);
};

module.exports = {
  errorHandler,
};
