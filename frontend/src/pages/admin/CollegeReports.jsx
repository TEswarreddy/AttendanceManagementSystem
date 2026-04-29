import { useEffect, useMemo, useState, useCallback } from 'react'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import api, { apiGet, apiPost } from '@/api/axiosInstance'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'

const toList = (value) => (Array.isArray(value) ? value : [])

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const getAcademicYear = () => {
  const year = new Date().getFullYear()
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`
}

const dangerNote = 'Verify format with your accreditation coordinator'

export default function CollegeReports() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [filters, setFilters] = useState({
    departmentId: '',
    semester: '1',
    academicYear: getAcademicYear(),
  })

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((current) => !current)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const rolesQuery = useQuery({
    queryKey: ['college-reports', 'roles'],
    queryFn: useCallback(() => apiGet('/admin/roles', { page: 1, limit: 1000 }), []),
  })

  const departments = useMemo(() => {
    const payload = rolesQuery.data?.data || rolesQuery.data || {}
    const users = toList(payload.items || payload.data || payload)
    const map = new Map()

    users.forEach((user) => {
      const dept = user?.profileId?.departmentId
      const id = dept?._id || dept?.id || dept
      if (!id) return
      const key = String(id)
      if (!map.has(key)) {
        map.set(key, {
          _id: key,
          name: dept?.code || dept?.name || key,
        })
      }
    })

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [rolesQuery.data])

  const collegeReportMutation = useMutation({
    mutationFn: async ({ type, format }) => {
      const response = await api.get('/admin/reports/college', {
        params: {
          type,
          format,
          departmentId: filters.departmentId || undefined,
          semester: filters.semester || undefined,
          academicYear: filters.academicYear || undefined,
        },
        responseType: 'blob',
      })
      return { blob: response, type, format }
    },
    onSuccess: ({ blob, type, format }) => {
      const ext = format === 'excel' ? 'xlsx' : 'pdf'
      downloadBlob(blob, `college-${type}.${ext}`)
      toast.success('Report downloaded')
    },
    onError: (error) => toast.error(error.message || 'Unable to download report'),
  })

  const eligibilityMutation = useMutation({
    mutationFn: async ({ format }) => {
      const response = await api.post(
        '/admin/eligibility',
        {
          departmentId: filters.departmentId || undefined,
          semester: Number(filters.semester),
          academicYear: filters.academicYear,
        },
        {
          params: { format },
          responseType: 'blob',
        }
      )
      return { blob: response, format }
    },
    onSuccess: ({ blob, format }) => {
      const ext = format === 'excel' ? 'xlsx' : 'pdf'
      downloadBlob(blob, `eligibility-college.${ext}`)
      toast.success('Eligibility report downloaded')
    },
    onError: (error) => toast.error(error.message || 'Unable to download eligibility report'),
  })

  const shortageMutation = useMutation({
    mutationFn: async ({ format }) => {
      const response = await api.get('/admin/reports/college', {
        params: {
          type: 'shortage',
          format,
          departmentId: filters.departmentId || undefined,
          semester: filters.semester || undefined,
          academicYear: filters.academicYear || undefined,
        },
        responseType: 'blob',
      })
      return { blob: response, format }
    },
    onSuccess: ({ blob, format }) => {
      const ext = format === 'excel' ? 'xlsx' : 'pdf'
      downloadBlob(blob, `shortage-college.${ext}`)
      toast.success('Shortage report downloaded')
    },
    onError: (error) => toast.error(error.message || 'Unable to download shortage report'),
  })

  const naacMutation = useMutation({
    mutationFn: async () => {
      const response = await api.get('/admin/reports/college', {
        params: { type: 'attendance', format: 'excel' },
        responseType: 'blob',
      })
      return response
    },
    onSuccess: (blob) => {
      downloadBlob(blob, 'naac-attendance-format.xlsx')
      toast.success('NAAC format downloaded')
    },
    onError: (error) => toast.error(error.message || 'Unable to download NAAC format'),
  })

  const nbaMutation = useMutation({
    mutationFn: async ({ format }) => {
      const response = await api.get('/admin/reports/college', {
        params: { type: 'attendance', format },
        responseType: 'blob',
      })
      return { blob: response, format }
    },
    onSuccess: ({ blob, format }) => {
      const ext = format === 'excel' ? 'xlsx' : 'pdf'
      downloadBlob(blob, `nba-attendance-format.${ext}`)
      toast.success('NBA format downloaded')
    },
    onError: (error) => toast.error(error.message || 'Unable to download NBA format'),
  })

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">College Reports</h1>
            <p className="mt-1 text-sm text-slate-600">Top-level report generation for principal and admin users.</p>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Department</span>
                <select
                  value={filters.departmentId}
                  onChange={(event) => setFilters((current) => ({ ...current, departmentId: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="">All Departments</option>
                  {departments.map((dept) => (
                    <option key={dept._id} value={dept._id}>{dept.name}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Semester</span>
                <select
                  value={filters.semester}
                  onChange={(event) => setFilters((current) => ({ ...current, semester: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {Array.from({ length: 8 }, (_, index) => index + 1).map((semester) => (
                    <option key={semester} value={String(semester)}>Semester {semester}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Academic Year</span>
                <input
                  type="text"
                  value={filters.academicYear}
                  onChange={(event) => setFilters((current) => ({ ...current, academicYear: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
          </section>

          <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">1. College-wide Attendance Summary</h2>
              <p className="mt-1 text-sm text-slate-600">Consolidated college attendance report.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => collegeReportMutation.mutate({ type: 'attendance', format: 'pdf' })} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" disabled={collegeReportMutation.isPending}>PDF</button>
                <button type="button" onClick={() => collegeReportMutation.mutate({ type: 'attendance', format: 'excel' })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" disabled={collegeReportMutation.isPending}>Excel</button>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">2. All-dept Eligibility Report</h2>
              <p className="mt-1 text-sm text-slate-600">Eligibility status across departments.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => eligibilityMutation.mutate({ format: 'pdf' })} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" disabled={eligibilityMutation.isPending}>PDF</button>
                <button type="button" onClick={() => eligibilityMutation.mutate({ format: 'excel' })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" disabled={eligibilityMutation.isPending}>Excel</button>
              </div>
            </article>

            <article className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">3. NAAC Attendance Format</h2>
              <p className="mt-1 text-sm font-semibold text-amber-900">{dangerNote}</p>
              <div className="mt-3">
                <button type="button" onClick={() => naacMutation.mutate()} className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white" disabled={naacMutation.isPending}>Excel</button>
              </div>
            </article>

            <article className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">4. NBA Attendance Format</h2>
              <p className="mt-1 text-sm font-semibold text-amber-900">{dangerNote}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => nbaMutation.mutate({ format: 'pdf' })} className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white" disabled={nbaMutation.isPending}>PDF</button>
                <button type="button" onClick={() => nbaMutation.mutate({ format: 'excel' })} className="rounded-lg border border-amber-700 px-3 py-2 text-sm font-semibold text-amber-900" disabled={nbaMutation.isPending}>Excel</button>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
              <h2 className="text-lg font-semibold text-slate-900">5. Shortage List — College-wide</h2>
              <p className="mt-1 text-sm text-slate-600">Students below attendance threshold across campus.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => shortageMutation.mutate({ format: 'pdf' })} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" disabled={shortageMutation.isPending}>PDF</button>
                <button type="button" onClick={() => shortageMutation.mutate({ format: 'excel' })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" disabled={shortageMutation.isPending}>Excel</button>
              </div>
            </article>
          </section>
        </div>
      </main>
    </div>
  )
}
