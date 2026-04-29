import { NavLink } from 'react-router-dom'
import {
  XMarkIcon,
  HomeIcon,
  ClipboardDocumentListIcon,
  QrCodeIcon,
  ChartBarIcon,
  UserGroupIcon,
  AcademicCapIcon,
  CalendarDaysIcon,
  BellAlertIcon,
  BookOpenIcon,
  PencilSquareIcon,
  KeyIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/context/AuthContext'

const ROLE_MENU = {
  student: [
    { label: 'Dashboard', to: '/student/dashboard', icon: HomeIcon },
    { label: 'My Attendance', to: '/student/dashboard', icon: ClipboardDocumentListIcon },
    { label: 'QR Attendance', to: '/student/qr', icon: QrCodeIcon },
    { label: 'Timetable', to: '/student/timetable', icon: CalendarDaysIcon },
    { label: 'Notifications', to: '/student/notifications', icon: BellAlertIcon },
    { label: 'Profile', to: '/profile', icon: UserCircleIcon },
    { label: 'Change Password', to: '/change-password', icon: KeyIcon },
  ],
  faculty: [
    { label: 'Dashboard', to: '/faculty/dashboard', icon: HomeIcon },
    { label: 'Mark Attendance', to: '/faculty/mark', icon: ClipboardDocumentListIcon },
    { label: 'Edit Attendance', to: '/faculty/edit-attendance', icon: PencilSquareIcon },
    { label: 'QR Attendance', to: '/faculty/qr', icon: QrCodeIcon },
    { label: 'Class Reports', to: '/faculty/reports', icon: ChartBarIcon },
    { label: 'Notifications', to: '/notifications', icon: BellAlertIcon },
    { label: 'Profile', to: '/profile', icon: UserCircleIcon },
    { label: 'Change Password', to: '/change-password', icon: KeyIcon },
  ],
  class_teacher: [
    { label: 'Dashboard', to: '/class-teacher/dashboard', icon: HomeIcon },
    { label: 'Class Timetable', to: '/class-teacher/timetable', icon: CalendarDaysIcon },
    { label: 'Faculty Dashboard', to: '/faculty/dashboard', icon: HomeIcon },
    { label: 'Mark Attendance', to: '/faculty/mark', icon: ClipboardDocumentListIcon },
    { label: 'Edit Attendance', to: '/faculty/edit-attendance', icon: PencilSquareIcon },
    { label: 'QR Attendance', to: '/faculty/qr', icon: QrCodeIcon },
    { label: 'Class Reports', to: '/faculty/reports', icon: ChartBarIcon },
    { label: 'Manage Students', to: '/class-teacher/students', icon: AcademicCapIcon },
    { label: 'Send Notice', to: '/class-teacher/notices', icon: BellAlertIcon },
    { label: 'Class Teacher Reports', to: '/class-teacher/reports', icon: ChartBarIcon },
    { label: 'Notifications', to: '/notifications', icon: BellAlertIcon },
    { label: 'Profile', to: '/profile', icon: UserCircleIcon },
    { label: 'Change Password', to: '/change-password', icon: KeyIcon },
  ],
  admin: [
    { label: 'Dashboard', to: '/admin/dashboard', icon: HomeIcon },
    { label: 'Departments', to: '/admin/departments', icon: AcademicCapIcon },
    { label: 'Manage HODs', to: '/admin/hods', icon: UserGroupIcon },
    { label: 'Role Management', to: '/admin/role-management', icon: PencilSquareIcon },
    { label: 'Students', to: '/admin/students', icon: AcademicCapIcon },
    { label: 'Faculty', to: '/admin/faculty', icon: UserGroupIcon },
    { label: 'Subjects', to: '/admin/subjects', icon: BookOpenIcon },
    { label: 'Timetable', to: '/admin/timetable', icon: CalendarDaysIcon },
    { label: 'College Reports', to: '/admin/reports', icon: ChartBarIcon },
    { label: 'Reports Center', to: '/admin/reports-center', icon: BellAlertIcon },
    { label: 'Notifications', to: '/notifications', icon: BellAlertIcon },
    { label: 'Profile', to: '/profile', icon: UserCircleIcon },
    { label: 'Change Password', to: '/change-password', icon: KeyIcon },
  ],
  hod: [
    { label: 'Dashboard', to: '/hod/dashboard', icon: HomeIcon },
    { label: 'Faculty Dashboard', to: '/faculty/dashboard', icon: HomeIcon },
    { label: 'Mark Attendance', to: '/faculty/mark', icon: ClipboardDocumentListIcon },
    { label: 'Edit Attendance', to: '/faculty/edit-attendance', icon: PencilSquareIcon },
    { label: 'QR Attendance', to: '/faculty/qr', icon: QrCodeIcon },
    { label: 'Class Reports', to: '/faculty/reports', icon: ChartBarIcon },
    { label: 'Dept Reports', to: '/hod/reports', icon: ChartBarIcon },
    { label: 'Notifications', to: '/notifications', icon: BellAlertIcon },
    { label: 'Faculty', to: '/hod/faculty', icon: UserGroupIcon },
    { label: 'Students', to: '/hod/students', icon: AcademicCapIcon },
    { label: 'Profile', to: '/profile', icon: UserCircleIcon },
    { label: 'Change Password', to: '/change-password', icon: KeyIcon },
  ],
  time_table_coordinator: [
    { label: 'Dashboard', to: '/ttc/dashboard', icon: HomeIcon },
    { label: 'Mark Attendance', to: '/faculty/mark', icon: ClipboardDocumentListIcon },
    { label: 'Edit Attendance', to: '/faculty/edit-attendance', icon: PencilSquareIcon },
    { label: 'QR Attendance', to: '/faculty/qr', icon: QrCodeIcon },
    { label: 'Class Reports', to: '/faculty/reports', icon: ChartBarIcon },
    { label: 'Timetable Builder', to: '/ttc/timetable', icon: CalendarDaysIcon },
    { label: 'Notifications', to: '/notifications', icon: BellAlertIcon },
    { label: 'Profile', to: '/profile', icon: UserCircleIcon },
    { label: 'Change Password', to: '/change-password', icon: KeyIcon },
  ],
  attendance_coordinator: [
    { label: 'Dashboard', to: '/attendance-coordinator/dashboard', icon: HomeIcon },
    { label: 'Department Classes', to: '/attendance-coordinator/classes', icon: AcademicCapIcon },
    { label: 'Attendance Reports', to: '/attendance-coordinator/reports', icon: ChartBarIcon },
    { label: 'Student Defaulters', to: '/attendance-coordinator/defaulters', icon: UserGroupIcon },
    { label: 'Download Reports', to: '/attendance-coordinator/downloads', icon: BellAlertIcon },
    { label: 'Settings', to: '/attendance-coordinator/settings', icon: PencilSquareIcon },
    { label: 'Mark Attendance', to: '/faculty/mark', icon: ClipboardDocumentListIcon },
    { label: 'Edit Attendance', to: '/faculty/edit-attendance', icon: PencilSquareIcon },
    { label: 'QR Attendance', to: '/faculty/qr', icon: QrCodeIcon },
    { label: 'Class Reports', to: '/faculty/reports', icon: ChartBarIcon },
    { label: 'Notifications', to: '/notifications', icon: BellAlertIcon },
    { label: 'Profile', to: '/profile', icon: UserCircleIcon },
    { label: 'Change Password', to: '/change-password', icon: KeyIcon },
  ],
}

export default function Sidebar({ isOpen, onClose }) {
  const { user } = useAuth()
  const role = user?.role === 'principal' ? 'admin' : user?.role || 'student'
  const menu = ROLE_MENU[role] || ROLE_MENU.student

  return (
    <>
      {isOpen ? (
        <button className="fixed inset-0 z-40 bg-slate-900/55 backdrop-blur-sm lg:hidden" onClick={onClose} aria-label="Close sidebar overlay" />
      ) : null}

      <aside
        className={`fixed left-0 top-[4.5rem] z-40 h-[calc(100vh-4.5rem)] w-72 border-r border-white/20 bg-gradient-to-b from-slate-900 via-slate-900 to-primary-950 text-slate-100 shadow-2xl shadow-primary-950/40 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'lg:translate-x-0 -translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 lg:hidden">
          <p className="text-sm font-semibold text-white">Navigation</p>
          <button className="rounded-lg p-2 hover:bg-white/10" onClick={onClose} aria-label="Close menu">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <nav className="custom-scroll space-y-1 overflow-y-auto px-3 py-3">
          {menu.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={`${item.to}-${item.label}`}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition duration-200 ${
                    isActive
                      ? 'bg-white/20 text-white shadow-md ring-1 ring-white/40'
                      : 'text-slate-200/90 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <Icon className="h-4.5 w-4.5 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
