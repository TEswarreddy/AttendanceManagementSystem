const PDFDocument = require("pdfkit");

const COLORS = {
  text: "#111827",
  muted: "#6b7280",
  border: "#d1d5db",
  headerBg: "#e5e7eb",
  safe: "#dcfce7",
  warning: "#ffedd5",
  danger: "#fee2e2",
};

const THRESHOLDS = {
  safe: 75,
  warning: 65,
};

const PAGE = {
  margin: 40,
  footerHeight: 28,
};

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const formatDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toLocaleString() : date.toLocaleString();
};

const buildPdfBuffer = async (drawFn, generatedAt = new Date()) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: PAGE.margin,
      bufferPages: true,
      info: {
        Title: "Attendance Report",
        Author: "Attendance Management System",
      },
    });

    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    try {
      drawFn(doc);
      drawFooters(doc, generatedAt);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

const drawFooters = (doc, generatedAt) => {
  const range = doc.bufferedPageRange();
  const footerY = doc.page.height - PAGE.margin + 6;

  for (let i = 0; i < range.count; i += 1) {
    const pageNumber = i + 1;
    doc.switchToPage(range.start + i);

    doc.save();
    doc.moveTo(PAGE.margin, doc.page.height - PAGE.margin)
      .lineTo(doc.page.width - PAGE.margin, doc.page.height - PAGE.margin)
      .lineWidth(0.6)
      .strokeColor(COLORS.border)
      .stroke();

    doc.fontSize(9)
      .fillColor(COLORS.muted)
      .text(`Generated: ${formatDate(generatedAt)}`, PAGE.margin, footerY, {
        width: 260,
        align: "left",
      })
      .text(`Page ${pageNumber} of ${range.count}`, doc.page.width - PAGE.margin - 140, footerY, {
        width: 140,
        align: "right",
      });

    doc.restore();
  }
};

const drawHeader = (doc, collegeName, reportTitle) => {
  const y = PAGE.margin;

  doc.font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(COLORS.text)
    .text(collegeName || "Attendance Management System", PAGE.margin, y, { align: "center" });

  doc.moveDown(0.2)
    .fontSize(13)
    .fillColor(COLORS.muted)
    .text(reportTitle, { align: "center" });

  return doc.y + 14;
};

const drawInfoLine = (doc, label, value, x, y, width) => {
  doc.font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.text)
    .text(`${label}:`, x, y, { width: 80, continued: true });

  doc.font("Helvetica")
    .text(` ${value ?? "-"}`, { width: width - 80 });
};

const drawTableHeader = (doc, startX, y, columns) => {
  const rowHeight = 24;
  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);

  doc.save();
  doc.rect(startX, y, totalWidth, rowHeight)
    .fillAndStroke(COLORS.headerBg, COLORS.border);

  let x = startX;
  columns.forEach((column) => {
    doc.rect(x, y, column.width, rowHeight).stroke(COLORS.border);
    doc.font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLORS.text)
      .text(column.label, x + 6, y + 7, {
        width: column.width - 12,
        align: column.align || "left",
      });
    x += column.width;
  });
  doc.restore();

  return y + rowHeight;
};

const drawTableRow = (doc, startX, y, columns, rowData, options = {}) => {
  const rowHeight = options.rowHeight || 24;
  const rowColor = options.rowColor || "#ffffff";
  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);

  doc.save();
  doc.rect(startX, y, totalWidth, rowHeight).fillAndStroke(rowColor, COLORS.border);

  let x = startX;
  columns.forEach((column) => {
    const value = rowData[column.key] ?? "-";
    doc.rect(x, y, column.width, rowHeight).stroke(COLORS.border);
    doc.font("Helvetica")
      .fontSize(9.5)
      .fillColor(COLORS.text)
      .text(String(value), x + 6, y + 7, {
        width: column.width - 12,
        align: column.align || "left",
      });
    x += column.width;
  });
  doc.restore();

  return y + rowHeight;
};

const pickAttendanceRowColor = (percentage) => {
  const p = toNumber(percentage, 0);
  if (p >= THRESHOLDS.safe) return COLORS.safe;
  if (p >= THRESHOLDS.warning) return COLORS.warning;
  return COLORS.danger;
};

