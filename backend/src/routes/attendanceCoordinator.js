const express = require("express");

const controller = require("../controllers/attendanceCoordinatorController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleCheck");

const router = express.Router();

router.use(protect);
router.use(authorize("attendance_coordinator", "hod", "admin"));

router.get("/dashboard", controller.getDashboard);
router.get("/department-classes", controller.getDepartmentClasses);
router.get("/reports/class", controller.getClassAttendanceReports);
router.get("/reports/students", controller.getStudentAttendanceReports);
router.get("/reports/semester", controller.getSemesterReports);
router.get("/reports/monthly", controller.getMonthlyReports);
router.get("/students/below-threshold", controller.getBelowThresholdStudents);
router.get("/students/above-threshold", controller.getAboveThresholdStudents);
router.get("/reports/download", controller.downloadReports);
router.post("/alerts", controller.pushCoordinatorAlert);

module.exports = router;
