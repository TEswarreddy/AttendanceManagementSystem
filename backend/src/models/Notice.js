const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    type: {
      type: String,
      enum: ["general", "alert", "exam", "holiday", "meeting"],
      default: "general",
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetDept: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    targetSemester: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },
    targetSection: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 4,
    },
    recipientRoles: {
      type: [String],
      enum: ["student", "faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator", "hod", "admin", "principal"],
      default: ["student"],
    },
    sendSMS: {
      type: Boolean,
      default: false,
    },
    smsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    readBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Student",
      default: [],
    },
    readByUsers: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

noticeSchema.index({ targetDept: 1, targetSemester: 1, targetSection: 1 });
noticeSchema.index({ recipientRoles: 1, targetDept: 1, targetSemester: 1, targetSection: 1 });

noticeSchema.statics.getClassNotices = function getClassNotices(deptId, semester, section) {
  return this.find({
    targetDept: deptId,
    targetSemester: semester,
    targetSection: String(section || "").toUpperCase(),
  }).sort({ isPinned: -1, createdAt: -1 });
};

module.exports = mongoose.model("Notice", noticeSchema);
