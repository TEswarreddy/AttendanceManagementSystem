import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownTrayIcon,
  DocumentArrowDownIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  UserGroupIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  BoltIcon,
  ChartBarSquareIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import PageHeader from '@/components/shared/PageHeader'
import DataTable from '@/components/shared/DataTable'
import { useQuery, useQueryClient } from '@/lib/dataClientHooks'
import attendanceCoordinatorApi from '@/api/attendanceCoordinatorApi'

const FILTER_DEFAULTS = {
  academicYear: '',
  semester: '',
  section: '',
  fromDate: '',
  toDate: '',
}

const quickActions = [
  { key: 'refresh', label: 'Refresh data', icon: ArrowPathIcon },
  { key: 'export', label: 'Export Excel', icon: ArrowDownTrayIcon },
]

const StatCard = ({ label, value, hint, icon: Icon, accent = 'from-primary-500 to-primary-700' }) => (
  <article className="group relative overflow-hidden rounded-2xl border border-white/60 bg-white/85 p-4 shadow-lg shadow-slate-200/60 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary-100/70 backdrop-blur">
    <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${accent} opacity-15 blur-2xl`} />
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </div>
      <span className="rounded-xl bg-slate-100 p-2 text-slate-600">
        <Icon className="h-5 w-5" />
      </span>
    </div>
  </article>
)

const MiniBarChart = ({ title, rows = [], xKey, yKey }) => (
  <section className="rounded-2xl border border-white bg-white/90 p-4 shadow-lg shadow-slate-200/60 backdrop-blur">
    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    <div className="mt-4 space-y-3">
      {rows.slice(0, 8).map((row) => {
        const rawValue = Number(row[yKey] || 0)
        const safeValue = Math.min(100, Math.max(0, rawValue))

        return (
          <div key={`${row[xKey]}-${row[yKey]}`}>
            <div className="mb-1.5 flex justify-between text-xs text-slate-600">
              <span>{row[xKey]}</span>
              <span className="font-semibold text-slate-700">{rawValue.toFixed(2)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-gradient-to-r from-primary-500 to-cyan-500 transition-all duration-700" style={{ width: `${safeValue}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  </section>
)

