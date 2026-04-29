export { default as api } from './client'
export {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  apiDownload,
  extractApiErrorMessage,
} from './client'

// Role-specific APIs
export { authApi } from './authApi'
export { attendanceApi } from './attendanceApi'
export { adminApi } from './adminApi'
export { facultyApi } from './facultyApi'
export { classTeacherApi } from './classTeacherApi'
export { hodApi } from './hodApi'
export { qrApi } from './qrApi'
export { reportsApi } from './reportsApi'
