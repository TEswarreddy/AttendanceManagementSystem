const mongoose = require("mongoose");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeOptionalPhone = (value) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};
const normalizeOptionalEmployeeId = (value) => {
  const normalized = String(value || "").toUpperCase().trim();
  return normalized || null;
};

const facultySchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      uppercase: true,
      trim: true,
      default: null,
      set: normalizeOptionalEmployeeId,
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
      default: null,
      set: normalizeOptionalPhone,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    designation: {
      type: String,
      enum: ["Assistant Professor", "Associate Professor", "Professor", "HOD"],
      required: true,
    },
    specialization: {
      type: String,
      trim: true,
    },
    classTeacherAssignment: {
      departmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
        default: null,
      },
      semester: {
        type: Number,
        min: 1,
        max: 8,
        default: null,
      },
      section: {
        type: String,
        uppercase: true,
        trim: true,
        maxlength: 2,
        default: null,
      },
      academicYear: {
        type: String,
        trim: true,
        default: null,
      },
      assignedAt: {
        type: Date,
        default: null,
      },
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

facultySchema.index(
  { employeeId: 1 },
  { unique: true, partialFilterExpression: { employeeId: { $type: "string", $gt: "" } } }
);
facultySchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: "string", $gt: "" } } }
);
facultySchema.index({ departmentId: 1, email: 1 });

facultySchema.statics.getByDepartment = function getByDepartment(deptId) {
  return this.find({ departmentId: deptId, isActive: true }).sort({ name: 1 });
};

facultySchema.statics.getAssignedSubjects = async function getAssignedSubjects(facultyId) {
  const timetableCollection = mongoose.connection.collection("timetables");

  const results = await timetableCollection
    .aggregate([
      {
        $match: {
          facultyId: new mongoose.Types.ObjectId(facultyId),
        },
      },
      {
        $project: {
          _id: 0,
          facultyId: 1,
          departmentId: 1,
          semester: 1,
          section: 1,
          day: 1,
          period: 1,
          subject: {
            $ifNull: ["$subject", "$subjectName"],
          },
          subjects: {
            $ifNull: ["$subjects", []],
          },
        },
      },
      {
        $group: {
          _id: null,
          subjects: { $addToSet: "$subject" },
        },
      },
      {
        $project: {
          _id: 0,
          assignments: 1,
          subjects: {
            $filter: {
              input: "$subjects",
              as: "subject",
              cond: { $ne: ["$$subject", null] },
            },
          },
        },
      },
    ])
    .toArray();

  return results[0]?.subjects || [];
};

module.exports = mongoose.model("Faculty", facultySchema);
