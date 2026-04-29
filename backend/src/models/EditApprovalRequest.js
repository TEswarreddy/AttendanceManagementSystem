const mongoose = require("mongoose");

const STATUS_VALUES = ["P", "A", "L", "ML"];

const editApprovalRequestSchema = new mongoose.Schema(
  {
    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attendance",
      required: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    date: {
      type: Date,
      required: true,
      set: (value) => {
        const parsedDate = new Date(value);
        if (Number.isNaN(parsedDate.getTime())) {
          return value;
        }

        return new Date(
          Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate())
        );
      },
    },
    periodNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },
    currentStatus: {
      type: String,
      enum: STATUS_VALUES,
      required: true,
    },
    requestedStatus: {
      type: String,
      enum: STATUS_VALUES,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 500,
    },
    attachmentUrl: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "auto_expired"],
      default: "pending",
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewRemarks: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: () => {
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        return new Date(Date.now() + sevenDaysMs);
      },
    },
  },
  {
    timestamps: true,
  }
);

// Keep the request around for 30 days from creation while allowing 7-day review SLA.
editApprovalRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 23 * 24 * 60 * 60 });
editApprovalRequestSchema.index({ requestedBy: 1, createdAt: -1 });

editApprovalRequestSchema.statics.getPendingForHOD = function getPendingForHOD(hodDeptId) {
  return this.find({ status: "pending" })
    .populate({
      path: "requestedBy",
      match: { role: { $in: ["faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator", "hod"] } },
      select: "name email profileId",
      populate: {
        path: "profileId",
        model: "Faculty",
        match: { departmentId: hodDeptId },
        select: "name",
      },
    })
    .populate({ path: "studentId", select: "name rollNumber" })
    .populate({ path: "subjectId", select: "name subjectCode" })
    .populate({ path: "attendanceId", select: "date periodNumber status" })
    .sort({ createdAt: -1 })
    .then((rows) =>
      rows.filter((row) => {
        const facultyProfile = row?.requestedBy?.profileId;
        return Boolean(facultyProfile);
      })
    );
};

editApprovalRequestSchema.statics.getFacultyRequests = function getFacultyRequests(facultyId) {
  return this.find({ requestedBy: facultyId })
    .populate({ path: "studentId", select: "name rollNumber" })
    .populate({ path: "subjectId", select: "name subjectCode" })
    .populate({ path: "attendanceId", select: "date periodNumber status" })
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model("EditApprovalRequest", editApprovalRequestSchema);
