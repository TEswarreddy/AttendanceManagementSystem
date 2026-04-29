const { get, setEx, del, setAdd, setMembers } = require("../config/redis");
const { AppError } = require("./AppError");
const dateHelper = require("./dateHelper");
const attendanceCalc = require("./attendanceCalc");
const { Timetable, Attendance, Subject } = require("../models");

const DEFAULT_TTL_SECONDS = 5 * 60;

const encodeValue = (value) => {
  if (Buffer.isBuffer(value)) {
    return JSON.stringify({ __type: "buffer", data: value.toString("base64") });
  }

  return JSON.stringify({ __type: "json", data: value });
};

const decodeValue = (serialized) => {
  if (serialized == null) {
    return null;
  }

  try {
    const parsed = JSON.parse(serialized);
    if (parsed?.__type === "buffer" && typeof parsed.data === "string") {
      return Buffer.from(parsed.data, "base64");
    }

    if (parsed?.__type === "json") {
      return parsed.data;
    }
  } catch (error) {
    return serialized;
  }

  return null;
};

const getCachedReportData = async (key) => {
  const cached = await get(key);
  return decodeValue(cached);
};

const setCachedReportData = async (key, value, ttlSeconds = DEFAULT_TTL_SECONDS) => {
  await setEx(key, ttlSeconds, encodeValue(value));
};

const deleteCachedReportData = async (key) => {
  await del(key);
};

const getNamespaceIndexKey = (namespace) => `cache:index:${namespace}`;

const trackCacheKey = async (namespace, key, ttlSeconds = DEFAULT_TTL_SECONDS) => {
  if (!namespace || !key) {
    return;
  }

  await setAdd(getNamespaceIndexKey(namespace), key, ttlSeconds);
};

const invalidateCacheNamespace = async (namespace) => {
  if (!namespace) {
    return;
  }

  const indexKey = getNamespaceIndexKey(namespace);
  const keys = await setMembers(indexKey);
  const toDelete = [...keys, indexKey];

  if (!toDelete.length) {
    return;
  }

  await Promise.allSettled(toDelete.map((key) => del(key)));
};

const buildMonthlyClassReport = async (params) => {
  const { subjectId, facultyId, month, year, semester, section, filter = 'all' } = params;

  // Step 1: Build date range for the month
  const fromDate = new Date(year, month - 1, 1);
  const toDate = new Date(year, month, 0);
  const monthLabel = fromDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Step 2: Validate faculty assignment
  const assignment = await Timetable.findOne({
    subjectId: new (require("mongoose")).Types.ObjectId(subjectId),
    facultyId: new (require("mongoose")).Types.ObjectId(facultyId),
  });

  if (!assignment) {
    throw new AppError(403, `Faculty not assigned to subject ${subjectId}`);
  }

  // Step 3: Get class students
  const students = await Timetable.getClassStudents(subjectId, semester, section, assignment.departmentId);
  if (!Array.isArray(students)) {
    throw new AppError(500, 'Failed to fetch class students');
  }

  // Step 4: Get all attendance for month
  const records = await Attendance.find({
    subjectId: new (require("mongoose")).Types.ObjectId(subjectId),
    date: { $gte: fromDate, $lte: toDate },
  }).lean();

  const studentMap = {};
  for (const student of students) {
    studentMap[student._id.toString()] = {
      present: 0,
      late: 0,
      absent: 0,
      total: 0,
      dateMap: {},
    };
  }

  for (const record of records) {
    const key = record.studentId.toString();
    if (studentMap[key]) {
      const dateStr = dateHelper.toDateString(record.date);
      studentMap[key].dateMap[dateStr] = record.status;

      if (record.status === 'present') {
        studentMap[key].present += 1;
      } else if (record.status === 'late') {
        studentMap[key].late += 1;
      } else if (record.status === 'absent') {
        studentMap[key].absent += 1;
      }
      studentMap[key].total += 1;
    }
  }

  // Step 5: Get all class dates held this month
  const classDatesSet = new Set(records.map((r) => dateHelper.toDateString(r.date)));
  const classDates = Array.from(classDatesSet).sort();

  // Step 6: Build student rows
  let rows = students.map((student) => {
    const counts = studentMap[student._id.toString()] || { present: 0, late: 0, absent: 0, total: classDates.length };
    const percentage = attendanceCalc.calculatePercentage(counts.present, counts.late, counts.total);
    const status = attendanceCalc.getAttendanceStatus(percentage);
    const dateGrid = classDates.map((d) => counts.dateMap[d] || '-');

    return {
      rollNumber: student.rollNumber || '',
      studentName: student.name || student.studentName || '',
      present: counts.present,
      late: counts.late,
      absent: counts.absent,
      total: counts.total,
      percentage,
      status,
      dateGrid,
    };
  });

  // Step 7: Apply filter
  if (filter === 'below75') {
    rows = rows.filter((r) => r.percentage < 75);
  } else if (filter === 'above75') {
    rows = rows.filter((r) => r.percentage >= 75);
  }

  // Step 8: Sort rows
  if (filter === 'below75') {
    rows.sort((a, b) => a.percentage - b.percentage);
  } else if (filter === 'above75') {
    rows.sort((a, b) => b.percentage - a.percentage);
  } else {
    rows.sort((a, b) => (a.rollNumber || '').localeCompare(b.rollNumber || ''));
  }

  // Step 9: Build summary stats
  const classAverage = rows.length > 0 ? rows.reduce((sum, r) => sum + r.percentage, 0) / rows.length : 0;
  const below75Count = rows.filter((r) => r.percentage < 75).length;
  const above75Count = rows.filter((r) => r.percentage >= 75).length;
  const perfectAttendance = rows.filter((r) => r.percentage === 100).length;

  const summary = {
    totalStudents: students.length,
    filtered: rows.length,
    classDatesHeld: classDates.length,
    classAverage: Number(classAverage.toFixed(2)),
    below75Count,
    above75Count,
    perfectAttendance,
  };

  // Get subject details
  const subject = await Subject.findById(subjectId).lean();
  const subjectName = subject?.name || '';
  const subjectCode = subject?.code || '';
  const facultyName = assignment.facultyName || '';

  return {
    reportMeta: {
      month,
      year,
      monthLabel,
      filter,
      subjectName,
      subjectCode,
      facultyName,
      semester,
      section,
      generatedAt: new Date(),
    },
    summary,
    classDates,
    rows,
  };
};

