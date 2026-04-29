const ExcelJS = require("exceljs");

const COLORS = {
  primary: "FF1E3A8A",
  textDark: "FF111827",
  headerText: "FFFFFFFF",
  headerBg: "FF1F2937",
  border: "FFD1D5DB",
  status: {
    P: "FFD4EDDA",
    A: "FFF8D7DA",
    L: "FFFFF3CD",
    ML: "FFCCE5FF",
    "-": "FFF8F9FA",
  },
  redText: "FFC00000",
  amberText: "FFB8860B",
  greenText: "FF1D6F42",
  lowDayBg: "FFFEE2E2",
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asDate = (value) => {
  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const formatDateDDMM = (value) => {
  const date = asDate(value);
  if (!date) {
    return String(value || "-");
  }

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
};

const normalizeStatus = (status) => {
  const value = String(status || "-").trim().toUpperCase();

  if (value === "P" || value === "PRESENT") return "P";
  if (value === "A" || value === "ABSENT") return "A";
  if (value === "L" || value === "LATE") return "L";
  if (value === "ML" || value === "MEDICAL LEAVE") return "ML";
  return "-";
};

const addCellBorder = (cell) => {
  cell.border = {
    top: { style: "thin", color: { argb: COLORS.border } },
    left: { style: "thin", color: { argb: COLORS.border } },
    bottom: { style: "thin", color: { argb: COLORS.border } },
    right: { style: "thin", color: { argb: COLORS.border } },
  };
};

const styleHeaderRow = (row) => {
  row.height = 28;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.headerText } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.headerBg },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    addCellBorder(cell);
  });
};

const applyPercentageConditionalFormatting = (worksheet, colNumber, startRow, endRow) => {
  if (endRow < startRow) {
    return;
  }

  worksheet.addConditionalFormatting({
    ref: `${worksheet.getColumn(colNumber).letter}${startRow}:${worksheet.getColumn(colNumber).letter}${endRow}`,
    rules: [
      {
        type: "cellIs",
        operator: "lessThan",
        formulae: ["65"],
        style: {
          font: { color: { argb: COLORS.redText }, bold: true },
        },
      },
      {
        type: "cellIs",
        operator: "between",
        formulae: ["65", "74.9999"],
        style: {
          font: { color: { argb: COLORS.amberText }, bold: true },
        },
      },
      {
        type: "cellIs",
        operator: "greaterThanOrEqual",
        formulae: ["75"],
        style: {
          font: { color: { argb: COLORS.greenText }, bold: true },
        },
      },
    ],
  });
};

const setWorkbookMeta = (workbook) => {
  workbook.creator = "Attendance Management System";
  workbook.created = new Date();
};

const getFilterLabel = (mode) => {
  if (mode === "below75") return "LOW ATTENDANCE (Below 75%)";
  if (mode === "above75") return "GOOD ATTENDANCE (At or Above 75%)";
  return "ALL STUDENTS";
};

