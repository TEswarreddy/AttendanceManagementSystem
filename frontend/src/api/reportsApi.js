import { apiGet, apiPost, apiDownload } from './axiosInstance'

export const reportsApi = {
  downloadStudentPDF: (studentId, params) => apiDownload(`/reports/student/${studentId}/pdf`, params),
  downloadStudentExcel: (studentId, params) =>
    apiDownload(`/reports/student/${studentId}/excel`, params),
  downloadClassPDF: (params) => apiDownload('/reports/class/pdf', params),
  downloadClassExcel: (params) => apiDownload('/reports/class/excel', params),
  downloadDeptPDF: (params) => apiDownload('/reports/department/pdf', params),
  downloadDeptExcel: (params) => apiDownload('/reports/department/excel', params),
  downloadBulkExcel: (params) => apiDownload('/reports/bulk/excel', params),
  triggerAlerts: (data) => apiPost('/reports/alerts/trigger', data),
  getDashboardStats: (params) => apiGet('/reports/dashboard/stats', params),
  getStudentAnalytics: (studentId) => apiGet(`/reports/analytics/${studentId}`),
}
