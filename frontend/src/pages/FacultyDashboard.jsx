import { Fragment, useEffect, useMemo, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import {
  ClockIcon,
  QrCodeIcon,
  ClipboardDocumentListIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  BookOpenIcon,
  XMarkIcon,
  BellAlertIcon,
} from '@heroicons/react/24/outline'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import Spinner, { SkeletonCard, SkeletonTable } from '@/components/shared/Spinner'
import { useAuth, useLowAttendance } from '@/hooks'
import { apiGet } from '@/api/axiosInstance'
import { reportsApi } from '@/api/reportsApi'
import { THRESHOLD } from '@/utils/constants'

const DAY_COLUMNS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
]

const PERIOD_TIMES = {
  1: '09:00 - 09:50',
  2: '09:50 - 10:40',
  3: '10:50 - 11:40',
  4: '11:40 - 12:30',
  5: '13:20 - 14:10',
  6: '14:10 - 15:00',
  7: '15:10 - 16:00',
  8: '16:00 - 16:50',
}

const getAcademicYear = () => {
  const now = new Date()
  const year = now.getFullYear()
  const next = String((year + 1) % 100).padStart(2, '0')
  return `${year}-${next}`
}

const getCurrentDay = () => new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date())

const getTodayIso = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseTimeSlot = (slot = '') => {
  const [startRaw = '', endRaw = ''] = slot.split('-').map((value) => value.trim())
  const parsePart = (value) => {
    const match = value.match(/^(\d{1,2}):(\d{2})$/)
    if (!match) return null
    return { hour: Number(match[1]), minute: Number(match[2]) }
  }
  return { start: parsePart(startRaw), end: parsePart(endRaw) }
}

const toDateTime = (date, time) => {
  const result = new Date(date)
  result.setHours(time.hour, time.minute, 0, 0)
  return result
}

const getClassStatus = ({ timeSlot, marked }) => {
  const { start, end } = parseTimeSlot(timeSlot)
  const now = new Date()

  if (marked) {
    return 'marked'
  }

  if (start && end) {
    const startTime = toDateTime(now, start)
    const endTime = toDateTime(now, end)
    if (now >= startTime && now <= endTime) {
      return 'in-progress'
    }
  }

  return 'not-yet'
}

const getStatusStyles = (status) => {
  if (status === 'marked') return 'bg-green-100 text-green-700 border-green-200'
  if (status === 'in-progress') return 'bg-blue-100 text-blue-700 border-blue-200'
  return 'bg-slate-100 text-slate-600 border-slate-200'
}

const safeArray = (value) => (Array.isArray(value) ? value : [])
const normalizeProfileId = (profileId) =>
  profileId && typeof profileId === 'object' ? profileId._id || profileId.id || '' : profileId || ''
const normalizeEntityId = (value) =>
  value && typeof value === 'object' ? value._id || value.id || value.value || '' : value || ''

