const express = require("express");

const hodController = require("../controllers/hodController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleCheck");

const router = express.Router();

router.use(protect);

router.post("/time-table-coordinator/assign", authorize("hod", "admin"), hodController.assignTimeTableCoordinator);
router.post("/attendance-coordinator/assign", authorize("hod", "admin"), hodController.assignAttendanceCoordinator);
router.post("/class-teacher/assign", authorize("hod", "admin"), hodController.assignClassTeacher);
router.put("/attendance-coordinator/update", authorize("hod", "admin"), hodController.updateAttendanceCoordinator);
router.delete("/attendance-coordinator/remove", authorize("hod", "admin"), hodController.removeAttendanceCoordinator);
router.get("/faculty", authorize("hod", "admin", "time_table_coordinator", "attendance_coordinator"), hodController.getDeptFaculty);
router.post("/faculty", authorize("hod", "admin"), hodController.addFaculty);
router.get("/low-attendance", authorize("hod", "admin", "attendance_coordinator"), hodController.getLowAttendanceDept);
router.post("/shortage-list", authorize("hod", "admin", "attendance_coordinator"), hodController.generateShortageList);
router.get("/audit-logs", authorize("hod", "admin"), hodController.getAuditLogs);
router.put("/calendar", authorize("hod", "admin"), hodController.manageDeptCalendar);

module.exports = router;