function Filters({ filters, setFilters }) {
  return (
    <section className="rounded-2xl border border-white bg-white/85 p-4 shadow-sm backdrop-blur">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Object.keys(FILTER_DEFAULTS).map((key) => (
          <label key={key} className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>{key.replace(/([A-Z])/g, ' $1')}</span>
            <input
              type={key.includes('Date') ? 'date' : 'text'}
              placeholder={key}
              value={filters[key]}
              onChange={(e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            />
          </label>
        ))}
      </div>
    </section>
  )
}

const DownloadCard = ({ title, description, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full rounded-2xl border border-white/60 bg-white/85 p-4 text-left shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
  >
    <div className="flex items-center gap-3">
      <span className="rounded-xl bg-primary-50 p-2 text-primary-700">
        <DocumentArrowDownIcon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </div>
  </button>
)

export default function AttendanceCoordinatorModule({ section = 'dashboard' }) {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState(FILTER_DEFAULTS)

  const dashboardQuery = useQuery({ queryKey: ['ac-dashboard', filters], queryFn: async () => (await attendanceCoordinatorApi.getDashboard(filters)).data?.data || {} })
  const classesQuery = useQuery({ queryKey: ['ac-classes', filters], queryFn: async () => (await attendanceCoordinatorApi.getDepartmentClasses(filters)).data?.data || { rows: [] } })
  const classReportQuery = useQuery({ queryKey: ['ac-class-reports', filters], queryFn: async () => (await attendanceCoordinatorApi.getClassReports(filters)).data?.data || { rows: [] } })
  const studentReportQuery = useQuery({ queryKey: ['ac-student-reports', filters], queryFn: async () => (await attendanceCoordinatorApi.getStudentReports(filters)).data?.data || { rows: [] } })
  const semesterQuery = useQuery({ queryKey: ['ac-semester', filters], queryFn: async () => (await attendanceCoordinatorApi.getSemesterReports(filters)).data?.data || { rows: [] } })
  const monthlyQuery = useQuery({ queryKey: ['ac-monthly', filters], queryFn: async () => (await attendanceCoordinatorApi.getMonthlyReports(filters)).data?.data || { rows: [] } })
  const belowQuery = useQuery({ queryKey: ['ac-below', filters], queryFn: async () => (await attendanceCoordinatorApi.getBelow75(filters)).data?.data || { rows: [] } })

  const isLoading = dashboardQuery.isLoading || classesQuery.isLoading || studentReportQuery.isLoading
  const isFetching = dashboardQuery.isFetching || classesQuery.isFetching || classReportQuery.isFetching || studentReportQuery.isFetching

  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['ac-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['ac-classes'] })
      queryClient.invalidateQueries({ queryKey: ['ac-class-reports'] })
      queryClient.invalidateQueries({ queryKey: ['ac-student-reports'] })
      queryClient.invalidateQueries({ queryKey: ['ac-semester'] })
      queryClient.invalidateQueries({ queryKey: ['ac-monthly'] })
      queryClient.invalidateQueries({ queryKey: ['ac-below'] })
    }

    refresh()
    const intervalId = window.setInterval(refresh, 30000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
    }
  }, [queryClient])

  const studentColumns = useMemo(
    () => [
      { key: 'rollNumber', label: 'Roll No', sortable: true },
      { key: 'name', label: 'Name', sortable: true },
      { key: 'semester', label: 'Semester', sortable: true },
      { key: 'section', label: 'Section', sortable: true },
      { key: 'totalPresent', label: 'Total Present', sortable: true },
      { key: 'totalAbsent', label: 'Total Absent', sortable: true },
      { key: 'attendancePercentage', label: 'Attendance %', sortable: true },
      {
        key: 'defaulterStatus',
        label: 'Status',
        sortable: true,
        render: (row) => (
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${String(row.defaulterStatus || '').toLowerCase().includes('defaulter') ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {row.defaulterStatus || '-'}
          </span>
        ),
      },
    ],
    []
  )

  const classColumns = useMemo(
    () => [
      { key: 'className', label: 'Class', sortable: true },
      { key: 'academicYear', label: 'Academic Year', sortable: true },
      { key: 'year', label: 'Year', sortable: true },
      { key: 'semester', label: 'Semester', sortable: true },
      { key: 'section', label: 'Section', sortable: true },
      { key: 'studentsCount', label: 'Students', sortable: true },
      { key: 'averageAttendancePercentage', label: 'Attendance %', sortable: true },
    ],
    []
  )

  const extractFilename = (contentDisposition, format) => {
    const fallback = `class-wise-attendance.${format === 'excel' ? 'xlsx' : format}`
    if (!contentDisposition) return fallback

    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
    if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1])
    const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i)
    if (quotedMatch?.[1]) return quotedMatch[1]
    const simpleMatch = contentDisposition.match(/filename=([^;]+)/i)
    if (simpleMatch?.[1]) return simpleMatch[1].trim()

    return fallback
  }

  const startDownload = async (format) => {
    try {
      const response = await attendanceCoordinatorApi.downloadReports(filters, format)
      const blob = new Blob([response.data], {
        type:
          response.headers['content-type'] ||
          (format === 'pdf'
            ? 'application/pdf'
            : format === 'csv'
              ? 'text/csv;charset=utf-8'
              : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      })

      const downloadUrl = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = downloadUrl
      anchor.download = extractFilename(response.headers['content-disposition'], format)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(downloadUrl)
      toast.success(`${String(format).toUpperCase()} report downloaded`)
    } catch (error) {
      toast.error(error?.message || 'Unable to download report. Please try again.')
    }
  }

  const metrics = dashboardQuery.data || {}
  const safeNumber = (value) => (value == null || value === '' ? 0 : value)
  const attendanceToday = Number(metrics.todayAttendancePercentage || 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance Coordinator"
        subtitle="Track department attendance, identify defaulters, and export polished reports in one place."
        eyebrow="Coordinator Console"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {quickActions.map((item) => {
              const Icon = item.icon
              const onClick = item.key === 'refresh' ? () => queryClient.invalidateQueries() : () => startDownload('excel')

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={onClick}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    item.key === 'refresh'
                      ? 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                      : 'bg-primary-600 text-white hover:bg-primary-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </div>
        }
      />

      {isFetching ? <p className="animate-pulse text-xs font-medium text-slate-500">Refreshing latest data…</p> : null}

      <Filters filters={filters} setFilters={setFilters} />

      {(section === 'dashboard' || section === 'reports') && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Department Classes" value={safeNumber(metrics.totalDepartmentClasses)} hint="Managed this term" icon={BuildingOffice2Icon} accent="from-violet-500 to-indigo-600" />
          <StatCard label="Total Students" value={safeNumber(metrics.totalStudents)} hint="Across selected classes" icon={UserGroupIcon} accent="from-cyan-500 to-blue-600" />
          <StatCard label="Today Attendance" value={`${attendanceToday}%`} hint="Live attendance rate" icon={CheckCircleIcon} accent="from-emerald-500 to-teal-600" />
          <StatCard label="Classes Below 75%" value={safeNumber(metrics.classesBelow75)} hint="Needs follow-up" icon={ExclamationTriangleIcon} accent="from-rose-500 to-pink-600" />
          <StatCard label="Monthly Attendance" value={`${safeNumber(metrics.monthlyAttendancePercentage)}%`} hint="Average for current month" icon={ChartBarSquareIcon} accent="from-fuchsia-500 to-violet-600" />
          <StatCard label="Defaulters Count" value={safeNumber(metrics.defaultersCount)} hint="Potential risk list" icon={UserGroupIcon} accent="from-amber-500 to-orange-600" />
          <StatCard label="Downloads Count" value={safeNumber(metrics.downloadsCount)} hint="Reports exported" icon={ArrowDownTrayIcon} accent="from-sky-500 to-cyan-600" />
          <StatCard label="Action Health" value={attendanceToday >= 75 ? 'Healthy' : 'Attention'} hint="Daily threshold status" icon={BoltIcon} accent="from-primary-500 to-blue-700" />
        </div>
      )}

      {(section === 'dashboard' || section === 'reports') ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <MiniBarChart title="Monthly Attendance Trend" rows={metrics.charts?.monthlyAttendanceTrend || monthlyQuery.data?.rows || []} xKey="month" yKey="percentage" />
          <MiniBarChart title="Semester Comparison" rows={metrics.charts?.semesterComparison || semesterQuery.data?.rows || []} xKey="semester" yKey="attendancePercentage" />
        </div>
      ) : null}

      {(section === 'classes' || section === 'dashboard' || section === 'reports') ? (
        <DataTable isLoading={isLoading} data={classReportQuery.data?.rows || classesQuery.data?.rows || []} columns={classColumns} emptyMessage="No department classes found" />
      ) : null}

      {(section === 'reports' || section === 'dashboard' || section === 'defaulters') ? (
        <DataTable
          isLoading={isLoading}
          data={section === 'defaulters' ? belowQuery.data?.rows || [] : studentReportQuery.data?.rows || []}
          columns={studentColumns}
          emptyMessage="No student report rows available"
        />
      ) : null}

      {section === 'downloads' ? (
        <section className="rounded-2xl border border-white/60 bg-white/90 p-5 shadow-lg shadow-slate-200/50 backdrop-blur">
          <h2 className="text-lg font-semibold text-slate-900">Download Class-wise Reports</h2>
          <p className="mt-1 text-sm text-slate-600">Download consolidated class attendance reports in your preferred format.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <DownloadCard title="Download PDF" description="Printable class-wise attendance summary" onClick={() => startDownload('pdf')} />
            <DownloadCard title="Download Excel" description="Detailed spreadsheet for analysis" onClick={() => startDownload('excel')} />
            <DownloadCard title="Download CSV" description="Quick export for data processing" onClick={() => startDownload('csv')} />
          </div>
        </section>
      ) : null}

      {section === 'settings' ? (
        <section className="rounded-2xl border border-white/60 bg-white/90 p-6 shadow-lg shadow-slate-200/50 backdrop-blur">
          <h3 className="text-base font-semibold text-slate-900">Coordinator Settings</h3>
          <p className="mt-2 text-sm text-slate-600">Configure alert notifications for low attendance students and trigger monthly report alerts.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <button
              onClick={() =>
                attendanceCoordinatorApi.pushAlert({ type: 'Low attendance students', message: 'Low attendance students alert generated.' }).then(() => {
                  toast.success('Low attendance alert sent')
                  queryClient.invalidateQueries()
                })
              }
              className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow hover:opacity-95"
            >
              Send Low Attendance Alert
            </button>
            <button
              onClick={() =>
                attendanceCoordinatorApi.pushAlert({ type: 'Monthly report ready', message: 'Monthly report is ready for review.' }).then(() => {
                  toast.success('Monthly report alert sent')
                  queryClient.invalidateQueries()
                })
              }
              className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:opacity-95"
            >
              Send Monthly Report Alert
            </button>
            <button
              onClick={() =>
                attendanceCoordinatorApi.pushAlert({ type: 'Defaulters updated', message: 'Defaulters list has been updated.' }).then(() => {
                  toast.success('Defaulter alert sent')
                  queryClient.invalidateQueries()
                })
              }
              className="rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:opacity-95"
            >
              Send Defaulter Update Alert
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