const ensureVerticalSpace = (doc, y, neededHeight, redrawHeader) => {
  const maxY = doc.page.height - PAGE.margin - PAGE.footerHeight;
  if (y + neededHeight <= maxY) {
    return y;
  }

  doc.addPage();
  return redrawHeader();
};

const generateStudentReport = async (studentData = {}) => {
  return buildPdfBuffer((doc) => {
    const collegeName = studentData.collegeName || "Attendance Management System";
    const student = studentData.student || {};
    const subjects = Array.isArray(studentData.subjects) ? studentData.subjects : [];
    const recentAttendance = Array.isArray(studentData.recentAttendance) ? studentData.recentAttendance : [];

    let y = drawHeader(doc, collegeName, "Student Attendance Report");

    const infoX = PAGE.margin;
    const infoWidth = doc.page.width - PAGE.margin * 2;

    drawInfoLine(doc, "Student", student.name, infoX, y, infoWidth / 2);
    drawInfoLine(doc, "Roll No", student.rollNumber, infoX + infoWidth / 2, y, infoWidth / 2);
    y += 18;

    drawInfoLine(doc, "Department", student.department, infoX, y, infoWidth / 2);
    drawInfoLine(doc, "Semester", student.semester, infoX + infoWidth / 2, y, infoWidth / 2);
    y += 24;

    const columns = [
      { label: "Subject", key: "subject", width: 210 },
      { label: "Total", key: "totalClasses", width: 68, align: "center" },
      { label: "Present", key: "present", width: 68, align: "center" },
      { label: "Absent", key: "absent", width: 68, align: "center" },
      { label: "%", key: "percentage", width: 68, align: "center" },
    ];

    const startX = PAGE.margin;

    const redrawHeader = () => {
      const nextY = drawHeader(doc, collegeName, "Student Attendance Report");
      return drawTableHeader(doc, startX, nextY, columns);
    };

    y = drawTableHeader(doc, startX, y, columns);

    subjects.forEach((item) => {
      y = ensureVerticalSpace(doc, y, 24, redrawHeader);

      const row = {
        subject: item.subjectName || item.subjectCode || "-",
        totalClasses: toNumber(item.totalClasses, 0),
        present: toNumber(item.present, 0),
        absent: toNumber(item.absent, Math.max(0, toNumber(item.totalClasses, 0) - toNumber(item.present, 0))),
        percentage: `${toNumber(item.percentage, 0).toFixed(2)}%`,
      };

      y = drawTableRow(doc, startX, y, columns, row, {
        rowColor: pickAttendanceRowColor(item.percentage),
      });
    });

    if (subjects.length === 0) {
      y = drawTableRow(doc, startX, y, columns, {
        subject: "No attendance data available",
        totalClasses: "-",
        present: "-",
        absent: "-",
        percentage: "-",
      });
    }

    if (recentAttendance.length > 0) {
      y += 18;

      const detailColumns = [
        { label: "Date", key: "date", width: 110 },
        { label: "Subject", key: "subject", width: 205 },
        { label: "Session", key: "session", width: 70, align: "center" },
        { label: "Status", key: "status", width: 55, align: "center" },
      ];

      const redrawDetailsHeader = () => {
        const nextY = drawHeader(doc, collegeName, "Student Attendance Report");
        drawInfoLine(doc, "Student", student.name, infoX, nextY, infoWidth / 2);
        drawInfoLine(doc, "Roll No", student.rollNumber, infoX + infoWidth / 2, nextY, infoWidth / 2);
        return drawTableHeader(doc, startX, nextY + 38, detailColumns);
      };

      y = ensureVerticalSpace(doc, y, 30, redrawDetailsHeader);

      doc.font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(COLORS.text)
        .text("Recent Attendance Records", PAGE.margin, y);
      y += 14;

      y = drawTableHeader(doc, startX, y, detailColumns);

      recentAttendance.forEach((record) => {
        y = ensureVerticalSpace(doc, y, 24, redrawDetailsHeader);

        y = drawTableRow(doc, startX, y, detailColumns, {
          date: formatDate(record.date).split(",")[0],
          subject: record.subjectName || "-",
          session: record.session || "-",
          status: record.status || "-",
        }, {
          rowColor: record.status === "P" ? COLORS.safe : record.status === "L" ? COLORS.warning : COLORS.danger,
        });
      });
    }
  }, studentData.generatedAt);
};

