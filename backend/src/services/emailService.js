const nodemailer = require("nodemailer");

let cachedTransporter = null;
let transporterInitPromise = null;

const isSmtpConfigured = () => {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
};

const isSendGridApiConfigured = () => Boolean(process.env.SENDGRID_API_KEY);

const createTransporter = async () => {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  if (!isSmtpConfigured() && !isSendGridApiConfigured()) {
    console.warn(
      "Email configuration missing. Set SMTP_* or SENDGRID_API_KEY to enable emails."
    );
    return null;
  }

  let transporter;
  if (isSmtpConfigured()) {
    const smtpPort = Number(process.env.SMTP_PORT);
    const secure = smtpPort === 465;

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // SendGrid SMTP via API key (username must be literally "apikey").
    transporter = nodemailer.createTransport({
      host: "smtp.sendgrid.net",
      port: 587,
      secure: false,
      auth: {
        user: "apikey",
        pass: process.env.SENDGRID_API_KEY,
      },
    });
  }

  await transporter.verify();
  console.log("Email service ready");

  cachedTransporter = transporter;
  return cachedTransporter;
};

const getTransporter = async () => {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  if (!transporterInitPromise) {
    transporterInitPromise = createTransporter()
      .catch((error) => {
        console.error("Failed to initialize email transporter", error);
        return null;
      })
      .finally(() => {
        transporterInitPromise = null;
      });
  }

  return transporterInitPromise;
};

const buildBaseTemplate = (title, bodyContent) => {
  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f6f8;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:#0f172a;color:#ffffff;">
                <h1 style="margin:0;font-size:20px;line-height:1.3;font-weight:700;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;font-size:15px;line-height:1.6;color:#111827;">
                ${bodyContent}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
                This is an automated message from the Attendance Management System.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();
};

const delay = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const toResult = (info) => ({
  success: true,
  messageId: info?.messageId || null,
});

const toFailure = () => ({
  success: false,
  messageId: null,
});

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const transporter = await getTransporter();
    if (!transporter) {
      console.warn(`Email not sent (SMTP unavailable). To: ${to}, Subject: ${subject}`);
      return toFailure();
    }

    const info = await transporter.sendMail({
      from:
        process.env.SENDGRID_SENDER ||
        process.env.EMAIL_FROM ||
        process.env.SMTP_USER,
      replyTo:
        process.env.SENDGRID_REPLY_TO ||
        process.env.EMAIL_REPLY_TO ||
        process.env.SENDGRID_SENDER ||
        process.env.EMAIL_FROM ||
        process.env.SMTP_USER,
      to,
      subject,
      html,
      text,
    });
    return toResult(info);
  } catch (error) {
    console.error("Failed to send email", error);
    return toFailure();
  }
};

const sendLowAttendanceAlert = async (
  studentEmail,
  studentName,
  subjectName,
  percentage
) => {
  const threshold = Number(process.env.ATTENDANCE_THRESHOLD || 75);
  const portalUrl = process.env.STUDENT_PORTAL_URL || process.env.FRONTEND_URL || "#";
  const isBelowThreshold = Number(percentage) < threshold;

  const title = "Low Attendance Alert";
  const warningBanner = isBelowThreshold
    ? `<p style="margin:0 0 12px;padding:10px 12px;border-radius:6px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-weight:700;">Warning: Your attendance is below the required threshold (${threshold}%).</p>`
    : "";

  const html = buildBaseTemplate(
    title,
    `
      <p style="margin:0 0 12px;">Hi ${studentName || "Student"},</p>
      ${warningBanner}
      <p style="margin:0 0 8px;">Subject: <strong>${subjectName}</strong></p>
      <p style="margin:0 0 12px;">Current Attendance: <strong>${percentage}%</strong></p>
      <p style="margin:0 0 16px;">Please attend upcoming classes regularly to improve your attendance.</p>
      <a href="${portalUrl}" style="display:inline-block;padding:10px 14px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Open Student Portal</a>
    `.trim()
  );

  const text = `Hi ${studentName || "Student"}, your attendance in ${subjectName} is ${percentage}%. Please check the student portal: ${portalUrl}`;
  return sendEmail({
    to: studentEmail,
    subject: title,
    html,
    text,
  });
};

