const cron = require('node-cron');

const smsAlertService = require('../services/smsAlertService');
const emailService = require('../services/emailService');
const attendanceController = require('../controllers/attendanceController');
const reportDataService = require('../utils/reportDataService');
const dateHelper = require('../utils/dateHelper');
const { Student, Attendance, Department, User } = require('../models');

const getCurrentAcademicYear = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const startYear = month >= 5 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
};

const buildDailyStatsFallback = async (departmentId) => {
  const today = dateHelper.toMidnightUTC(new Date());
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const cacheKey = `cron:daily-hod-summary:${String(departmentId || 'all')}:${today.toISOString()}`;

  try {
    const cached = await reportDataService.getCachedReportData(cacheKey);
    if (cached) {
      return cached;
    }
  } catch (error) {
    console.warn('[CRON] Cache read skipped for daily stats:', error.message);
  }

  const attendanceMatch = {
    date: { $gte: today, $lt: tomorrow },
  };

  const studentMatch = { isActive: true };

  if (departmentId) {
    attendanceMatch.departmentId = departmentId;
    studentMatch.departmentId = departmentId;
  }

  const [summaryRows, totalStudents] = await Promise.all([
    Attendance.aggregate([
      { $match: attendanceMatch },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'P'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'L'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'A'] }, 1, 0] } },
        },
      },
    ]),
    Student.countDocuments(studentMatch),
  ]);

  const row = summaryRows[0] || { total: 0, present: 0, late: 0, absent: 0 };
  const attendanceRate = row.total > 0 ? Number((((row.present + row.late * 0.5) / row.total) * 100).toFixed(2)) : 0;

  const stats = {
    date: today,
    totalStudents,
    totalMarked: row.total,
    present: row.present,
    late: row.late,
    absent: row.absent,
    attendanceRate,
  };

  try {
    await reportDataService.setCachedReportData(cacheKey, stats, 10 * 60);
  } catch (error) {
    console.warn('[CRON] Cache write skipped for daily stats:', error.message);
  }

  return stats;
};

const getDailyStatsForHod = async (departmentId) => {
  if (attendanceController && typeof attendanceController.getDailyStats === 'function') {
    try {
      return await attendanceController.getDailyStats(departmentId);
    } catch (error) {
      console.warn('[CRON] attendanceController.getDailyStats failed, fallback used:', error.message);
    }
  }

  return buildDailyStatsFallback(departmentId);
};

const registerAllCronJobs = (app) => {
  void app;

  if (process.env.NODE_ENV !== 'production') {
    console.log('[CRON] Skipping cron registration outside production mode');
    return [];
  }

  const registeredJobs = [];

  // Job 1 - Daily absent SMS check (6:00 PM IST, Monday-Saturday)
  const dailyAbsentSmsJob = cron.schedule(
    '0 18 * * 1-6',
    async () => {
      try {
        const today = dateHelper.toMidnightUTC(new Date());
        const unsent = await Attendance.find({
          date: today,
          status: 'A',
          smsAlertSent: false,
        })
          .populate('studentId', 'phone guardianPhone name rollNumber')
          .populate('subjectId', 'name code');

        for (const record of unsent) {
          await smsAlertService.sendAbsentAlert(record);
        }

        console.log('[CRON] Daily absent SMS: sent for', unsent.length, 'records');
      } catch (error) {
        console.error('[CRON] Daily absent SMS failed:', error.message);
      }
    },
    { timezone: 'Asia/Kolkata' }
  );
  registeredJobs.push(dailyAbsentSmsJob);

  // Job 2 - Monthly threshold alerts (1st of every month, 8:00 AM IST)
  const monthlyThresholdAlertsJob = cron.schedule(
    '0 8 1 * *',
    async () => {
      try {
        const academicYear = getCurrentAcademicYear();
        const depts = await Department.find({ isActive: true }).select('_id code').lean();

        for (const dept of depts) {
          const count = await smsAlertService.checkAndSendMonthlyAlerts(dept._id, null, academicYear);
          console.log('[CRON] Monthly alerts for', dept.code, ':', count, 'sent');
        }
      } catch (error) {
        console.error('[CRON] Monthly threshold alerts failed:', error.message);
      }
    },
    { timezone: 'Asia/Kolkata' }
  );
  registeredJobs.push(monthlyThresholdAlertsJob);

  // Job 3 - Cache invalidation/health check (every 30 minutes)
  const cacheHealthJob = cron.schedule('*/30 * * * *', async () => {
    try {
      console.log('[CRON] Cache health check OK');
    } catch (error) {
      console.error('[CRON] Cache health job failed:', error.message);
    }
  });
  registeredJobs.push(cacheHealthJob);

  // Job 4 - Daily attendance summary email to HODs (8:00 AM IST, Monday-Saturday)
  const dailyHodSummaryEmailJob = cron.schedule(
    '0 8 * * 1-6',
    async () => {
      try {
        const hods = await User.find({ role: 'hod', isActive: true })
          .populate({ path: 'profileId', select: 'departmentId name' })
          .select('email profileId')
          .lean();

        for (const hod of hods) {
          const deptId = hod?.deptId || hod?.profileId?.departmentId || null;
          if (!deptId || !hod?.email) {
            continue;
          }

          const stats = await getDailyStatsForHod(deptId);
          await emailService.sendDailyHODSummary(hod.email, stats);
        }
      } catch (error) {
        console.error('[CRON] Daily HOD summary email failed:', error.message);
      }
    },
    { timezone: 'Asia/Kolkata' }
  );
  registeredJobs.push(dailyHodSummaryEmailJob);

  console.log('[CRON] Registered', registeredJobs.length, 'jobs');
  return registeredJobs;
};

module.exports = {
  registerAllCronJobs,
};
