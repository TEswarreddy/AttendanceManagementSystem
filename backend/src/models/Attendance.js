const mongoose = require("mongoose");
const Subject = require("./Subject");
const Student = require("./Student");
const Timetable = require("./Timetable");

const normalizeDateOnly = (value) => {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Date(
    Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate())
  );
};

const toStatusCounter = (counter, status) => {
  if (status === "P") {
    counter.present += 1;
    return;
  }

  if (status === "L") {
    counter.late += 1;
    return;
  }

  counter.absent += 1;
};

const toLabSessionStatus = (statuses) => {
  if (statuses.includes("P")) return "P";
  if (statuses.includes("L")) return "L";
  if (statuses.includes("ML")) return "ML";
  return "A";
};

const attendanceSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    date: {
      type: Date,
      required: true,
      set: normalizeDateOnly,
    },
    periodNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },
    periodLabel: {
      type: String,
      trim: true,
    },
    subjectType: {
      type: String,
      enum: ["theory", "lab", "elective"],
      default: "theory",
    },
    isLabSession: {
      type: Boolean,
      default: false,
    },
    labGroup: {
      type: String,
      trim: true,
      default: null,
    },
    smsAlertSent: {
      type: Boolean,
      default: false,
    },
    monthlyAlertSent: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["P", "A", "L", "ML"],
      default: "A",
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    markedAt: {
      type: Date,
      default: Date.now,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    qrSessionId: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

attendanceSchema.index({ studentId: 1, subjectId: 1, date: 1, periodNumber: 1 }, { unique: true });
attendanceSchema.index({ subjectId: 1, date: 1, periodNumber: 1 });
attendanceSchema.index({ studentId: 1, subjectId: 1 });
attendanceSchema.index({ departmentId: 1, date: 1 });
attendanceSchema.index({ facultyId: 1, date: 1 });

attendanceSchema.virtual("isEditable").get(function isEditable() {
  if (!this.markedAt) {
    return false;
  }

  const editWindowHours = Number(process.env.MAX_EDIT_WINDOW_HOURS || 24);
  const editWindowMs = editWindowHours * 3600000;
  return Date.now() - new Date(this.markedAt).getTime() < editWindowMs;
});

attendanceSchema.statics.getTodayAttendance = async function getTodayAttendance(studentId, date) {
  const normalizedDate = normalizeDateOnly(date || new Date());

  const student = await Student.findById(studentId).select("departmentId semester section").lean();

  const records = await this.find({
    studentId,
    date: normalizedDate,
  })
    .populate({ path: "subjectId", select: "name" })
    .populate({ path: "facultyId", select: "name" })
    .sort({ periodNumber: 1 })
    .lean();

  let slotByPeriod = new Map();

  if (student?.departmentId && student?.semester && student?.section) {
    const todayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(normalizedDate).getUTCDay()];

    if (todayName && todayName !== "Sunday") {
      const timetableRows = await Timetable.find({
        departmentId: student.departmentId,
        semester: student.semester,
        section: String(student.section || "").toUpperCase(),
        isActive: true,
      })
        .select("subjectId schedule academicYear")
        .lean();

      const latestAcademicYear = [...new Set(timetableRows.map((row) => row.academicYear).filter(Boolean))]
        .sort()
        .at(-1);

      const filteredRows = latestAcademicYear
        ? timetableRows.filter((row) => row.academicYear === latestAcademicYear)
        : timetableRows;

      slotByPeriod = new Map(
        filteredRows
          .filter((row) => records.some((record) => String(record.subjectId?._id || record.subjectId) === String(row.subjectId)))
          .flatMap((row) =>
            (row.schedule || [])
              .filter((slot) => slot.day === todayName)
              .map((slot) => [
                `${String(row.subjectId)}-${Number(slot.periodNumber)}`,
                { startTime: slot.startTime || null, endTime: slot.endTime || null },
              ])
          )
      );
    }
  }

  return records.map((record) => {
    const subjectId = String(record.subjectId?._id || record.subjectId || "");
    const periodNumber = Number(record.periodNumber || 0);
    const slot = slotByPeriod.get(`${subjectId}-${periodNumber}`) || {};

    return {
      periodNumber,
      periodLabel: record.periodLabel || `Period ${periodNumber}`,
      subjectName: record.subjectId?.name || "Unknown",
      facultyName: record.facultyId?.name || "Unknown",
      status: record.status,
      startTime: slot.startTime || null,
      endTime: slot.endTime || null,
    };
  });
};

