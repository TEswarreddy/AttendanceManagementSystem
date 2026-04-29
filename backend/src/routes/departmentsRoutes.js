const express = require("express");

const adminController = require("../controllers/adminController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleCheck");

const router = express.Router();

router.use(protect);
router.get("/", authorize("admin", "principal", "hod", "faculty"), adminController.getDepartments);
router.post("/", authorize("admin", "principal"), adminController.createDepartment);
router.put("/:id", authorize("admin", "principal"), adminController.updateDepartment);
router.delete("/:id", authorize("admin", "principal"), adminController.deactivateDepartment);

module.exports = router;
