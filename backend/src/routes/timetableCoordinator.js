const express = require("express");

const hodController = require("../controllers/hodController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleCheck");

const router = express.Router();

router.use(protect, authorize("time_table_coordinator", "admin"));

router.post("/timetable", hodController.createTimetable);
router.put(
  "/timetable/:id",
  (req, res, next) => {
    req.params.timetableId = req.params.id;
    next();
  },
  hodController.updateTimetable
);

module.exports = router;
