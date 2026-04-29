const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

const models = require("../models");
const {
  Department,
  User,
  Faculty,
  Student,
  Subject,
  Period,
  Timetable,
  Attendance,
  QRSession,
  AuditLog,
  EditApprovalRequest,
  Notice,
  ShortageList,
  EligibilityReport,
} = models;

const emailService = require("../services/emailService");
const excelService = require("../services/excelService");
const pdfService = require("../services/pdfService");
const qrService = require("../services/qrService");
const smsService = require("../services/smsService");
const smsAlertService = require("../services/smsAlertService");
const { createDepartmentNotification } = require("../services/departmentNotificationService");

const { catchAsync, AppError } = require("../utils/AppError");
const { sendSuccess, sendPaginated } = require("../utils/responseHelper");
const dateHelper = require("../utils/dateHelper");
const attendanceCalc = require("../utils/attendanceCalc");

let semesterReportService = null;
try {
  semesterReportService = require("../services/semesterReportService");
} catch {
  semesterReportService = null;
}

void Period;
void QRSession;
void Notice;
void ShortageList;
void qrService;
void smsAlertService;

const systemConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "system_configs",
  }
);

systemConfigSchema.index({ key: 1, departmentId: 1 }, { unique: true });

const academicYearSchema = new mongoose.Schema(
  {
    year: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    semesters: {
      type: [
        {
          semesterNumber: {
            type: Number,
            required: true,
            min: 1,
            max: 8,
          },
          startDate: {
            type: Date,
            required: true,
          },
          endDate: {
            type: Date,
            required: true,
          },
          isActive: {
            type: Boolean,
            default: false,
          },
        },
      ],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "academic_years",
  }
);

const SystemConfig =
  mongoose.models.SystemConfig || mongoose.model("SystemConfig", systemConfigSchema);
const AcademicYear =
  mongoose.models.AcademicYear || mongoose.model("AcademicYear", academicYearSchema);

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const parsePagination = (query) => {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(100, toPositiveInt(query.limit, 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const streamBuffer = (res, buffer, filename, mimeType) => {
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  return res.send(buffer);
};

const getThresholdValue = async (departmentId = null) => {
  if (departmentId) {
    const deptOverride = await SystemConfig.findOne({
      key: "attendance_threshold",
      departmentId,
    })
      .select("value")
      .lean();

    if (deptOverride && Number.isFinite(Number(deptOverride.value))) {
      return Number(deptOverride.value);
    }
  }

  const globalConfig = await SystemConfig.findOne({
    key: "attendance_threshold",
    departmentId: null,
  })
    .select("value")
    .lean();

  if (globalConfig && Number.isFinite(Number(globalConfig.value))) {
    return Number(globalConfig.value);
  }

  return Number(process.env.ATTENDANCE_THRESHOLD || 75);
};

const getDepartments = catchAsync(async (req, res) => {
  const departments = await Department.find({})
    .sort({ name: 1 })
    .populate({ path: "hodId", select: "_id name employeeId designation departmentId" })
    .lean();

  return sendSuccess(res, 200, "Departments fetched", { departments });
});

const createDepartment = catchAsync(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const code = String(req.body.code || "").trim().toUpperCase();
  const totalSemesters = Number(req.body.totalSemesters);

  if (!name) {
    throw new AppError(400, "Department name is required");
  }

  if (!code) {
    throw new AppError(400, "Department code is required");
  }

  if (!Number.isInteger(totalSemesters) || totalSemesters < 1 || totalSemesters > 8) {
    throw new AppError(400, "totalSemesters must be a whole number between 1 and 8");
  }

  const existingDepartment = await Department.findOne({
    $or: [{ name }, { code }],
  }).lean();

  if (existingDepartment) {
    throw new AppError(409, "Department name or code already exists");
  }

  const department = await Department.create({
    name,
    code,
    totalSemesters,
    isActive: true,
  });

  return sendSuccess(res, 201, "Department created", { department });
});

const updateDepartment = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new AppError(400, "Valid department id is required");
  }

  const department = await Department.findById(id);
  if (!department) {
    throw new AppError(404, "Department not found");
  }

  if (req.body.name !== undefined) {
    const nextName = String(req.body.name).trim();
    if (!nextName) {
      throw new AppError(400, "Department name cannot be empty");
    }

    const nameExists = await Department.findOne({ name: nextName, _id: { $ne: department._id } })
      .select("_id")
      .lean();
    if (nameExists) {
      throw new AppError(409, "Department name already exists");
    }

    department.name = nextName;
  }

  if (req.body.code !== undefined) {
    const nextCode = String(req.body.code).trim().toUpperCase();
    if (!nextCode) {
      throw new AppError(400, "Department code cannot be empty");
    }

    const codeExists = await Department.findOne({ code: nextCode, _id: { $ne: department._id } })
      .select("_id")
      .lean();
    if (codeExists) {
      throw new AppError(409, "Department code already exists");
    }

    department.code = nextCode;
  }

  if (req.body.totalSemesters !== undefined) {
    const totalSemesters = Number(req.body.totalSemesters);
    if (!Number.isInteger(totalSemesters) || totalSemesters < 1 || totalSemesters > 8) {
      throw new AppError(400, "totalSemesters must be a whole number between 1 and 8");
    }
    department.totalSemesters = totalSemesters;
  }

  if (req.body.isActive !== undefined) {
    department.isActive = Boolean(req.body.isActive);
  }

  await department.save();

  return sendSuccess(res, 200, "Department updated", { department });
});

const deactivateDepartment = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new AppError(400, "Valid department id is required");
  }

  const department = await Department.findById(id);
  if (!department) {
    throw new AppError(404, "Department not found");
  }

  department.isActive = false;
  await department.save();

  return sendSuccess(res, 200, "Department deactivated", { departmentId: department._id });
});

const resolveHodDepartmentId = async (req) => {
  if (req.user?.role !== "hod") {
    return null;
  }

  if (req.user?.departmentId && mongoose.Types.ObjectId.isValid(String(req.user.departmentId))) {
    return new mongoose.Types.ObjectId(String(req.user.departmentId));
  }

  if (req.user?.profileId && mongoose.Types.ObjectId.isValid(String(req.user.profileId))) {
    const faculty = await Faculty.findById(req.user.profileId).select("departmentId").lean();
    if (faculty?.departmentId) {
      return new mongoose.Types.ObjectId(String(faculty.departmentId));
    }
  }

  throw new AppError(403, "HOD department context not found");
};

