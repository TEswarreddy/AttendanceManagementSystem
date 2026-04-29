const mongoose = require('mongoose');
const { catchAsync, AppError } = require('../utils/AppError');
const { sendSuccess, sendPaginated } = require('../utils/responseHelper');
const { Attendance, Student, Subject, Timetable, AuditLog } = require('../models');
const { createDepartmentNotification } = require('../services/departmentNotificationService');
const dateHelper = require('../utils/dateHelper');
const attendanceCalc = require('../utils/attendanceCalc');
const reportDataService = require('../utils/reportDataService');

const ATTENDANCE_STATS_CACHE_NAMESPACE = 'attendance:department-stats';
const ATTENDANCE_STATS_CACHE_TTL_SECONDS = 2 * 60;

const buildDepartmentStatsCacheKey = ({ departmentId, semester, fromDate, toDate, threshold }) => {
  const fromDateKey = fromDate || 'none';
  const toDateKey = toDate || 'none';
  const semesterKey = semester || 'all';
  const thresholdKey = Number(threshold || process.env.ATTENDANCE_THRESHOLD || 75);

  return [
    ATTENDANCE_STATS_CACHE_NAMESPACE,
    departmentId,
    semesterKey,
    fromDateKey,
    toDateKey,
    thresholdKey,
  ].join(':');
};

const invalidateDepartmentStatsCache = async () => {
  await reportDataService.invalidateCacheNamespace(ATTENDANCE_STATS_CACHE_NAMESPACE);
};

/**
 * Mark attendance for a class session
 * POST /api/attendance/mark
 * Body: { subjectId, date, session, records: [{ studentId, status, remarks? }] }
 */
exports.markAttendance = catchAsync(async (req, res) => {
  const { subjectId, date, session, records } = req.body;

  // Validation: Verify faculty is assigned to this subject
  const isAssigned = await Timetable.validateAssignment(req.user.profileId, subjectId);
  if (!isAssigned) {
    throw new AppError(403, 'You are not assigned to this subject');
  }

  // Validation: Subject exists and is active
  const subject = await Subject.findById(subjectId);
  if (!subject || !subject.isActive) {
    throw new AppError(404, 'Subject not found');
  }

  // Validation: Normalize and validate date
  let normalizedDate;
  try {
    normalizedDate = dateHelper.toMidnightUTC(date);
  } catch (error) {
    throw new AppError(400, error.message || 'Invalid date format');
  }

  // Validation: Date cannot be in future
  const now = new Date();
  if (normalizedDate > now) {
    throw new AppError(400, 'Cannot mark attendance for future date');
  }

  // Validation: Records not empty
  if (!records || records.length === 0) {
    throw new AppError(400, 'No student records provided');
  }

  // Deduplicate records by studentId (take last occurrence)
  const deduplicatedRecords = [];
  const studentIds = new Set();
  for (let i = records.length - 1; i >= 0; i--) {
    if (!studentIds.has(records[i].studentId.toString())) {
      deduplicatedRecords.unshift(records[i]);
      studentIds.add(records[i].studentId.toString());
    }
  }

  // MongoDB transaction for bulk write
  const dbSession = await mongoose.startSession();
  let result;

  try {
    await dbSession.withTransaction(async () => {
      const ops = deduplicatedRecords.map(r => ({
        updateOne: {
          filter: {
            studentId: r.studentId,
            subjectId,
            date: normalizedDate,
            session
          },
          update: {
            $set: {
              status: r.status,
              facultyId: req.user.profileId,
              departmentId: subject.departmentId,
              remarks: r.remarks || null,
              markedAt: new Date()
            },
            $setOnInsert: {
              qrSessionId: null
            }
          },
          upsert: true
        }
      }));

      result = await Attendance.bulkWrite(ops, { session: dbSession });
    });
  } finally {
    await dbSession.endSession();
  }

  // Log audit entry
  try {
    await AuditLog.logEdit({
      action: 'bulk_mark',
      performedBy: req.user,
      targetModel: 'Attendance',
      targetId: subjectId, // Logging subject as target since bulk marking
      previousValue: null,
      newValue: {
        subjectId,
        date: normalizedDate,
        session,
        recordCount: deduplicatedRecords.length
      },
      req,
      reason: `Marked attendance for ${deduplicatedRecords.length} students`
    });
  } catch (auditError) {
    console.error('Audit log failed:', auditError);
    // Don't throw - audit failure shouldn't block the main operation
  }

  try {
    await invalidateDepartmentStatsCache();
  } catch (cacheError) {
    console.warn('Failed to invalidate department stats cache:', cacheError.message);
  }

  sendSuccess(res, 200, 'Attendance marked successfully', {
    subjectId,
    date: normalizedDate,
    session,
    totalRecords: deduplicatedRecords.length,
    inserted: result.upsertedCount || 0,
    updated: result.modifiedCount || 0
  });
});