const generateClassReport = async (classData = {}) => {
  return buildPdfBuffer((doc) => {
    const collegeName = classData.collegeName || "Attendance Management System";
    const students = Array.isArray(classData.students) ? classData.students : [];
    const dateColumns = Array.isArray(classData.dates) ? classData.dates : [];

    let y = drawHeader(doc, collegeName, "Class Attendance Report");

    const contentWidth = doc.page.width - PAGE.margin * 2;
    drawInfoLine(doc, "Subject", classData.subjectName, PAGE.margin, y, contentWidth / 2);
    drawInfoLine(doc, "Faculty", classData.facultyName, PAGE.margin + contentWidth / 2, y, contentWidth / 2);
    y += 20;

    const rollWidth = 70;
    const nameWidth = 120;
    const percentWidth = 50;
    const dateWidth = 28;
    const maxDateColumns = Math.max(1, Math.floor((contentWidth - rollWidth - nameWidth - percentWidth) / dateWidth));
    const visibleDates = dateColumns.slice(0, maxDateColumns);

    const columns = [
      { label: "Roll", key: "rollNumber", width: rollWidth, align: "left" },
      { label: "Name", key: "name", width: nameWidth, align: "left" },
      ...visibleDates.map((d, idx) => ({
        label: String(d).slice(5),
        key: `d${idx}`,
        width: dateWidth,
        align: "center",
      })),
      { label: "%", key: "percentage", width: percentWidth, align: "center" },
    ];

    if (dateColumns.length > visibleDates.length) {
      doc.font("Helvetica")
        .fontSize(9)
        .fillColor(COLORS.muted)
        .text(
          `Showing ${visibleDates.length} of ${dateColumns.length} date columns due to page width.`,
          PAGE.margin,
          y
        );
      y += 14;
    }

    const startX = PAGE.margin;

    const redrawHeader = () => {
      const nextY = drawHeader(doc, collegeName, "Class Attendance Report");
      drawInfoLine(doc, "Subject", classData.subjectName, PAGE.margin, nextY, contentWidth / 2);
      drawInfoLine(doc, "Faculty", classData.facultyName, PAGE.margin + contentWidth / 2, nextY, contentWidth / 2);
      return drawTableHeader(doc, startX, nextY + 20, columns);
    };

    y = drawTableHeader(doc, startX, y, columns);

    students.forEach((student) => {
      y = ensureVerticalSpace(doc, y, 24, redrawHeader);

      const attendanceMap = student.attendanceByDate || student.attendance || {};
      const row = {
        rollNumber: student.rollNumber || "-",
        name: student.name || "-",
        percentage: `${toNumber(student.percentage, 0).toFixed(2)}%`,
      };

      visibleDates.forEach((date, idx) => {
        row[`d${idx}`] = attendanceMap[date] || "-";
      });

      y = drawTableRow(doc, startX, y, columns, row, {
        rowColor: pickAttendanceRowColor(student.percentage),
      });
    });

    if (students.length === 0) {
      y = drawTableRow(doc, startX, y, columns, {
        rollNumber: "-",
        name: "No students found",
        percentage: "-",
      });
    }

    y = ensureVerticalSpace(doc, y, 28, redrawHeader);

    const summary = {
      rollNumber: "",
      name: "Summary",
      percentage: `${toNumber(classData.summary?.overallPercentage, 0).toFixed(2)}%`,
    };

    visibleDates.forEach((date, idx) => {
      if (classData.summary?.byDate && typeof classData.summary.byDate[date] !== "undefined") {
        summary[`d${idx}`] = classData.summary.byDate[date];
      } else {
        const presentCount = students.reduce((count, s) => {
          const val = (s.attendanceByDate || s.attendance || {})[date];
          return val === "P" ? count + 1 : count;
        }, 0);
        summary[`d${idx}`] = String(presentCount);
      }
    });

    drawTableRow(doc, startX, y, columns, summary, {
      rowColor: COLORS.headerBg,
      rowHeight: 28,
    });
  }, classData.generatedAt);
};

