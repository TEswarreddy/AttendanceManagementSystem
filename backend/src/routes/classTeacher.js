const express = require("express");

const classTeacherController = require("../controllers/classTeacherController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleCheck");

const router = express.Router();

router.use(protect, authorize("class_teacher", "hod", "admin"));

router.get("/timetable", classTeacherController.getAssignedClassTimetables);
router.get("/daily-attendance", classTeacherController.getDailyClassAttendance);
router.post("/send-absent-sms", classTeacherController.triggerAbsentSMS);
router.post("/students", classTeacherController.addStudent);
router.put("/students/:studentId", classTeacherController.updateStudent);
router.get("/students", classTeacherController.getClassStudents);
router.post("/notices", classTeacherController.sendClassNotice);
router.get("/notices", classTeacherController.getNoticeHistory);
router.get("/leave-requests", classTeacherController.getLeaveRequests);
router.get("/monthly-alerts", classTeacherController.getMonthlyLowAttendance);
router.post("/monthly-alerts", classTeacherController.triggerMonthlyAlerts);
router.get("/reports/monthly", classTeacherController.downloadMonthlyReport);
router.get("/reports/semester", classTeacherController.downloadSemesterReport);

module.exports = router;