/**
 * Get attendance records for a class session
 * GET /api/attendance/class?subjectId=...&date=...&session=...
 */
exports.getClassAttendance = catchAsync(async (req, res) => {
  const { subjectId, date, session } = req.query;

  // Validation: subjectId is valid MongoDB ID
  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    throw new AppError(400, 'Invalid subject ID');
  }

  // Validation: Faculty is assigned to this subject
  const isAssigned = await Timetable.validateAssignment(req.user.profileId, subjectId);
  if (!isAssigned) {
    throw new AppError(403, 'You are not assigned to this subject');
  }

  // Validation: Subject exists
  const subject = await Subject.findById(subjectId);
  if (!subject) {
    throw new AppError(404, 'Subject not found');
  }

  // Normalize date
  let normalizedDate;
  try {
    normalizedDate = dateHelper.toMidnightUTC(date);
  } catch (error) {
    throw new AppError(400, error.message || 'Invalid date format');
  }

  // Get attendance records using static method
  let records = await Attendance.getSubjectClassList(subjectId, normalizedDate, session);

  // Populate student information
  records = await Attendance.populate(records, {
    path: 'studentId',
    select: 'name rollNumber section'
  });

  // Calculate summary stats
  const totalPresent = records.filter(r => r.status === 'P').length;
  const totalAbsent = records.filter(r => r.status === 'A').length;
  const totalLate = records.filter(r => r.status === 'L').length;
  const totalStudents = records.length;

  sendSuccess(res, 200, 'Class attendance retrieved', {
    date: normalizedDate,
    session,
    subjectId,
    subjectName: subject.name,
    records: records.map(r => ({
      _id: r._id,
      studentId: r.studentId._id,
      studentName: r.studentId.name,
      rollNumber: r.studentId.rollNumber,
      section: r.studentId.section,
      status: r.status,
      remarks: r.remarks,
      markedAt: r.markedAt
    })),
    summary: {
      totalStudents,
      totalPresent,
      totalAbsent,
      totalLate,
      percentagePresent: totalStudents > 0 ? ((totalPresent / totalStudents) * 100).toFixed(2) : 0
    }
  });
});

/**
 * Get student attendance summary across all subjects
 * GET /api/attendance/student/:studentId?semester=...&subjectId=...
 */
exports.getStudentAttendance = catchAsync(async (req, res) => {
  const { studentId } = req.params;
  const { semester, subjectId } = req.query;

  // Enforce self-restriction for student role
  if (req.user.role === 'student' && req.user.profileId.toString() !== studentId) {
    throw new AppError(403, 'You can only view your own attendance');
  }

  // Verify student exists
  const student = await Student.findById(studentId);
  if (!student) {
    throw new AppError(404, 'Student not found');
  }

  // Build match stage
  const matchStage = {
    studentId: new mongoose.Types.ObjectId(studentId)
  };

  if (semester) {
    matchStage.semester = parseInt(semester);
  }

  if (subjectId && mongoose.Types.ObjectId.isValid(subjectId)) {
    matchStage.subjectId = new mongoose.Types.ObjectId(subjectId);
  }

  // Aggregation pipeline
  const pipeline = [
    {
      $match: matchStage
    },
    {
      $group: {
        _id: '$subjectId',
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'P'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'L'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'A'] }, 1, 0] } },
        medicalLeave: { $sum: { $cond: [{ $eq: ['$status', 'ML'] }, 1, 0] } }
      }
    },
    {
      $lookup: {
        from: 'subjects',
        localField: '_id',
        foreignField: '_id',
        as: 'subjectDetails'
      }
    },
    {
      $unwind: '$subjectDetails'
    },
    {
      $project: {
        _id: 1,
        subjectId: '$_id',
        subjectName: '$subjectDetails.name',
        subjectCode: '$subjectDetails.code',
        credits: '$subjectDetails.credits',
        type: '$subjectDetails.type',
        total: 1,
        present: 1,
        late: 1,
        absent: 1,
        medicalLeave: 1
      }
    }
  ];

  const attendanceData = await Attendance.aggregate(pipeline);

  // Build subject summaries with calculated fields
  const summary = attendanceCalc.buildSubjectSummary(attendanceData);

  // Calculate overall percentage
  const overallPercentage = attendanceCalc.calculateOverallPercentage(summary);

  // Get low attendance subjects
  const lowAttendanceSubjects = summary.filter(s => s.status !== 'safe');

  sendSuccess(res, 200, 'Student attendance summary', {
    student: {
      id: studentId,
      name: student.name,
      rollNumber: student.rollNumber,
      semester: student.semester,
      section: student.section
    },
    overallPercentage,
    summary,
    lowAttendanceSubjects,
    threshold: Number(process.env.ATTENDANCE_THRESHOLD || 75)
  });
});

