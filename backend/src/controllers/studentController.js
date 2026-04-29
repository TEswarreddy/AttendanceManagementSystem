const mongoose = require("mongoose");

const { Attendance, Timetable, Notice, Student } = require("../models");
const { catchAsync, AppError } = require("../utils/AppError");
const { sendSuccess, sendPaginated } = require("../utils/responseHelper");
const dateHelper = require("../utils/dateHelper");

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const computePercentage = (present, total) => {
  if (!total) {
    return 0;
  }

  return Number(((present / total) * 100).toFixed(2));
};

const normalizeDateSafe = (value) => {
  try {
    return dateHelper.toMidnightUTC(value);
  } catch {
    return dateHelper.toMidnightUTC(new Date());
  }
};

const getStudentProfile = async (studentId) => {
  const student = await Student.findById(studentId)
    .select("departmentId semester section isActive")
    .lean();

  if (!student || !student.isActive) {
    throw new AppError(404, "Student profile not found");
  }

  return student;
};

const getTodayAttendance = catchAsync(async (req, res) => {
  const studentId = req.user.profileId;
  const today = dateHelper.toMidnightUTC(new Date());
  const student = await getStudentProfile(studentId);

  const [todaySchedule, todayAttendance] = await Promise.all([
    Timetable.getTodaySchedule(student.departmentId, student.semester, student.section),
    Attendance.getTodayAttendance(studentId, today),
  ]);

  const attendanceByPeriod = new Map(todayAttendance.map((item) => [String(item.periodNumber), item]));

  const periods = (todaySchedule || []).map((period) => {
    const matched = attendanceByPeriod.get(String(period.periodNumber));

    return {
      periodNumber: Number(period.periodNumber),
      periodLabel: period.periodLabel || `Period ${period.periodNumber}`,
      startTime: period.startTime || null,
      endTime: period.endTime || null,
      subject: {
        name: period.subjectName || "-",
        code: period.subjectCode || "-",
        type: period.subjectType || "theory",
      },
      faculty: {
        name: period.facultyName || "-",
      },
      status: matched?.status || "not_marked_yet",
      room: period.roomNo || "-",
    };
  });

  const present = periods.filter((item) => item.status === "P").length;
  const absent = periods.filter((item) => item.status === "A").length;
  const late = periods.filter((item) => item.status === "L").length;

  const summary = {
    total: periods.length,
    present,
    absent,
    late,
    percentage: computePercentage(present, periods.length),
  };

  return sendSuccess(res, 200, "Today attendance fetched", {
    date: today,
    dayName: DAYS[new Date(today).getUTCDay()],
    periods,
    summary,
  });
});

const getAttendanceSummary = catchAsync(async (req, res) => {
  const studentId = req.user.profileId;
  void req.query.semester;
  void req.query.academicYear;

  const rows = await Attendance.getStudentSummary(studentId);

  const theory = rows.filter((row) => row.subjectType !== "lab");
  const lab = rows.filter((row) => row.subjectType === "lab");

  const theoryPresent = theory.reduce((sum, row) => sum + Number(row.present || 0), 0);
  const theoryTotal = theory.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const labPresent = lab.reduce((sum, row) => sum + Number(row.present || 0), 0);
  const labTotal = lab.reduce((sum, row) => sum + Number(row.total || 0), 0);

  const overallPresent = rows.reduce((sum, row) => sum + Number(row.present || 0), 0);
  const overallTotal = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);

  const threshold = Number(process.env.ATTENDANCE_THRESHOLD || 75);

  const payload = {
    theory,
    lab,
    overall: {
      theoryPercentage: computePercentage(theoryPresent, theoryTotal),
      labPercentage: computePercentage(labPresent, labTotal),
      overallPercentage: computePercentage(overallPresent, overallTotal),
      threshold,
    },
    lowAttendanceSubjects: rows.filter((row) => Number(row.percentage || 0) < threshold),
  };

  return sendSuccess(res, 200, "Attendance summary fetched", payload);
});

const getTimetable = catchAsync(async (req, res) => {
  const studentId = req.user.profileId;
  const student = await getStudentProfile(studentId);
  const requestedAcademicYear = req.query.academicYear;
  let academicYear = requestedAcademicYear || dateHelper.getAcademicYear(new Date());

  if (!requestedAcademicYear) {
    const availableYears = await Timetable.find({
      departmentId: student.departmentId,
      semester: student.semester,
      section: String(student.section || "").toUpperCase(),
      isActive: true,
    })
      .distinct("academicYear");

    const normalizedYears = availableYears
      .filter(Boolean)
      .map((year) => String(year).trim())
      .sort();

    if (normalizedYears.length > 0) {
      academicYear = normalizedYears[normalizedYears.length - 1];
    }
  }

  const weekly = await Timetable.getClassTimetable(
    student.departmentId,
    student.semester,
    student.section,
    academicYear
  );

  const grouped = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
  };

  for (const item of weekly.schedule || []) {
    const key = String(item.day || "").toLowerCase();
    if (!grouped[key]) {
      continue;
    }

    grouped[key].push(item);
  }

  return sendSuccess(res, 200, "Class timetable fetched", grouped);
});