const getStudents = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const query = {
    isActive: req.query.includeInactive === "true" ? { $in: [true, false] } : true,
  };

  if (req.query.departmentId && mongoose.Types.ObjectId.isValid(String(req.query.departmentId))) {
    query.departmentId = new mongoose.Types.ObjectId(String(req.query.departmentId));
  }

  if (req.user?.role === "hod") {
    query.departmentId = await resolveHodDepartmentId(req);
  }

  if (req.query.semester !== undefined && req.query.semester !== "") {
    query.semester = Number(req.query.semester);
  }

  if (req.query.section) {
    query.section = String(req.query.section).toUpperCase();
  }

  if (req.query.search) {
    const regex = new RegExp(String(req.query.search), "i");
    query.$or = [{ name: regex }, { rollNumber: regex }, { email: regex }];
  }

  const [total, students] = await Promise.all([
    Student.countDocuments(query),
    Student.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return sendPaginated(res, 200, "Students fetched", students, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

const createStudent = catchAsync(async (req, res) => {
  const {
    name,
    rollNumber,
    email,
    phone,
    guardianPhone,
    semester,
    section,
    batch,
    departmentId,
  } = req.body;

  if (!name || !rollNumber || !email || !semester || !section || !batch) {
    throw new AppError(400, "name, rollNumber, email, semester, section and batch are required");
  }

  const forcedHodDepartment = await resolveHodDepartmentId(req);
  const resolvedDepartmentId = forcedHodDepartment || departmentId;

  if (!resolvedDepartmentId || !mongoose.Types.ObjectId.isValid(String(resolvedDepartmentId))) {
    throw new AppError(400, "Valid departmentId is required");
  }

  const [existingStudent, existingUser] = await Promise.all([
    Student.findOne({
      $or: [
        { rollNumber: String(rollNumber).toUpperCase().trim() },
        { email: String(email).toLowerCase().trim() },
      ],
    })
      .select("_id")
      .lean(),
    User.findOne({ email: String(email).toLowerCase().trim() }).select("_id").lean(),
  ]);

  if (existingStudent) {
    throw new AppError(409, "Student with this rollNumber or email already exists");
  }

  if (existingUser) {
    throw new AppError(409, "User with this email already exists");
  }

  const student = await Student.create({
    name: String(name).trim(),
    rollNumber: String(rollNumber).toUpperCase().trim(),
    email: String(email).toLowerCase().trim(),
    phone: phone || null,
    guardianPhone: guardianPhone || null,
    semester: Number(semester),
    section: String(section).toUpperCase().trim(),
    batch: String(batch).trim(),
    departmentId: resolvedDepartmentId,
    isActive: true,
  });

  const temporaryPassword = `${String(rollNumber).slice(-4)}@123`;

  const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

  await User.create({
    email: student.email,
    passwordHash: hashedPassword,
    role: "student",
    profileId: student._id,
    profileModel: "Student",
    isActive: true,
  });

  const emailResult = await emailService.sendEmail({
    to: student.email,
    subject: "Student Account Created - Attendance Management System",
    text: `Welcome ${student.name}. Your student account has been created. Login email: ${student.email}. Temporary password: ${temporaryPassword}`,
    html: `<p>Welcome ${student.name},</p><p>Your student account has been created.</p><p>Email: <strong>${student.email}</strong><br/>Temporary Password: <strong>${temporaryPassword}</strong></p><p>Please change your password after first login.</p>`,
  });

  return sendSuccess(res, 201, "Student created", {
    student,
    temporaryPassword,
  });
});

const normalizeHeader = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_-]/g, "");

const bulkCreateStudents = catchAsync(async (req, res) => {
  if (!req.file?.buffer) {
    throw new AppError(400, "Excel file is required");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(req.file.buffer);
  const sheet = workbook.worksheets[0];

  if (!sheet || sheet.rowCount < 2) {
    throw new AppError(400, "Uploaded Excel file is empty");
  }

  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = normalizeHeader(cell.value);
  });

  const requiredHeaders = ["name", "email", "rollnumber", "semester", "section", "batch"];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new AppError(
      400,
      `Missing required columns: ${missingHeaders.join(", ")}. Required columns are name, email, rollNumber, semester, section, batch`
    );
  }

  const rowToObject = (row) => {
    const obj = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (key) obj[key] = cell.value;
    });
    return obj;
  };

  const parseCellText = (value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "object" && value?.text) return String(value.text).trim();
    return String(value).trim();
  };

  const forcedHodDepartment = await resolveHodDepartmentId(req);
  const defaultDepartmentId = req.body?.departmentId;

  const deptLookup = await Department.find({ isActive: true }).select("_id name code").lean();
  const deptByCode = new Map(deptLookup.map((d) => [String(d.code || "").toUpperCase(), d]));
  const deptByName = new Map(deptLookup.map((d) => [String(d.name || "").toLowerCase(), d]));

  const seenRollNumbers = new Set();
  const seenEmails = new Set();
  const failedRows = [];
  const createdRows = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const rowData = rowToObject(row);

    const name = parseCellText(rowData.name);
    const email = parseCellText(rowData.email).toLowerCase();
    const rollNumber = parseCellText(rowData.rollnumber).toUpperCase();
    const phone = parseCellText(rowData.phone) || null;
    const guardianPhone = parseCellText(rowData.guardianphone) || null;
    const semester = Number(parseCellText(rowData.semester));
    const section = parseCellText(rowData.section).toUpperCase();
    const batch = parseCellText(rowData.batch);
    const departmentIdFromRow = parseCellText(rowData.departmentid);
    const departmentCodeFromRow = parseCellText(rowData.departmentcode).toUpperCase();
    const departmentNameFromRow = parseCellText(rowData.departmentname).toLowerCase();

    try {
      if (!name || !email || !rollNumber || !semester || !section || !batch) {
        throw new Error("Missing required fields");
      }

      let resolvedDepartmentId = forcedHodDepartment || null;
      if (!resolvedDepartmentId) {
        if (departmentIdFromRow && mongoose.Types.ObjectId.isValid(departmentIdFromRow)) {
          resolvedDepartmentId = departmentIdFromRow;
        } else if (departmentCodeFromRow && deptByCode.has(departmentCodeFromRow)) {
          resolvedDepartmentId = deptByCode.get(departmentCodeFromRow)._id;
        } else if (departmentNameFromRow && deptByName.has(departmentNameFromRow)) {
          resolvedDepartmentId = deptByName.get(departmentNameFromRow)._id;
        } else if (defaultDepartmentId && mongoose.Types.ObjectId.isValid(String(defaultDepartmentId))) {
          resolvedDepartmentId = defaultDepartmentId;
        }
      }

      if (!resolvedDepartmentId || !mongoose.Types.ObjectId.isValid(String(resolvedDepartmentId))) {
        throw new Error("Valid departmentId not found for row");
      }

      if (seenRollNumbers.has(rollNumber) || seenEmails.has(email)) {
        throw new Error("Duplicate rollNumber or email inside uploaded file");
      }

      const [existingStudent, existingUser] = await Promise.all([
        Student.findOne({ $or: [{ rollNumber }, { email }] }).select("_id").lean(),
        User.findOne({ email }).select("_id").lean(),
      ]);

      if (existingStudent) {
        throw new Error("Student with this rollNumber or email already exists");
      }

      if (existingUser) {
        throw new Error("User with this email already exists");
      }

      const student = await Student.create({
        name,
        rollNumber,
        email,
        phone,
        guardianPhone,
        semester: Number(semester),
        section,
        batch,
        departmentId: resolvedDepartmentId,
        isActive: true,
      });

      const temporaryPassword = `${String(rollNumber).slice(-4)}@123`;
      const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

      await User.create({
        email: student.email,
        passwordHash: hashedPassword,
        role: "student",
        profileId: student._id,
        profileModel: "Student",
        isActive: true,
      });

      seenRollNumbers.add(rollNumber);
      seenEmails.add(email);
      createdRows.push({
        rowNumber,
        studentId: student._id,
        name: student.name,
        email: student.email,
        rollNumber: student.rollNumber,
        temporaryPassword,
      });
    } catch (error) {
      failedRows.push({
        rowNumber,
        rollNumber: rollNumber || "-",
        email: email || "-",
        reason: error.message || "Unknown error",
      });
    }
  }

  return sendSuccess(res, 201, "Bulk student import completed", {
    summary: {
      totalRows: Math.max(0, sheet.rowCount - 1),
      createdCount: createdRows.length,
      failedCount: failedRows.length,
    },
    createdStudents: createdRows,
    failedRows,
  });
});

const updateStudent = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new AppError(400, "Valid student id is required");
  }

  const student = await Student.findById(id);
  if (!student) {
    throw new AppError(404, "Student not found");
  }

  if (req.user?.role === "hod") {
    const hodDepartmentId = await resolveHodDepartmentId(req);
    if (String(student.departmentId) !== String(hodDepartmentId)) {
      throw new AppError(403, "You can only update students in your department");
    }
  }

  const updatable = ["name", "email", "phone", "guardianPhone", "semester", "section", "batch", "isActive"];
  for (const field of updatable) {
    if (req.body[field] !== undefined) {
      if (field === "email") {
        student[field] = String(req.body[field]).toLowerCase().trim();
      } else if (field === "section") {
        student[field] = String(req.body[field]).toUpperCase().trim();
      } else {
        student[field] = req.body[field];
      }
    }
  }

  await student.save();

  if (req.body.email !== undefined) {
    await User.findOneAndUpdate(
      { profileId: student._id, profileModel: "Student" },
      { $set: { email: student.email } }
    );
  }

  return sendSuccess(res, 200, "Student updated", { student });
});

const deactivateStudent = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new AppError(400, "Valid student id is required");
  }

  const student = await Student.findById(id);
  if (!student) {
    throw new AppError(404, "Student not found");
  }

  if (req.user?.role === "hod") {
    const hodDepartmentId = await resolveHodDepartmentId(req);
    if (String(student.departmentId) !== String(hodDepartmentId)) {
      throw new AppError(403, "You can only deactivate students in your department");
    }
  }

  student.isActive = false;
  await student.save();

  await User.findOneAndUpdate(
    { profileId: student._id, profileModel: "Student" },
    { $set: { isActive: false } }
  );

  return sendSuccess(res, 200, "Student deactivated", { studentId: student._id });
});

