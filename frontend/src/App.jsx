import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@/lib/dataClientHooks.jsx'
import { ReactQueryDevtools } from '@/lib/dataClientHooks.jsx'
import { Toaster } from 'react-hot-toast'
import AuthProvider, { useAuth } from '@/context/AuthContext'
import ProtectedRoute from '@/components/shared/ProtectedRoute'
import { FullPageSpinner } from '@/components/shared/Spinner'
import GlobalFooter from '@/components/shared/GlobalFooter'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const HomePage = lazy(() => import('@/pages/HomePage'))
const AboutPage = lazy(() => import('@/pages/AboutPage'))
const StudentDashboard = lazy(() => import('@/pages/student/StudentDashboard'))
const StudentTimetable = lazy(() => import('@/pages/student/StudentTimetable'))
const StudentNotifications = lazy(() => import('@/pages/student/StudentNotifications'))
const StudentLeaveRequests = lazy(() => import('@/pages/student/StudentLeaveRequests'))
const ChangePassword = lazy(() => import('@/pages/student/ChangePassword'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const FacultyDashboard = lazy(() => import('@/pages/FacultyDashboard'))
const FacultyMarkAttendance = lazy(() => import('@/pages/faculty/FacultyMarkAttendance'))
const EditAttendancePage = lazy(() => import('@/pages/faculty/EditApprovalRequest'))
const ClassTeacherDashboard = lazy(() => import('@/pages/classTeacher/ClassTeacherDashboard'))
const ClassTimetable = lazy(() => import('@/pages/classTeacher/ClassTimetable'))
const ManageStudents = lazy(() => import('@/pages/classTeacher/ManageStudents'))
const SendNotice = lazy(() => import('@/pages/classTeacher/SendNotice'))
const ClassTeacherReports = lazy(() => import('@/pages/classTeacher/ClassTeacherReports'))
const HODDashboard = lazy(() => import('@/pages/hod/HODDashboard'))
const TimetableBuilder = lazy(() => import('@/pages/hod/TimetableBuilder'))
const DeptReports = lazy(() => import('@/pages/hod/DeptReports'))
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'))
const AdminDepartments = lazy(() => import('@/pages/admin/AdminDepartments'))
const ManageHODs = lazy(() => import('@/pages/admin/ManageHODs'))
const CollegeReports = lazy(() => import('@/pages/admin/CollegeReports'))
const RoleManagement = lazy(() => import('@/pages/admin/RoleManagement'))
const QRAttendance = lazy(() => import('@/pages/QRAttendance'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'))
const AdminStudents = lazy(() => import('@/pages/admin/AdminStudents'))
const AdminFaculty = lazy(() => import('@/pages/admin/AdminFaculty'))
const HodFaculty = lazy(() => import('@/pages/hod/HodFaculty'))
const AdminSubjects = lazy(() => import('@/pages/admin/AdminSubjects'))
const AdminTimetable = lazy(() => import('@/pages/admin/AdminTimetable'))
const NotFound = lazy(() => import('@/pages/NotFound'))
const Unauthorized = lazy(() => import('@/pages/Unauthorized'))
const AttendanceCoordinatorDashboard = lazy(() => import('@/pages/attendanceCoordinator/AttendanceCoordinatorDashboardPage'))
const AttendanceCoordinatorLayout = lazy(() => import('@/pages/attendanceCoordinator/AttendanceCoordinatorLayout'))
const AttendanceCoordinatorDepartmentClasses = lazy(() => import('@/pages/attendanceCoordinator/AttendanceCoordinatorDepartmentClassesPage'))
const AttendanceCoordinatorReports = lazy(() => import('@/pages/attendanceCoordinator/AttendanceCoordinatorAttendanceReportsPage'))
const AttendanceCoordinatorDefaulters = lazy(() => import('@/pages/attendanceCoordinator/AttendanceCoordinatorStudentDefaultersPage'))
const AttendanceCoordinatorDownloads = lazy(() => import('@/pages/attendanceCoordinator/AttendanceCoordinatorDownloadReportsPage'))
const AttendanceCoordinatorSettings = lazy(() => import('@/pages/attendanceCoordinator/AttendanceCoordinatorSettingsPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

function RootRoleRedirect() {
  const { user } = useAuth()

  if (user?.role === 'student') {
    return <Navigate to="/student/dashboard" replace />
  }

  if (user?.role === 'faculty') {
    return <Navigate to="/faculty/dashboard" replace />
  }

  if (user?.role === 'class_teacher') {
    return <Navigate to="/class-teacher/dashboard" replace />
  }

  if (user?.role === 'hod') {
    return <Navigate to="/hod/dashboard" replace />
  }

  if (user?.role === 'time_table_coordinator') {
    return <Navigate to="/ttc/dashboard" replace />
  }

  if (user?.role === 'attendance_coordinator') {
    return <Navigate to="/attendance-coordinator/dashboard" replace />
  }

  return <Navigate to="/admin/dashboard" replace />
}

function AppRoutes() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<RootRoleRedirect />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['student', 'faculty', 'class_teacher', 'time_table_coordinator', 'attendance_coordinator', 'hod', 'admin', 'principal']} />}>
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['student']} />}>
          <Route path="/student/dashboard" element={<StudentDashboard />} />
          <Route path="/student/timetable" element={<StudentTimetable />} />
          <Route path="/student/notifications" element={<StudentNotifications />} />
          <Route path="/student/leaves" element={<StudentLeaveRequests />} />
          <Route path="/student/qr" element={<QRAttendance />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['faculty', 'class_teacher', 'time_table_coordinator', 'attendance_coordinator', 'hod']} />}>
          <Route path="/faculty/dashboard" element={<FacultyDashboard />} />
          <Route path="/faculty/mark" element={<FacultyMarkAttendance />} />
          <Route path="/faculty/edit-attendance" element={<EditAttendancePage />} />
          <Route path="/faculty/qr" element={<QRAttendance />} />
          <Route path="/faculty/reports" element={<ReportsPage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['class_teacher', 'hod', 'admin']} />}>
          <Route path="/class-teacher/dashboard" element={<ClassTeacherDashboard />} />
          <Route path="/class-teacher/timetable" element={<ClassTimetable />} />
          <Route path="/class-teacher/students" element={<ManageStudents />} />
          <Route path="/class-teacher/notices" element={<SendNotice />} />
          <Route path="/class-teacher/reports" element={<ClassTeacherReports />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['hod', 'admin']} />}>
          <Route path="/hod/dashboard" element={<HODDashboard />} />
          <Route path="/hod/reports" element={<DeptReports />} />
          <Route path="/hod/students" element={<AdminStudents />} />
          <Route path="/hod/faculty" element={<HodFaculty />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['time_table_coordinator', 'admin']} />}>
          <Route path="/ttc/dashboard" element={<FacultyDashboard />} />
          <Route path="/ttc/timetable" element={<TimetableBuilder />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['attendance_coordinator', 'admin']} />}>
          <Route element={<AttendanceCoordinatorLayout />}>
            <Route path="/attendance-coordinator/dashboard" element={<AttendanceCoordinatorDashboard />} />
            <Route path="/attendance-coordinator/classes" element={<AttendanceCoordinatorDepartmentClasses />} />
            <Route path="/attendance-coordinator/reports" element={<AttendanceCoordinatorReports />} />
            <Route path="/attendance-coordinator/defaulters" element={<AttendanceCoordinatorDefaulters />} />
            <Route path="/attendance-coordinator/downloads" element={<AttendanceCoordinatorDownloads />} />
            <Route path="/attendance-coordinator/settings" element={<AttendanceCoordinatorSettings />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['admin', 'principal']} />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/departments" element={<AdminDepartments />} />
          <Route path="/admin/students" element={<AdminStudents />} />
          <Route path="/admin/faculty" element={<AdminFaculty />} />
          <Route path="/admin/subjects" element={<AdminSubjects />} />
          <Route path="/admin/timetable" element={<AdminTimetable />} />
          <Route path="/admin/hods" element={<ManageHODs />} />
          <Route path="/admin/role-management" element={<RoleManagement />} />
          <Route path="/admin/reports" element={<CollegeReports />} />
          <Route path="/admin/reports-center" element={<ReportsPage />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen flex flex-col">
            <main className="flex-1">
              <AppRoutes />
            </main>
            <GlobalFooter />
          </div>
          <Toaster position="top-right" />
        </BrowserRouter>
      </AuthProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
