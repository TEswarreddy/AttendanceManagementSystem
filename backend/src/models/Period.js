const mongoose = require("mongoose");

const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const periodSchema = new mongoose.Schema(
  {
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    periodNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },
    label: {
      type: String,
      trim: true,
    },
    startTime: {
      type: String,
      required: true,
      trim: true,
      match: timeRegex,
    },
    endTime: {
      type: String,
      required: true,
      trim: true,
      match: timeRegex,
    },
    type: {
      type: String,
      enum: ["theory", "lab", "break"],
      default: "theory",
    },
    isLab: {
      type: Boolean,
      default: false,
    },
    labDuration: {
      type: Number,
      default: 1,
      enum: [1, 2, 3],
    },
  },
  {
    timestamps: true,
  }
);

periodSchema.index({ departmentId: 1, periodNumber: 1 }, { unique: true });

periodSchema.statics.getByDept = function getByDept(deptId) {
  return this.find({ departmentId: deptId }).sort({ periodNumber: 1 });
};

module.exports = mongoose.model("Period", periodSchema);