const buildSemesterClassReport = async (params) => {
  const { subjectId, facultyId, academicYear, semester, section } = params;

  // Validate faculty assignment
  const assignment = await Timetable.findOne({
    subjectId: new (require("mongoose")).Types.ObjectId(subjectId),
    facultyId: new (require("mongoose")).Types.ObjectId(facultyId),
  });

  if (!assignment) {
    throw new AppError(403, `Faculty not assigned to subject ${subjectId}`);
  }

  // Parse academic year (e.g. "2024-2025" => fromYear=2024)
  const fromYear = parseInt(academicYear.split('-')[0], 10);

  // Date range: June 1 of fromYear to today
  const fromDate = new Date(fromYear, 5, 1); // June 1
  const toDate = new Date(); // Today

  // Get class students
  const students = await Timetable.getClassStudents(subjectId, semester, section, assignment.departmentId);
  if (!Array.isArray(students)) {
    throw new AppError(500, 'Failed to fetch class students');
  }

  // Get all attendance for semester
  const records = await Attendance.find({
    subjectId: new (require("mongoose")).Types.ObjectId(subjectId),
    date: { $gte: fromDate, $lte: toDate },
  }).lean();

  const studentMap = {};
  const monthlyDataMap = {}; // Track per-month data

  for (const student of students) {
    studentMap[student._id.toString()] = {
      present: 0,
      late: 0,
      absent: 0,
      total: 0,
      dateMap: {},
    };
  }

  for (const record of records) {
    const key = record._id.toString();
    if (studentMap[key]) {
      const dateStr = dateHelper.toDateString(record.date);
      const monthStr = record.date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      studentMap[key].dateMap[dateStr] = record.status;

      if (record.status === 'present') {
        studentMap[key].present += 1;
      } else if (record.status === 'late') {
        studentMap[key].late += 1;
      } else if (record.status === 'absent') {
        studentMap[key].absent += 1;
      }
      studentMap[key].total += 1;

      // Track monthly data
      if (!monthlyDataMap[monthStr]) {
        monthlyDataMap[monthStr] = { month: monthStr, present: 0, total: 0 };
      }
      monthlyDataMap[monthStr].total += 1;
      if (record.status === 'present' || record.status === 'late') {
        monthlyDataMap[monthStr].present += 1;
      }
    }
  }

  // Calculate monthly percentages for trend
  const monthlyTrend = Object.values(monthlyDataMap)
    .sort((a, b) => new Date(a.month) - new Date(b.month))
    .map((m) => ({
      month: m.month,
      present: m.present,
      total: m.total,
      percentage: m.total > 0 ? Number(((m.present / m.total) * 100).toFixed(2)) : 0,
    }));

  // Build student rows (same as monthly but for full semester)
  const classDates = Array.from(new Set(records.map((r) => dateHelper.toDateString(r.date)))).sort();

  let rows = students.map((student) => {
    const counts = studentMap[student._id.toString()] || { present: 0, late: 0, absent: 0, total: classDates.length };
    const percentage = attendanceCalc.calculatePercentage(counts.present, counts.late, counts.total);
    const status = attendanceCalc.getAttendanceStatus(percentage);
    const dateGrid = classDates.map((d) => counts.dateMap[d] || '-');

    return {
      rollNumber: student.rollNumber || '',
      studentName: student.name || student.studentName || '',
      present: counts.present,
      late: counts.late,
      absent: counts.absent,
      total: counts.total,
      percentage,
      status,
      dateGrid,
    };
  });

  // Sort by roll number
  rows.sort((a, b) => (a.rollNumber || '').localeCompare(b.rollNumber || ''));

  // Build summary stats
  const classAverage = rows.length > 0 ? rows.reduce((sum, r) => sum + r.percentage, 0) / rows.length : 0;
  const below75Count = rows.filter((r) => r.percentage < 75).length;
  const above75Count = rows.filter((r) => r.percentage >= 75).length;
  const perfectAttendance = rows.filter((r) => r.percentage === 100).length;

  const summary = {
    totalStudents: students.length,
    filtered: rows.length,
    classDatesHeld: classDates.length,
    classAverage: Number(classAverage.toFixed(2)),
    below75Count,
    above75Count,
    perfectAttendance,
  };

  // Get subject details
  const subject = await Subject.findById(subjectId).lean();
  const subjectName = subject?.name || '';
  const subjectCode = subject?.code || '';
  const facultyName = assignment.facultyName || '';

  return {
    reportMeta: {
      academicYear,
      semester,
      section,
      subjectName,
      subjectCode,
      facultyName,
      generatedAt: new Date(),
    },
    summary,
    classDates,
    rows,
    monthlyTrend,
  };
};

module.exports = {
  getCachedReportData,
  setCachedReportData,
  deleteCachedReportData,
  trackCacheKey,
  invalidateCacheNamespace,
  DEFAULT_TTL_SECONDS,
  buildMonthlyClassReport,
  buildSemesterClassReport,
};