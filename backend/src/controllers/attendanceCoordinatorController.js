const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const mongoose = require("mongoose");

const { Attendance, Student, Faculty, Notice, Timetable } = require("../models");
const { catchAsync, AppError } = require("../utils/AppError");
const { sendSuccess } = require("../utils/responseHelper");

const THRESHOLD = Number(process.env.ATTENDANCE_THRESHOLD || 75);

const toDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, `Invalid date: ${value}`);
  }
  return parsed;
};

const normalizeClassYear = (semester) => {
  const sem = Number(semester || 0);
  if (!Number.isFinite(sem) || sem <= 0) return "-";
  return Math.ceil(sem / 2);
};

const getCoordinatorDepartmentId = async (user) => {
  if (!["attendance_coordinator", "hod", "admin"].includes(String(user?.role || ""))) {
    throw new AppError(403, "You are not allowed to access coordinator analytics");
  }

  if (user.role === "admin") {
    return null;
  }

  const faculty = await Faculty.findById(user.profileId).select("departmentId isActive").lean();
  if (!faculty?.departmentId || faculty.isActive === false) {
    throw new AppError(403, "Department context not found");
  }

  return new mongoose.Types.ObjectId(String(faculty.departmentId));
};

const buildAttendanceMatch = ({ departmentId, query }) => {
  const match = {};
  if (departmentId) match.departmentId = departmentId;

  const fromDate = toDateOrNull(query.fromDate || query.startDate);
  const toDate = toDateOrNull(query.toDate || query.endDate);
  if (fromDate || toDate) {
    match.date = {};
    if (fromDate) match.date.$gte = fromDate;
    if (toDate) match.date.$lte = toDate;
  }

  return match;
};

