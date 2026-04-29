import { apiGet, apiPost, apiDownload } from './axiosInstance'

export const facultyApi = {
  // Attendance Management
  markAttendance: (data) => apiPost('/faculty/attendance/mark', data),
  getPeriodStatus: (params) => apiGet('/faculty/attendance/period', params),
  getAttendanceSummary: (params) => apiGet('/faculty/attendance/summary', params),
  
  // Timetable
  getFacultyTimetable: () => apiGet('/faculty/timetable'),
  getAssignedClasses: (params) => apiGet('/faculty/assigned-classes', params),

  // Reports
  downloadReports: (params) => apiDownload('/reports/class/excel', params),
  getSubjectReport: (subjectId, params) => apiGet(`/attendance/subject/${subjectId}/report`, params),
}
