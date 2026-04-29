const mongoose = require("mongoose");

const { Attendance, Student, Notice, Timetable, LeaveRequest, User, Department, Faculty } = require("../models");
const { catchAsync, AppError } = require("../utils/AppError");
const { sendSuccess, sendPaginated } = require("../utils/responseHelper");
const smsAlertService = require("../services/smsAlertService");
const { createDepartmentNotification } = require("../services/departmentNotificationService");
const dateHelper = require("../utils/dateHelper");
const attendanceCalc = require("../utils/attendanceCalc");

let monthlyReportService;
let semesterReportService;
let monthlyPdfService;
let monthlyExcelService;
let semesterReportPdfService;
let semesterReportExcelService;
let reportDataService;
let smsService;

try {
  monthlyReportService = require("../services/monthlyReportService");
} catch {
  monthlyReportService = null;
}

try {
  semesterReportService = require("../services/semesterReportService");
} catch {
  semesterReportService = null;
}

try {
  monthlyPdfService = require("../services/monthlyPdfService");
} catch {
  monthlyPdfService = null;
}

try {
  monthlyExcelService = require("../services/monthlyExcelService");
} catch {
  monthlyExcelService = null;
}

try {
  semesterReportPdfService = require("../services/semesterReportPdfService");
} catch {
  semesterReportPdfService = null;
}

try {
  semesterReportExcelService = require("../services/semesterReportExcelService");
} catch {
  semesterReportExcelService = null;
}

try {
  reportDataService = require("../utils/reportDataService");
} catch {
  reportDataService = null;
}

