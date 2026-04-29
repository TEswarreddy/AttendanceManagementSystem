const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      maxlength: 10,
    },
    hodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      default: null,
    },
    timeTableCoordinatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      default: null,
    },
    totalSemesters: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
      default: 8,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

departmentSchema.virtual("fullName").get(function fullName() {
  return `${this.code} - ${this.name}`;
});

departmentSchema.statics.getActive = function getActive() {
  return this.find({ isActive: true }).sort({ name: 1 });
};

module.exports = mongoose.model("Department", departmentSchema);
