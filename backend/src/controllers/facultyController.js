const mongoose = require("mongoose");

const { Attendance, Timetable, Student } = require("../models");
const { catchAsync, AppError } = require("../utils/AppError");
const { sendSuccess, sendPaginated } = require("../utils/responseHelper");
const dateHelper = require("../utils/dateHelper");
const attendanceCalc = require("../utils/attendanceCalc");
const smsAlertService = require("../services/smsAlertService");

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const normalizeDate = (date) => {
  try {
    return dateHelper.toMidnightUTC(date);
  } catch (error) {
    throw new AppError(400, error.message || "Invalid date format");
  }
};

const getDayName = (date) => DAY_NAMES[new Date(date).getUTCDay()];

const getAssignedClassSlot = async ({ facultyId, subjectId, day, periodNumber, semester, section }) => {
  const baseQuery = {
    facultyId,
    subjectId,
    isActive: true,
    schedule: {
      $elemMatch: {
        day,
        periodNumber: Number(periodNumber),
      },
    },
  };

  if (semester !== undefined) {
    baseQuery.semester = Number(semester);
  }

  if (section) {
    baseQuery.section = String(section).toUpperCase();
  }

  return Timetable.findOne(baseQuery)
    .populate({ path: "subjectId", select: "name subjectCode" })
    .populate({ path: "facultyId", select: "name" })
    .lean();
};