try {
  smsService = require("../services/smsService");
} catch {
  smsService = null;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ROLL_REGEX = /^\d{2}[A-Z]{2}\d{1}[A-Z]\d{4}$/;

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const streamBuffer = (res, buffer, filename, mimeType) => {
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  return res.send(buffer);
};

const getCtAssignment = async (profileId, academicYear) => {
  const rows = await Timetable.find({
    classTeacherId: profileId,
    isActive: true,
    ...(academicYear ? { academicYear } : {}),
  })
    .select("departmentId semester section academicYear")
    .lean();

  if (rows.length) {
    const latestYear = academicYear || [...new Set(rows.map((row) => row.academicYear).filter(Boolean))].sort().at(-1);
    const resolved = rows.find((row) => row.academicYear === latestYear) || rows[0];

    return {
      departmentId: resolved.departmentId,
      semester: resolved.semester,
      section: resolved.section,
      academicYear: resolved.academicYear,
    };
  }

  const facultyProfile = await Faculty.findById(profileId)
    .select("departmentId classTeacherAssignment isActive")
    .lean();

  if (!facultyProfile || facultyProfile.isActive === false) {
    throw new AppError(403, "You are not assigned as class teacher for any class");
  }

  const fallback = facultyProfile.classTeacherAssignment;
  if (!fallback?.semester || !fallback?.section) {
    throw new AppError(403, "You are not assigned as class teacher for any class");
  }

  if (academicYear && fallback.academicYear && String(fallback.academicYear) !== String(academicYear)) {
    throw new AppError(403, "You are not assigned as class teacher for the selected academic year");
  }

  return {
    departmentId: fallback.departmentId || facultyProfile.departmentId,
    semester: Number(fallback.semester),
    section: String(fallback.section).toUpperCase(),
    academicYear: String(academicYear || fallback.academicYear || ""),
  };
};

const getDailyClassAttendance = catchAsync(async (req, res) => {
  const ctProfileId = req.user.profileId;
  const normalizedDate = dateHelper.toMidnightUTC(req.query.date || new Date());
  const assignment = await getCtAssignment(ctProfileId, req.query.academicYear);

  const dayName = DAY_NAMES[new Date(normalizedDate).getUTCDay()];
  const department = await Department.findById(assignment.departmentId).select("code name").lean();
  const deptLabel = department?.code || department?.name || "DEPT";
  const className = `${deptLabel} Sem${assignment.semester} Section ${assignment.section}`;

  const [students, timetableRows] = await Promise.all([
    Student.find({
      departmentId: assignment.departmentId,
      semester: assignment.semester,
      section: String(assignment.section).toUpperCase(),
      isActive: true,
    })
      .select("_id name rollNumber guardianPhone")
      .sort({ rollNumber: 1 })
      .lean(),
    Timetable.find({
      departmentId: assignment.departmentId,
      semester: assignment.semester,
      section: String(assignment.section).toUpperCase(),
      academicYear: assignment.academicYear,
      isActive: true,
    })
      .populate({ path: "subjectId", select: "name subjectCode" })
      .lean(),
  ]);

  const dayPeriods = timetableRows
    .flatMap((row) =>
      (row.schedule || [])
        .filter((slot) => slot.day === dayName)
        .map((slot) => ({
          periodNumber: slot.periodNumber,
          subjectId: String(row.subjectId?._id || row.subjectId),
          subjectName: row.subjectId?.name || "Subject",
          subjectCode: row.subjectId?.subjectCode || "-",
          roomNo: slot.roomNo || "-",
        }))
    )
    .sort((a, b) => a.periodNumber - b.periodNumber);

  const studentIds = students.map((student) => student._id);

  const attendanceRows = await Attendance.find({
    studentId: { $in: studentIds },
    date: normalizedDate,
    periodNumber: { $in: dayPeriods.map((item) => item.periodNumber) },
  })
    .select("studentId periodNumber subjectId status smsAlertSent")
    .lean();

  const attendanceMap = new Map(
    attendanceRows.map((row) => [
      `${String(row.studentId)}-${Number(row.periodNumber)}-${String(row.subjectId)}`,
      row,
    ])
  );

  const periodSummary = dayPeriods.map((period) => {
    let present = 0;
    let absent = 0;
    let late = 0;

    for (const student of students) {
      const key = `${String(student._id)}-${Number(period.periodNumber)}-${String(period.subjectId)}`;
      const entry = attendanceMap.get(key);
      if (!entry) continue;
      if (entry.status === "P") present += 1;
      else if (entry.status === "L") late += 1;
      else if (entry.status === "A") absent += 1;
    }

    return {
      periodNumber: period.periodNumber,
      subject: `${period.subjectName} (${period.subjectCode})`,
      present,
      absent,
      late,
    };
  });

  const studentSummary = students.map((student) => {
    const periods = dayPeriods.map((period) => {
      const key = `${String(student._id)}-${Number(period.periodNumber)}-${String(period.subjectId)}`;
      const entry = attendanceMap.get(key);
      return {
        periodNumber: period.periodNumber,
        status: entry?.status || "not_marked_yet",
      };
    });

    const hasPresent = periods.some((item) => item.status === "P" || item.status === "L");
    const hasAbsent = periods.some((item) => item.status === "A");

    let overallToday = "Partial";
    if (periods.length > 0 && periods.every((item) => item.status === "P" || item.status === "L")) {
      overallToday = "P";
    } else if (periods.length > 0 && periods.every((item) => item.status === "A")) {
      overallToday = "A";
    } else if (!hasPresent && hasAbsent) {
      overallToday = "A";
    }

    return {
      rollNumber: student.rollNumber,
      name: student.name,
      periods,
      overallToday,
    };
  });

  const absentStudents = students
    .map((student) => {
      const studentAttendance = attendanceRows.filter((row) => String(row.studentId) === String(student._id));
      const anyPresent = studentAttendance.some((row) => row.status === "P" || row.status === "L");
      const anyAbsent = studentAttendance.some((row) => row.status === "A");
      const allAbsent = anyAbsent && !anyPresent;

      if (!allAbsent) return null;

      return {
        name: student.name,
        rollNumber: student.rollNumber,
        guardianPhone: student.guardianPhone || null,
        smsAlertSent: studentAttendance.some((row) => row.smsAlertSent === true),
      };
    })
    .filter(Boolean);

  return sendSuccess(res, 200, "Daily class attendance fetched", {
    date: normalizedDate,
    className,
    periodSummary,
    studentSummary,
    absentStudents,
  });
});

const getAssignedClassTimetables = catchAsync(async (req, res) => {
  const ctProfileId = req.user.profileId;
  const requestedAcademicYear = String(req.query.academicYear || "").trim();

  const availableRows = await Timetable.find({
    classTeacherId: ctProfileId,
    isActive: true,
  })
    .populate({ path: "departmentId", select: "name code" })
    .select("departmentId semester section academicYear")
    .lean();

  if (!availableRows.length) {
    throw new AppError(404, "No class timetable assignments found for this class teacher");
  }

  const availableAcademicYears = [...new Set(availableRows.map((row) => row.academicYear).filter(Boolean))]
    .map((year) => String(year).trim())
    .sort();

  const academicYear = requestedAcademicYear || availableAcademicYears[availableAcademicYears.length - 1];

  const scopedRows = availableRows.filter(
    (row) => String(row.academicYear || "").trim() === String(academicYear)
  );

  if (!scopedRows.length) {
    throw new AppError(404, "No class timetable assignments found for the selected academic year");
  }

  const classKeys = new Map();
  for (const row of scopedRows) {
    const departmentId = row.departmentId?._id || row.departmentId;
    const key = [
      String(departmentId || ""),
      String(row.semester || ""),
      String(row.section || "").toUpperCase(),
    ].join("|");

    if (!classKeys.has(key)) {
      classKeys.set(key, {
        departmentId,
        departmentName: row.departmentId?.name || null,
        departmentCode: row.departmentId?.code || null,
        semester: Number(row.semester),
        section: String(row.section || "").toUpperCase(),
      });
    }
  }

  const classes = await Promise.all(
    [...classKeys.values()].map(async (assignedClass) => {
      const timetable = await Timetable.getClassTimetable(
        assignedClass.departmentId,
        assignedClass.semester,
        assignedClass.section,
        academicYear
      );

      return {
        ...assignedClass,
        totalSlots: Array.isArray(timetable?.schedule) ? timetable.schedule.length : 0,
        schedule: timetable?.schedule || [],
      };
    })
  );

  classes.sort((left, right) => {
    const leftCode = String(left.departmentCode || left.departmentName || "");
    const rightCode = String(right.departmentCode || right.departmentName || "");
    if (leftCode !== rightCode) {
      return leftCode.localeCompare(rightCode);
    }

    if (Number(left.semester) !== Number(right.semester)) {
      return Number(left.semester) - Number(right.semester);
    }

    return String(left.section || "").localeCompare(String(right.section || ""));
  });

  return sendSuccess(res, 200, "Assigned class timetables fetched", {
    academicYear,
    availableAcademicYears,
    classes,
  });
});

const triggerAbsentSMS = catchAsync(async (req, res) => {
  const ctProfileId = req.user.profileId;
  const { studentIds, date, message } = req.body;
  void message;

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    throw new AppError(400, "studentIds are required");
  }

  const normalizedDate = dateHelper.toMidnightUTC(date || new Date());
  const assignment = await getCtAssignment(ctProfileId, req.body.academicYear);

  const students = await Student.find({
    _id: { $in: studentIds },
    departmentId: assignment.departmentId,
    semester: assignment.semester,
    section: String(assignment.section).toUpperCase(),
    isActive: true,
  })
    .select("_id")
    .lean();

  if (students.length !== studentIds.length) {
    throw new AppError(403, "One or more students are outside your assigned class");
  }

  const attendanceRows = await Attendance.find({
    studentId: { $in: students.map((s) => s._id) },
    date: normalizedDate,
    status: "A",
  })
    .select("_id studentId subjectId date periodNumber status smsAlertSent")
    .lean();

  let sent = 0;
  let failed = 0;

  const firstAbsentByStudent = new Map();
  for (const row of attendanceRows) {
    const key = String(row.studentId);
    if (!firstAbsentByStudent.has(key)) {
      firstAbsentByStudent.set(key, row);
    }
  }

  for (const row of firstAbsentByStudent.values()) {
    const result = await smsAlertService.sendAbsentAlert(row);
    if (result?.sent) sent += 1;
    else if (result?.failed) failed += 1;
  }

  return sendSuccess(res, 200, "Absent SMS trigger completed", { sent, failed });
});

