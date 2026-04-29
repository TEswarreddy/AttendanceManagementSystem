import { apiGet, apiPost, apiPut, apiDownload } from './axiosInstance'

export const classTeacherApi = {
  // Class Timetable
  getAssignedTimetable: (params) => apiGet('/class-teacher/timetable', params),

  // Attendance Management
  getDailyAttendance: (params) => apiGet('/class-teacher/daily-attendance', params),
  triggerAbsentSMS: (data) => apiPost('/class-teacher/send-absent-sms', data),
  
  // Student Management
  getClassStudents: (params) => apiGet('/class-teacher/students', params),
  addStudent: (data) => apiPost('/class-teacher/students', data),
  updateStudent: (studentId, data) => apiPut(`/class-teacher/students/${studentId}`, data),
  
  // Notices
  sendNotice: (data) => apiPost('/class-teacher/notices', data),
  getNoticeHistory: (params) => apiGet('/class-teacher/notices', params),
  
  // Leave Requests
  getLeaveRequests: (params) => apiGet('/class-teacher/leave-requests', params),
  
  // Attendance Alerts
  getMonthlyLowAttendance: (params) => apiGet('/class-teacher/monthly-alerts', params),
  triggerMonthlyAlerts: (data) => apiPost('/class-teacher/monthly-alerts', data),
  
  // Reports
  downloadMonthlyReport: (params) => apiDownload('/class-teacher/reports/monthly', params),
  downloadSemesterReport: (params) => apiDownload('/class-teacher/reports/semester', params),
  
  // Inherited from Faculty
  getFacultyTimetable: () => apiGet('/faculty/timetable'),
  markAttendance: (data) => apiPost('/faculty/attendance/mark', data),
}