attendanceSchema.statics.getStudentSummary = async function getStudentSummary(studentId) {
  const records = await this.find({
    studentId: new mongoose.Types.ObjectId(studentId),
  })
    .select("subjectId subjectType status date periodNumber")
    .sort({ subjectId: 1, subjectType: 1, date: 1, periodNumber: 1 })
    .lean();

  const grouped = new Map();

  for (const record of records) {
    const key = `${String(record.subjectId)}|${record.subjectType || "theory"}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        subjectId: String(record.subjectId),
        subjectType: record.subjectType || "theory",
        byDate: new Map(),
      });
    }

    const entry = grouped.get(key);
    const dateKey = normalizeDateOnly(record.date).toISOString();

    if (!entry.byDate.has(dateKey)) {
      entry.byDate.set(dateKey, []);
    }

    entry.byDate.get(dateKey).push({
      periodNumber: Number(record.periodNumber || 0),
      status: record.status,
    });
  }

  const subjectIds = [...new Set([...grouped.values()].map((item) => item.subjectId))].map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  const subjects = await Subject.find({ _id: { $in: subjectIds } })
    .select("_id name")
    .lean();

  const subjectNameMap = new Map(subjects.map((subject) => [String(subject._id), subject.name]));

  const summary = [...grouped.values()].map((item) => {
    const counters = {
      total: 0,
      present: 0,
      late: 0,
      absent: 0,
    };

    for (const dayRecords of item.byDate.values()) {
      const sorted = [...dayRecords].sort((left, right) => left.periodNumber - right.periodNumber);

      if (item.subjectType === "lab") {
        const sessions = [];

        for (const record of sorted) {
          const last = sessions.at(-1);

          if (!last || record.periodNumber !== last.lastPeriod + 1) {
            sessions.push({
              lastPeriod: record.periodNumber,
              statuses: [record.status],
            });
            continue;
          }

          last.lastPeriod = record.periodNumber;
          last.statuses.push(record.status);
        }

        for (const session of sessions) {
          counters.total += 1;
          toStatusCounter(counters, toLabSessionStatus(session.statuses));
        }

        continue;
      }

      for (const record of sorted) {
        counters.total += 1;
        toStatusCounter(counters, record.status);
      }
    }

    const weightedPresent = counters.present + counters.late * 0.5;
    const percentage = counters.total > 0 ? (weightedPresent / counters.total) * 100 : 0;

    return {
      subjectId: item.subjectId,
      subjectType: item.subjectType,
      subjectName: subjectNameMap.get(item.subjectId) || "Unknown",
      total: counters.total,
      present: counters.present,
      late: counters.late,
      absent: counters.absent,
      percentage: Number(percentage.toFixed(2)),
    };
  });

  return summary.sort((left, right) => left.subjectName.localeCompare(right.subjectName));
};

attendanceSchema.statics.getSubjectClassList = function getSubjectClassList(subjectId, date, periodNumber) {
  const normalizedDate = normalizeDateOnly(date);

  const query = {
    subjectId,
    date: normalizedDate,
  };

  if (Number.isFinite(Number(periodNumber))) {
    query.periodNumber = Number(periodNumber);
  }

  return this.find(query).populate({ path: "studentId", select: "name rollNumber" });
};

attendanceSchema.statics.getPeriodWiseSummary = async function getPeriodWiseSummary(subjectId, date) {
  const normalizedDate = normalizeDateOnly(date);

  const periodStats = await this.aggregate([
    {
      $match: {
        subjectId: new mongoose.Types.ObjectId(subjectId),
        date: normalizedDate,
      },
    },
    {
      $group: {
        _id: {
          periodNumber: "$periodNumber",
          periodLabel: "$periodLabel",
        },
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status", "P"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "L"] }, 1, 0] } },
        absent: {
          $sum: {
            $cond: [
              {
                $or: [{ $eq: ["$status", "A"] }, { $eq: ["$status", "ML"] }],
              },
              1,
              0,
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        periodNumber: "$_id.periodNumber",
        periodLabel: {
          $ifNull: ["$_id.periodLabel", { $concat: ["Period ", { $toString: "$_id.periodNumber" }] }],
        },
        total: 1,
        present: 1,
        late: 1,
        absent: 1,
        absenceRate: {
          $cond: [{ $eq: ["$total", 0] }, 0, { $multiply: [{ $divide: ["$absent", "$total"] }, 100] }],
        },
      },
    },
    {
      $sort: { periodNumber: 1 },
    },
  ]);

  const highestAbsencePeriod =
    [...periodStats].sort((left, right) => right.absenceRate - left.absenceRate || left.periodNumber - right.periodNumber)[0] ||
    null;

  return {
    subjectId,
    date: normalizedDate,
    periods: periodStats,
    highestAbsencePeriod,
  };
};

attendanceSchema.statics.bulkMark = async function bulkMark(records, facultyId, options = {}) {
  if (!Array.isArray(records) || records.length === 0) {
    return { marked: 0, updated: 0 };
  }

  return this.bulkMarkPeriod(records, facultyId, undefined, options);
};

attendanceSchema.statics.bulkMarkPeriod = async function bulkMarkPeriod(records, facultyId, periodNumber, options = {}) {
  if (!Array.isArray(records) || records.length === 0) {
    return { marked: 0, updated: 0 };
  }

  const session = options.session;

  const subjectIds = [
    ...new Set(records.map((record) => String(record.subjectId))),
  ].map((id) => new mongoose.Types.ObjectId(id));

  const subjects = await Subject.find({ _id: { $in: subjectIds } })
    .select("_id departmentId")
    .session(session || null)
    .lean();

  const subjectDepartmentMap = new Map(
    subjects.map((subject) => [String(subject._id), subject.departmentId])
  );

  const operations = records.map((record) => {
    const normalizedDate = normalizeDateOnly(record.date);
    const departmentId = record.departmentId || subjectDepartmentMap.get(String(record.subjectId));
    const resolvedPeriodNumber = Number(
      record.periodNumber !== undefined ? record.periodNumber : periodNumber
    );

    if (!departmentId) {
      throw new Error(`Department not found for subject ${record.subjectId}`);
    }

    if (!Number.isFinite(resolvedPeriodNumber) || resolvedPeriodNumber < 1 || resolvedPeriodNumber > 8) {
      throw new Error(`Valid periodNumber is required for subject ${record.subjectId}`);
    }

    return {
      updateOne: {
        filter: {
          studentId: record.studentId,
          subjectId: record.subjectId,
          date: normalizedDate,
          periodNumber: resolvedPeriodNumber,
        },
        update: {
          $set: {
            facultyId,
            departmentId,
            status: record.status,
            remarks: record.remarks,
            qrSessionId: record.qrSessionId,
            periodNumber: resolvedPeriodNumber,
            periodLabel: record.periodLabel,
            subjectType: record.subjectType || "theory",
            isLabSession: Boolean(record.isLabSession),
            labGroup: record.labGroup || null,
          },
          $setOnInsert: {
            markedAt: new Date(),
            smsAlertSent: false,
            monthlyAlertSent: false,
          },
        },
        upsert: true,
      },
    };
  });

  const result = await this.bulkWrite(operations, {
    ordered: false,
    ...(session ? { session } : {}),
  });

  const upsertedCount = result.upsertedCount || result.nUpserted || 0;
  const modifiedCount = result.modifiedCount || result.nModified || 0;

  return {
    marked: upsertedCount,
    updated: modifiedCount,
  };
};

attendanceSchema.statics.getAbsentStudentsToday = async function getAbsentStudentsToday(
  deptId,
  semester,
  section,
  date
) {
  const normalizedDate = normalizeDateOnly(date || new Date());

  return this.aggregate([
    {
      $match: {
        departmentId: new mongoose.Types.ObjectId(deptId),
        date: normalizedDate,
        status: "A",
      },
    },
    {
      $group: {
        _id: "$studentId",
        absentPeriods: {
          $addToSet: {
            periodNumber: "$periodNumber",
            periodLabel: {
              $ifNull: ["$periodLabel", { $concat: ["Period ", { $toString: "$periodNumber" }] }],
            },
            subjectId: "$subjectId",
          },
        },
      },
    },
    {
      $lookup: {
        from: "students",
        localField: "_id",
        foreignField: "_id",
        as: "student",
      },
    },
    {
      $unwind: "$student",
    },
    {
      $match: {
        "student.semester": Number(semester),
        "student.section": String(section || "").toUpperCase(),
        "student.isActive": true,
      },
    },
    {
      $project: {
        _id: 0,
        studentId: "$student._id",
        name: "$student.name",
        rollNumber: "$student.rollNumber",
        guardianPhone: "$student.guardianPhone",
        absentPeriods: 1,
      },
    },
    {
      $sort: { rollNumber: 1 },
    },
  ]);
};

module.exports = mongoose.model("Attendance", attendanceSchema);
