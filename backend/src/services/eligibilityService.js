const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

const {
  Attendance,
  Student,
  Subject,
  ShortageList,
  EligibilityReport,
} = require("../models");
const attendanceCalc = require("../utils/attendanceCalc");
const dateHelper = require("../utils/dateHelper");
const { AppError } = require("../utils/AppError");

void ShortageList;
void EligibilityReport;

const toObjectId = (value, fieldName) => {
  const mongoose = require("mongoose");
  if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
    throw new AppError(400, `Valid ${fieldName} is required`);
  }

  return new mongoose.Types.ObjectId(String(value));
};

const parseAcademicYearRange = (academicYear) => {
  if (!academicYear) {
    return null;
  }

  const match = String(academicYear)
    .trim()
    .match(/^(\d{4})\s*[-/]\s*(\d{2,4})$/);

  if (!match) {
    return null;
  }

  const fromYear = Number(match[1]);
  let toYear = Number(match[2]);

  if (toYear < 100) {
    toYear = Number(`${String(fromYear).slice(0, 2)}${String(toYear).padStart(2, "0")}`);
  }

  if (!Number.isFinite(fromYear) || !Number.isFinite(toYear) || toYear < fromYear) {
    return null;
  }

  const fromDate = new Date(Date.UTC(fromYear, 5, 1, 0, 0, 0, 0));
  const toDate = new Date(Date.UTC(toYear, 4, 31, 23, 59, 59, 999));
  return { fromDate, toDate };
};

const formatPercent = (value) => Number(Number(value || 0).toFixed(2));

const emptyCounters = () => ({ present: 0, late: 0, absent: 0, total: 0 });

const aggregateAttendanceCounters = async ({ studentId, subjectId, isLabSession, dateRange }) => {
  const baseMatch = {
    studentId: toObjectId(studentId, "studentId"),
    subjectId: toObjectId(subjectId, "subjectId"),
    isLabSession,
  };

  if (dateRange) {
    baseMatch.date = { $gte: dateRange.fromDate, $lte: dateRange.toDate };
  }

  const rows = await Attendance.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: {
          subjectId: "$subjectId",
          subjectType: "$subjectType",
        },
        present: { $sum: { $cond: [{ $eq: ["$status", "P"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "L"] }, 1, 0] } },
        absent: {
          $sum: {
            $cond: [
              {
                $or: [{ $eq: ["$status", "A"] }, { $eq: ["$status", "ML"] }],
              },
              1,
              0,
            ],
          },
        },
        total: { $sum: 1 },
      },
    },
  ]);

  if (!rows.length) {
    return emptyCounters();
  }

  const row = rows[0];
  return {
    present: Number(row.present || 0),
    late: Number(row.late || 0),
    absent: Number(row.absent || 0),
    total: Number(row.total || 0),
  };
};

const calculateStudentEligibility = async (studentId, semester, academicYear, threshold) => {
  const normalizedThreshold = Number(threshold || 75);

  const student = await Student.findById(studentId)
    .select("_id departmentId semester section rollNumber name")
    .lean();

  if (!student) {
    throw new AppError(404, "Student not found");
  }

  if (Number(semester) !== Number(student.semester)) {
    throw new AppError(400, "Student does not belong to the requested semester");
  }

  const subjects = await Subject.find({
    departmentId: student.departmentId,
    semester: Number(semester),
    isActive: true,
  })
    .select("_id name subjectCode type")
    .sort({ subjectCode: 1, name: 1 })
    .lean();

  const dateRange = parseAcademicYearRange(academicYear);

  const subjectResults = [];

  for (const subject of subjects) {
    const [theory, lab] = await Promise.all([
      aggregateAttendanceCounters({
        studentId: student._id,
        subjectId: subject._id,
        isLabSession: false,
        dateRange,
      }),
      aggregateAttendanceCounters({
        studentId: student._id,
        subjectId: subject._id,
        isLabSession: true,
        dateRange,
      }),
    ]);

    const theoryPct = attendanceCalc.calculatePercentage(theory.present, theory.late, theory.total);
    const labPct = attendanceCalc.calculatePercentage(lab.present, lab.late, lab.total);
    const hasLab = lab.total > 0;

    const combinedPct = hasLab
      ? formatPercent(theoryPct * 0.7 + labPct * 0.3)
      : formatPercent(theoryPct);

    const isEligible = combinedPct >= normalizedThreshold;

    subjectResults.push({
      subjectId: subject._id,
      subjectName: subject.name,
      subjectCode: subject.subjectCode,
      subjectType: subject.type,
      theory: {
        ...theory,
        percentage: formatPercent(theoryPct),
      },
      lab: {
        ...lab,
        percentage: hasLab ? formatPercent(labPct) : null,
      },
      theoryPercentage: formatPercent(theoryPct),
      labPercentage: hasLab ? formatPercent(labPct) : null,
      combinedPercentage: combinedPct,
      isEligible,
      shortageBy: isEligible ? 0 : formatPercent(normalizedThreshold - combinedPct),
    });
  }

  const anyShortage = subjectResults.some((subject) => !subject.isEligible);
  const overallEligible = !anyShortage;

  return {
    student: {
      studentId: student._id,
      rollNumber: student.rollNumber,
      name: student.name,
      semester: student.semester,
      section: student.section,
      departmentId: student.departmentId,
    },
    subjects: subjectResults,
    overallEligible,
    anyShortage,
  };
};

