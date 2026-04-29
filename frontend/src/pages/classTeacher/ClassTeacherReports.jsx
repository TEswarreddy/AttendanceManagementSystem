import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { apiDownload, apiGet } from '@/api/axiosInstance'

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

const getSubjectOptions = (rawData) => {
  const payload = rawData?.data || rawData || {}
  const map = new Map()

  Object.values(payload).forEach((rows) => {
    if (!Array.isArray(rows)) return
    rows.forEach((row) => {
      const subjectId = row.subjectId
      if (!subjectId || map.has(String(subjectId))) return
      map.set(String(subjectId), {
        subjectId,
        subjectName: row.subjectName || row.subject?.name || 'Subject',
        subjectCode: row.subjectCode || row.subject?.code || '-',
      })
    })
  })

  return Array.from(map.values())
}

export default function ClassTeacherReports() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [subjectId, setSubjectId] = useState('')
  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [semester, setSemester] = useState('1')
  const [academicYear, setAcademicYear] = useState(getAcademicYear)

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const timetableQuery = useQuery({
    queryKey: ['ct-reports', 'timetable'],
    queryFn: () => apiGet('/faculty/timetable'),
  })

  const subjects = useMemo(() => getSubjectOptions(timetableQuery.data), [timetableQuery.data])

  const monthlyMutation = useMutation({
    mutationFn: ({ format, type }) =>
      apiDownload('/class-teacher/reports/monthly', {
        subjectId,
        month,
        year,
        type,
        format,
      }),
    onSuccess: (blob, vars) => {
      const ext = vars.format === 'pdf' ? 'pdf' : 'xlsx'
      downloadBlob(blob, `ct-monthly-${vars.type}-${year}-${month}.${ext}`)
      toast.success('Monthly report downloaded')
    },
    onError: (error) => toast.error(error.message || 'Unable to download monthly report'),
  })

  const semesterMutation = useMutation({
    mutationFn: ({ format, type }) =>
      apiDownload('/class-teacher/reports/semester', {
        subjectId,
        academicYear,
        semester,
        type,
        format,
      }),
    onSuccess: (blob, vars) => {
      const ext = vars.format === 'pdf' ? 'pdf' : 'xlsx'
      downloadBlob(blob, `ct-semester-${vars.type}-${academicYear}-sem${semester}.${ext}`)
      toast.success('Semester report downloaded')
    },
    onError: (error) => toast.error(error.message || 'Unable to download semester report'),
  })

  const disableDownloads = !subjectId

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Class Teacher Reports</h1>
            <p className="mt-1 text-sm text-slate-600">Monthly and semester report hub for subjects you teach.</p>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              <select
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select subject</option>
                {subjects.map((subject) => (
                  <option key={subject.subjectId} value={subject.subjectId}>
                    {subject.subjectCode} - {subject.subjectName}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={month}
                min="1"
                max="12"
                onChange={(event) => setMonth(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Month"
              />
              <input
                type="number"
                value={year}
                onChange={(event) => setYear(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Year"
              />
              <input
                type="text"
                value={academicYear}
                onChange={(event) => setAcademicYear(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Academic Year"
              />
            </div>

            <div className="mt-3 max-w-[220px]">
              <select
                value={semester}
                onChange={(event) => setSemester(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {Array.from({ length: 8 }, (_, index) => index + 1).map((item) => (
                  <option key={item} value={String(item)}>Semester {item}</option>
                ))}
              </select>
            </div>
          </section>

          <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Monthly Report</h2>
              <p className="mt-1 text-sm text-slate-600">Download monthly attendance report (PDF/Excel).</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={disableDownloads || monthlyMutation.isPending} onClick={() => monthlyMutation.mutate({ format: 'pdf', type: 'full' })} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300">Monthly PDF</button>
                <button type="button" disabled={disableDownloads || monthlyMutation.isPending} onClick={() => monthlyMutation.mutate({ format: 'excel', type: 'full' })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:text-slate-400">Monthly Excel</button>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Semester Report</h2>
              <p className="mt-1 text-sm text-slate-600">Generate semester report for selected subject.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={disableDownloads || semesterMutation.isPending} onClick={() => semesterMutation.mutate({ format: 'pdf', type: 'full' })} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300">Semester PDF</button>
                <button type="button" disabled={disableDownloads || semesterMutation.isPending} onClick={() => semesterMutation.mutate({ format: 'excel', type: 'full' })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:text-slate-400">Semester Excel</button>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Shortage List</h2>
              <p className="mt-1 text-sm text-slate-600">Download below-threshold list for internal exam preparation.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={disableDownloads || monthlyMutation.isPending}
                  onClick={() => monthlyMutation.mutate({ format: 'excel', type: 'below' })}
                  className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
                >
                  Download Shortage List
                </button>
              </div>
            </article>
          </section>
        </div>
      </main>
    </div>
  )
}
