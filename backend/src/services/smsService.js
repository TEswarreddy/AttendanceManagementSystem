const twilio = require("twilio");

let cachedTwilioClient = null;

const getTwilioClient = () => {
  if (cachedTwilioClient) {
    return cachedTwilioClient;
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) {
    console.warn("Twilio configuration missing. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.");
    return null;
  }

  cachedTwilioClient = twilio(sid, token);
  return cachedTwilioClient;
};

const isConfigured = () => {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
};

const toSuccess = (messageSid) => ({
  success: true,
  messageId: messageSid || null,
});

const toFailure = () => ({
  success: false,
  messageId: null,
});

const sendSMS = async (input, bodyArg) => {
  try {
    const client = getTwilioClient();
    const from = process.env.TWILIO_PHONE_NUMBER;
    const to = typeof input === "object" && input !== null ? input.phone : input;
    const body = typeof input === "object" && input !== null ? input.message : bodyArg;

    if (!client || !from) {
      if (!from) {
        console.warn("Twilio sender number missing. Set TWILIO_PHONE_NUMBER.");
      }
      return toFailure();
    }

    const response = await client.messages.create({
      from,
      to,
      body,
    });

    return toSuccess(response.sid);
  } catch (error) {
    console.error("Failed to send SMS", error);
    return toFailure();
  }
};

const sendLowAttendanceSMS = async (phone, studentName, subjectName, percentage) => {
  const threshold = Number(process.env.ATTENDANCE_THRESHOLD || 75);
  const body = `Hi ${studentName}, alert: your attendance in ${subjectName} is ${percentage}% (required ${threshold}%). Please attend upcoming classes.`;
  return sendSMS(phone, body);
};

const sendOTPSMS = async (phone, otp) => {
  const body = `Your OTP for password reset is ${otp}. It is valid for 10 minutes.`;
  return sendSMS(phone, body);
};

module.exports = {
  sendSMS,
  sendLowAttendanceSMS,
  sendOTPSMS,
  isConfigured,
};