const generateShortageListData = async (
  deptId,
  semester,
  section,
  academicYear,
  examType,
  threshold
) => {
  const students = await Student.find({
    departmentId: toObjectId(deptId, "deptId"),
    semester: Number(semester),
    section: String(section || "").toUpperCase(),
    isActive: true,
  })
    .select("_id rollNumber name")
    .sort({ rollNumber: 1 })
    .lean();

  const processed = [];

  for (const student of students) {
    const result = await calculateStudentEligibility(
      student._id,
      Number(semester),
      academicYear,
      threshold
    );

    if (!result.anyShortage) {
      continue;
    }

    const subjectShortages = result.subjects
      .filter((subject) => !subject.isEligible)
      .map((subject) => ({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        percentage: subject.combinedPercentage,
        shortageBy: subject.shortageBy,
      }));

    const overallPercentage = result.subjects.length
      ? formatPercent(
          result.subjects.reduce((sum, subject) => sum + Number(subject.combinedPercentage || 0), 0) /
            result.subjects.length
        )
      : 0;

    processed.push({
      studentId: student._id,
      rollNumber: student.rollNumber,
      name: student.name,
      subjectShortages,
      overallPercentage,
      isEligible: false,
      _subjectsDetailed: result.subjects,
    });
  }

  processed.sort((a, b) => String(a.rollNumber).localeCompare(String(b.rollNumber)));

  return {
    departmentId: toObjectId(deptId, "deptId"),
    semester: Number(semester),
    section: String(section || "").toUpperCase(),
    academicYear,
    examType,
    thresholdUsed: Number(threshold),
    generatedAt: new Date(),
    students: processed.map((item) => ({
      studentId: item.studentId,
      rollNumber: item.rollNumber,
      name: item.name,
      subjectShortages: item.subjectShortages,
      overallPercentage: item.overallPercentage,
      isEligible: item.isEligible,
    })),
    _reportStudentsDetailed: processed,
  };
};

const generateEligibilityData = async (deptId, semester, section, academicYear, threshold) => {
  const query = {
    departmentId: toObjectId(deptId, "deptId"),
    semester: Number(semester),
    isActive: true,
  };

  if (section) {
    query.section = String(section).toUpperCase();
  }

  const students = await Student.find(query)
    .select("_id rollNumber name")
    .sort({ rollNumber: 1 })
    .lean();

  const entries = [];
  let condonationCount = 0;

  for (const student of students) {
    const result = await calculateStudentEligibility(
      student._id,
      Number(semester),
      academicYear,
      threshold
    );

    const overallPercentage = result.subjects.length
      ? formatPercent(
          result.subjects.reduce((sum, subject) => sum + Number(subject.combinedPercentage || 0), 0) /
            result.subjects.length
        )
      : 0;

    const condonationApplicable = result.subjects.some(
      (subject) => !subject.isEligible && subject.shortageBy >= 1 && subject.shortageBy <= 5
    );

    if (condonationApplicable) {
      condonationCount += 1;
    }

    entries.push({
      studentId: student._id,
      rollNumber: student.rollNumber,
      name: student.name,
      isEligible: result.overallEligible,
      condonationApplied: condonationApplicable,
      condonationReason: condonationApplicable
        ? "Possible condonation: shortage within 1-5%"
        : null,
      subjects: result.subjects.map((subject) => ({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        theoryPercentage: subject.theoryPercentage,
        labPercentage: subject.labPercentage,
        combinedPercentage: subject.combinedPercentage,
        isEligible: subject.isEligible,
        shortageBy: subject.shortageBy,
      })),
      overallPercentage,
      _subjectsDetailed: result.subjects,
    });
  }

  const eligible = entries.filter((entry) => entry.isEligible).length;
  const ineligible = entries.length - eligible;

  return {
    departmentId: toObjectId(deptId, "deptId"),
    semester: Number(semester),
    section: section ? String(section).toUpperCase() : null,
    academicYear,
    thresholdUsed: Number(threshold),
    generatedAt: dateHelper.toMidnightUTC(new Date()),
    students: entries.map((entry) => ({
      studentId: entry.studentId,
      rollNumber: entry.rollNumber,
      name: entry.name,
      isEligible: entry.isEligible,
      condonationApplied: entry.condonationApplied,
      condonationReason: entry.condonationReason,
      subjects: entry.subjects,
      overallPercentage: entry.overallPercentage,
    })),
    stats: {
      eligible,
      ineligible,
      condonation: condonationCount,
      totalStudents: entries.length,
    },
    _reportStudentsDetailed: entries,
  };
};

