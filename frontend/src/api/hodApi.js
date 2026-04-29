import { apiGet, apiPost, apiPut, apiDownload } from './axiosInstance'

export const hodApi = {
  // Timetable Management
  createTimetable: (data) => apiPost('/timetable-coordinator/timetable', data),
  updateTimetable: (id, data) => apiPut(`/timetable-coordinator/timetable/${id}`, data),
  assignClassTeacher: (data) => apiPost('/hod/class-teacher/assign', data),
  
  // Faculty Management
  getDeptFaculty: (params) => apiGet('/hod/faculty', params),
  addFaculty: (data) => apiPost('/hod/faculty', data),
  assignTimeTableCoordinator: (data) => apiPost('/hod/time-table-coordinator/assign', data),
  assignAttendanceCoordinator: (data) => apiPost('/hod/attendance-coordinator/assign', data),
  
  // Attendance Reports
  getLowAttendanceDept: (params) => apiGet('/hod/low-attendance', params),
  generateShortageList: (data) => apiPost('/hod/shortage-list', data),
  
  // Audit & Calendar
  getAuditLogs: (params) => apiGet('/hod/audit-logs', params),
  manageDeptCalendar: (data) => apiPut('/hod/calendar', data),
  
  // Reports
  downloadDeptReports: (params) => apiDownload('/reports/department/pdf', params),
  downloadDeptExcel: (params) => apiDownload('/reports/department/excel', params),
}
