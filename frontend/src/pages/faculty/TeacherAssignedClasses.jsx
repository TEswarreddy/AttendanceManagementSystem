import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@/lib/dataClientHooks.jsx'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import PageHeader from '@/components/shared/PageHeader'
import Spinner from '@/components/shared/Spinner'
import { facultyApi } from '@/api/facultyApi'

const DAY_OPTIONS = [
  { label: 'All Days', value: '' },
  { label: 'Monday', value: 'Monday' },
  { label: 'Tuesday', value: 'Tuesday' },
  { label: 'Wednesday', value: 'Wednesday' },
  { label: 'Thursday', value: 'Thursday' },
  { label: 'Friday', value: 'Friday' },
  { label: 'Saturday', value: 'Saturday' },
]

const SUBJECT_TYPE_OPTIONS = [
  { label: 'All Types', value: '' },
  { label: 'Theory', value: 'theory' },
  { label: 'Lab', value: 'lab' },
  { label: 'Elective', value: 'elective' },
]

const SORT_OPTIONS = [
  { label: 'Day', value: 'day' },
  { label: 'Period', value: 'periodNumber' },
  { label: 'Subject', value: 'subjectName' },
  { label: 'Subject Code', value: 'subjectCode' },
  { label: 'Semester', value: 'semester' },
  { label: 'Section', value: 'section' },
  { label: 'Department', value: 'departmentName' },
  { label: 'Start Time', value: 'startTime' },
]

const toSafeArray = (value) => (Array.isArray(value) ? value : [])

const getUniqueOptions = (rows, key, formatLabel) => {
  const uniqueValues = [...new Set(rows.map((row) => row?.[key]).filter(Boolean))]
  return uniqueValues
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
    .map((value) => ({ label: formatLabel ? formatLabel(value) : String(value), value: String(value) }))
}

export default function TeacherAssignedClasses() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [day, setDay] = useState('')
  const [semester, setSemester] = useState('')
  const [section, setSection] = useState('')
  const [subjectType, setSubjectType] = useState('')
  const [sortBy, setSortBy] = useState('day')
  const [sortOrder, setSortOrder] = useState('asc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const listQuery = useQuery({
    queryKey: ['faculty-assigned-classes', { search, day, semester, section, subjectType, sortBy, sortOrder, page, limit }],
    queryFn: () =>
      facultyApi.getAssignedClasses({
        search,
        day,
        semester: semester || undefined,
        section: section || undefined,
        subjectType,
        sortBy,
        sortOrder,
        page,
        limit,
      }),
    select: (response) => ({ rows: toSafeArray(response?.data), meta: response?.meta || {} }),
  })

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      listQuery.refetch().catch(() => {
        // Ignore interval refresh errors to keep UI responsive.
      })
    }, 60000)

    return () => window.clearInterval(intervalId)
  }, [listQuery.refetch])

  const rows = listQuery.data?.rows || []
  const meta = listQuery.data?.meta || {}

  const total = Number(meta.total || 0)
  const totalPages = Number(meta.totalPages || 1)
  const currentPage = Number(meta.page || page)

  useEffect(() => {
    if (currentPage !== page) {
      setPage(currentPage)
    }
  }, [currentPage, page])

  const allRowsQuery = useQuery({
    queryKey: ['faculty-assigned-classes-filter-options'],
    queryFn: () => facultyApi.getAssignedClasses({ page: 1, limit: 500 }),
    staleTime: 10 * 60 * 1000,
    select: (response) => toSafeArray(response?.data),
  })

  const allRows = allRowsQuery.data || []

  const semesterOptions = useMemo(
    () => [{ label: 'All Semesters', value: '' }, ...getUniqueOptions(allRows, 'semester', (value) => `Semester ${value}`)],
    [allRows]
  )

  const sectionOptions = useMemo(
    () => [{ label: 'All Sections', value: '' }, ...getUniqueOptions(allRows, 'section')],
    [allRows]
  )

  const resetFilters = () => {
    setSearch('')
    setDay('')
    setSemester('')
    setSection('')
    setSubjectType('')
    setSortBy('day')
    setSortOrder('asc')
    setPage(1)
    setLimit(10)
  }

  const onSearchChange = (event) => {
    setSearch(event.target.value)
    setPage(1)
  }

  const onFilterChange = (setter) => (event) => {
    setter(event.target.value)
    setPage(1)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <PageHeader
            title="Assigned Classes"
            subtitle="View all your class assignments with live refresh, filtering, and pagination."
            actions={[
              {
                label: listQuery.isFetching ? 'Refreshing...' : 'Refresh',
                onClick: () => listQuery.refetch(),
                variant: 'secondary',
              },
              {
                label: 'Reset Filters',
                onClick: resetFilters,
                variant: 'secondary',
              },
            ]}
          />

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Search</span>
                <input
                  type="text"
                  value={search}
                  onChange={onSearchChange}
                  placeholder="Subject, code, room, section..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none"
                />
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Day</span>
                <select
                  value={day}
                  onChange={onFilterChange(setDay)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none"
                >
                  {DAY_OPTIONS.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Semester</span>
                <select
                  value={semester}
                  onChange={onFilterChange(setSemester)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none"
                >
                  {semesterOptions.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Section</span>
                <select
                  value={section}
                  onChange={onFilterChange(setSection)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none"
                >
                  {sectionOptions.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Subject Type</span>
                <select
                  value={subjectType}
                  onChange={onFilterChange(setSubjectType)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none"
                >
                  {SUBJECT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Sort By</span>
                <select
                  value={sortBy}
                  onChange={onFilterChange(setSortBy)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Order</span>
                <select
                  value={sortOrder}
                  onChange={onFilterChange(setSortOrder)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Rows per page</span>
                <select
                  value={String(limit)}
                  onChange={(event) => {
                    setLimit(Number(event.target.value) || 10)
                    setPage(1)
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none"
                >
                  {[10, 20, 50].map((size) => (
                    <option key={size} value={String(size)}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              {listQuery.isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner />
                </div>
              ) : rows.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  No assigned classes found for current filters.
                </div>
              ) : (
                <table className="min-w-full divide-y divide-slate-200 bg-white">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Day', 'Period', 'Time', 'Subject', 'Code', 'Type', 'Dept', 'Semester', 'Section', 'Room'].map((header) => (
                        <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {rows.map((row, index) => (
                      <tr key={`${row.subjectId}-${row.day}-${row.periodNumber}-${row.section}-${index}`} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-700">{row.day || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{row.periodNumber || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{row.startTime && row.endTime ? `${row.startTime} - ${row.endTime}` : '-'}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{row.subjectName || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{row.subjectCode || '-'}</td>
                        <td className="px-4 py-3 text-sm capitalize text-slate-700">{row.subjectType || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{row.departmentName || row.departmentCode || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{row.semester || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{row.section || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{row.roomNo || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing {rows.length} of {total} assigned classes
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage <= 1}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="min-w-24 text-center">
                  Page {currentPage} / {Math.max(1, totalPages)}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
