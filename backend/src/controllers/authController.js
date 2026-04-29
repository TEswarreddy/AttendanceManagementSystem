const { User, Student, Faculty, UserProfile } = require("../models");
const jwtHelper = require("../utils/jwtHelper");
const { setEx, get, del } = require("../config/redis");
const { catchAsync, AppError } = require("../utils/AppError");
const { sendSuccess } = require("../utils/responseHelper");
const emailService = require("../services/emailService");

const populateUserProfile = async (user) => {
  if (!user || !user.profileId) {
    return user;
  }

  if (user.role === "student") {
    await user.populate({ path: "profileId", select: "name rollNumber" });
    return user;
  }

  if (user.role === "faculty" || user.role === "hod" || user.role === "time_table_coordinator" || user.role === "attendance_coordinator") {
    await user.populate({
      path: "profileId",
      select: "name departmentId",
      populate: {
        path: "departmentId",
        select: "name code",
      },
    });
    return user;
  }

  return user;
};

const buildUserPayload = (user) => {
  const profile = user.profileId && typeof user.profileId === "object" ? user.profileId : null;
  const department = profile?.departmentId && typeof profile.departmentId === "object"
    ? profile.departmentId
    : null;

  return {
    id: user._id,
    name: profile?.name || null,
    email: user.email,
    role: user.role,
    profileId: profile
      ? {
          id: profile._id,
          name: profile.name,
          ...(profile.rollNumber && { rollNumber: profile.rollNumber }),
          ...(profile.departmentId && {
            departmentId: department
              ? {
                  id: department._id,
                  name: department.name,
                  code: department.code,
                }
              : profile.departmentId,
          }),
        }
      : user.profileId,
  };
};

const normalizeText = (value) => {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

const findRoleProfile = async (user) => {
  if (!user?.profileId || !user?.profileModel) {
    return null;
  }

  if (user.profileModel === "Student") {
    return Student.findById(user.profileId)
      .populate({ path: "departmentId", select: "name code" });
  }

  if (user.profileModel === "Faculty") {
    return Faculty.findById(user.profileId)
      .populate({ path: "departmentId", select: "name code" })
      .populate({
        path: "classTeacherAssignment.departmentId",
        select: "name code",
      });
  }

  return null;
};

const buildProfilePayload = ({ user, roleProfile, extraProfile }) => {
  const role = user?.role || null;
  const department = roleProfile?.departmentId;

  return {
    account: {
      id: user?._id,
      email: user?.email || null,
      role,
      isActive: user?.isActive !== false,
      permissions: Array.isArray(user?.permissions) ? user.permissions : [],
      lastLogin: user?.lastLogin || null,
      createdAt: user?.createdAt || null,
      updatedAt: user?.updatedAt || null,
    },
    roleProfile: roleProfile
      ? {
          id: roleProfile._id,
          name: roleProfile.name || null,
          email: roleProfile.email || null,
          phone: roleProfile.phone || null,
          departmentId: department?._id || department || null,
          departmentName: department?.name || null,
          departmentCode: department?.code || null,
          ...(roleProfile.rollNumber && { rollNumber: roleProfile.rollNumber }),
          ...(roleProfile.semester !== undefined && { semester: roleProfile.semester }),
          ...(roleProfile.section && { section: roleProfile.section }),
          ...(roleProfile.batch && { batch: roleProfile.batch }),
          ...(roleProfile.guardianPhone && { guardianPhone: roleProfile.guardianPhone }),
          ...(roleProfile.designation && { designation: roleProfile.designation }),
          ...(roleProfile.specialization && { specialization: roleProfile.specialization }),
          ...(roleProfile.classTeacherAssignment && {
            classTeacherAssignment: roleProfile.classTeacherAssignment,
          }),
          createdAt: roleProfile.createdAt || null,
          updatedAt: roleProfile.updatedAt || null,
        }
      : null,
    extraProfile: extraProfile
      ? {
          id: extraProfile._id,
          fullName: extraProfile.fullName || null,
          phone: extraProfile.phone || null,
          alternatePhone: extraProfile.alternatePhone || null,
          gender: extraProfile.gender || null,
          dateOfBirth: extraProfile.dateOfBirth || null,
          address: extraProfile.address || null,
          bio: extraProfile.bio || null,
          profilePhoto: extraProfile.profilePhoto || null,
          createdAt: extraProfile.createdAt || null,
          updatedAt: extraProfile.updatedAt || null,
        }
      : null,
  };
};

const getProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.isActive === false) {
    throw new AppError(404, "User not found");
  }

  const [roleProfile, extraProfile] = await Promise.all([
    findRoleProfile(user),
    UserProfile.findOne({ userId: user._id }),
  ]);

  return sendSuccess(res, 200, "Profile fetched", {
    profile: buildProfilePayload({ user, roleProfile, extraProfile }),
  });
});

const createProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.isActive === false) {
    throw new AppError(404, "User not found");
  }

  const existing = await UserProfile.findOne({ userId: user._id }).select("_id").lean();
  if (existing) {
    throw new AppError(409, "Profile details already exist. Use update instead.");
  }

  const payload = {
    userId: user._id,
    fullName: normalizeText(req.body.fullName),
    phone: normalizeText(req.body.phone),
    alternatePhone: normalizeText(req.body.alternatePhone),
    gender: normalizeText(req.body.gender),
    dateOfBirth: req.body.dateOfBirth || null,
    address: normalizeText(req.body.address),
    bio: normalizeText(req.body.bio),
    profilePhoto: normalizeText(req.body.profilePhoto),
  };

  const extraProfile = await UserProfile.create(payload);
  const roleProfile = await findRoleProfile(user);

  return sendSuccess(res, 201, "Profile created", {
    profile: buildProfilePayload({ user, roleProfile, extraProfile }),
  });
});

const updateProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.isActive === false) {
    throw new AppError(404, "User not found");
  }

  const nextEmail = normalizeText(req.body?.account?.email);
  if (nextEmail && String(nextEmail).toLowerCase() !== String(user.email).toLowerCase()) {
    const userEmailInUse = await User.exists({
      _id: { $ne: user._id },
      email: String(nextEmail).toLowerCase(),
    });
    if (userEmailInUse) {
      throw new AppError(409, "Email already in use by another account");
    }
    user.email = String(nextEmail).toLowerCase();
  }

  const roleProfile = await findRoleProfile(user);
  const roleInput = req.body?.roleProfile || {};

  if (roleProfile) {
    if (roleProfile.constructor.modelName === "Student") {
      if (roleInput.name !== undefined) roleProfile.name = normalizeText(roleInput.name);
      if (roleInput.phone !== undefined) roleProfile.phone = normalizeText(roleInput.phone);
      if (roleInput.guardianPhone !== undefined) roleProfile.guardianPhone = normalizeText(roleInput.guardianPhone);
      if (roleInput.profilePhoto !== undefined) roleProfile.profilePhoto = normalizeText(roleInput.profilePhoto);
      if (nextEmail) roleProfile.email = user.email;
    }

    if (roleProfile.constructor.modelName === "Faculty") {
      if (roleInput.name !== undefined) roleProfile.name = normalizeText(roleInput.name);
      if (roleInput.phone !== undefined) roleProfile.phone = normalizeText(roleInput.phone);
      if (roleInput.specialization !== undefined) roleProfile.specialization = normalizeText(roleInput.specialization);
      if (nextEmail) roleProfile.email = user.email;
    }
  }

  const extra =
    (await UserProfile.findOne({ userId: user._id })) ||
    new UserProfile({ userId: user._id });

  const extraInput = req.body?.extraProfile || {};
  if (extraInput.fullName !== undefined) extra.fullName = normalizeText(extraInput.fullName);
  if (extraInput.phone !== undefined) extra.phone = normalizeText(extraInput.phone);
  if (extraInput.alternatePhone !== undefined) extra.alternatePhone = normalizeText(extraInput.alternatePhone);
  if (extraInput.gender !== undefined) extra.gender = normalizeText(extraInput.gender);
  if (extraInput.dateOfBirth !== undefined) extra.dateOfBirth = extraInput.dateOfBirth || null;
  if (extraInput.address !== undefined) extra.address = normalizeText(extraInput.address);
  if (extraInput.bio !== undefined) extra.bio = normalizeText(extraInput.bio);
  if (extraInput.profilePhoto !== undefined) extra.profilePhoto = normalizeText(extraInput.profilePhoto);

  await user.save({ validateBeforeSave: false });
  if (roleProfile) await roleProfile.save();
  await extra.save();

  const refreshedRoleProfile = await findRoleProfile(user);
  const refreshedExtra = await UserProfile.findOne({ userId: user._id });

  return sendSuccess(res, 200, "Profile updated", {
    profile: buildProfilePayload({ user, roleProfile: refreshedRoleProfile, extraProfile: refreshedExtra }),
  });
});