const getSubjects = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const query = {
    isActive: req.query.includeInactive === "true" ? { $in: [true, false] } : true,
  };

  if (req.query.departmentId && mongoose.Types.ObjectId.isValid(String(req.query.departmentId))) {
    query.departmentId = new mongoose.Types.ObjectId(String(req.query.departmentId));
  }

  if (req.user?.role === "hod") {
    query.departmentId = await resolveHodDepartmentId(req);
  }

  if (req.query.semester !== undefined && req.query.semester !== "") {
    query.semester = Number(req.query.semester);
  }

  if (req.query.search) {
    const regex = new RegExp(String(req.query.search), "i");
    query.$or = [{ name: regex }, { subjectCode: regex }];
  }

  const [total, subjects] = await Promise.all([
    Subject.countDocuments(query),
    Subject.find(query)
      .populate({ path: "departmentId", select: "name code" })
      .sort({ semester: 1, name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return sendPaginated(res, 200, "Subjects fetched", subjects, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

const createSubject = catchAsync(async (req, res) => {
  const { subjectCode, name, departmentId, semester, credits, type } = req.body;

  if (!subjectCode || !name || !semester || !credits) {
    throw new AppError(400, "subjectCode, name, semester and credits are required");
  }

  const forcedHodDepartment = await resolveHodDepartmentId(req);
  const resolvedDepartmentId = forcedHodDepartment || departmentId;

  if (!resolvedDepartmentId || !mongoose.Types.ObjectId.isValid(String(resolvedDepartmentId))) {
    throw new AppError(400, "Valid departmentId is required");
  }

  const existingSubject = await Subject.findOne({
    subjectCode: String(subjectCode).toUpperCase().trim(),
  })
    .select("_id")
    .lean();

  if (existingSubject) {
    throw new AppError(409, "Subject with this code already exists");
  }

  const subject = await Subject.create({
    subjectCode: String(subjectCode).toUpperCase().trim(),
    name: String(name).trim(),
    departmentId: resolvedDepartmentId,
    semester: Number(semester),
    credits: Number(credits),
    type: type || "theory",
    isActive: true,
  });

  return sendSuccess(res, 201, "Subject created", { subject });
});

const updateSubject = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new AppError(400, "Valid subject id is required");
  }

  const subject = await Subject.findById(id);
  if (!subject) {
    throw new AppError(404, "Subject not found");
  }

  if (req.user?.role === "hod") {
    const hodDepartmentId = await resolveHodDepartmentId(req);
    if (String(subject.departmentId) !== String(hodDepartmentId)) {
      throw new AppError(403, "You can only update subjects in your department");
    }
  }

  const updatable = ["name", "semester", "credits", "type", "totalPlannedClasses", "isActive"];
  for (const field of updatable) {
    if (req.body[field] !== undefined) {
      subject[field] = req.body[field];
    }
  }

  await subject.save();

  return sendSuccess(res, 200, "Subject updated", { subject });
});

const deactivateSubject = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new AppError(400, "Valid subject id is required");
  }

  const subject = await Subject.findById(id);
  if (!subject) {
    throw new AppError(404, "Subject not found");
  }

  if (req.user?.role === "hod") {
    const hodDepartmentId = await resolveHodDepartmentId(req);
    if (String(subject.departmentId) !== String(hodDepartmentId)) {
      throw new AppError(403, "You can only deactivate subjects in your department");
    }
  }

  subject.isActive = false;
  await subject.save();

  return sendSuccess(res, 200, "Subject deactivated", { subjectId: subject._id });
});

const getFaculty = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const query = {
    isActive: req.query.includeInactive === "true" ? { $in: [true, false] } : true,
  };

  if (req.query.departmentId && mongoose.Types.ObjectId.isValid(String(req.query.departmentId))) {
    query.departmentId = new mongoose.Types.ObjectId(String(req.query.departmentId));
  }

  if (req.user?.role === "hod") {
    query.departmentId = await resolveHodDepartmentId(req);
  }

  if (req.query.search) {
    const regex = new RegExp(String(req.query.search), "i");
    query.$or = [{ name: regex }, { email: regex }];
  }

  const [total, faculty] = await Promise.all([
    Faculty.countDocuments(query),
    Faculty.find(query)
      .populate({ path: "departmentId", select: "name code" })
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return sendPaginated(res, 200, "Faculty fetched", faculty, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

const createFaculty = catchAsync(async (req, res) => {
  req.body = {
    ...req.body,
    designation: req.body.designation || "Assistant Professor",
  };
  return createFacultyWithAccount(req, res);
});

const updateFaculty = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new AppError(400, "Valid faculty id is required");
  }

  const faculty = await Faculty.findById(id);
  if (!faculty) {
    throw new AppError(404, "Faculty not found");
  }

  if (req.user?.role === "hod") {
    const hodDepartmentId = await resolveHodDepartmentId(req);
    if (String(faculty.departmentId) !== String(hodDepartmentId)) {
      throw new AppError(403, "You can only update faculty in your department");
    }
  }

  const updatable = ["name", "email", "phone", "designation", "specialization", "isActive", "departmentId"];
  for (const field of updatable) {
    if (req.body[field] !== undefined) {
      if (field === "email") {
        faculty[field] = String(req.body[field]).toLowerCase().trim();
      } else if (field === "departmentId") {
        if (!mongoose.Types.ObjectId.isValid(String(req.body[field]))) {
          throw new AppError(400, "Valid departmentId is required");
        }
        faculty[field] = req.body[field];
      } else {
        faculty[field] = req.body[field];
      }
    }
  }

  await faculty.save();

  if (req.body.email !== undefined) {
    await User.findOneAndUpdate(
      { profileId: faculty._id, profileModel: "Faculty" },
      { $set: { email: faculty.email } }
    );
  }

  return sendSuccess(res, 200, "Faculty updated", { faculty });
});

const deactivateFaculty = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new AppError(400, "Valid faculty id is required");
  }

  const faculty = await Faculty.findById(id);
  if (!faculty) {
    throw new AppError(404, "Faculty not found");
  }

  if (req.user?.role === "hod") {
    const hodDepartmentId = await resolveHodDepartmentId(req);
    if (String(faculty.departmentId) !== String(hodDepartmentId)) {
      throw new AppError(403, "You can only deactivate faculty in your department");
    }
  }

  faculty.isActive = false;
  await faculty.save();

  await Department.updateMany(
    { hodId: faculty._id },
    {
      $set: {
        hodId: null,
      },
    }
  );

  await User.findOneAndUpdate(
    { profileId: faculty._id, profileModel: "Faculty" },
    {
      $set: {
        isActive: false,
      },
    }
  );

  return sendSuccess(res, 200, "Faculty deactivated", { facultyId: faculty._id });
});

const validateScheduleSlotsForAdmin = async ({ departmentId, semester, section, schedule, excludeTimetableId }) => {
  for (const slot of schedule || []) {
    if (!slot?.day || !Number.isFinite(Number(slot.periodNumber))) {
      throw new AppError(400, "Each schedule slot must include day and periodNumber");
    }

    if (!excludeTimetableId) {
      try {
        await Timetable.validatePeriodSlot(
          departmentId,
          Number(semester),
          String(section).toUpperCase(),
          slot.day,
          Number(slot.periodNumber)
        );
      } catch (error) {
        throw new AppError(400, error.message || "Schedule period clash");
      }
      continue;
    }

    const clash = await Timetable.exists({
      _id: { $ne: excludeTimetableId },
      departmentId,
      semester: Number(semester),
      section: String(section).toUpperCase(),
      isActive: true,
      schedule: {
        $elemMatch: {
          day: slot.day,
          periodNumber: Number(slot.periodNumber),
        },
      },
    });

    if (clash) {
      throw new AppError(
        400,
        `Period ${slot.periodNumber} is already occupied on ${slot.day} for semester ${semester} section ${String(section).toUpperCase()}.`
      );
    }
  }
};

