const { AppError } = require("../utils/AppError");

const ROLES = {
  STUDENT: "student",
  FACULTY: "faculty",
  ADMIN: "admin",
  HOD: "hod",
  TIME_TABLE_COORDINATOR: "time_table_coordinator",
  ATTENDANCE_COORDINATOR: "attendance_coordinator",
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      throw new AppError(401, "Authentication required");
    }

    if (!roles.includes(req.user.role)) {
      throw new AppError(
        403,
        `Access denied. This route is for: ${roles.join(", ")}`
      );
    }

    next();
  };
};

const isStudent = authorize(ROLES.STUDENT);
const isFaculty = authorize(ROLES.FACULTY);
const isAdmin = authorize(ROLES.ADMIN);
const isHOD = authorize(ROLES.HOD);
const isFacultyOrAdmin = authorize(ROLES.FACULTY, ROLES.ADMIN, ROLES.HOD, ROLES.TIME_TABLE_COORDINATOR, ROLES.ATTENDANCE_COORDINATOR);
const isAdminOrHOD = authorize(ROLES.ADMIN, ROLES.HOD, ROLES.TIME_TABLE_COORDINATOR, ROLES.ATTENDANCE_COORDINATOR);
const isAnyRole = authorize(ROLES.STUDENT, ROLES.FACULTY, ROLES.ADMIN, ROLES.HOD, ROLES.TIME_TABLE_COORDINATOR, ROLES.ATTENDANCE_COORDINATOR);

// Always use protect BEFORE any authorize middleware.
// router.get('/marks', protect, isFaculty, controller)
// router.delete('/user', protect, isAdmin, controller)

module.exports = {
  ROLES,
  authorize,
  isStudent,
  isFaculty,
  isAdmin,
  isHOD,
  isFacultyOrAdmin,
  isAdminOrHOD,
  isAnyRole,
};
