const express = require("express");
const mongoose = require("mongoose");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleCheck");
const { Timetable } = require("../models");
const hodController = require("../controllers/hodController");
const adminController = require("../controllers/adminController");
const { AppError, catchAsync } = require("../utils/AppError");
const { sendSuccess } = require("../utils/responseHelper");

const router = express.Router();

router.get(
	"/",
	protect,
	authorize("faculty", "class_teacher", "admin", "time_table_coordinator", "attendance_coordinator", "hod"),
	catchAsync(async (req, res) => {
		if (req.user.role === "admin" || req.user.role === "time_table_coordinator") {
			if (!req.query.facultyId) {
				return adminController.getTimetables(req, res);
			}
		}

		const { academicYear, day } = req.query;

		const requestedFacultyId =
			req.user.role === "faculty" || req.user.role === "class_teacher"
				? req.user.profileId
				: req.query.facultyId;

		if (!requestedFacultyId) {
			throw new AppError(400, "facultyId is required");
		}

		if (!mongoose.Types.ObjectId.isValid(requestedFacultyId)) {
			throw new AppError(400, "Valid facultyId is required");
		}

		const timetableRecords = await Timetable.getFacultySubjects(requestedFacultyId, academicYear).lean();

		const normalizedDay = day ? String(day).trim().toLowerCase() : null;

		const filtered = timetableRecords.filter((record) => {
			if (!normalizedDay) return true;
			const schedule = Array.isArray(record.schedule) ? record.schedule : [];
			return schedule.some((slot) => String(slot.day || "").toLowerCase() === normalizedDay);
		});

		const timetables = filtered.map((record) => {
			const schedule = Array.isArray(record.schedule) ? record.schedule : [];
			const daySchedule = normalizedDay
				? schedule.filter((slot) => String(slot.day || "").toLowerCase() === normalizedDay)
				: schedule;

			return {
				_id: record._id,
				facultyId: record.facultyId,
				subjectId: record.subjectId,
				subjectType: record.subjectType || record.subjectId?.type || "theory",
				subjectName: record.subjectId?.name || record.subjectId?.subjectName || "",
				subjectCode: record.subjectId?.subjectCode || record.subjectId?.code || "",
				facultyName: record.facultyId?.name || "",
				departmentId: record.departmentId,
				semester: record.semester,
				section: record.section,
				academicYear: record.academicYear,
				schedule: daySchedule,
			};
		});

		sendSuccess(res, 200, "Timetable fetched", {
			timetables,
			count: timetables.length,
		});
	})
);

router.post(
	"/",
	protect,
	authorize("admin", "time_table_coordinator", "attendance_coordinator", "hod"),
	(req, res, next) => {
		if (req.user.role === "admin") {
			return adminController.createTimetable(req, res, next);
		}
		return hodController.createTimetable(req, res, next);
	}
);

router.put(
	"/:id",
	protect,
	authorize("admin", "time_table_coordinator", "attendance_coordinator", "hod"),
	(req, res, next) => {
		if (req.user.role === "admin") {
			return adminController.updateTimetable(req, res, next);
		}
		req.params.timetableId = req.params.id;
		return hodController.updateTimetable(req, res, next);
	}
);

router.delete(
	"/:id",
	protect,
	authorize("admin", "time_table_coordinator", "attendance_coordinator", "hod"),
	(req, res, next) => {
		if (req.user.role === "admin") {
			return adminController.deactivateTimetable(req, res, next);
		}
		req.params.timetableId = req.params.id;
		req.body = { ...req.body, isActive: false };
		return hodController.updateTimetable(req, res, next);
	}
);

module.exports = router;