const addStudent = catchAsync(async (req, res) => {
  const ctProfileId = req.user.profileId;
  const assignment = await getCtAssignment(ctProfileId, req.body.academicYear);

  const {
    name,
    rollNumber,
    email,
    phone,
    guardianPhone,
    guardianName,
    guardianRelation,
    semester,
    section,
    batch,
    dob,
  } = req.body;

  void guardianName;
  void guardianRelation;
  void dob;

  if (!ROLL_REGEX.test(String(rollNumber || "").toUpperCase())) {
    throw new AppError(400, "Invalid roll number format");
  }

  if (Number(semester) !== Number(assignment.semester) || String(section || "").toUpperCase() !== String(assignment.section).toUpperCase()) {
    throw new AppError(400, "Student must belong to your assigned class");
  }

  const existing = await Student.findOne({
    departmentId: assignment.departmentId,
    rollNumber: String(rollNumber).toUpperCase(),
  })
    .select("_id")
    .lean();

  if (existing) {
    throw new AppError(409, "Student with this roll number already exists in department");
  }

  const existingUser = await User.findOne({ email: String(email || "").trim().toLowerCase() })
    .select("_id")
    .lean();

  if (existingUser) {
    throw new AppError(409, "User with this email already exists");
  }

  const student = await Student.create({
    name,
    rollNumber,
    email,
    phone,
    guardianPhone,
    semester: assignment.semester,
    section: String(assignment.section).toUpperCase(),
    batch,
    departmentId: assignment.departmentId,
  });

  const temporaryPassword = `${String(rollNumber).slice(-4)}@123`;

  await User.create({
    email: student.email,
    password: temporaryPassword,
    role: "student",
    profileId: student._id,
    profileModel: "Student",
    isActive: true,
  });

  const toPhone = smsAlertService.formatPhone(student.phone);
  if (toPhone && smsService?.sendSMS) {
    await smsService.sendSMS({
      phone: toPhone,
      message: `Welcome ${student.name}. Login email: ${student.email}, temp password: ${temporaryPassword}. Please change password after login.`,
    });
  }

  await createDepartmentNotification({
    title: "Student Records Updated",
    message: "Student records updated by Class Teacher.",
    sentBy: req.user._id,
    departmentId: assignment.departmentId,
    semester: assignment.semester,
    section: assignment.section,
    recipientRoles: ["admin", "hod"],
  });

  return sendSuccess(res, 201, "Student added", { student, temporaryPassword });
});

