const { body, validationResult } = require("express-validator");
const { AppError } = require("../utils/AppError");

const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map((validation) => validation.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError(
        400,
        "Validation failed",
        errors.array().map((error) => ({
          field: error.path,
          message: error.msg,
        }))
      );
    }

    next();
  };
};

const loginRules = [
  body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
  body("password").notEmpty().withMessage("Password required"),
];

const registerStudentRules = [
  body("name").trim().notEmpty().isLength({ min: 2, max: 100 }),
  body("email").isEmail().normalizeEmail(),
  body("rollNumber").trim().notEmpty().toUpperCase(),
  body("phone").optional().isMobilePhone("en-IN"),
  body("departmentId").isMongoId().withMessage("Valid department ID required"),
  body("semester").isInt({ min: 1, max: 8 }),
  body("section").trim().notEmpty().toUpperCase().isLength({ max: 2 }),
  body("batch")
    .matches(/^\d{4}-\d{4}$/)
    .withMessage("Batch format: 2022-2026"),
];

const changePasswordRules = [
  body("currentPassword").notEmpty(),
  body("newPassword")
    .isLength({ min: 8 })
    .matches(/^(?=.*[A-Z])(?=.*[0-9])/)
    .withMessage("Min 8 chars, 1 uppercase, 1 number"),
];

const markAttendanceRules = [
  body("subjectId").isMongoId(),
  body("date").isISO8601().toDate(),
  body("session").isIn(["morning", "afternoon"]),
  body("records").isArray({ min: 1 }),
  body("records.*.studentId").isMongoId(),
  body("records.*.status").isIn(["P", "A", "L", "ML"]),
];

const forgotPasswordRules = [body("email").isEmail().normalizeEmail()];

const resetPasswordRules = [
  body("otp").isLength({ min: 6, max: 6 }).isNumeric(),
  body("newPassword")
    .isLength({ min: 8 })
    .matches(/^(?=.*[A-Z])(?=.*[0-9])/),
];

module.exports = {
  validate,
  loginRules,
  registerStudentRules,
  changePasswordRules,
  markAttendanceRules,
  forgotPasswordRules,
  resetPasswordRules,
};
