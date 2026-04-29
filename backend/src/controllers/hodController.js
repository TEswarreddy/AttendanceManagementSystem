const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const {
  EditApprovalRequest,
  Attendance,
  Timetable,
  Faculty,
  Student,
  Department,
  AuditLog,
  ShortageList,
  EligibilityReport,
} = require("../models");
const { catchAsync, AppError } = require("../utils/AppError");
const { sendSuccess, sendPaginated } = require("../utils/responseHelper");
const emailService = require("../services/emailService");
const smsAlertService = require("../services/smsAlertService");
const { createDepartmentNotification } = require("../services/departmentNotificationService");
const dateHelper = require("../utils/dateHelper");
const attendanceCalc = require("../utils/attendanceCalc");

const User = mongoose.models.User || mongoose.model("User");
void Department;
void EligibilityReport;
void smsAlertService;

const deptCalendarEventSchema = new mongoose.Schema(
  {
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    date: {
      type: Date,
      required: true,
    },
    type: {
      type: String,
      enum: ["holiday", "exam", "event"],
      default: "event",
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    excludeFromAttendance: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "department_calendar_events",
  }
);

const DeptCalendarEvent =
  mongoose.models.DeptCalendarEvent || mongoose.model("DeptCalendarEvent", deptCalendarEventSchema);

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const normalizePage = (query) => {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(100, toPositiveInt(query.limit, 20));
  return { page, limit, skip: (page - 1) * limit };
};


const resolveClassTeacherForClass = async ({ departmentId, semester, section, academicYear }) => {
  const normalizedSection = String(section || '').toUpperCase();
  const normalizedAcademicYear = String(academicYear || '').trim();

  const faculty = await Faculty.findOne({
    departmentId,
    isActive: true,
    "classTeacherAssignment.semester": Number(semester),
    "classTeacherAssignment.section": normalizedSection,
    "classTeacherAssignment.academicYear": normalizedAcademicYear,
  })
    .select('_id')
    .lean();

  return faculty?._id || null;
};

const getHodDepartmentId = async (req) => {
  if (req.user?.departmentId && mongoose.Types.ObjectId.isValid(String(req.user.departmentId))) {
    return new mongoose.Types.ObjectId(String(req.user.departmentId));
  }

  const profileId = req.user?.profileId;
  if (!profileId || !mongoose.Types.ObjectId.isValid(String(profileId))) {
    throw new AppError(403, "Department-scoped profile not linked");
  }

  const faculty = await Faculty.findById(profileId).select("departmentId isActive").lean();
  if (!faculty?.departmentId || faculty.isActive === false) {
    throw new AppError(403, "Department context not found");
  }

  return new mongoose.Types.ObjectId(String(faculty.departmentId));
};

const assignTimeTableCoordinator = catchAsync(async (req, res) => {
  const hodDeptId = await getHodDepartmentId(req);
  const { facultyId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(String(facultyId))) {
    throw new AppError(400, "Valid facultyId is required");
  }

  const [department, faculty] = await Promise.all([
    Department.findById(hodDeptId),
    Faculty.findOne({
      _id: facultyId,
      departmentId: hodDeptId,
      isActive: true,
    }).select("_id name departmentId"),
  ]);

  if (!department) {
    throw new AppError(404, "Department not found");
  }

  if (!faculty) {
    throw new AppError(404, "Faculty not found in your department");
  }

  const previousCoordinatorId = department.timeTableCoordinatorId
    ? String(department.timeTableCoordinatorId)
    : null;

  if (previousCoordinatorId && previousCoordinatorId !== String(faculty._id)) {
    await User.updateOne(
      {
        profileId: department.timeTableCoordinatorId,
        profileModel: "Faculty",
        role: "time_table_coordinator",
      },
      {
        $set: {
          role: "faculty",
          permissions: User.getDefaultPermissions("faculty"),
        },
      }
    );
  }

  await User.findOneAndUpdate(
    {
      profileId: faculty._id,
      profileModel: "Faculty",
      isActive: true,
    },
    {
      $set: {
        role: "time_table_coordinator",
        permissions: User.getDefaultPermissions("time_table_coordinator"),
      },
    },
    {
      new: true,
    }
  );

  department.timeTableCoordinatorId = faculty._id;
  await department.save();

  await createDepartmentNotification({
    title: "Faculty Role Assigned",
    message: "HOD assigned Timetable Coordinator role.",
    sentBy: req.user._id,
    departmentId: hodDeptId,
    recipientRoles: ["admin"],
  });

  return sendSuccess(res, 200, "Time Table Coordinator assigned", {
    departmentId: department._id,
    facultyId: faculty._id,
    facultyName: faculty.name,
  });
});

const assignAttendanceCoordinator = catchAsync(async (req, res) => {
  const hodDeptId = await getHodDepartmentId(req);
  const { facultyId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(String(facultyId))) {
    throw new AppError(400, "Valid facultyId is required");
  }

  const faculty = await Faculty.findOne({
    _id: facultyId,
    departmentId: hodDeptId,
    isActive: true,
  }).select("_id name");

  if (!faculty) {
    throw new AppError(404, "Faculty not found in your department");
  }

  const user = await User.findOneAndUpdate(
    {
      profileId: faculty._id,
      profileModel: "Faculty",
      isActive: true,
    },
    {
      $set: {
        role: "attendance_coordinator",
        permissions: User.getDefaultPermissions("attendance_coordinator"),
      },
    },
    { new: true }
  );

  if (!user) {
    throw new AppError(404, "Linked user account not found for selected faculty");
  }

  await createDepartmentNotification({
    title: "Faculty Role Assigned",
    message: "HOD assigned Attendance Coordinator role.",
    sentBy: req.user._id,
    departmentId: hodDeptId,
    recipientRoles: ["admin"],
  });

  return sendSuccess(res, 200, "Attendance Coordinator assigned", {
    facultyId: faculty._id,
    facultyName: faculty.name,
    userId: user._id,
    role: user.role,
  });
});


const removeAttendanceCoordinator = catchAsync(async (req, res) => {
  const hodDeptId = await getHodDepartmentId(req);
  const { facultyId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(String(facultyId))) {
    throw new AppError(400, "Valid facultyId is required");
  }

  const faculty = await Faculty.findOne({ _id: facultyId, departmentId: hodDeptId, isActive: true }).select("_id name");
  if (!faculty) {
    throw new AppError(404, "Faculty not found in your department");
  }

  const user = await User.findOneAndUpdate(
    { profileId: faculty._id, profileModel: "Faculty", isActive: true },
    { $set: { role: "faculty", permissions: User.getDefaultPermissions("faculty") } },
    { new: true }
  );

  if (!user) {
    throw new AppError(404, "Linked user account not found for selected faculty");
  }

  return sendSuccess(res, 200, "Attendance Coordinator removed", {
    facultyId: faculty._id,
    facultyName: faculty.name,
    userId: user._id,
    role: user.role,
  });
});

const updateAttendanceCoordinator = catchAsync(async (req, res) => {
  const hodDeptId = await getHodDepartmentId(req);
  const { previousFacultyId, nextFacultyId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(String(previousFacultyId)) || !mongoose.Types.ObjectId.isValid(String(nextFacultyId))) {
    throw new AppError(400, "Valid previousFacultyId and nextFacultyId are required");
  }

  if (String(previousFacultyId) === String(nextFacultyId)) {
    throw new AppError(400, "previousFacultyId and nextFacultyId must be different");
  }

  const [previousFaculty, nextFaculty] = await Promise.all([
    Faculty.findOne({ _id: previousFacultyId, departmentId: hodDeptId, isActive: true }).select("_id name"),
    Faculty.findOne({ _id: nextFacultyId, departmentId: hodDeptId, isActive: true }).select("_id name"),
  ]);

  if (!previousFaculty || !nextFaculty) {
    throw new AppError(404, "Faculty not found in your department");
  }

  await User.updateOne(
    { profileId: previousFaculty._id, profileModel: "Faculty", isActive: true },
    { $set: { role: "faculty", permissions: User.getDefaultPermissions("faculty") } }
  );

  const updated = await User.findOneAndUpdate(
    { profileId: nextFaculty._id, profileModel: "Faculty", isActive: true },
    { $set: { role: "attendance_coordinator", permissions: User.getDefaultPermissions("attendance_coordinator") } },
    { new: true }
  );

  if (!updated) {
    throw new AppError(404, "Linked user account not found for selected faculty");
  }

  await createDepartmentNotification({
    title: "Faculty Role Assigned",
    message: "HOD reassigned Attendance Coordinator role.",
    sentBy: req.user._id,
    departmentId: hodDeptId,
    recipientRoles: ["admin"],
  });

  return sendSuccess(res, 200, "Attendance Coordinator updated", {
    previousFacultyId: previousFaculty._id,
    previousFacultyName: previousFaculty.name,
    nextFacultyId: nextFaculty._id,
    nextFacultyName: nextFaculty.name,
    userId: updated._id,
  });
});

const ensureSameDepartment = (hodDeptId, requestedDeptId) => {
  if (String(hodDeptId) !== String(requestedDeptId)) {
    throw new AppError(403, "You can only manage your own department");
  }
};

const buildTempPassword = (seed) => {
  const suffix = String(seed || "XXXX").slice(-4).toUpperCase();
  return `${suffix}@123`;
};

const mapDuplicateFacultyCreateError = (error) => {
  if (!error || error.code !== 11000) {
    return null;
  }

  const keyValue = error.keyValue || {};
  const duplicateIndex = String(error.message || "");

  if (keyValue.email || duplicateIndex.includes("index: email_1")) {
    return "Email already exists";
  }

  if (keyValue.phone || duplicateIndex.includes("index: phone_1")) {
    return "Phone already used";
  }

  if (keyValue.employeeId || duplicateIndex.includes("index: employeeId_1")) {
    return "Faculty ID already exists";
  }

  if (keyValue.username || duplicateIndex.includes("index: username_1")) {
    return "Username already exists";
  }

  return "This information already exists";
};

const normalizeExamType = (rawExamType) => {
  const value = String(rawExamType || "").trim().toLowerCase();
  const aliasMap = {
    internal: "internal1",
    model: "internal2",
    semester: "semester_end",
    internal1: "internal1",
    internal2: "internal2",
    internal3: "internal3",
    semester_end: "semester_end",
  };

  return aliasMap[value] || null;
};

const sendApprovalNotification = async (to, decision, request, reviewRemarks) => {
  const statusText = String(decision || "").toLowerCase() === "approved" ? "Approved" : "Rejected";

  if (typeof emailService.sendApprovalNotification === "function") {
    return emailService.sendApprovalNotification(to, decision, request, reviewRemarks);
  }

  const subjectName = request?.subjectId?.name || request?.subjectId?.subjectCode || "Subject";
  const studentName = request?.studentId?.name || "Student";
  const reason = request?.reason || "N/A";

  return emailService.sendEmail({
    to,
    subject: `Attendance Edit Request ${statusText}`,
    text: `Your attendance edit request for ${studentName} (${subjectName}) is ${statusText}. Reason: ${reason}. Remarks: ${reviewRemarks || "N/A"}`,
    html: `<p>Your attendance edit request for <strong>${studentName}</strong> (${subjectName}) is <strong>${statusText}</strong>.</p><p>Reason: ${reason}</p><p>Remarks: ${reviewRemarks || "N/A"}</p>`,
  });
};

const validateScheduleSlots = async ({ departmentId, semester, section, facultyId, schedule, excludeTimetableId }) => {
  const slotKeys = new Set();
  const normalizedSemester = Number(semester);
  const normalizedSection = String(section).toUpperCase();
  const normalizedFacultyId = facultyId ? String(facultyId) : null;

  for (const slot of schedule || []) {
    if (!slot?.day || !Number.isFinite(Number(slot.periodNumber))) {
      throw new AppError(400, "Each schedule slot must include day and periodNumber");
    }

    const normalizedDay = String(slot.day).trim();
    const normalizedPeriodNumber = Number(slot.periodNumber);
    const slotKey = `${normalizedDay.toLowerCase()}-${normalizedPeriodNumber}`;
    if (slotKeys.has(slotKey)) {
      throw new AppError(409, "This class already has a subject in this period");
    }
    slotKeys.add(slotKey);

    const classClash = await Timetable.exists({
      _id: { $ne: excludeTimetableId },
      departmentId,
      semester: normalizedSemester,
      section: normalizedSection,
      isActive: true,
      schedule: {
        $elemMatch: {
          day: normalizedDay,
          periodNumber: normalizedPeriodNumber,
        },
      },
    });

    if (classClash) {
      throw new AppError(409, "This class already has a subject in this period");
    }

    if (normalizedFacultyId) {
      const facultyClash = await Timetable.exists({
        _id: { $ne: excludeTimetableId },
        facultyId: normalizedFacultyId,
        isActive: true,
        schedule: {
          $elemMatch: {
            day: normalizedDay,
            periodNumber: normalizedPeriodNumber,
          },
        },
      });

      if (facultyClash) {
        throw new AppError(409, "Faculty already assigned for this period");
      }
    }
  }
};

const getPendingEditApprovals = catchAsync(async (req, res) => {
  const hodDeptId = await getHodDepartmentId(req);
  const { page, limit, skip } = normalizePage(req.query);

  const rows = await EditApprovalRequest.getPendingForHOD(hodDeptId);
  const total = rows.length;

  const paged = rows.slice(skip, skip + limit).map((row) => ({
    ...row.toObject(),
    facultyName: row?.requestedBy?.profileId?.name || null,
  }));

  return sendPaginated(res, 200, "Pending edit approvals fetched", paged, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

const reviewEditApproval = catchAsync(async (req, res) => {
  const hodDeptId = await getHodDepartmentId(req);
  const { requestId } = req.params;
  const { decision, reviewRemarks } = req.body;

  if (!mongoose.Types.ObjectId.isValid(String(requestId))) {
    throw new AppError(400, "Valid requestId is required");
  }

  if (!["approved", "rejected"].includes(String(decision || ""))) {
    throw new AppError(400, "decision must be approved or rejected");
  }

  const request = await EditApprovalRequest.findById(requestId)
    .populate({ path: "requestedBy", select: "email profileId role" })
    .populate({ path: "studentId", select: "name rollNumber" })
    .populate({ path: "subjectId", select: "name subjectCode" })
    .lean();

  if (!request) {
    throw new AppError(404, "Edit approval request not found");
  }

  const requesterUser = request.requestedBy;
  const requesterFaculty = requesterUser?.profileId
    ? await Faculty.findById(requesterUser.profileId).select("departmentId name").lean()
    : null;

  if (!requesterFaculty?.departmentId || String(requesterFaculty.departmentId) !== String(hodDeptId)) {
    throw new AppError(403, "You cannot review requests outside your department");
  }

  if (request.status !== "pending") {
    throw new AppError(400, "Already reviewed");
  }

  if (decision === "approved") {
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        await Attendance.updateOne(
          { _id: request.attendanceId },
          {
            $set: {
              status: request.requestedStatus,
              editedAt: new Date(),
              editedBy: req.user._id,
            },
          },
          { session }
        );

        await EditApprovalRequest.updateOne(
          { _id: request._id },
          {
            $set: {
              status: "approved",
              reviewedBy: req.user._id,
              reviewedAt: new Date(),
              reviewRemarks: reviewRemarks || null,
            },
          },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }

    await AuditLog.logEdit({
      action: "edit",
      performedBy: req.user,
      targetModel: "Attendance",
      targetId: request.attendanceId,
      previousValue: { status: request.currentStatus },
      newValue: { status: request.requestedStatus },
      req,
      reason: "hod_approved_edit",
    });

    if (requesterUser?.email) {
      await sendApprovalNotification(requesterUser.email, "approved", request, reviewRemarks);
    }
  } else {
    await EditApprovalRequest.updateOne(
      { _id: request._id },
      {
        $set: {
          status: "rejected",
          reviewedBy: req.user._id,
          reviewedAt: new Date(),
          reviewRemarks: reviewRemarks || null,
        },
      }
    );

    if (requesterUser?.email) {
      await sendApprovalNotification(requesterUser.email, "rejected", request, reviewRemarks);
    }
  }

  const updatedRequest = await EditApprovalRequest.findById(request._id)
    .populate({ path: "studentId", select: "name rollNumber" })
    .populate({ path: "subjectId", select: "name subjectCode" })
    .lean();

  return sendSuccess(res, 200, `Edit request ${decision}`, { request: updatedRequest });
});

const createTimetable = catchAsync(async (req, res) => {
  const hodDeptId = await getHodDepartmentId(req);
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

  ensureSameDepartment(hodDeptId, departmentId);

  await validateScheduleSlots({
    departmentId: hodDeptId,
    semester,
    section,
    facultyId,
    schedule,
  });

  const resolvedClassTeacherId = classTeacherId || (await resolveClassTeacherForClass({
    departmentId: hodDeptId,
    semester,
    section,
    academicYear,
  }));

  const timetable = await Timetable.create({
    facultyId,
    classTeacherId: resolvedClassTeacherId,
    subjectId,
    subjectType,
    departmentId: hodDeptId,
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
  const hodDeptId = await getHodDepartmentId(req);
  const { timetableId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(String(timetableId))) {
    throw new AppError(400, "Valid timetableId is required");
  }

  const timetable = await Timetable.findById(timetableId);
  if (!timetable) {
    throw new AppError(404, "Timetable not found");
  }

  if (String(timetable.departmentId) !== String(hodDeptId)) {
    throw new AppError(403, "You can only update your department timetable");
  }

  const nextSchedule = Array.isArray(req.body.schedule) ? req.body.schedule : timetable.schedule;

  await validateScheduleSlots({
    departmentId: timetable.departmentId,
    semester: timetable.semester,
    section: timetable.section,
    facultyId: req.body.facultyId ?? timetable.facultyId,
    schedule: nextSchedule,
    excludeTimetableId: timetable._id,
  });

  if (req.body.facultyId !== undefined) timetable.facultyId = req.body.facultyId;
  if (req.body.classTeacherId !== undefined) timetable.classTeacherId = req.body.classTeacherId;
  if (req.body.subjectId !== undefined) timetable.subjectId = req.body.subjectId;
  if (req.body.subjectType !== undefined) timetable.subjectType = req.body.subjectType;
  if (req.body.academicYear !== undefined) timetable.academicYear = req.body.academicYear;

  if (req.body.classTeacherId === undefined) {
    timetable.classTeacherId = await resolveClassTeacherForClass({
      departmentId: timetable.departmentId,
      semester: timetable.semester,
      section: timetable.section,
      academicYear: timetable.academicYear,
    });
  }

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

const assignClassTeacher = catchAsync(async (req, res) => {
  const hodDeptId = await getHodDepartmentId(req);
  const { facultyId, departmentId, semester, section, academicYear } = req.body;

  if (!facultyId || !departmentId || !semester || !section || !academicYear) {
    throw new AppError(400, "facultyId, departmentId, semester, section and academicYear are required");
  }

  ensureSameDepartment(hodDeptId, departmentId);

  const normalizedAcademicYear = String(academicYear || "").trim();
  const normalizedSection = String(section).toUpperCase();

  const faculty = await Faculty.findOne({
    _id: facultyId,
    departmentId: hodDeptId,
    isActive: true,
  })
    .select("_id name classTeacherAssignment");

  if (!faculty) {
    throw new AppError(404, "Faculty not found in your department");
  }

  faculty.classTeacherAssignment = {
    departmentId: hodDeptId,
    semester: Number(semester),
    section: normalizedSection,
    academicYear: normalizedAcademicYear,
    assignedAt: new Date(),
  };
  await faculty.save();

  await Faculty.updateMany(
    {
      _id: { $ne: faculty._id },
      departmentId: hodDeptId,
      "classTeacherAssignment.semester": Number(semester),
      "classTeacherAssignment.section": normalizedSection,
      "classTeacherAssignment.academicYear": normalizedAcademicYear,
      isActive: true,
    },
    {
      $set: {
        classTeacherAssignment: {
          departmentId: null,
          semester: null,
          section: null,
          academicYear: null,
          assignedAt: null,
        },
      },
    }
  );

  await User.updateMany(
    {
      profileId: faculty._id,
      role: "faculty",
      profileModel: "Faculty",
    },
    {
      $set: {
        role: "class_teacher",
        permissions: User.getDefaultPermissions("class_teacher"),
      },
    }
  );

  const otherTeachers = await Faculty.find({
    departmentId: hodDeptId,
    isActive: true,
    _id: { $ne: faculty._id },
  })
    .select("_id classTeacherAssignment")
    .lean();

  const activeClassTeacherIds = otherTeachers
    .filter(
      (item) =>
        item?.classTeacherAssignment?.semester &&
        item?.classTeacherAssignment?.section &&
        item?.classTeacherAssignment?.academicYear
    )
    .map((item) => item._id);

  await User.updateMany(
    {
      profileId: { $in: otherTeachers.map((item) => item._id).filter((id) => !activeClassTeacherIds.some((ctId) => String(ctId) === String(id))) },
      profileModel: "Faculty",
      role: "class_teacher",
    },
    {
      $set: {
        role: "faculty",
        permissions: User.getDefaultPermissions("faculty"),
      },
    }
  );

  await createDepartmentNotification({
    title: "Faculty Role Assigned",
    message: "HOD assigned Class Teacher role.",
    sentBy: req.user._id,
    departmentId: hodDeptId,
    semester,
    section: normalizedSection,
    recipientRoles: ["admin"],
  });

  return sendSuccess(res, 200, "Class teacher assigned", {
    matchedTimetables: 0,
    updatedTimetables: 0,
    facultyId: faculty._id,
  });
});

const getDeptFaculty = catchAsync(async (req, res) => {
  const hodDeptId = await getHodDepartmentId(req);
  const { page, limit, skip } = normalizePage(req.query);

  const query = {
    departmentId: hodDeptId,
    isActive: true,
  };

  if (req.query.search) {
    const pattern = String(req.query.search).trim();
    query.$or = [
      { name: { $regex: pattern, $options: "i" } },
      { email: { $regex: pattern, $options: "i" } },
    ];
  }

  const [rows, total] = await Promise.all([
    Faculty.find(query).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Faculty.countDocuments(query),
  ]);

  const facultyIds = rows.map((row) => row._id);

  const [timetableRows, attendanceStats, linkedUsers, department] = await Promise.all([
    Timetable.find({ facultyId: { $in: facultyIds }, isActive: true })
      .populate({ path: "subjectId", select: "name subjectCode" })
      .select("facultyId subjectId semester section academicYear")
      .lean(),
    Attendance.aggregate([
      {
        $match: {
          facultyId: { $in: facultyIds },
          departmentId: hodDeptId,
        },
      },
      {
        $group: {
          _id: "$facultyId",
          markedCount: { $sum: 1 },
          presentCount: { $sum: { $cond: [{ $eq: ["$status", "P"] }, 1, 0] } },
          absentCount: { $sum: { $cond: [{ $eq: ["$status", "A"] }, 1, 0] } },
          lateCount: { $sum: { $cond: [{ $eq: ["$status", "L"] }, 1, 0] } },
        },
      },
    ]),
    User.find({ profileId: { $in: facultyIds }, profileModel: "Faculty" }).select("profileId role").lean(),
    Department.findById(hodDeptId).select("timeTableCoordinatorId").lean(),
  ]);

  const assignmentsByFaculty = new Map();
  for (const row of timetableRows) {
    const key = String(row.facultyId);
    const current = assignmentsByFaculty.get(key) || {
      subjects: [],
      classes: [],
    };

    current.subjects.push({
      subjectId: row.subjectId?._id || row.subjectId,
      subjectName: row.subjectId?.name || "Subject",
      subjectCode: row.subjectId?.subjectCode || "-",
    });

    current.classes.push({
      semester: row.semester,
      section: row.section,
      academicYear: row.academicYear,
    });

    assignmentsByFaculty.set(key, current);
  }

  const statsMap = new Map(attendanceStats.map((item) => [String(item._id), item]));

  const roleMap = new Map(linkedUsers.map((item) => [String(item.profileId), item.role]));
  const currentCoordinatorId = String(department?.timeTableCoordinatorId || "");

  const faculty = rows.map((row) => {
    const assignment = assignmentsByFaculty.get(String(row._id)) || { subjects: [], classes: [] };
    const stat = statsMap.get(String(row._id)) || {
      markedCount: 0,
      presentCount: 0,
      absentCount: 0,
      lateCount: 0,
    };

    const uniqueSubjects = Array.from(
      new Map(assignment.subjects.map((subject) => [String(subject.subjectId), subject])).values()
    );

    const officialAssignment =
      row?.classTeacherAssignment?.semester &&
      row?.classTeacherAssignment?.section &&
      row?.classTeacherAssignment?.academicYear
        ? [
            {
              semester: row.classTeacherAssignment.semester,
              section: row.classTeacherAssignment.section,
              academicYear: row.classTeacherAssignment.academicYear,
            },
          ]
        : [];

    return {
      ...row,
      userRole: roleMap.get(String(row._id)) || "faculty",
      isTimeTableCoordinator: currentCoordinatorId === String(row._id),
      subjectsAssigned: uniqueSubjects,
      classesAssigned: officialAssignment,
      attendanceStats: {
        markedCount: stat.markedCount,
        presentCount: stat.presentCount,
        absentCount: stat.absentCount,
        lateCount: stat.lateCount,
      },
    };
  });

  return sendPaginated(res, 200, "Department faculty fetched", faculty, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

const addFaculty = catchAsync(async (req, res) => {
  const hodDeptId = await getHodDepartmentId(req);
  const {
    name,
    email,
    phone,
    designation = "Assistant Professor",
    specialization,
  } = req.body;

  const normalizedName = String(name || "").trim();
  const normalizedEmail = String(email || "").toLowerCase().trim();
  const normalizedPhone = String(phone || "").trim() || null;
  const allowedDesignation = ["Assistant Professor", "Associate Professor", "Professor", "HOD"];
  const resolvedDesignation = allowedDesignation.includes(String(designation || ""))
    ? String(designation)
    : "Assistant Professor";

  if (!normalizedName || !normalizedEmail) {
    throw new AppError(400, "name and email are required");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    throw new AppError(400, "Valid email is required");
  }

  if (normalizedPhone && !/^\+?[0-9]{10,15}$/.test(normalizedPhone)) {
    throw new AppError(400, "Phone must be 10-15 digits");
  }

  const [existingFacultyByEmail, existingUserByEmail, existingFacultyByPhone] = await Promise.all([
    Faculty.findOne({ email: normalizedEmail }).select("_id departmentId").lean(),
    User.findOne({ email: normalizedEmail }).select("_id").lean(),
    normalizedPhone ? Faculty.findOne({ phone: normalizedPhone }).select("_id").lean() : null,
  ]);

  if (existingFacultyByEmail) {
    if (String(existingFacultyByEmail.departmentId) === String(hodDeptId)) {
      throw new AppError(409, "Faculty already assigned to your department");
    }

    throw new AppError(409, "Email already exists");
  }

  if (existingUserByEmail) {
    throw new AppError(409, "Email already exists");
  }

  if (existingFacultyByPhone) {
    throw new AppError(409, "Phone already used");
  }

  const session = await mongoose.startSession();
  let faculty = null;
  let user = null;

  try {
    await session.withTransaction(async () => {
      const facultyList = await Faculty.create(
        [
          {
            name: normalizedName,
            email: normalizedEmail,
            phone: normalizedPhone,
            designation: resolvedDesignation,
            specialization: String(specialization || "").trim() || null,
            departmentId: hodDeptId,
            isActive: true,
          },
        ],
        { session }
      );

      faculty = facultyList[0];
      const temporaryPassword = buildTempPassword(faculty.employeeId || normalizedEmail);
      const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

      const userList = await User.create(
        [
          {
            email: normalizedEmail,
            passwordHash: hashedPassword,
            role: "faculty",
            profileId: faculty._id,
            profileModel: "Faculty",
            isActive: true,
          },
        ],
        { session }
      );

      user = userList[0];
      faculty.temporaryPassword = temporaryPassword;
    });
  } catch (error) {
    const duplicateMessage = mapDuplicateFacultyCreateError(error);
    if (duplicateMessage) {
      throw new AppError(409, duplicateMessage);
    }
    throw error;
  } finally {
    await session.endSession();
  }

  await emailService.sendEmail({
    to: faculty.email,
    subject: "Welcome to Attendance Management System",
    text: `Welcome ${faculty.name}. Login email: ${faculty.email}. Temporary password: ${faculty.temporaryPassword}`,
    html: `<p>Welcome ${faculty.name},</p><p>Your account has been created.</p><p>Email: <strong>${faculty.email}</strong><br/>Temporary Password: <strong>${faculty.temporaryPassword}</strong></p>`,
  });

  await createDepartmentNotification({
    title: "Faculty Created",
    message: "HOD created a faculty profile.",
    sentBy: req.user._id,
    departmentId: hodDeptId,
    recipientRoles: ["admin"],
  });

  const responseFaculty = faculty.toObject ? faculty.toObject() : faculty;
  if (responseFaculty?.temporaryPassword) {
    delete responseFaculty.temporaryPassword;
  }

  return sendSuccess(res, 201, "Faculty added", {
    faculty: responseFaculty,
    userId: user?._id || null,
    temporaryPassword: faculty.temporaryPassword,
  });
});

const getLowAttendanceDept = catchAsync(async (req, res) => {
  const hodDeptId = await getHodDepartmentId(req);
  const threshold = Number(req.query.threshold || 75);
  const { page, limit } = normalizePage(req.query);

  const query = {
    departmentId: hodDeptId,
    isActive: true,
  };

  if (req.query.semester) {
    query.semester = Number(req.query.semester);
  }

  if (req.query.section) {
    query.section = String(req.query.section).toUpperCase();
  }

  const students = await Student.find(query)
    .select("_id rollNumber name semester section")
    .sort({ semester: 1, section: 1, rollNumber: 1 })
    .lean();

  const grouped = new Map();

  for (const student of students) {
    const summary = await Attendance.getStudentSummary(student._id);
    const lowSubjects = summary.filter((item) => Number(item.percentage) < threshold);

    if (!lowSubjects.length) {
      continue;
    }

    const key = `${student.semester}-${student.section}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        semester: student.semester,
        section: student.section,
        students: [],
      });
    }

    grouped.get(key).students.push({
      studentId: student._id,
      rollNumber: student.rollNumber,
      name: student.name,
      subjectBreakdown: lowSubjects,
    });
  }

  const classes = [...grouped.values()].sort((a, b) => {
    if (a.semester !== b.semester) return a.semester - b.semester;
    return String(a.section).localeCompare(String(b.section));
  });

  const total = classes.length;
  const skip = (page - 1) * limit;
  const paged = classes.slice(skip, skip + limit);

  return sendPaginated(res, 200, "Low attendance report fetched", paged, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    threshold,
  });
});

const generateShortageList = catchAsync(async (req, res) => {
  const hodDeptId = await getHodDepartmentId(req);
  const {
    semester,
    section,
    academicYear,
    examType: rawExamType,
    threshold = 75,
  } = req.body;

  const examType = normalizeExamType(rawExamType);

  if (!semester || !section || !academicYear || !examType) {
    throw new AppError(400, "semester, section, academicYear and examType are required");
  }

  const students = await Student.find({
    departmentId: hodDeptId,
    semester: Number(semester),
    section: String(section).toUpperCase(),
    isActive: true,
  })
    .select("_id rollNumber name")
    .lean();

  const timetables = await Timetable.find({
    departmentId: hodDeptId,
    semester: Number(semester),
    section: String(section).toUpperCase(),
    academicYear,
    isActive: true,
  })
    .populate({ path: "subjectId", select: "name subjectCode" })
    .lean();

  const subjectMap = new Map();
  for (const row of timetables) {
    const subjectId = String(row.subjectId?._id || row.subjectId);
    if (!subjectMap.has(subjectId)) {
      subjectMap.set(subjectId, {
        subjectId: row.subjectId?._id || row.subjectId,
        subjectName: row.subjectId?.name || "Subject",
        subjectCode: row.subjectId?.subjectCode || "-",
      });
    }
  }

  const subjects = [...subjectMap.values()];

  const studentEntries = [];

  for (const student of students) {
    const subjectShortages = [];
    let totalClasses = 0;
    let weightedPresent = 0;

    for (const subject of subjects) {
      const records = await Attendance.find({
        studentId: student._id,
        subjectId: subject.subjectId,
        departmentId: hodDeptId,
      })
        .select("status")
        .lean();

      const total = records.length;
      const present = records.filter((r) => r.status === "P").length;
      const late = records.filter((r) => r.status === "L").length;
      const percentage = attendanceCalc.calculatePercentage(present, late, total);

      totalClasses += total;
      weightedPresent += present + late * 0.5;

      if (percentage < Number(threshold)) {
        subjectShortages.push({
          subjectId: subject.subjectId,
          subjectName: subject.subjectName,
          subjectCode: subject.subjectCode,
          percentage,
          shortageBy: Number((Number(threshold) - percentage).toFixed(2)),
        });
      }
    }

    const overallPercentage = totalClasses > 0 ? Number(((weightedPresent / totalClasses) * 100).toFixed(2)) : 0;
    const isEligible = subjectShortages.length === 0;

    if (!isEligible) {
      studentEntries.push({
        studentId: student._id,
        rollNumber: student.rollNumber,
        name: student.name,
        subjectShortages,
        overallPercentage,
        isEligible,
      });
    }
  }

  const shortageList = await ShortageList.create({
    generatedBy: req.user._id,
    departmentId: hodDeptId,
    semester: Number(semester),
    section: String(section).toUpperCase(),
    academicYear,
    examType,
    thresholdUsed: Number(threshold),
    generatedAt: new Date(),
    students: studentEntries,
    totalStudents: students.length,
    shortageCount: studentEntries.length,
    isPublished: false,
  });

  return sendSuccess(res, 201, "Shortage list generated", { shortageList });
});

const getAuditLogs = catchAsync(async (req, res) => {
  const hodDeptId = await getHodDepartmentId(req);
  const { page, limit, skip } = normalizePage(req.query);

  const query = {
    targetModel: "Attendance",
  };

  if (req.query.action) {
    query.action = req.query.action;
  }

  if (req.query.fromDate || req.query.toDate) {
    query.createdAt = {};
    if (req.query.fromDate) query.createdAt.$gte = new Date(req.query.fromDate);
    if (req.query.toDate) query.createdAt.$lte = new Date(req.query.toDate);
  }

  if (req.query.facultyId && mongoose.Types.ObjectId.isValid(String(req.query.facultyId))) {
    const userIds = await User.find({
      profileId: new mongoose.Types.ObjectId(String(req.query.facultyId)),
      profileModel: "Faculty",
    })
      .select("_id")
      .lean();

    query.performedBy = { $in: userIds.map((user) => user._id) };
  }

  const logs = await AuditLog.find(query)
    .populate({ path: "performedBy", select: "email role profileId" })
    .sort({ createdAt: -1 })
    .lean();

  const attendanceIds = logs.map((log) => log.targetId).filter(Boolean);

  const attendanceRows = await Attendance.find({
    _id: { $in: attendanceIds },
    departmentId: hodDeptId,
    ...(req.query.studentId && mongoose.Types.ObjectId.isValid(String(req.query.studentId))
      ? { studentId: new mongoose.Types.ObjectId(String(req.query.studentId)) }
      : {}),
  })
    .select("_id studentId subjectId facultyId departmentId date periodNumber")
    .lean();

  const allowedAttendanceIds = new Set(attendanceRows.map((row) => String(row._id)));

  const filteredLogs = logs.filter((log) => allowedAttendanceIds.has(String(log.targetId)));
  const total = filteredLogs.length;
  const paged = filteredLogs.slice(skip, skip + limit);

  return sendPaginated(res, 200, "Audit logs fetched", paged, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

const manageDeptCalendar = catchAsync(async (req, res) => {
  const hodDeptId = await getHodDepartmentId(req);

  if (req.method === "GET") {
    const { page, limit, skip } = normalizePage(req.query);
    const filter = { departmentId: hodDeptId };

    if (req.query.type) {
      filter.type = req.query.type;
    }

    if (req.query.fromDate || req.query.toDate) {
      filter.date = {};
      if (req.query.fromDate) filter.date.$gte = new Date(req.query.fromDate);
      if (req.query.toDate) filter.date.$lte = new Date(req.query.toDate);
    }

    const [items, total] = await Promise.all([
      DeptCalendarEvent.find(filter).sort({ date: 1 }).skip(skip).limit(limit).lean(),
      DeptCalendarEvent.countDocuments(filter),
    ]);

    return sendPaginated(res, 200, "Department calendar events fetched", items, {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }

  if (req.method === "POST") {
    const { title, date, type = "event", description, excludeFromAttendance = true } = req.body;

    if (!title || !date) {
      throw new AppError(400, "title and date are required");
    }

    const event = await DeptCalendarEvent.create({
      departmentId: hodDeptId,
      title,
      date: dateHelper.toMidnightUTC(date),
      type,
      description: description || null,
      excludeFromAttendance: Boolean(excludeFromAttendance),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    return sendSuccess(res, 201, "Department calendar event created", { event });
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const eventId = req.params.eventId || req.body.eventId;

    if (!mongoose.Types.ObjectId.isValid(String(eventId))) {
      throw new AppError(400, "Valid eventId is required");
    }

    const event = await DeptCalendarEvent.findOne({ _id: eventId, departmentId: hodDeptId });
    if (!event) {
      throw new AppError(404, "Calendar event not found");
    }

    if (req.body.title !== undefined) event.title = req.body.title;
    if (req.body.date !== undefined) event.date = dateHelper.toMidnightUTC(req.body.date);
    if (req.body.type !== undefined) event.type = req.body.type;
    if (req.body.description !== undefined) event.description = req.body.description;
    if (req.body.excludeFromAttendance !== undefined) {
      event.excludeFromAttendance = Boolean(req.body.excludeFromAttendance);
    }

    event.updatedBy = req.user._id;
    await event.save();

    return sendSuccess(res, 200, "Department calendar event updated", { event });
  }

  if (req.method === "DELETE") {
    const eventId = req.params.eventId || req.body.eventId;

    if (!mongoose.Types.ObjectId.isValid(String(eventId))) {
      throw new AppError(400, "Valid eventId is required");
    }

    const result = await DeptCalendarEvent.deleteOne({ _id: eventId, departmentId: hodDeptId });
    if (result.deletedCount === 0) {
      throw new AppError(404, "Calendar event not found");
    }

    return sendSuccess(res, 200, "Department calendar event deleted", { eventId });
  }

  throw new AppError(405, "Method not allowed");
});

module.exports = {
  getPendingEditApprovals,
  reviewEditApproval,
  createTimetable,
  updateTimetable,
  assignClassTeacher,
  getDeptFaculty,
  addFaculty,
  assignTimeTableCoordinator,
  assignAttendanceCoordinator,
  removeAttendanceCoordinator,
  updateAttendanceCoordinator,
  getLowAttendanceDept,
  generateShortageList,
  getAuditLogs,
  manageDeptCalendar,
};