const getNotifications = catchAsync(async (req, res) => {
  const studentId = req.user.profileId;
  const student = await getStudentProfile(studentId);

  const page = toPositiveInt(req.query.page, 1);
  const limit = toPositiveInt(req.query.limit, 20);

  const [notices, summaryRows] = await Promise.all([
    Notice.getClassNotices(student.departmentId, student.semester, student.section).lean(),
    Attendance.getStudentSummary(studentId),
  ]);

  const threshold = Number(process.env.ATTENDANCE_THRESHOLD || 75);

  const noticeItems = (notices || []).map((notice) => {
    const unread = !(notice.readBy || []).some(
      (id) => String(id) === String(studentId)
    );

    return {
      type: "notice",
      id: notice._id,
      title: notice.title,
      message: notice.message,
      noticeType: notice.type,
      isPinned: Boolean(notice.isPinned),
      unread,
      createdAt: notice.createdAt,
    };
  });

  const alertItems = (summaryRows || [])
    .filter((item) => Number(item.percentage || 0) < threshold)
    .map((item) => ({
      type: "alert",
      id: `${item.subjectId}-low`,
      title: "Low Attendance Warning",
      message: `${item.subjectName} attendance is ${Number(item.percentage || 0).toFixed(2)}% (required ${threshold}%).`,
      unread: true,
      createdAt: new Date().toISOString(),
    }));

  const combined = [...noticeItems, ...alertItems].sort((left, right) => {
    if (Boolean(left.unread) !== Boolean(right.unread)) {
      return left.unread ? -1 : 1;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  const start = (page - 1) * limit;
  const items = combined.slice(start, start + limit);

  return sendPaginated(res, 200, "Notifications fetched", items, {
    page,
    limit,
    total: combined.length,
    totalPages: Math.max(1, Math.ceil(combined.length / limit)),
  });
});

const getSubjectAttendanceDetail = catchAsync(async (req, res) => {
  const studentId = req.user.profileId;
  const { subjectId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    throw new AppError(400, "Invalid subject ID");
  }

  const records = await Attendance.find({
    studentId,
    subjectId,
  })
    .select("date periodNumber periodLabel status subjectType")
    .sort({ date: 1, periodNumber: 1 })
    .lean();

  const groupedByDate = records.reduce((acc, record) => {
    const key = dateHelper.toDateString(new Date(record.date));

    if (!acc[key]) {
      acc[key] = {
        date: key,
        periods: [],
      };
    }

    acc[key].periods.push({
      periodNumber: record.periodNumber,
      periodLabel: record.periodLabel || `Period ${record.periodNumber}`,
      status: record.status,
      subjectType: record.subjectType,
    });

    return acc;
  }, {});

  const detailedRecords = Object.values(groupedByDate);

  const monthlyMap = records.reduce((acc, record) => {
    const dt = normalizeDateSafe(record.date);
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;

    if (!acc[key]) {
      acc[key] = {
        month: key,
        total: 0,
        present: 0,
        late: 0,
        absent: 0,
      };
    }

    acc[key].total += 1;
    if (record.status === "P") acc[key].present += 1;
    else if (record.status === "L") acc[key].late += 1;
    else acc[key].absent += 1;

    return acc;
  }, {});

  const chartData = Object.values(monthlyMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((item) => ({
      ...item,
      percentage: Number((((item.present + item.late * 0.5) / Math.max(1, item.total)) * 100).toFixed(2)),
    }));

  return sendSuccess(res, 200, "Subject attendance detail fetched", {
    subjectId,
    detailedRecords,
    chartData,
  });
});

const getLeaveHistory = catchAsync(async (req, res) => {
  const studentId = req.user.profileId;
  const page = toPositiveInt(req.query.page, 1);
  const limit = toPositiveInt(req.query.limit, 20);

  const LeaveRequest = mongoose.models.LeaveRequest;

  if (!LeaveRequest) {
    return sendPaginated(res, 200, "Leave history fetched", [], {
      page,
      limit,
      total: 0,
      totalPages: 1,
    });
  }

  const filter = { studentId };
  const total = await LeaveRequest.countDocuments(filter);

  const items = await LeaveRequest.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return sendPaginated(res, 200, "Leave history fetched", items, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

module.exports = {
  getTodayAttendance,
  getAttendanceSummary,
  getTimetable,
  getNotifications,
  getSubjectAttendanceDetail,
  getLeaveHistory,
};
