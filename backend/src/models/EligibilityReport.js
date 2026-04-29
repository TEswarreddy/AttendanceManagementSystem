const mongoose = require("mongoose");

const eligibilitySubjectSchema = new mongoose.Schema(
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
    theoryPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    labPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    combinedPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    isEligible: {
      type: Boolean,
      required: true,
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

const eligibilityStudentSchema = new mongoose.Schema(
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
    isEligible: {
      type: Boolean,
      required: true,
    },
    condonationApplied: {
      type: Boolean,
      default: false,
    },
    condonationReason: {
      type: String,
      trim: true,
      default: null,
    },
    subjects: {
      type: [eligibilitySubjectSchema],
      default: [],
    },
    overallPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
  },
  {
    _id: false,
  }
);

const eligibilityReportSchema = new mongoose.Schema(
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
    semesterEndDate: {
      type: Date,
      default: null,
    },
    thresholdUsed: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    students: {
      type: [eligibilityStudentSchema],
      default: [],
    },
    eligibleCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    ineligibleCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isFinalized: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("EligibilityReport", eligibilityReportSchema);
