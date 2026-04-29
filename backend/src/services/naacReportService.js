const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const {
  Attendance,
  Student,
  Faculty,
  Subject,
  Department,
} = require("../models");
const { AppError } = require("../utils/AppError");

const INSTITUTION_NAME = process.env.COLLEGE_NAME || "Attendance Management System";

const toObjectId = (value, fieldName) => {
  const mongoose = require("mongoose");
  if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
    throw new AppError(400, `Valid ${fieldName} is required`);
  }

  return new mongoose.Types.ObjectId(String(value));
};

const parseAcademicYearRange = (academicYear) => {
  const raw = String(academicYear || "").trim();
  const match = raw.match(/^(\d{4})\s*[-/]\s*(\d{2,4})$/);

  if (!match) {
    throw new AppError(400, "academicYear must be in format YYYY-YY or YYYY-YYYY");
  }

  const fromYear = Number(match[1]);
  let toYear = Number(match[2]);

  if (toYear < 100) {
    toYear = Number(`${String(fromYear).slice(0, 2)}${String(toYear).padStart(2, "0")}`);
  }

  if (!Number.isFinite(fromYear) || !Number.isFinite(toYear) || toYear < fromYear) {
    throw new AppError(400, "Invalid academicYear range");
  }

  return {
    fromDate: new Date(Date.UTC(fromYear, 5, 1, 0, 0, 0, 0)),
    toDate: new Date(Date.UTC(toYear, 4, 31, 23, 59, 59, 999)),
    fromYear,
    toYear,
  };
};

