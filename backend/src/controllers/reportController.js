const ExcelJS = require("exceljs");
const mongoose = require("mongoose");

const { catchAsync, AppError } = require("../utils/AppError");
const { sendSuccess } = require("../utils/responseHelper");
const { Attendance, Student, Subject, Faculty } = require("../models");
const pdfService = require("../services/pdfService");
const emailService = require("../services/emailService");
const smsService = require("../services/smsService");

const getThreshold = () => Number(process.env.ATTENDANCE_THRESHOLD || 75);

const buildLowAttendanceAggregation = ({ threshold, departmentId }) => {
  const matchStage = {};
  if (departmentId && mongoose.Types.ObjectId.isValid(departmentId)) {
    matchStage.departmentId = new mongoose.Types.ObjectId(departmentId);
  }

  return [
    {
      $match: matchStage,
    },
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
    {
      $match: {
        percentage: { $lt: threshold },
      },
    },
    {
      $lookup: {
        from: "students",
        localField: "studentId",
        foreignField: "_id",
        as: "student",
      },
    },
    {
      $unwind: "$student",
    },
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
    {
      $sort: { percentage: 1, rollNumber: 1 },
    },
  ];
};

const findLowAttendanceStudents = async ({ threshold = getThreshold(), departmentId } = {}) => {
  const pipeline = buildLowAttendanceAggregation({ threshold, departmentId });
  return Attendance.aggregate(pipeline);
};

const runAlertDispatch = async ({ threshold = getThreshold(), departmentId } = {}) => {
  const lowStudents = await findLowAttendanceStudents({ threshold, departmentId });

  const emailResult = await emailService.sendBulkAlerts(lowStudents);

  const smsResults = [];
  for (const student of lowStudents) {
    if (!student.studentPhone) {
      smsResults.push({
        phone: null,
        success: false,
        messageId: null,
      });
      continue;
    }

    const result = await smsService.sendLowAttendanceSMS(
      student.studentPhone,
      student.studentName,
      student.subjectName || student.subjectCode || "Subject",
      student.percentage
    );

    smsResults.push({
      phone: student.studentPhone,
      ...result,
    });
  }

  const emailSentCount = Array.isArray(emailResult.results)
    ? emailResult.results.filter((r) => r.success).length
    : 0;

  const smsSentCount = smsResults.filter((r) => r.success).length;

  return {
    threshold,
    totalStudents: lowStudents.length,
    emailSentCount,
    smsSentCount,
    totalAlertsSent: emailSentCount + smsSentCount,
    emailResult,
    smsResults,
    students: lowStudents,
  };
};

const buildStudentReportData = async (studentId) => {
  const student = await Student.findById(studentId).populate({
    path: "departmentId",
    select: "name code",
  });

  if (!student) {
    throw new AppError(404, "Student not found");
  }

  const summary = await Attendance.getStudentSummary(studentId);
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
    generatedAt: new Date(),
  };
};

const buildClassExcelData = async ({ subjectId, date, session }) => {
  if (!subjectId || !mongoose.Types.ObjectId.isValid(subjectId)) {
    throw new AppError(400, "Valid subjectId is required");
  }

  const normalizedSession = session || "morning";
  const queryDate = date || new Date().toISOString().slice(0, 10);
  const normalizedDate = new Date(`${queryDate}T00:00:00.000Z`);

  const subject = await Subject.findById(subjectId).lean();
  if (!subject) {
    throw new AppError(404, "Subject not found");
  }

  const records = await Attendance.find({
    subjectId,
    date: normalizedDate,
    session: normalizedSession,
  })
    .populate({ path: "studentId", select: "name rollNumber section" })
    .sort({ "studentId.rollNumber": 1 })
    .lean();

  return {
    subject,
    records,
    date: queryDate,
    session: normalizedSession,
  };
};

