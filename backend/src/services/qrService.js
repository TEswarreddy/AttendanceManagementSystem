const mongoose = require('mongoose');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { QRSession, Attendance, Student, Timetable } = require('../models');
const jwtHelper = require('../utils/jwtHelper');
const dateHelper = require('../utils/dateHelper');
const { AppError } = require('../utils/AppError');
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const isOverlappingPeriods = (left, right) => left.some((period) => right.includes(period));

/**
 * Generate a new QR session for attendance marking
 * @param {ObjectId} facultyId - Faculty ID
 * @param {ObjectId} subjectId - Subject ID
 * @param {number} periodNumber - Selected period number
 * @param {string} date - Date string ('YYYY-MM-DD')
 * @returns {Promise<Object>} { sessionId, qrBase64, expiresAt, token }
 * @throws {AppError} If validation fails or session already exists
 */
async function generateQRSession(facultyId, subjectId, periodNumber, date) {
  // Validate faculty is assigned to this subject
  const isAssigned = await Timetable.validateAssignment(facultyId, subjectId);
  if (!isAssigned) {
    throw new AppError(403, 'You are not assigned to this subject');
  }

  // Normalize date
  let normalizedDate;
  try {
    normalizedDate = dateHelper.toMidnightUTC(date);
  } catch (error) {
    throw new AppError(400, error.message || 'Invalid date format');
  }

  const selectedPeriod = Number(periodNumber);
  if (!Number.isInteger(selectedPeriod) || selectedPeriod < 1 || selectedPeriod > 8) {
    throw new AppError(400, 'A valid period number is required');
  }

  const dayName = DAYS[new Date(normalizedDate).getUTCDay()];
  if (!dayName || dayName === 'Sunday') {
    throw new AppError(400, 'QR attendance is not available for Sunday');
  }

  const timetableRows = await Timetable.find({
    facultyId,
    subjectId,
    isActive: true,
  })
    .select('departmentId semester section schedule')
    .lean();

  const matchingSlots = timetableRows.flatMap((row) =>
    (row.schedule || [])
      .filter((slot) => slot.day === dayName && Number(slot.periodNumber) === selectedPeriod)
      .map((slot) => ({ row, slot }))
  );

  if (!matchingSlots.length) {
    throw new AppError(400, `No timetable slot found for period ${selectedPeriod} on ${dayName}`);
  }

  const { row: selectedRow, slot: selectedSlot } = matchingSlots[0];

  const classDaySlots = (selectedRow.schedule || [])
    .filter((slot) => slot.day === dayName)
    .sort((left, right) => Number(left.periodNumber || 0) - Number(right.periodNumber || 0));

  let periodNumbers = [selectedPeriod];
  let isLabSession = Boolean(selectedSlot.isLab);
  const labGroupId = selectedSlot.labGroupId || null;

  if (isLabSession) {
    const currentIndex = classDaySlots.findIndex((slot) => Number(slot.periodNumber) === selectedPeriod);
    const combinedPeriods = [selectedPeriod];

    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const slot = classDaySlots[index];
      const previousPeriod = combinedPeriods[0];
      const sameGroup = labGroupId ? slot.labGroupId === labGroupId : Boolean(slot.isLab);
      if (!sameGroup || Number(slot.periodNumber) !== previousPeriod - 1) break;
      combinedPeriods.unshift(Number(slot.periodNumber));
    }

    for (let index = currentIndex + 1; index < classDaySlots.length; index += 1) {
      const slot = classDaySlots[index];
      const previousPeriod = combinedPeriods[combinedPeriods.length - 1];
      const sameGroup = labGroupId ? slot.labGroupId === labGroupId : Boolean(slot.isLab);
      if (!sameGroup || Number(slot.periodNumber) !== previousPeriod + 1) break;
      combinedPeriods.push(Number(slot.periodNumber));
    }

    periodNumbers = [...new Set(combinedPeriods)];
  }

  // Check if active session already exists for this class and overlapping periods
  const activeSessions = await QRSession.find({
    facultyId,
    subjectId,
    departmentId: selectedRow.departmentId,
    semester: selectedRow.semester,
    section: selectedRow.section,
    date: normalizedDate,
    isActive: true,
    expiresAt: { $gt: new Date() },
  })
    .select('periodNumbers')
    .lean();

  const hasOverlap = activeSessions.some((sessionDoc) =>
    isOverlappingPeriods(sessionDoc.periodNumbers || [], periodNumbers)
  );
  if (hasOverlap) {
    throw new AppError(409, 'Active QR session already exists for this period/class. Close it first.');
  }

  const sessionId = uuidv4();
  const token = jwt.sign(
    {
      sessionId,
      subjectId: subjectId.toString(),
      facultyId: facultyId.toString(),
      date: normalizedDate.toISOString(),
      periodNumbers,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  // Create QR session in database
  const qrSession = await QRSession.createSession({
    sessionId,
    facultyId,
    subjectId,
    departmentId: selectedRow.departmentId,
    semester: selectedRow.semester,
    section: selectedRow.section,
    date: normalizedDate,
    periodNumbers,
    isLabSession,
    labGroupId,
    token
  });

  // Generate QR code as base64 data URL
  const qrBase64 = await QRCode.toDataURL(token, {
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });

  return {
    sessionId: qrSession.sessionId,
    qrBase64,
    expiresAt: qrSession.expiresAt,
    token,
    createdAt: qrSession.createdAt,
    periodNumbers: qrSession.periodNumbers,
    isLabSession: qrSession.isLabSession,
  };
}

/**
 * Validate QR scan and mark attendance
 * @param {Object} studentToken - Student's decoded JWT from auth middleware (has profileId)
 * @param {string} scannedToken - QR payload (JWT) scanned by student
 * @returns {Promise<Object>} { success: true, message, studentName, subjectName }
 * @throws {AppError} If validation or marking fails
 */
async function validateAndMarkQRScan(studentToken, scannedToken) {
  // Decode and verify scanned QR token
  let decodedQR;
  try {
    decodedQR = jwtHelper.verifyAccessToken(scannedToken);
  } catch (error) {
    throw new AppError(401, 'QR code expired or invalid');
  }

  // Find the QR session
  const qrSession = await QRSession.findActiveSession(decodedQR.sessionId);
  if (!qrSession) {
    throw new AppError(404, 'QR session not found or expired');
  }

  // Verify subject ID matches (tamper check)
  if (decodedQR.subjectId !== qrSession.subjectId.toString()) {
    throw new AppError(403, 'QR code subject mismatch');
  }

  // Get student ID from auth token
  const studentId = studentToken.profileId;

  // Verify student is enrolled in this class
  const enrolledStudents = await Timetable.getClassStudents(
    qrSession.subjectId,
    qrSession.semester,
    qrSession.section,
    qrSession.departmentId
  );

  const isEnrolled = enrolledStudents.some(s => s._id.equals(studentId));
  if (!isEnrolled) {
    throw new AppError(403, 'You are not enrolled in this class');
  }

  // Check for duplicate scan
  const alreadyScanned = qrSession.scannedStudents.some(s => s.studentId.equals(studentId));
  if (alreadyScanned) {
    throw new AppError(409, 'Attendance already marked for this session');
  }

  // Get student and subject info for response
  const student = await Student.findById(studentId);
  const Subject = require('../models').Subject;
  const subject = await Subject.findById(qrSession.subjectId);

  // MongoDB transaction for atomic operation
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Add student to scanned list
      await QRSession.addScannedStudent(qrSession.sessionId, studentId);

      // Upsert attendance record
      const operations = (qrSession.periodNumbers || []).map((periodNumber) => ({
        updateOne: {
          filter: {
            studentId,
            subjectId: qrSession.subjectId,
            date: qrSession.date,
            periodNumber,
          },
          update: {
            $set: {
              status: 'P',
              facultyId: qrSession.facultyId,
              departmentId: qrSession.departmentId,
              qrSessionId: qrSession.sessionId,
              markedAt: new Date(),
              periodLabel: `Period ${periodNumber}`,
              subjectType: qrSession.isLabSession ? 'lab' : 'theory',
              isLabSession: Boolean(qrSession.isLabSession),
              labGroup: qrSession.labGroupId || null,
            },
            $setOnInsert: {
              remarks: null,
            },
          },
          upsert: true,
        },
      }));

      if (operations.length) {
        await Attendance.bulkWrite(operations, { session });
      }
    });
  } finally {
    await session.endSession();
  }

  return {
    success: true,
    message: 'Attendance marked via QR',
    studentName: student?.name || 'Unknown',
    subjectName: subject?.name || 'Unknown',
    markedAt: new Date()
  };
}

