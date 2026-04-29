const express = require("express");

const adminController = require("../controllers/adminController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleCheck");

const router = express.Router();

router.use(protect);

router.get("/", authorize("admin", "hod", "faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator"), adminController.getSubjects);
router.post("/", authorize("admin", "hod"), adminController.createSubject);
router.put("/:id", authorize("admin", "hod"), adminController.updateSubject);
router.delete("/:id", authorize("admin", "hod"), adminController.deactivateSubject);

module.exports = router;
