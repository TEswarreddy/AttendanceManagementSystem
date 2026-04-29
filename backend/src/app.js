const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const { AppError } = require("./utils/AppError");
const { sendSuccess } = require("./utils/responseHelper");
const { errorHandler } = require("./middlewares/errorHandler");

const authRouter = require("./routes/auth");
const attendanceRouter = require("./routes/attendance");
// QR session flow uses uuidv4-style IDs (npm install uuid)
const qrRouter = require("./routes/qr");
const reportsRoutes = require("./routes/reportsRoutes");
const timetableRoutes = require("./routes/timetableRoutes");
const studentRouter = require("./routes/student");
const studentsRouter = require("./routes/studentsRoutes");
const facultyRouter = require("./routes/faculty");
const classTeacherRouter = require("./routes/classTeacher");
const hodRouter = require("./routes/hod");
const timetableCoordinatorRouter = require("./routes/timetableCoordinator");
const adminRouter = require("./routes/admin");
const departmentsRouter = require("./routes/departmentsRoutes");
const subjectsRouter = require("./routes/subjectsRoutes");
const notificationsRouter = require("./routes/notifications");
const attendanceCoordinatorRouter = require("./routes/attendanceCoordinator");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/api/health", (req, res) => {
  return sendSuccess(res, 200, "Service healthy", {
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/qr", qrRouter);
app.use("/api/reports", reportsRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/student", studentRouter);
app.use("/api/students", studentsRouter);
app.use("/api/faculty", facultyRouter);
app.use("/api/subjects", subjectsRouter);
app.use("/api/class-teacher", classTeacherRouter);
app.use("/api/hod", hodRouter);
app.use("/api/timetable-coordinator", timetableCoordinatorRouter);
app.use("/api/admin", adminRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/attendance-coordinator", attendanceCoordinatorRouter);

app.all("/{*any}", (req, res, next) =>
  next(new AppError(404, `Route ${req.originalUrl} not found`))
);

app.use(errorHandler);

module.exports = app;