const sendOTPEmail = async (email, otpOrName, maybeOtp) => {
  const otp = typeof maybeOtp === "undefined" ? otpOrName : maybeOtp;
  const name = typeof maybeOtp === "undefined" ? "User" : otpOrName;

  const title = "Password Reset OTP";
  const html = buildBaseTemplate(
    title,
    `
      <p style="margin:0 0 12px;">Hi ${name || "User"},</p>
      <p style="margin:0 0 12px;">Use the OTP below to reset your password:</p>
      <p style="margin:16px 0;padding:10px 14px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:24px;font-weight:700;letter-spacing:3px;display:inline-block;">${otp}</p>
      <p style="margin:12px 0 0;">This OTP is valid for 10 minutes.</p>
      <p style="margin:8px 0 0;">If you did not request this, please ignore this email.</p>
    `.trim()
  );

  const text = `Hi ${name || "User"}, your OTP for password reset is ${otp}. It is valid for 10 minutes.`;
  return sendEmail({ to: email, subject: title, html, text });
};

const sendBulkAlerts = async (students = []) => {
  const results = [];

  for (let i = 0; i < students.length; i += 1) {
    const student = students[i];
    const result = await sendLowAttendanceAlert(
      student.studentEmail,
      student.studentName,
      student.subjectName,
      student.percentage
    );

    results.push({
      email: student.studentEmail,
      ...result,
    });

    if (i < students.length - 1) {
      await delay(100);
    }
  }

  return {
    success: results.every((r) => r.success),
    messageId: null,
    results,
  };
};

const sendLeaveStatusEmail = async (studentEmail, status, leaveDetails = {}) => {
  const normalizedStatus = String(status || "pending").toUpperCase();
  const statusColor = normalizedStatus === "APPROVED" ? "#166534" : normalizedStatus === "REJECTED" ? "#991b1b" : "#1f2937";
  const title = `Leave Request ${normalizedStatus}`;

  const html = buildBaseTemplate(
    title,
    `
      <p style="margin:0 0 12px;">Your leave request status has been updated.</p>
      <p style="margin:0 0 8px;">Status: <strong style="color:${statusColor};">${normalizedStatus}</strong></p>
      <p style="margin:0 0 8px;">From: <strong>${leaveDetails.fromDate || "N/A"}</strong></p>
      <p style="margin:0 0 8px;">To: <strong>${leaveDetails.toDate || "N/A"}</strong></p>
      <p style="margin:0 0 8px;">Reason: <strong>${leaveDetails.reason || "N/A"}</strong></p>
      <p style="margin:0;">Remarks: <strong>${leaveDetails.remarks || "N/A"}</strong></p>
    `.trim()
  );

  const text = `Leave status: ${normalizedStatus}. From: ${leaveDetails.fromDate || "N/A"}, To: ${leaveDetails.toDate || "N/A"}.`;
  return sendEmail({
    to: studentEmail,
    subject: title,
    html,
    text,
  });
};

const sendDailyHODSummary = async (email, stats = {}) => {
  const title = "Daily Attendance Summary";
  const dateLabel = stats?.date ? new Date(stats.date).toLocaleDateString() : new Date().toLocaleDateString();
  const html = buildBaseTemplate(
    title,
    `
      <p style="margin:0 0 12px;">Daily summary for <strong>${dateLabel}</strong></p>
      <p style="margin:0 0 8px;">Students: <strong>${Number(stats.totalStudents || 0)}</strong></p>
      <p style="margin:0 0 8px;">Records Marked: <strong>${Number(stats.totalMarked || 0)}</strong></p>
      <p style="margin:0 0 8px;">Present: <strong>${Number(stats.present || 0)}</strong></p>
      <p style="margin:0 0 8px;">Late: <strong>${Number(stats.late || 0)}</strong></p>
      <p style="margin:0 0 8px;">Absent: <strong>${Number(stats.absent || 0)}</strong></p>
      <p style="margin:0;">Attendance Rate: <strong>${Number(stats.attendanceRate || 0).toFixed(2)}%</strong></p>
    `.trim()
  );

  const text = [
    `Daily summary for ${dateLabel}`,
    `Students: ${Number(stats.totalStudents || 0)}`,
    `Records Marked: ${Number(stats.totalMarked || 0)}`,
    `Present: ${Number(stats.present || 0)}`,
    `Late: ${Number(stats.late || 0)}`,
    `Absent: ${Number(stats.absent || 0)}`,
    `Attendance Rate: ${Number(stats.attendanceRate || 0).toFixed(2)}%`,
  ].join("\n");

  return sendEmail({
    to: email,
    subject: title,
    html,
    text,
  });
};

module.exports = {
  createTransporter,
  getTransporter,
  buildBaseTemplate,
  sendEmail,
  sendLowAttendanceAlert,
  sendOTPEmail,
  sendBulkAlerts,
  sendLeaveStatusEmail,
  sendDailyHODSummary,
};
