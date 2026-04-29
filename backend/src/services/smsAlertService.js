const mongoose = require("mongoose");
const smsService = require("./smsService");
const { Attendance, Student, Subject } = require("../models");
const dateHelper = require("../utils/dateHelper");
const { AppError } = require("../utils/AppError");

const MONTH_ALERT_THRESHOLD = Number(process.env.ATTENDANCE_THRESHOLD || 75);
const COLLEGE_NAME = process.env.COLLEGE_NAME || "Attendance Management System";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const trimForSms = (text, maxLength = 159) => {
  const raw = String(text || "").trim();
  if (raw.length <= maxLength) {
    return raw;
  }

  return `${raw.slice(0, Math.max(0, maxLength - 3))}...`;
};

const formatPhone = (phone) => {
  if (!phone) {
    return null;
  }

  const digitsOnly = String(phone).replace(/\D/g, "");

  if (!digitsOnly) {
    return null;
  }

  if (digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  }

  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    return `+${digitsOnly}`;
  }

  if (String(phone).trim().startsWith("+")) {
    return String(phone).trim();
  }

  if (digitsOnly.length > 10) {
    return `+${digitsOnly}`;
  }

  return null;
};

const getMonthRange = (baseDate = new Date()) => {
  const from = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1));
  const to = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 1));
  return { from, to };
};

const resolveSubject = async (attendanceRecord) => {
  const subjectFromRecord = attendanceRecord?.subjectId;

  if (subjectFromRecord && typeof subjectFromRecord === "object" && subjectFromRecord.name) {
    return {
      _id: subjectFromRecord._id || subjectFromRecord.id,
      name: subjectFromRecord.name,
      subjectCode: subjectFromRecord.subjectCode || subjectFromRecord.code,
    };
  }

  const subjectId =
    typeof subjectFromRecord === "object"
      ? subjectFromRecord?._id || subjectFromRecord?.id
      : subjectFromRecord;

  if (!subjectId) {
    return null;
  }

  return Subject.findById(subjectId).select("name subjectCode").lean();
};

const sendAbsentAlert = async (attendanceRecord) => {
  try {
    if (!attendanceRecord?._id) {
      throw new AppError(400, "attendanceRecord with _id is required");
    }

    if (attendanceRecord.smsAlertSent === true) {
      return { sent: false, recipients: 0, skipped: true };
    }

    const student = await Student.findById(attendanceRecord.studentId)
      .select("name rollNumber phone guardianPhone")
      .lean();

    if (!student) {
      console.warn("sendAbsentAlert: student not found", attendanceRecord.studentId);
      return { sent: false, recipients: 0, skipped: true };
    }

    const subject = await resolveSubject(attendanceRecord);
    const subjectName = subject?.name || subject?.subjectCode || "Subject";

    const dateText = dateHelper.toDateString(new Date(attendanceRecord.date));
    const periodNumber = Number(attendanceRecord.periodNumber || 0);

    const message = trimForSms(
      `ABSENT ALERT: ${student.name} (Roll:${student.rollNumber}) was absent for ${subjectName} on ${dateText} Period ${periodNumber}. -${COLLEGE_NAME}`,
      159
    );

    const recipients = [formatPhone(student.phone), formatPhone(student.guardianPhone)]
      .filter(Boolean)
      .filter((phone, index, arr) => arr.indexOf(phone) === index);

    if (recipients.length === 0) {
      await Attendance.updateOne(
        { _id: attendanceRecord._id },
        { $set: { smsAlertSent: true } },
        { runValidators: false }
      );
      return { sent: true, recipients: 0 };
    }

    let sentCount = 0;

    for (const phone of recipients) {
      const result = await smsService.sendSMS({ phone, message });
      if (result?.success) {
        sentCount += 1;
      }
    }

    await Attendance.updateOne(
      { _id: attendanceRecord._id },
      { $set: { smsAlertSent: true } },
      { runValidators: false }
    );

    return { sent: true, recipients: sentCount };
  } catch (error) {
    console.error("sendAbsentAlert failed:", error);
    return { sent: false, recipients: 0, failed: true };
  }
};

const sendMonthlyThresholdAlert = async ({ studentId, subjectId, percentage, threshold }) => {
  const currentThreshold = Number(threshold || MONTH_ALERT_THRESHOLD);
  const { from, to } = getMonthRange(new Date());

  const existingAlert = await Attendance.findOne({
    studentId,
    subjectId,
    monthlyAlertSent: true,
    date: { $gte: from, $lt: to },
  })
    .select("_id")
    .lean();

  if (existingAlert) {
    return { sent: false, skipped: true };
  }

  const [student, subject] = await Promise.all([
    Student.findById(studentId).select("name rollNumber phone guardianPhone").lean(),
    Subject.findById(subjectId).select("name subjectCode").lean(),
  ]);

  if (!student || !subject) {
    return { sent: false, skipped: true };
  }

  const message = trimForSms(
    `ATTENDANCE WARNING: ${student.name} attendance in ${subject.name} is ${Number(percentage).toFixed(2)}% (Required:${currentThreshold}%). Attend all classes. -${COLLEGE_NAME}`,
    159
  );

  const recipients = [formatPhone(student.phone), formatPhone(student.guardianPhone)]
    .filter(Boolean)
    .filter((phone, index, arr) => arr.indexOf(phone) === index);

  for (const phone of recipients) {
    await smsService.sendSMS({ phone, message });
  }

  const latestRecord = await Attendance.findOne({ studentId, subjectId })
    .sort({ date: -1, periodNumber: -1, createdAt: -1 })
    .select("_id")
    .lean();

  if (latestRecord?._id) {
    await Attendance.updateOne(
      { _id: latestRecord._id },
      { $set: { monthlyAlertSent: true } },
      { runValidators: false }
    );
  }

  return { sent: true };
};