const generateShortageListPDF = async (shortageListData) => {
  const threshold = Number(shortageListData.thresholdUsed || 75);
  const studentsDetailed = Array.isArray(shortageListData._reportStudentsDetailed)
    ? shortageListData._reportStudentsDetailed
    : [];

  const subjectColumns = Array.from(
    new Map(
      studentsDetailed
        .flatMap((student) => (student._subjectsDetailed || []))
        .map((subject) => [String(subject.subjectId), subject])
    ).values()
  );

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 24 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(15).text("Shortage List Report", { align: "center" });
    doc.moveDown(0.4);
    doc.fontSize(9);
    doc.text(
      `Dept: ${shortageListData.departmentId}  |  Semester: ${shortageListData.semester}  |  Section: ${shortageListData.section}`
    );
    doc.text(
      `Exam Type: ${shortageListData.examType}  |  Academic Year: ${shortageListData.academicYear}  |  Generated: ${new Date(
        shortageListData.generatedAt || Date.now()
      ).toLocaleString()}  |  Threshold: ${threshold}%`
    );
    doc.moveDown(0.6);

    const baseColumns = [
      { key: "sno", label: "S.No", width: 38 },
      { key: "roll", label: "Roll No", width: 90 },
      { key: "name", label: "Student Name", width: 160 },
    ];

    const subjectWidth = Math.max(60, Math.floor((doc.page.width - 120 - 38 - 90 - 160) / Math.max(1, subjectColumns.length)));
    const columns = [
      ...baseColumns,
      ...subjectColumns.map((subject) => ({
        key: String(subject.subjectId),
        label: subject.subjectCode,
        width: subjectWidth,
      })),
      { key: "status", label: "Status", width: 90 },
    ];

    let y = doc.y;
    const drawHeader = () => {
      let x = 24;
      doc.fontSize(8).font("Helvetica-Bold");
      columns.forEach((column) => {
        doc.rect(x, y, column.width, 24).fillAndStroke("#E5E7EB", "#BFC5CE");
        doc.fillColor("#111827").text(column.label, x + 2, y + 8, {
          width: column.width - 4,
          align: "center",
        });
        x += column.width;
      });
      y += 24;
    };

    drawHeader();

    const ensurePage = () => {
      if (y <= doc.page.height - 80) {
        return;
      }

      doc.addPage({ size: "A4", layout: "landscape", margin: 24 });
      y = 24;
      drawHeader();
    };

    studentsDetailed.forEach((student, index) => {
      ensurePage();

      const subjectMap = new Map(
        (student._subjectsDetailed || []).map((subject) => [String(subject.subjectId), subject])
      );

      let x = 24;
      doc.font("Helvetica").fontSize(8).fillColor("#111827");

      const baseCells = [
        String(index + 1),
        student.rollNumber,
        student.name,
      ];

      baseCells.forEach((value, cellIndex) => {
        const width = columns[cellIndex].width;
        doc.rect(x, y, width, 22).stroke("#D1D5DB");
        doc.text(String(value || "-"), x + 3, y + 7, { width: width - 6, align: cellIndex === 2 ? "left" : "center" });
        x += width;
      });

      subjectColumns.forEach((subject) => {
        const detail = subjectMap.get(String(subject.subjectId));
        const pct = Number(detail?.combinedPercentage || 0);
        const isEligible = pct >= threshold;

        doc.rect(x, y, subjectWidth, 22)
          .fillAndStroke(isEligible ? "#DCFCE7" : "#FEE2E2", "#D1D5DB");
        doc.fillColor("#111827").text(`${pct.toFixed(2)}%`, x + 2, y + 7, {
          width: subjectWidth - 4,
          align: "center",
        });
        x += subjectWidth;
      });

      const status = student.subjectShortages?.length ? "Shortage" : "Eligible";
      doc.rect(x, y, 90, 22)
        .fillAndStroke(status === "Shortage" ? "#FEE2E2" : "#DCFCE7", "#D1D5DB");
      doc.fillColor("#111827").text(status, x + 2, y + 7, { width: 86, align: "center" });

      y += 22;
    });

    const footerY = doc.page.height - 56;
    doc.moveTo(80, footerY).lineTo(250, footerY).stroke("#111827");
    doc.text("HOD Signature", 120, footerY + 4, { width: 120, align: "center" });

    doc.moveTo(doc.page.width - 250, footerY).lineTo(doc.page.width - 80, footerY).stroke("#111827");
    doc.text("Principal Signature", doc.page.width - 240, footerY + 4, {
      width: 150,
      align: "center",
    });

    doc.end();
  });
};