/**
 * Get student attendance details for a specific subject with date range
 * GET /api/attendance/student/:studentId/subject/:subjectId?fromDate=...&toDate=...
 */
exports.getStudentAttendanceBySubject = catchAsync(async (req, res) => {
  const { studentId, subjectId } = req.params;
  const { fromDate, toDate } = req.query;

  // Enforce self-restriction for student role
  if (req.user.role === 'student' && req.user.profileId.toString() !== studentId) {
    throw new AppError(403, 'You can only view your own attendance');
  }

  // Validate IDs
  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new AppError(400, 'Invalid student ID');
  }

  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    throw new AppError(400, 'Invalid subject ID');
  }

  // Verify student and subject exist
  const student = await Student.findById(studentId);
  if (!student) {
    throw new AppError(404, 'Student not found');
  }

  const subject = await Subject.findById(subjectId);
  if (!subject) {
    throw new AppError(404, 'Subject not found');
  }

  // Build match query
  const matchQuery = {
    studentId: new mongoose.Types.ObjectId(studentId),
    subjectId: new mongoose.Types.ObjectId(subjectId)
  };

  // Add date range if provided
  if (fromDate || toDate) {
    matchQuery.date = {};
    if (fromDate) {
      const normalizedFromDate = dateHelper.toMidnightUTC(fromDate);
      matchQuery.date.$gte = normalizedFromDate;
    }
    if (toDate) {
      const normalizedToDate = dateHelper.toMidnightUTC(toDate);
      matchQuery.date.$lte = normalizedToDate;
    }
  }

  // Get all records sorted by date
  const records = await Attendance.find(matchQuery)
    .sort({ date: 1 })
    .lean()
    .exec();

  // Build monthly chart data
  const monthlyData = {};
  records.forEach(record => {
    const monthKey = record.date.toISOString().substring(0, 7); // 'YYYY-MM'
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        month: monthKey,
        present: 0,
        absent: 0,
        late: 0,
        medicalLeave: 0,
        total: 0
      };
    }

    const month = monthlyData[monthKey];
    month.total += 1;

    if (record.status === 'P') month.present += 1;
    else if (record.status === 'A') month.absent += 1;
    else if (record.status === 'L') month.late += 1;
    else if (record.status === 'ML') month.medicalLeave += 1;
  });

  // Convert to array and calculate percentages
  const monthlyChart = Object.values(monthlyData).map(m => ({
    ...m,
    percentage: m.total > 0 ? attendanceCalc.calculatePercentage(m.present, m.late, m.total) : 0
  }));

  // Format flat records with isEditable flag
  const flatRecords = records.map(r => ({
    _id: r._id,
    date: dateHelper.toDateString(r.date),
    session: r.session,
    status: r.status,
    remarks: r.remarks,
    markedAt: r.markedAt,
    isEditable: dateHelper.isWithinEditWindow(r.markedAt, Number(process.env.MAX_EDIT_WINDOW_HOURS || 24))
  }));

  sendSuccess(res, 200, 'Student subject attendance details', {
    student: {
      id: studentId,
      name: student.name,
      rollNumber: student.rollNumber
    },
    subject: {
      id: subjectId,
      name: subject.name,
      code: subject.code
    },
    flatRecords,
    monthlyChart,
    totalRecords: records.length
  });
});

/**
 * Edit an attendance record
 * PATCH /api/attendance/:attendanceId
 * Body: { status, remarks?, reason? }
 */