const updateStudent = catchAsync(async (req, res) => {
  const ctProfileId = req.user.profileId;
  const { studentId } = req.params;
  const assignment = await getCtAssignment(ctProfileId, req.body.academicYear);

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new AppError(400, "Invalid studentId");
  }

  const student = await Student.findOne({
    _id: studentId,
    departmentId: assignment.departmentId,
    semester: assignment.semester,
    section: String(assignment.section).toUpperCase(),
  });

  if (!student) {
    throw new AppError(404, "Student not found in your assigned class");
  }

  const disallowed = ["rollNumber", "semester", "departmentId"];
  for (const key of disallowed) {
    if (req.body[key] !== undefined) {
      throw new AppError(400, `${key} cannot be updated by class teacher`);
    }
  }

  const allowedUpdates = ["phone", "guardianPhone", "guardianName", "guardianRelation", "section"];

  for (const key of allowedUpdates) {
    if (req.body[key] !== undefined && student.schema.path(key)) {
      student[key] = req.body[key];
    }
  }

  if (req.body.section !== undefined) {
    student.section = String(req.body.section).toUpperCase();
  }

  await student.save();

  await createDepartmentNotification({
    title: "Student Records Updated",
    message: "Student records updated by Class Teacher.",
    sentBy: req.user._id,
    departmentId: assignment.departmentId,
    semester: assignment.semester,
    section: assignment.section,
    recipientRoles: ["admin", "hod"],
  });

  return sendSuccess(res, 200, "Student updated", { student });
});

const getClassStudents = catchAsync(async (req, res) => {
  const ctProfileId = req.user.profileId;
  const assignment = await getCtAssignment(ctProfileId, req.query.academicYear);

  const students = await Student.find({
    departmentId: assignment.departmentId,
    semester: assignment.semester,
    section: String(assignment.section).toUpperCase(),
    isActive: true,
  })
    .select("_id name rollNumber phone guardianPhone")
    .sort({ rollNumber: 1 })
    .lean();

  const summaries = await Promise.all(
    students.map(async (student) => {
      const summary = await Attendance.getStudentSummary(student._id);
      const total = summary.reduce((sum, row) => sum + Number(row.total || 0), 0);
      const present = summary.reduce((sum, row) => sum + Number(row.present || 0), 0);
      const late = summary.reduce((sum, row) => sum + Number(row.late || 0), 0);
      return {
        studentId: student._id,
        overallPercentage: attendanceCalc.calculatePercentage(present, late, total),
      };
    })
  );

  const summaryMap = new Map(summaries.map((item) => [String(item.studentId), item]));

  const data = students.map((student) => ({
    ...student,
    attendanceSummary: summaryMap.get(String(student._id)) || { overallPercentage: 0 },
  }));

  return sendSuccess(res, 200, "Class students fetched", data);
});