const monthKey = (dateValue) => {
  const date = new Date(dateValue);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const weightedRate = (present, late, total) => {
  if (!total) return 0;
  return Number((((present + late * 0.5) / total) * 100).toFixed(2));
};

const styleBlackBorder = (cell) => {
  cell.border = {
    top: { style: "thin", color: { argb: "FF000000" } },
    left: { style: "thin", color: { argb: "FF000000" } },
    right: { style: "thin", color: { argb: "FF000000" } },
    bottom: { style: "thin", color: { argb: "FF000000" } },
  };
};

const buildNAACAttendanceData = async (academicYear, deptId) => {
  const { fromDate, toDate } = parseAcademicYearRange(academicYear);

  const departmentQuery = { isActive: true };
  if (deptId) {
    departmentQuery._id = toObjectId(deptId, "deptId");
  }

  const departments = await Department.find(departmentQuery)
    .select("_id name code")
    .sort({ code: 1, name: 1 })
    .lean();

  const data = [];

  for (const department of departments) {
    const students = await Student.find({
      departmentId: department._id,
      isActive: true,
    })
      .select("_id semester section")
      .lean();

    const classMap = new Map();
    for (const student of students) {
      const key = `${Number(student.semester)}-${String(student.section || "").toUpperCase()}`;
      if (!classMap.has(key)) {
        classMap.set(key, {
          semester: Number(student.semester),
          section: String(student.section || "").toUpperCase(),
          studentIds: [],
        });
      }

      classMap.get(key).studentIds.push(student._id);
    }

    const semesterSectionData = [];

    for (const classEntry of [...classMap.values()].sort((a, b) => {
      if (a.semester !== b.semester) return a.semester - b.semester;
      return String(a.section).localeCompare(String(b.section));
    })) {
      const attendanceRows = await Attendance.find({
        departmentId: department._id,
        studentId: { $in: classEntry.studentIds },
        date: { $gte: fromDate, $lte: toDate },
      })
        .select("studentId subjectId status date")
        .lean();

      const present = attendanceRows.filter((row) => row.status === "P").length;
      const late = attendanceRows.filter((row) => row.status === "L").length;
      const total = attendanceRows.length;

      const avgAttendance = weightedRate(present, late, total);

      const subjects = await Subject.find({
        departmentId: department._id,
        semester: classEntry.semester,
        isActive: true,
      })
        .select("_id name subjectCode")
        .lean();

      const subjectWise = [];
      for (const subject of subjects) {
        const rows = attendanceRows.filter(
          (row) => String(row.subjectId) === String(subject._id)
        );

        const subjectPresent = rows.filter((row) => row.status === "P").length;
        const subjectLate = rows.filter((row) => row.status === "L").length;
        const subjectTotal = rows.length;

        subjectWise.push({
          subjectId: subject._id,
          subjectCode: subject.subjectCode,
          subjectName: subject.name,
          attendancePercentage: weightedRate(subjectPresent, subjectLate, subjectTotal),
        });
      }

      const monthly = new Map();
      for (const row of attendanceRows) {
        const key = monthKey(row.date);
        if (!monthly.has(key)) {
          monthly.set(key, { month: key, present: 0, late: 0, total: 0 });
        }

        const bucket = monthly.get(key);
        if (row.status === "P") bucket.present += 1;
        if (row.status === "L") bucket.late += 1;
        bucket.total += 1;
      }

      const monthWise = [...monthly.values()]
        .sort((a, b) => String(a.month).localeCompare(String(b.month)))
        .map((item) => ({
          month: item.month,
          attendancePercentage: weightedRate(item.present, item.late, item.total),
        }));

      semesterSectionData.push({
        semester: classEntry.semester,
        section: classEntry.section,
        totalStudents: classEntry.studentIds.length,
        avgAttendance,
        subjectWise,
        monthWise,
      });
    }

    data.push({
      deptId: department._id,
      deptName: department.name,
      deptCode: department.code,
      semesters: semesterSectionData,
    });
  }

  const consolidated = {
    totalDepartments: data.length,
    totalClasses: data.reduce((sum, dept) => sum + dept.semesters.length, 0),
    totalStudents: data.reduce(
      (sum, dept) =>
        sum + dept.semesters.reduce((inner, cls) => inner + Number(cls.totalStudents || 0), 0),
      0
    ),
    avgAttendance: (() => {
      const all = data.flatMap((dept) => dept.semesters.map((cls) => Number(cls.avgAttendance || 0)));
      return all.length
        ? Number((all.reduce((sum, value) => sum + value, 0) / all.length).toFixed(2))
        : 0;
    })(),
  };

  return {
    institutionName: INSTITUTION_NAME,
    criterion: "NAAC Criterion 2.3",
    academicYear,
    generatedAt: new Date(),
    departments: data,
    consolidated,
  };
};

const generateNAACExcel = async (naacData) => {
  if (!naacData || !Array.isArray(naacData.departments)) {
    throw new AppError(400, "Invalid NAAC data");
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = INSTITUTION_NAME;
  workbook.created = new Date();

  for (const department of naacData.departments) {
    const title = `${department.deptCode || department.deptName}`.slice(0, 31);
    const sheet = workbook.addWorksheet(title || "Department");

    const monthColumns = Array.from(
      new Set(
        department.semesters.flatMap((item) => (item.monthWise || []).map((month) => month.month))
      )
    ).sort();

    const headers = [
      "Program",
      "Semester",
      "Section",
      "Number of Students",
      "Avg Attendance %",
      ...monthColumns,
    ];

    sheet.addRow([naacData.institutionName]);
    sheet.mergeCells(1, 1, 1, headers.length);
    sheet.getCell(1, 1).font = { bold: true, size: 13 };

    sheet.addRow([
      `Academic Year: ${naacData.academicYear} | Criterion: ${naacData.criterion} | Department: ${department.deptName} (${department.deptCode})`,
    ]);
    sheet.mergeCells(2, 1, 2, headers.length);

    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      styleBlackBorder(cell);
    });

    for (const item of department.semesters) {
      const monthMap = new Map((item.monthWise || []).map((month) => [month.month, month.attendancePercentage]));
      const row = sheet.addRow([
        `${department.deptCode} Program`,
        item.semester,
        item.section,
        item.totalStudents,
        item.avgAttendance,
        ...monthColumns.map((month) => Number(monthMap.get(month) || 0)),
      ]);

      row.eachCell((cell, index) => {
        styleBlackBorder(cell);
        if (index >= 5) {
          cell.numFmt = "0.00";
        }
      });
    }

    const deptStudents = department.semesters.reduce(
      (sum, item) => sum + Number(item.totalStudents || 0),
      0
    );
    const deptAvg = department.semesters.length
      ? Number(
          (
            department.semesters.reduce((sum, item) => sum + Number(item.avgAttendance || 0), 0) /
            department.semesters.length
          ).toFixed(2)
        )
      : 0;

    const finalRow = sheet.addRow([
      "Consolidated",
      "-",
      "-",
      deptStudents,
      deptAvg,
      ...monthColumns.map(() => "-"),
    ]);

    finalRow.eachCell((cell) => {
      cell.font = { bold: true };
      styleBlackBorder(cell);
    });

    sheet.columns.forEach((column, index) => {
      if (index === 0) column.width = 20;
      else if (index === 1) column.width = 10;
      else if (index === 2) column.width = 10;
      else if (index === 3) column.width = 18;
      else if (index === 4) column.width = 16;
      else column.width = 12;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

const buildNBAAttendanceData = async (deptId, academicYear) => {
  const departmentId = toObjectId(deptId, "deptId");
  const { fromDate, toDate } = parseAcademicYearRange(academicYear);

  const department = await Department.findById(departmentId).select("name code").lean();
  if (!department) {
    throw new AppError(404, "Department not found");
  }

  const subjects = await Subject.find({
    departmentId,
    isActive: true,
  })
    .select("_id subjectCode name semester")
    .sort({ semester: 1, subjectCode: 1 })
    .lean();

  const courseData = [];

  for (const subject of subjects) {
    const rows = await Attendance.find({
      departmentId,
      subjectId: subject._id,
      date: { $gte: fromDate, $lte: toDate },
    })
      .select("studentId facultyId status")
      .lean();

    const totalStudents = rows.length
      ? new Set(rows.map((row) => String(row.studentId))).size
      : await Student.countDocuments({ departmentId, semester: subject.semester, isActive: true });

    const present = rows.filter((row) => row.status === "P").length;
    const late = rows.filter((row) => row.status === "L").length;
    const total = rows.length;
    const attendancePercentage = weightedRate(present, late, total);

    const byStudent = new Map();
    for (const row of rows) {
      const key = String(row.studentId);
      if (!byStudent.has(key)) {
        byStudent.set(key, { present: 0, late: 0, total: 0 });
      }

      const bucket = byStudent.get(key);
      if (row.status === "P") bucket.present += 1;
      if (row.status === "L") bucket.late += 1;
      bucket.total += 1;
    }

    let studentsAbove75 = 0;
    let studentsBelow75 = 0;
    byStudent.forEach((bucket) => {
      const pct = weightedRate(bucket.present, bucket.late, bucket.total);
      if (pct >= 75) studentsAbove75 += 1;
      else studentsBelow75 += 1;
    });

    const facultyIds = [...new Set(rows.map((row) => String(row.facultyId)).filter(Boolean))].map((id) =>
      toObjectId(id, "facultyId")
    );

    const facultyRows = facultyIds.length
      ? await Faculty.find({ _id: { $in: facultyIds } }).select("name").lean()
      : [];

    courseData.push({
      courseCode: subject.subjectCode,
      courseName: subject.name,
      faculty: facultyRows.map((faculty) => faculty.name).join(", ") || "-",
      semester: subject.semester,
      totalStudents,
      attendancePercentage,
      studentsAbove75,
      studentsBelow75,
    });
  }

  return {
    institutionName: INSTITUTION_NAME,
    criterion: "NBA Attendance Compliance",
    academicYear,
    department: {
      departmentId,
      deptName: department.name,
      deptCode: department.code,
    },
    courses: courseData,
    generatedAt: new Date(),
  };
};

const generateNBAPDF = async (nbaData) => {
  if (!nbaData || !Array.isArray(nbaData.courses)) {
    throw new AppError(400, "Invalid NBA data");
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 28 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(15).text("NBA Attendance Report", { align: "center" });
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(10).text(
      `Department: ${nbaData.department.deptName} (${nbaData.department.deptCode})  |  Academic Year: ${nbaData.academicYear}`
    );
    doc.text("Program Outcomes Reference: Continuous Internal Quality and Academic Monitoring");
    doc.moveDown(0.6);

    const columns = [
      { label: "Course Code", width: 90 },
      { label: "Course Name", width: 180 },
      { label: "Faculty", width: 130 },
      { label: "Sem", width: 40 },
      { label: "Students", width: 60 },
      { label: "Attendance %", width: 80 },
      { label: "Above 75", width: 70 },
      { label: "Below 75", width: 70 },
    ];

    let y = doc.y;

    const drawHeader = () => {
      let x = 28;
      doc.font("Helvetica-Bold").fontSize(8);
      columns.forEach((column) => {
        doc.rect(x, y, column.width, 22).fillAndStroke("#E5E7EB", "#D1D5DB");
        doc.fillColor("#111827").text(column.label, x + 2, y + 7, {
          width: column.width - 4,
          align: "center",
        });
        x += column.width;
      });
      y += 22;
    };

    const ensurePage = () => {
      if (y <= doc.page.height - 88) return;
      doc.addPage({ size: "A4", layout: "landscape", margin: 28 });
      y = 28;
      drawHeader();
    };

    drawHeader();

    nbaData.courses.forEach((course) => {
      ensurePage();

      const values = [
        course.courseCode,
        course.courseName,
        course.faculty,
        course.semester,
        course.totalStudents,
        `${Number(course.attendancePercentage || 0).toFixed(2)}%`,
        course.studentsAbove75,
        course.studentsBelow75,
      ];

      let x = 28;
      values.forEach((value, index) => {
        const width = columns[index].width;
        doc.rect(x, y, width, 20).stroke("#D1D5DB");
        doc.font("Helvetica").fontSize(8).fillColor("#111827").text(String(value || "-"), x + 2, y + 6, {
          width: width - 4,
          align: index === 1 || index === 2 ? "left" : "center",
        });
        x += width;
      });

      y += 20;
    });

    const footerY = doc.page.height - 58;

    doc.moveTo(90, footerY).lineTo(270, footerY).stroke("#111827");
    doc.text("Faculty Certification", 120, footerY + 4, { width: 130, align: "center" });

    doc.moveTo(doc.page.width - 280, footerY).lineTo(doc.page.width - 90, footerY).stroke("#111827");
    doc.text("HOD / IQAC Coordinator", doc.page.width - 255, footerY + 4, {
      width: 170,
      align: "center",
    });

    doc.end();
  });
};

const buildSummaryPDF = async (naacData, nbaDataByDept, academicYear) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 32 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(16).text("Consolidated Attendance Summary", { align: "center" });
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(10).text(`Institution: ${naacData.institutionName}`);
    doc.text(`Academic Year: ${academicYear}`);
    doc.text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown(0.8);

    doc.font("Helvetica-Bold").fontSize(11).text("NAAC Snapshot");
    doc.font("Helvetica").fontSize(10).text(`Departments Covered: ${naacData.consolidated.totalDepartments}`);
    doc.text(`Classes Covered: ${naacData.consolidated.totalClasses}`);
    doc.text(`Students Covered: ${naacData.consolidated.totalStudents}`);
    doc.text(`Average Attendance: ${Number(naacData.consolidated.avgAttendance || 0).toFixed(2)}%`);

    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(11).text("NBA Snapshot");

    nbaDataByDept.forEach((nbaData) => {
      const avg = nbaData.courses.length
        ? Number(
            (
              nbaData.courses.reduce(
                (sum, course) => sum + Number(course.attendancePercentage || 0),
                0
              ) / nbaData.courses.length
            ).toFixed(2)
          )
        : 0;

      doc.font("Helvetica").fontSize(10).text(
        `${nbaData.department.deptCode} - Courses: ${nbaData.courses.length}, Avg Attendance: ${avg}%`
      );
    });

    doc.end();
  });
};

