import { apiGet, apiPost, apiPut } from './axiosInstance'

const normalizeId = (value) =>
  value && typeof value === 'object' ? value._id || value.id || value.value || '' : value || ''

export const attendanceApi = {
  mark: (data) => apiPost('/attendance/mark', data),
  getClass: (params) => apiGet('/attendance/class', params),
  getStudent: (studentId, params) => apiGet(`/attendance/student/${normalizeId(studentId)}`, params),
  editOne: (id, data) => apiPut(`/attendance/${id}`, data),
  adminEdit: (id, data) => apiPut(`/attendance/admin/${id}`, data),
  getHistory: (id) => apiGet(`/attendance/${id}/history`),
  getDeptStats: (params) => apiGet('/attendance/department/stats', params),
  getSubjectReport: (subjectId, params) => apiGet(`/attendance/subject/${normalizeId(subjectId)}/report`, params),
  getLowAttendance: (params) => apiGet('/attendance/low-attendance', params),
}