const createClassWorkbook = async ({ subject, records, date, session }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Attendance Management System";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Class Attendance");

  worksheet.columns = [
    { header: "Roll Number", key: "rollNumber", width: 16 },
    { header: "Student Name", key: "studentName", width: 28 },
    { header: "Section", key: "section", width: 10 },
    { header: "Status", key: "status", width: 12 },
    { header: "Remarks", key: "remarks", width: 30 },
  ];

  worksheet.mergeCells("A1:E1");
  worksheet.getCell("A1").value = `Attendance Report - ${subject.name} (${subject.subjectCode})`;
  worksheet.getCell("A1").font = { bold: true, size: 14 };
  worksheet.getCell("A1").alignment = { horizontal: "center" };

  worksheet.mergeCells("A2:E2");
  worksheet.getCell("A2").value = `Date: ${date} | Session: ${session}`;
  worksheet.getCell("A2").alignment = { horizontal: "center" };

  const headerRow = worksheet.getRow(4);
  headerRow.values = worksheet.columns.map((c) => c.header);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F2937" },
  };

  records.forEach((record) => {
    worksheet.addRow({
      rollNumber: record.studentId?.rollNumber || "-",
      studentName: record.studentId?.name || "-",
      section: record.studentId?.section || "-",
      status: record.status,
      remarks: record.remarks || "",
    });
  });

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD1D5DB" } },
        left: { style: "thin", color: { argb: "FFD1D5DB" } },
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
        right: { style: "thin", color: { argb: "FFD1D5DB" } },
      };
      cell.alignment = { vertical: "middle", horizontal: "left" };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

const downloadStudentPDF = catchAsync(async (req, res) => {
  const studentId = req.params.studentId || req.query.studentId;
  if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
    throw new AppError(400, "Valid studentId is required");
  }

  const reportData = await buildStudentReportData(studentId);
  const pdfBuffer = await pdfService.generateStudentReport(reportData);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=student-report-${reportData.student.rollNumber}.pdf`);
  return res.send(pdfBuffer);
});

const downloadClassExcel = catchAsync(async (req, res) => {
  const classData = await buildClassExcelData({
    subjectId: req.query.subjectId,
    date: req.query.date,
    session: req.query.session,
  });

  const buffer = await createClassWorkbook(classData);

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=class-attendance-${classData.subject.subjectCode}-${classData.date}.xlsx`
  );

  return res.send(buffer);
});

const getLowAttendanceList = catchAsync(async (req, res) => {
  const threshold = Number(req.query.threshold || getThreshold());
  const departmentId = req.query.departmentId;

  const students = await findLowAttendanceStudents({ threshold, departmentId });

  return sendSuccess(res, 200, "Low attendance list", {
    threshold,
    count: students.length,
    students,
  });
});

const triggerAlerts = catchAsync(async (req, res) => {
  if (!req.user || req.user.role !== "admin") {
    throw new AppError(403, "Only admin can trigger attendance alerts");
  }

  const threshold = Number(req.body?.threshold || req.query.threshold || getThreshold());
  const departmentId = req.body?.departmentId || req.query.departmentId;

  const result = await runAlertDispatch({ threshold, departmentId });

  return sendSuccess(res, 200, "Alerts triggered", {
    threshold: result.threshold,
    lowAttendanceCount: result.totalStudents,
    emailSentCount: result.emailSentCount,
    smsSentCount: result.smsSentCount,
    totalAlertsSent: result.totalAlertsSent,
  });
});

const getDepartmentStats = catchAsync(async (req, res) => {
  const departmentId = req.query.departmentId;
  if (!departmentId || !mongoose.Types.ObjectId.isValid(departmentId)) {
    throw new AppError(400, "Valid departmentId is required");
  }

  const pipeline = [
    {
      $match: {
        departmentId: new mongoose.Types.ObjectId(departmentId),
      },
    },
    {
      $group: {
        _id: "$subjectId",
        present: { $sum: { $cond: [{ $eq: ["$status", "P"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "L"] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ["$status", "A"] }, 1, 0] } },
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
        label: {
          $ifNull: ["$subject.subjectCode", "Unknown"],
        },
        present: {
          $add: ["$present", { $multiply: ["$late", 0.5] }],
        },
        absent: 1,
      },
    },
    {
      $sort: {
        label: 1,
      },
    },
  ];

  const stats = await Attendance.aggregate(pipeline);

  const labels = stats.map((item) => item.label);
  const presentData = stats.map((item) => item.present);
  const absentData = stats.map((item) => item.absent);

  return sendSuccess(res, 200, "Department attendance stats", {
    labels,
    presentData,
    absentData,
  });
});

const scheduledAlertCheck = async (options = {}) => {
  const threshold = Number(options.threshold || getThreshold());
  const departmentId = options.departmentId;
  return runAlertDispatch({ threshold, departmentId });
};

module.exports = {
  downloadStudentPDF,
  downloadClassExcel,
  getLowAttendanceList,
  triggerAlerts,
  getDepartmentStats,
  scheduledAlertCheck,
};
