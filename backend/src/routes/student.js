const express = require("express");

const studentController = require("../controllers/studentController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleCheck");

const router = express.Router();

router.use(protect, authorize("student"));

router.get("/today-attendance", studentController.getTodayAttendance);
router.get("/attendance-summary", studentController.getAttendanceSummary);
router.get("/attendance/:subjectId", studentController.getSubjectAttendanceDetail);
router.get("/timetable", studentController.getTimetable);
router.get("/notifications", studentController.getNotifications);
router.get("/leaves", studentController.getLeaveHistory);

module.exports = router;