export default function FacultyDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const facultyProfileId = normalizeProfileId(user?.profileId)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedClass, setSelectedClass] = useState(null)

  const currentDay = useMemo(() => getCurrentDay(), [])
  const currentDayKey = useMemo(() => String(currentDay || '').toLowerCase(), [currentDay])
  const academicYear = useMemo(() => getAcademicYear(), [])
  const todayIso = useMemo(() => getTodayIso(), [])

  const timetableQuery = useQuery({
    queryKey: ['facultyTimetable', facultyProfileId, academicYear],
    queryFn: () => apiGet('/faculty/timetable', { academicYear }),
    enabled: !!facultyProfileId,
    retry: 0,
    staleTime: 5 * 60 * 1000,
    select: (response) => response?.data,
  })

  const timetableDays = useMemo(() => {
    const data = timetableQuery.data || {}
    return DAY_COLUMNS.reduce((acc, day) => {
      acc[day.key] = safeArray(data[day.key])
      return acc
    }, {})
  }, [timetableQuery.data])

  const timetableGrid = useMemo(() => {
    const grid = new Map()

    DAY_COLUMNS.forEach(({ key }) => {
      const daySlots = safeArray(timetableDays[key])
      const byPeriod = new Map()

      daySlots.forEach((slot) => {
        const periodNumber = Number(slot.periodNumber || 0)
        if (!Number.isFinite(periodNumber) || periodNumber < 1 || periodNumber > 8) {
          return
        }

        if (!byPeriod.has(periodNumber)) {
          byPeriod.set(periodNumber, slot)
        }
      })

      grid.set(key, byPeriod)
    })

    return grid
  }, [timetableDays])

  const todaySchedule = useMemo(() => safeArray(timetableDays[currentDayKey]), [timetableDays, currentDayKey])

  const schedule = useMemo(() => {
    return todaySchedule.map((item) => {
      const periodNumber = Number(item.periodNumber || 0)
      const startTime = item.startTime || '09:00'
      const endTime = item.endTime || '10:00'
      const timeSlot = `${startTime} - ${endTime}`
      const isLab = String(item.subjectType || item.subjectId?.type || '').toLowerCase() === 'lab' || Boolean(item.isLab)
      const subjectObj = item.subjectId && typeof item.subjectId === 'object' ? item.subjectId : item.subject

      return {
        id: item._id || item.id || `${normalizeEntityId(item.subjectId)}-${periodNumber}-${item.day}`,
        subjectId: normalizeEntityId(item.subjectId) || item.subject?._id || item.subject?.id,
        subjectName: item.subjectName || subjectObj?.name || item.subject?.name || item.name || 'Subject',
        subjectCode: item.subjectCode || subjectObj?.subjectCode || item.subject?.code || item.code || '-',
        section: item.section || '-',
        roomNo: item.roomNo || '-',
        semester: item.semester || subjectObj?.semester || item.subject?.semester || '-',
        timeSlot,
        periodNumbers: [periodNumber].filter(Boolean),
        isLab,
        session: Number(String(startTime).split(':')[0]) >= 13 ? 'afternoon' : 'morning',
      }
    })
  }, [todaySchedule])

  const facultySubjectIds = useMemo(
    () => [...new Set(schedule.map((item) => item.subjectId).filter(Boolean))],
    [schedule]
  )

  const lowAttendanceQuery = useLowAttendance({ subjectIds: facultySubjectIds, threshold: THRESHOLD })

  const classAttendanceQuery = useQuery({
    queryKey: ['facultyTodayClassAttendance', facultyProfileId, todayIso, facultySubjectIds.join(',')],
    queryFn: async () => {
      const results = await Promise.allSettled(
        schedule.map(async (item) => {
          const periodNumber = Array.isArray(item.periodNumbers) && item.periodNumbers.length > 0
            ? Number(item.periodNumbers[0])
            : undefined

          const response = await apiGet('/attendance/class', {
            subjectId: item.subjectId,
            date: todayIso,
            periodNumber,
          })
          return {
            classKey: `${String(item.subjectId)}-${String(periodNumber || '')}`,
            subjectId: item.subjectId,
            periodNumber,
            summary: response?.data?.summary || response?.summary || {},
            records: response?.data?.records || response?.records || [],
            subjectName: response?.data?.subjectName || item.subjectName,
          }
        })
      )

      return results.filter((result) => result.status === 'fulfilled').map((result) => result.value)
    },
    enabled: schedule.length > 0,
    retry: 0,
  })

  const lowAttendanceRows = useMemo(() => {
    const data = lowAttendanceQuery.data
    const items = Array.isArray(data) ? data : data?.items || data?.students || []

    return items.map((item) => ({
      ...item,
      studentId: item.studentId || item._id,
      subjectId: normalizeEntityId(item.subjectId) || item.subject?._id || item.subject?.id,
      subjectName: item.subjectName || item.subject?.name || '-',
      subjectCode: item.subjectCode || item.subject?.code || '-',
      name: item.name || item.studentName || '-',
      rollNumber: item.rollNumber || '-',
      email: item.email || '',
      percentage: Number(item.percentage ?? 0),
    }))
  }, [lowAttendanceQuery.data])

  const atRiskStudentCount = useMemo(() => {
    const studentIds = new Set(lowAttendanceRows.map((row) => String(row.studentId || '')).filter(Boolean))
    return studentIds.size
  }, [lowAttendanceRows])

  const classesMarkedToday = useMemo(() => {
    const markedKeys = new Set(
      safeArray(classAttendanceQuery.data)
        .filter((item) => safeArray(item.records).length > 0)
        .map((item) => String(item.classKey || ''))
        .filter(Boolean)
    )

    return schedule.filter((item) => {
      const periodNumber = Array.isArray(item.periodNumbers) && item.periodNumbers.length > 0
        ? Number(item.periodNumbers[0])
        : undefined
      const key = `${String(item.subjectId)}-${String(periodNumber || '')}`
      return markedKeys.has(key)
    }).length
  }, [classAttendanceQuery.data, schedule])

  const totalStudents = useMemo(() => {
    const uniqueStudents = new Set()
    safeArray(classAttendanceQuery.data).forEach((entry) => {
      safeArray(entry.records).forEach((record) => uniqueStudents.add(String(record.studentId)))
    })
    lowAttendanceRows.forEach((row) => {
      if (row.studentId) uniqueStudents.add(String(row.studentId))
    })
    return uniqueStudents.size
  }, [classAttendanceQuery.data, lowAttendanceRows, schedule.length])

  const renderTimetableCell = (dayKey, periodNumber) => {
    const slot = timetableGrid.get(dayKey)?.get(periodNumber) || null

    if (!slot) {
      return (
        <td key={`${dayKey}-${periodNumber}`} className="border-b border-slate-200 px-2 py-2 align-top">
          <div className="min-h-[76px] rounded-lg border border-dashed border-slate-200 bg-slate-50/70" />
        </td>
      )
    }

    const subject = slot.subjectId && typeof slot.subjectId === 'object' ? slot.subjectId : slot.subject
    const faculty = slot.facultyId && typeof slot.facultyId === 'object' ? slot.facultyId : slot.faculty
    const isLab = String(slot.subjectType || subject?.type || '').toLowerCase() === 'lab' || Boolean(slot.isLab)
    const departmentName = slot.departmentName || slot.departmentCode || '-'
    const semester = slot.semester || '-'
    const section = slot.section || '-'
    const subjectCode = subject?.subjectCode || subject?.code || slot.subjectCode || '-'
    const subjectName = subject?.name || slot.subjectName || 'Subject'

    return (
      <td key={`${dayKey}-${periodNumber}`} className="border-b border-slate-200 px-2 py-2 align-top">
        <div className={`min-h-[76px] rounded-lg border p-2 ${isLab ? 'border-indigo-200 bg-indigo-50 text-indigo-950' : 'border-emerald-200 bg-emerald-50 text-emerald-950'}`}>
          <p className="text-xs font-semibold uppercase tracking-wide">{subjectCode}</p>
          <p className="text-sm font-bold leading-5">{subjectName}</p>
          <p className="mt-1 text-xs">Dept: {departmentName}</p>
          <p className="text-xs">Sem {semester} • Sec {section}</p>
          <p className="text-xs">Room {slot.roomNo || '-'}</p>
          <p className="text-[11px] text-slate-700">{faculty?.name || slot.facultyName || ''}</p>
          {isLab ? <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide">Lab</p> : null}
        </div>
      </td>
    )
  }

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const classDetailQuery = useQuery({
    queryKey: ['facultyClassDetail', selectedClass?.subjectId, selectedClass?.timeSlot, todayIso],
    queryFn: () =>
      apiGet('/attendance/class', {
        subjectId: selectedClass?.subjectId,
        date: todayIso,
        periodNumber: Array.isArray(selectedClass?.periodNumbers) && selectedClass?.periodNumbers.length > 0
          ? Number(selectedClass.periodNumbers[0])
          : undefined,
      }),
    enabled: !!selectedClass,
    retry: 0,
    select: (response) => response?.data,
  })

  const downloadClassExcel = useMutation({
    mutationFn: ({ subjectId }) =>
      reportsApi.downloadClassExcel({ facultyId: facultyProfileId, day: currentDay, subjectId, academicYear }),
    onSuccess: (blob, variables) => {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${variables?.subjectId || 'class'}-report.xlsx`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success('Excel downloaded')
    },
    onError: (error) => toast.error(error.message || 'Download failed'),
  })

  const sendAlertMutation = useMutation({
    mutationFn: async (row) => {
      try {
        await reportsApi.triggerAlerts({ threshold: THRESHOLD, studentIds: [row.studentId], subjectId: row.subjectId })
        return 'backend'
      } catch {
        return 'mailto'
      }
    },
    onSuccess: (mode, row) => {
      if (mode === 'backend') {
        toast.success('Alert triggered')
        return
      }

      if (row?.email) {
        const subject = encodeURIComponent('Attendance Alert')
        const body = encodeURIComponent(
          `Dear ${row.name},\n\nYour attendance in ${row.subjectName || row.subjectCode || 'the subject'} is below the threshold. Please attend remaining classes.`
        )
        window.open(`mailto:${row.email}?subject=${subject}&body=${body}`, '_blank')
        toast.info('Opened email client')
      } else {
        toast.info('Alert endpoint is not available yet')
      }
    },
  })

  const overallAttendance = useMemo(() => {
    if (!schedule.length) return 0
    return Math.round((classesMarkedToday / schedule.length) * 100)
  }, [classesMarkedToday, schedule.length])

  const statCard = (label, value, colorClass, icon, helper) => (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className={`mt-2 text-3xl font-bold ${colorClass}`}>{value}</p>
          {helper && <p className="mt-1 text-xs text-slate-500">{helper}</p>}
        </div>
        <div className="rounded-xl bg-slate-100 p-2 text-slate-600">{icon}</div>
      </div>
    </article>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <PageHeader title="Faculty Dashboard" subtitle={`Today's schedule and attendance insights for ${currentDay}`} />

          {timetableQuery.isError && (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Some faculty data could not be loaded. The page will still show whatever is available.
            </div>
          )}

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {statCard('Today\'s Classes', schedule.length, 'text-[#1F4E79]', <ClockIcon className="h-5 w-5" />, 'From timetable')}
            {statCard('Total Students', totalStudents, 'text-slate-900', <BookOpenIcon className="h-5 w-5" />, 'Across assigned subjects')}
            {statCard('At-Risk Students', atRiskStudentCount, 'text-amber-700', <ExclamationTriangleIcon className="h-5 w-5" />, `Below ${THRESHOLD}% attendance`)}
            {statCard('Classes Marked Today', classesMarkedToday, 'text-green-700', <CheckCircleIcon className="h-5 w-5" />, `${overallAttendance}% of scheduled classes`)}
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Today's Schedule</h2>
              <p className="text-sm text-slate-500">{academicYear}</p>
            </div>

            {timetableQuery.isLoading ? (
              <div className="space-y-3">
                <SkeletonCard height="6rem" />
                <SkeletonCard height="6rem" />
                <SkeletonCard height="6rem" />
              </div>
            ) : schedule.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                No timetable data available for today.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {schedule.map((item) => {
                  const periodNumber = Array.isArray(item.periodNumbers) && item.periodNumbers.length > 0
                    ? Number(item.periodNumbers[0])
                    : undefined
                  const classSummary = safeArray(classAttendanceQuery.data).find((entry) => (
                    String(entry.subjectId) === String(item.subjectId)
                    && Number(entry.periodNumber) === Number(periodNumber)
                  ))
                  const status = getClassStatus({
                    timeSlot: item.timeSlot,
                    marked: safeArray(classSummary?.records).length > 0,
                  })

                  return (
                    <article key={item.id} className="rounded-2xl border border-slate-200 p-4 shadow-sm hover:bg-slate-50">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#1F4E79]">{item.timeSlot}</p>
                          <h3 className="mt-1 text-lg font-bold text-slate-900">
                            {item.subjectName} <span className="text-slate-500">({item.subjectCode})</span>
                          </h3>
                          <p className="mt-1 text-sm text-slate-600">
                            Section {item.section} • Room {item.roomNo} • Semester {item.semester}
                          </p>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusStyles(status)}`}>
                          {status === 'marked' ? 'Marked' : status === 'in-progress' ? 'In Progress' : 'Not Yet'}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const searchParams = {
                              subjectId: String(item.subjectId),
                              session: String(item.session),
                            }

                            if (Array.isArray(item.periodNumbers) && item.periodNumbers.length > 0) {
                              searchParams.periodNumbers = item.periodNumbers.join(',')
                              searchParams.periodNumber = String(item.periodNumbers[0])
                            }

                            if (item.isLab) {
                              searchParams.isLab = 'true'
                              searchParams.timeSlot = String(item.timeSlot)
                            }

                            const search = new URLSearchParams(searchParams).toString()
                            navigate(`/faculty/mark?${search}`)
                          }}
                          className="inline-flex items-center gap-2 rounded-lg bg-[#1F4E79] px-3 py-2 text-sm font-semibold text-white hover:bg-[#173b5d]"
                        >
                          <ClipboardDocumentListIcon className="h-4 w-4" />
                          Mark Attendance
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const search = new URLSearchParams({
                              subjectId: String(item.subjectId),
                              session: String(item.session),
                            }).toString()
                            navigate(`/faculty/qr?${search}`)
                          }}
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900"
                        >
                          <QrCodeIcon className="h-4 w-4" />
                          QR Mode
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedClass(item)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          View Class
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Weekly Timetable</h2>
                <p className="text-sm text-slate-500">Standard format with blank periods left empty</p>
              </div>
              <p className="text-sm text-slate-500">{timetableQuery.data?.academicYear || academicYear}</p>
            </div>

            {timetableQuery.isLoading ? (
              <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[1100px] w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="sticky left-0 z-20 min-w-[160px] border-b border-slate-700 bg-slate-900 px-3 py-3 text-left text-xs uppercase tracking-wide">
                        Period / Time
                      </th>
                      {DAY_COLUMNS.map((day) => (
                        <th key={day.key} className="border-b border-slate-700 px-3 py-3 text-left text-xs uppercase tracking-wide">
                          {day.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 8 }, (_, index) => index + 1).map((periodNumber) => (
                      <tr key={periodNumber} className="even:bg-slate-50/70">
                        <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-2 text-left align-top">
                          <p className="font-semibold text-slate-900">Period {periodNumber}</p>
                          <p className="text-xs text-slate-500">{PERIOD_TIMES[periodNumber]}</p>
                        </th>

                        {DAY_COLUMNS.map((day) => renderTimetableCell(day.key, periodNumber))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Low Attendance Students</h2>
                <p className="text-sm text-slate-500">Faculty subjects only</p>
              </div>
              {lowAttendanceRows.length > 0 && (
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                  {lowAttendanceRows.length} below {THRESHOLD}%
                </span>
              )}
            </div>

            {lowAttendanceQuery.isLoading ? (
              <SkeletonTable rows={5} />
            ) : lowAttendanceRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                No low attendance students found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Student Name</th>
                      <th className="px-3 py-2">Roll No</th>
                      <th className="px-3 py-2">Subject</th>
                      <th className="px-3 py-2">%</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowAttendanceRows.map((row) => (
                      <tr key={`${row.studentId}-${row.subjectId}`} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-900">{row.name}</td>
                        <td className="px-3 py-2 text-slate-700">{row.rollNumber}</td>
                        <td className="px-3 py-2 text-slate-700">{row.subjectName} ({row.subjectCode})</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.percentage < THRESHOLD ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {row.percentage}%
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => sendAlertMutation.mutate(row)}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            Send Alert
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Quick Links</h2>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate('/faculty/mark')}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1F4E79] px-4 py-2 text-sm font-semibold text-white hover:bg-[#173b5d]"
              >
                <ClipboardDocumentListIcon className="h-4 w-4" />
                Mark Attendance
              </button>
              <button
                type="button"
                onClick={() => navigate('/faculty/qr')}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
              >
                <QrCodeIcon className="h-4 w-4" />
                QR Attendance
              </button>
              <button
                type="button"
                onClick={() => navigate('/faculty/reports')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                <BookOpenIcon className="h-4 w-4" />
                Class Report
              </button>
              <button
                type="button"
                disabled={downloadClassExcel.isPending || !facultySubjectIds[0]}
                onClick={() => downloadClassExcel.mutate({ subjectId: facultySubjectIds[0] })}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-70"
              >
                {downloadClassExcel.isPending ? <Spinner size="sm" className="border-white/40 border-t-white" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
                Download Excel
              </button>
            </div>
          </section>
        </div>
      </main>

      <Transition appear show={!!selectedClass} as={Fragment}>
        <Dialog as="div" className="relative z-[70]" onClose={() => setSelectedClass(null)}>
          <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-slate-900/50" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                <Dialog.Panel className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-slate-900">
                        {selectedClass?.subjectName || 'Class'} Attendance
                      </Dialog.Title>
                      <p className="text-sm text-slate-500">
                        {selectedClass?.timeSlot} • {selectedClass?.section} • {selectedClass?.roomNo}
                      </p>
                    </div>
                    <button type="button" onClick={() => setSelectedClass(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mt-5">
                    {classDetailQuery.isLoading ? (
                      <SkeletonCard height="14rem" />
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                          <div className="rounded-xl bg-slate-100 p-3">
                            <p className="text-xs text-slate-500">Total Students</p>
                            <p className="text-xl font-bold text-slate-900">{classDetailQuery.data?.summary?.totalStudents || classDetailQuery.data?.records?.length || 0}</p>
                          </div>
                          <div className="rounded-xl bg-green-50 p-3">
                            <p className="text-xs text-green-700">Present</p>
                            <p className="text-xl font-bold text-green-700">{classDetailQuery.data?.summary?.totalPresent || 0}</p>
                          </div>
                          <div className="rounded-xl bg-red-50 p-3">
                            <p className="text-xs text-red-700">Absent</p>
                            <p className="text-xl font-bold text-red-700">{classDetailQuery.data?.summary?.totalAbsent || 0}</p>
                          </div>
                          <div className="rounded-xl bg-amber-50 p-3">
                            <p className="text-xs text-amber-700">Late</p>
                            <p className="text-xl font-bold text-amber-700">{classDetailQuery.data?.summary?.totalLate || 0}</p>
                          </div>
                        </div>

                        <div className="mt-5 overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                                <th className="px-3 py-2">Student</th>
                                <th className="px-3 py-2">Roll No</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">Remarks</th>
                                <th className="px-3 py-2">Marked At</th>
                              </tr>
                            </thead>
                            <tbody>
                              {safeArray(classDetailQuery.data?.records).map((record) => (
                                <tr key={record._id} className="border-b border-slate-100 hover:bg-slate-50">
                                  <td className="px-3 py-2 font-medium text-slate-900">{record.studentName}</td>
                                  <td className="px-3 py-2 text-slate-700">{record.rollNumber}</td>
                                  <td className="px-3 py-2"><StatusBadge status={record.status} /></td>
                                  <td className="px-3 py-2 text-slate-700">{record.remarks || '-'}</td>
                                  <td className="px-3 py-2 text-slate-700">{record.markedAt || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  )
}