const getTimetables = catchAsync(async (req, res) => {
  const allRecords = String(req.query.all || "").toLowerCase() === "true";
  const { page, limit, skip } = parsePagination(req.query);
  const query = {
    isActive: req.query.includeInactive === "true" ? { $in: [true, false] } : true,
  };

  if (req.query.departmentId && mongoose.Types.ObjectId.isValid(String(req.query.departmentId))) {
    query.departmentId = new mongoose.Types.ObjectId(String(req.query.departmentId));
  }

  if (req.query.facultyId && mongoose.Types.ObjectId.isValid(String(req.query.facultyId))) {
    query.facultyId = new mongoose.Types.ObjectId(String(req.query.facultyId));
  }

  if (req.query.subjectId && mongoose.Types.ObjectId.isValid(String(req.query.subjectId))) {
    query.subjectId = new mongoose.Types.ObjectId(String(req.query.subjectId));
  }

  if (req.query.semester !== undefined && req.query.semester !== "") {
    query.semester = Number(req.query.semester);
  }

  if (req.query.section) {
    query.section = String(req.query.section).toUpperCase();
  }

  if (req.query.academicYear) {
    query.academicYear = String(req.query.academicYear);
  }

  const timetableQuery = Timetable.find(query)
    .populate({ path: "facultyId", select: "name employeeId email" })
    .populate({ path: "subjectId", select: "name subjectCode type" })
    .populate({ path: "departmentId", select: "name code" })
    .sort({ createdAt: -1 });

  const [total, timetables] = await Promise.all([
    Timetable.countDocuments(query),
    allRecords ? timetableQuery.lean() : timetableQuery.skip(skip).limit(limit).lean(),
  ]);

  if (allRecords) {
    return sendSuccess(res, 200, "Timetables fetched", {
      timetables,
      count: timetables.length,
    });
  }

  return sendPaginated(res, 200, "Timetables fetched", timetables, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

const createTimetable = catchAsync(async (req, res) => {
  const {
    facultyId,
    subjectId,
    departmentId,
    semester,
    section,
    academicYear,
    schedule = [],
    subjectType = "theory",
    classTeacherId = null,
  } = req.body;

  if (!facultyId || !subjectId || !departmentId || !semester || !section || !academicYear) {
    throw new AppError(400, "facultyId, subjectId, departmentId, semester, section and academicYear are required");
  }

  if (!mongoose.Types.ObjectId.isValid(String(departmentId))) {
    throw new AppError(400, "Valid departmentId is required");
  }

  await validateScheduleSlotsForAdmin({
    departmentId,
    semester,
    section,
    schedule,
  });

  const timetable = await Timetable.create({
    facultyId,
    classTeacherId,
    subjectId,
    subjectType,
    departmentId,
    semester: Number(semester),
    section: String(section).toUpperCase(),
    academicYear,
    schedule,
    isActive: true,
  });

  await createDepartmentNotification({
    title: "Timetable Updated",
    message: `Timetable created for department class ${Number(timetable.semester)}-${String(timetable.section).toUpperCase()}.`,
    sentBy: req.user._id,
    departmentId: timetable.departmentId,
    semester: timetable.semester,
    section: timetable.section,
    recipientRoles: ["admin", "hod"],
  });

  return sendSuccess(res, 201, "Timetable created", { timetable });
});

const updateTimetable = catchAsync(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new AppError(400, "Valid timetable id is required");
  }

  const timetable = await Timetable.findById(id);
  if (!timetable) {
    throw new AppError(404, "Timetable not found");
  }

  const nextSchedule = Array.isArray(req.body.schedule) ? req.body.schedule : timetable.schedule;

  await validateScheduleSlotsForAdmin({
    departmentId: req.body.departmentId || timetable.departmentId,
    semester: req.body.semester || timetable.semester,
    section: req.body.section || timetable.section,
    schedule: nextSchedule,
    excludeTimetableId: timetable._id,
  });

  if (req.body.facultyId !== undefined) timetable.facultyId = req.body.facultyId;
  if (req.body.classTeacherId !== undefined) timetable.classTeacherId = req.body.classTeacherId;
  if (req.body.subjectId !== undefined) timetable.subjectId = req.body.subjectId;
  if (req.body.subjectType !== undefined) timetable.subjectType = req.body.subjectType;
  if (req.body.departmentId !== undefined) timetable.departmentId = req.body.departmentId;
  if (req.body.semester !== undefined) timetable.semester = Number(req.body.semester);
  if (req.body.section !== undefined) timetable.section = String(req.body.section).toUpperCase();
  if (req.body.academicYear !== undefined) timetable.academicYear = req.body.academicYear;
  if (req.body.isActive !== undefined) timetable.isActive = Boolean(req.body.isActive);
  timetable.schedule = nextSchedule;

  await timetable.save();

  await createDepartmentNotification({
    title: "Timetable Updated",
    message: `Timetable updated for department class ${Number(timetable.semester)}-${String(timetable.section).toUpperCase()}.`,
    sentBy: req.user._id,
    departmentId: timetable.departmentId,
    semester: timetable.semester,
    section: timetable.section,
    recipientRoles: ["admin", "hod"],
  });

  return sendSuccess(res, 200, "Timetable updated", { timetable });
});

const deactivateTimetable = catchAsync(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new AppError(400, "Valid timetable id is required");
  }

  const timetable = await Timetable.findById(id);
  if (!timetable) {
    throw new AppError(404, "Timetable not found");
  }

  timetable.isActive = false;
  await timetable.save();

  await createDepartmentNotification({
    title: "Timetable Updated",
    message: `Timetable deactivated for department class ${Number(timetable.semester)}-${String(timetable.section).toUpperCase()}.`,
    sentBy: req.user._id,
    departmentId: timetable.departmentId,
    semester: timetable.semester,
    section: timetable.section,
    recipientRoles: ["admin", "hod"],
  });

  return sendSuccess(res, 200, "Timetable deactivated", { timetableId: timetable._id });
});

const getDateBounds = (date = new Date()) => {
  const day = dateHelper.toMidnightUTC(date);
  const nextDay = new Date(day);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return { day, nextDay };
};
const buildTempPassword = (seed) => {
  const suffix = String(seed || "XXXX").slice(-4).toUpperCase();
  return `${suffix}@123`;
};

const buildStudentRiskCount = async (matchQuery, threshold) => {
  const rows = await Attendance.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: { studentId: "$studentId", subjectId: "$subjectId" },
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status", "P"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "L"] }, 1, 0] } },
      },
    },
    {
      $project: {
        studentId: "$_id.studentId",
        percentage: {
          $cond: [
            { $gt: ["$total", 0] },
            {
              $multiply: [
                {
                  $divide: [
                    {
                      $add: [
                        "$present",
                        { $multiply: ["$late", 0.5] },
                      ],
                    },
                    "$total",
                  ],
                },
                100,
              ],
            },
            0,
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
      $group: {
        _id: "$studentId",
      },
    },
    {
      $count: "count",
    },
  ]);

  return Number(rows[0]?.count || 0);
};

const buildAverageAttendance = async (matchQuery) => {
  const rows = await Attendance.aggregate([
    { $match: matchQuery },
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
        percentage: {
          $cond: [
            { $gt: ["$total", 0] },
            {
              $multiply: [
                {
                  $divide: [
                    {
                      $add: [
                        "$present",
                        { $multiply: ["$late", 0.5] },
                      ],
                    },
                    "$total",
                  ],
                },
                100,
              ],
            },
            0,
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        avgPercentage: { $avg: "$percentage" },
      },
    },
  ]);

  return Number((rows[0]?.avgPercentage || 0).toFixed(2));
};

const getDashboardOverview = catchAsync(async (req, res) => {
  const threshold = await getThresholdValue();
  const { day, nextDay } = getDateBounds(new Date());

  const [
    totalDepts,
    totalStudents,
    totalFaculty,
    totalSubjects,
    pendingEditApprovals,
    alertsSentToday,
    todayStats,
    departments,
  ] = await Promise.all([
    Department.countDocuments({ isActive: true }),
    Student.countDocuments({ isActive: true }),
    Faculty.countDocuments({ isActive: true }),
    Subject.countDocuments({ isActive: true }),
    EditApprovalRequest.countDocuments({ status: "pending" }),
    AuditLog.countDocuments({
      createdAt: { $gte: day, $lt: nextDay },
      reason: { $regex: "alert|sms", $options: "i" },
    }),
    Attendance.aggregate([
      {
        $match: {
          date: day,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ["$status", "P"] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ["$status", "L"] }, 1, 0] } },
        },
      },
    ]),
    Department.find({ isActive: true }).select("_id name code").lean(),
  ]);

  const todayTotals = todayStats[0] || { total: 0, present: 0, late: 0 };
  const todayAttendanceRate = todayTotals.total
    ? Number((((todayTotals.present + todayTotals.late * 0.5) / todayTotals.total) * 100).toFixed(2))
    : 0;

  const studentsAtRisk = await buildStudentRiskCount({}, threshold);

  const deptBreakdown = [];
  for (const department of departments) {
    const deptThreshold = await getThresholdValue(department._id);
    const [avgPercentage, deptRisk] = await Promise.all([
      buildAverageAttendance({ departmentId: department._id }),
      buildStudentRiskCount({ departmentId: department._id }, deptThreshold),
    ]);

    deptBreakdown.push({
      deptName: department.code || department.name,
      avgPercentage,
      studentsAtRisk: deptRisk,
    });
  }

  return sendSuccess(res, 200, "Dashboard overview fetched", {
    threshold,
    totalDepts,
    totalStudents,
    totalFaculty,
    totalSubjects,
    studentsAtRisk,
    todayAttendanceRate,
    pendingEditApprovals,
    alertsSentToday,
    deptBreakdown,
  });
});

