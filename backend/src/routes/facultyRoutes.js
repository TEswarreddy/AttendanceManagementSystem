const express = require("express");

const adminController = require("../controllers/adminController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleCheck");

const router = express.Router();

router.use(protect);

router.get("/", authorize("admin", "hod"), adminController.getFaculty);
router.post("/", authorize("admin", "hod"), adminController.createFaculty);
router.put("/:id", authorize("admin", "hod"), adminController.updateFaculty);

module.exports = router;
