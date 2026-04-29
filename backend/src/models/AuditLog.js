const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: ['mark', 'edit', 'bulk_mark', 'qr_mark']
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    performedByRole: {
      type: String,
      required: true
    },
    targetModel: {
      type: String,
      required: true,
      enum: ['Attendance', 'User']
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    previousValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String,
    reason: String,
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
      expires: 63072000 // Auto-delete after 1 year (TTL index)
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

// Add index on performedBy for user activity reports
auditLogSchema.index({ performedBy: 1 });

// Prevent updates and deletes on audit logs
auditLogSchema.pre('findOneAndUpdate', function(next) {
  next(new Error('Audit logs cannot be updated'));
});

auditLogSchema.pre('updateOne', function(next) {
  next(new Error('Audit logs cannot be updated'));
});

auditLogSchema.pre('updateMany', function(next) {
  next(new Error('Audit logs cannot be updated'));
});

auditLogSchema.pre('findOneAndDelete', function(next) {
  next(new Error('Audit logs cannot be deleted'));
});

auditLogSchema.pre('deleteOne', function(next) {
  next(new Error('Audit logs cannot be deleted'));
});

auditLogSchema.pre('deleteMany', function(next) {
  next(new Error('Audit logs cannot be deleted'));
});

// Override save to always set createdAt to now
auditLogSchema.pre('save', function() {
  this.createdAt = new Date();
});

/**
 * Create an audit log entry for an action
 * @param {Object} params - Parameters for audit log
 * @param {string} params.action - Action type (mark, edit, etc.)
 * @param {Object} params.performedBy - User document object
 * @param {string} params.targetModel - Model being audited ('Attendance')
 * @param {ObjectId} params.targetId - ID of the target document
 * @param {Object} params.previousValue - Previous document snapshot
 * @param {Object} params.newValue - New document snapshot
 * @param {Object} params.req - Express request object (for ipAddress and userAgent)
 * @param {string} [params.reason] - Optional reason for the action
 * @returns {Promise<Document>} Created AuditLog document
 */
auditLogSchema.statics.logEdit = async function(params) {
  const {
    action,
    performedBy,
    targetModel,
    targetId,
    previousValue,
    newValue,
    req,
    reason
  } = params;

  const ipAddress = req ? req.ip : undefined;
  const userAgent = req ? req.headers['user-agent'] : undefined;

  const auditLog = new this({
    action,
    performedBy: performedBy._id,
    performedByRole: performedBy.role,
    targetModel,
    targetId,
    previousValue,
    newValue,
    ipAddress,
    userAgent,
    reason
  });

  return await auditLog.save();
};

/**
 * Get audit history for a target document
 * @param {ObjectId} targetId - ID of the target document
 * @returns {Promise<Array>} Array of AuditLog documents sorted by createdAt descending, with populated performedBy
 */
auditLogSchema.statics.getHistory = async function(targetId) {
  return await this.find({ targetId })
    .populate('performedBy', 'name email')
    .sort({ createdAt: -1 })
    .lean()
    .exec();
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