exports.editAttendance = catchAsync(async (req, res) => {
  const { attendanceId } = req.params;
  const { status, remarks, reason } = req.body;

  // Find attendance record
  const attendance = await Attendance.findById(attendanceId);
  if (!attendance) {
    throw new AppError(404, 'Attendance record not found');
  }

  // Check if edit window is still open
  const maxEditHours = Number(process.env.MAX_EDIT_WINDOW_HOURS || 24);
  if (!dateHelper.isWithinEditWindow(attendance.markedAt, maxEditHours)) {
    throw new AppError(403, 'Edit window expired. Contact admin to modify this record');
  }

  // Permission check: only original faculty or admin can edit
  if (req.user.role === 'faculty' && attendance.facultyId.toString() !== req.user.profileId.toString()) {
    throw new AppError(403, 'You can only edit attendance you marked');
  }

  // Create snapshot of previous value
  const previousValue = attendance.toObject();

  // Update attendance record
  attendance.status = status;
  attendance.remarks = remarks || null;
  attendance.editedAt = new Date();
  attendance.editedBy = req.user._id;

  await attendance.save();

  try {
    await invalidateDepartmentStatsCache();
  } catch (cacheError) {
    console.warn('Failed to invalidate department stats cache:', cacheError.message);
  }

  // Log audit entry
  try {
    await AuditLog.logEdit({
      action: 'edit',
      performedBy: req.user,
      targetModel: 'Attendance',
      targetId: attendance._id,
      previousValue,
      newValue: attendance.toObject(),
      req,
      reason: reason || 'Status updated'
    });
  } catch (auditError) {
    console.error('Audit log failed:', auditError);
    // Don't throw - audit failure shouldn't block the main operation
  }

  const attendanceDate = dateHelper.toMidnightUTC(attendance.date);
  const today = dateHelper.toMidnightUTC(new Date());
  const shouldNotifyPreviousEdit = req.user.role === 'faculty' && attendanceDate.getTime() < today.getTime();

  if (shouldNotifyPreviousEdit) {
    const student = await Student.findById(attendance.studentId)
      .select('departmentId semester section')
      .lean();

    if (student?.departmentId) {
      const formattedDate = dateHelper.toDateString(attendanceDate);
      await createDepartmentNotification({
        title: 'Previous Attendance Updated',
        message: `Previous attendance updated for class ${Number(student.semester)}-${String(student.section || '').toUpperCase()} on ${formattedDate}.`,
        sentBy: req.user._id,
        departmentId: student.departmentId,
        semester: student.semester,
        section: student.section,
        recipientRoles: [
          'hod',
          ...(String(process.env.NOTIFICATION_INCLUDE_ADMIN_ON_ATTENDANCE_EDIT || 'false').toLowerCase() === 'true'
            ? ['admin']
            : []),
        ],
      });
    }
  }

  sendSuccess(res, 200, 'Attendance updated successfully', {
    attendance: {
      _id: attendance._id,
      studentId: attendance.studentId,
      subjectId: attendance.subjectId,
      date: dateHelper.toDateString(attendance.date),
      session: attendance.session,
      status: attendance.status,
      remarks: attendance.remarks,
      markedAt: attendance.markedAt,
      editedAt: attendance.editedAt
    }
  });
});

/**
 * Get audit history for an attendance record
 * GET /api/attendance/:attendanceId/history
 */
exports.getAttendanceHistory = catchAsync(async (req, res) => {
  const { attendanceId } = req.params;

  // Find attendance record
  const attendance = await Attendance.findById(attendanceId);
  if (!attendance) {
    throw new AppError(404, 'Attendance record not found');
  }

  // Get audit history
  const logs = await AuditLog.getHistory(attendanceId);

  sendSuccess(res, 200, 'Attendance audit history', {
    attendance: {
      _id: attendance._id,
      studentId: attendance.studentId,
      subjectId: attendance.subjectId,
      date: dateHelper.toDateString(attendance.date),
      session: attendance.session,
      status: attendance.status
    },
    auditLogs: logs
  });
});

/**
 * Admin/HOD: Edit attendance without edit window restriction
 * PATCH /api/attendance/:attendanceId/admin-edit
 * Body: { status, remarks, reason } — reason is REQUIRED
 */