/**
 * Close an active QR session and get final scanned list
 * @param {string} sessionId - QR session ID
 * @param {ObjectId} facultyId - Faculty ID (for authorization)
 * @returns {Promise<Object>} { sessionId, scannedCount, scannedStudents, closedAt }
 * @throws {AppError} If session not found or faculty mismatch
 */
async function closeQRSession(sessionId, facultyId) {
  // Find the session
  const qrSession = await QRSession.findOne({ sessionId });
  if (!qrSession) {
    throw new AppError(404, 'QR session not found');
  }

  // Verify faculty owns this session
  if (qrSession.facultyId.toString() !== facultyId.toString()) {
    throw new AppError(403, 'You can only close sessions you created');
  }

  // Close the session
  const closedSession = await QRSession.closeSession(sessionId);

  // Get scanned students with details
  const scannedList = await QRSession.getScannedList(sessionId);

  return {
    sessionId: closedSession.sessionId,
    scannedCount: closedSession.scannedStudents.length,
    scannedStudents: scannedList,
    closedAt: closedSession.closedAt,
    totalExpected: scannedList.length // In a full implementation, get from enrollment
  };
}

/**
 * Get current status of a QR session
 * @param {string} sessionId - QR session ID
 * @returns {Promise<Object>} { isActive, scannedCount, expiresAt, scannedStudents }
 * @throws {AppError} If session not found
 */
async function getQRSessionStatus(sessionId) {
  // Find the session
  const qrSession = await QRSession.findOne({ sessionId })
    .populate({
      path: 'scannedStudents.studentId',
      select: 'name rollNumber section'
    })
    .lean()
    .exec();

  if (!qrSession) {
    throw new AppError(404, 'QR session not found');
  }

  // Format scanned students
  const scannedStudents = qrSession.scannedStudents.map(item => ({
    studentId: item.studentId._id,
    name: item.studentId.name,
    rollNumber: item.studentId.rollNumber,
    section: item.studentId.section,
    scannedAt: item.scannedAt
  }));

  return {
    sessionId: qrSession.sessionId,
    isActive: qrSession.isActive,
    scannedCount: qrSession.scannedStudents.length,
    expiresAt: qrSession.expiresAt,
    createdAt: qrSession.createdAt,
    closedAt: qrSession.closedAt,
    scannedStudents,
    subjectId: qrSession.subjectId,
    date: dateHelper.toDateString(qrSession.date),
    periodNumbers: qrSession.periodNumbers,
    isLabSession: qrSession.isLabSession
  };
}

module.exports = {
  generateQRSession,
  validateAndMarkQRScan,
  closeQRSession,
  getQRSessionStatus
};
