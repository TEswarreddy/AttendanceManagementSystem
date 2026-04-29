const ExcelJS = require("exceljs");
const mongoose = require("mongoose");

const { catchAsync, AppError } = require("../utils/AppError");
const { sendSuccess } = require("../utils/responseHelper");
const reportDataService = require("../utils/reportDataService");
const { Attendance, Student, Subject, Faculty, Department, Timetable } = require("../models");
const pdfService = require("../services/pdfService");
const emailService = require("../services/emailService");
const smsService = require("../services/smsService");

const REPORT_CACHE_TTL_SECONDS = 5 * 60;

const getThreshold = () => Number(process.env.ATTENDANCE_THRESHOLD || 75);

const getFacultyDepartmentId = async (profileId) => {
  if (!profileId || !mongoose.Types.ObjectId.isValid(String(profileId))) {
    throw new AppError(403, "Department-scoped profile is required");
  }

  const faculty = await Faculty.findById(profileId).select("departmentId isActive").lean();
  if (!faculty || !faculty.departmentId || faculty.isActive === false) {
    throw new AppError(403, "Department context not found");
  }

  return new mongoose.Types.ObjectId(String(faculty.departmentId));
};

const toObjectId = (value, fieldName = "id", { required = true } = {}) => {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new AppError(400, `Valid ${fieldName} is required`);
    }

    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new AppError(400, `Valid ${fieldName} is required`);
  }

  return new mongoose.Types.ObjectId(String(value));
};

const toDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
};

const normalizeDate = (value) => {
  if (!value) {
    throw new AppError(400, "Valid date is required");
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new AppError(400, "Invalid date format");
  }

  return new Date(Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate()));
};