const manageHODs = catchAsync(async (req, res) => {
  const action = String(req.body.action || req.query.action || "").toLowerCase();

  if (req.method === "POST" || action === "create") {
    const { facultyId, departmentId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(String(facultyId)) || !mongoose.Types.ObjectId.isValid(String(departmentId))) {
      throw new AppError(400, "Valid facultyId and departmentId are required");
    }

    const [department, faculty] = await Promise.all([
      Department.findById(departmentId),
      Faculty.findById(facultyId),
    ]);

    if (!department || !faculty) {
      throw new AppError(404, "Department or faculty not found");
    }

    if (department.hodId && String(department.hodId) !== String(faculty._id)) {
      const previousHod = await Faculty.findById(department.hodId);
      if (previousHod) {
        previousHod.designation = "Associate Professor";
        await previousHod.save();
      }

      await User.updateOne(
        { profileId: department.hodId, profileModel: "Faculty" },
        {
          $set: {
            role: "faculty",
            permissions: User.getDefaultPermissions("faculty"),
          },
        }
      );
    }

    faculty.departmentId = department._id;
    faculty.designation = "HOD";
    await faculty.save();

    await User.updateOne(
      { profileId: faculty._id, profileModel: "Faculty" },
      {
        $set: {
          role: "hod",
          permissions: User.getDefaultPermissions("hod"),
        },
      }
    );

    department.hodId = faculty._id;
    await department.save();

    return sendSuccess(res, 200, "HOD assigned", { departmentId: department._id, facultyId: faculty._id });
  }

  if (req.method === "DELETE" || action === "remove") {
    const { departmentId, facultyId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(String(departmentId))) {
      throw new AppError(400, "Valid departmentId is required");
    }

    const department = await Department.findById(departmentId);
    if (!department) {
      throw new AppError(404, "Department not found");
    }

    const resolvedFacultyId = facultyId || department.hodId;
    if (!resolvedFacultyId) {
      throw new AppError(400, "No HOD assigned for this department");
    }

    const faculty = await Faculty.findById(resolvedFacultyId);
    if (!faculty) {
      throw new AppError(404, "Faculty not found");
    }

    faculty.designation = "Associate Professor";
    await faculty.save();

    await User.updateOne(
      { profileId: faculty._id, profileModel: "Faculty" },
      {
        $set: {
          role: "faculty",
          permissions: User.getDefaultPermissions("faculty"),
        },
      }
    );

    if (String(department.hodId || "") === String(faculty._id)) {
      department.hodId = null;
      await department.save();
    }

    return sendSuccess(res, 200, "HOD removed", { departmentId: department._id, facultyId: faculty._id });
  }

  if (req.method === "PUT" || req.method === "PATCH" || action === "transfer") {
    const { facultyId, fromDepartmentId, toDepartmentId } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(String(facultyId)) ||
      !mongoose.Types.ObjectId.isValid(String(fromDepartmentId)) ||
      !mongoose.Types.ObjectId.isValid(String(toDepartmentId))
    ) {
      throw new AppError(400, "Valid facultyId, fromDepartmentId and toDepartmentId are required");
    }

    const [fromDept, toDept, faculty] = await Promise.all([
      Department.findById(fromDepartmentId),
      Department.findById(toDepartmentId),
      Faculty.findById(facultyId),
    ]);

    if (!fromDept || !toDept || !faculty) {
      throw new AppError(404, "Department or faculty not found");
    }

    if (toDept.hodId && String(toDept.hodId) !== String(faculty._id)) {
      const oldToHod = await Faculty.findById(toDept.hodId);
      if (oldToHod) {
        oldToHod.designation = "Associate Professor";
        await oldToHod.save();
      }

      await User.updateOne(
        { profileId: toDept.hodId, profileModel: "Faculty" },
        {
          $set: {
            role: "faculty",
            permissions: User.getDefaultPermissions("faculty"),
          },
        }
      );
    }

    if (String(fromDept.hodId || "") === String(faculty._id)) {
      fromDept.hodId = null;
      await fromDept.save();
    }

    faculty.departmentId = toDept._id;
    faculty.designation = "HOD";
    await faculty.save();

    await User.updateOne(
      { profileId: faculty._id, profileModel: "Faculty" },
      {
        $set: {
          role: "hod",
          permissions: User.getDefaultPermissions("hod"),
        },
      }
    );

    toDept.hodId = faculty._id;
    await toDept.save();

    return sendSuccess(res, 200, "HOD transferred", {
      facultyId: faculty._id,
      fromDepartmentId: fromDept._id,
      toDepartmentId: toDept._id,
    });
  }

  throw new AppError(405, "Unsupported action. Use create/remove/transfer");
});
const createHODWithAccount = catchAsync(async (req, res) => {
  const {
    facultyId,
    name,
    email,
    employeeId = "",
    departmentId,
    phone,
    specialization,
  } = req.body;

  if (!departmentId) {
    throw new AppError(400, "departmentId is required");
  }

  if (!facultyId && (!name || !email)) {
    throw new AppError(400, "name and email are required when facultyId is not provided");
  }

  if (!mongoose.Types.ObjectId.isValid(String(departmentId))) {
    throw new AppError(400, "Valid departmentId is required");
  }

  const normalizedEmail = String(email || "").toLowerCase().trim();
  const normalizedEmployeeId = String(employeeId || "").toUpperCase().trim();
  const isPromotion = Boolean(facultyId);

  const [department, facultyById, existingFacultyByIdentity, existingUserByEmail] = await Promise.all([
    Department.findById(departmentId),
    isPromotion && mongoose.Types.ObjectId.isValid(String(facultyId))
      ? Faculty.findById(facultyId)
      : Promise.resolve(null),
    !isPromotion && normalizedEmail
      ? Faculty.findOne(
          normalizedEmployeeId
            ? { $or: [{ email: normalizedEmail }, { employeeId: normalizedEmployeeId }] }
            : { email: normalizedEmail }
        )
      : Promise.resolve(null),
    !isPromotion && normalizedEmail ? User.findOne({ email: normalizedEmail }).select("_id profileId profileModel") : Promise.resolve(null),
  ]);

  if (!department) {
    throw new AppError(404, "Department not found");
  }

  if (isPromotion && !facultyById) {
    throw new AppError(404, "Faculty not found");
  }

  let faculty = facultyById || existingFacultyByIdentity;
  if (facultyById && !facultyById.isActive) {
    throw new AppError(400, "Selected faculty is inactive");
  }

  if (department.hodId) {
    const previousHod = await Faculty.findById(department.hodId);
    if (previousHod) {
      previousHod.designation = "Associate Professor";
      await previousHod.save();
    }

    await User.updateOne(
      { profileId: department.hodId, profileModel: "Faculty" },
      {
        $set: {
          role: "faculty",
          permissions: User.getDefaultPermissions("faculty"),
        },
      }
    );
  }

  if (!faculty) {
    faculty = await Faculty.create({
      name: String(name).trim(),
      email: normalizedEmail,
      employeeId: normalizedEmployeeId || null,
      phone: phone || null,
      specialization: specialization || null,
      designation: "HOD",
      departmentId: department._id,
      isActive: true,
    });
  } else {
    faculty.name = String(name || faculty.name).trim();
    faculty.email = normalizedEmail || faculty.email;
    if (normalizedEmployeeId) {
      faculty.employeeId = normalizedEmployeeId;
    }
    faculty.phone = phone || faculty.phone || null;
    faculty.specialization = specialization || faculty.specialization || null;
    faculty.designation = "HOD";
    faculty.departmentId = department._id;
    faculty.isActive = true;
    await faculty.save();
  }

  const temporaryPassword = buildTempPassword(faculty.employeeId || normalizedEmail);

  let user = await User.findOne({ profileId: faculty._id, profileModel: "Faculty" });

  if (existingUserByEmail && String(existingUserByEmail._id) !== String(user?._id || "")) {
    if (String(existingUserByEmail.profileId || "") && String(existingUserByEmail.profileId) !== String(faculty._id)) {
      throw new AppError(409, "Email already used by another account");
    }
  }

  if (!user) {
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);
    user = await User.create({
      email: normalizedEmail || faculty.email,
      passwordHash: hashedPassword,
      role: "hod",
      profileId: faculty._id,
      profileModel: "Faculty",
      isActive: true,
    });
  } else {
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);
    user.email = normalizedEmail || faculty.email;
    user.role = "hod";
    user.permissions = User.getDefaultPermissions("hod");
    user.isActive = true;
    // Regenerate credentials for predictable login during create-and-assign flow.
    user.passwordHash = hashedPassword;
    user.passwordChangedAt = new Date(Date.now() - 1000);
    await user.save();
  }

  department.hodId = faculty._id;
  await department.save();

  const emailResult = await emailService.sendEmail({
    to: user.email || faculty.email,
    subject: "HOD Account Created - Attendance Management System",
    text: `Welcome ${faculty.name}. Your HOD account has been created. Login email: ${user.email || faculty.email}. Temporary password: ${temporaryPassword}`,
    html: `<p>Welcome ${faculty.name},</p><p>Your HOD account has been created and assigned to department <strong>${department.code || department.name}</strong>.</p><p>Email: <strong>${user.email || faculty.email}</strong><br/>Temporary Password: <strong>${temporaryPassword}</strong></p><p>Please change your password after first login.</p>`,
  });

  const emailSent = Boolean(emailResult?.success);

  return sendSuccess(res, 201, emailSent ? "HOD account created and assigned" : "HOD account created and assigned (email not sent)", {
    departmentId: department._id,
    faculty,
    userId: user._id,
    credentials: {
      email: user.email || faculty.email,
      temporaryPassword,
    },
    emailSent,
  });
});