const writeMainStudentGridSheet = ({ worksheet, reportData, filterMode, includeTotalsRow = true, dateSlice }) => {
  const reportMeta = reportData.reportMeta || {};
  const summary = reportData.summary || {};
  const allDates = Array.isArray(reportData.classDates) ? reportData.classDates : [];
  const rows = Array.isArray(reportData.rows) ? reportData.rows : [];

  const startDateIndex = dateSlice?.start || 0;
  const endDateIndex = dateSlice?.end || allDates.length;
  const classDates = allDates.slice(startDateIndex, endDateIndex);

  const firstDateColumn = 3;
  const countsStartColumn = firstDateColumn + classDates.length;
  const presentCol = countsStartColumn;
  const lateCol = countsStartColumn + 1;
  const absentCol = countsStartColumn + 2;
  const totalCol = countsStartColumn + 3;
  const percentCol = countsStartColumn + 4;
  const lastColumn = percentCol;

  worksheet.getColumn(1).width = 12;
  worksheet.getColumn(2).width = 25;

  for (let i = 0; i < classDates.length; i += 1) {
    const col = worksheet.getColumn(firstDateColumn + i);
    col.width = 7;
    col.style = {
      alignment: {
        horizontal: "center",
        vertical: "middle",
        textRotation: 90,
      },
    };
  }

  worksheet.getColumn(presentCol).width = 8;
  worksheet.getColumn(lateCol).width = 8;
  worksheet.getColumn(absentCol).width = 8;
  worksheet.getColumn(totalCol).width = 9;
  worksheet.getColumn(percentCol).width = 8;

  const collegeName = process.env.COLLEGE_NAME || "Attendance Management System";
  worksheet.mergeCells(1, 1, 1, lastColumn);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = collegeName;
  titleCell.font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.primary },
  };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const reportTitle = reportMeta.monthLabel
    ? `Monthly Attendance Report - ${reportMeta.monthLabel} - ${getFilterLabel(filterMode)}`
    : `Monthly Attendance Report - ${getFilterLabel(filterMode)}`;
  worksheet.mergeCells(2, 1, 2, lastColumn);
  const subtitleCell = worksheet.getCell(2, 1);
  subtitleCell.value = reportTitle;
  subtitleCell.font = { bold: true, size: 12, color: { argb: COLORS.textDark } };
  subtitleCell.alignment = { horizontal: "left", vertical: "middle" };

  worksheet.mergeCells(3, 1, 3, lastColumn);
  const generatedAt = asDate(reportMeta.generatedAt) || new Date();
  const infoCell = worksheet.getCell(3, 1);
  infoCell.value = `Subject: ${reportMeta.subjectCode || "-"} ${reportMeta.subjectName || "-"} | Faculty: ${reportMeta.facultyName || "-"} | Semester: ${reportMeta.semester || "-"} | Section: ${reportMeta.section || "-"} | Generated: ${generatedAt.toLocaleDateString()}`;
  infoCell.font = { size: 10, color: { argb: COLORS.textDark } };
  infoCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };

  worksheet.getCell(5, 1).value = `Total Students: ${summary.totalStudents || 0}`;
  worksheet.getCell(5, 2).value = `Classes Held: ${summary.classDatesHeld || 0}`;
  worksheet.getCell(5, 3).value = `Average %: ${toNumber(summary.classAverage, 0).toFixed(2)}%`;
  worksheet.getCell(5, 4).value = `Students Shown: ${summary.filtered || rows.length}`;

  for (let col = 1; col <= 4; col += 1) {
    const cell = worksheet.getCell(5, col);
    cell.font = { bold: true, color: { argb: COLORS.textDark } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" },
    };
    addCellBorder(cell);
  }

  const headerRow = worksheet.getRow(7);
  const headers = ["Roll No", "Student Name"];
  classDates.forEach((date) => headers.push(formatDateDDMM(date)));
  headers.push("P", "L", "A", "Total", "%");
  headerRow.values = headers;
  styleHeaderRow(headerRow);

  classDates.forEach((_, index) => {
    const colNumber = firstDateColumn + index;
    const cell = worksheet.getCell(7, colNumber);
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      textRotation: 90,
    };
  });

  let currentRow = 8;
  rows.forEach((student) => {
    const row = worksheet.getRow(currentRow);

    row.getCell(1).value = student.rollNumber || "-";
    row.getCell(2).value = student.studentName || student.name || "-";

    const fullDateGrid = Array.isArray(student.dateGrid) ? student.dateGrid : [];
    const dateGrid = fullDateGrid.slice(startDateIndex, endDateIndex);
    dateGrid.forEach((status, idx) => {
      const cell = row.getCell(firstDateColumn + idx);
      const normalizedStatus = normalizeStatus(status);
      cell.value = normalizedStatus;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.status[normalizedStatus] || COLORS.status["-"] },
      };
      addCellBorder(cell);
    });

    row.getCell(presentCol).value = toNumber(student.present, 0);
    row.getCell(lateCol).value = toNumber(student.late, 0);
    row.getCell(absentCol).value = toNumber(student.absent, 0);
    row.getCell(totalCol).value = toNumber(student.total, classDates.length);
    row.getCell(percentCol).value = Number(toNumber(student.percentage, 0).toFixed(2));
    row.getCell(percentCol).numFmt = "0.00";

    [1, 2, presentCol, lateCol, absentCol, totalCol, percentCol].forEach((col) => {
      const cell = row.getCell(col);
      if (col !== 2) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }
      addCellBorder(cell);
    });

    currentRow += 1;
  });

  const lastDataRow = currentRow - 1;

  if (includeTotalsRow) {
    const avgRow = worksheet.getRow(currentRow);
    avgRow.getCell(1).value = "CLASS AVERAGE";
    avgRow.getCell(1).font = { bold: true };
    avgRow.getCell(percentCol).value = Number(toNumber(summary.classAverage, 0).toFixed(2));
    avgRow.getCell(percentCol).numFmt = "0.00";
    avgRow.getCell(percentCol).font = { bold: true };
    avgRow.eachCell((cell) => {
      addCellBorder(cell);
    });
  }

  applyPercentageConditionalFormatting(worksheet, percentCol, 8, lastDataRow);

  worksheet.autoFilter = {
    from: { row: 7, column: 1 },
    to: { row: 7, column: lastColumn },
  };

  worksheet.views = [
    {
      state: "frozen",
      xSplit: 2,
      ySplit: 7,
    },
  ];

  return {
    firstDataRow: 8,
    lastDataRow,
    classDates,
    firstDateColumn,
    percentCol,
    lastColumn,
  };
};

