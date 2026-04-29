import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { apiGet, apiPost } from '@/api/axiosInstance'

const toList = (value) => (Array.isArray(value) ? value : [])
const readData = (response) => response?.data || response || {}

const downloadCsv = (rows, filename) => {
  if (!rows.length) {
    toast.error('No rows to download')
    return
  }

  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? '').replaceAll('"', '""')}"`).join(',')),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const printTableAsPdf = (title, rows) => {
  if (!rows.length) {
    toast.error('No rows to print')
    return
  }

  const headers = Object.keys(rows[0])
  const tableRows = rows
    .map((row) => `<tr>${headers.map((header) => `<td style="border:1px solid #ddd;padding:8px;">${String(row[header] ?? '')}</td>`).join('')}</tr>`)
    .join('')

  const popup = window.open('', '_blank')
  if (!popup) {
    toast.error('Popup blocked. Enable popups to generate PDF.')
    return
  }

  popup.document.write(`
    <html>
      <head>
        <title>${title}</title>
      </head>
      <body style="font-family:Segoe UI,Arial,sans-serif;padding:16px;">
        <h2>${title}</h2>
        <table style="border-collapse:collapse;width:100%;">
          <thead><tr>${headers.map((header) => `<th style="border:1px solid #ddd;padding:8px;background:#f3f4f6;">${header}</th>`).join('')}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `)
  popup.document.close()
  popup.focus()
  popup.print()
}

export default function DeptReports() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [semester, setSemester] = useState('1')
  const [section, setSection] = useState('A')
  const [academicYear, setAcademicYear] = useState(() => {
    const year = new Date().getFullYear()
    return `${year}-${String((year + 1) % 100).padStart(2, '0')}`
  })
  const [threshold, setThreshold] = useState('75')
  const [examType, setExamType] = useState('internal1')

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const studentsQuery = useQuery({
    queryKey: ['hod-reports', 'students', semester, section],
    queryFn: () => apiGet('/students', { semester, section, page: 1, limit: 1000 }),
  })

  const lowAttendanceQuery = useQuery({
    queryKey: ['hod-reports', 'low-attendance', semester, section, threshold],
    queryFn: () => apiGet('/hod/low-attendance', { semester, section, threshold, page: 1, limit: 200 }),
  })

  const shortageMutation = useMutation({
    mutationFn: () =>
      apiPost('/hod/shortage-list', {
        semester: Number(semester),
        section: String(section).toUpperCase(),
        academicYear,
        examType,
        threshold: Number(threshold),
      }),
    onError: (error) => toast.error(error.message || 'Unable to generate shortage list'),
  })

  const shortageStudents = useMemo(() => {
    const payload = readData(shortageMutation.data)
    const shortageList = payload.shortageList || payload.data?.shortageList || payload
    return toList(shortageList?.students)
  }, [shortageMutation.data])

  const shortagePreviewRows = useMemo(
    () =>
      shortageStudents.map((student) => ({
        RollNumber: student.rollNumber,
        Name: student.name,
        OverallPercentage: student.overallPercentage,
        ShortSubjects: toList(student.subjectShortages)
          .map((item) => `${item.subjectCode || '-'} (${item.percentage}%)`)
          .join(' | '),
      })),
    [shortageStudents]
  )

  const eligibilityRows = useMemo(() => {
    const studentsPayload = readData(studentsQuery.data)
    const allStudents = toList(studentsPayload.data || studentsPayload.items || studentsPayload)
    const shortageIds = new Set(shortageStudents.map((student) => String(student.studentId || student._id || '')))

    return allStudents
      .filter((student) => !shortageIds.has(String(student._id || student.studentId || '')))
      .map((student) => ({
        RollNumber: student.rollNumber,
        Name: student.name,
        Percentage: student.attendanceSummary?.overallPercentage || 0,
        Status: 'Eligible',
      }))
  }, [shortageStudents, studentsQuery.data])

  const deptSummaryRows = useMemo(() => {
    const lowPayload = readData(lowAttendanceQuery.data)
    const classes = toList(lowPayload.data || lowPayload.items || lowPayload)

    return classes.map((item) => ({
      Semester: item.semester,
      Section: item.section,
      AtRiskStudents: toList(item.students).length,
      Threshold: Number(threshold),
    }))
  }, [lowAttendanceQuery.data, threshold])

  const isGeneratingShortage = shortageMutation.isPending

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Department Reports</h1>
            <p className="mt-1 text-sm text-slate-600">Generate shortage, eligibility and department attendance reports.</p>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              <select value={semester} onChange={(event) => setSemester(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {Array.from({ length: 8 }, (_, index) => index + 1).map((item) => (
                  <option key={item} value={String(item)}>Semester {item}</option>
                ))}
              </select>
              <select value={section} onChange={(event) => setSection(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {['A', 'B', 'C', 'D'].map((item) => (
                  <option key={item} value={item}>Section {item}</option>
                ))}
              </select>
              <input type="text" value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Academic year" />
              <input type="number" value={threshold} onChange={(event) => setThreshold(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Threshold" />
            </div>
          </section>

          <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Shortage List</h2>
              <p className="mt-1 text-sm text-slate-600">Preview and export students below threshold.</p>
              <select value={examType} onChange={(event) => setExamType(event.target.value)} className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="internal1">Internal 1</option>
                <option value="internal2">Internal 2</option>
                <option value="internal3">Internal 3</option>
                <option value="semester_end">Semester End</option>
              </select>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => shortageMutation.mutate()} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" disabled={isGeneratingShortage}>{isGeneratingShortage ? 'Generating...' : 'Generate Preview'}</button>
                <button type="button" onClick={() => printTableAsPdf('Shortage List', shortagePreviewRows)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Generate PDF</button>
                <button type="button" onClick={() => downloadCsv(shortagePreviewRows, `shortage-list-${semester}${section}.csv`)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Generate Excel</button>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Eligibility Report</h2>
              <p className="mt-1 text-sm text-slate-600">Export students currently eligible for exams.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => printTableAsPdf('Eligibility Report', eligibilityRows)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Generate PDF</button>
                <button type="button" onClick={() => downloadCsv(eligibilityRows, `eligibility-${semester}${section}.csv`)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Generate Excel</button>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Dept Attendance Summary</h2>
              <p className="mt-1 text-sm text-slate-600">Export semester/section level attendance risk summary.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => printTableAsPdf('Department Attendance Summary', deptSummaryRows)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Generate PDF</button>
                <button type="button" onClick={() => downloadCsv(deptSummaryRows, `dept-summary-${semester}${section}.csv`)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Generate Excel</button>
              </div>
            </article>
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Shortage Preview</h2>
            {shortagePreviewRows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">Generate shortage list to preview rows.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="py-2">Roll No</th>
                      <th className="py-2">Name</th>
                      <th className="py-2">Overall %</th>
                      <th className="py-2">Short Subjects</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortagePreviewRows.map((row) => (
                      <tr key={`${row.RollNumber}-${row.Name}`} className="border-b border-slate-100">
                        <td className="py-2 font-medium text-slate-900">{row.RollNumber}</td>
                        <td className="py-2">{row.Name}</td>
                        <td className="py-2">{row.OverallPercentage}%</td>
                        <td className="py-2">{row.ShortSubjects}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
