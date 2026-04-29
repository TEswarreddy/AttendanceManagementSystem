import { useEffect, useMemo, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import Spinner, { SkeletonCard, SkeletonTable } from '@/components/shared/Spinner'
import StatusBadge from '@/components/shared/StatusBadge'
import PageHeader from '@/components/shared/PageHeader'
import AlertBanner from '@/components/shared/AlertBanner'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { ATTENDANCE_COLOR, THRESHOLD } from '@/utils/constants'
import { useAuth, useStudentAnalytics, useStudentAttendance } from '@/hooks'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

const getStatusByPercentage = (percentage) => {
  if (percentage < THRESHOLD) {
    return 'critical'
  }

  if (percentage < THRESHOLD + 10) {
    return 'warning'
  }

  return 'safe'
}

const computeRequiredClasses = (present, total) => {
  if (!Number.isFinite(present) || !Number.isFinite(total) || total <= 0) {
    return 0
  }

  const needed = Math.ceil((THRESHOLD * total - 100 * present) / (100 - THRESHOLD))
  return Math.max(0, needed)
}

const getColorByStatus = (status) => ATTENDANCE_COLOR[status] || ATTENDANCE_COLOR.safe

export default function StudentDashboard() {
  const { user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const { data, isLoading, isError, refetch } = useStudentAttendance(user?.profileId)
  const { data: analytics, isLoading: analyticsLoading } = useStudentAnalytics(user?.profileId)

  useEffect(() => {
    const onToggleSidebar = () => {
      setSidebarOpen((prev) => !prev)
    }

    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const subjectRows = useMemo(() => {
    const list = data?.summary || data?.subjects || []
    return Array.isArray(list) ? list : []
  }, [data])

  const normalizedRows = useMemo(() => {
    return subjectRows.map((row) => {
      const percentage = Number(row.percentage ?? row.attendancePercentage ?? row.percent ?? 0)
      const total = Number(row.total ?? row.totalClasses ?? 0)
      const present = Number(row.present ?? row.presentCount ?? 0)
      const status = row.status ? String(row.status).toLowerCase() : getStatusByPercentage(percentage)

      return {
        ...row,
        percentage,
        total,
        present,
        absent: Number(row.absent ?? row.absentCount ?? 0),
        late: Number(row.late ?? row.lateCount ?? 0),
        status,
        classesNeeded: computeRequiredClasses(present, total),
        subjectId: row.subjectId || row.id || row._id,
      }
    })
  }, [subjectRows])

  const riskCount = normalizedRows.filter((row) => row.percentage < THRESHOLD).length
  const warningCount = normalizedRows.filter(
    (row) => row.status === 'warning' || row.status === 'critical'
  ).length

  const overallAttendance = Number(
    data?.overallAttendance ?? data?.overallPercentage ?? data?.stats?.overall ?? 0
  )

  const overallStatus = getStatusByPercentage(overallAttendance)
  const overallColor = getColorByStatus(overallStatus)

  const classesToday = Number(
    data?.timetable?.todayClasses ?? data?.todayClasses ?? data?.stats?.classesToday ?? 0
  )

  const trendPoints = Array.isArray(analytics?.trend)
    ? analytics.trend
    : Array.isArray(analytics?.last30Days)
      ? analytics.last30Days
      : []

  const chartData = {
    labels: trendPoints.map((point) => point.date || point.label || ''),
    datasets: [
      {
        label: 'Attendance %',
        data: trendPoints.map((point) => Number(point.percentage ?? point.value ?? 0)),
        borderColor: '#1F4E79',
        backgroundColor: 'rgba(31, 78, 121, 0.15)',
        tension: 0.35,
        fill: true,
        pointRadius: 2,
      },
      {
        label: `${THRESHOLD}% Threshold`,
        data: trendPoints.map(() => THRESHOLD),
        borderColor: '#C00000',
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        min: 0,
        max: 100,
      },
    },
    plugins: {
      legend: {
        position: 'top',
      },
    },
  }



  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <PageHeader
            title="Student Dashboard"
            subtitle="Track your attendance performance and stay above the minimum threshold."
          />

          {isError && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-700">
                Unable to load attendance data. Please try again.
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          )}

          {warningCount > 0 && (
            <AlertBanner
              type="warning"
              message={`${warningCount} subjects below ${THRESHOLD}%. Attend all remaining classes to recover.`}
            />
          )}

          {isLoading ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SkeletonCard height="7rem" />
                <SkeletonCard height="7rem" />
                <SkeletonCard height="7rem" />
                <SkeletonCard height="7rem" />
              </div>
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
                <SkeletonTable rows={6} />
              </div>
            </>
          ) : (
            <>
              <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm text-slate-500">Overall Attendance</p>
                  <p className={`mt-2 text-3xl font-bold ${overallColor.text}`}>
                    {overallAttendance.toFixed(1)}%
                  </p>
                  <StatusBadge status={overallStatus} variant="dot" />
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm text-slate-500">Total Classes Today</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">{classesToday}</p>
                  <p className="text-xs text-slate-500">From your timetable</p>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm text-slate-500">Subjects at Risk</p>
                  <div className="mt-2 flex items-center gap-2">
                    <p className="text-3xl font-bold text-red-700">{riskCount}</p>
                    {riskCount > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        Needs attention
                      </span>
                    )}
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm text-slate-500">Attendance Status</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">
                    {overallStatus.toUpperCase()}
                  </p>
                  <p className="text-xs text-slate-500">Current risk level</p>
                </article>
              </section>

              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Attendance Trend (Last 30 Days)</h2>
                {analyticsLoading ? (
                  <SkeletonCard height="300px" />
                ) : (
                  <div className="h-[300px]">
                    <Line data={chartData} options={chartOptions} />
                  </div>
                )}
              </section>


            </>
          )}
        </div>
      </main>
    </div>
  )
}
