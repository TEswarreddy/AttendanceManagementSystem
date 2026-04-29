const express = require("express");

const notificationController = require("../controllers/notificationController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleCheck");

const router = express.Router();

router.use(
  protect,
  authorize("student", "faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator", "hod", "admin", "principal")
);

router.get("/", notificationController.getNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.put("/read-all", notificationController.markAllAsRead);
router.put("/:notificationId/read", notificationController.markAsRead);

module.exports = router;