exports.adminEditAttendance = catchAsync(async (req, res) => {
  const { attendanceId } = req.params;
  const { status, remarks, reason } = req.body;

  // Validate reason is provided for admin edits
  if (!reason || reason.trim() === '') {
    throw new AppError(400, 'Reason is required for admin edits');
  }

  // Find attendance record
  const attendance = await Attendance.findById(attendanceId);
  if (!attendance) {
    throw new AppError(404, 'Attendance record not found');
  }

  // Create snapshot of previous value
  const previousValue = attendance.toObject();

  // Update attendance record
  attendance.status = status;
  attendance.remarks = remarks || null;
  attendance.editedAt = new Date();
  attendance.editedBy = req.user._id;

  await attendance.save();

  try {
    await invalidateDepartmentStatsCache();
  } catch (cacheError) {
    console.warn('Failed to invalidate department stats cache:', cacheError.message);
  }

  // Log audit entry with mandatory reason
  try {
    await AuditLog.logEdit({
      action: 'edit',
      performedBy: req.user,
      targetModel: 'Attendance',
      targetId: attendance._id,
      previousValue,
      newValue: attendance.toObject(),
      req,
      reason
    });
  } catch (auditError) {
    console.error('Audit log failed:', auditError);
  }

  sendSuccess(res, 200, 'Attendance corrected by admin', {
    attendance: {
      _id: attendance._id,
      studentId: attendance.studentId,
      subjectId: attendance.subjectId,
      date: dateHelper.toDateString(attendance.date),
      session: attendance.session,
      status: attendance.status,
      remarks: attendance.remarks,
      editedAt: attendance.editedAt
    }
  });
});

/**
 * Get department-level attendance statistics
 * GET /api/attendance/admin/department-stats?departmentId=...&semester=...&fromDate=...&toDate=...
 */
exports.getDepartmentAttendanceStats = catchAsync(async (req, res) => {
  const { departmentId, semester, fromDate, toDate } = req.query;

  if (!departmentId) {
    throw new AppError(400, 'departmentId is required');
  }

  const threshold = Number(process.env.ATTENDANCE_THRESHOLD || 75);
  const cacheKey = buildDepartmentStatsCacheKey({
    departmentId,
    semester,
    fromDate,
    toDate,
    threshold,
  });

  const cachedStats = await reportDataService.getCachedReportData(cacheKey);
  if (cachedStats) {
    return sendSuccess(res, 200, 'Department attendance statistics', cachedStats);
  }

  // Build date filter
  const dateFilter = {};
  if (fromDate) {
    dateFilter.$gte = dateHelper.toMidnightUTC(fromDate);
  }
  if (toDate) {
    dateFilter.$lte = dateHelper.toMidnightUTC(toDate);
  }

  // Build aggregation pipeline
  const pipeline = [
    {
      $match: {
        departmentId: new mongoose.Types.ObjectId(departmentId),
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter })
      }
    },
    {
      $group: {
        _id: '$subjectId',
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'P'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'L'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'A'] }, 1, 0] } }
      }
    },
    {
      $lookup: {
        from: 'subjects',
        localField: '_id',
        foreignField: '_id',
        as: 'subjectDetails'
      }
    },
    {
      $unwind: '$subjectDetails'
    },
    {
      $project: {
        subjectName: '$subjectDetails.name',
        subjectCode: '$subjectDetails.code',
        total: 1,
        present: 1,
        late: 1,
        absent: 1
      }
    }
  ];

  const subjectStats = await Attendance.aggregate(pipeline);

  // Calculate per-subject percentages
  const enrichedStats = subjectStats.map(stat => {
    const percentage = attendanceCalc.calculatePercentage(stat.present, stat.late, stat.total);
    return {
      ...stat,
      percentage,
      belowThreshold: percentage < threshold ? 1 : 0
    };
  });

  // Calculate overall department average
  const totalClasses = enrichedStats.reduce((sum, s) => sum + s.total, 0);
  const totalPresent = enrichedStats.reduce((sum, s) => sum + s.present, 0);
  const totalLate = enrichedStats.reduce((sum, s) => sum + s.late, 0);
  const overallPercentage = totalClasses > 0 ? attendanceCalc.calculatePercentage(totalPresent, totalLate, totalClasses) : 0;

  // Count students below threshold
  const studentsBelowThreshold = enrichedStats.reduce((sum, s) => sum + s.belowThreshold, 0);

  // Get last 30 days trend
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

  const trendPipeline = [
    {
      $match: {
        departmentId: new mongoose.Types.ObjectId(departmentId),
        date: { $gte: thirtyDaysAgo }
      }
    },
    {
      $group: {
        _id: '$date',
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'P'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'L'] }, 1, 0] } }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ];

  const trendData = await Attendance.aggregate(trendPipeline);
  const trendMap = new Map(
    trendData.map((row) => [dateHelper.toDateString(row._id), row])
  );

  const trend = [];
  for (let i = 29; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = dateHelper.toDateString(date);
    const row = trendMap.get(key);
    const total = row?.total || 0;
    const present = row?.present || 0;
    const late = row?.late || 0;

    trend.push({
      date: key,
      attendanceRate: total > 0 ? attendanceCalc.calculatePercentage(present, late, total) : 0
    });
  }

  const responseData = {
    departmentId,
    subjectStats: enrichedStats,
    overall: {
      percentage: overallPercentage,
      totalClasses,
      totalPresent,
      totalLate
    },
    overallStats: {
      percentage: overallPercentage,
      totalClasses,
      totalPresent,
      totalLate
    },
    studentsBelowThreshold,
    trend,
    last30DaysTrend: trend
  };

  await reportDataService.setCachedReportData(cacheKey, responseData, ATTENDANCE_STATS_CACHE_TTL_SECONDS);
  await reportDataService.trackCacheKey(
    ATTENDANCE_STATS_CACHE_NAMESPACE,
    cacheKey,
    ATTENDANCE_STATS_CACHE_TTL_SECONDS
  );

  sendSuccess(res, 200, 'Department attendance statistics', responseData);
});

