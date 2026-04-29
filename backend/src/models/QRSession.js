const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const qrSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: uuidv4
    },
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true
    },
    semester: {
      type: Number,
      required: true
    },
    section: {
      type: String,
      required: true,
      uppercase: true
    },
    date: {
      type: Date,
      required: true,
      index: true
    },
    periodNumbers: [
      {
        type: Number,
        min: 1,
        max: 8,
        required: true,
      },
    ],
    isLabSession: {
      type: Boolean,
      default: false,
    },
    labGroupId: {
      type: String,
      trim: true,
      default: null,
    },
    token: {
      type: String,
      required: true
    },
    scannedStudents: [
      {
        studentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Student',
          required: true
        },
        scannedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true
    },
    closedAt: Date
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// TTL index: auto-delete document when expiresAt is reached
qrSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for one active session per class
qrSessionSchema.index(
  { facultyId: 1, subjectId: 1, date: 1 },
  { unique: false }
);

/**
 * Create a new QR session for attendance marking
 * @param {Object} params - Parameters for session creation
 * @param {ObjectId} params.facultyId - Faculty ID
 * @param {ObjectId} params.subjectId - Subject ID
 * @param {ObjectId} params.departmentId - Department ID
 * @param {number} params.semester - Semester number
 * @param {string} params.section - Section name (will be converted to uppercase)
 * @param {Date} params.date - Class date (midnight UTC)
 * @param {number[]} params.periodNumbers - Period numbers covered by this QR session
 * @param {string} params.token - Signed JWT token for QR payload
 * @returns {Promise<Document>} Created QRSession document
 */
qrSessionSchema.statics.createSession = async function(params) {
  const {
    sessionId,
    facultyId,
    subjectId,
    departmentId,
    semester,
    section,
    date,
    periodNumbers,
    isLabSession,
    labGroupId,
    token
  } = params;

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

  const qrSession = new this({
    sessionId: sessionId || uuidv4(),
    facultyId,
    subjectId,
    departmentId,
    semester,
    section: section.toUpperCase(),
    date,
    periodNumbers,
    isLabSession: Boolean(isLabSession),
    labGroupId: labGroupId || null,
    token,
    expiresAt
  });

  return await qrSession.save();
};

/**
 * Find an active and non-expired QR session
 * @param {string} sessionId - Session ID (UUID)
 * @returns {Promise<Document|null>} Active QRSession or null if not found/expired/inactive
 */
qrSessionSchema.statics.findActiveSession = async function(sessionId) {
  return await this.findOne({
    sessionId,
    isActive: true,
    expiresAt: { $gt: new Date() }
  }).lean().exec();
};

/**
 * Add a scanned student to the session (atomic operation with duplicate check)
 * @param {string} sessionId - Session ID
 * @param {ObjectId} studentId - Student ID
 * @returns {Promise<Document>} Updated QRSession document
 */
qrSessionSchema.statics.addScannedStudent = async function(sessionId, studentId) {
  // Check if student already scanned
  const existingSession = await this.findOne({
    sessionId,
    'scannedStudents.studentId': studentId
  });

  if (existingSession) {
    // Student already scanned, return existing session
    return existingSession;
  }

  // Add student to scanned list
  return await this.findOneAndUpdate(
    { sessionId },
    {
      $push: {
        scannedStudents: {
          studentId,
          scannedAt: new Date()
        }
      }
    },
    { new: true }
  ).exec();
};

/**
 * Close an active QR session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Document>} Updated QRSession document
 */
qrSessionSchema.statics.closeSession = async function(sessionId) {
  return await this.findOneAndUpdate(
    { sessionId },
    {
      isActive: false,
      closedAt: new Date()
    },
    { new: true }
  ).exec();
};

/**
 * Get list of students who scanned attendance in this session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Array>} Array of scanned students with name and rollNumber populated
 */
qrSessionSchema.statics.getScannedList = async function(sessionId) {
  const session = await this.findOne({ sessionId })
    .populate({
      path: 'scannedStudents.studentId',
      select: 'name rollNumber section'
    })
    .lean()
    .exec();

  if (!session) {
    return [];
  }

  return session.scannedStudents.map(item => ({
    studentId: item.studentId._id,
    name: item.studentId.name,
    rollNumber: item.studentId.rollNumber,
    section: item.studentId.section,
    scannedAt: item.scannedAt
  }));
};

const QRSession = mongoose.model('QRSession', qrSessionSchema);

module.exports = QRSession;