const createFacultyWithAccount = catchAsync(async (req, res) => {
  const {
    name,
    email,
    departmentId,
    phone,
    specialization,
    designation,
  } = req.body;

  if (!name || !email || !departmentId) {
    throw new AppError(400, "name, email and departmentId are required");
  }

  if (!mongoose.Types.ObjectId.isValid(String(departmentId))) {
    throw new AppError(400, "Valid departmentId is required");
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const allowedDesignation = ["Assistant Professor", "Associate Professor", "Professor"];
  const resolvedDesignation = allowedDesignation.includes(String(designation || ""))
    ? String(designation)
    : "Assistant Professor";

  const [department, existingFaculty, existingUser] = await Promise.all([
    Department.findById(departmentId),
    Faculty.findOne({ email: normalizedEmail }).select("_id"),
    User.findOne({ email: normalizedEmail }).select("_id"),
  ]);

  if (!department) {
    throw new AppError(404, "Department not found");
  }

  if (existingFaculty) {
    throw new AppError(409, "Faculty with this email already exists");
  }

  if (existingUser) {
    throw new AppError(409, "User with this email already exists");
  }

  const faculty = await Faculty.create({
    name: String(name).trim(),
    email: normalizedEmail,
    phone: phone || null,
    specialization: specialization || null,
    designation: resolvedDesignation,
    departmentId: department._id,
    isActive: true,
  });

  const temporaryPassword = buildTempPassword(normalizedEmail);

  const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

  await User.create({
    email: normalizedEmail,
    passwordHash: hashedPassword,
    role: "faculty",
    profileId: faculty._id,
    profileModel: "Faculty",
    isActive: true,
  });

  const emailResult = await emailService.sendEmail({
    to: normalizedEmail,
    subject: "Faculty Account Created - Attendance Management System",
    text: `Welcome ${faculty.name}. Your faculty account has been created. Login email: ${normalizedEmail}. Temporary password: ${temporaryPassword}`,
    html: `<p>Welcome ${faculty.name},</p><p>Your faculty account has been created for department <strong>${department.code || department.name}</strong>.</p><p>Email: <strong>${normalizedEmail}</strong><br/>Temporary Password: <strong>${temporaryPassword}</strong></p><p>Please change your password after first login.</p>`,
  });

  const emailSent = Boolean(emailResult?.success);

  return sendSuccess(res, 201, emailSent ? "Faculty account created" : "Faculty account created (email not sent)", {
    departmentId: department._id,
    faculty,
    credentials: {
      email: normalizedEmail,
      temporaryPassword,
    },
    emailSent,
  });
});

const setAttendanceThreshold = catchAsync(async (req, res) => {
  const { threshold, appliesTo } = req.body;

  const parsedThreshold = Number(threshold);
  if (!Number.isFinite(parsedThreshold) || parsedThreshold <= 0 || parsedThreshold > 100) {
    throw new AppError(400, "threshold must be between 1 and 100");
  }

  if (appliesTo === "all") {
    const config = await SystemConfig.findOneAndUpdate(
      { key: "attendance_threshold", departmentId: null },
      {
        $set: {
          value: parsedThreshold,
          updatedBy: req.user._id,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    return sendSuccess(res, 200, "Global attendance threshold updated", { config });
  }

  if (!mongoose.Types.ObjectId.isValid(String(appliesTo))) {
    throw new AppError(400, "appliesTo must be 'all' or a valid departmentId");
  }

  const department = await Department.findById(appliesTo).select("_id name code").lean();
  if (!department) {
    throw new AppError(404, "Department not found");
  }

  const config = await SystemConfig.findOneAndUpdate(
    { key: "attendance_threshold", departmentId: department._id },
    {
      $set: {
        value: parsedThreshold,
        updatedBy: req.user._id,
        updatedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  return sendSuccess(res, 200, "Department attendance threshold updated", {
    department,
    config,
  });
});

const buildSemesterSchedule = (startDate, endDate, semesterCount) => {
  const start = dateHelper.toMidnightUTC(startDate);
  const end = dateHelper.toMidnightUTC(endDate);

  if (start >= end) {
    throw new AppError(400, "startDate must be before endDate");
  }

  const totalDurationMs = end.getTime() - start.getTime();
  const sliceMs = Math.floor(totalDurationMs / semesterCount);

  const semesters = [];
  for (let i = 0; i < semesterCount; i += 1) {
    const semStart = new Date(start.getTime() + sliceMs * i);
    const semEnd = i === semesterCount - 1 ? end : new Date(start.getTime() + sliceMs * (i + 1) - 86400000);

    semesters.push({
      semesterNumber: i + 1,
      startDate: semStart,
      endDate: semEnd,
      isActive: false,
    });
  }

  return semesters;
};

const manageAcademicYear = catchAsync(async (req, res) => {
  const action = String(req.body.action || req.query.action || "").toLowerCase();

  if (req.method === "GET") {
    const years = await AcademicYear.find().sort({ year: -1 }).lean();
    return sendSuccess(res, 200, "Academic years fetched", { years });
  }

  if (req.method === "POST" || action === "create") {
    const { year, startDate, endDate, semesters = 8 } = req.body;

    if (!year || !startDate || !endDate) {
      throw new AppError(400, "year, startDate and endDate are required");
    }

    const existing = await AcademicYear.findOne({ year }).select("_id").lean();
    if (existing) {
      throw new AppError(409, "Academic year already exists");
    }

    const semesterSchedule = buildSemesterSchedule(startDate, endDate, Number(semesters));

    const academicYear = await AcademicYear.create({
      year,
      startDate: dateHelper.toMidnightUTC(startDate),
      endDate: dateHelper.toMidnightUTC(endDate),
      semesters: semesterSchedule,
      isActive: false,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    return sendSuccess(res, 201, "Academic year created", { academicYear });
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    if (action === "set_active") {
      const { yearId } = req.body;

      if (!mongoose.Types.ObjectId.isValid(String(yearId))) {
        throw new AppError(400, "Valid yearId is required");
      }

      await AcademicYear.updateMany({}, { $set: { isActive: false, "semesters.$[].isActive": false } });

      const activeYear = await AcademicYear.findById(yearId);
      if (!activeYear) {
        throw new AppError(404, "Academic year not found");
      }

      activeYear.isActive = true;
      if (Array.isArray(activeYear.semesters) && activeYear.semesters.length > 0) {
        activeYear.semesters = activeYear.semesters.map((sem, index) => ({
          ...sem.toObject(),
          isActive: index === 0,
        }));
      }
      activeYear.updatedBy = req.user._id;
      await activeYear.save();

      return sendSuccess(res, 200, "Active academic year updated", { academicYear: activeYear });
    }

    if (action === "generate_schedule") {
      const { yearId, semesters = 8 } = req.body;

      if (!mongoose.Types.ObjectId.isValid(String(yearId))) {
        throw new AppError(400, "Valid yearId is required");
      }

      const academicYear = await AcademicYear.findById(yearId);
      if (!academicYear) {
        throw new AppError(404, "Academic year not found");
      }

      academicYear.semesters = buildSemesterSchedule(academicYear.startDate, academicYear.endDate, Number(semesters));
      academicYear.updatedBy = req.user._id;
      await academicYear.save();

      return sendSuccess(res, 200, "Semester schedule generated", { academicYear });
    }

    const { yearId, year, startDate, endDate } = req.body;

    if (!mongoose.Types.ObjectId.isValid(String(yearId))) {
      throw new AppError(400, "Valid yearId is required");
    }

    const academicYear = await AcademicYear.findById(yearId);
    if (!academicYear) {
      throw new AppError(404, "Academic year not found");
    }

    if (year !== undefined) academicYear.year = year;
    if (startDate !== undefined) academicYear.startDate = dateHelper.toMidnightUTC(startDate);
    if (endDate !== undefined) academicYear.endDate = dateHelper.toMidnightUTC(endDate);
    academicYear.updatedBy = req.user._id;

    await academicYear.save();

    return sendSuccess(res, 200, "Academic year updated", { academicYear });
  }

  if (req.method === "DELETE") {
    const { yearId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(String(yearId))) {
      throw new AppError(400, "Valid yearId is required");
    }

    const result = await AcademicYear.deleteOne({ _id: yearId });
    if (result.deletedCount === 0) {
      throw new AppError(404, "Academic year not found");
    }

    return sendSuccess(res, 200, "Academic year deleted", { yearId });
  }

  throw new AppError(405, "Method not supported for academic year management");
});

const buildDepartmentAttendanceSummary = async (department, threshold) => {
  const average = await buildAverageAttendance({ departmentId: department._id });
  const atRisk = await buildStudentRiskCount({ departmentId: department._id }, threshold);

  return {
    departmentId: department._id,
    deptName: department.code || department.name,
    avgPercentage: average,
    studentsAtRisk: atRisk,
  };
};

const buildCollegeReportBuffer = async (reportData, format, type) => {
  if (format === "pdf") {
    if (typeof pdfService.generateDepartmentReport === "function") {
      return pdfService.generateDepartmentReport({
        departmentName: "College Wide",
        threshold: reportData.threshold,
        overview: reportData.departments.map((dept) => ({
          subjectName: dept.deptName,
          totalStudents: dept.totalStudents || 0,
          avgAttendance: dept.avgPercentage,
          belowThreshold: dept.studentsAtRisk,
        })),
        lowAttendanceStudents: [],
        generatedAt: new Date(),
      });
    }

    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const chunks = [];
    return new Promise((resolve, reject) => {
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(18).text(`College ${type} Report`, { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(11).text(`Generated At: ${new Date().toLocaleString()}`);
      doc.text(`Threshold: ${reportData.threshold}%`);
      doc.moveDown(1);

      reportData.departments.forEach((dept) => {
        doc.fontSize(12).text(`${dept.deptName}`, { underline: true });
        doc.fontSize(10).text(`Average: ${dept.avgPercentage}%`);
        doc.text(`Students At Risk: ${dept.studentsAtRisk}`);
        doc.text(`Students: ${dept.totalStudents || 0}`);
        doc.moveDown(0.5);
      });

      doc.end();
    });
  }

  if (typeof excelService.generateSemesterClassExcel === "function") {
    return excelService.generateSemesterClassExcel({
      reportMeta: {
        generatedAt: new Date(),
      },
      monthlyTrend: [],
      classDates: [],
      rows: reportData.departments.map((dept) => ({
        rollNumber: dept.deptName,
        studentName: dept.deptName,
        present: 0,
        late: 0,
        absent: 0,
        total: 0,
        percentage: dept.avgPercentage,
        dateGrid: [],
      })),
      summary: {
        totalStudents: reportData.departments.reduce((sum, dept) => sum + Number(dept.totalStudents || 0), 0),
        classAverage:
          reportData.departments.length > 0
            ? Number(
                (
                  reportData.departments.reduce((sum, dept) => sum + Number(dept.avgPercentage || 0), 0) /
                  reportData.departments.length
                ).toFixed(2)
              )
            : 0,
      },
    });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("College Report");
  sheet.columns = [
    { header: "Department", key: "dept", width: 24 },
    { header: "Average %", key: "avg", width: 14 },
    { header: "Students At Risk", key: "risk", width: 18 },
    { header: "Students", key: "students", width: 12 },
  ];

  reportData.departments.forEach((dept) => {
    sheet.addRow({
      dept: dept.deptName,
      avg: dept.avgPercentage,
      risk: dept.studentsAtRisk,
      students: dept.totalStudents || 0,
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

const generateCollegeReport = catchAsync(async (req, res) => {
  const type = String(req.query.type || "attendance").toLowerCase();
  const format = String(req.query.format || "pdf").toLowerCase();

  if (!["attendance", "eligibility", "shortage"].includes(type)) {
    throw new AppError(400, "type must be attendance, eligibility, or shortage");
  }

  if (!["pdf", "excel"].includes(format)) {
    throw new AppError(400, "format must be pdf or excel");
  }

  const departments = await Department.find({ isActive: true }).select("_id name code").lean();
  const threshold = await getThresholdValue();

  const deptSummaries = [];

  for (const department of departments) {
    if (semesterReportService && typeof semesterReportService.buildDepartmentSummary === "function") {
      const data = await semesterReportService.buildDepartmentSummary({
        departmentId: department._id,
        type,
        threshold,
      });

      deptSummaries.push({
        departmentId: department._id,
        deptName: department.code || department.name,
        avgPercentage: Number(data?.avgPercentage || 0),
        studentsAtRisk: Number(data?.studentsAtRisk || 0),
        totalStudents: Number(data?.totalStudents || 0),
      });
      continue;
    }

    const baseSummary = await buildDepartmentAttendanceSummary(department, threshold);
    const totalStudents = await Student.countDocuments({ departmentId: department._id, isActive: true });
    deptSummaries.push({
      ...baseSummary,
      totalStudents,
    });
  }

  const combined = {
    type,
    threshold,
    departments: deptSummaries,
  };

  const buffer = await buildCollegeReportBuffer(combined, format, type);

  const ext = format === "pdf" ? "pdf" : "xlsx";
  const mimeType =
    format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return streamBuffer(res, buffer, `college-${type}-report.${ext}`, mimeType);
});

const buildEligibilityEntries = async ({ departmentId, semester, section, threshold }) => {
  const studentQuery = {
    semester: Number(semester),
    isActive: true,
  };

  if (departmentId) {
    studentQuery.departmentId = departmentId;
  }

  if (section) {
    studentQuery.section = String(section).toUpperCase();
  }

  const students = await Student.find(studentQuery)
    .select("_id rollNumber name departmentId")
    .lean();

  const studentIds = students.map((student) => student._id);

  const [attendanceRows, subjects] = await Promise.all([
    Attendance.find({ studentId: { $in: studentIds } })
      .select("studentId subjectId status")
      .lean(),
    Subject.find({ isActive: true }).select("_id name subjectCode type").lean(),
  ]);

  const subjectMap = new Map(subjects.map((subject) => [String(subject._id), subject]));
  const rowsByStudentSubject = new Map();

  for (const row of attendanceRows) {
    const key = `${String(row.studentId)}-${String(row.subjectId)}`;
    if (!rowsByStudentSubject.has(key)) {
      rowsByStudentSubject.set(key, {
        studentId: row.studentId,
        subjectId: row.subjectId,
        total: 0,
        present: 0,
        late: 0,
      });
    }

    const item = rowsByStudentSubject.get(key);
    item.total += 1;
    if (row.status === "P") item.present += 1;
    else if (row.status === "L") item.late += 1;
  }

  const byDepartment = new Map();

  for (const student of students) {
    const subjectEntries = [];
    let allTotal = 0;
    let allWeightedPresent = 0;

    for (const [key, stats] of rowsByStudentSubject.entries()) {
      if (!key.startsWith(`${String(student._id)}-`)) continue;

      const subject = subjectMap.get(String(stats.subjectId));
      const combinedPercentage = attendanceCalc.calculatePercentage(stats.present, stats.late, stats.total);
      const isLab = String(subject?.type || "").toLowerCase() === "lab";

      allTotal += stats.total;
      allWeightedPresent += stats.present + stats.late * 0.5;

      subjectEntries.push({
        subjectId: stats.subjectId,
        subjectName: subject?.name || "Subject",
        subjectCode: subject?.subjectCode || "-",
        theoryPercentage: isLab ? null : combinedPercentage,
        labPercentage: isLab ? combinedPercentage : null,
        combinedPercentage,
        isEligible: combinedPercentage >= Number(threshold),
        shortageBy: Number(Math.max(0, Number(threshold) - combinedPercentage).toFixed(2)),
      });
    }

    const overallPercentage = allTotal > 0 ? Number(((allWeightedPresent / allTotal) * 100).toFixed(2)) : 0;
    const studentEligible = subjectEntries.every((subject) => subject.isEligible);

    const deptKey = String(student.departmentId);
    if (!byDepartment.has(deptKey)) {
      byDepartment.set(deptKey, []);
    }

    byDepartment.get(deptKey).push({
      studentId: student._id,
      rollNumber: student.rollNumber,
      name: student.name,
      isEligible: studentEligible,
      condonationApplied: false,
      condonationReason: null,
      subjects: subjectEntries,
      overallPercentage,
    });
  }

  return byDepartment;
};

const buildEligibilityDownloadBuffer = async (items, format) => {
  if (format === "pdf") {
    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const chunks = [];

    return new Promise((resolve, reject) => {
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(16).text("Eligibility Report", { align: "center" });
      doc.moveDown(1);

      items.forEach((item) => {
        doc.fontSize(11).text(`${item.rollNumber} - ${item.name}`);
        doc.fontSize(10).text(`Overall: ${item.overallPercentage}% | Eligible: ${item.isEligible ? "Yes" : "No"}`);
        const lowSubjects = item.subjects.filter((subject) => !subject.isEligible);
        if (lowSubjects.length) {
          doc.text(`Low Subjects: ${lowSubjects.map((subject) => subject.subjectCode).join(", ")}`);
        }
        doc.moveDown(0.5);
      });

      doc.end();
    });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Eligibility");
  sheet.columns = [
    { header: "Roll Number", key: "roll", width: 16 },
    { header: "Name", key: "name", width: 28 },
    { header: "Overall %", key: "overall", width: 12 },
    { header: "Eligible", key: "eligible", width: 12 },
    { header: "Low Subjects", key: "subjects", width: 40 },
  ];

  items.forEach((item) => {
    sheet.addRow({
      roll: item.rollNumber,
      name: item.name,
      overall: item.overallPercentage,
      eligible: item.isEligible ? "Yes" : "No",
      subjects: item.subjects
        .filter((subject) => !subject.isEligible)
        .map((subject) => `${subject.subjectCode} (${subject.combinedPercentage}%)`)
        .join(", "),
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

const generateEligibilityReport = catchAsync(async (req, res) => {
  const {
    departmentId,
    semester,
    section,
    academicYear,
    threshold,
  } = req.body;

  if (!semester || !academicYear) {
    throw new AppError(400, "semester and academicYear are required");
  }

  const resolvedThreshold = Number(threshold || (await getThresholdValue(departmentId || null)));
  const byDepartment = await buildEligibilityEntries({
    departmentId: departmentId || null,
    semester,
    section,
    threshold: resolvedThreshold,
  });

  const reportDocs = [];

  for (const [deptId, students] of byDepartment.entries()) {
    const eligibleCount = students.filter((item) => item.isEligible).length;
    const ineligibleCount = students.length - eligibleCount;

    const report = await EligibilityReport.create({
      generatedBy: req.user._id,
      departmentId: deptId,
      semester: Number(semester),
      section: section ? String(section).toUpperCase() : null,
      academicYear,
      semesterEndDate: null,
      thresholdUsed: resolvedThreshold,
      students,
      eligibleCount,
      ineligibleCount,
      isFinalized: false,
    });

    reportDocs.push(report);
  }

  const responsePayload = {
    reports: reportDocs,
    reportCount: reportDocs.length,
    threshold: resolvedThreshold,
  };

  const downloadFormat = String(req.query.format || req.body.format || "").toLowerCase();
  if (downloadFormat === "pdf" || downloadFormat === "excel") {
    const flatStudents = reportDocs.flatMap((doc) => doc.students || []);
    const buffer = await buildEligibilityDownloadBuffer(flatStudents, downloadFormat);
    const ext = downloadFormat === "pdf" ? "pdf" : "xlsx";
    const mimeType =
      downloadFormat === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    return streamBuffer(res, buffer, `eligibility-report-${academicYear}.${ext}`, mimeType);
  }

  return sendSuccess(res, 201, "Eligibility report generated", responsePayload);
});

const getRoleManagement = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const query = {};
  if (req.query.role) {
    query.role = req.query.role;
  }

  if (req.query.isActive !== undefined) {
    query.isActive = String(req.query.isActive).toLowerCase() === "true";
  }

  const users = await User.find(query)
    .populate({ path: "profileId" })
    .sort({ createdAt: -1 })
    .lean();

  const filtered = req.query.dept
    ? users.filter((user) => String(user?.profileId?.departmentId || "") === String(req.query.dept))
    : users;

  const total = filtered.length;
  const paged = filtered.slice(skip, skip + limit);

  return sendPaginated(res, 200, "Role management data fetched", paged, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

const updateUserRole = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { newRole, role, additionalPermissions = [] } = req.body;
  const requestedRole = String(newRole || role || "").trim();

  if (!mongoose.Types.ObjectId.isValid(String(userId))) {
    throw new AppError(400, "Valid userId is required");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, "User not found");
  }

  if (String(req.user._id) === String(user._id) && user.role === "admin") {
    throw new AppError(403, "Admin cannot change own role");
  }

  const allowedRoles = ["student", "faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator", "hod", "admin", "principal"];
  if (!allowedRoles.includes(requestedRole)) {
    throw new AppError(400, "Invalid newRole");
  }

  const profileModel = String(user.profileModel || "");
  const currentRole = String(user.role || "");
  const effectiveProfile =
    profileModel ||
    (currentRole === "student"
      ? "Student"
      : ["faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator", "hod"].includes(currentRole)
        ? "Faculty"
        : "None");

  const validRolesByProfile = {
    Student: ["student"],
    Faculty: ["faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator", "hod"],
    None: ["admin", "principal"],
  };

  const allowedTransitions = validRolesByProfile[effectiveProfile] || validRolesByProfile.None;
  if (!allowedTransitions.includes(requestedRole)) {
    throw new AppError(
      400,
      effectiveProfile === "Faculty"
        ? "Faculty profiles can only be assigned faculty, class teacher, time table coordinator, attendance coordinator, or HOD roles"
        : effectiveProfile === "Student"
          ? "Student profiles can only be assigned the student role"
          : "Admin and principal roles can only be assigned to accounts without a faculty or student profile"
    );
  }

  const previous = {
    role: user.role,
    permissions: user.permissions,
  };

  if (String(user.role) === requestedRole) {
    return sendSuccess(res, 200, "User role already set", { user });
  }

  user.role = requestedRole;
  user.permissions = [
    ...new Set([
      ...User.getDefaultPermissions(requestedRole),
      ...((Array.isArray(additionalPermissions) ? additionalPermissions : []).filter(Boolean)),
    ]),
  ];

  await user.save();

  await AuditLog.logEdit({
    action: "edit",
    performedBy: req.user,
    targetModel: "User",
    targetId: user._id,
    previousValue: previous,
    newValue: {
      role: user.role,
      permissions: user.permissions,
    },
    req,
    reason: "role_change",
  });

  return sendSuccess(res, 200, "User role updated", { user });
});

const getSystemAuditLogs = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const query = {};

  if (req.query.action) {
    query.action = req.query.action;
  }

  if (req.query.userId && mongoose.Types.ObjectId.isValid(String(req.query.userId))) {
    query.performedBy = new mongoose.Types.ObjectId(String(req.query.userId));
  }

  if (req.query.fromDate || req.query.toDate) {
    query.createdAt = {};
    if (req.query.fromDate) query.createdAt.$gte = new Date(req.query.fromDate);
    if (req.query.toDate) query.createdAt.$lte = new Date(req.query.toDate);
  }

  const logs = await AuditLog.find(query)
    .populate({ path: "performedBy", select: "email role profileId" })
    .sort({ createdAt: -1 })
    .lean();

  let filtered = logs;

  if (req.query.deptId && mongoose.Types.ObjectId.isValid(String(req.query.deptId))) {
    const attendanceIds = logs.map((log) => log.targetId);
    const rows = await Attendance.find({
      _id: { $in: attendanceIds },
      departmentId: new mongoose.Types.ObjectId(String(req.query.deptId)),
    })
      .select("_id")
      .lean();

    const allowed = new Set(rows.map((row) => String(row._id)));
    filtered = logs.filter((log) => allowed.has(String(log.targetId)));
  }

  const total = filtered.length;
  const paged = filtered.slice(skip, skip + limit);

  return sendPaginated(res, 200, "System audit logs fetched", paged, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

const getCollegeDashboardStats = catchAsync(async (req, res) => {
  const thirtyDaysAgo = dateHelper.toMidnightUTC(new Date());
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);

  const twelveMonthsAgo = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 11, 1));

  const [
    attendanceTrend,
    departments,
    monthWiseAttendance,
    alertSmsByMonth,
  ] = await Promise.all([
    Attendance.aggregate([
      { $match: { date: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: "$date",
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ["$status", "P"] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ["$status", "L"] }, 1, 0] } },
        },
      },
      {
        $project: {
          date: "$_id",
          attendanceRate: {
            $cond: [
              { $gt: ["$total", 0] },
              {
                $multiply: [
                  {
                    $divide: [
                      {
                        $add: [
                          "$present",
                          { $multiply: ["$late", 0.5] },
                        ],
                      },
                      "$total",
                    ],
                  },
                  100,
                ],
              },
              0,
            ],
          },
        },
      },
      { $sort: { date: 1 } },
    ]),
    Department.find({ isActive: true }).select("_id name code").lean(),
    Attendance.aggregate([
      { $match: { date: { $gte: twelveMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
          },
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ["$status", "P"] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ["$status", "L"] }, 1, 0] } },
        },
      },
      {
        $project: {
          label: {
            $concat: [
              { $toString: "$_id.year" },
              "-",
              {
                $cond: [
                  { $lt: ["$_id.month", 10] },
                  { $concat: ["0", { $toString: "$_id.month" }] },
                  { $toString: "$_id.month" },
                ],
              },
            ],
          },
          attendanceRate: {
            $cond: [
              { $gt: ["$total", 0] },
              {
                $multiply: [
                  {
                    $divide: [
                      {
                        $add: [
                          "$present",
                          { $multiply: ["$late", 0.5] },
                        ],
                      },
                      "$total",
                    ],
                  },
                  100,
                ],
              },
              0,
            ],
          },
        },
      },
      { $sort: { label: 1 } },
    ]),
    AuditLog.aggregate([
      {
        $match: {
          createdAt: { $gte: twelveMonthsAgo },
          reason: { $regex: "alert|sms", $options: "i" },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          label: {
            $concat: [
              { $toString: "$_id.year" },
              "-",
              {
                $cond: [
                  { $lt: ["$_id.month", 10] },
                  { $concat: ["0", { $toString: "$_id.month" }] },
                  { $toString: "$_id.month" },
                ],
              },
            ],
          },
          count: 1,
        },
      },
      { $sort: { label: 1 } },
    ]),
  ]);

  const deptComparison = [];
  for (const department of departments) {
    const avg = await buildAverageAttendance({ departmentId: department._id });
    deptComparison.push({
      deptName: department.code || department.name,
      avgPercentage: avg,
    });
  }

  return sendSuccess(res, 200, "College dashboard stats fetched", {
    attendanceTrendLast30Days: attendanceTrend.map((item) => ({
      date: item.date,
      attendanceRate: Number(item.attendanceRate.toFixed(2)),
    })),
    deptComparison,
    monthWiseAttendanceRates: monthWiseAttendance.map((item) => ({
      month: item.label,
      attendanceRate: Number(item.attendanceRate.toFixed(2)),
    })),
    alertSmsCountPerMonth: alertSmsByMonth.map((item) => ({
      month: item.label,
      count: item.count,
    })),
  });
});

module.exports = {
  getDashboardOverview,
  getStudents,
  createStudent,
  bulkCreateStudents,
  updateStudent,
  deactivateStudent,
  getFaculty,
  createFaculty,
  updateFaculty,
  deactivateFaculty,
  getSubjects,
  createSubject,
  updateSubject,
  deactivateSubject,
  getTimetables,
  createTimetable,
  updateTimetable,
  deactivateTimetable,
  getDepartments,
  createDepartment,
  updateDepartment,
  deactivateDepartment,
  manageHODs,
  createHODWithAccount,
  createFacultyWithAccount,
  setAttendanceThreshold,
  manageAcademicYear,
  generateCollegeReport,
  generateEligibilityReport,
  getRoleManagement,
  updateUserRole,
  getSystemAuditLogs,
  getCollegeDashboardStats,
};