/**
 * Get detailed subject attendance report with per-student breakdown
 * GET /api/attendance/admin/subject-report/:subjectId?semester=...&section=...&fromDate=...&toDate=...
 */
exports.getSubjectDetailedReport = catchAsync(async (req, res) => {
  const { subjectId } = req.params;
  const { semester, section, fromDate, toDate } = req.query;

  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    throw new AppError(400, 'Invalid subject ID');
  }

  // Get subject info with faculty
  const subject = await Subject.findById(subjectId).populate('facultyId', 'name email');
  if (!subject) {
    throw new AppError(404, 'Subject not found');
  }

  // Build attendance query
  const attendanceQuery = {
    subjectId: new mongoose.Types.ObjectId(subjectId)
  };

  if (fromDate) {
    attendanceQuery.date = { $gte: dateHelper.toMidnightUTC(fromDate) };
  }

  if (toDate) {
    if (!attendanceQuery.date) attendanceQuery.date = {};
    attendanceQuery.date.$lte = dateHelper.toMidnightUTC(toDate);
  }

  // Get all attendance records for date columns
  const allRecords = await Attendance.find(attendanceQuery)
    .sort({ date: 1 })
    .lean()
    .exec();

  // Get unique dates (columns)
  const dateSet = new Set(allRecords.map(r => dateHelper.toDateString(r.date)));
  const dateColumns = Array.from(dateSet).sort();

  // Get students for this subject/semester/section
  const studentQuery = { departmentId: subject.departmentId };
  if (semester) studentQuery.semester = parseInt(semester);
  if (section) studentQuery.section = section;

  const students = await Student.find(studentQuery).lean().exec();
  const studentIds = students.map(s => s._id.toString());

  // Build per-student aggregation
  const pipeline = [
    {
      $match: {
        subjectId: new mongoose.Types.ObjectId(subjectId),
        studentId: { $in: studentIds.map(id => new mongoose.Types.ObjectId(id)) },
        ...(attendanceQuery.date && { date: attendanceQuery.date })
      }
    },
    {
      $group: {
        _id: '$studentId',
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'P'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'L'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'A'] }, 1, 0] } }
      }
    }
  ];

  const aggregatedStats = await Attendance.aggregate(pipeline);
  const statsMap = new Map();
  aggregatedStats.forEach(stat => {
    statsMap.set(stat._id.toString(), stat);
  });

  // Map records by date and studentId for grid
  const recordsMap = new Map();
  allRecords.forEach(record => {
    const key = `${record.studentId.toString()}-${dateHelper.toDateString(record.date)}`;
    recordsMap.set(key, record.status);
  });

  // Build student rows
  const studentRows = students
    .map(student => {
      const stats = statsMap.get(student._id.toString()) || {
        total: 0,
        present: 0,
        late: 0,
        absent: 0
      };

      const percentage = stats.total > 0 ? attendanceCalc.calculatePercentage(stats.present, stats.late, stats.total) : 0;
      const status = attendanceCalc.getAttendanceStatus(percentage);
      const classesNeeded = attendanceCalc.classesNeededFor75(stats.present, stats.late, stats.total);

      return {
        studentId: student._id,
        rollNumber: student.rollNumber,
        name: student.name,
        total: stats.total,
        present: stats.present,
        late: stats.late,
        absent: stats.absent,
        percentage,
        status,
        classesNeeded
      };
    })
    .sort((a, b) => a.percentage - b.percentage); // Worst first

  // Build 2D grid for attendance visualization
  const grid = studentRows.map((student) => {
    return dateColumns.map(date => {
      const key = `${student.studentId.toString()}-${date}`;
      return recordsMap.get(key) || '-';
    });
  });

  sendSuccess(res, 200, 'Subject detailed attendance report', {
    subjectInfo: {
      _id: subject._id,
      name: subject.name,
      code: subject.code,
      facultyName: subject.facultyId?.name || 'Unassigned'
    },
    dateColumns,
    studentRows,
    grid,
    summary: {
      totalStudents: studentRows.length,
      avgPercentage: studentRows.length > 0 ? (studentRows.reduce((sum, s) => sum + s.percentage, 0) / studentRows.length).toFixed(2) : 0
    }
  });
});