const writeSummarySheet = ({ worksheet, reportData, filterMode }) => {
  const summary = reportData.summary || {};
  const rows = Array.isArray(reportData.rows) ? reportData.rows : [];

  worksheet.columns = [
    { header: "Metric", key: "metric", width: 32 },
    { header: "Value", key: "value", width: 22 },
  ];

  const header = worksheet.getRow(1);
  header.values = ["Metric", "Value"];
  styleHeaderRow(header);

  const metrics = [
    ["Total Students", summary.totalStudents || 0],
    ["Classes Held", summary.classDatesHeld || 0],
    ["Average %", `${toNumber(summary.classAverage, 0).toFixed(2)}%`],
    ["Below 75 Count", summary.below75Count || 0],
    ["Above 75 Count", summary.above75Count || 0],
    ["Perfect Attendance", summary.perfectAttendance || 0],
  ];

  let currentRow = 2;
  metrics.forEach(([metric, value]) => {
    const row = worksheet.getRow(currentRow);
    row.values = [metric, value];
    row.eachCell((cell) => addCellBorder(cell));
    currentRow += 1;
  });

  if (filterMode === "all") {
    currentRow += 1;
    const titleRow = worksheet.getRow(currentRow);
    titleRow.getCell(1).value = "Below 75% Students";
    titleRow.getCell(1).font = { bold: true, size: 12 };
    currentRow += 1;

    const tableHeader = worksheet.getRow(currentRow);
    tableHeader.values = ["Roll No", "Name", "Percentage"];
    tableHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: COLORS.headerText } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.headerBg },
      };
      addCellBorder(cell);
    });
    currentRow += 1;

    rows
      .filter((student) => toNumber(student.percentage, 0) < 75)
      .sort((a, b) => toNumber(a.percentage, 0) - toNumber(b.percentage, 0))
      .forEach((student) => {
        const row = worksheet.getRow(currentRow);
        row.values = [
          student.rollNumber || "-",
          student.studentName || student.name || "-",
          `${toNumber(student.percentage, 0).toFixed(2)}%`,
        ];
        row.eachCell((cell) => addCellBorder(cell));
        currentRow += 1;
      });
  }
};

const buildDatesAnalysisRows = (reportData) => {
  const reportMeta = reportData.reportMeta || {};
  const classDates = Array.isArray(reportData.classDates) ? reportData.classDates : [];
  const rows = Array.isArray(reportData.rows) ? reportData.rows : [];
  const session = reportMeta.session || "-";

  const analysisRows = classDates.map((dateValue, index) => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let participated = 0;

    rows.forEach((student) => {
      const status = normalizeStatus(Array.isArray(student.dateGrid) ? student.dateGrid[index] : "-");
      if (status === "-") {
        return;
      }

      participated += 1;
      if (status === "P") present += 1;
      else if (status === "A") absent += 1;
      else if (status === "L") late += 1;
      else if (status === "ML") late += 1;
    });

    const dateObj = asDate(dateValue);
    const attendanceRate = participated > 0
      ? ((present + (late * 0.5)) / participated) * 100
      : 0;

    return {
      dateValue,
      sortableDate: dateObj ? dateObj.getTime() : Number.MAX_SAFE_INTEGER,
      dateLabel: formatDateDDMM(dateValue),
      day: dateObj ? dateObj.toLocaleDateString("en-US", { weekday: "short" }) : "-",
      session,
      present,
      absent,
      late,
      attendanceRate: Number(attendanceRate.toFixed(2)),
    };
  });

  return analysisRows.sort((a, b) => a.sortableDate - b.sortableDate);
};