const getDateRange = (fromDate, toDate) => {
  const dates = [];
  const cursor = new Date(fromDate);
  while (cursor <= toDate) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

const getExcelColumnName = (columnNumber) => {
  let number = columnNumber;
  let columnName = "";

  while (number > 0) {
    const remainder = (number - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    number = Math.floor((number - 1) / 26);
  }

  return columnName;
};

const groupLowAttendanceByStudent = (lowRecords = []) => {
  const grouped = new Map();

  for (const record of lowRecords) {
    const key = String(record.studentId);
    const existing = grouped.get(key) || {
      studentId: record.studentId,
      studentName: record.studentName,
      studentEmail: record.studentEmail,
      studentPhone: record.studentPhone,
      rollNumber: record.rollNumber,
      subjects: [],
      worstPercentage: Number.POSITIVE_INFINITY,
      totalLowSubjects: 0,
    };

    existing.subjects.push({
      subjectId: record.subjectId,
      subjectName: record.subjectName,
      subjectCode: record.subjectCode,
      percentage: record.percentage,
      total: record.total,
      present: record.present,
      absent: record.absent,
    });

    existing.totalLowSubjects += 1;
    existing.worstPercentage = Math.min(existing.worstPercentage, Number(record.percentage || 0));
    grouped.set(key, existing);
  }

  return Array.from(grouped.values()).sort((left, right) => left.worstPercentage - right.worstPercentage);
};

const buildLowAttendanceAggregation = ({ threshold, departmentId }) => {
  const matchStage = {};
  if (departmentId) {
    matchStage.departmentId = toObjectId(departmentId, "departmentId", { required: false });
  }

  return [
    { $match: matchStage },
    {
      $group: {
        _id: {
          studentId: "$studentId",
          subjectId: "$subjectId",
        },
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status", "P"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "L"] }, 1, 0] } },
      },
    },
    {
      $project: {
        studentId: "$_id.studentId",
        subjectId: "$_id.subjectId",
        total: 1,
        present: 1,
        late: 1,
        absent: { $subtract: ["$total", { $add: ["$present", "$late"] }] },
        percentage: {
          $round: [
            {
              $multiply: [
                {
                  $divide: [
                    { $add: ["$present", { $multiply: ["$late", 0.5] }] },
                    "$total",
                  ],
                },
                100,
              ],
            },
            2,
          ],
        },
      },
    },
    { $match: { percentage: { $lt: threshold } } },
    {
      $lookup: {
        from: "students",
        localField: "studentId",
        foreignField: "_id",
        as: "student",
      },
    },
    { $unwind: "$student" },
    {
      $lookup: {
        from: "subjects",
        localField: "subjectId",
        foreignField: "_id",
        as: "subject",
      },
    },
    {
      $unwind: {
        path: "$subject",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 0,
        studentId: 1,
        subjectId: 1,
        percentage: 1,
        total: 1,
        present: 1,
        absent: 1,
        studentName: "$student.name",
        studentEmail: "$student.email",
        studentPhone: "$student.phone",
        rollNumber: "$student.rollNumber",
        subjectName: "$subject.name",
        subjectCode: "$subject.subjectCode",
      },
    },
    { $sort: { percentage: 1, rollNumber: 1 } },
  ];
};

const buildStudentReportData = async (studentId) => {
  const safeStudentId = toObjectId(studentId, "studentId");

  const student = await Student.findById(safeStudentId).populate({
    path: "departmentId",
    select: "name code",
  });

  if (!student) {
    throw new AppError(404, "Student not found");
  }

  const summary = await Attendance.getStudentSummary(safeStudentId);
  const recentAttendance = await Attendance.find({ studentId: safeStudentId })
    .populate({ path: "subjectId", select: "name subjectCode" })
    .sort({ date: -1, markedAt: -1 })
    .limit(30)
    .lean();

  const subjects = summary.map((item) => ({
    subjectName: item.subjectName || "Unknown",
    totalClasses: item.total,
    present: item.present,
    absent: item.absent,
    percentage: item.percentage,
  }));

  return {
    collegeName: process.env.COLLEGE_NAME || "Attendance Management System",
    student: {
      name: student.name,
      rollNumber: student.rollNumber,
      department: student.departmentId?.name || student.departmentId?.code || "-",
      semester: student.semester,
    },
    subjects,
    recentAttendance: recentAttendance.map((record) => ({
      date: record.date,
      subjectName: record.subjectId?.name || record.subjectId?.subjectCode || "Unknown",
      session: record.session,
      status: record.status,
    })),
    generatedAt: new Date(),
  };
};

const createStudentWorkbook = async (reportData) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Attendance Management System";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Student Attendance");
  worksheet.columns = [
    { header: "Subject", key: "subject", width: 30 },
    { header: "Total", key: "total", width: 10 },
    { header: "Present", key: "present", width: 10 },
    { header: "Absent", key: "absent", width: 10 },
    { header: "%", key: "percentage", width: 10 },
  ];

  worksheet.mergeCells("A1:E1");
  worksheet.getCell("A1").value = `${reportData.collegeName} - Student Attendance Report`;
  worksheet.getCell("A1").font = { bold: true, size: 14 };
  worksheet.getCell("A1").alignment = { horizontal: "center" };

  worksheet.mergeCells("A2:E2");
  worksheet.getCell("A2").value = `Student: ${reportData.student.name} | Roll No: ${reportData.student.rollNumber}`;
  worksheet.getCell("A2").alignment = { horizontal: "center" };

  worksheet.mergeCells("A3:E3");
  worksheet.getCell("A3").value = `Department: ${reportData.student.department} | Semester: ${reportData.student.semester}`;
  worksheet.getCell("A3").alignment = { horizontal: "center" };

  const headerRow = worksheet.getRow(5);
  headerRow.values = worksheet.columns.map((column) => column.header);
  headerRow.font = { bold: true };

  reportData.subjects.forEach((subject) => {
    worksheet.addRow({
      subject: subject.subjectName,
      total: subject.totalClasses,
      present: subject.present,
      absent: subject.absent,
      percentage: `${Number(subject.percentage || 0).toFixed(2)}%`,
    });
  });

  if (reportData.subjects.length === 0) {
    worksheet.addRow({
      subject: "No attendance data available",
      total: "-",
      present: "-",
      absent: "-",
      percentage: "-",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

const buildClassReportData = async ({ subjectId, fromDate, toDate, session, user }) => {
  const safeSubjectId = toObjectId(subjectId, "subjectId");

  const normalizedFromDate = normalizeDate(fromDate);
  const normalizedToDate = normalizeDate(toDate || fromDate);

  if (normalizedToDate < normalizedFromDate) {
    throw new AppError(400, "toDate must be after fromDate");
  }

  const subject = await Subject.findById(safeSubjectId).lean();
  if (!subject) {
    throw new AppError(404, "Subject not found");
  }

  if (["faculty", "time_table_coordinator"].includes(user?.role)) {
    const assigned = await Timetable.validateAssignment(user.profileId, safeSubjectId);
    if (!assigned) {
      throw new AppError(403, "You are not assigned to this subject");
    }
  }

  if (user?.role === "attendance_coordinator") {
    const coordinatorDepartmentId = await getFacultyDepartmentId(user.profileId);
    if (String(subject.departmentId) !== String(coordinatorDepartmentId)) {
      throw new AppError(403, "You can only access subjects in your department");
    }
  }

  const query = {
    subjectId: safeSubjectId,
    date: {
      $gte: normalizedFromDate,
      $lte: normalizedToDate,
    },
  };

  if (session) {
    query.session = session;
  }

  const records = await Attendance.find(query)
    .populate({ path: "studentId", select: "name rollNumber section" })
    .sort({ date: 1, "studentId.rollNumber": 1 })
    .lean();

  const dates = getDateRange(normalizedFromDate, normalizedToDate).map((date) => toDateKey(date));
  const studentsMap = new Map();
  const byDate = {};

  dates.forEach((date) => {
    byDate[date] = 0;
  });

  for (const record of records) {
    const dateKey = toDateKey(record.date);
    const studentKey = String(record.studentId?._id || record.studentId);
    const existing = studentsMap.get(studentKey) || {
      rollNumber: record.studentId?.rollNumber || "-",
      name: record.studentId?.name || "-",
      attendanceByDate: {},
      total: 0,
      present: 0,
      late: 0,
      absent: 0,
      percentage: 0,
    };

    existing.attendanceByDate[dateKey] = record.status;
    existing.total += 1;
    if (record.status === "P") existing.present += 1;
    if (record.status === "L") existing.late += 1;
    if (record.status === "A") existing.absent += 1;

    if (record.status === "P") {
      byDate[dateKey] += 1;
    }

    studentsMap.set(studentKey, existing);
  }

  const students = Array.from(studentsMap.values())
    .map((student) => {
      const weighted = student.present + student.late * 0.5;
      return {
        ...student,
        percentage: student.total > 0 ? (weighted / student.total) * 100 : 0,
      };
    })
    .sort((left, right) => String(left.rollNumber).localeCompare(String(right.rollNumber)));

  const summary = {
    overallPercentage:
      students.length > 0
        ? students.reduce((sum, student) => sum + student.percentage, 0) / students.length
        : 0,
    byDate,
  };

  const facultyName = ["faculty", "time_table_coordinator"].includes(user?.role)
    ? (await Faculty.findById(user.profileId).select("name").lean())?.name || user.email
    : user?.name || user?.email || "Administrator";

  return {
    collegeName: process.env.COLLEGE_NAME || "Attendance Management System",
    subjectName: subject.name,
    facultyName,
    students,
    dates,
    summary,
    generatedAt: new Date(),
  };
};

const createClassWorkbook = async (classData) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Attendance Management System";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Class Attendance");
  const dynamicColumns = classData.dates.map((date) => ({
    header: date.slice(5),
    key: date,
    width: 12,
  }));

  worksheet.columns = [
    { header: "Roll Number", key: "rollNumber", width: 18 },
    { header: "Student Name", key: "name", width: 28 },
    ...dynamicColumns,
    { header: "%", key: "percentage", width: 10 },
  ];

  const lastColumn = getExcelColumnName(worksheet.columns.length);

  worksheet.mergeCells(`A1:${lastColumn}1`);
  worksheet.getCell("A1").value = `${classData.collegeName} - Class Attendance Report`;
  worksheet.getCell("A1").font = { bold: true, size: 14 };
  worksheet.getCell("A1").alignment = { horizontal: "center" };

  worksheet.mergeCells(`A2:${lastColumn}2`);
  worksheet.getCell("A2").value = `Subject: ${classData.subjectName} | Faculty: ${classData.facultyName}`;
  worksheet.getCell("A2").alignment = { horizontal: "center" };

  worksheet.mergeCells(`A3:${lastColumn}3`);
  worksheet.getCell("A3").value = `Dates: ${classData.dates[0]} to ${classData.dates[classData.dates.length - 1]}`;
  worksheet.getCell("A3").alignment = { horizontal: "center" };

  const headerRow = worksheet.getRow(5);
  headerRow.values = worksheet.columns.map((column) => column.header);
  headerRow.font = { bold: true };

  classData.students.forEach((student) => {
    const row = {
      rollNumber: student.rollNumber,
      name: student.name,
      percentage: `${Number(student.percentage || 0).toFixed(2)}%`,
    };

    classData.dates.forEach((date) => {
      row[date] = student.attendanceByDate[date] || "-";
    });

    worksheet.addRow(row);
  });

  if (classData.students.length === 0) {
    worksheet.addRow({
      rollNumber: "-",
      name: "No students found",
      percentage: "-",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

const createDepartmentWorkbook = async (departmentData) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Attendance Management System";
  workbook.created = new Date();

  const overviewSheet = workbook.addWorksheet("Department Overview");
  overviewSheet.columns = [
    { header: "Metric", key: "metric", width: 36 },
    { header: "Value", key: "value", width: 22 },
  ];
  overviewSheet.addRow({ metric: "College", value: departmentData.collegeName });
  overviewSheet.addRow({ metric: "Department", value: departmentData.departmentName });
  overviewSheet.addRow({ metric: "Threshold (%)", value: departmentData.threshold });
  overviewSheet.addRow({ metric: "Generated At (UTC)", value: new Date(departmentData.generatedAt).toISOString() });
  overviewSheet.addRow({ metric: "Total Attendance Records", value: departmentData.overview?.totalRecords || 0 });
  overviewSheet.addRow({ metric: "Total Students", value: departmentData.overview?.totalStudents || 0 });
  overviewSheet.addRow({ metric: "Total Subjects", value: departmentData.overview?.totalSubjects || 0 });
  overviewSheet.addRow({ metric: "Average Attendance (%)", value: departmentData.overview?.averageAttendance || 0 });

  const subjectSheet = workbook.addWorksheet("Subject Overview");
  subjectSheet.columns = [
    { header: "Subject", key: "subjectName", width: 28 },
    { header: "Code", key: "subjectCode", width: 14 },
    { header: "Total Students", key: "totalStudents", width: 16 },
    { header: "Average Attendance (%)", key: "avgAttendance", width: 22 },
    { header: `Below ${departmentData.threshold}%`, key: "belowThreshold", width: 18 },
  ];

  (departmentData.overview?.subjectOverview || []).forEach((row) => {
    subjectSheet.addRow({
      subjectName: row.subjectName || "Unknown",
      subjectCode: row.subjectCode || "-",
      totalStudents: row.totalStudents || 0,
      avgAttendance: row.avgAttendance || 0,
      belowThreshold: row.belowThreshold || 0,
    });
  });

  const belowSheet = workbook.addWorksheet("Students Below Threshold");
  belowSheet.columns = [
    { header: "Roll Number", key: "rollNumber", width: 18 },
    { header: "Student Name", key: "studentName", width: 28 },
    { header: "Email", key: "studentEmail", width: 28 },
    { header: "Phone", key: "studentPhone", width: 16 },
    { header: "Lowest Attendance (%)", key: "worstPercentage", width: 22 },
    { header: "Low Subjects", key: "totalLowSubjects", width: 14 },
  ];

  (departmentData.lowAttendanceStudents || []).forEach((student) => {
    belowSheet.addRow({
      rollNumber: student.rollNumber || "-",
      studentName: student.studentName || "-",
      studentEmail: student.studentEmail || "-",
      studentPhone: student.studentPhone || "-",
      worstPercentage: Number(student.worstPercentage || 0).toFixed(2),
      totalLowSubjects: student.totalLowSubjects || 0,
    });
  });

  const aboveSheet = workbook.addWorksheet(`Students ${departmentData.threshold}%+`);
  aboveSheet.columns = [
    { header: "Roll Number", key: "rollNumber", width: 18 },
    { header: "Student Name", key: "studentName", width: 28 },
    { header: "Email", key: "studentEmail", width: 28 },
    { header: "Phone", key: "studentPhone", width: 16 },
    { header: "Average Attendance (%)", key: "averagePercentage", width: 24 },
  ];

  const departmentObjectId = toObjectId(departmentData.departmentId, "departmentId");
  const studentAverages = await Attendance.aggregate([
    { $match: { departmentId: departmentObjectId } },
    {
      $group: {
        _id: "$studentId",
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status", "P"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "L"] }, 1, 0] } },
      },
    },
    {
      $project: {
        studentId: "$_id",
        averagePercentage: {
          $round: [
            {
              $multiply: [
                {
                  $divide: [
                    { $add: ["$present", { $multiply: ["$late", 0.5] }] },
                    "$total",
                  ],
                },
                100,
              ],
            },
            2,
          ],
        },
      },
    },
    { $match: { averagePercentage: { $gte: Number(departmentData.threshold || 75) } } },
    {
      $lookup: {
        from: "students",
        localField: "studentId",
        foreignField: "_id",
        as: "student",
      },
    },
    { $unwind: "$student" },
    {
      $project: {
        rollNumber: "$student.rollNumber",
        studentName: "$student.name",
        studentEmail: "$student.email",
        studentPhone: "$student.phone",
        averagePercentage: 1,
      },
    },
    { $sort: { rollNumber: 1 } },
  ]);

  if (!studentAverages.length) {
    aboveSheet.addRow({
      rollNumber: "-",
      studentName: "No students meet current filter",
      studentEmail: "-",
      studentPhone: "-",
      averagePercentage: "-",
    });
  } else {
    studentAverages.forEach((row) => {
      aboveSheet.addRow({
        rollNumber: row.rollNumber || "-",
        studentName: row.studentName || "-",
        studentEmail: row.studentEmail || "-",
        studentPhone: row.studentPhone || "-",
        averagePercentage: Number(row.averagePercentage || 0).toFixed(2),
      });
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

const buildDepartmentOverview = async ({ departmentId, threshold }) => {
  const safeDepartmentId = toObjectId(departmentId, "departmentId");

  return Attendance.aggregate([
    {
      $match: {
        departmentId: safeDepartmentId,
      },
    },
    {
      $group: {
        _id: {
          subjectId: "$subjectId",
          studentId: "$studentId",
        },
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status", "P"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "L"] }, 1, 0] } },
      },
    },
    {
      $project: {
        subjectId: "$_id.subjectId",
        studentId: "$_id.studentId",
        total: 1,
        present: 1,
        late: 1,
        percentage: {
          $round: [
            {
              $multiply: [
                {
                  $divide: [
                    { $add: ["$present", { $multiply: ["$late", 0.5] }] },
                    "$total",
                  ],
                },
                100,
              ],
            },
            2,
          ],
        },
      },
    },
    {
      $group: {
        _id: "$subjectId",
        avgAttendance: { $avg: "$percentage" },
        belowThreshold: {
          $sum: {
            $cond: [{ $lt: ["$percentage", threshold] }, 1, 0],
          },
        },
        totalStudents: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "subjects",
        localField: "_id",
        foreignField: "_id",
        as: "subject",
      },
    },
    {
      $unwind: {
        path: "$subject",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 0,
        subjectName: "$subject.name",
        subjectCode: "$subject.subjectCode",
        totalStudents: 1,
        avgAttendance: 1,
        belowThreshold: 1,
      },
    },
    {
      $sort: {
        subjectName: 1,
      },
    },
  ]);
};

const buildDepartmentReportData = async ({ departmentId, threshold }) => {
  const safeDepartmentId = toObjectId(departmentId, "departmentId");

  const department = await Department.findById(safeDepartmentId).lean();
  if (!department) {
    throw new AppError(404, "Department not found");
  }

  const lowRecords = await Attendance.aggregate(buildLowAttendanceAggregation({ threshold, departmentId: safeDepartmentId }));
  const lowAttendanceStudents = groupLowAttendanceByStudent(lowRecords);
  const overview = await buildDepartmentOverview({ departmentId: safeDepartmentId, threshold });

  return {
    collegeName: process.env.COLLEGE_NAME || "Attendance Management System",
    departmentId: department._id,
    departmentName: department.name,
    threshold,
    overview,
    lowAttendanceStudents,
    generatedAt: new Date(),
  };
};

const buildDashboardStats = async ({ departmentId } = {}) => {
  const endDate = new Date();
  endDate.setUTCHours(23, 59, 59, 999);

  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 29);
  startDate.setUTCHours(0, 0, 0, 0);

  const query = {
    date: {
      $gte: startDate,
      $lte: endDate,
    },
  };

  if (departmentId) {
    query.departmentId = toObjectId(departmentId, "departmentId", { required: false });
  }

  const records = await Attendance.find(query).lean();
  const dateKeys = getDateRange(startDate, endDate).map((date) => toDateKey(date));

  const trendMap = new Map(
    dateKeys.map((date) => [date, { date, present: 0, late: 0, absent: 0, total: 0 }])
  );
  const subjectMap = new Map();
  const studentMap = new Map();
  const subjectIds = new Set();

  for (const record of records) {
    const dateKey = toDateKey(record.date);
    const trend = trendMap.get(dateKey);
    if (trend) {
      trend.total += 1;
      if (record.status === "P") trend.present += 1;
      if (record.status === "L") trend.late += 1;
      if (record.status === "A") trend.absent += 1;
    }

    const subjectKey = String(record.subjectId);
    const subject = subjectMap.get(subjectKey) || {
      subjectId: record.subjectId,
      total: 0,
      present: 0,
      late: 0,
      absent: 0,
    };
    subject.total += 1;
    if (record.status === "P") subject.present += 1;
    if (record.status === "L") subject.late += 1;
    if (record.status === "A") subject.absent += 1;
    subjectMap.set(subjectKey, subject);
    subjectIds.add(subjectKey);

    const studentKey = String(record.studentId);
    const student = studentMap.get(studentKey) || {
      total: 0,
      present: 0,
      late: 0,
    };
    student.total += 1;
    if (record.status === "P") student.present += 1;
    if (record.status === "L") student.late += 1;
    studentMap.set(studentKey, student);
  }

  const subjects = await Subject.find({ _id: { $in: Array.from(subjectIds).map((id) => toObjectId(id)) } }).lean();
  const subjectNameMap = new Map(subjects.map((subject) => [String(subject._id), subject]));

  const attendanceTrend = dateKeys.map((date) => {
    const item = trendMap.get(date);
    const percentage = item.total > 0
      ? ((item.present + item.late * 0.5) / item.total) * 100
      : 0;

    return {
      date,
      present: item.present,
      late: item.late,
      absent: item.absent,
      percentage: Number(percentage.toFixed(2)),
    };
  });

  const subjectRanking = Array.from(subjectMap.values())
    .map((subject) => {
      const subjectInfo = subjectNameMap.get(String(subject.subjectId)) || {};
      const percentage = subject.total > 0
        ? ((subject.present + subject.late * 0.5) / subject.total) * 100
        : 0;

      return {
        subjectId: subject.subjectId,
        subjectName: subjectInfo.name || "Unknown",
        subjectCode: subjectInfo.subjectCode || "-",
        total: subject.total,
        percentage: Number(percentage.toFixed(2)),
      };
    })
    .sort((left, right) => right.percentage - left.percentage);

  const studentPercentages = Array.from(studentMap.values()).map((student) => {
    const weighted = student.present + student.late * 0.5;
    return student.total > 0 ? (weighted / student.total) * 100 : 0;
  });

  const overallPercentage = studentPercentages.length
    ? studentPercentages.reduce((sum, value) => sum + value, 0) / studentPercentages.length
    : 0;

  const overview = {
    totalRecords: records.length,
    totalStudents: studentMap.size,
    totalSubjects: subjectMap.size,
    averageAttendance: Number(overallPercentage.toFixed(2)),
  };

  return {
    overview,
    attendanceTrend,
    subjectRanking,
  };
};

const getStudentAccessOrThrow = (req, studentId) => {
  if (req.user.role === "student" && String(req.user.profileId) !== String(studentId)) {
    throw new AppError(403, "You can only access your own data");
  }
};

const sendPdfBuffer = (res, filename, buffer) => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  return res.send(buffer);
};

const sendXlsxBuffer = (res, filename, buffer) => {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  return res.send(buffer);
};

const downloadStudentPDF = catchAsync(async (req, res) => {
  const studentId = req.params.studentId || req.query.studentId;
  if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
    throw new AppError(400, "Valid studentId is required");
  }

  getStudentAccessOrThrow(req, studentId);

  const cacheKey = `reports:student:pdf:${studentId}`;
  const cachedBuffer = await reportDataService.getCachedReportData(cacheKey);
  if (Buffer.isBuffer(cachedBuffer)) {
    return sendPdfBuffer(res, `student-report-${studentId}.pdf`, cachedBuffer);
  }

  const reportData = await buildStudentReportData(studentId);
  const pdfBuffer = await pdfService.generateStudentReport(reportData);

  await reportDataService.setCachedReportData(cacheKey, pdfBuffer, REPORT_CACHE_TTL_SECONDS);
  return sendPdfBuffer(res, `student-report-${reportData.student.rollNumber}.pdf`, pdfBuffer);
});

const downloadStudentExcel = catchAsync(async (req, res) => {
  const studentId = req.params.studentId || req.query.studentId;
  if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
    throw new AppError(400, "Valid studentId is required");
  }

  getStudentAccessOrThrow(req, studentId);

  const reportData = await buildStudentReportData(studentId);
  const buffer = await createStudentWorkbook(reportData);
  return sendXlsxBuffer(res, `student-report-${reportData.student.rollNumber}.xlsx`, buffer);
});

const downloadClassPDF = catchAsync(async (req, res) => {
  const { subjectId, fromDate, toDate, session } = req.query;
  if (!subjectId || !fromDate || !toDate) {
    throw new AppError(400, "subjectId, fromDate, and toDate are required");
  }

  const classData = await buildClassReportData({
    subjectId,
    fromDate,
    toDate,
    session,
    user: req.user,
  });

  const pdfBuffer = await pdfService.generateClassReport(classData);
  return sendPdfBuffer(res, `class-attendance-${classData.subjectName}.pdf`, pdfBuffer);
});

const downloadClassExcel = catchAsync(async (req, res) => {
  const { subjectId, session } = req.query;
  const fallbackDate = new Date().toISOString().slice(0, 10);
  const fromDate = req.query.fromDate || req.query.date || fallbackDate;
  const toDate = req.query.toDate || fromDate;

  if (!subjectId) {
    throw new AppError(400, "subjectId is required");
  }

  const classData = await buildClassReportData({
    subjectId,
    fromDate,
    toDate,
    session,
    user: req.user,
  });

  const buffer = await createClassWorkbook(classData);
  return sendXlsxBuffer(res, `class-attendance-${classData.subjectName}.xlsx`, buffer);
});
const downloadDepartmentPDF = catchAsync(async (req, res) => {
  const isAttendanceCoordinator = req.user?.role === "attendance_coordinator";
  const departmentId = isAttendanceCoordinator
    ? await getFacultyDepartmentId(req.user.profileId)
    : req.query.departmentId;
  if (!departmentId) {
    throw new AppError(400, "Valid departmentId is required");
  }

  const deptData = await buildDepartmentReportData({
    departmentId,
    threshold: Number(req.query.threshold || getThreshold()),
  });

  const pdfBuffer = await pdfService.generateDepartmentReport(deptData);
  return sendPdfBuffer(res, `department-attendance-${deptData.departmentName}.pdf`, pdfBuffer);
});

const downloadDepartmentExcel = catchAsync(async (req, res) => {
  const isAttendanceCoordinator = req.user?.role === "attendance_coordinator";
  const departmentId = isAttendanceCoordinator
    ? await getFacultyDepartmentId(req.user.profileId)
    : req.query.departmentId;

  if (!departmentId) {
    throw new AppError(400, "Valid departmentId is required");
  }

  const deptData = await buildDepartmentReportData({
    departmentId,
    threshold: Number(req.query.threshold || getThreshold()),
  });

  const workbookBuffer = await createDepartmentWorkbook({
    ...deptData,
    departmentId,
  });
  return sendXlsxBuffer(res, `department-attendance-${deptData.departmentName}.xlsx`, workbookBuffer);
});

const triggerAlerts = catchAsync(async (req, res) => {
  if (!req.user || req.user.role !== "admin") {
    throw new AppError(403, "Only admin can trigger attendance alerts");
  }

  const threshold = Number(req.body?.threshold || req.query?.threshold || getThreshold());
  const departmentId = req.body?.departmentId || req.query?.departmentId;
  const channels = Array.isArray(req.body?.channels) ? req.body.channels : [];

  const lowRecords = await Attendance.aggregate(buildLowAttendanceAggregation({ threshold, departmentId }));
  const lowStudents = groupLowAttendanceByStudent(lowRecords);

  let emailsSent = 0;
  let emailsFailed = 0;
  let smsSent = 0;
  let smsSkipped = 0;

  for (const student of lowStudents) {
    const subject = student.subjects[0] || {};
    const alertResult = await emailService.sendLowAttendanceAlert(
      student.studentEmail,
      student.studentName,
      subject.subjectName || subject.subjectCode || "Subject",
      student.worstPercentage === Number.POSITIVE_INFINITY ? threshold : student.worstPercentage
    );

    if (alertResult?.success) {
      emailsSent += 1;
    } else {
      emailsFailed += 1;
    }

    if (channels.includes("sms")) {
      if (typeof smsService.isConfigured === "function" && !smsService.isConfigured()) {
        smsSkipped += 1;
        continue;
      }

      if (!student.studentPhone) {
        smsSkipped += 1;
        continue;
      }

      const smsResult = await smsService.sendLowAttendanceSMS(
        student.studentPhone,
        student.studentName,
        subject.subjectName || subject.subjectCode || "Subject",
        student.worstPercentage === Number.POSITIVE_INFINITY ? threshold : student.worstPercentage
      );

      if (smsResult?.success) {
        smsSent += 1;
      } else {
        smsSkipped += 1;
      }
    }
  }

  return sendSuccess(res, 200, "Alerts triggered", {
    results: {
      emailsSent,
      emailsFailed,
      studentsAlerted: lowStudents.length,
    },
    smsSent,
    smsSkipped,
    channels,
  });
});

const getDashboardStats = catchAsync(async (req, res) => {
  const departmentId = req.query.departmentId || req.user?.departmentId || null;
  const cacheKey = `reports:dashboard:stats:${departmentId || "all"}`;

  const cachedStats = await reportDataService.getCachedReportData(cacheKey);
  if (cachedStats) {
    return sendSuccess(res, 200, "Dashboard attendance stats", cachedStats);
  }

  const stats = await buildDashboardStats({ departmentId });
  await reportDataService.setCachedReportData(cacheKey, stats, REPORT_CACHE_TTL_SECONDS);

  return sendSuccess(res, 200, "Dashboard attendance stats", stats);
});

module.exports = {
  downloadStudentPDF,
  downloadStudentExcel,
  downloadClassPDF,
  downloadClassExcel,
  downloadDepartmentPDF,
  downloadDepartmentExcel,
  triggerAlerts,
  getDashboardStats,
  buildStudentReportData,
  buildClassReportData,
  buildDepartmentReportData,
  buildDashboardStats,
};