const getStudentAttendanceRows = async ({ departmentId, query, threshold = THRESHOLD }) => {
  const studentMatch = {};
  if (departmentId) studentMatch.departmentId = departmentId;

  if (query.semester) {
    const semester = Number.parseInt(String(query.semester), 10);
    if (Number.isInteger(semester) && semester > 0) {
      studentMatch.semester = semester;
    }
  }

  if (query.section) {
    studentMatch.section = String(query.section).toUpperCase();
  }

  const attendanceMatch = buildAttendanceMatch({ departmentId, query });

  const rows = await Attendance.aggregate([
    { $match: attendanceMatch },
    {
      $group: {
        _id: "$studentId",
        totalClasses: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status", "P"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "L"] }, 1, 0] } },
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
    { $unwind: "$student" },
    { $match: Object.keys(studentMatch).length ? { "student": studentMatch } : {} },
    {
      $project: {
        _id: 0,
        studentId: "$_id",
        rollNumber: "$student.rollNumber",
        name: "$student.name",
        semester: "$student.semester",
        section: "$student.section",
        totalClasses: 1,
        totalPresent: { $add: ["$present", { $multiply: ["$late", 0.5] }] },
        totalAbsent: { $subtract: ["$totalClasses", { $add: ["$present", "$late"] }] },
      },
    },
  ]);

  return rows.map((item) => {
    const attendancePercentage = Number(((Number(item.totalPresent || 0) / Math.max(1, Number(item.totalClasses || 0))) * 100).toFixed(2));
    return {
      ...item,
      year: normalizeClassYear(item.semester),
      className: `Sem ${item.semester || "-"} / Sec ${String(item.section || "-").toUpperCase()}`,
      attendancePercentage,
      defaulterStatus: attendancePercentage < threshold ? "Defaulter" : "Regular",
    };
  });
};

const getDepartmentClassCatalog = async ({ departmentId, query }) => {
  const semesterFilter = Number.parseInt(String(query.semester || ""), 10);
  const sectionFilter = query.section ? String(query.section).toUpperCase() : null;
  const academicYearFilter = query.academicYear ? String(query.academicYear).trim() : null;

  const timetableRows = await Timetable.aggregate([
    {
      $match: {
        ...(departmentId ? { departmentId } : {}),
        ...(Number.isInteger(semesterFilter) && semesterFilter > 0 ? { semester: semesterFilter } : {}),
        ...(sectionFilter ? { section: sectionFilter } : {}),
        ...(academicYearFilter ? { academicYear: academicYearFilter } : {}),
        isActive: true,
      },
    },
    {
      $group: {
        _id: {
          semester: "$semester",
          section: "$section",
          academicYear: "$academicYear",
        },
      },
    },
  ]);

  const studentRows = await Student.aggregate([
    {
      $match: {
        ...(departmentId ? { departmentId } : {}),
        ...(Number.isInteger(semesterFilter) && semesterFilter > 0 ? { semester: semesterFilter } : {}),
        ...(sectionFilter ? { section: sectionFilter } : {}),
        isActive: true,
      },
    },
    {
      $group: {
        _id: {
          semester: "$semester",
          section: "$section",
        },
      },
    },
  ]);

  const classMap = new Map();
  timetableRows.forEach((row) => {
    const semester = Number(row?._id?.semester || 0);
    const section = String(row?._id?.section || "").toUpperCase();
    const academicYear = String(row?._id?.academicYear || "Current");
    if (!semester || !section) return;
    classMap.set(`${semester}-${section}`, { semester, section, academicYear });
  });

  studentRows.forEach((row) => {
    const semester = Number(row?._id?.semester || 0);
    const section = String(row?._id?.section || "").toUpperCase();
    if (!semester || !section) return;
    const key = `${semester}-${section}`;
    if (!classMap.has(key)) {
      classMap.set(key, { semester, section, academicYear: academicYearFilter || "Current" });
    }
  });

  return Array.from(classMap.values()).sort((a, b) => (a.semester - b.semester) || a.section.localeCompare(b.section));
};

const getClassAttendanceRows = async ({ departmentId, query }) => {
  const [studentRows, classCatalog] = await Promise.all([
    getStudentAttendanceRows({ departmentId, query, threshold: THRESHOLD }),
    getDepartmentClassCatalog({ departmentId, query }),
  ]);
  const grouped = new Map();

  classCatalog.forEach((item) => {
    const key = `${item.semester}-${item.section}`;
    grouped.set(key, {
      className: `Sem ${item.semester} / Sec ${item.section}`,
      academicYear: item.academicYear || "Current",
      year: normalizeClassYear(item.semester),
      semester: item.semester,
      section: item.section,
      studentsCount: 0,
      totalClasses: 0,
      totalPresent: 0,
      totalAbsent: 0,
    });
  });

  studentRows.forEach((row) => {
    const key = `${row.semester}-${String(row.section || "").toUpperCase()}`;
    const current = grouped.get(key) || {
      className: `Sem ${row.semester || "-"} / Sec ${String(row.section || "-").toUpperCase()}`,
      academicYear: String(query.academicYear || "Current"),
      year: normalizeClassYear(row.semester),
      semester: row.semester,
      section: String(row.section || "-").toUpperCase(),
      studentsCount: 0,
      totalClasses: 0,
      totalPresent: 0,
      totalAbsent: 0,
    };

    current.studentsCount += 1;
    current.totalClasses += Number(row.totalClasses || 0);
    current.totalPresent += Number(row.totalPresent || 0);
    current.totalAbsent += Number(row.totalAbsent || 0);
    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      averageAttendancePercentage: Number(((item.totalPresent / Math.max(1, item.totalClasses)) * 100).toFixed(2)),
    }))
    .sort((a, b) => (a.semester - b.semester) || String(a.section).localeCompare(String(b.section)));
};

const summarizeForDashboard = async ({ departmentId }) => {
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  const [students, todayRows, monthRows, classRows] = await Promise.all([
    Student.countDocuments({ ...(departmentId ? { departmentId } : {}), isActive: true }),
    Attendance.aggregate([
      { $match: { ...(departmentId ? { departmentId } : {}), date: todayUtc } },
      { $group: { _id: null, total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ["$status", "P"] }, 1, 0] } }, late: { $sum: { $cond: [{ $eq: ["$status", "L"] }, 1, 0] } } } },
    ]),
    Attendance.aggregate([
      { $match: { ...(departmentId ? { departmentId } : {}), date: { $gte: monthStart, $lte: today } } },
      { $group: { _id: null, total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ["$status", "P"] }, 1, 0] } }, late: { $sum: { $cond: [{ $eq: ["$status", "L"] }, 1, 0] } } } },
    ]),
    getClassAttendanceRows({ departmentId, query: {} }),
  ]);

  const classesBelow75 = classRows.filter((row) => Number(row.averageAttendancePercentage || 0) < THRESHOLD).length;

  return {
    totalDepartmentClasses: classRows.length,
    totalStudents: students,
    todayAttendancePercentage: Number((((todayRows[0]?.present || 0) + (todayRows[0]?.late || 0) * 0.5) / Math.max(1, todayRows[0]?.total || 0) * 100).toFixed(2)),
    monthlyAttendancePercentage: Number((((monthRows[0]?.present || 0) + (monthRows[0]?.late || 0) * 0.5) / Math.max(1, monthRows[0]?.total || 0) * 100).toFixed(2)),
    classesBelow75,
    defaultersCount: classesBelow75,
  };
};