const generateDepartmentReport = async (deptData = {}) => {
  return buildPdfBuffer((doc) => {
    const collegeName = deptData.collegeName || "Attendance Management System";
    const threshold = toNumber(deptData.threshold, toNumber(process.env.ATTENDANCE_THRESHOLD, 75));
    const overview = Array.isArray(deptData.overview) ? deptData.overview : [];
    const lowStudents = Array.isArray(deptData.lowAttendanceStudents)
      ? deptData.lowAttendanceStudents
      : Array.isArray(deptData.studentsBelowThreshold)
      ? deptData.studentsBelowThreshold
      : [];

    let y = drawHeader(doc, collegeName, "Department Attendance Report");

    const contentWidth = doc.page.width - PAGE.margin * 2;
    drawInfoLine(doc, "Department", deptData.departmentName, PAGE.margin, y, contentWidth / 2);
    drawInfoLine(doc, "Threshold", `${threshold}%`, PAGE.margin + contentWidth / 2, y, contentWidth / 2);
    y += 24;

    doc.font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(COLORS.text)
      .text("Department Overview", PAGE.margin, y);
    y += 14;

    const overviewColumns = [
      { label: "Subject", key: "subject", width: 180 },
      { label: "Students", key: "totalStudents", width: 80, align: "center" },
      { label: "Avg %", key: "avgAttendance", width: 80, align: "center" },
      { label: `Below ${threshold}%`, key: "belowThreshold", width: 100, align: "center" },
    ];

    const startX = PAGE.margin;

    const redrawOverviewHeader = () => {
      const nextY = drawHeader(doc, collegeName, "Department Attendance Report");
      drawInfoLine(doc, "Department", deptData.departmentName, PAGE.margin, nextY, contentWidth / 2);
      drawInfoLine(doc, "Threshold", `${threshold}%`, PAGE.margin + contentWidth / 2, nextY, contentWidth / 2);
      doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.text).text("Department Overview", PAGE.margin, nextY + 24);
      return drawTableHeader(doc, startX, nextY + 38, overviewColumns);
    };

    y = drawTableHeader(doc, startX, y, overviewColumns);

    overview.forEach((row) => {
      y = ensureVerticalSpace(doc, y, 24, redrawOverviewHeader);
      y = drawTableRow(doc, startX, y, overviewColumns, {
        subject: row.subjectName || row.subjectCode || "-",
        totalStudents: toNumber(row.totalStudents, 0),
        avgAttendance: `${toNumber(row.avgAttendance, 0).toFixed(2)}%`,
        belowThreshold: toNumber(row.belowThreshold, 0),
      });
    });

    if (overview.length === 0) {
      y = drawTableRow(doc, startX, y, overviewColumns, {
        subject: "No overview data available",
        totalStudents: "-",
        avgAttendance: "-",
        belowThreshold: "-",
      });
    }

    y += 18;
    y = ensureVerticalSpace(doc, y, 70, redrawOverviewHeader);

    doc.font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(COLORS.text)
      .text(`Students Below ${threshold}%`, PAGE.margin, y);
    y += 14;

    const lowColumns = [
      { label: "Roll", key: "rollNumber", width: 90 },
      { label: "Name", key: "name", width: 170 },
      { label: "Subject", key: "subject", width: 150 },
      { label: "%", key: "percentage", width: 70, align: "center" },
    ];

    const redrawLowHeader = () => {
      const nextY = drawHeader(doc, collegeName, "Department Attendance Report");
      return drawTableHeader(doc, startX, nextY + 20, lowColumns);
    };

    y = drawTableHeader(doc, startX, y, lowColumns);

    lowStudents.forEach((student) => {
      y = ensureVerticalSpace(doc, y, 24, redrawLowHeader);
      y = drawTableRow(doc, startX, y, lowColumns, {
        rollNumber: student.rollNumber || "-",
        name: student.name || student.studentName || "-",
        subject: student.subjectName || student.subjectCode || "-",
        percentage: `${toNumber(student.percentage, 0).toFixed(2)}%`,
      }, {
        rowColor: pickAttendanceRowColor(student.percentage),
      });
    });

    if (lowStudents.length === 0) {
      drawTableRow(doc, startX, y, lowColumns, {
        rollNumber: "-",
        name: "No students below threshold",
        subject: "-",
        percentage: "-",
      }, {
        rowColor: COLORS.safe,
      });
    }
  }, deptData.generatedAt);
};

const CELL_COLORS = {
  P: "#D4EDDA", // Light green - Present
  A: "#F8D7DA", // Light red - Absent
  L: "#FFF3CD", // Light amber - Late
  ML: "#CCE5FF", // Light blue - Medical Leave
  "-": "#F8F9FA", // Light gray - No class/No record
};

