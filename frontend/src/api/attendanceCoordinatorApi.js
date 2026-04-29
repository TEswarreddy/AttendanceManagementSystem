import api, { apiGet, apiPost } from '@/api/client'

const qs = (params = {}) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  })
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export const attendanceCoordinatorApi = {
  getDashboard: (params = {}) => apiGet(`/attendance-coordinator/dashboard${qs(params)}`),
  getDepartmentClasses: (params = {}) => apiGet(`/attendance-coordinator/department-classes${qs(params)}`),
  getClassReports: (params = {}) => apiGet(`/attendance-coordinator/reports/class${qs(params)}`),
  getStudentReports: (params = {}) => apiGet(`/attendance-coordinator/reports/students${qs(params)}`),
  getSemesterReports: (params = {}) => apiGet(`/attendance-coordinator/reports/semester${qs(params)}`),
  getMonthlyReports: (params = {}) => apiGet(`/attendance-coordinator/reports/monthly${qs(params)}`),
  getBelow75: (params = {}) => apiGet(`/attendance-coordinator/students/below-threshold${qs(params)}`),
  getAbove75: (params = {}) => apiGet(`/attendance-coordinator/students/above-threshold${qs(params)}`),
  pushAlert: (payload) => apiPost('/attendance-coordinator/alerts', payload),
  downloadReports: (params = {}, format = 'excel') =>
    api.get(`/attendance-coordinator/reports/download${qs({ ...params, format })}`, {
      responseType: 'blob',
    }),
}

export default attendanceCoordinatorApi
