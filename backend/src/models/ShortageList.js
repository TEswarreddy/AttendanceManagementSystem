const mongoose = require("mongoose");

const subjectShortageSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    subjectName: {
      type: String,
      required: true,
      trim: true,
    },
    subjectCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    shortageBy: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: false,
  }
);

const shortageStudentSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    rollNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    subjectShortages: {
      type: [subjectShortageSchema],
      default: [],
    },
    overallPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    isEligible: {
      type: Boolean,
      required: true,
    },
  },
  {
    _id: false,
  }
);

const shortageListSchema = new mongoose.Schema(
  {
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },
    section: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
    },
    examType: {
      type: String,
      enum: ["internal1", "internal2", "internal3", "semester_end"],
      required: true,
    },
    thresholdUsed: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    students: {
      type: [shortageStudentSchema],
      default: [],
    },
    totalStudents: {
      type: Number,
      default: 0,
      min: 0,
    },
    shortageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

shortageListSchema.index({ departmentId: 1, semester: 1, academicYear: 1, examType: 1 });

module.exports = mongoose.model("ShortageList", shortageListSchema);
