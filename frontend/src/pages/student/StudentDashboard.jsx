import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@/lib/dataClientHooks.jsx'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { apiGet } from '@/api/axiosInstance'

const STATUS_THEME = {
  P: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  A: 'bg-rose-100 text-rose-700 border border-rose-200',
  L: 'bg-amber-100 text-amber-700 border border-amber-200',
  ML: 'bg-sky-100 text-sky-700 border border-sky-200',
  '--': 'bg-slate-100 text-slate-600 border border-slate-200',
}

const formatDate = (value) => {
  const date = value ? new Date(value) : new Date()
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

const normalizeNumber = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const formatPercent = (value) => `${normalizeNumber(value).toFixed(1)}%`

const readPayload = (response) => {
  const top = response?.data || response || {}
  if (top && typeof top === 'object' && top.data !== undefined) {
    return top.data
  }
  return top
}

const normalizePeriods = (periods) => {
  if (!Array.isArray(periods)) {
    return []
  }

  return periods
    .map((item, index) => {
      const status = String(item?.status || '--').toUpperCase()
      return {
        id: `${item?.periodNumber || index}-${item?.subject?.code || item?.subject?.name || 'period'}`,
        periodNumber: normalizeNumber(item?.periodNumber, index + 1),
        periodLabel: item?.periodLabel || `Period ${normalizeNumber(item?.periodNumber, index + 1)}`,
        startTime: item?.startTime || '--:--',
        endTime: item?.endTime || '--:--',
        subjectName: item?.subject?.name || item?.subjectName || 'Subject',
        facultyName: item?.faculty?.name || item?.facultyName || 'Faculty not assigned',
        status: ['P', 'A', 'L', 'ML'].includes(status) ? status : '--',
      }
    })
    .sort((left, right) => left.periodNumber - right.periodNumber)
}

const normalizeRiskSubjects = (summaryData) => {
  const rows = summaryData?.lowAttendanceSubjects
  if (!Array.isArray(rows)) {
    return []
  }

  return rows.map((item, index) => ({
    id: item?.subjectId || item?._id || index,
    name: item?.subjectName || item?.name || item?.subjectCode || 'Subject',
    percentage: normalizeNumber(item?.percentage),
  }))
}

const normalizeNotifications = (rows) => {
  if (!Array.isArray(rows)) {
    return []
  }

  return rows
    .filter((item) => item?.type === 'notice')
    .slice(0, 3)
    .map((item, index) => ({
      id: item?.id || item?._id || index,
      title: item?.title || 'Notice',
      message: item?.message || '',
      createdAt: item?.createdAt || null,
    }))
}

export default function StudentDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const onToggleSidebar = () => {
      setSidebarOpen((prev) => !prev)
    }

    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const todayQuery = useQuery({
    queryKey: ['student-dashboard', 'today-attendance'],
    queryFn: () => apiGet('/student/today-attendance'),
  })

  const summaryQuery = useQuery({
    queryKey: ['student-dashboard', 'attendance-summary'],
    queryFn: () => apiGet('/student/attendance-summary'),
  })

  const noticesQuery = useQuery({
    queryKey: ['student-dashboard', 'notifications'],
    queryFn: () => apiGet('/student/notifications', { limit: 3 }),
  })

  const leavesQuery = useQuery({
    queryKey: ['student-dashboard', 'leaves'],
    queryFn: () => apiGet('/student/leaves', { limit: 10 }),
  })

  const isLoading = todayQuery.isLoading || summaryQuery.isLoading || noticesQuery.isLoading || leavesQuery.isLoading
  const hasError = todayQuery.isError || summaryQuery.isError || noticesQuery.isError || leavesQuery.isError

  const todayPayload = useMemo(() => readPayload(todayQuery.data), [todayQuery.data])
  const summaryPayload = useMemo(() => readPayload(summaryQuery.data), [summaryQuery.data])

  const periods = useMemo(() => normalizePeriods(todayPayload?.periods), [todayPayload?.periods])
  const riskSubjects = useMemo(() => normalizeRiskSubjects(summaryPayload), [summaryPayload])
  const noticesPayload = useMemo(() => readPayload(noticesQuery.data), [noticesQuery.data])
  const notices = useMemo(() => normalizeNotifications(noticesPayload), [noticesPayload])

  const leavesPayload = useMemo(() => readPayload(leavesQuery.data), [leavesQuery.data])
  const leaves = Array.isArray(leavesPayload) ? leavesPayload : []
  const pendingLeaves = leaves.filter((item) => String(item?.status || '').toLowerCase() === 'pending').length

  const quickStats = {
    overall: normalizeNumber(summaryPayload?.overall?.overallPercentage),
    riskCount: riskSubjects.length,
    todayPresent: normalizeNumber(todayPayload?.summary?.present),
    pendingLeaves,
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ed_0%,_#f8fafc_40%,_#eef2ff_100%)]">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-6xl px-3 pb-8 sm:px-5">
          <section className="rounded-3xl border border-white bg-white/80 p-4 shadow-xl backdrop-blur-sm sm:p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">Today&apos;s Attendance</p>
                <h1
                  className="text-xl font-bold text-slate-900 sm:text-2xl"
                  style={{ fontFamily: 'Poppins, Nunito, Segoe UI, sans-serif' }}
                >
                  {formatDate(todayPayload?.date)}
                </h1>
                <p className="text-sm text-slate-600">{todayPayload?.dayName || new Date().toLocaleDateString('en-IN', { weekday: 'long' })}</p>
              </div>
              <Link
                to="/student/timetable"
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-700"
              >
                Weekly Timetable
              </Link>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            ) : periods.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
                No classes scheduled today
              </div>
            ) : (
              <div className="space-y-3">
                {periods.map((period) => (
                  <article
                    key={period.id}
                    className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md sm:p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {period.startTime}-{period.endTime} | {period.periodLabel}
                        </p>
                        <h3 className="truncate text-base font-semibold text-slate-900">{period.subjectName}</h3>
                        <p className="mt-1 text-sm text-slate-600">{period.facultyName}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${STATUS_THEME[period.status]}`}>
                        {period.status}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <article className="rounded-2xl border border-white/60 bg-white/90 p-3 shadow-md">
              <p className="text-xs uppercase tracking-wide text-slate-500">Overall %</p>
              <p className="mt-2 text-xl font-bold text-slate-900">{formatPercent(quickStats.overall)}</p>
            </article>
            <article className="rounded-2xl border border-white/60 bg-white/90 p-3 shadow-md">
              <p className="text-xs uppercase tracking-wide text-slate-500">Subjects at Risk</p>
              <p className="mt-2 text-xl font-bold text-rose-700">{quickStats.riskCount}</p>
            </article>
            <article className="rounded-2xl border border-white/60 bg-white/90 p-3 shadow-md">
              <p className="text-xs uppercase tracking-wide text-slate-500">Today&apos;s Present</p>
              <p className="mt-2 text-xl font-bold text-emerald-700">{quickStats.todayPresent}</p>
            </article>
            <article className="rounded-2xl border border-white/60 bg-white/90 p-3 shadow-md">
              <p className="text-xs uppercase tracking-wide text-slate-500">Pending Leaves</p>
              <p className="mt-2 text-xl font-bold text-amber-700">{quickStats.pendingLeaves}</p>
            </article>
          </section>

          {riskSubjects.length > 0 && (
            <section className="mt-5 rounded-3xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
              <h2 className="text-base font-bold text-rose-800">{riskSubjects.length} subjects need attention</h2>
              <div className="mt-3 space-y-2">
                {riskSubjects.map((subject) => (
                  <div
                    key={subject.id}
                    className="flex items-center justify-between rounded-xl border border-rose-200 bg-white px-3 py-2"
                  >
                    <p className="truncate text-sm font-medium text-rose-900">{subject.name}</p>
                    <p className="text-sm font-semibold text-rose-700">{formatPercent(subject.percentage)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mt-5 rounded-3xl border border-white bg-white/90 p-4 shadow-md">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Notifications / Notices</h2>
              <a href="/student/notifications" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                View all
              </a>
            </div>

            {hasError ? (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">Unable to load notices right now.</p>
            ) : notices.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">No recent notices.</p>
            ) : (
              <div className="space-y-2">
                {notices.map((notice) => (
                  <article key={notice.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                    <p className="text-sm font-semibold text-slate-900">{notice.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{notice.message}</p>
                    {notice.createdAt && (
                      <p className="mt-1 text-xs text-slate-500">{formatDate(notice.createdAt)}</p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
