const mongoose = require("mongoose");

const phoneRegex = /^\d{10}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const studentSchema = new mongoose.Schema(
  {
    rollNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: emailRegex,
    },
    phone: {
      type: String,
      trim: true,
      match: phoneRegex,
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
      uppercase: true,
      trim: true,
      maxlength: 2,
    },
    batch: {
      type: String,
      required: true,
    },
    guardianPhone: {
      type: String,
      trim: true,
      match: phoneRegex,
    },
    profilePhoto: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

studentSchema.index({ departmentId: 1, semester: 1, section: 1 });

studentSchema.pre(/^find/, function populateDepartment() {
  this.populate({ path: "departmentId", select: "name code" });
});

studentSchema.virtual("age").get(function getAge() {
  const dob = this.dateOfBirth || this.dob;

  if (!dob) {
    return undefined;
  }

  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) {
    return undefined;
  }

  const ageDifMs = Date.now() - birthDate.getTime();
  const ageDate = new Date(ageDifMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
});

studentSchema.statics.findByDeptSemSection = function findByDeptSemSection(
  deptId,
  semester,
  section
) {
  const query = {
    departmentId: deptId,
    semester,
  };

  if (section) {
    query.section = section;
  }

  return this.find(query).sort({ rollNumber: 1 });
};

studentSchema.statics.findBelowThreshold = function findBelowThreshold(threshold) {
  return this.aggregate([
    {
      $lookup: {
        from: "attendances",
        localField: "_id",
        foreignField: "studentId",
        as: "attendanceRecords",
      },
    },
    {
      $addFields: {
        attendancePercentages: {
          $map: {
            input: "$attendanceRecords",
            as: "record",
            in: {
              $let: {
                vars: {
                  explicitPercent: {
                    $ifNull: ["$$record.attendancePercentage", "$$record.percentage"],
                  },
                },
                in: {
                  $cond: [
                    { $ne: ["$$explicitPercent", null] },
                    "$$explicitPercent",
                    {
                      $cond: [
                        {
                          $and: [
                            { $gt: ["$$record.totalClasses", 0] },
                            { $ne: ["$$record.presentCount", null] },
                          ],
                        },
                        {
                          $multiply: [
                            { $divide: ["$$record.presentCount", "$$record.totalClasses"] },
                            100,
                          ],
                        },
                        null,
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    {
      $addFields: {
        overallAttendance: {
          $ifNull: [
            {
              $avg: {
                $filter: {
                  input: "$attendancePercentages",
                  as: "value",
                  cond: { $ne: ["$$value", null] },
                },
              },
            },
            0,
          ],
        },
      },
    },
    {
      $match: {
        overallAttendance: { $lt: threshold },
      },
    },
    {
      $project: {
        attendanceRecords: 0,
        attendancePercentages: 0,
      },
    },
    {
      $sort: { rollNumber: 1 },
    },
  ]);
};

module.exports = mongoose.model("Student", studentSchema);
