const express = require("express");
const { body } = require("express-validator");
const { catchAsync } = require("../utils/AppError");
const { sendSuccess } = require("../utils/responseHelper");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleCheck");
const { validate } = require("../middlewares/validate");
const qrService = require("../services/qrService");

const router = express.Router();

const qrController = {
  generate: catchAsync(async (req, res) => {
    const { subjectId, periodNumber, date } = req.body;
    const result = await qrService.generateQRSession(
      req.user.profileId,
      subjectId,
      periodNumber,
      date
    );
    sendSuccess(res, 201, "QR session created", result);
  }),

  scan: catchAsync(async (req, res) => {
    const { token } = req.body;
    const result = await qrService.validateAndMarkQRScan(req.user, token);
    sendSuccess(res, 200, "Attendance marked via QR", result);
  }),

  status: catchAsync(async (req, res) => {
    const result = await qrService.getQRSessionStatus(req.params.sessionId);
    sendSuccess(res, 200, "QR session status", result);
  }),

  close: catchAsync(async (req, res) => {
    const result = await qrService.closeQRSession(
      req.params.sessionId,
      req.user.profileId
    );
    sendSuccess(res, 200, "QR session closed", result);
  }),
};

router.post(
  "/generate",
  protect,
  authorize("faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator"),
  validate([
    body("subjectId").isMongoId(),
    body("periodNumber").isInt({ min: 1, max: 8 }),
    body("date").isISO8601(),
  ]),
  qrController.generate
);

router.post(
  "/scan",
  protect,
  authorize("student"),
  validate([body("token").notEmpty()]),
  qrController.scan
);

router.get(
  "/status/:sessionId",
  protect,
  authorize("faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator"),
  qrController.status
);

router.post(
  "/close/:sessionId",
  protect,
  authorize("faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator"),
  qrController.close
);

module.exports = router;
