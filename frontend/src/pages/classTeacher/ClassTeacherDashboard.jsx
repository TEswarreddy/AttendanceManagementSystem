import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { apiGet, apiPost } from '@/api/axiosInstance'

const ATTENDANCE_THRESHOLD = 75

const formatDate = (value) => {
  const date = value ? new Date(value) : new Date()
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

const parseClassInfo = (className) => {
  const name = String(className || '')
  const match = name.match(/^(.*?)\s+Sem(\d+)\s+Section\s+([A-Z0-9]+)/i)
  if (!match) {
    return { department: '-', semester: '-', section: '-', className: name || '-' }
  }

  return {
    department: match[1].trim(),
    semester: match[2],
    section: String(match[3]).toUpperCase(),
    className: name,
  }
}

const normalizeDaily = (rawData) => {
  const payload = rawData?.data || rawData || {}
  const periodSummary = Array.isArray(payload.periodSummary) ? payload.periodSummary : []
  const studentSummary = Array.isArray(payload.studentSummary) ? payload.studentSummary : []
  const absentStudents = Array.isArray(payload.absentStudents) ? payload.absentStudents : []

  const absentPeriodMap = new Map(
    studentSummary.map((student) => {
      const absentPeriods = Array.isArray(student.periods)
        ? student.periods.filter((item) => item.status === 'A').map((item) => item.periodNumber)
        : []
      return [String(student.rollNumber || ''), absentPeriods]
    })
  )

  return {
    date: payload.date,
    className: payload.className || '-',
    periodSummary: periodSummary.map((period) => {
      const total = Number(period.present || 0) + Number(period.absent || 0) + Number(period.late || 0)
      const effectivePresent = Number(period.present || 0) + Number(period.late || 0)
      const percentage = total > 0 ? Number(((effectivePresent / total) * 100).toFixed(1)) : 0

      return {
        ...period,
        total,
        percentage,
      }
    }),
    absentStudents: absentStudents.map((student) => ({
      ...student,
      absentPeriods: absentPeriodMap.get(String(student.rollNumber || '')) || [],
    })),
  }
}

const normalizeStudents = (rawData) => {
  const payload = rawData?.data || rawData || []
  return Array.isArray(payload) ? payload : []
}

export default function ClassTeacherDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const dailyQuery = useQuery({
    queryKey: ['ct-dashboard', 'daily-attendance'],
    queryFn: () => apiGet('/class-teacher/daily-attendance'),
  })

  const studentsQuery = useQuery({
    queryKey: ['ct-dashboard', 'students'],
    queryFn: () => apiGet('/class-teacher/students'),
  })

  const monthlyAlertQuery = useQuery({
    queryKey: ['ct-dashboard', 'monthly-alerts'],
    queryFn: () => apiGet('/class-teacher/monthly-alerts'),
    retry: false,
  })

  const daily = useMemo(() => normalizeDaily(dailyQuery.data), [dailyQuery.data])
  const allStudents = useMemo(() => normalizeStudents(studentsQuery.data), [studentsQuery.data])
  const classInfo = useMemo(() => parseClassInfo(daily.className), [daily.className])

  const studentIdByRoll = useMemo(() => {
    const map = new Map()
    allStudents.forEach((student) => {
      map.set(String(student.rollNumber || '').toUpperCase(), String(student._id || student.studentId || ''))
    })
    return map
  }, [allStudents])

  const absentRows = useMemo(() => {
    return daily.absentStudents.map((student) => ({
      ...student,
      studentId: studentIdByRoll.get(String(student.rollNumber || '').toUpperCase()) || null,
    }))
  }, [daily.absentStudents, studentIdByRoll])

  const lowAttendanceRows = useMemo(() => {
    const payload = monthlyAlertQuery.data?.data || monthlyAlertQuery.data || {}
    const rows = Array.isArray(payload.students) ? payload.students : []
    return rows
  }, [monthlyAlertQuery.data])

  const sendAbsentSmsMutation = useMutation({
    mutationFn: (studentIds) =>
      apiPost('/class-teacher/send-absent-sms', {
        studentIds,
        date: daily.date,
      }),
    onSuccess: () => {
      toast.success('Absent SMS triggered successfully')
      queryClient.invalidateQueries({ queryKey: ['ct-dashboard', 'daily-attendance'] })
    },
    onError: (error) => {
      toast.error(error.message || 'Unable to send SMS')
    },
  })

  const triggerMonthlyMutation = useMutation({
    mutationFn: () => apiPost('/class-teacher/monthly-alerts', {}),
    onSuccess: () => {
      toast.success('Monthly threshold alerts triggered')
      queryClient.invalidateQueries({ queryKey: ['ct-dashboard', 'monthly-alerts'] })
    },
    onError: (error) => {
      toast.error(error.message || 'Monthly alert endpoint unavailable')
    },
  })

  const sendSingleSms = (studentId) => {
    if (!studentId) {
      toast.error('Student ID not available for this row')
      return
    }

    sendAbsentSmsMutation.mutate([studentId])
  }

  const sendAllSms = () => {
    const ids = absentRows.map((row) => row.studentId).filter(Boolean)
    if (!ids.length) {
      toast.error('No absent student IDs available')
      return
    }

    sendAbsentSmsMutation.mutate(ids)
  }

  const quickActions = [
    { title: 'Add Student', to: '/class-teacher/students' },
    { title: 'Send Notice', to: '/class-teacher/notices' },
    { title: 'Download Reports', to: '/class-teacher/reports' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h1 className="text-xl font-bold text-slate-900">Daily Attendance Overview</h1>
            <p className="mt-1 text-sm text-slate-600">{formatDate(daily.date)}</p>
            <p className="text-sm text-slate-700">
              Dept: <span className="font-semibold">{classInfo.department}</span> • Sem: <span className="font-semibold">{classInfo.semester}</span> • Section: <span className="font-semibold">{classInfo.section}</span>
            </p>

            {dailyQuery.isLoading ? (
              <div className="mt-4 h-28 animate-pulse rounded-xl bg-slate-100" />
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {daily.periodSummary.map((period) => {
                  const color =
                    period.percentage >= 85
                      ? 'border-emerald-200 bg-emerald-50'
                      : period.percentage >= ATTENDANCE_THRESHOLD
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-rose-200 bg-rose-50'

                  return (
                    <article key={`${period.periodNumber}-${period.subject}`} className={`rounded-xl border p-3 ${color}`}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Period {period.periodNumber}</p>
                      <p className="text-sm font-semibold text-slate-900">{period.subject}</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {period.present}/{period.absent}/{period.total} (P/A/Total)
                      </p>
                      <p className="text-base font-bold text-slate-900">{period.percentage}%</p>
                    </article>
                  )
                })}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Absent Students</h2>
              <button
                type="button"
                onClick={sendAllSms}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                disabled={sendAbsentSmsMutation.isPending || !absentRows.length}
              >
                {sendAbsentSmsMutation.isPending ? 'Sending...' : 'Send All Absent SMS'}
              </button>
            </div>

            {absentRows.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">No fully absent students today.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="py-2">Roll No</th>
                      <th className="py-2">Name</th>
                      <th className="py-2">Absent Periods</th>
                      <th className="py-2">Guardian Phone</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {absentRows.map((row) => (
                      <tr key={row.rollNumber} className="border-b border-slate-100">
                        <td className="py-2 font-medium text-slate-900">{row.rollNumber}</td>
                        <td className="py-2">{row.name}</td>
                        <td className="py-2">{row.absentPeriods.length ? row.absentPeriods.join(', ') : '-'}</td>
                        <td className="py-2">{row.guardianPhone || '-'}</td>
                        <td className="py-2">
                          {row.smsAlertSent ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                              ✓ SMS Sent
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => sendSingleSms(row.studentId)}
                              className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                            >
                              Send SMS
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Monthly Alerts</h2>
                <p className="text-sm text-slate-600">
                  Students below {ATTENDANCE_THRESHOLD}% this month: <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">{lowAttendanceRows.length}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => triggerMonthlyMutation.mutate()}
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
                disabled={triggerMonthlyMutation.isPending}
              >
                {triggerMonthlyMutation.isPending ? 'Triggering...' : 'Trigger Monthly Alerts'}
              </button>
            </div>
          </section>

          <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                {action.title}
              </Link>
            ))}
          </section>
        </div>
      </main>
    </div>
  )
}