/**
 * Get list of students below attendance threshold (paginated)
 * GET /api/attendance/admin/low-attendance?subjectId=...&departmentId=...&semester=...&threshold=...&page=...&limit=...
 */
exports.getLowAttendanceStudents = catchAsync(async (req, res) => {
  const { subjectId, departmentId, semester, threshold, page = 1, limit = 20 } = req.query;

  const attendanceThreshold = threshold ? Number(threshold) : Number(process.env.ATTENDANCE_THRESHOLD || 75);
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  // Build aggregation pipeline
  const pipeline = [
    {
      $match: {
        ...(subjectId && mongoose.Types.ObjectId.isValid(subjectId) && { subjectId: new mongoose.Types.ObjectId(subjectId) }),
        ...(departmentId && mongoose.Types.ObjectId.isValid(departmentId) && { departmentId: new mongoose.Types.ObjectId(departmentId) })
      }
    },
    {
      $group: {
        _id: '$studentId',
        subjectId: { $first: '$subjectId' },
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'P'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'L'] }, 1, 0] } }
      }
    },
    {
      $project: {
        _id: 1,
        subjectId: 1,
        total: 1,
        present: 1,
        late: 1,
        percentage: {
          $round: [{ $multiply: [{ $divide: [{ $add: ['$present', { $multiply: ['$late', 0.5] }] }, '$total'] }, 100] }, 2]
        }
      }
    },
    {
      $match: {
        percentage: { $lt: attendanceThreshold }
      }
    },
    {
      $lookup: {
        from: 'students',
        localField: '_id',
        foreignField: '_id',
        as: 'studentDetails'
      }
    },
    {
      $unwind: '$studentDetails'
    },
    {
      $lookup: {
        from: 'subjects',
        localField: 'subjectId',
        foreignField: '_id',
        as: 'subjectDetails'
      }
    },
    {
      $unwind: { path: '$subjectDetails', preserveNullAndEmptyArrays: true }
    },
    {
      $project: {
        studentId: '$_id',
        rollNumber: '$studentDetails.rollNumber',
        name: '$studentDetails.name',
        email: '$studentDetails.email',
        phone: '$studentDetails.phone',
        guardianPhone: '$studentDetails.guardianPhone',
        subjectName: '$subjectDetails.name',
        subjectCode: '$subjectDetails.code',
        total: 1,
        present: 1,
        late: 1,
        percentage: 1
      }
    },
    {
      $sort: { percentage: 1 }
    }
  ];

  // Get total count
  const countPipeline = [...pipeline];
  countPipeline.push({ $count: 'total' });
  const countResult = await Attendance.aggregate(countPipeline);
  const total = countResult[0]?.total || 0;

  // Get paginated results
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limitNum });

  const students = await Attendance.aggregate(pipeline);

  sendPaginated(res, 200, 'Low attendance students', students, {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum)
  });
});