const getDashboard = catchAsync(async (req, res) => {
  const departmentId = await getCoordinatorDepartmentId(req.user);
  const [summary, classRows] = await Promise.all([
    summarizeForDashboard({ departmentId }),
    getClassAttendanceRows({ departmentId, query: req.query }),
  ]);

  const bySemester = new Map();
  classRows.forEach((row) => {
    const semKey = String(row.semester || "-");
    const current = bySemester.get(semKey) || { semester: semKey, total: 0, score: 0 };
    current.total += 1;
    current.score += Number(row.averageAttendancePercentage || 0);
    bySemester.set(semKey, current);
  });

  const trendRows = await Attendance.aggregate([
    { $match: { ...(departmentId ? { departmentId } : {}) } },
    {
      $group: {
        _id: { year: { $year: "$date" }, month: { $month: "$date" } },
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status", "P"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "L"] }, 1, 0] } },
      },
    },
    { $sort: { "_id.year": -1, "_id.month": -1 } },
    { $limit: 12 },
  ]);

  return sendSuccess(res, 200, "Attendance coordinator dashboard fetched", {
    ...summary,
    downloadsCount: Number(req.user?.downloadCount || 0),
    charts: {
      monthlyAttendanceTrend: trendRows.map((row) => ({
        month: `${row._id.year}-${String(row._id.month).padStart(2, "0")}`,
        percentage: Number(((((row.present || 0) + (row.late || 0) * 0.5) / Math.max(1, row.total || 0)) * 100).toFixed(2)),
      })).reverse(),
      semesterComparison: Array.from(bySemester.values()).map((item) => ({
        semester: item.semester,
        attendancePercentage: Number((item.score / Math.max(1, item.total)).toFixed(2)),
      })),
    },
  });
});

const getDepartmentClasses = catchAsync(async (req, res) => {
  const departmentId = await getCoordinatorDepartmentId(req.user);
  const rows = await getClassAttendanceRows({ departmentId, query: req.query });
  return sendSuccess(res, 200, "Department classes fetched", {
    rows,
    total: rows.length,
  });
});

const getStudentAttendanceReports = catchAsync(async (req, res) => {
  const departmentId = await getCoordinatorDepartmentId(req.user);
  const rows = await getStudentAttendanceRows({ departmentId, query: req.query, threshold: THRESHOLD });

  const minPct = Number(req.query.minAttendance || 0);
  const maxPct = Number(req.query.maxAttendance || 100);
  const below75 = String(req.query.below75 || "false") === "true";
  const above75 = String(req.query.above75 || "false") === "true";

  const filtered = rows.filter((item) => {
    if (item.attendancePercentage < minPct || item.attendancePercentage > maxPct) return false;
    if (below75 && item.attendancePercentage >= THRESHOLD) return false;
    if (above75 && item.attendancePercentage < THRESHOLD) return false;
    return true;
  });

  return sendSuccess(res, 200, "Student attendance reports fetched", {
    threshold: THRESHOLD,
    rows: filtered,
    total: filtered.length,
  });
});

const getClassAttendanceReports = catchAsync(async (req, res) => {
  const departmentId = await getCoordinatorDepartmentId(req.user);
  const rows = await getClassAttendanceRows({ departmentId, query: req.query });

  return sendSuccess(res, 200, "Class attendance reports fetched", {
    rows,
    total: rows.length,
  });
});

const getMonthlyReports = catchAsync(async (req, res) => {
  const departmentId = await getCoordinatorDepartmentId(req.user);
  const rows = await Attendance.aggregate([
    { $match: { ...(departmentId ? { departmentId } : {}) } },
    {
      $group: {
        _id: { year: { $year: "$date" }, month: { $month: "$date" } },
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status", "P"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "L"] }, 1, 0] } },
      },
    },
    { $sort: { "_id.year": -1, "_id.month": -1 } },
    { $limit: 24 },
  ]);

  return sendSuccess(res, 200, "Monthly attendance reports fetched", {
    rows: rows.map((row) => ({
      year: row._id.year,
      month: `${row._id.year}-${String(row._id.month).padStart(2, "0")}`,
      totalClasses: row.total,
      percentage: Number(((((row.present || 0) + (row.late || 0) * 0.5) / Math.max(1, row.total || 0)) * 100).toFixed(2)),
    })),
  });
});

const getSemesterReports = catchAsync(async (req, res) => {
  const departmentId = await getCoordinatorDepartmentId(req.user);
  const classRows = await getClassAttendanceRows({ departmentId, query: req.query });

  const bySem = new Map();
  classRows.forEach((row) => {
    const sem = String(row.semester || "-");
    const entry = bySem.get(sem) || { semester: sem, total: 0, score: 0 };
    entry.total += 1;
    entry.score += Number(row.averageAttendancePercentage || 0);
    bySem.set(sem, entry);
  });

  return sendSuccess(res, 200, "Semester reports fetched", {
    rows: Array.from(bySem.values()).map((row) => ({
      semester: row.semester,
      attendancePercentage: Number((row.score / Math.max(1, row.total)).toFixed(2)),
      totalClasses: row.total,
    })),
  });
});

