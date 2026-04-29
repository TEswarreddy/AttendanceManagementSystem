const Department = require("./Department");
const User = require("./User");
const UserProfile = require("./UserProfile");
const Faculty = require("./Faculty");
const Student = require("./Student");
const Subject = require("./Subject");
const Period = require("./Period");
const Timetable = require("./Timetable");
const Attendance = require("./Attendance");
const QRSession = require("./QRSession");
const AuditLog = require("./AuditLog");
const EditApprovalRequest = require("./EditApprovalRequest");
const Notice = require("./Notice");
const ShortageList = require("./ShortageList");
const EligibilityReport = require("./EligibilityReport");

const allModels = [
  Department,
  User,
  UserProfile,
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
];

const seedIndexes = async () => {
  for (const model of allModels) {
    if (model.modelName === "Attendance") {
      const indexes = await model.collection.indexes();
      const legacySessionIndex = indexes.find((index) => {
        const keys = Object.keys(index.key || {});
        return (
          index.unique === true &&
          keys.length === 4 &&
          keys.includes("studentId") &&
          keys.includes("subjectId") &&
          keys.includes("date") &&
          keys.includes("session")
        );
      });

      if (legacySessionIndex) {
        try {
          await model.collection.dropIndex(legacySessionIndex.name);
        } catch (error) {
          const notFound =
            error?.codeName === "IndexNotFound" ||
            error?.code === 27 ||
            String(error?.message || "").includes("index not found");

          if (!notFound) {
            throw error;
          }
        }
      }
    }

    if (model.modelName === "QRSession") {
      const indexes = await model.collection.indexes();
      const legacyExpiresAtIndex = indexes.find(
        (index) =>
          index.name === "expiresAt_1" &&
          typeof index.expireAfterSeconds !== "number"
      );

      if (legacyExpiresAtIndex) {
        try {
          await model.collection.dropIndex("expiresAt_1");
        } catch (error) {
          // Ignore if index was already removed by another process.
          const notFound =
            error?.codeName === "IndexNotFound" ||
            error?.code === 27 ||
            String(error?.message || "").includes("index not found");

          if (!notFound) {
            throw error;
          }
        }
      }
    }

    if (model.modelName === "Faculty") {
      const indexes = await model.collection.indexes();
      const legacyEmployeeIndex = indexes.find((index) => {
        const keys = Object.keys(index.key || {});
        const employeeFilter = index.partialFilterExpression?.employeeId;
        const isPartialEmployeeIndex =
          employeeFilter?.$type === "string" && employeeFilter?.$gt === "";
        return (
          index.unique === true &&
          keys.length === 1 &&
          keys[0] === "employeeId" &&
          !isPartialEmployeeIndex
        );
      });

      if (legacyEmployeeIndex) {
        try {
          await model.collection.dropIndex(legacyEmployeeIndex.name);
          console.info(`Dropped legacy faculty index: ${legacyEmployeeIndex.name}`);
        } catch (error) {
          const notFound =
            error?.codeName === "IndexNotFound" ||
            error?.code === 27 ||
            String(error?.message || "").includes("index not found");

          if (!notFound) {
            throw error;
          }
        }
      }

      const legacyPhoneIndex = indexes.find((index) => {
        const keys = Object.keys(index.key || {});
        const phoneFilter = index.partialFilterExpression?.phone;
        const isPartialPhoneIndex =
          phoneFilter?.$type === "string" && phoneFilter?.$gt === "";
        return (
          index.unique === true &&
          keys.length === 1 &&
          keys[0] === "phone" &&
          !isPartialPhoneIndex
        );
      });

      if (legacyPhoneIndex) {
        try {
          await model.collection.dropIndex(legacyPhoneIndex.name);
          console.info(`Dropped legacy faculty index: ${legacyPhoneIndex.name}`);
        } catch (error) {
          const notFound =
            error?.codeName === "IndexNotFound" ||
            error?.code === 27 ||
            String(error?.message || "").includes("index not found");

          if (!notFound) {
            throw error;
          }
        }
      }
    }

    if (model.modelName === "User") {
      const indexes = await model.collection.indexes();
      const legacyUsernameIndex = indexes.find((index) => {
        const keys = Object.keys(index.key || {});
        const usernameFilter = index.partialFilterExpression?.username;
        const isPartialUsernameIndex =
          usernameFilter?.$type === "string" && usernameFilter?.$gt === "";
        return (
          index.unique === true &&
          keys.length === 1 &&
          keys[0] === "username" &&
          !isPartialUsernameIndex
        );
      });

      if (legacyUsernameIndex) {
        try {
          await model.collection.dropIndex(legacyUsernameIndex.name);
          console.info(`Dropped legacy user index: ${legacyUsernameIndex.name}`);
        } catch (error) {
          const notFound =
            error?.codeName === "IndexNotFound" ||
            error?.code === 27 ||
            String(error?.message || "").includes("index not found");

          if (!notFound) {
            throw error;
          }
        }
      }
    }

    await model.createIndexes();
  }
};

module.exports = {
  Department,
  User,
  UserProfile,
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
  seedIndexes,
};
