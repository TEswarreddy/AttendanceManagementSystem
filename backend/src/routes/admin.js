const express = require("express");

const adminController = require("../controllers/adminController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleCheck");

const router = express.Router();

router.use(protect, authorize("admin", "principal"));

router.get("/dashboard", adminController.getDashboardOverview);
router.post("/hods", adminController.manageHODs);
router.put("/hods", adminController.manageHODs);
router.delete("/hods", adminController.manageHODs);
router.post("/hods/create", adminController.createHODWithAccount);
router.post("/faculty/create", adminController.createFacultyWithAccount);
router.put("/threshold", adminController.setAttendanceThreshold);
router.put("/academic-year", adminController.manageAcademicYear);
router.get("/reports/college", adminController.generateCollegeReport);
router.post("/eligibility", adminController.generateEligibilityReport);
router.get("/roles", adminController.getRoleManagement);
router.put("/roles/:userId", adminController.updateUserRole);
router.get("/audit-logs", adminController.getSystemAuditLogs);
router.get("/stats", adminController.getCollegeDashboardStats);

module.exports = router;
