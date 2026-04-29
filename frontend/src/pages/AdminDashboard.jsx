import { Fragment, useEffect, useMemo, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { useMutation, useQuery, useQueryClient } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import {
  ArrowDownTrayIcon,
  BellAlertIcon,
  PencilSquareIcon,
  PlusIcon,
  UserMinusIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import PageHeader from '@/components/shared/PageHeader'
import Spinner, { SkeletonCard, SkeletonTable } from '@/components/shared/Spinner'
import StatusBadge from '@/components/shared/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { adminApi } from '@/api/adminApi'
import { reportsApi } from '@/api/reportsApi'
import { attendanceApi } from '@/api/attendanceApi'
import {
  useDashboardStats,
  useDownloadBulkExcel,
  useDownloadDeptPDF,
  useDownloadStudentExcel,
  useDownloadStudentPDF,
  useTriggerAlerts,
} from '@/hooks/useReports'
import { useLowAttendance, useStudentAttendance } from '@/hooks/useAttendance'
import { THRESHOLD } from '@/utils/constants'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend)

const TABS = ['overview', 'students', 'faculty', 'reports']
const ROWS_PER_PAGE = 20

const getAcademicYear = () => {
  const now = new Date()
  const year = now.getFullYear()
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`
}

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeProfileId = (profileId) =>
  profileId && typeof profileId === 'object' ? profileId._id || profileId.id || '' : profileId || ''

const getDepartmentIdFromUser = (user) => {
  if (!user) return ''
  if (user.departmentId) return user.departmentId
  const profile = user.profileId
  if (profile && typeof profile === 'object') {
    if (typeof profile.departmentId === 'object') {
      return profile.departmentId?._id || profile.departmentId?.id || ''
    }
    return profile.departmentId || ''
  }
  return ''
}

const toArray = (value) => (Array.isArray(value) ? value : [])

const normalizeApiList = (response, candidateKeys = []) => {
  const payload = response?.data || response || {}
  for (const key of candidateKeys) {
    if (Array.isArray(payload?.[key])) return payload[key]
  }
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload)) return payload
  return []
}

const getStatusFromPercentage = (percentage) => {
  const normalized = toNumber(percentage)
  if (normalized < THRESHOLD) return 'critical'
  if (normalized < THRESHOLD + 10) return 'warning'
  return 'safe'
}

const sortRows = (rows, sort) => {
  const sorted = [...rows]
  sorted.sort((a, b) => {
    const left = a?.[sort.key]
    const right = b?.[sort.key]
    const leftNum = Number(left)
    const rightNum = Number(right)
    const bothNumbers = Number.isFinite(leftNum) && Number.isFinite(rightNum)

    if (bothNumbers) {
      return sort.direction === 'asc' ? leftNum - rightNum : rightNum - leftNum
    }

    const leftStr = String(left ?? '').toLowerCase()
    const rightStr = String(right ?? '').toLowerCase()
    if (leftStr < rightStr) return sort.direction === 'asc' ? -1 : 1
    if (leftStr > rightStr) return sort.direction === 'asc' ? 1 : -1
    return 0
  })
  return sorted
}

const toggleSort = (current, key) => {
  if (current.key === key) {
    return {
      key,
      direction: current.direction === 'asc' ? 'desc' : 'asc',
    }
  }
  return { key, direction: 'asc' }
}

const normalizeStudent = (item) => {
  const departmentName =
    item.departmentId?.name || item.department?.name || item.departmentName || item.departmentCode || '-'
  const overall = toNumber(item.overallPercentage ?? item.percentage ?? item.attendancePercentage)
  return {
    _id: item._id || item.id,
    rollNumber: item.rollNumber || '-',
    name: item.name || '-',
    email: item.email || '',
    phone: item.phone || '',
    departmentId: item.departmentId?._id || item.departmentId || item.department || '',
    departmentName,
    semester: item.semester || '-',
    section: item.section || '-',
    batch: item.batch || '',
    overallPercentage: overall,
    status: getStatusFromPercentage(overall),
    isActive: item.isActive !== false,
  }
}

const normalizeFaculty = (item) => {
  const subjects = toArray(item.subjects || item.subjectList || item.assignedSubjects)
  return {
    _id: item._id || item.id,
    name: item.name || '-',
    email: item.email || '-',
    phone: item.phone || '-',
    departmentId: item.departmentId?._id || item.departmentId || '',
    departmentName: item.departmentId?.name || item.departmentName || '-',
    subjects,
    isActive: item.isActive !== false,
  }
}

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const StudentSummary = ({ studentId }) => {
  const attendanceQuery = useStudentAttendance(studentId)

  const rows = useMemo(() => {
    const list = attendanceQuery.data?.summary || attendanceQuery.data?.subjects || []
    return toArray(list).map((row) => {
      const percentage = toNumber(row.percentage ?? row.attendancePercentage)
      return {
        subject: row.subjectName || row.subject || '-',
        code: row.subjectCode || row.code || '-',
        total: toNumber(row.total),
        present: toNumber(row.present),
        absent: toNumber(row.absent),
        late: toNumber(row.late),
        percentage,
        status: row.status || getStatusFromPercentage(percentage),
      }
    })
  }, [attendanceQuery.data])

  const overall = toNumber(attendanceQuery.data?.overallPercentage ?? attendanceQuery.data?.overallAttendance)

  if (attendanceQuery.isLoading) {
    return <SkeletonTable rows={5} />
  }

  if (attendanceQuery.isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        Unable to load student attendance summary.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">Overall Attendance:</span>
        <span className="text-lg font-semibold text-slate-900">{overall.toFixed(1)}%</span>
        <StatusBadge status={getStatusFromPercentage(overall)} />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Present</th>
              <th className="px-3 py-2">Absent</th>
              <th className="px-3 py-2">Late</th>
              <th className="px-3 py-2">%</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.code}-${index}`} className="border-b border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900">{row.subject}</td>
                <td className="px-3 py-2 text-slate-600">{row.code}</td>
                <td className="px-3 py-2 text-slate-700">{row.total}</td>
                <td className="px-3 py-2 text-slate-700">{row.present}</td>
                <td className="px-3 py-2 text-slate-700">{row.absent}</td>
                <td className="px-3 py-2 text-slate-700">{row.late}</td>
                <td className="px-3 py-2 font-semibold text-slate-900">{row.percentage.toFixed(1)}%</td>
                <td className="px-3 py-2">
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function AdminDashboard({ initialTab = 'overview' }) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const departmentId = getDepartmentIdFromUser(user)
  const academicYear = useMemo(() => getAcademicYear(), [])

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(TABS.includes(initialTab) ? initialTab : 'overview')

  const [alertChannels, setAlertChannels] = useState({ email: true, sms: true })
  const [alertThreshold, setAlertThreshold] = useState(THRESHOLD)

  const [studentFilters, setStudentFilters] = useState({
    department: '',
    semester: '',
    section: '',
    search: '',
  })
  const [studentSort, setStudentSort] = useState({ key: 'rollNumber', direction: 'asc' })
  const [studentPage, setStudentPage] = useState(1)
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentFormOpen, setStudentFormOpen] = useState(false)
  const [studentFormMode, setStudentFormMode] = useState('create')
  const [newCredentials, setNewCredentials] = useState(null)
  const [studentForm, setStudentForm] = useState({
    name: '',
    email: '',
    rollNumber: '',
    phone: '',
    departmentId: departmentId || '',
    semester: '',
    section: '',
    batch: '',
  })

  const [facultySearch, setFacultySearch] = useState('')
  const [facultyForm, setFacultyForm] = useState({
    name: '',
    email: '',
    departmentId: departmentId || '',
    phone: '',
    specialization: '',
    designation: 'Assistant Professor',
  })
  const [facultySort, setFacultySort] = useState({ key: 'name', direction: 'asc' })
  const [facultyPage, setFacultyPage] = useState(1)
  const [assignModal, setAssignModal] = useState({ open: false, faculty: null })
  const [assignForm, setAssignForm] = useState({
    facultyId: '',
    subjectId: '',
    semester: '',
    section: '',
    academicYear,
  })

  const [reportsFilters, setReportsFilters] = useState({
    departmentId: departmentId || '',
    semester: '',
    academicYear,
    threshold: THRESHOLD,
  })
  const [selectedLowAttendance, setSelectedLowAttendance] = useState([])

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((current) => !current)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  useEffect(() => {
    if (!departmentId) return
    setReportsFilters((current) => ({
      ...current,
      departmentId: current.departmentId || departmentId,
    }))
    setStudentForm((current) => ({
      ...current,
      departmentId: current.departmentId || departmentId,
    }))
    setFacultyForm((current) => ({
      ...current,
      departmentId: current.departmentId || departmentId,
    }))
  }, [departmentId])

  const dashboardQuery = useDashboardStats({ departmentId, academicYear })

  const departmentStatsQuery = useQuery({
    queryKey: ['adminDeptAttendanceStats', departmentId],
    queryFn: () => attendanceApi.getDeptStats({ departmentId }),
    enabled: !!departmentId,
    retry: 0,
    staleTime: 2 * 60 * 1000,
    select: (response) => response?.data || response || {},
  })

  const studentsQuery = useQuery({
    queryKey: ['adminDashboardStudents', departmentId],
    queryFn: () => adminApi.getStudents({ departmentId, academicYear }),
    retry: 0,
    staleTime: 5 * 60 * 1000,
    select: (response) => normalizeApiList(response, ['students']),
  })

  const facultyQuery = useQuery({
    queryKey: ['adminDashboardFaculty', departmentId],
    queryFn: () => adminApi.getFaculty({ departmentId }),
    retry: 0,
    staleTime: 5 * 60 * 1000,
    select: (response) => normalizeApiList(response, ['faculty', 'teachers']),
  })

  const subjectsQuery = useQuery({
    queryKey: ['adminDashboardSubjects', departmentId],
    queryFn: () => adminApi.getSubjects({ departmentId }),
    retry: 0,
    staleTime: 5 * 60 * 1000,
    select: (response) => normalizeApiList(response, ['subjects']),
  })

  const departmentsQuery = useQuery({
    queryKey: ['adminDashboardDepartments'],
    queryFn: () => adminApi.getDepartments(),
    retry: 0,
    staleTime: 10 * 60 * 1000,
    select: (response) => normalizeApiList(response, ['departments']),
  })

  const lowAttendanceQuery = useLowAttendance({
    threshold: reportsFilters.threshold,
    departmentId: reportsFilters.departmentId || departmentId,
  })

  const triggerAlertsMutation = useTriggerAlerts()
  const downloadDeptPdf = useDownloadDeptPDF()
  const downloadBulkExcel = useDownloadBulkExcel()
  const downloadStudentPdf = useDownloadStudentPDF()
  const downloadStudentExcel = useDownloadStudentExcel()

  const downloadDeptExcel = useMutation({
    mutationFn: ({ params }) => reportsApi.downloadDeptExcel(params),
    onSuccess: (blob) => {
      downloadBlob(blob, `department-attendance-${reportsFilters.academicYear}.xlsx`)
      toast.success('Department Excel downloaded')
    },
    onError: (error) => toast.error(error.message || 'Failed to download department excel'),
  })

  const createOrUpdateStudent = useMutation({
    mutationFn: (payload) => {
      if (studentFormMode === 'edit' && payload._id) {
        return adminApi.updateStudent(payload._id, payload)
      }
      return adminApi.createStudent(payload)
    },
    onSuccess: (response) => {
      const payload = response?.data || response || {}
      const tempPassword = payload?.temporaryPassword || payload?.password || payload?.defaultPassword || null

      if (tempPassword) {
        setNewCredentials({
          email: payload?.email || studentForm.email,
          password: tempPassword,
        })
      }

      queryClient.invalidateQueries({ queryKey: ['adminDashboardStudents'] })
      toast.success(studentFormMode === 'edit' ? 'Student updated' : 'Student created')
      if (studentFormMode !== 'edit') {
        setStudentForm({
          name: '',
          email: '',
          rollNumber: '',
          phone: '',
          departmentId: departmentId || '',
          semester: '',
          section: '',
          batch: '',
        })
      }
    },
    onError: (error) => toast.error(error.message || 'Failed to save student'),
  })

  const deactivateStudentMutation = useMutation({
    mutationFn: (id) => adminApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminDashboardStudents'] })
      toast.success('Student deactivated')
    },
    onError: (error) => toast.error(error.message || 'Failed to deactivate student'),
  })

  const assignSubjectMutation = useMutation({
    mutationFn: (payload) => adminApi.assignFaculty(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminDashboardFaculty'] })
      setAssignModal({ open: false, faculty: null })
      setAssignForm({
        facultyId: '',
        subjectId: '',
        semester: '',
        section: '',
        academicYear,
      })
      toast.success('Subject assigned to faculty')
    },
    onError: (error) => toast.error(error.message || 'Failed to assign subject'),
  })

  const createFacultyMutation = useMutation({
    mutationFn: (payload) => adminApi.createFacultyWithAccount(payload),
    onSuccess: (response) => {
      const payload = response?.data || response || {}
      const credentials = payload?.credentials || {}

      queryClient.invalidateQueries({ queryKey: ['adminDashboardFaculty'] })
      toast.success('Faculty account created')

      setFacultyForm({
        name: '',
        email: '',
        departmentId: departmentId || reportsFilters.departmentId || '',
        phone: '',
        specialization: '',
        designation: 'Assistant Professor',
      })

      if (credentials.email && credentials.temporaryPassword) {
        window.alert(`Faculty login created.\nEmail: ${credentials.email}\nTemporary Password: ${credentials.temporaryPassword}`)
      }
    },
    onError: (error) => toast.error(error.message || 'Failed to create faculty account'),
  })

  const students = useMemo(() => toArray(studentsQuery.data).map(normalizeStudent), [studentsQuery.data])
  const faculty = useMemo(() => toArray(facultyQuery.data).map(normalizeFaculty), [facultyQuery.data])
  const subjects = useMemo(() => {
    return toArray(subjectsQuery.data).map((subject) => ({
      _id: subject._id || subject.id,
      name: subject.name || subject.subjectName || '-',
      code: subject.code || subject.subjectCode || '-',
      semester: subject.semester || '',
      section: subject.section || '',
      average: toNumber(subject.averageAttendance ?? subject.attendancePercentage),
    }))
  }, [subjectsQuery.data])

  const lowAttendanceRows = useMemo(() => {
    const payload = lowAttendanceQuery.data || {}
    const rows = payload?.items || payload?.students || payload?.data || []
    return toArray(rows).map((row, index) => {
      const percentage = toNumber(row.percentage ?? row.attendancePercentage)
      return {
        key: `${row.studentId || row._id || index}-${row.subjectId || row.subjectCode || index}`,
        studentId: row.studentId || row._id,
        studentName: row.studentName || row.name || '-',
        rollNumber: row.rollNumber || '-',
        semester: row.semester || '-',
        section: row.section || '-',
        subjectName: row.subjectName || row.subject || '-',
        subjectCode: row.subjectCode || row.code || '-',
        percentage,
        status: getStatusFromPercentage(percentage),
      }
    })
  }, [lowAttendanceQuery.data])

  const dashboardData = dashboardQuery.data || {}
  const departmentStats = departmentStatsQuery.data || {}
  const trendRows = useMemo(() => {
    const list =
      dashboardData?.trend ||
      dashboardData?.last30Days ||
      departmentStats?.last7DaysTrend ||
      []

    return toArray(list).map((row) => ({
      date: row.date || row.label || '-',
      presentRate: toNumber(row.presentRate ?? row.percentage ?? row.attendanceRate),
      totalStudents: toNumber(row.totalStudents ?? row.total ?? students.length),
    }))
  }, [dashboardData, departmentStats, students.length])

  const subjectComparisonRows = useMemo(() => {
    const fromDashboard = toArray(dashboardData?.subjectComparison || dashboardData?.subjects)
    const fromDepartmentStats = toArray(departmentStats?.subjectStats)
    const source = fromDashboard.length ? fromDashboard : fromDepartmentStats

    return source
      .map((row) => {
        const percentage = toNumber(row.percentage ?? row.avgAttendance ?? row.attendance)
        return {
          subjectName: row.subjectName || row.name || row.subjectCode || 'Subject',
          percentage,
          status: getStatusFromPercentage(percentage),
        }
      })
      .sort((a, b) => a.percentage - b.percentage)
  }, [dashboardData, departmentStats])

  const metrics = useMemo(() => {
    const uniqueRiskStudents = new Set(lowAttendanceRows.map((row) => row.studentId).filter(Boolean))
    return {
      totalStudents: toNumber(dashboardData?.totalStudents, students.length),
      totalFaculty: toNumber(dashboardData?.totalFaculty, faculty.length),
      totalSubjects: toNumber(dashboardData?.totalSubjects, subjects.length),
      studentsAtRisk: toNumber(dashboardData?.studentsAtRisk, uniqueRiskStudents.size),
      alertsSentToday: toNumber(dashboardData?.alertsSentToday),
      overallDeptPercentage: toNumber(
        dashboardData?.overallDepartmentPercentage ?? dashboardData?.overallAttendance,
        toNumber(departmentStats?.overall?.percentage)
      ),
    }
  }, [dashboardData, departmentStats, faculty.length, lowAttendanceRows, students.length, subjects.length])

  const filteredStudents = useMemo(() => {
    const search = studentFilters.search.trim().toLowerCase()
    return students.filter((row) => {
      const matchesDept = !studentFilters.department || String(row.departmentId) === String(studentFilters.department)
      const matchesSem = !studentFilters.semester || String(row.semester) === String(studentFilters.semester)
      const matchesSec = !studentFilters.section || String(row.section).toUpperCase() === String(studentFilters.section).toUpperCase()
      const matchesSearch =
        !search ||
        row.name.toLowerCase().includes(search) ||
        row.rollNumber.toLowerCase().includes(search)
      return matchesDept && matchesSem && matchesSec && matchesSearch
    })
  }, [studentFilters, students])

  const sortedStudents = useMemo(
    () => sortRows(filteredStudents, studentSort),
    [filteredStudents, studentSort]
  )

  const studentPageCount = Math.max(1, Math.ceil(sortedStudents.length / ROWS_PER_PAGE))
  const paginatedStudents = useMemo(() => {
    const start = (studentPage - 1) * ROWS_PER_PAGE
    return sortedStudents.slice(start, start + ROWS_PER_PAGE)
  }, [sortedStudents, studentPage])

  useEffect(() => {
    if (studentPage > studentPageCount) setStudentPage(studentPageCount)
  }, [studentPage, studentPageCount])

  const filteredFaculty = useMemo(() => {
    const search = facultySearch.trim().toLowerCase()
    return faculty.filter((row) => {
      if (!search) return true
      return row.name.toLowerCase().includes(search) || row.email.toLowerCase().includes(search)
    })
  }, [faculty, facultySearch])

  const sortedFaculty = useMemo(() => sortRows(filteredFaculty, facultySort), [filteredFaculty, facultySort])
  const facultyPageCount = Math.max(1, Math.ceil(sortedFaculty.length / ROWS_PER_PAGE))
  const paginatedFaculty = useMemo(() => {
    const start = (facultyPage - 1) * ROWS_PER_PAGE
    return sortedFaculty.slice(start, start + ROWS_PER_PAGE)
  }, [sortedFaculty, facultyPage])

  useEffect(() => {
    if (facultyPage > facultyPageCount) setFacultyPage(facultyPageCount)
  }, [facultyPage, facultyPageCount])

  const trendChartData = useMemo(
    () => ({
      labels: trendRows.map((row) => row.date),
      datasets: [
        {
          label: 'Present Rate %',
          data: trendRows.map((row) => row.presentRate),
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15, 118, 110, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: `${THRESHOLD}% Threshold`,
          data: trendRows.map(() => THRESHOLD),
          borderColor: '#b91c1c',
          borderDash: [8, 5],
          pointRadius: 0,
          fill: false,
        },
      ],
    }),
    [trendRows]
  )

  const trendChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { min: 0, max: 100 },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => {
              const row = trendRows[context.dataIndex]
              if (context.datasetIndex !== 0) return `${context.dataset.label}: ${context.parsed.y}%`
              return `${row?.presentRate?.toFixed?.(1) || context.parsed.y}% • total ${row?.totalStudents || 0} students`
            },
          },
        },
      },
    }),
    [trendRows]
  )

  const comparisonChartData = useMemo(
    () => ({
      labels: subjectComparisonRows.map((row) => row.subjectName),
      datasets: [
        {
          label: 'Avg Attendance %',
          data: subjectComparisonRows.map((row) => row.percentage),
          backgroundColor: subjectComparisonRows.map((row) => {
            if (row.status === 'critical') return '#ef4444'
            if (row.status === 'warning') return '#f59e0b'
            return '#22c55e'
          }),
          borderRadius: 6,
        },
      ],
    }),
    [subjectComparisonRows]
  )

  const comparisonChartOptions = useMemo(
    () => ({
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { min: 0, max: 100 },
      },
      plugins: {
        legend: { display: false },
      },
    }),
    []
  )

  const isPrimaryLoading =
    dashboardQuery.isLoading ||
    studentsQuery.isLoading ||
    facultyQuery.isLoading ||
    subjectsQuery.isLoading

  const handleTriggerAlerts = () => {
    triggerAlertsMutation.mutate(
      {
        threshold: alertThreshold,
        channels: {
          email: alertChannels.email,
          sms: alertChannels.sms,
        },
        departmentId: departmentId || reportsFilters.departmentId,
      },
      {
        onSuccess: (response) => {
          const payload = response?.data || response || {}
          const sentCount = toNumber(payload.lowAttendanceCount ?? payload.totalAlertsSent)
          toast.success(`Alerts sent to ${sentCount} students`)
        },
      }
    )
  }

  const openCreateStudent = () => {
    setStudentFormMode('create')
    setNewCredentials(null)
    setStudentForm({
      name: '',
      email: '',
      rollNumber: '',
      phone: '',
      departmentId: departmentId || reportsFilters.departmentId || '',
      semester: '',
      section: '',
      batch: '',
    })
    setStudentFormOpen(true)
  }

  const openEditStudent = (student) => {
    setStudentFormMode('edit')
    setNewCredentials(null)
    setStudentForm({
      _id: student._id,
      name: student.name || '',
      email: student.email || '',
      rollNumber: student.rollNumber || '',
      phone: student.phone || '',
      departmentId: student.departmentId || '',
      semester: student.semester || '',
      section: student.section || '',
      batch: student.batch || '',
    })
    setStudentFormOpen(true)
  }

  const submitStudentForm = (event) => {
    event.preventDefault()
    createOrUpdateStudent.mutate({ ...studentForm })
  }

  const openAssignModal = (row) => {
    setAssignModal({ open: true, faculty: row })
    setAssignForm((current) => ({
      ...current,
      facultyId: row._id,
    }))
  }

  const submitAssignForm = (event) => {
    event.preventDefault()
    assignSubjectMutation.mutate({ ...assignForm })
  }

  const submitFacultyForm = (event) => {
    event.preventDefault()

    const payload = {
      name: facultyForm.name.trim(),
      email: facultyForm.email.trim().toLowerCase(),
      departmentId: facultyForm.departmentId,
      phone: facultyForm.phone.trim(),
      specialization: facultyForm.specialization.trim(),
      designation: facultyForm.designation,
    }

    if (!payload.name || !payload.email || !payload.departmentId) {
      toast.error('Name, email and department are required')
      return
    }

    createFacultyMutation.mutate(payload)
  }

  const toggleLowAttendanceRow = (key) => {
    setSelectedLowAttendance((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    )
  }

  const selectedLowRows = lowAttendanceRows.filter((row) => selectedLowAttendance.includes(row.key))

  const handleExportSelected = () => {
    const selectedStudentIds = [...new Set(selectedLowRows.map((row) => row.studentId).filter(Boolean))]
    if (!selectedStudentIds.length) {
      toast.error('Select at least one student')
      return
    }

    downloadBulkExcel.mutate({
      params: {
        departmentId: reportsFilters.departmentId || departmentId,
        semester: reportsFilters.semester || undefined,
        academicYear: reportsFilters.academicYear,
        threshold: reportsFilters.threshold,
        studentIds: selectedStudentIds,
      },
      filename: 'low-attendance-selected.xlsx',
    })
  }

  const handleAlertSelected = () => {
    const selectedStudentIds = [...new Set(selectedLowRows.map((row) => row.studentId).filter(Boolean))]
    if (!selectedStudentIds.length) {
      toast.error('Select at least one student')
      return
    }

    triggerAlertsMutation.mutate(
      {
        threshold: reportsFilters.threshold,
        departmentId: reportsFilters.departmentId || departmentId,
        studentIds: selectedStudentIds,
        channels: alertChannels,
      },
      {
        onSuccess: () => toast.success(`Alert request sent for ${selectedStudentIds.length} students`),
      }
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <PageHeader
            title="Admin Dashboard"
            subtitle="Department operations, risk tracking, and reports in one workspace."
          />

          <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize transition ${
                  activeTab === tab
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <section className="space-y-6">
              {isPrimaryLoading ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <SkeletonCard key={index} height="7rem" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs text-slate-500">Total Students</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{metrics.totalStudents}</p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs text-slate-500">Total Faculty</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{metrics.totalFaculty}</p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs text-slate-500">Total Subjects</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{metrics.totalSubjects}</p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs text-slate-500">Students at Risk</p>
                    <p className="mt-2 text-2xl font-bold text-red-700">{metrics.studentsAtRisk}</p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs text-slate-500">Alerts Sent Today</p>
                    <p className="mt-2 text-2xl font-bold text-amber-700">{metrics.alertsSentToday}</p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs text-slate-500">Overall Dept %</p>
                    <p className="mt-2 text-2xl font-bold text-emerald-700">{metrics.overallDeptPercentage.toFixed(1)}%</p>
                  </article>
                </div>
              )}

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
                  <h2 className="text-lg font-semibold text-slate-900">Attendance Trend (Last 30 Days)</h2>
                  <p className="text-sm text-slate-500">Daily present rate with threshold reference.</p>
                  <div className="mt-4 h-[320px]">
                    {dashboardQuery.isLoading ? <SkeletonCard height="100%" /> : <Line data={trendChartData} options={trendChartOptions} />}
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900">Send Alerts</h2>
                  <p className="text-sm text-slate-500">Trigger low-attendance notifications.</p>

                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={alertChannels.email}
                          onChange={(event) =>
                            setAlertChannels((current) => ({ ...current, email: event.target.checked }))
                          }
                        />
                        Email
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={alertChannels.sms}
                          onChange={(event) =>
                            setAlertChannels((current) => ({ ...current, sms: event.target.checked }))
                          }
                        />
                        SMS
                      </label>
                    </div>

                    <label className="block text-sm text-slate-700">
                      Threshold
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={alertThreshold}
                        onChange={(event) => setAlertThreshold(toNumber(event.target.value, THRESHOLD))}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleTriggerAlerts}
                      disabled={triggerAlertsMutation.isPending}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {triggerAlertsMutation.isPending ? <Spinner size="sm" className="border-white border-t-white" /> : <BellAlertIcon className="h-4 w-4" />}
                      Trigger Low Attendance Alerts
                    </button>
                  </div>
                </article>
              </div>

              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Subject Comparison</h2>
                <p className="text-sm text-slate-500">Worst-performing subjects at the top, color-coded by risk level.</p>
                <div className="mt-4 h-[360px]">
                  {departmentStatsQuery.isLoading ? (
                    <SkeletonCard height="100%" />
                  ) : (
                    <Bar data={comparisonChartData} options={comparisonChartOptions} />
                  )}
                </div>
              </article>
            </section>
          )}

          {activeTab === 'students' && (
            <section className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <select
                    value={studentFilters.department}
                    onChange={(event) => setStudentFilters((current) => ({ ...current, department: event.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">All Departments</option>
                    {toArray(departmentsQuery.data).map((dept) => (
                      <option key={dept._id || dept.id} value={dept._id || dept.id}>
                        {dept.name || dept.code}
                      </option>
                    ))}
                  </select>

                  <input
                    value={studentFilters.semester}
                    onChange={(event) => setStudentFilters((current) => ({ ...current, semester: event.target.value }))}
                    placeholder="Semester"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />

                  <input
                    value={studentFilters.section}
                    onChange={(event) => setStudentFilters((current) => ({ ...current, section: event.target.value }))}
                    placeholder="Section"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />

                  <input
                    value={studentFilters.search}
                    onChange={(event) => setStudentFilters((current) => ({ ...current, search: event.target.value }))}
                    placeholder="Search by name / roll"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={openCreateStudent}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
                  >
                    <UserPlusIcon className="h-4 w-4" />
                    Add Student
                  </button>
                </div>
              </div>

              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                {studentsQuery.isLoading ? (
                  <SkeletonTable rows={8} />
                ) : studentsQuery.isError ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Student API is unavailable in current backend wiring. Table is ready and will auto-populate once endpoints are mounted.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                            {[
                              ['rollNumber', 'Roll No'],
                              ['name', 'Name'],
                              ['departmentName', 'Dept'],
                              ['semester', 'Sem'],
                              ['section', 'Section'],
                              ['overallPercentage', 'Overall %'],
                              ['status', 'Status'],
                            ].map(([key, label]) => (
                              <th key={key} className="px-3 py-2">
                                <button
                                  type="button"
                                  className="font-semibold"
                                  onClick={() => setStudentSort((current) => toggleSort(current, key))}
                                >
                                  {label}
                                </button>
                              </th>
                            ))}
                            <th className="px-3 py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedStudents.map((row) => (
                            <tr key={row._id} className="border-b border-slate-100">
                              <td className="px-3 py-2 font-medium text-slate-900">{row.rollNumber}</td>
                              <td className="px-3 py-2 text-slate-700">{row.name}</td>
                              <td className="px-3 py-2 text-slate-700">{row.departmentName}</td>
                              <td className="px-3 py-2 text-slate-700">{row.semester}</td>
                              <td className="px-3 py-2 text-slate-700">{row.section}</td>
                              <td className="px-3 py-2 font-semibold text-slate-900">{row.overallPercentage.toFixed(1)}%</td>
                              <td className="px-3 py-2">
                                <StatusBadge status={row.status} />
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedStudent(row)}
                                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                  >
                                    View
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEditStudent(row)}
                                    className="inline-flex items-center gap-1 rounded-md border border-blue-300 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                                  >
                                    <PencilSquareIcon className="h-3.5 w-3.5" />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deactivateStudentMutation.mutate(row._id)}
                                    disabled={deactivateStudentMutation.isPending || !row.isActive}
                                    className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                                  >
                                    <UserMinusIcon className="h-3.5 w-3.5" />
                                    Deactivate
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                      <p>
                        Page {studentPage} of {studentPageCount}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setStudentPage((current) => Math.max(1, current - 1))}
                          disabled={studentPage === 1}
                          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          onClick={() => setStudentPage((current) => Math.min(studentPageCount, current + 1))}
                          disabled={studentPage >= studentPageCount}
                          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </article>
            </section>
          )}

          {activeTab === 'faculty' && (
            <section className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Create Faculty Account</p>
                <p className="mt-1 text-xs text-slate-600">
                  Create a faculty profile and login credentials from the admin faculty screen.
                </p>

                <form className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4" onSubmit={submitFacultyForm}>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={facultyForm.name}
                    onChange={(event) => setFacultyForm((current) => ({ ...current, name: event.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={facultyForm.email}
                    onChange={(event) => setFacultyForm((current) => ({ ...current, email: event.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <select
                    value={facultyForm.departmentId}
                    onChange={(event) => setFacultyForm((current) => ({ ...current, departmentId: event.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select department</option>
                    {toArray(departmentsQuery.data).map((dept) => (
                      <option key={dept._id || dept.id} value={dept._id || dept.id}>
                        {dept.code || dept.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Phone (optional)"
                    value={facultyForm.phone}
                    onChange={(event) => setFacultyForm((current) => ({ ...current, phone: event.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Specialization (optional)"
                    value={facultyForm.specialization}
                    onChange={(event) =>
                      setFacultyForm((current) => ({ ...current, specialization: event.target.value }))
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <select
                    value={facultyForm.designation}
                    onChange={(event) => setFacultyForm((current) => ({ ...current, designation: event.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="Assistant Professor">Assistant Professor</option>
                    <option value="Associate Professor">Associate Professor</option>
                    <option value="Professor">Professor</option>
                  </select>
                  <button
                    type="submit"
                    disabled={createFacultyMutation.isPending}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                  >
                    {createFacultyMutation.isPending ? 'Creating Faculty...' : 'Create Faculty'}
                  </button>
                </form>

                <div className="mt-3">
                  <input
                    value={facultySearch}
                    onChange={(event) => setFacultySearch(event.target.value)}
                    placeholder="Search by faculty name / email"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                {facultyQuery.isLoading ? (
                  <SkeletonTable rows={8} />
                ) : facultyQuery.isError ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Faculty API is unavailable in current backend wiring. Table is ready and will auto-populate once endpoints are mounted.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                            {[
                              ['name', 'Name'],
                              ['email', 'Email'],
                              ['departmentName', 'Department'],
                            ].map(([key, label]) => (
                              <th key={key} className="px-3 py-2">
                                <button
                                  type="button"
                                  className="font-semibold"
                                  onClick={() => setFacultySort((current) => toggleSort(current, key))}
                                >
                                  {label}
                                </button>
                              </th>
                            ))}
                            <th className="px-3 py-2">Current Subjects</th>
                            <th className="px-3 py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedFaculty.map((row) => (
                            <tr key={row._id} className="border-b border-slate-100">
                              <td className="px-3 py-2 font-medium text-slate-900">{row.name}</td>
                              <td className="px-3 py-2 text-slate-700">{row.email}</td>
                              <td className="px-3 py-2 text-slate-700">{row.departmentName}</td>
                              <td className="px-3 py-2 text-slate-700">
                                {row.subjects.length
                                  ? row.subjects
                                      .slice(0, 3)
                                      .map((subject) => subject.subjectCode || subject.code || subject.name)
                                      .join(', ')
                                  : 'No assignments'}
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => openAssignModal(row)}
                                  className="inline-flex items-center gap-1 rounded-md border border-primary-300 px-2 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-50"
                                >
                                  <PlusIcon className="h-3.5 w-3.5" />
                                  Assign Subject
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                      <p>
                        Page {facultyPage} of {facultyPageCount}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setFacultyPage((current) => Math.max(1, current - 1))}
                          disabled={facultyPage === 1}
                          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          onClick={() => setFacultyPage((current) => Math.min(facultyPageCount, current + 1))}
                          disabled={facultyPage >= facultyPageCount}
                          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </article>
            </section>
          )}

          {activeTab === 'reports' && (
            <section className="space-y-6">
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <select
                    value={reportsFilters.departmentId}
                    onChange={(event) =>
                      setReportsFilters((current) => ({ ...current, departmentId: event.target.value }))
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Department</option>
                    {toArray(departmentsQuery.data).map((dept) => (
                      <option key={dept._id || dept.id} value={dept._id || dept.id}>
                        {dept.name || dept.code}
                      </option>
                    ))}
                  </select>
                  <input
                    value={reportsFilters.semester}
                    onChange={(event) => setReportsFilters((current) => ({ ...current, semester: event.target.value }))}
                    placeholder="Semester"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    value={reportsFilters.academicYear}
                    onChange={(event) =>
                      setReportsFilters((current) => ({ ...current, academicYear: event.target.value }))
                    }
                    placeholder="Academic Year"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    value={reportsFilters.threshold}
                    onChange={(event) =>
                      setReportsFilters((current) => ({ ...current, threshold: toNumber(event.target.value, THRESHOLD) }))
                    }
                    placeholder="Threshold"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <button
                    type="button"
                    disabled={downloadDeptPdf.isPending}
                    onClick={() =>
                      downloadDeptPdf.mutate({
                        params: {
                          departmentId: reportsFilters.departmentId || departmentId,
                          semester: reportsFilters.semester || undefined,
                          academicYear: reportsFilters.academicYear,
                          threshold: reportsFilters.threshold,
                        },
                        filename: 'department-attendance.pdf',
                      })
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                  >
                    {downloadDeptPdf.isPending ? <Spinner size="sm" className="border-white border-t-white" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
                    Dept PDF
                  </button>

                  <button
                    type="button"
                    disabled={downloadDeptExcel.isPending}
                    onClick={() =>
                      downloadDeptExcel.mutate({
                        params: {
                          departmentId: reportsFilters.departmentId || departmentId,
                          semester: reportsFilters.semester || undefined,
                          academicYear: reportsFilters.academicYear,
                          threshold: reportsFilters.threshold,
                        },
                      })
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
                  >
                    {downloadDeptExcel.isPending ? <Spinner size="sm" className="border-white border-t-white" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
                    Dept Excel
                  </button>

                  <button
                    type="button"
                    disabled={downloadBulkExcel.isPending}
                    onClick={() =>
                      downloadBulkExcel.mutate({
                        params: {
                          departmentId: reportsFilters.departmentId || departmentId,
                          semester: reportsFilters.semester || undefined,
                          academicYear: reportsFilters.academicYear,
                          threshold: reportsFilters.threshold,
                        },
                        filename: 'bulk-student-report.xlsx',
                      })
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {downloadBulkExcel.isPending ? <Spinner size="sm" className="border-white border-t-white" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
                    Bulk Student Excel
                  </button>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Low Attendance Students</h2>
                    <p className="text-sm text-slate-500">Filter, export selected rows, or send bulk alerts.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExportSelected}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Export Selected
                    </button>
                    <button
                      type="button"
                      onClick={handleAlertSelected}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600"
                    >
                      <BellAlertIcon className="h-4 w-4" />
                      Send Alert to Selected
                    </button>
                  </div>
                </div>

                {lowAttendanceQuery.isLoading ? (
                  <SkeletonTable rows={6} />
                ) : lowAttendanceQuery.isError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    Unable to load low-attendance list.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-3 py-2">Select</th>
                          <th className="px-3 py-2">Roll</th>
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2">Semester</th>
                          <th className="px-3 py-2">Section</th>
                          <th className="px-3 py-2">Subject</th>
                          <th className="px-3 py-2">Attendance %</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lowAttendanceRows.map((row) => (
                          <tr key={row.key} className="border-b border-slate-100">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={selectedLowAttendance.includes(row.key)}
                                onChange={() => toggleLowAttendanceRow(row.key)}
                              />
                            </td>
                            <td className="px-3 py-2 text-slate-700">{row.rollNumber}</td>
                            <td className="px-3 py-2 text-slate-900">{row.studentName}</td>
                            <td className="px-3 py-2 text-slate-700">{row.semester}</td>
                            <td className="px-3 py-2 text-slate-700">{row.section}</td>
                            <td className="px-3 py-2 text-slate-700">
                              {row.subjectName} {row.subjectCode ? `(${row.subjectCode})` : ''}
                            </td>
                            <td className="px-3 py-2 font-semibold text-red-700">{row.percentage.toFixed(1)}%</td>
                            <td className="px-3 py-2">
                              <StatusBadge status={row.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            </section>
          )}
        </div>
      </main>

      <Transition appear show={!!selectedStudent} as={Fragment}>
        <Dialog as="div" className="relative z-[70]" onClose={() => setSelectedStudent(null)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-slate-900/40" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-xl">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-slate-900">
                        {selectedStudent?.name} ({selectedStudent?.rollNumber})
                      </Dialog.Title>
                      <p className="text-sm text-slate-500">Full attendance summary across all subjects.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          downloadStudentPdf.mutate({
                            studentId: selectedStudent?._id,
                            params: {},
                            filename: `${selectedStudent?.rollNumber || 'student'}-attendance.pdf`,
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadStudentExcel.mutate({
                            studentId: selectedStudent?._id,
                            params: {},
                            filename: `${selectedStudent?.rollNumber || 'student'}-attendance.xlsx`,
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        Excel
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <StudentSummary studentId={selectedStudent?._id} />
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <Transition appear show={studentFormOpen} as={Fragment}>
        <Dialog as="div" className="relative z-[70]" onClose={() => setStudentFormOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-slate-900/40" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
                  <Dialog.Title className="text-lg font-semibold text-slate-900">
                    {studentFormMode === 'edit' ? 'Edit Student' : 'Add Student'}
                  </Dialog.Title>

                  <form className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={submitStudentForm}>
                    <input
                      required
                      value={studentForm.name}
                      onChange={(event) => setStudentForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Name"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      required
                      type="email"
                      value={studentForm.email}
                      onChange={(event) => setStudentForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="Email"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      required
                      value={studentForm.rollNumber}
                      onChange={(event) =>
                        setStudentForm((current) => ({ ...current, rollNumber: event.target.value.toUpperCase() }))
                      }
                      placeholder="Roll Number"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      value={studentForm.phone}
                      onChange={(event) => setStudentForm((current) => ({ ...current, phone: event.target.value }))}
                      placeholder="Phone"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <select
                      required
                      value={studentForm.departmentId}
                      onChange={(event) =>
                        setStudentForm((current) => ({ ...current, departmentId: event.target.value }))
                      }
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">Department</option>
                      {toArray(departmentsQuery.data).map((dept) => (
                        <option key={dept._id || dept.id} value={dept._id || dept.id}>
                          {dept.name || dept.code}
                        </option>
                      ))}
                    </select>
                    <input
                      required
                      value={studentForm.semester}
                      onChange={(event) => setStudentForm((current) => ({ ...current, semester: event.target.value }))}
                      placeholder="Semester (1-8)"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      required
                      value={studentForm.section}
                      onChange={(event) =>
                        setStudentForm((current) => ({ ...current, section: event.target.value.toUpperCase() }))
                      }
                      placeholder="Section"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      required
                      value={studentForm.batch}
                      onChange={(event) => setStudentForm((current) => ({ ...current, batch: event.target.value }))}
                      placeholder="Batch (e.g. 2022-2026)"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />

                    <div className="md:col-span-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setStudentFormOpen(false)}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={createOrUpdateStudent.isPending}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                      >
                        {createOrUpdateStudent.isPending ? <Spinner size="sm" className="border-white border-t-white" /> : null}
                        {studentFormMode === 'edit' ? 'Save Changes' : 'Create Student'}
                      </button>
                    </div>
                  </form>

                  {newCredentials && (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                      <p className="font-semibold">Temporary credentials</p>
                      <p>Email: {newCredentials.email}</p>
                      <p>Password: {newCredentials.password}</p>
                    </div>
                  )}
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <Transition appear show={assignModal.open} as={Fragment}>
        <Dialog as="div" className="relative z-[70]" onClose={() => setAssignModal({ open: false, faculty: null })}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-slate-900/40" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
                  <Dialog.Title className="text-lg font-semibold text-slate-900">
                    Assign Subject: {assignModal.faculty?.name}
                  </Dialog.Title>

                  <p className="mt-2 text-sm text-slate-500">
                    Current subjects:{' '}
                    {toArray(assignModal.faculty?.subjects)
                      .map((subject) => subject.subjectCode || subject.code || subject.name)
                      .join(', ') || 'None'}
                  </p>

                  <form className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={submitAssignForm}>
                    <input
                      readOnly
                      value={assignModal.faculty?.name || ''}
                      className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm"
                    />
                    <select
                      required
                      value={assignForm.subjectId}
                      onChange={(event) => setAssignForm((current) => ({ ...current, subjectId: event.target.value }))}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select Subject</option>
                      {subjects.map((subject) => (
                        <option key={subject._id} value={subject._id}>
                          {subject.code ? `${subject.code} - ` : ''}
                          {subject.name}
                        </option>
                      ))}
                    </select>
                    <input
                      required
                      value={assignForm.semester}
                      onChange={(event) => setAssignForm((current) => ({ ...current, semester: event.target.value }))}
                      placeholder="Semester"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      required
                      value={assignForm.section}
                      onChange={(event) =>
                        setAssignForm((current) => ({ ...current, section: event.target.value.toUpperCase() }))
                      }
                      placeholder="Section"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      required
                      value={assignForm.academicYear}
                      onChange={(event) =>
                        setAssignForm((current) => ({ ...current, academicYear: event.target.value }))
                      }
                      placeholder="Academic Year"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
                    />

                    <div className="md:col-span-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAssignModal({ open: false, faculty: null })}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={assignSubjectMutation.isPending}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                      >
                        {assignSubjectMutation.isPending ? <Spinner size="sm" className="border-white border-t-white" /> : null}
                        Assign Subject
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  )
}
