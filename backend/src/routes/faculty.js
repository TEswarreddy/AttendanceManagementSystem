const express = require("express");

const facultyController = require("../controllers/facultyController");
const adminController = require("../controllers/adminController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleCheck");

const router = express.Router();

router.use(protect);

router.get("/", authorize("admin", "hod"), adminController.getFaculty);
router.post("/", authorize("admin", "hod"), adminController.createFaculty);
router.put("/:id", authorize("admin", "hod"), adminController.updateFaculty);
router.delete("/:id", authorize("admin", "hod"), adminController.deactivateFaculty);

router.use(authorize("faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator", "hod", "admin"));

router.post("/attendance/mark", facultyController.markPeriodAttendance);
router.get("/attendance/period", facultyController.getPeriodAttendanceStatus);
router.get("/attendance/summary", facultyController.getSubjectSummary);
router.get("/timetable", facultyController.getFacultyTimetable);
router.get(
	"/assigned-classes",
	authorize("faculty", "time_table_coordinator", "attendance_coordinator"),
	facultyController.getFacultyAssignedClasses
);

module.exports = router;