const writeDatesAnalysisSheet = ({ worksheet, reportData }) => {
  worksheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Day", key: "day", width: 12 },
    { header: "Session", key: "session", width: 12 },
    { header: "Present Count", key: "present", width: 16 },
    { header: "Absent Count", key: "absent", width: 16 },
    { header: "Late Count", key: "late", width: 14 },
    { header: "Attendance Rate", key: "attendanceRate", width: 16 },
  ];

  const header = worksheet.getRow(1);
  header.values = worksheet.columns.map((col) => col.header);
  styleHeaderRow(header);

  const rows = buildDatesAnalysisRows(reportData);
  let minRate = Number.POSITIVE_INFINITY;

  rows.forEach((item, idx) => {
    const row = worksheet.getRow(idx + 2);
    row.values = [
      item.dateLabel,
      item.day,
      item.session,
      item.present,
      item.absent,
      item.late,
      item.attendanceRate,
    ];
    row.getCell(7).numFmt = "0.00";

    row.eachCell((cell) => {
      cell.alignment = { horizontal: "center", vertical: "middle" };
      addCellBorder(cell);
    });

    minRate = Math.min(minRate, item.attendanceRate);
  });

  rows.forEach((item, idx) => {
    if (item.attendanceRate !== minRate) {
      return;
    }

    const row = worksheet.getRow(idx + 2);
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.lowDayBg },
      };
    });
  });
};

const writeMonthlyTrendSheet = ({ worksheet, reportData }) => {
  const monthlyTrend = Array.isArray(reportData.monthlyTrend) ? reportData.monthlyTrend : [];

  worksheet.columns = [
    { header: "Month", key: "month", width: 16 },
    { header: "Classes Held", key: "classesHeld", width: 14 },
    { header: "Avg Present", key: "avgPresent", width: 14 },
    { header: "Avg Late", key: "avgLate", width: 12 },
    { header: "Avg Absent", key: "avgAbsent", width: 14 },
    { header: "Avg %", key: "avgPercentage", width: 10 },
  ];

  const header = worksheet.getRow(1);
  header.values = worksheet.columns.map((col) => col.header);
  styleHeaderRow(header);

  monthlyTrend.forEach((item, idx) => {
    const classesHeld = toNumber(item.classesHeld ?? item.total, 0);
    const avgPresent = toNumber(item.avgPresent ?? item.present, 0);
    const avgLate = toNumber(item.avgLate ?? item.late, 0);
    const avgAbsent = toNumber(item.avgAbsent ?? item.absent ?? (classesHeld - avgPresent - avgLate), 0);
    const avgPercentage = toNumber(item.avgPercentage ?? item.percentage, 0);

    const row = worksheet.getRow(idx + 2);
    row.values = [item.month || "-", classesHeld, avgPresent, avgLate, avgAbsent, avgPercentage];
    row.getCell(6).numFmt = "0.00";
    row.eachCell((cell) => {
      cell.alignment = { horizontal: "center", vertical: "middle" };
      addCellBorder(cell);
    });
  });

  applyPercentageConditionalFormatting(worksheet, 6, 2, monthlyTrend.length + 1);

  const chartStart = monthlyTrend.length + 4;
  worksheet.getCell(chartStart, 1).value = "Chart Data (for manual chart creation)";
  worksheet.getCell(chartStart, 1).font = { bold: true };

  const chartHeader = worksheet.getRow(chartStart + 1);
  chartHeader.values = ["Month", "Avg %"];
  chartHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.headerText } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.headerBg },
    };
    addCellBorder(cell);
  });

  monthlyTrend.forEach((item, idx) => {
    const row = worksheet.getRow(chartStart + 2 + idx);
    row.values = [item.month || "-", toNumber(item.avgPercentage ?? item.percentage, 0)];
    row.getCell(2).numFmt = "0.00";
    row.eachCell((cell) => addCellBorder(cell));
  });
};