const sendClassNotice = catchAsync(async (req, res) => {
  const ctProfileId = req.user.profileId;
  const assignment = await getCtAssignment(ctProfileId, req.body.academicYear);

  const { title, message, type, sendSMS, sendToGuardians } = req.body;
  const selectedStudentIds = Array.isArray(req.body.selectedStudentIds)
    ? req.body.selectedStudentIds.filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
    : [];

  const notice = await Notice.create({
    title,
    message,
    type: type || "general",
    sentBy: req.user._id,
    targetDept: assignment.departmentId,
    targetSemester: assignment.semester,
    targetSection: assignment.section,
    recipientRoles: ["student"],
    sendSMS: Boolean(sendSMS),
  });

  let smsSent = 0;

  if (sendSMS || sendToGuardians) {
    if (selectedStudentIds.length === 0) {
      throw new AppError(400, "Select at least one student to send SMS");
    }

    const students = await Student.find({
      _id: { $in: selectedStudentIds },
      departmentId: assignment.departmentId,
      semester: assignment.semester,
      section: String(assignment.section).toUpperCase(),
      isActive: true,
    })
      .select("phone guardianPhone")
      .lean();

    const smsResult = await smsAlertService.sendClassNoticesSMS(notice, students, {
      sendToStudents: Boolean(sendSMS),
      sendToGuardians: Boolean(sendToGuardians),
    });
    smsSent = Number(smsResult?.sent || 0);
  }

  return sendSuccess(res, 201, "Notice sent", { notice, smsSent });
});