const getBelowThresholdStudents = catchAsync(async (req, res) => {
  req.query.below75 = "true";
  return getStudentAttendanceReports(req, res);
});

const getAboveThresholdStudents = catchAsync(async (req, res) => {
  req.query.above75 = "true";
  return getStudentAttendanceReports(req, res);
});

const writeRowsSheet = (workbook, sheetName, rows = []) => {
  const sheet = workbook.addWorksheet(sheetName.slice(0, 30));
  if (!rows.length) {
    sheet.addRow(["No data available"]);
    return;
  }

  const headers = Object.keys(rows[0]);
  sheet.columns = headers.map((header) => ({ header, key: header, width: 22 }));
  rows.forEach((row) => sheet.addRow(row));
};

const buildCsv = (rows = []) => {
  if (!rows.length) return "No data available\n";
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(",")),
  ].join("\n");
};

const buildClassReportPdf = async (rows = [], filters = {}) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Class-wise Attendance Report", { align: "center" });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor("#475569").text(`Generated: ${new Date().toISOString()}`, { align: "center" });
    doc.text(`Filters - Semester: ${filters.semester || "All"}, Section: ${filters.section || "All"}, Academic Year: ${filters.academicYear || "All"}`, { align: "center" });
    doc.moveDown(1);

    doc.fillColor("#0f172a").fontSize(11);
    rows.forEach((row, index) => {
      doc.text(`${index + 1}. ${row.className} | Students: ${row.studentsCount} | Attendance: ${row.averageAttendancePercentage}%`);
      doc.moveDown(0.2);
      if (doc.y > 760) doc.addPage();
    });

    if (!rows.length) {
      doc.text("No class-wise records available for selected filters.");
    }

    doc.end();
  });
};

const downloadReports = catchAsync(async (req, res) => {
  const departmentId = await getCoordinatorDepartmentId(req.user);
  const rows = await getClassAttendanceRows({ departmentId, query: req.query });
  const format = String(req.query.format || "excel").toLowerCase();
  const supportedFormats = new Set(["csv", "pdf", "excel"]);
  if (!supportedFormats.has(format)) {
    throw new AppError(400, "Invalid format. Use pdf, excel, or csv");
  }

  if (format === "csv") {
    const csv = buildCsv(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="class-wise-attendance-${Date.now()}.csv"`);
    return res.status(200).send(csv);
  }

  if (format === "pdf") {
    const pdf = await buildClassReportPdf(rows, req.query);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="class-wise-attendance-${Date.now()}.pdf"`);
    return res.status(200).send(pdf);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Attendance Management System";
  workbook.created = new Date();
  writeRowsSheet(workbook, "Class Wise Attendance", rows);

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="class-wise-attendance-${Date.now()}.xlsx"`);
  return res.status(200).send(Buffer.from(buffer));
});

const pushCoordinatorAlert = catchAsync(async (req, res) => {
  const { type, message } = req.body;
  if (!type || !message) {
    throw new AppError(400, "type and message are required");
  }

  const departmentId = await getCoordinatorDepartmentId(req.user);
  const targetDept = departmentId || req.body.targetDept || req.query.departmentId;
  const targetSemester = Number.parseInt(String(req.body.targetSemester || req.query.semester || 1), 10);
  const targetSection = String(req.body.targetSection || req.query.section || "A").toUpperCase();

  if (!Number.isInteger(targetSemester) || targetSemester < 1 || targetSemester > 8) {
    throw new AppError(400, "targetSemester must be between 1 and 8");
  }

  if (!targetSection || targetSection.length > 4) {
    throw new AppError(400, "targetSection is required and must be up to 4 characters");
  }

  if (!targetDept) {
    throw new AppError(400, "targetDept is required for admin alerts");
  }

  await Notice.create({
    title: type,
    message,
    type: "alert",
    targetDept,
    targetSemester,
    targetSection,
    recipientRoles: ["attendance_coordinator"],
    sentBy: req.user._id,
    isPinned: false,
  });

  return sendSuccess(res, 201, "Alert sent", { type, message });
});

module.exports = {
  getDashboard,
  getDepartmentClasses,
  getClassAttendanceReports,
  getStudentAttendanceReports,
  getSemesterReports,
  getMonthlyReports,
  downloadReports,
  getBelowThresholdStudents,
  getAboveThresholdStudents,
  pushCoordinatorAlert,
};