const deleteProfile = catchAsync(async (req, res) => {
  const deleted = await UserProfile.findOneAndDelete({ userId: req.user._id });
  if (!deleted) {
    throw new AppError(404, "Profile details not found");
  }

  return sendSuccess(res, 200, "Profile details deleted", { deleted: true });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findByEmail(email);
  if (!user || user.isActive === false) {
    throw new AppError(401, "Invalid email or password");
  }

  const isPasswordCorrect = await user.comparePassword(password);
  if (!isPasswordCorrect) {
    throw new AppError(401, "Invalid email or password");
  }

  const { accessToken, refreshToken } = jwtHelper.generateTokenPair(user);

  await setEx(`refresh:${user._id}`, 7 * 24 * 3600, refreshToken);

  user.lastLogin = Date.now();
  await user.save({ validateBeforeSave: false });

  await populateUserProfile(user);

  return sendSuccess(res, 200, "Login successful", {
    user: buildUserPayload(user),
    accessToken,
    refreshToken,
  });
});

const logout = catchAsync(async (req, res) => {
  const token = req.token;

  if (token) {
    await setEx(`blacklist:${token}`, 15 * 60, "1");
  }

  if (req.user?._id) {
    await del(`refresh:${req.user._id}`);
  }

  return sendSuccess(res, 200, "Logged out successfully");
});

const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken: providedRefreshToken } = req.body;

  if (!providedRefreshToken) {
    throw new AppError(401, "Refresh token required");
  }

  const decoded = jwtHelper.verifyRefreshToken(providedRefreshToken);

  const storedToken = await get(`refresh:${decoded.id}`);
  if (storedToken !== providedRefreshToken) {
    throw new AppError(401, "Invalid or expired refresh token");
  }

  const user = await User.findById(decoded.id);
  if (!user || user.isActive === false) {
    throw new AppError(401, "Invalid or expired refresh token");
  }

  const accessToken = jwtHelper.generateAccessToken({
    id: user._id,
    email: user.email,
    role: user.role,
    profileId: user.profileId,
  });

  return sendSuccess(res, 200, "Token refreshed", { accessToken });
});

const getMe = catchAsync(async (req, res) => {
  await populateUserProfile(req.user);

  return sendSuccess(res, 200, "User profile", { user: req.user });
});

const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (user && user.isActive !== false) {
    await populateUserProfile(user);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await setEx(`otp:${user._id}`, 600, otp);

    const displayName =
      (user.profileId && typeof user.profileId === "object" && user.profileId.name) ||
      "User";

    await emailService.sendOTPEmail(user.email, displayName, otp);
  }

  return sendSuccess(
    res,
    200,
    "If this email exists, a reset OTP has been sent"
  );
});

const resetPassword = catchAsync(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  const user = await User.findOne({ email });
  if (!user || user.isActive === false) {
    throw new AppError(400, "OTP expired or invalid");
  }

  const storedOtp = await get(`otp:${user._id}`);
  if (!storedOtp) {
    throw new AppError(400, "OTP expired or invalid");
  }

  if (storedOtp !== otp) {
    throw new AppError(400, "Incorrect OTP");
  }

  user.password = newPassword;
  user.passwordChangedAt = Date.now();
  await user.save();

  await del(`otp:${user._id}`);
  await del(`refresh:${user._id}`);

  return sendSuccess(res, 200, "Password reset successful. Please log in.");
});

const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select("+passwordHash");
  if (!user) {
    throw new AppError(401, "User no longer exists");
  }

  const isPasswordCorrect = await user.comparePassword(currentPassword);
  if (!isPasswordCorrect) {
    throw new AppError(401, "Current password incorrect");
  }

  user.password = newPassword;
  user.passwordChangedAt = Date.now();
  await user.save();

  if (req.token) {
    await setEx(`blacklist:${req.token}`, 15 * 60, "1");
  }
  await del(`refresh:${user._id}`);

  return sendSuccess(res, 200, "Password changed. Please log in again.");
});

module.exports = {
  login,
  logout,
  refreshToken,
  getMe,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  forgotPassword,
  resetPassword,
  changePassword,
};