const generateShortageListExcel = async (shortageListData) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Shortage List");

  const threshold = Number(shortageListData.thresholdUsed || 75);
  const studentsDetailed = Array.isArray(shortageListData._reportStudentsDetailed)
    ? shortageListData._reportStudentsDetailed
    : [];

  const subjectColumns = Array.from(
    new Map(
      studentsDetailed
        .flatMap((student) => (student._subjectsDetailed || []))
        .map((subject) => [String(subject.subjectId), subject])
    ).values()
  );

  const headers = [
    "S.No",
    "Roll No",
    "Student Name",
    ...subjectColumns.map((subject) => subject.subjectCode),
    "Status",
  ];

  sheet.addRow(["Shortage List Report"]);
  sheet.mergeCells(1, 1, 1, headers.length);
  sheet.getCell(1, 1).font = { bold: true, size: 14 };

  sheet.addRow([
    `Dept: ${shortageListData.departmentId} | Semester: ${shortageListData.semester} | Section: ${shortageListData.section} | Exam: ${shortageListData.examType} | Academic Year: ${shortageListData.academicYear} | Threshold: ${threshold}%`,
  ]);
  sheet.mergeCells(2, 1, 2, headers.length);

  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  });

  studentsDetailed.forEach((student, index) => {
    const subjectMap = new Map(
      (student._subjectsDetailed || []).map((subject) => [String(subject.subjectId), subject])
    );

    const row = [
      index + 1,
      student.rollNumber,
      student.name,
      ...subjectColumns.map((subject) => Number(subjectMap.get(String(subject.subjectId))?.combinedPercentage || 0)),
      student.subjectShortages?.length ? "Shortage" : "Eligible",
    ];

    const added = sheet.addRow(row);

    const startSubjectCol = 4;
    subjectColumns.forEach((_, subjectIndex) => {
      const col = startSubjectCol + subjectIndex;
      const cell = added.getCell(col);
      cell.numFmt = "0.00";
      cell.alignment = { horizontal: "center" };
      const pct = Number(cell.value || 0);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: pct < threshold ? "FFFEE2E2" : "FFDCFCE7" },
      };
    });

    const statusCell = added.getCell(headers.length);
    statusCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: statusCell.value === "Shortage" ? "FFFEE2E2" : "FFDCFCE7",
      },
    };
  });

  sheet.columns.forEach((column) => {
    column.width = 14;
  });
  sheet.getColumn(3).width = 26;

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