const getCellColor = (status) => {
  return CELL_COLORS[status] || CELL_COLORS["-"];
};

const generateMonthlyClassReport = async (reportData = {}, filterMode = "all") => {
  return buildPdfBuffer((doc) => {
    const { reportMeta = {}, summary = {}, classDates = [], rows = [] } = reportData;
    const collegeName = "Attendance Management System";
    const contentWidth = doc.page.width - PAGE.margin * 2;

    let y = PAGE.margin;

    // PAGE 1: Cover / Summary
    // Header block
    doc.save();
    doc.rect(PAGE.margin, y, contentWidth, 70).fill("#1e3a8a"); // Primary blue
    doc.fillColor("#ffffff");
    doc.font("Helvetica-Bold").fontSize(16).text(collegeName, PAGE.margin + 10, y + 8);
    doc.font("Helvetica-Bold").fontSize(14).text("Monthly Attendance Report", PAGE.margin + 10, y + 26);

    doc.font("Helvetica").fontSize(9).text(
      `${reportMeta.monthLabel || ""}  |  Subject: ${reportMeta.subjectCode} - ${reportMeta.subjectName}`,
      doc.page.width - PAGE.margin - 250,
      y + 10,
      { width: 240 }
    );
    doc.fontSize(9).text(
      `Faculty: ${reportMeta.facultyName || ""}`,
      doc.page.width - PAGE.margin - 250,
      y + 26,
      { width: 240 }
    );
    doc.fontSize(9).text(
      `Semester: ${reportMeta.semester} | Section: ${reportMeta.section}`,
      doc.page.width - PAGE.margin - 250,
      y + 42,
      { width: 240 }
    );
    doc.fontSize(9).text(
      `Generated: ${new Date(reportMeta.generatedAt).toLocaleDateString()}`,
      doc.page.width - PAGE.margin - 250,
      y + 58,
      { width: 240 }
    );
    doc.restore();

    y += 80;

    // Filter mode banner
    const bannerColors = {
      all: "#d1d5db", // Gray
      below75: "#fee2e2", // Light red
      above75: "#dcfce7", // Light green
    };

    const bannerTexts = {
      all: `COMPLETE CLASS REPORT — All Students (${rows.length})`,
      below75: `LOW ATTENDANCE REPORT — Students Below 75% (${rows.length})`,
      above75: `GOOD ATTENDANCE REPORT — Students At or Above 75% (${rows.length})`,
    };

    doc.save();
    doc.rect(PAGE.margin, y, contentWidth, 24).fill(bannerColors[filterMode] || bannerColors.all);
    doc.fillColor("#111827");
    doc.font("Helvetica-Bold").fontSize(11).text(bannerTexts[filterMode] || bannerTexts.all, PAGE.margin + 10, y + 5);
    doc.restore();

    y += 32;

    // Summary stats grid (4 boxes)
    const boxWidth = (contentWidth - 12) / 4;
    const boxes = [
      { label: "Total Students", value: summary.totalStudents || 0 },
      { label: "Classes Held", value: summary.classDatesHeld || 0 },
      { label: "Class Average %", value: `${toNumber(summary.classAverage, 0).toFixed(2)}%` },
      { label: "In This Report", value: summary.filtered || 0 },
    ];

    boxes.forEach((box, idx) => {
      const boxX = PAGE.margin + idx * (boxWidth + 3);
      doc.save();
      doc.rect(boxX, y, boxWidth, 50).stroke("#d1d5db");
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(box.label, boxX + 8, y + 6, { width: boxWidth - 16 });
      doc.font("Helvetica-Bold").fontSize(18).fillColor("#1e3a8a").text(String(box.value), boxX + 8, y + 22, { width: boxWidth - 16 });
      doc.restore();
    });

    y += 60;

    // Quick stats row (only for 'all' mode)
    if (filterMode === "all") {
      const above75 = summary.above75Count || 0;
      const below75 = summary.below75Count || 0;
      const total = summary.totalStudents || 1;
      const pctAbove = ((above75 / total) * 100).toFixed(1);

      doc.font("Helvetica").fontSize(10).fillColor("#111827");
      doc.text(`${above75} students (${pctAbove}%) meet 75% threshold`, PAGE.margin, y);

      y += 16;

      // Progress bar
      const barWidth = 200;
      const barHeight = 16;
      const redWidth = (below75 / total) * barWidth;
      const greenWidth = (above75 / total) * barWidth;

      doc.save();
      doc.rect(PAGE.margin, y, redWidth, barHeight).fill("#fee2e2");
      doc.rect(PAGE.margin + redWidth, y, greenWidth, barHeight).fill("#dcfce7");
      doc.rect(PAGE.margin, y, barWidth, barHeight).stroke("#111827");
      doc.restore();

      y += 28;
    }

    // Attendance grid table
    const rollWidth = 60;
    const nameWidth = 120;
    const dateWidth = 20;
    const colWidth = 45;
    const contentWidthTable = contentWidth - rollWidth - nameWidth - colWidth * 4;
    const maxDates = Math.max(1, Math.floor(contentWidthTable / dateWidth));
    const visibleDates = classDates.slice(0, maxDates);

    const columns = [
      { label: "Roll No", key: "rollNumber", width: rollWidth, align: "left" },
      { label: "Student Name", key: "studentName", width: nameWidth, align: "left" },
      ...visibleDates.map((d, idx) => ({
        label: String(d).slice(5, 10),
        key: `date${idx}`,
        width: dateWidth,
        align: "center",
      })),
      { label: "Present", key: "present", width: colWidth, align: "center" },
      { label: "Late", key: "late", width: colWidth, align: "center" },
      { label: "Absent", key: "absent", width: colWidth, align: "center" },
      { label: "%", key: "percentage", width: colWidth, align: "center" },
    ];

    const startX = PAGE.margin;

    const redrawTableHeader = () => {
      const nextY = PAGE.margin + 40;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827").text(`Monthly Report - ${reportMeta.monthLabel}`, PAGE.margin, nextY);
      return drawTableHeader(doc, startX, nextY + 16, columns);
    };

    y = redrawTableHeader();

    rows.forEach((row) => {
      y = ensureVerticalSpace(doc, y, 24, redrawTableHeader);

      // Build row data with color-coded date cells
      const rowData = {
        rollNumber: row.rollNumber || "-",
        studentName: row.studentName || "-",
        present: row.present || 0,
        late: row.late || 0,
        absent: row.absent || 0,
        percentage: `${toNumber(row.percentage, 0).toFixed(2)}%`,
      };

      // Add date grid data
      if (Array.isArray(row.dateGrid)) {
        row.dateGrid.slice(0, maxDates).forEach((status, idx) => {
          rowData[`date${idx}`] = status;
        });
      }

      // Draw row with custom cell colors for dates
      const rowHeight = 24;
      const rowColor = pickAttendanceRowColor(row.percentage);

      doc.save();
      const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
      doc.rect(startX, y, totalWidth, rowHeight).fillAndStroke(rowColor, COLORS.border);

      let x = startX;
      columns.forEach((column, colIdx) => {
        // For date columns, use special color coding
        if (column.key.startsWith("date")) {
          const status = rowData[column.key];
          const cellColor = getCellColor(status);
          doc.rect(x, y, column.width, rowHeight).fillAndStroke(cellColor, COLORS.border);
        } else {
          doc.rect(x, y, column.width, rowHeight).stroke(COLORS.border);
        }

        const value = rowData[column.key] ?? "-";
        doc.font("Helvetica").fontSize(8).fillColor(COLORS.text).text(String(value), x + 2, y + 8, {
          width: column.width - 4,
          align: column.align || "left",
        });
        x += column.width;
      });
      doc.restore();

      y += rowHeight;
    });
  }, reportData.reportMeta?.generatedAt || new Date());
};

