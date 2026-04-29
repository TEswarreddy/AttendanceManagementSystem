const { Notice } = require("../models");

const normalizeSection = (section) => {
  const value = String(section || "").trim().toUpperCase();
  return value || "A";
};

const normalizeSemester = (semester) => {
  const parsed = Number.parseInt(String(semester || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const uniqueRoles = (roles = []) => {
  const seen = new Set();
  const output = [];

  for (const role of roles) {
    const value = String(role || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }

  return output;
};

const createDepartmentNotification = async ({
  title,
  message,
  sentBy,
  departmentId,
  semester,
  section,
  type = "general",
  recipientRoles = [],
}) => {
  const roles = uniqueRoles(recipientRoles);
  if (!roles.length) {
    return null;
  }

  return Notice.create({
    title,
    message,
    type,
    sentBy,
    targetDept: departmentId,
    targetSemester: normalizeSemester(semester),
    targetSection: normalizeSection(section),
    recipientRoles: roles,
  });
};

module.exports = {
  createDepartmentNotification,
};