const markPeriodAttendance = catchAsync(async (req, res) => {
  const { subjectId, date, periodNumber, records } = req.body;
  const facultyId = req.user.profileId;

  if (!subjectId || !mongoose.Types.ObjectId.isValid(subjectId)) {
    throw new AppError(400, "Valid subjectId is required");
  }

  const resolvedPeriodNumber = Number(periodNumber);
  if (!Number.isFinite(resolvedPeriodNumber) || resolvedPeriodNumber < 1 || resolvedPeriodNumber > 8) {
    throw new AppError(400, "periodNumber must be between 1 and 8");
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new AppError(400, "records are required");
  }

  const isAssigned = await Timetable.validateAssignment(facultyId, subjectId);
  if (!isAssigned) {
    throw new AppError(403, "You are not assigned to this subject");
  }

  const normalizedDate = normalizeDate(date);

  if (normalizedDate > new Date()) {
    throw new AppError(400, "Cannot mark attendance for future date");
  }

  const day = getDayName(normalizedDate);
  if (!day || day === "Sunday") {
    throw new AppError(400, "Attendance cannot be marked on Sunday");
  }

  const validSlot = await getAssignedClassSlot({
    facultyId,
    subjectId,
    day,
    periodNumber: resolvedPeriodNumber,
  });

  if (!validSlot) {
    throw new AppError(400, "Invalid periodNumber for assigned timetable slot");
  }

  const session = await mongoose.startSession();
  let bulkResult = { marked: 0, updated: 0 };

  try {
    await session.withTransaction(async () => {
      const normalizedRecords = records.map((item) => ({
        ...item,
        subjectId,
        date: normalizedDate,
        periodNumber: resolvedPeriodNumber,
        periodLabel: item.periodLabel || `Period ${resolvedPeriodNumber}`,
        subjectType: item.subjectType || validSlot.subjectType || "theory",
        isLabSession: Boolean(item.isLabSession || validSlot.subjectType === "lab"),
      }));

      bulkResult = await Attendance.bulkMarkPeriod(
        normalizedRecords,
        facultyId,
        resolvedPeriodNumber,
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  const absentStudentIds = records
    .filter((item) => item?.status === "A" && mongoose.Types.ObjectId.isValid(item?.studentId))
    .map((item) => new mongoose.Types.ObjectId(item.studentId));

  const markedRecords = absentStudentIds.length
    ? await Attendance.find({
        studentId: { $in: absentStudentIds },
        subjectId,
        date: normalizedDate,
        periodNumber: resolvedPeriodNumber,
        status: "A",
        smsAlertSent: false,
      })
        .select("_id studentId subjectId date periodNumber status smsAlertSent")
        .lean()
    : [];

  await smsAlertService.sendBulkAbsentAlerts(markedRecords);

  return sendSuccess(res, 200, "Period attendance marked", {
    marked: bulkResult.marked,
    updated: bulkResult.updated,
    periodNumber: resolvedPeriodNumber,
  });
});

const getPeriodAttendanceStatus = catchAsync(async (req, res) => {
  const { subjectId, date, periodNumber } = req.query;
  const facultyId = req.user.profileId;

  if (!subjectId || !mongoose.Types.ObjectId.isValid(String(subjectId))) {
    throw new AppError(400, "Valid subjectId is required");
  }

  const resolvedPeriodNumber = Number(periodNumber);
  if (!Number.isFinite(resolvedPeriodNumber) || resolvedPeriodNumber < 1 || resolvedPeriodNumber > 8) {
    throw new AppError(400, "periodNumber must be between 1 and 8");
  }

  const normalizedDate = normalizeDate(date || new Date());
  const day = getDayName(normalizedDate);

  const assignmentRows = await Timetable.find({
    facultyId,
    subjectId,
    isActive: true,
    schedule: {
      $elemMatch: {
        day,
        periodNumber: resolvedPeriodNumber,
      },
    },
  })
    .select("departmentId semester section subjectType schedule")
    .populate({ path: "subjectId", select: "name subjectCode" })
    .lean();

  if (!assignmentRows.length) {
    throw new AppError(404, "No assigned class found for this period");
  }

  const classData = [];

  for (const row of assignmentRows) {
    const students = await Timetable.getClassStudents(
      subjectId,
      row.semester,
      row.section,
      row.departmentId
    );

    const studentIds = students.map((student) => student._id);

    const attendanceRows = await Attendance.find({
      studentId: { $in: studentIds },
      subjectId,
      date: normalizedDate,
      periodNumber: resolvedPeriodNumber,
    })
      .select("_id studentId status markedAt")
      .lean();

    const attendanceMap = new Map(attendanceRows.map((item) => [String(item.studentId), item]));

    const studentsStatus = students.map((student) => {
      const marked = attendanceMap.get(String(student._id));
      return {
        studentId: student._id,
        name: student.name,
        rollNumber: student.rollNumber,
        attendanceId: marked?._id || null,
        status: marked?.status || "not_marked_yet",
        markedAt: marked?.markedAt || null,
      };
    });

    classData.push({
      departmentId: row.departmentId,
      semester: row.semester,
      section: row.section,
      periodNumber: resolvedPeriodNumber,
      totalStudents: studentsStatus.length,
      markedCount: studentsStatus.filter((item) => item.status !== "not_marked_yet").length,
      students: studentsStatus,
    });
  }

  return sendSuccess(res, 200, "Period attendance status fetched", {
    subjectId,
    date: normalizedDate,
    periodNumber: resolvedPeriodNumber,
    classes: classData,
  });
});

const getFacultyTimetable = catchAsync(async (req, res) => {
  const facultyId = req.user.profileId;
  const requestedAcademicYear = req.query.academicYear;
  let academicYear = requestedAcademicYear || dateHelper.getAcademicYear(new Date());

  let rows = await Timetable.getFacultyTimetable(facultyId, academicYear);

  if (!requestedAcademicYear && (!rows || rows.length === 0)) {
    const availableYears = await Timetable.find({
      facultyId,
      isActive: true,
    }).distinct("academicYear");

    const normalizedYears = availableYears
      .filter(Boolean)
      .map((year) => String(year).trim())
      .sort();

    if (normalizedYears.length > 0) {
      academicYear = normalizedYears[normalizedYears.length - 1];
      rows = await Timetable.getFacultyTimetable(facultyId, academicYear);
    }
  }

  const grouped = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
  };

  for (const item of rows) {
    const key = String(item.day || "").toLowerCase();
    if (grouped[key]) {
      grouped[key].push(item);
    }
  }

  return sendSuccess(res, 200, "Faculty timetable fetched", {
    ...grouped,
    academicYear,
  });
});

const SORT_FIELD_MAP = {
  day: "dayOrder",
  periodNumber: "periodNumber",
  subjectName: "subjectName",
  subjectCode: "subjectCode",
  semester: "semester",
  section: "section",
  departmentName: "departmentName",
  startTime: "startTime",
  academicYear: "academicYear",
  subjectType: "subjectType",
};

const DAY_POSITION = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const toSafeString = (value) => String(value || "").trim();

const getFacultyAssignedClasses = catchAsync(async (req, res) => {
  const facultyId = req.user.profileId;
  const page = toPositiveInt(req.query.page, 1);
  const limit = Math.min(toPositiveInt(req.query.limit, 10), 100);

  const requestedAcademicYear = toSafeString(req.query.academicYear);
  let academicYear = requestedAcademicYear || dateHelper.getAcademicYear(new Date());

  let rows = await Timetable.getFacultyTimetable(facultyId, academicYear);

  if (!requestedAcademicYear && (!rows || rows.length === 0)) {
    const availableYears = await Timetable.find({ facultyId, isActive: true }).distinct("academicYear");
    const normalizedYears = availableYears
      .filter(Boolean)
      .map((year) => String(year).trim())
      .sort();

    if (normalizedYears.length > 0) {
      academicYear = normalizedYears[normalizedYears.length - 1];
      rows = await Timetable.getFacultyTimetable(facultyId, academicYear);
    }
  }

  const search = toSafeString(req.query.search).toLowerCase();
  const day = toSafeString(req.query.day);
  const section = toSafeString(req.query.section).toUpperCase();
  const departmentId = toSafeString(req.query.departmentId);
  const subjectType = toSafeString(req.query.subjectType).toLowerCase();
  const semester = req.query.semester !== undefined ? Number(req.query.semester) : undefined;

  let filteredRows = [...(rows || [])];

  if (search) {
    filteredRows = filteredRows.filter((item) =>
      [
        item.subjectName,
        item.subjectCode,
        item.departmentName,
        item.departmentCode,
        item.section,
        item.day,
        item.roomNo,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }

  if (day) {
    filteredRows = filteredRows.filter((item) => String(item.day || "").toLowerCase() === day.toLowerCase());
  }

  if (section) {
    filteredRows = filteredRows.filter((item) => String(item.section || "").toUpperCase() === section);
  }

  if (departmentId && mongoose.Types.ObjectId.isValid(departmentId)) {
    filteredRows = filteredRows.filter(
      (item) => String(item.departmentId || "") === String(departmentId)
    );
  }

  if (subjectType) {
    filteredRows = filteredRows.filter(
      (item) => String(item.subjectType || "").toLowerCase() === subjectType
    );
  }

  if (Number.isFinite(semester)) {
    filteredRows = filteredRows.filter((item) => Number(item.semester) === semester);
  }

  const sortByKey = SORT_FIELD_MAP[toSafeString(req.query.sortBy)] || "dayOrder";
  const sortOrder = toSafeString(req.query.sortOrder).toLowerCase() === "desc" ? "desc" : "asc";

  const sortedRows = filteredRows
    .map((item) => ({
      ...item,
      dayOrder: DAY_POSITION[item.day] || 99,
      startTime: String(item.startTime || ""),
      subjectName: String(item.subjectName || ""),
      subjectCode: String(item.subjectCode || ""),
      departmentName: String(item.departmentName || ""),
      section: String(item.section || ""),
      subjectType: String(item.subjectType || ""),
    }))
    .sort((left, right) => {
      const leftValue = left[sortByKey];
      const rightValue = right[sortByKey];

      if (leftValue === rightValue) {
        return 0;
      }

      if (leftValue === undefined || leftValue === null) return 1;
      if (rightValue === undefined || rightValue === null) return -1;

      const leftComparable = typeof leftValue === "string" ? leftValue.toLowerCase() : leftValue;
      const rightComparable = typeof rightValue === "string" ? rightValue.toLowerCase() : rightValue;

      if (leftComparable < rightComparable) {
        return sortOrder === "asc" ? -1 : 1;
      }

      return sortOrder === "asc" ? 1 : -1;
    });

  const total = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  const paginatedRows = sortedRows.slice(start, start + limit);

  return sendPaginated(res, 200, "Assigned classes fetched", paginatedRows, {
    page: safePage,
    limit,
    total,
    totalPages,
    sortBy: toSafeString(req.query.sortBy) || "day",
    sortOrder,
    filters: {
      search: toSafeString(req.query.search) || "",
      day: day || "",
      section: section || "",
      semester: Number.isFinite(semester) ? semester : null,
      departmentId: departmentId || "",
      subjectType: subjectType || "",
      academicYear,
    },
  });
});

const getSubjectSummary = catchAsync(async (req, res) => {
  const facultyId = req.user.profileId;
  const { subjectId, semester, section } = req.query;

  if (!subjectId || !mongoose.Types.ObjectId.isValid(String(subjectId))) {
    throw new AppError(400, "Valid subjectId is required");
  }

  const isAssigned = await Timetable.validateAssignment(facultyId, subjectId);
  if (!isAssigned) {
    throw new AppError(403, "You are not assigned to this subject");
  }

  const assignment = await Timetable.findOne({
    facultyId,
    subjectId,
    semester: Number(semester),
    section: String(section || "").toUpperCase(),
    isActive: true,
  })
    .select("departmentId semester section")
    .lean();

  if (!assignment) {
    throw new AppError(404, "Class assignment not found for subject/semester/section");
  }

  const students = await Timetable.getClassStudents(
    subjectId,
    assignment.semester,
    assignment.section,
    assignment.departmentId
  );

  const studentIds = students.map((student) => student._id);

  const attendanceRows = await Attendance.find({
    studentId: { $in: studentIds },
    subjectId,
  })
    .select("studentId periodNumber status")
    .sort({ periodNumber: 1 })
    .lean();

  const perStudentMap = new Map(
    students.map((student) => [
      String(student._id),
      {
        studentId: student._id,
        name: student.name,
        rollNumber: student.rollNumber,
        total: 0,
        present: 0,
        late: 0,
        absent: 0,
        percentage: 0,
        periodWise: {},
      },
    ])
  );

  for (const row of attendanceRows) {
    const student = perStudentMap.get(String(row.studentId));
    if (!student) {
      continue;
    }

    student.total += 1;
    if (row.status === "P") student.present += 1;
    else if (row.status === "L") student.late += 1;
    else student.absent += 1;

    const key = `period_${row.periodNumber}`;
    if (!student.periodWise[key]) {
      student.periodWise[key] = { total: 0, present: 0, late: 0, absent: 0 };
    }

    student.periodWise[key].total += 1;
    if (row.status === "P") student.periodWise[key].present += 1;
    else if (row.status === "L") student.periodWise[key].late += 1;
    else student.periodWise[key].absent += 1;
  }

  const summary = [...perStudentMap.values()].map((item) => {
    item.percentage = attendanceCalc.calculatePercentage(item.present, item.late, item.total);
    return item;
  });

  return sendSuccess(res, 200, "Subject summary fetched", {
    subjectId,
    semester: assignment.semester,
    section: assignment.section,
    totalStudents: summary.length,
    students: summary,
  });
});

module.exports = {
  markPeriodAttendance,
  getPeriodAttendanceStatus,
  getFacultyTimetable,
  getFacultyAssignedClasses,
  getSubjectSummary,
};
