import api, { apiGet, apiPost, apiPut, apiDelete, apiDownload } from './axiosInstance'

export const adminApi = {
  // Dashboard & Stats
  getDashboardOverview: (params) => apiGet('/admin/dashboard', params),
  getCollegeDashboardStats: (params) => apiGet('/admin/stats', params),
  
  // HOD Management
  manageHODs: (data) => apiPost('/admin/hods', data),
  createHODWithAccount: (data) => apiPost('/admin/hods/create', data),
  createFacultyWithAccount: (data) => apiPost('/admin/faculty/create', data),
  
  // Attendance Settings
  setAttendanceThreshold: (data) => apiPut('/admin/threshold', data),
  
  // Academic Year
  manageAcademicYear: (data) => apiPut('/admin/academic-year', data),
  
  // Students
  getStudents: (params) => apiGet('/students', params),
  createStudent: (data) => apiPost('/students', data),
  bulkImportStudents: (file, departmentId) => {
    const formData = new FormData()
    formData.append('file', file)
    if (departmentId) formData.append('departmentId', departmentId)
    return api.post('/students/bulk-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  updateStudent: (id, data) => apiPut(`/students/${id}`, data),
  deactivateStudent: (id) => apiPut(`/students/${id}/deactivate`),
  deleteStudent: (id) => apiPut(`/students/${id}/deactivate`),
  deactivate: (id) => apiPut(`/students/${id}/deactivate`),
  
  // Faculty
  getFaculty: (params) => apiGet('/faculty', params),
  createFaculty: (data) => apiPost('/faculty', data),
  updateFaculty: (id, data) => apiPut(`/faculty/${id}`, data),
  deleteFaculty: (id) => apiDelete(`/faculty/${id}`),
  deactivateFaculty: (id) => apiDelete(`/faculty/${id}`),
  
  // Subjects
  getSubjects: (params) => apiGet('/subjects', params),
  createSubject: (data) => apiPost('/subjects', data),
  updateSubject: (id, data) => apiPut(`/subjects/${id}`, data),
  deleteSubject: (id) => apiDelete(`/subjects/${id}`),
  deactivateSubject: (id) => apiDelete(`/subjects/${id}`),
  
  // Timetable
  getTimetable: (params) => apiGet('/timetable', params),
  createTimetable: (data) => apiPost('/timetable', data),
  updateTimetable: (id, data) => apiPut(`/timetable/${id}`, data),
  deleteTimetable: (id) => apiDelete(`/timetable/${id}`),
  
  // Departments
  getDepartments: () => apiGet('/departments'),
  createDepartment: (data) => apiPost('/departments', data),
  updateDepartment: (id, data) => apiPut(`/departments/${id}`, data),
  deleteDepartment: (id) => apiDelete(`/departments/${id}`),
  
  // Reports
  generateCollegeReport: (params) => apiGet('/admin/reports/college', params),
  generateEligibilityReport: (data) => apiPost('/admin/eligibility', data),
  downloadCollegeReports: (params) => apiDownload('/reports/bulk/excel', params),
  
  // Role Management
  getRoleManagement: (params) => apiGet('/admin/roles', params),
  updateUserRole: (userId, data) => apiPut(`/admin/roles/${userId}`, data),
  
  // Audit Logs
  getSystemAuditLogs: (params) => apiGet('/admin/audit-logs', params),
}
