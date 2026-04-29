const express = require("express");

const { AppError } = require("../utils/AppError");
const { authorize } = require("../middlewares/roleCheck");
const { protect } = require("../middlewares/authMiddleware");
const { reportLimiter } = require("../middlewares/rateLimiter");
const reportsController = require("../controllers/reportsController");

const router = express.Router();

router.use(reportLimiter);
router.use(protect);

// Student report downloads restricted to staff only
router.get("/student/:studentId/pdf", authorize("faculty", "time_table_coordinator", "attendance_coordinator", "admin", "hod"), reportsController.downloadStudentPDF);
router.get("/student/:studentId/excel", authorize("faculty", "time_table_coordinator", "attendance_coordinator", "admin", "hod"), reportsController.downloadStudentExcel);
router.get("/class/pdf", authorize("faculty", "time_table_coordinator", "attendance_coordinator", "admin", "hod"), reportsController.downloadClassPDF);
router.get("/class/excel", authorize("faculty", "time_table_coordinator", "attendance_coordinator", "admin", "hod"), reportsController.downloadClassExcel);
router.get("/department/pdf", authorize("admin", "hod", "attendance_coordinator"), reportsController.downloadDepartmentPDF);
router.get("/department/excel", authorize("admin", "hod", "attendance_coordinator"), reportsController.downloadDepartmentExcel);
router.post("/alerts/trigger", authorize("admin"), reportsController.triggerAlerts);
router.get("/dashboard/stats", authorize("admin"), reportsController.getDashboardStats);

module.exports = router;
