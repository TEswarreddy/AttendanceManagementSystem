const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeOptionalUsername = (value) => {
  const normalized = String(value || "").toLowerCase().trim();
  return normalized || undefined;
};

const DEFAULT_PERMISSIONS = {
  student: ["view_own_attendance", "view_timetable", "view_notifications", "apply_leave"],
  faculty: ["mark_attendance", "edit_attendance_windowed", "view_class_summary", "view_own_timetable"],
  class_teacher: [
    "mark_attendance",
    "edit_attendance_windowed",
    "view_class_summary",
    "view_own_timetable",
    "manage_students",
    "download_monthly_reports",
    "download_semester_reports",
    "view_leave_requests",
    "send_class_notices",
    "check_daily_attendance",
  ],
  time_table_coordinator: [
    "mark_attendance",
    "edit_attendance_windowed",
    "view_class_summary",
    "view_own_timetable",
    "create_timetable",
    "assign_faculty",
  ],
  attendance_coordinator: [
    "mark_attendance",
    "edit_attendance_windowed",
    "view_class_summary",
    "view_own_timetable",
    "view_department_attendance",
    "download_department_reports",
    "download_monthly_reports",
    "download_semester_reports",
    "view_attendance_threshold_lists",
  ],
  hod: [
    "mark_attendance",
    "edit_attendance_windowed",
    "view_class_summary",
    "view_own_timetable",
    "manage_students",
    "download_monthly_reports",
    "download_semester_reports",
    "view_leave_requests",
    "send_class_notices",
    "check_daily_attendance",
    "approve_edit_requests",
    "generate_dept_reports",
    "manage_academic_calendar",
    "audit_logs",
    "manage_faculty",
  ],
  admin: ["all"],
  principal: ["all"],
};

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: emailRegex,
    },
    username: {
      type: String,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      set: normalizeOptionalUsername,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["student", "faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator", "hod", "admin", "principal"],
      required: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      required: function requiredProfileId() {
        return this.role !== "admin" && this.role !== "principal";
      },
      refPath: "profileModel",
    },
    profileModel: {
      type: String,
      enum: ["Student", "Faculty"],
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
    },
    refreshTokens: {
      type: [String],
      default: [],
      validate: {
        validator(tokens) {
          return tokens.length <= 5;
        },
        message: "A user can store at most 5 refresh tokens.",
      },
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index(
  { username: 1 },
  { unique: true, partialFilterExpression: { username: { $type: "string", $gt: "" } } }
);

userSchema.virtual("password").set(function setPassword(password) {
  this._password = password;
});

userSchema.pre("save", async function hashPassword() {
  if (this._password) {
    this.passwordHash = await bcrypt.hash(this._password, 12);
    this.passwordChangedAt = new Date(Date.now() - 1000);
    this._password = undefined;
  }

  if (this.role === "admin" || this.role === "principal") {
    this.profileId = undefined;
    this.profileModel = null;
  }

  if (this.role === "student") {
    this.profileModel = "Student";
  }

  if (this.role === "faculty" || this.role === "class_teacher" || this.role === "time_table_coordinator" || this.role === "attendance_coordinator" || this.role === "hod") {
    this.profileModel = "Faculty";
  }

  if (this.isNew || this.isModified("role")) {
    this.permissions = this.constructor.getDefaultPermissions(this.role);
  }
});

userSchema.methods.comparePassword = async function comparePassword(plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.methods.changedPasswordAfter = function changedPasswordAfter(JWTTimestamp) {
  if (!this.passwordChangedAt) {
    return false;
  }

  const changedTimestamp = Math.floor(this.passwordChangedAt.getTime() / 1000);
  return JWTTimestamp < changedTimestamp;
};

userSchema.statics.findByEmail = function findByEmail(email) {
  return this.findOne({ email }).select("+passwordHash");
};

userSchema.statics.getDefaultPermissions = function getDefaultPermissions(role) {
  return [...(DEFAULT_PERMISSIONS[role] || [])];
};

module.exports = mongoose.model("User", userSchema);