const generateEligibilityPDF = async (eligibilityData) => {
  const studentsDetailed = Array.isArray(eligibilityData._reportStudentsDetailed)
    ? eligibilityData._reportStudentsDetailed
    : [];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 24 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(16).text("Eligibility Report", { align: "center" });
    doc.moveDown(0.6);

    const stats = eligibilityData.stats || {
      eligible: 0,
      ineligible: 0,
      condonation: 0,
      totalStudents: studentsDetailed.length,
    };

    doc.fontSize(10).font("Helvetica");
    doc.text(`Department: ${eligibilityData.departmentId}`);
    doc.text(`Semester: ${eligibilityData.semester}  Section: ${eligibilityData.section}`);
    doc.text(`Academic Year: ${eligibilityData.academicYear}`);
    doc.text(`Threshold: ${eligibilityData.thresholdUsed}%`);
    doc.moveDown(0.4);
    doc.text(`Total Students: ${stats.totalStudents}`);
    doc.text(`Eligible: ${stats.eligible}`);
    doc.text(`Ineligible: ${stats.ineligible}`);
    doc.text(`Condonation Cases: ${stats.condonation}`);

    doc.addPage({ size: "A4", layout: "landscape", margin: 24 });

    const subjectColumns = Array.from(
      new Map(
        studentsDetailed
          .flatMap((student) => (student._subjectsDetailed || []))
          .map((subject) => [String(subject.subjectId), subject])
      ).values()
    );

    const baseColumns = [
      { label: "S.No", width: 35 },
      { label: "Roll", width: 90 },
      { label: "Name", width: 145 },
    ];
    const subjectWidth = Math.max(78, Math.floor((doc.page.width - 80 - 35 - 90 - 145 - 100) / Math.max(1, subjectColumns.length)));
    const columns = [
      ...baseColumns,
      ...subjectColumns.map((subject) => ({
        label: subject.subjectCode,
        width: subjectWidth,
      })),
      { label: "Overall", width: 72 },
      { label: "Status", width: 72 },
    ];

    let y = 24;

    const drawHeader = () => {
      let x = 24;
      doc.font("Helvetica-Bold").fontSize(8);
      columns.forEach((column) => {
        doc.rect(x, y, column.width, 24).fillAndStroke("#E5E7EB", "#BFC5CE");
        doc.fillColor("#111827").text(column.label, x + 2, y + 8, {
          width: column.width - 4,
          align: "center",
        });
        x += column.width;
      });
      y += 24;
    };

    drawHeader();

    const ensurePage = () => {
      if (y <= doc.page.height - 80) {
        return;
      }

      doc.addPage({ size: "A4", layout: "landscape", margin: 24 });
      y = 24;
      drawHeader();
    };

    studentsDetailed.forEach((student, index) => {
      ensurePage();

      const subjectMap = new Map(
        (student._subjectsDetailed || []).map((subject) => [String(subject.subjectId), subject])
      );

      const rowColor = student.isEligible
        ? "#FFFFFF"
        : student.condonationApplied
        ? "#FFEDD5"
        : "#FEE2E2";

      let x = 24;

      const baseValues = [index + 1, student.rollNumber, student.name];
      baseValues.forEach((value, idx) => {
        const width = columns[idx].width;
        doc.rect(x, y, width, 22).fillAndStroke(rowColor, "#D1D5DB");
        doc.fillColor("#111827").font("Helvetica").fontSize(8).text(String(value || "-"), x + 2, y + 7, {
          width: width - 4,
          align: idx === 2 ? "left" : "center",
        });
        x += width;
      });

      subjectColumns.forEach((subject) => {
        const detail = subjectMap.get(String(subject.subjectId));
        const theory = detail?.theoryPercentage;
        const lab = detail?.labPercentage;
        const combined = Number(detail?.combinedPercentage || 0).toFixed(2);

        const text = lab === null || lab === undefined
          ? `T:${Number(theory || 0).toFixed(1)} C:${combined}`
          : `T:${Number(theory || 0).toFixed(1)} L:${Number(lab || 0).toFixed(1)} C:${combined}`;

        doc.rect(x, y, subjectWidth, 22).fillAndStroke(rowColor, "#D1D5DB");
        doc.fillColor("#111827").text(text, x + 2, y + 7, {
          width: subjectWidth - 4,
          align: "center",
        });
        x += subjectWidth;
      });

      doc.rect(x, y, 72, 22).fillAndStroke(rowColor, "#D1D5DB");
      doc.fillColor("#111827").text(`${Number(student.overallPercentage || 0).toFixed(2)}%`, x + 2, y + 7, {
        width: 68,
        align: "center",
      });
      x += 72;

      doc.rect(x, y, 72, 22).fillAndStroke(rowColor, "#D1D5DB");
      doc.fillColor("#111827").text(student.isEligible ? "Eligible" : student.condonationApplied ? "Condonation" : "Ineligible", x + 2, y + 7, {
        width: 68,
        align: "center",
      });

      y += 22;
    });

    const footerY = doc.page.height - 56;
    doc.moveTo(80, footerY).lineTo(250, footerY).stroke("#111827");
    doc.text("HOD Signature", 120, footerY + 4, { width: 120, align: "center" });

    doc.moveTo(doc.page.width - 250, footerY).lineTo(doc.page.width - 80, footerY).stroke("#111827");
    doc.text("Principal Signature", doc.page.width - 240, footerY + 4, {
      width: 150,
      align: "center",
    });

    doc.end();
  });
};

module.exports = {
  calculateStudentEligibility,
  generateShortageListData,
  generateEligibilityData,
  generateShortageListPDF,
  generateShortageListExcel,
  generateEligibilityPDF,
};