const generateSemesterClassReport = async (reportData = {}) => {
  return buildPdfBuffer((doc) => {
    const { reportMeta = {}, summary = {}, classDates = [], rows = [], monthlyTrend = [] } = reportData;
    const collegeName = "Attendance Management System";
    const contentWidth = doc.page.width - PAGE.margin * 2;

    let y = PAGE.margin;

    // PAGE 1: Cover / Summary
    // Header block
    doc.save();
    doc.rect(PAGE.margin, y, contentWidth, 70).fill("#1e3a8a"); // Primary blue
    doc.fillColor("#ffffff");
    doc.font("Helvetica-Bold").fontSize(16).text(collegeName, PAGE.margin + 10, y + 8);
    doc.font("Helvetica-Bold").fontSize(14).text("Semester Attendance Report", PAGE.margin + 10, y + 26);

    doc.font("Helvetica").fontSize(9).text(
      `Academic Year: ${reportMeta.academicYear || ""}  |  Subject: ${reportMeta.subjectCode} - ${reportMeta.subjectName}`,
      doc.page.width - PAGE.margin - 250,
      y + 10,
      { width: 240 }
    );
    doc.fontSize(9).text(
      `Faculty: ${reportMeta.facultyName || ""}`,
      doc.page.width - PAGE.margin - 250,
      y + 26,
      { width: 240 }
    );
    doc.fontSize(9).text(
      `Semester: ${reportMeta.semester} | Section: ${reportMeta.section}`,
      doc.page.width - PAGE.margin - 250,
      y + 42,
      { width: 240 }
    );
    doc.fontSize(9).text(
      `Generated: ${new Date(reportMeta.generatedAt).toLocaleDateString()}`,
      doc.page.width - PAGE.margin - 250,
      y + 58,
      { width: 240 }
    );
    doc.restore();

    y += 80;

    // Summary stats grid
    const boxWidth = (contentWidth - 12) / 4;
    const boxes = [
      { label: "Total Students", value: summary.totalStudents || 0 },
      { label: "Classes Held", value: summary.classDatesHeld || 0 },
      { label: "Semester Average %", value: `${toNumber(summary.classAverage, 0).toFixed(2)}%` },
      { label: "Below 75%", value: summary.below75Count || 0 },
    ];

    boxes.forEach((box, idx) => {
      const boxX = PAGE.margin + idx * (boxWidth + 3);
      doc.save();
      doc.rect(boxX, y, boxWidth, 50).stroke("#d1d5db");
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(box.label, boxX + 8, y + 6, { width: boxWidth - 16 });
      doc.font("Helvetica-Bold").fontSize(18).fillColor("#1e3a8a").text(String(box.value), boxX + 8, y + 22, { width: boxWidth - 16 });
      doc.restore();
    });

    y += 60;

    // Monthly trend table
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827").text("Monthly Trend", PAGE.margin, y);
    y += 14;

    const trendColumns = [
      { label: "Month", key: "month", width: 80, align: "left" },
      { label: "Classes Held", key: "total", width: 80, align: "center" },
      { label: "Avg Attendance %", key: "percentage", width: 100, align: "center" },
      { label: "Chart", key: "chart", width: contentWidth - 260, align: "left" },
    ];

    y = drawTableHeader(doc, PAGE.margin, y, trendColumns);

    monthlyTrend.forEach((trend) => {
      const barLength = 100; // Max 100px for bar
      const barHeight = 12;
      const percentage = toNumber(trend.percentage, 0);
      const barColor = percentage >= 75 ? "#dcfce7" : "#fee2e2";

      const rowData = {
        month: trend.month || "-",
        total: trend.total || 0,
        percentage: `${percentage.toFixed(2)}%`,
        chart: "", // We'll draw bar manually
      };

      y = drawTableRow(doc, PAGE.margin, y, trendColumns, rowData);

      // Draw bar chart in the "chart" column
      const barX = PAGE.margin + 260 + 10;
      const barY = y - 20;
      doc.save();
      doc.rect(barX, barY, barLength, barHeight).stroke("#111827");
      doc.rect(barX, barY, (percentage / 100) * barLength, barHeight).fill(barColor);
      if (percentage >= 75) {
        doc.moveTo(barX + 75, barY - 2).lineTo(barX + 75, barY + barHeight + 2).stroke("#d1d5db");
      }
      doc.restore();
    });

    y += 20;

    // Add page break for full student grid
    doc.addPage();
    y = PAGE.margin;

    // Full student grid
    const rollWidth = 60;
    const nameWidth = 120;
    const dateWidth = 18;
    const colWidth = 40;
    const contentWidthTable = contentWidth - rollWidth - nameWidth - colWidth * 4;
    const maxDates = Math.max(1, Math.floor(contentWidthTable / dateWidth));
    const visibleDates = classDates.slice(0, maxDates);

    const columns = [
      { label: "Roll No", key: "rollNumber", width: rollWidth, align: "left" },
      { label: "Student Name", key: "studentName", width: nameWidth, align: "left" },
      ...visibleDates.map((d, idx) => ({
        label: String(d).slice(5, 10),
        key: `date${idx}`,
        width: dateWidth,
        align: "center",
      })),
      { label: "Present", key: "present", width: colWidth, align: "center" },
      { label: "Late", key: "late", width: colWidth, align: "center" },
      { label: "Absent", key: "absent", width: colWidth, align: "center" },
      { label: "%", key: "percentage", width: colWidth, align: "center" },
    ];

    const startX = PAGE.margin;

    const redrawTableHeader = () => {
      const nextY = PAGE.margin + 16;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827").text("Semester Report - All Students", PAGE.margin, nextY);
      return drawTableHeader(doc, startX, nextY + 16, columns);
    };

    y = redrawTableHeader();

    rows.forEach((row) => {
      y = ensureVerticalSpace(doc, y, 24, redrawTableHeader);

      const rowData = {
        rollNumber: row.rollNumber || "-",
        studentName: row.studentName || "-",
        present: row.present || 0,
        late: row.late || 0,
        absent: row.absent || 0,
        percentage: `${toNumber(row.percentage, 0).toFixed(2)}%`,
      };

      if (Array.isArray(row.dateGrid)) {
        row.dateGrid.slice(0, maxDates).forEach((status, idx) => {
          rowData[`date${idx}`] = status;
        });
      }

      const rowHeight = 24;
      const rowColor = pickAttendanceRowColor(row.percentage);

      doc.save();
      const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
      doc.rect(startX, y, totalWidth, rowHeight).fillAndStroke(rowColor, COLORS.border);

      let x = startX;
      columns.forEach((column) => {
        if (column.key.startsWith("date")) {
          const status = rowData[column.key];
          const cellColor = getCellColor(status);
          doc.rect(x, y, column.width, rowHeight).fillAndStroke(cellColor, COLORS.border);
        } else {
          doc.rect(x, y, column.width, rowHeight).stroke(COLORS.border);
        }

        const value = rowData[column.key] ?? "-";
        doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.text).text(String(value), x + 2, y + 8, {
          width: column.width - 4,
          align: column.align || "left",
        });
        x += column.width;
      });
      doc.restore();

      y += rowHeight;
    });

    // Students below 75% summary on last page
    const belowThreshold = rows.filter((r) => toNumber(r.percentage, 0) < 75);
    if (belowThreshold.length > 0) {
      y = ensureVerticalSpace(doc, y, 60, () => PAGE.margin + 40);

      doc.font("Helvetica-Bold").fontSize(12).fillColor("#991b1b").text("⚠ INTERVENTION REQUIRED", PAGE.margin, y);
      y += 16;
      doc.font("Helvetica").fontSize(10).fillColor("#111827");
      doc.text(
        `The following ${belowThreshold.length} students need immediate attention due to low attendance:`,
        PAGE.margin,
        y,
        { width: contentWidth }
      );
      y += 16;

      const summaryColumns = [
        { label: "Roll No", key: "rollNumber", width: 70, align: "left" },
        { label: "Student Name", key: "studentName", width: 150, align: "left" },
        { label: "%", key: "percentage", width: 60, align: "center" },
        { label: "Classes Needed", key: "classesNeeded", width: 80, align: "center" },
      ];

      y = drawTableHeader(doc, PAGE.margin, y, summaryColumns);

      belowThreshold.forEach((student) => {
        // Calculate classes needed to reach 75%
        const total = toNumber(student.total, 1);
        const present = toNumber(student.present, 0);
        const classesNeeded = Math.ceil((75 * total - 100 * present) / 25);

        y = drawTableRow(doc, PAGE.margin, y, summaryColumns, {
          rollNumber: student.rollNumber || "-",
          studentName: student.studentName || "-",
          percentage: `${toNumber(student.percentage, 0).toFixed(2)}%`,
          classesNeeded: Math.max(0, classesNeeded),
        }, {
          rowColor: COLORS.danger,
        });
      });
    }
  }, reportData.reportMeta?.generatedAt || new Date());
};

module.exports = {
  generateStudentReport,
  generateClassReport,
  generateDepartmentReport,
  generateMonthlyClassReport,
  generateSemesterClassReport,
};
