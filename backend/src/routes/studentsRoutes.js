const express = require("express");
const multer = require("multer");
const adminController = require("../controllers/adminController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleCheck");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.use(protect);

router.get("/", authorize("admin", "hod", "faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator"), adminController.getStudents);
router.post("/", authorize("admin", "hod"), adminController.createStudent);
router.post("/bulk-upload", authorize("admin", "hod"), upload.single("file"), adminController.bulkCreateStudents);
router.put("/:id", authorize("admin", "hod"), adminController.updateStudent);
router.put("/:id/deactivate", authorize("admin", "hod"), adminController.deactivateStudent);

module.exports = router;
