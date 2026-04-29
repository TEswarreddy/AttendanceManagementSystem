const express = require("express");
const attendanceController = require("../controllers/attendanceController");
const { protect, restrictToSelf } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleCheck");
const { validate, markAttendanceRules } = require("../middlewares/validate");
const { markAttendanceLimiter } = require("../middlewares/rateLimiter");

const router = express.Router();

/*
 * Attendance Routes
 *
 * POST   /mark                         faculty                Mark attendance for a class session
 * GET    /class                        faculty/admin/hod      View class attendance for a subject/date/session
 * GET    /student/:studentId           student/faculty/admin/hod  View student attendance summary
 * GET    /student/:studentId/subject/:subjectId faculty/admin/hod      View subject-specific attendance details
 * PUT    /:attendanceId                faculty                Edit attendance within edit window
 * PUT    /admin/:attendanceId          admin/hod              Correct attendance without edit window restriction
 * GET    /:attendanceId/history        faculty/admin/hod      View attendance audit history
 * GET    /department/stats             admin/hod              Department-level attendance analytics
 * GET    /subject/:subjectId/report     faculty/admin/hod      Detailed subject attendance report
 * GET    /low-attendance               faculty/admin/hod      Paginated low-attendance students report
 */

router.use(protect);

router.post(
	"/mark",
	markAttendanceLimiter,
	authorize("faculty", "time_table_coordinator", "attendance_coordinator"),
	validate(markAttendanceRules),
	attendanceController.markAttendance
);

router.get(
	"/class",
	authorize("faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator", "admin", "hod"),
	attendanceController.getClassAttendance
);

router.get(
	"/student/:studentId",
	(req, res, next) => {
		if (req.user.role === "student") {
			return restrictToSelf(req, res, next);
		}

		return authorize("faculty", "time_table_coordinator", "attendance_coordinator", "admin", "hod")(req, res, next);
	},
	attendanceController.getStudentAttendance
);

router.get(
	"/student/:studentId/subject/:subjectId",
	authorize("faculty", "time_table_coordinator", "attendance_coordinator", "admin", "hod"),
	attendanceController.getStudentAttendanceBySubject
);

router.put(
	"/admin/:attendanceId",
	authorize("admin", "hod"),
	attendanceController.adminEditAttendance
);

router.put(
	"/:attendanceId",
	authorize("faculty", "time_table_coordinator", "attendance_coordinator"),
	attendanceController.editAttendance
);

router.get(
	"/:attendanceId/history",
	authorize("faculty", "time_table_coordinator", "attendance_coordinator", "admin", "hod"),
	attendanceController.getAttendanceHistory
);

router.get(
	"/department/stats",
	authorize("admin", "hod", "attendance_coordinator"),
	attendanceController.getDepartmentAttendanceStats
);

router.get(
	"/subject/:subjectId/report",
	authorize("faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator", "admin", "hod"),
	attendanceController.getSubjectDetailedReport
);

router.get(
	"/low-attendance",
	authorize("faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator", "admin", "hod"),
	attendanceController.getLowAttendanceStudents
);

module.exports = router;