const buildCombinedNBAPDF = async (nbaDataByDept, academicYear) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 28 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(15).text("NBA Consolidated Attendance Report", {
      align: "center",
    });
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(10).text(`Academic Year: ${academicYear}`);
    doc.moveDown(0.5);

    for (const nbaData of nbaDataByDept) {
      doc.font("Helvetica-Bold").fontSize(11).text(
        `${nbaData.department.deptName} (${nbaData.department.deptCode})`
      );
      doc.moveDown(0.2);

      const columns = [
        { label: "Code", width: 80 },
        { label: "Course Name", width: 190 },
        { label: "Faculty", width: 140 },
        { label: "Sem", width: 40 },
        { label: "Att%", width: 60 },
        { label: ">=75", width: 50 },
        { label: "<75", width: 50 },
      ];

      let y = doc.y;
      let x = 28;
      doc.font("Helvetica-Bold").fontSize(8);
      columns.forEach((column) => {
        doc.rect(x, y, column.width, 20).fillAndStroke("#E5E7EB", "#D1D5DB");
        doc.fillColor("#111827").text(column.label, x + 2, y + 6, {
          width: column.width - 4,
          align: "center",
        });
        x += column.width;
      });
      y += 20;

      nbaData.courses.forEach((course) => {
        if (y > doc.page.height - 55) {
          doc.addPage({ size: "A4", layout: "landscape", margin: 28 });
          y = 28;
        }

        const rowValues = [
          course.courseCode,
          course.courseName,
          course.faculty,
          course.semester,
          `${Number(course.attendancePercentage || 0).toFixed(2)}`,
          course.studentsAbove75,
          course.studentsBelow75,
        ];

        let rowX = 28;
        rowValues.forEach((value, idx) => {
          const width = columns[idx].width;
          doc.rect(rowX, y, width, 18).stroke("#D1D5DB");
          doc.font("Helvetica").fontSize(8).fillColor("#111827").text(String(value || "-"), rowX + 2, y + 5, {
            width: width - 4,
            align: idx === 1 || idx === 2 ? "left" : "center",
          });
          rowX += width;
        });

        y += 18;
      });

      doc.moveDown(1);
    }

    doc.end();
  });
};

const generateConsolidatedReport = async (academicYear) => {
  const naacData = await buildNAACAttendanceData(academicYear);
  const naacBuffer = await generateNAACExcel(naacData);

  const nbaDataByDept = [];
  for (const dept of naacData.departments) {
    const nbaData = await buildNBAAttendanceData(dept.deptId, academicYear);
    nbaDataByDept.push(nbaData);
  }

  const nbaBuffer = await buildCombinedNBAPDF(nbaDataByDept, academicYear);
  const summaryBuffer = await buildSummaryPDF(naacData, nbaDataByDept, academicYear);

  return {
    naacBuffer,
    nbaBuffer,
    summaryBuffer,
  };
};

module.exports = {
  buildNAACAttendanceData,
  generateNAACExcel,
  buildNBAAttendanceData,
  generateNBAPDF,
  generateConsolidatedReport,
};
