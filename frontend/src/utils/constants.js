export const APP_NAME = import.meta.env.VITE_APP_NAME
export const COLLEGE_NAME = import.meta.env.VITE_COLLEGE_NAME
export const THRESHOLD = Number(import.meta.env.VITE_ATTENDANCE_THRESHOLD) || 75

export const ROLES = {
  STUDENT: 'student',
  FACULTY: 'faculty',
  ATTENDANCE_COORDINATOR: 'attendance_coordinator',
  ADMIN: 'admin',
  HOD: 'hod'
}

export const ATTENDANCE_STATUS = {
  P: { label: 'Present', color: 'text-green-700', bg: 'bg-green-50', badge: 'bg-green-100 text-green-800' },
  A: { label: 'Absent', color: 'text-red-700', bg: 'bg-red-50', badge: 'bg-red-100 text-red-800' },
  L: { label: 'Late', color: 'text-amber-700', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-800' },
  ML: { label: 'Medical Leave', color: 'text-blue-700', bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-800' }
}

export const ATTENDANCE_COLOR = {
  safe: { text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-800' },
  warning: { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-800' },
  critical: { text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-800' }
}

export const SESSIONS = [
  { value: 'morning', label: 'Morning Session' },
  { value: 'afternoon', label: 'Afternoon Session' }
]

export const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8]
export const SECTIONS = ['A', 'B', 'C', 'D', 'E']

export const DATE_FORMAT = 'YYYY-MM-DD'
export const DISPLAY_DATE_FORMAT = 'DD MMM YYYY'

export const QUERY_KEYS = {
  STUDENT_ATTENDANCE: 'studentAttendance',
  CLASS_ATTENDANCE: 'classAttendance',
  DASHBOARD_STATS: 'dashboardStats',
  LOW_ATTENDANCE: 'lowAttendance',
  TIMETABLE: 'timetable',
  REPORTS: 'reports'
}
