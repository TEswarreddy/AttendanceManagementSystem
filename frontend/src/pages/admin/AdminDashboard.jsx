import { useEffect, useMemo, useState, useCallback } from 'react'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { apiGet, apiPut } from '@/api/axiosInstance'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const toList = (value) => (Array.isArray(value) ? value : [])
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
const fmtDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

const normalizeItems = (response) => {
  const payload = response?.data || response || {}
  if (Array.isArray(payload.items)) return payload.items
  if (Array.isArray(payload.data)) return payload.data
  if (Array.isArray(payload)) return payload
  return []
}

export default function AdminDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedDept, setSelectedDept] = useState(null)
  const [thresholdModalOpen, setThresholdModalOpen] = useState(false)
  const [thresholdValue, setThresholdValue] = useState('75')
  const [applyMode, setApplyMode] = useState('all')
  const [overrideDeptId, setOverrideDeptId] = useState('')

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((current) => !current)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const overviewQuery = useQuery({
    queryKey: ['admin-dashboard', 'overview'],
    queryFn: useCallback(() => apiGet('/admin/dashboard'), []),
  })

  const statsQuery = useQuery({
    queryKey: ['admin-dashboard', 'stats'],
    queryFn: useCallback(() => apiGet('/admin/stats'), []),
  })

  const auditQuery = useQuery({
    queryKey: ['admin-dashboard', 'audit'],
    queryFn: useCallback(() => apiGet('/admin/audit-logs', { page: 1, limit: 10 }), []),
  })

  const rolesQuery = useQuery({
    queryKey: ['admin-dashboard', 'roles'],
    queryFn: useCallback(() => apiGet('/admin/roles', { page: 1, limit: 1000 }), []),
  })

  const thresholdMutation = useMutation({
    mutationFn: ({ threshold, appliesTo }) =>
      apiPut('/admin/threshold', {
        threshold,
        appliesTo,
      }),
    onSuccess: () => {
      toast.success('Threshold updated')
      setThresholdModalOpen(false)
      overviewQuery.refetch()
      statsQuery.refetch()
    },
    onError: (error) => toast.error(error.message || 'Unable to update threshold'),
  })

  const dashboard = useMemo(() => {
    const payload = overviewQuery.data?.data || overviewQuery.data || {}
    const deptBreakdown = toList(payload.deptBreakdown).map((item) => ({
      ...item,
      avgPercentage: toNumber(item.avgPercentage),
      studentsAtRisk: toNumber(item.studentsAtRisk),
    }))

    const avgFromDept =
      deptBreakdown.length > 0
        ? Number(
            (
              deptBreakdown.reduce((sum, item) => sum + toNumber(item.avgPercentage), 0) / deptBreakdown.length
            ).toFixed(2)
          )
        : toNumber(payload.todayAttendanceRate)

    return {
      currentThreshold: toNumber(payload.threshold, 75),
      totalDepts: toNumber(payload.totalDepts),
      totalStudents: toNumber(payload.totalStudents),
      totalFaculty: toNumber(payload.totalFaculty),
      avgCollege: avgFromDept,
      studentsAtRisk: toNumber(payload.studentsAtRisk),
      deptBreakdown,
    }
  }, [overviewQuery.data])

  const departments = useMemo(() => {
    const fromRoles = normalizeItems(rolesQuery.data)
      .map((user) => user?.profileId?.departmentId)
      .filter(Boolean)
      .map((dept) => ({
        _id: dept?._id || dept?.id || dept,
        name: dept?.code || dept?.name || String(dept),
      }))

    const fromChart = dashboard.deptBreakdown.map((item) => ({
      _id: item.departmentId || item.deptId || item.deptName,
      name: item.deptName,
    }))

    const merged = [...fromRoles, ...fromChart]
    const map = new Map()
    merged.forEach((dept) => {
      const key = String(dept._id || dept.name)
      if (!map.has(key)) {
        map.set(key, { _id: key, name: dept.name })
      }
    })

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [dashboard.deptBreakdown, rolesQuery.data])

  const sortedDeptRows = useMemo(
    () => [...dashboard.deptBreakdown].sort((a, b) => toNumber(a.avgPercentage) - toNumber(b.avgPercentage)),
    [dashboard.deptBreakdown]
  )

  const chartData = useMemo(
    () => ({
      labels: sortedDeptRows.map((item) => item.deptName),
      datasets: [
        {
          label: 'Avg Attendance %',
          data: sortedDeptRows.map((item) => Number(item.avgPercentage.toFixed(2))),
          backgroundColor: sortedDeptRows.map((item) => {
            const pct = toNumber(item.avgPercentage)
            if (pct < 70) return 'rgba(239, 68, 68, 0.75)'
            if (pct < 80) return 'rgba(245, 158, 11, 0.75)'
            return 'rgba(16, 185, 129, 0.75)'
          }),
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    }),
    [sortedDeptRows]
  )

  const chartOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event, elements) => {
      if (!elements?.length) return
      const index = elements[0].index
      const row = sortedDeptRows[index]
      if (row) {
        setSelectedDept(row)
      }
    },
    scales: {
      x: {
        min: 0,
        max: 100,
        ticks: { callback: (value) => `${value}%` },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.raw}%`,
        },
      },
    },
  }

  const recentAuditRows = useMemo(() => normalizeItems(auditQuery.data), [auditQuery.data])

  const monthlyTrend = useMemo(() => {
    const payload = statsQuery.data?.data || statsQuery.data || {}
    return toList(payload.monthWiseAttendanceRates).slice(-3)
  }, [statsQuery.data])

  const handleThresholdSave = () => {
    const nextValue = Number(thresholdValue)
    if (!Number.isFinite(nextValue) || nextValue < 1 || nextValue > 100) {
      toast.error('Threshold must be between 1 and 100')
      return
    }

    const appliesTo = applyMode === 'all' ? 'all' : overrideDeptId
    if (applyMode === 'department' && !appliesTo) {
      toast.error('Choose a department for override')
      return
    }

    thresholdMutation.mutate({ threshold: nextValue, appliesTo })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">College Control Panel</h1>
            <p className="mt-1 text-sm text-slate-600">Campus-wide attendance insights and governance controls.</p>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-500">Total Departments</p><p className="text-xl font-bold text-slate-900">{dashboard.totalDepts}</p></article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-500">Total Students</p><p className="text-xl font-bold text-slate-900">{dashboard.totalStudents}</p></article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-500">Total Faculty</p><p className="text-xl font-bold text-slate-900">{dashboard.totalFaculty}</p></article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-500">College Avg %</p><p className="text-xl font-bold text-slate-900">{dashboard.avgCollege.toFixed(2)}%</p></article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-500">Students at Risk</p><p className="text-xl font-bold text-rose-700">{dashboard.studentsAtRisk}</p></article>
            </div>
          </section>

          <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">Department Comparison</h2>
                <p className="text-xs text-slate-500">Worst performing department appears on top. Click bars to drill down.</p>
              </div>
              <div className="mt-4 h-[360px]">
                <Bar data={chartData} options={chartOptions} />
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Department Drilldown</h2>
              {!selectedDept ? (
                <p className="mt-3 text-sm text-slate-600">Select a department bar to view details.</p>
              ) : (
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="font-semibold text-slate-900">Department:</span> {selectedDept.deptName}</p>
                  <p><span className="font-semibold text-slate-900">Average:</span> {toNumber(selectedDept.avgPercentage).toFixed(2)}%</p>
                  <p><span className="font-semibold text-slate-900">At Risk:</span> {toNumber(selectedDept.studentsAtRisk)}</p>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last 3 Monthly Averages</p>
                <div className="mt-2 space-y-1 text-sm text-slate-700">
                  {monthlyTrend.length === 0 ? (
                    <p>No trend data yet.</p>
                  ) : (
                    monthlyTrend.map((item) => (
                      <p key={item.month}>{item.month}: {toNumber(item.attendanceRate).toFixed(2)}%</p>
                    ))
                  )}
                </div>
              </div>
            </article>
          </section>

          <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Threshold & Settings</h2>
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-600">Current threshold</p>
                <p className="text-3xl font-bold text-slate-900">{dashboard.currentThreshold.toFixed(2)}%</p>
                <button
                  type="button"
                  onClick={() => {
                    setThresholdValue(String(dashboard.currentThreshold))
                    setThresholdModalOpen(true)
                  }}
                  className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Change Threshold
                </button>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
              <div className="mt-3 space-y-2">
                {recentAuditRows.length === 0 ? (
                  <p className="text-sm text-slate-600">No recent activity found.</p>
                ) : (
                  recentAuditRows.map((row) => (
                    <div key={row._id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-medium text-slate-900">{row.reason || row.action || 'activity'}</p>
                      <p className="text-xs text-slate-600">By: {row.performedBy?.email || '-'} • {fmtDateTime(row.createdAt)}</p>
                    </div>
                  ))
                )}
              </div>
              <a href="/admin/role-management" className="mt-3 inline-block text-sm font-semibold text-primary-700 hover:underline">View Full Audit Log</a>
            </article>
          </section>
        </div>
      </main>

      {thresholdModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <section className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Change Attendance Threshold</h3>
            <p className="mt-1 text-sm text-slate-600">Choose whether this applies college-wide or as a per-department override.</p>

            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium text-slate-700">New Threshold (%)</span>
              <input
                type="number"
                min={1}
                max={100}
                value={thresholdValue}
                onChange={(event) => setThresholdValue(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">Applies to</p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="apply-mode"
                    checked={applyMode === 'all'}
                    onChange={() => setApplyMode('all')}
                  />
                  All Departments
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="apply-mode"
                    checked={applyMode === 'department'}
                    onChange={() => setApplyMode('department')}
                  />
                  Per-Department Override
                </label>
              </div>

              {applyMode === 'department' && (
                <select
                  value={overrideDeptId}
                  onChange={(event) => setOverrideDeptId(event.target.value)}
                  className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select department</option>
                  {departments.map((dept) => (
                    <option key={dept._id} value={dept._id}>{dept.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setThresholdModalOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleThresholdSave}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                disabled={thresholdMutation.isPending}
              >
                {thresholdMutation.isPending ? 'Saving...' : 'Confirm Change'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
