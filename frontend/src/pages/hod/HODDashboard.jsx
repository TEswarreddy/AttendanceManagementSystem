import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@/lib/dataClientHooks.jsx'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { apiGet } from '@/api/axiosInstance'

const toList = (value) => (Array.isArray(value) ? value : [])
const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const readData = (response) => response?.data || response || {}
const readItems = (response) => {
  const payload = readData(response)
  if (Array.isArray(payload.data)) return payload.data
  if (Array.isArray(payload.items)) return payload.items
  if (Array.isArray(payload)) return payload
  return []
}
const readMeta = (response) => {
  const payload = readData(response)
  return payload.meta || response?.meta || {}
}

export default function HODDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const facultyQuery = useQuery({
    queryKey: ['hod-dashboard', 'faculty'],
    queryFn: () => apiGet('/hod/faculty', { page: 1, limit: 200 }),
  })

  const studentsQuery = useQuery({
    queryKey: ['hod-dashboard', 'students'],
    queryFn: () => apiGet('/students', { page: 1, limit: 1000 }),
  })

  const subjectsQuery = useQuery({
    queryKey: ['hod-dashboard', 'subjects'],
    queryFn: () => apiGet('/subjects'),
  })

  const lowAttendanceQuery = useQuery({
    queryKey: ['hod-dashboard', 'low-attendance'],
    queryFn: () => apiGet('/hod/low-attendance', { page: 1, limit: 200, threshold: 75 }),
  })

  const stats = useMemo(() => {
    const facultyRows = readItems(facultyQuery.data)
    const studentRows = readItems(studentsQuery.data)
    const subjectRows = readItems(subjectsQuery.data)
    const lowClasses = readItems(lowAttendanceQuery.data)

    const atRisk = lowClasses.reduce((sum, item) => sum + toList(item.students).length, 0)

    const avgAttendance = studentRows.length
      ? studentRows.reduce((sum, item) => sum + toNumber(item?.attendanceSummary?.overallPercentage), 0) / studentRows.length
      : 0

    return {
      faculty: toNumber(readMeta(facultyQuery.data).total) || facultyRows.length,
      students: toNumber(readMeta(studentsQuery.data).total) || studentRows.length,
      subjects: subjectRows.length,
      avgAttendance: Number(avgAttendance.toFixed(1)),
      atRisk,
    }
  }, [facultyQuery.data, lowAttendanceQuery.data, studentsQuery.data, subjectsQuery.data])

  const classBars = useMemo(() => {
    const totalByClass = new Map()

    readItems(studentsQuery.data).forEach((student) => {
      const key = `S${student.semester || '-'}-${String(student.section || '-').toUpperCase()}`
      totalByClass.set(key, (totalByClass.get(key) || 0) + 1)
    })

    const atRiskByClass = new Map()
    readItems(lowAttendanceQuery.data).forEach((entry) => {
      const key = `S${entry.semester || '-'}-${String(entry.section || '-').toUpperCase()}`
      atRiskByClass.set(key, toList(entry.students).length)
    })

    return Array.from(totalByClass.entries())
      .map(([classKey, total]) => {
        const atRisk = atRiskByClass.get(classKey) || 0
        const score = total > 0 ? Number(((1 - atRisk / total) * 100).toFixed(1)) : 0
        return {
          classKey,
          score,
        }
      })
      .sort((a, b) => a.classKey.localeCompare(b.classKey))
  }, [lowAttendanceQuery.data, studentsQuery.data])

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Department Overview</h1>
            <p className="mt-1 text-sm text-slate-600">Approval-based attendance editing has been removed. Faculty now edit attendance directly.</p>

            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-500">Faculty</p><p className="text-xl font-bold text-slate-900">{stats.faculty}</p></article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-500">Students</p><p className="text-xl font-bold text-slate-900">{stats.students}</p></article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-500">Subjects</p><p className="text-xl font-bold text-slate-900">{stats.subjects}</p></article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-500">Avg Attendance</p><p className="text-xl font-bold text-slate-900">{stats.avgAttendance}%</p></article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-500">At Risk</p><p className="text-xl font-bold text-rose-700">{stats.atRisk}</p></article>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-800">Department Attendance by Semester/Section</p>
              {classBars.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">No chart data available.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {classBars.map((bar) => (
                    <div key={bar.classKey} className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>{bar.classKey}</span>
                        <span>{bar.score}%</span>
                      </div>
                      <div className="h-3 w-full rounded-full bg-slate-100">
                        <div
                          className={`h-3 rounded-full ${bar.score >= 85 ? 'bg-emerald-500' : bar.score >= 75 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          style={{ width: `${Math.max(4, Math.min(100, bar.score))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Link to="/faculty/edit-attendance" className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">Faculty Edit Attendance</Link>
              <Link to="/hod/reports" className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">Department Reports</Link>
              <Link to="/hod/faculty" className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">Manage Faculty</Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