const sendBulkAbsentAlerts = async (attendanceRecords) => {
  const pending = (Array.isArray(attendanceRecords) ? attendanceRecords : []).filter(
    (record) => record?.status === "A" && record?.smsAlertSent !== true
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (let index = 0; index < pending.length; index += 5) {
    const batch = pending.slice(index, index + 5);

    const results = await Promise.all(batch.map((record) => sendAbsentAlert(record)));

    for (const result of results) {
      if (result?.failed) {
        failed += 1;
      } else if (result?.sent) {
        sent += 1;
      } else {
        skipped += 1;
      }
    }

    if (index + 5 < pending.length) {
      await delay(200);
    }
  }

  return {
    processed: pending.length,
    sent,
    skipped,
    failed,
  };
};

const sendClassNoticesSMS = async (notice, studentList, options = {}) => {
  const title = String(notice?.title || "Notice").trim();
  const bodySnippet = String(notice?.message || "").trim().slice(0, 100);
  const message = trimForSms(`${title}: ${bodySnippet} -${COLLEGE_NAME}`, 159);
  const sendToStudents = options?.sendToStudents !== false;
  const sendToGuardians = Boolean(options?.sendToGuardians);

  const recipients = new Set();

  for (const student of Array.isArray(studentList) ? studentList : []) {
    const studentPhone = sendToStudents ? formatPhone(student?.phone) : null;
    if (studentPhone) {
      recipients.add(studentPhone);
    }

    if (sendToGuardians) {
      const guardianPhone = formatPhone(student?.guardianPhone);
      if (guardianPhone) {
        recipients.add(guardianPhone);
      }
    }
  }

  if (recipients.size === 0) {
    throw new AppError(400, "No valid phone numbers found for selected class");
  }

  let sent = 0;
  let failed = 0;

  for (const phone of recipients) {
    const result = await smsService.sendSMS({ phone, message });
    if (result?.success) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  if (notice?._id) {
    const nextSmsCount = Number(notice.smsCount || 0) + sent;

    if (typeof notice.save === "function") {
      notice.smsCount = nextSmsCount;
      await notice.save({ validateBeforeSave: false });
    } else if (notice.constructor?.updateOne) {
      await notice.constructor.updateOne(
        { _id: notice._id },
        { $set: { smsCount: nextSmsCount } },
        { runValidators: false }
      );
    }
  }

  return { sent, failed };
};

const checkAndSendMonthlyAlerts = async (deptId, semester, academicYear) => {
  void academicYear;

  const threshold = MONTH_ALERT_THRESHOLD;
  const { from, to } = getMonthRange(new Date());

  const normalizedSemester = Number(semester);
  const shouldFilterSemester = Number.isFinite(normalizedSemester) && normalizedSemester > 0;

  const pipeline = [
    {
      $match: {
        departmentId: new mongoose.Types.ObjectId(deptId),
        date: { $gte: from, $lt: to },
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
      $match: {
        "student.isActive": true,
      },
    },
  ];

  if (shouldFilterSemester) {
    pipeline.push({
      $match: {
        "student.semester": normalizedSemester,
      },
    });
  }

  pipeline.push(
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
        _id: 0,
        studentId: "$_id.studentId",
        subjectId: "$_id.subjectId",
        percentage: {
          $cond: [
            { $eq: ["$total", 0] },
            0,
            {
              $multiply: [
                {
                  $divide: [{ $add: ["$present", { $multiply: ["$late", 0.5] }] }, "$total"],
                },
                100,
              ],
            },
          ],
        },
      },
    },
    {
      $match: {
        percentage: { $lt: threshold },
      },
    }
  );

  const summaries = await Attendance.aggregate(pipeline);

  let alertsSent = 0;

  for (const summary of summaries) {
    const result = await sendMonthlyThresholdAlert({
      studentId: summary.studentId,
      subjectId: summary.subjectId,
      percentage: summary.percentage,
      threshold,
    });

    if (result?.sent) {
      alertsSent += 1;
    }
  }

  return alertsSent;
};

module.exports = {
  formatPhone,
  sendAbsentAlert,
  sendMonthlyThresholdAlert,
  sendBulkAbsentAlerts,
  sendClassNoticesSMS,
  checkAndSendMonthlyAlerts,
};
