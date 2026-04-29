const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
  {
    subjectCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
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
    credits: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    type: {
      type: String,
      enum: ["theory", "lab", "elective"],
      default: "theory",
    },
    totalPlannedClasses: {
      type: Number,
      default: 0,
      min: 0,
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

subjectSchema.index({ departmentId: 1, semester: 1 });

subjectSchema.statics.getBySemester = function getBySemester(deptId, semester) {
  return this.find({
    departmentId: deptId,
    semester,
    isActive: true,
  }).sort({ name: 1 });
};

subjectSchema.statics.getWithFaculty = function getWithFaculty(subjectId) {
  return this.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(subjectId),
      },
    },
    {
      $lookup: {
        from: "timetables",
        localField: "_id",
        foreignField: "subjectId",
        as: "timetableEntries",
      },
    },
    {
      $unwind: {
        path: "$timetableEntries",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "faculties",
        localField: "timetableEntries.facultyId",
        foreignField: "_id",
        as: "faculty",
      },
    },
    {
      $unwind: {
        path: "$faculty",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $group: {
        _id: "$_id",
        subjectCode: { $first: "$subjectCode" },
        name: { $first: "$name" },
        departmentId: { $first: "$departmentId" },
        semester: { $first: "$semester" },
        credits: { $first: "$credits" },
        type: { $first: "$type" },
        totalPlannedClasses: { $first: "$totalPlannedClasses" },
        isActive: { $first: "$isActive" },
        faculty: {
          $addToSet: {
            _id: "$faculty._id",
            employeeId: "$faculty.employeeId",
            name: "$faculty.name",
            email: "$faculty.email",
            designation: "$faculty.designation",
          },
        },
      },
    },
    {
      $addFields: {
        faculty: {
          $filter: {
            input: "$faculty",
            as: "member",
            cond: { $ne: ["$$member._id", null] },
          },
        },
      },
    },
  ]);
};

module.exports = mongoose.model("Subject", subjectSchema);
