const mongoose = require("mongoose");

const Student = require("./Student");

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_ORDER = DAYS.reduce((acc, day, index) => {
  acc[day] = index;
  return acc;
}, {});
const timeSlotRegex = /^([01]?\d|2[0-3]):([0-5]\d)\s*-\s*([01]?\d|2[0-3]):([0-5]\d)$/;

const parseTimeSlot = (timeSlot) => {
  const raw = String(timeSlot || "").trim();
  const match = raw.match(timeSlotRegex);
  if (!match) {
    return null;
  }

  return {
    startTime: `${String(match[1]).padStart(2, "0")}:${match[2]}`,
    endTime: `${String(match[3]).padStart(2, "0")}:${match[4]}`,
  };
};

const buildTimeSlot = (startTime, endTime) => {
  if (!startTime || !endTime) {
    return undefined;
  }

  return `${startTime}-${endTime}`;
};

const sortByDayAndPeriod = (left, right) => {
  const leftDay = DAY_ORDER[left.day] ?? Number.MAX_SAFE_INTEGER;
  const rightDay = DAY_ORDER[right.day] ?? Number.MAX_SAFE_INTEGER;

  if (leftDay !== rightDay) {
    return leftDay - rightDay;
  }

  const leftPeriod = Number(left.periodNumber || 0);
  const rightPeriod = Number(right.periodNumber || 0);
  return leftPeriod - rightPeriod;
};

const scheduleSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      enum: DAYS,
      required: true,
    },
    periodNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },
    startTime: {
      type: String,
      required: true,
      trim: true,
    },
    endTime: {
      type: String,
      required: true,
      trim: true,
    },
    timeSlot: {
      type: String,
      trim: true,
    },
    roomNo: {
      type: String,
      trim: true,
    },
    isLab: {
      type: Boolean,
      default: false,
    },
    labGroupId: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const timetableSchema = new mongoose.Schema(
  {
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },
    classTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      default: null,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    subjectType: {
      type: String,
      enum: ["theory", "lab", "elective"],
      default: "theory",
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    semester: {
      type: Number,
      required: true,
    },
    section: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
    },
    schedule: {
      type: [scheduleSchema],
      default: [],
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

timetableSchema.index(
  { facultyId: 1, subjectId: 1, semester: 1, section: 1, academicYear: 1 },
  { unique: true }
);

timetableSchema.statics.getFacultySubjects = function getFacultySubjects(
  facultyId,
  academicYear
) {
  const filter = {
    facultyId,
    isActive: true,
  };

  if (academicYear) {
    filter.academicYear = academicYear;
  }

  return this.find(filter)
    .populate({ path: "subjectId" })
    .populate({ path: "departmentId", select: "name code" });
};

timetableSchema.statics.validateAssignment = async function validateAssignment(
  facultyId,
  subjectId
) {
  const assignment = await this.exists({
    facultyId,
    subjectId,
    isActive: true,
  });

  return Boolean(assignment);
};

timetableSchema.statics.getClassTimetable = async function getClassTimetable(
  deptId,
  semester,
  section,
  academicYear
) {
  const rows = await this.find({
    departmentId: deptId,
    semester,
    section: String(section || "").toUpperCase(),
    academicYear,
    isActive: true,
  })
    .populate({ path: "subjectId", select: "name subjectCode type" })
    .populate({ path: "facultyId", select: "name" })
    .populate({ path: "classTeacherId", select: "name" })
    .lean();

  const weeklySchedule = rows
    .flatMap((entry) =>
      (entry.schedule || []).map((slot) => ({
        day: slot.day,
        periodNumber: slot.periodNumber,
        startTime: slot.startTime,
        endTime: slot.endTime,
        roomNo: slot.roomNo,
        isLab: Boolean(slot.isLab),
        labGroupId: slot.labGroupId || null,
        subjectId: entry.subjectId?._id || entry.subjectId,
        subjectName: entry.subjectId?.name,
        subjectCode: entry.subjectId?.subjectCode,
        subjectType: entry.subjectType,
        facultyId: entry.facultyId?._id || entry.facultyId,
        facultyName: entry.facultyId?.name,
        classTeacherId: entry.classTeacherId?._id || entry.classTeacherId || null,
        classTeacherName: entry.classTeacherId?.name || null,
      }))
    )
    .sort(sortByDayAndPeriod);

  return {
    departmentId: deptId,
    semester,
    section: String(section || "").toUpperCase(),
    academicYear,
    schedule: weeklySchedule,
  };
};

timetableSchema.statics.getFacultyTimetable = async function getFacultyTimetable(
  facultyId,
  academicYear
) {
  const filter = {
    facultyId,
    isActive: true,
  };

  if (academicYear) {
    filter.academicYear = academicYear;
  }

  const rows = await this.find(filter)
    .populate({ path: "subjectId", select: "name subjectCode type" })
    .populate({ path: "departmentId", select: "name code" })
    .lean();

  return rows
    .flatMap((entry) =>
      (entry.schedule || []).map((slot) => ({
        day: slot.day,
        periodNumber: slot.periodNumber,
        startTime: slot.startTime,
        endTime: slot.endTime,
        roomNo: slot.roomNo,
        isLab: Boolean(slot.isLab),
        labGroupId: slot.labGroupId || null,
        semester: entry.semester,
        section: entry.section,
        academicYear: entry.academicYear,
        departmentId: entry.departmentId?._id || entry.departmentId,
        departmentName: entry.departmentId?.name,
        departmentCode: entry.departmentId?.code,
        subjectId: entry.subjectId?._id || entry.subjectId,
        subjectName: entry.subjectId?.name,
        subjectCode: entry.subjectId?.subjectCode,
        subjectType: entry.subjectType,
      }))
    )
    .sort(sortByDayAndPeriod);
};

timetableSchema.statics.getTodaySchedule = async function getTodaySchedule(
  deptId,
  semester,
  section
) {
  const today = DAYS[new Date().getDay() - 1];
  if (!today) {
    return [];
  }

  const rows = await this.find({
    departmentId: deptId,
    semester,
    section: String(section || "").toUpperCase(),
    isActive: true,
  })
    .populate({ path: "subjectId", select: "name subjectCode" })
    .populate({ path: "facultyId", select: "name" })
    .lean();

  const availableYears = [...new Set(rows.map((row) => row.academicYear).filter(Boolean))].sort();
  const latestAcademicYear = availableYears.at(-1);

  return rows
    .filter((row) => !latestAcademicYear || row.academicYear === latestAcademicYear)
    .flatMap((entry) =>
      (entry.schedule || [])
        .filter((slot) => slot.day === today)
        .map((slot) => ({
          day: slot.day,
          periodNumber: slot.periodNumber,
          startTime: slot.startTime,
          endTime: slot.endTime,
          roomNo: slot.roomNo,
          isLab: Boolean(slot.isLab),
          labGroupId: slot.labGroupId || null,
          subjectId: entry.subjectId?._id || entry.subjectId,
          subjectName: entry.subjectId?.name,
          subjectCode: entry.subjectId?.subjectCode,
          facultyId: entry.facultyId?._id || entry.facultyId,
          facultyName: entry.facultyId?.name,
        }))
    )
    .sort((left, right) => Number(left.periodNumber || 0) - Number(right.periodNumber || 0));
};

timetableSchema.statics.validatePeriodSlot = async function validatePeriodSlot(
  deptId,
  semester,
  section,
  day,
  periodNumber
) {
  const clash = await this.exists({
    departmentId: deptId,
    semester,
    section: String(section || "").toUpperCase(),
    isActive: true,
    schedule: {
      $elemMatch: {
        day,
        periodNumber,
      },
    },
  });

  if (clash) {
    throw new Error(`Period ${periodNumber} is already occupied on ${day} for semester ${semester} section ${String(section || "").toUpperCase()}.`);
  }

  return true;
};

timetableSchema.statics.getClassStudents = async function getClassStudents(
  subjectId,
  semester,
  section,
  deptId
) {
  const isMappedClass = await this.exists({
    subjectId,
    semester,
    section: section.toUpperCase(),
    departmentId: deptId,
    isActive: true,
  });

  if (!isMappedClass) {
    return [];
  }

  return Student.find({
    departmentId: deptId,
    semester,
    section: section.toUpperCase(),
    isActive: true,
  }).sort({ rollNumber: 1 });
};

timetableSchema.pre("validate", function normalizeScheduleTimes() {
  this.schedule = (this.schedule || []).map((slot) => {
    const normalizedSlot = { ...slot };

    if ((!normalizedSlot.startTime || !normalizedSlot.endTime) && normalizedSlot.timeSlot) {
      const parsed = parseTimeSlot(normalizedSlot.timeSlot);
      if (parsed) {
        normalizedSlot.startTime = parsed.startTime;
        normalizedSlot.endTime = parsed.endTime;
      }
    }

    if (!normalizedSlot.timeSlot && normalizedSlot.startTime && normalizedSlot.endTime) {
      normalizedSlot.timeSlot = buildTimeSlot(normalizedSlot.startTime, normalizedSlot.endTime);
    }

    return normalizedSlot;
  });
});

module.exports = mongoose.model("Timetable", timetableSchema);