const calculateClassesNeededFor75 = (totalClasses, presentClasses) => {
  const total = Math.max(0, toNumber(totalClasses, 0));
  const present = Math.max(0, toNumber(presentClasses, 0));
  const needed = Math.ceil((75 * total - 100 * present) / 25);
  return Math.max(0, needed);
};

const writeBelow75Sheet = ({ worksheet, reportData }) => {
  const allRows = Array.isArray(reportData.rows) ? reportData.rows : [];
  const lowRows = allRows
    .filter((row) => toNumber(row.percentage, 0) < 75)
    .sort((a, b) => toNumber(a.percentage, 0) - toNumber(b.percentage, 0));

  worksheet.columns = [
    { header: "Roll No", key: "roll", width: 12 },
    { header: "Name", key: "name", width: 25 },
    { header: "Total", key: "total", width: 10 },
    { header: "Present", key: "present", width: 10 },
    { header: "%", key: "percentage", width: 8 },
    { header: "Classes Needed", key: "classesNeeded", width: 15 },
    { header: "Contact", key: "contact", width: 30 },
  ];

  const header = worksheet.getRow(1);
  header.values = worksheet.columns.map((col) => col.header);
  styleHeaderRow(header);

  lowRows.forEach((student, idx) => {
    const row = worksheet.getRow(idx + 2);
    const contactValue = [student.phone, student.guardianPhone].filter(Boolean).join(" | ") || "-";
    const percentage = toNumber(student.percentage, 0);
    row.values = [
      student.rollNumber || "-",
      student.studentName || student.name || "-",
      toNumber(student.total, 0),
      toNumber(student.present, 0),
      percentage,
      calculateClassesNeededFor75(student.total, student.present),
      contactValue,
    ];
    row.getCell(5).numFmt = "0.00";
    row.eachCell((cell) => {
      cell.alignment = { horizontal: "center", vertical: "middle" };
      addCellBorder(cell);
    });
    row.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
    row.getCell(7).alignment = { horizontal: "left", vertical: "middle" };
  });

  applyPercentageConditionalFormatting(worksheet, 5, 2, lowRows.length + 1);
};

const generateMonthlyClassExcel = async (reportData = {}, filterMode = "all") => {
  const workbook = new ExcelJS.Workbook();
  setWorkbookMeta(workbook);

  const mode = filterMode || reportData.reportMeta?.filter || "all";

  const reportSheet = workbook.addWorksheet("Report");
  writeMainStudentGridSheet({
    worksheet: reportSheet,
    reportData,
    filterMode: mode,
  });

  const summarySheet = workbook.addWorksheet("Summary");
  writeSummarySheet({
    worksheet: summarySheet,
    reportData,
    filterMode: mode,
  });

  const datesAnalysisSheet = workbook.addWorksheet("Dates Analysis");
  writeDatesAnalysisSheet({
    worksheet: datesAnalysisSheet,
    reportData,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

const generateSemesterClassExcel = async (reportData = {}) => {
  const workbook = new ExcelJS.Workbook();
  setWorkbookMeta(workbook);

  const monthlyTrendSheet = workbook.addWorksheet("Monthly Trend");
  writeMonthlyTrendSheet({
    worksheet: monthlyTrendSheet,
    reportData,
  });

  const classDates = Array.isArray(reportData.classDates) ? reportData.classDates : [];
  const maxDateColumnsPerSheet = 80;

  if (classDates.length > maxDateColumnsPerSheet) {
    let partIndex = 1;
    for (let start = 0; start < classDates.length; start += maxDateColumnsPerSheet) {
      const end = Math.min(start + maxDateColumnsPerSheet, classDates.length);
      const worksheet = workbook.addWorksheet(`Students (Part ${partIndex})`);
      writeMainStudentGridSheet({
        worksheet,
        reportData,
        filterMode: "all",
        includeTotalsRow: partIndex === 1,
        dateSlice: { start, end },
      });
      partIndex += 1;
    }
  } else {
    const allStudentsSheet = workbook.addWorksheet("All Students");
    writeMainStudentGridSheet({
      worksheet: allStudentsSheet,
      reportData,
      filterMode: "all",
    });
  }

  const below75Sheet = workbook.addWorksheet("Below 75%");
  writeBelow75Sheet({
    worksheet: below75Sheet,
    reportData,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

module.exports = {
  generateMonthlyClassExcel,
  generateSemesterClassExcel,
};
