const mongoose = require("mongoose");

const { Notice, Student, Faculty, Attendance, User } = require("../models");
const { catchAsync, AppError } = require("../utils/AppError");
const { sendSuccess, sendPaginated } = require("../utils/responseHelper");

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const getRecipientRoleFilter = (role) => {
  if (role === "time_table_coordinator") {
    return {
      $or: [
        { recipientRoles: "time_table_coordinator" },
        { recipientRoles: "attendance_coordinator" },
        { recipientRoles: "faculty" },
      ],
    };
  }

  if (role === "attendance_coordinator") {
    return {
      $or: [
        { recipientRoles: "attendance_coordinator" },
        { recipientRoles: "faculty" },
      ],
    };
  }

  if (role === "student") {
    return {
      $or: [
        { recipientRoles: "student" },
        { recipientRoles: { $exists: false } },
      ],
    };
  }

  return { recipientRoles: role };
};

const getRoleContext = async (user) => {
  const role = String(user?.role || "").toLowerCase();

  if (role === "student") {
    const student = await Student.findById(user.profileId)
      .select("_id departmentId semester section isActive")
      .lean();

    if (!student || student.isActive === false) {
      throw new AppError(404, "Student profile not found");
    }

    return {
      role,
      student,
      noticeFilter: {
        targetDept: student.departmentId,
        targetSemester: Number(student.semester),
        targetSection: String(student.section || "").toUpperCase(),
        ...getRecipientRoleFilter(role),
      },
    };
  }

  if (["faculty", "class_teacher", "time_table_coordinator", "attendance_coordinator", "hod"].includes(role)) {
    const faculty = await Faculty.findById(user.profileId)
      .select("_id departmentId isActive")
      .lean();

    if (!faculty || faculty.isActive === false) {
      throw new AppError(404, "Faculty profile not found");
    }

    return {
      role,
      faculty,
      noticeFilter: {
        targetDept: faculty.departmentId,
        ...getRecipientRoleFilter(role),
      },
    };
  }

  if (["admin", "principal"].includes(role)) {
    return {
      role,
      noticeFilter: getRecipientRoleFilter(role),
    };
  }

  throw new AppError(403, "Notifications are not available for this role");
};

const mapUnread = (notice, ctx, userId) => {
  const readByUsers = Array.isArray(notice.readByUsers) ? notice.readByUsers : [];
  const byUser = readByUsers.some((id) => String(id) === String(userId));

  if (ctx.role === "student") {
    const readBy = Array.isArray(notice.readBy) ? notice.readBy : [];
    const byStudent = readBy.some((id) => String(id) === String(ctx.student._id));
    return !(byUser || byStudent);
  }

  return !byUser;
};

const getNotifications = catchAsync(async (req, res) => {
  const ctx = await getRoleContext(req.user);
  const page = toPositiveInt(req.query.page, 1);
  const limit = Math.min(100, toPositiveInt(req.query.limit, 20));

  const filter = { ...ctx.noticeFilter };
  const type = String(req.query.type || "").trim().toLowerCase();
  if (type && type !== "all") {
    filter.type = type;
  }

  const [rows, total, threshold, summaryRows] = await Promise.all([
    Notice.find(filter)
      .populate({ path: "sentBy", select: "email role" })
      .sort({ isPinned: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notice.countDocuments(filter),
    ctx.role === "student" ? Number(process.env.ATTENDANCE_THRESHOLD || 75) : null,
    ctx.role === "student" ? Attendance.getStudentSummary(ctx.student._id) : null,
  ]);

  const items = rows.map((notice) => ({
    id: notice._id,
    type: "notice",
    title: notice.title,
    message: notice.message,
    noticeType: notice.type,
    unread: mapUnread(notice, ctx, req.user._id),
    isPinned: Boolean(notice.isPinned),
    createdAt: notice.createdAt,
    details: {
      targetSemester: notice.targetSemester,
      targetSection: notice.targetSection,
      sentBy: notice.sentBy?.email || null,
      senderRole: notice.sentBy?.role || null,
    },
  }));

  if (ctx.role === "student") {
    const alerts = (summaryRows || [])
      .filter((row) => Number(row.percentage || 0) < threshold)
      .map((row) => ({
        id: `alert-${row.subjectId}`,
        type: "alert",
        title: "Low Attendance Warning",
        message: `${row.subjectName} attendance is ${Number(row.percentage || 0).toFixed(2)}% (required ${threshold}%).`,
        unread: true,
        isPinned: false,
        createdAt: new Date().toISOString(),
        details: {
          subjectId: row.subjectId,
          subjectName: row.subjectName,
          percentage: row.percentage,
          threshold,
        },
      }));

    items.unshift(...alerts);
  }

  const sorted = items.sort((left, right) => {
    if (Boolean(left.unread) !== Boolean(right.unread)) {
      return left.unread ? -1 : 1;
    }
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  return sendPaginated(res, 200, "Notifications fetched", sorted, {
    page,
    limit,
    total: Math.max(total, sorted.length),
    totalPages: Math.max(1, Math.ceil(Math.max(total, sorted.length) / limit)),
  });
});

const getUnreadCount = catchAsync(async (req, res) => {
  const ctx = await getRoleContext(req.user);

  const notices = await Notice.find(ctx.noticeFilter)
    .select("_id readBy readByUsers")
    .lean();

  let count = notices.filter((notice) => mapUnread(notice, ctx, req.user._id)).length;

  if (ctx.role === "student") {
    const threshold = Number(process.env.ATTENDANCE_THRESHOLD || 75);
    const summaryRows = await Attendance.getStudentSummary(ctx.student._id);
    count += (summaryRows || []).filter((row) => Number(row.percentage || 0) < threshold).length;
  }

  return sendSuccess(res, 200, "Unread count fetched", { unreadCount: count });
});

const markAsRead = catchAsync(async (req, res) => {
  const { notificationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(String(notificationId))) {
    throw new AppError(400, "Valid notificationId is required");
  }

  const ctx = await getRoleContext(req.user);

  const notice = await Notice.findOne({
    _id: new mongoose.Types.ObjectId(String(notificationId)),
    ...ctx.noticeFilter,
  })
    .select("_id")
    .lean();

  if (!notice) {
    throw new AppError(404, "Notification not found");
  }

  const update = {
    $addToSet: {
      readByUsers: req.user._id,
    },
  };

  if (ctx.role === "student") {
    update.$addToSet.readBy = ctx.student._id;
  }

  await Notice.updateOne({ _id: notice._id }, update);

  return sendSuccess(res, 200, "Notification marked as read", { notificationId: notice._id });
});

const markAllAsRead = catchAsync(async (req, res) => {
  const ctx = await getRoleContext(req.user);

  const update = {
    $addToSet: {
      readByUsers: req.user._id,
    },
  };

  if (ctx.role === "student") {
    update.$addToSet.readBy = ctx.student._id;
  }

  await Notice.updateMany(ctx.noticeFilter, update);

  return sendSuccess(res, 200, "All notifications marked as read", { success: true });
});

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