const getNoticeHistory = catchAsync(async (req, res) => {
  const ctProfileId = req.user.profileId;
  const assignment = await getCtAssignment(ctProfileId, req.query.academicYear);
  const page = toPositiveInt(req.query.page, 1);
  const limit = toPositiveInt(req.query.limit, 20);

  const filter = {
    targetDept: assignment.departmentId,
    targetSemester: assignment.semester,
    targetSection: String(assignment.section).toUpperCase(),
    sentBy: req.user._id,
  };

  const total = await Notice.countDocuments(filter);

  const items = await Notice.find(filter)
    .select("_id title message type readBy createdAt sendSMS")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const data = items.map((item) => ({
    ...item,
    readCount: Array.isArray(item.readBy) ? item.readBy.length : 0,
  }));

  return sendPaginated(res, 200, "Notice history fetched", data, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

const getMonthlyLowAttendance = catchAsync(async (req, res) => {
  const ctProfileId = req.user.profileId;
  const assignment = await getCtAssignment(ctProfileId, req.query.academicYear);

  const threshold = Number(req.query.threshold || process.env.ATTENDANCE_THRESHOLD || 75);
  const now = new Date();
  const year = Number(req.query.year || now.getUTCFullYear());
  const month = Number(req.query.month || now.getUTCMonth() + 1);

  const fromDate = new Date(Date.UTC(year, month - 1, 1));
  const toDate = new Date(Date.UTC(year, month, 1));

  const students = await Student.find({
    departmentId: assignment.departmentId,
    semester: assignment.semester,
    section: String(assignment.section).toUpperCase(),
    isActive: true,
  })
    .select("_id name rollNumber phone guardianPhone")
    .lean();

  const attendanceRows = await Attendance.find({
    studentId: { $in: students.map((student) => student._id) },
    date: { $gte: fromDate, $lt: toDate },
  })
    .select("studentId status")
    .lean();

  const summaryMap = new Map(
    students.map((student) => [String(student._id), { total: 0, present: 0, late: 0 }])
  );

  for (const row of attendanceRows) {
    const key = String(row.studentId);
    const summary = summaryMap.get(key);
    if (!summary) continue;
    summary.total += 1;
    if (row.status === "P") summary.present += 1;
    else if (row.status === "L") summary.late += 1;
  }

  const data = students
    .map((student) => {
      const summary = summaryMap.get(String(student._id)) || { total: 0, present: 0, late: 0 };
      const percentage = attendanceCalc.calculatePercentage(summary.present, summary.late, summary.total);
      return {
        studentId: student._id,
        name: student.name,
        rollNumber: student.rollNumber,
        phone: student.phone || null,
        guardianPhone: student.guardianPhone || null,
        percentage,
        totalClasses: summary.total,
      };
    })
    .filter((student) => student.totalClasses > 0 && student.percentage < threshold)
    .sort((a, b) => a.percentage - b.percentage);

  return sendSuccess(res, 200, "Monthly low attendance fetched", {
    threshold,
    year,
    month,
    count: data.length,
    students: data,
  });
});

const triggerMonthlyAlerts = catchAsync(async (req, res) => {
  const ctProfileId = req.user.profileId;
  const assignment = await getCtAssignment(ctProfileId, req.body.academicYear || req.query.academicYear);

  const threshold = Number(req.body.threshold || req.query.threshold || process.env.ATTENDANCE_THRESHOLD || 75);
  const now = new Date();
  const year = Number(req.body.year || req.query.year || now.getUTCFullYear());
  const month = Number(req.body.month || req.query.month || now.getUTCMonth() + 1);

  const fromDate = new Date(Date.UTC(year, month - 1, 1));
  const toDate = new Date(Date.UTC(year, month, 1));

  const students = await Student.find({
    departmentId: assignment.departmentId,
    semester: assignment.semester,
    section: String(assignment.section).toUpperCase(),
    isActive: true,
  })
    .select("_id name rollNumber phone guardianPhone")
    .lean();

  const attendanceRows = await Attendance.find({
    studentId: { $in: students.map((student) => student._id) },
    date: { $gte: fromDate, $lt: toDate },
  })
    .select("studentId status")
    .lean();

  const summaryMap = new Map(
    students.map((student) => [String(student._id), { total: 0, present: 0, late: 0 }])
  );

  for (const row of attendanceRows) {
    const key = String(row.studentId);
    const summary = summaryMap.get(key);
    if (!summary) continue;
    summary.total += 1;
    if (row.status === "P") summary.present += 1;
    else if (row.status === "L") summary.late += 1;
  }

  const lowStudents = students
    .map((student) => {
      const summary = summaryMap.get(String(student._id)) || { total: 0, present: 0, late: 0 };
      const percentage = attendanceCalc.calculatePercentage(summary.present, summary.late, summary.total);
      return {
        ...student,
        percentage,
        totalClasses: summary.total,
      };
    })
    .filter((student) => student.totalClasses > 0 && student.percentage < threshold);

  let sent = 0;
  let failed = 0;

  for (const student of lowStudents) {
    const phone = smsAlertService.formatPhone(student.guardianPhone || student.phone);
    if (!phone || !smsService?.sendSMS) {
      failed += 1;
      continue;
    }

    const result = await smsService.sendSMS({
      phone,
      message: `Attendance alert: ${student.name} (${student.rollNumber}) is at ${student.percentage.toFixed(2)}% this month. Required minimum is ${threshold}%.`,
    });

    if (result?.success) sent += 1;
    else failed += 1;
  }

  return sendSuccess(res, 200, "Monthly alerts triggered", {
    threshold,
    year,
    month,
    totalStudents: lowStudents.length,
    sent,
    failed,
  });
});

const getLeaveRequests = catchAsync(async (req, res) => {
  const ctProfileId = req.user.profileId;
  const assignment = await getCtAssignment(ctProfileId, req.query.academicYear);
  const page = toPositiveInt(req.query.page, 1);
  const limit = toPositiveInt(req.query.limit, 20);

  const resolvedLeaveModel = LeaveRequest || mongoose.models.LeaveRequest;

  if (!resolvedLeaveModel) {
    return sendPaginated(res, 200, "Leave requests fetched", [], {
      page,
      limit,
      total: 0,
      totalPages: 1,
    });
  }

  const students = await Student.find({
    departmentId: assignment.departmentId,
    semester: assignment.semester,
    section: String(assignment.section).toUpperCase(),
    isActive: true,
  })
    .select("_id")
    .lean();

  const filter = {
    studentId: { $in: students.map((item) => item._id) },
  };

  if (req.query.status) {
    filter.status = req.query.status;
  }

  const total = await resolvedLeaveModel.countDocuments(filter);

  const items = await resolvedLeaveModel.find(filter)
    .populate({ path: "studentId", select: "name rollNumber" })
    .populate({ path: "subjectId", select: "name subjectCode" })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return sendPaginated(res, 200, "Leave requests fetched", items, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

const buildMonthlyData = async ({ subjectId, year, month, type, ctAssignment, user }) => {
  if (monthlyReportService?.buildMonthlyReport) {
    return monthlyReportService.buildMonthlyReport({
      subjectId,
      year,
      month,
      type,
      departmentId: ctAssignment.departmentId,
      semester: ctAssignment.semester,
      section: ctAssignment.section,
      generatedBy: user,
    });
  }

  if (reportDataService?.buildMonthlyClassReport) {
    const filter = type === "below" ? "below75" : type === "above" ? "above75" : "all";
    return reportDataService.buildMonthlyClassReport({
      subjectId,
      facultyId: user.profileId,
      month,
      year,
      semester: ctAssignment.semester,
      section: ctAssignment.section,
      filter,
    });
  }

  throw new AppError(501, "Monthly report service is not available");
};

const buildSemesterData = async ({ subjectId, academicYear, semester, type, ctAssignment, user }) => {
  if (semesterReportService?.buildSemesterReport) {
    return semesterReportService.buildSemesterReport({
      subjectId,
      academicYear,
      semester,
      type,
      departmentId: ctAssignment.departmentId,
      section: ctAssignment.section,
      generatedBy: user,
    });
  }

  if (reportDataService?.buildSemesterClassReport) {
    if (!subjectId) {
      const studentRows = await Student.find({
        departmentId: ctAssignment.departmentId,
        semester: Number(semester),
        section: String(ctAssignment.section).toUpperCase(),
        isActive: true,
      })
        .select("_id rollNumber name")
        .lean();

      const records = await Attendance.find({
        studentId: { $in: studentRows.map((s) => s._id) },
      })
        .select("studentId status")
        .lean();

      const rows = studentRows.map((student) => {
        const own = records.filter((r) => String(r.studentId) === String(student._id));
        const total = own.length;
        const present = own.filter((r) => r.status === "P").length;
        const late = own.filter((r) => r.status === "L").length;
        const absent = own.filter((r) => r.status === "A" || r.status === "ML").length;
        const percentage = attendanceCalc.calculatePercentage(present, late, total);
        return {
          rollNumber: student.rollNumber,
          studentName: student.name,
          present,
          late,
          absent,
          total,
          percentage,
          dateGrid: [],
        };
      });

      const classAverage = rows.length
        ? Number((rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length).toFixed(2))
        : 0;

      return {
        reportMeta: {
          academicYear,
          semester,
          section: ctAssignment.section,
          subjectName: "All Subjects",
          subjectCode: "ALL",
          facultyName: "Class Teacher",
          generatedAt: new Date(),
        },
        summary: {
          totalStudents: rows.length,
          filtered: rows.length,
          classDatesHeld: 0,
          classAverage,
          below75Count: rows.filter((r) => r.percentage < 75).length,
          above75Count: rows.filter((r) => r.percentage >= 75).length,
          perfectAttendance: rows.filter((r) => r.percentage === 100).length,
        },
        classDates: [],
        rows,
        monthlyTrend: [],
      };
    }

    return reportDataService.buildSemesterClassReport({
      subjectId,
      facultyId: user.profileId,
      academicYear,
      semester,
      section: ctAssignment.section,
      type,
    });
  }

  throw new AppError(501, "Semester report service is not available");
};

const generateMonthlyBuffer = async ({ data, format, type }) => {
  const filter = type === "below" ? "below75" : type === "above" ? "above75" : "all";

  if (format === "pdf") {
    if (monthlyPdfService?.generate) {
      return monthlyPdfService.generate(data, filter);
    }

    if (monthlyPdfService?.generateMonthlyClassReport) {
      return monthlyPdfService.generateMonthlyClassReport(data, filter);
    }

    const fallbackPdf = require("../services/pdfService");
    return fallbackPdf.generateMonthlyClassReport(data, filter);
  }

  if (monthlyExcelService?.generate) {
    return monthlyExcelService.generate(data, filter);
  }

  if (monthlyExcelService?.generateMonthlyClassExcel) {
    return monthlyExcelService.generateMonthlyClassExcel(data, filter);
  }

  const fallbackExcel = require("../services/excelService");
  return fallbackExcel.generateMonthlyClassExcel(data, filter);
};

const generateSemesterBuffer = async ({ data, format }) => {
  if (format === "pdf") {
    if (semesterReportPdfService?.generate) {
      return semesterReportPdfService.generate(data);
    }

    if (semesterReportPdfService?.generateSemesterClassReport) {
      return semesterReportPdfService.generateSemesterClassReport(data);
    }

    const fallbackPdf = require("../services/pdfService");
    return fallbackPdf.generateSemesterClassReport(data);
  }

  if (semesterReportExcelService?.generate) {
    return semesterReportExcelService.generate(data);
  }

  if (semesterReportExcelService?.generateSemesterClassExcel) {
    return semesterReportExcelService.generateSemesterClassExcel(data);
  }

  const fallbackExcel = require("../services/excelService");
  return fallbackExcel.generateSemesterClassExcel(data);
};

const downloadMonthlyReport = catchAsync(async (req, res) => {
  const user = req.user;
  const now = new Date();
  const { subjectId, year = now.getUTCFullYear(), month = now.getUTCMonth() + 1, type = "full", format = "pdf" } = req.query;

  if (!subjectId || !mongoose.Types.ObjectId.isValid(String(subjectId))) {
    throw new AppError(400, "Valid subjectId is required");
  }

  if (!["full", "below", "above"].includes(String(type))) {
    throw new AppError(400, "type must be full, below, or above");
  }

  if (!["pdf", "excel"].includes(String(format))) {
    throw new AppError(400, "format must be pdf or excel");
  }

  const ctAssignment = await getCtAssignment(user.profileId, req.query.academicYear);
  const assignedFaculty = await Timetable.validateAssignment(user.profileId, subjectId);

  if (!assignedFaculty && String(user.role) !== "class_teacher") {
    throw new AppError(403, "Not authorized to download this report");
  }

  const data = await buildMonthlyData({
    subjectId,
    year: Number(year),
    month: Number(month),
    type,
    ctAssignment,
    user,
  });

  const buffer = await generateMonthlyBuffer({ data, format, type });

  const ext = format === "pdf" ? "pdf" : "xlsx";
  const mime = format === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return streamBuffer(
    res,
    buffer,
    `monthly-report-${subjectId}-${year}-${month}.${ext}`,
    mime
  );
});

const downloadSemesterReport = catchAsync(async (req, res) => {
  const user = req.user;
  const {
    subjectId,
    academicYear,
    semester,
    type = "full",
    format = "pdf",
  } = req.query;

  if (!academicYear) {
    throw new AppError(400, "academicYear is required");
  }

  if (!semester) {
    throw new AppError(400, "semester is required");
  }

  if (!["full", "below", "above"].includes(String(type))) {
    throw new AppError(400, "type must be full, below, or above");
  }

  if (!["pdf", "excel"].includes(String(format))) {
    throw new AppError(400, "format must be pdf or excel");
  }

  if (subjectId && !mongoose.Types.ObjectId.isValid(String(subjectId))) {
    throw new AppError(400, "Invalid subjectId");
  }

  const ctAssignment = await getCtAssignment(user.profileId, academicYear);

  if (subjectId) {
    const assignedFaculty = await Timetable.validateAssignment(user.profileId, subjectId);
    if (!assignedFaculty && String(user.role) !== "class_teacher") {
      throw new AppError(403, "Not authorized to download this report");
    }
  }

  const data = await buildSemesterData({
    subjectId: subjectId || null,
    academicYear,
    semester: Number(semester),
    type,
    ctAssignment,
    user,
  });

  const buffer = await generateSemesterBuffer({ data, format });

  const ext = format === "pdf" ? "pdf" : "xlsx";
  const mime = format === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  const reportKey = subjectId || "all-subjects";

  return streamBuffer(
    res,
    buffer,
    `semester-report-${reportKey}-${academicYear}-sem${semester}.${ext}`,
    mime
  );
});

module.exports = {
  getAssignedClassTimetables,
  getDailyClassAttendance,
  triggerAbsentSMS,
  addStudent,
  updateStudent,
  getClassStudents,
  sendClassNotice,
  getNoticeHistory,
  getMonthlyLowAttendance,
  triggerMonthlyAlerts,
  getLeaveRequests,
  downloadMonthlyReport,
  downloadSemesterReport,
};
