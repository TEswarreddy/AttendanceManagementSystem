import { useEffect, useMemo, useState, useCallback } from 'react'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import {
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import PageHeader from '@/components/shared/PageHeader'
import Spinner, { SkeletonCard } from '@/components/shared/Spinner'
import { useAuth } from '@/context/AuthContext'
import { adminApi } from '@/api/adminApi'
import { reportsApi } from '@/api/reportsApi'
import { useStudentAttendance } from '@/hooks/useAttendance'
import {
  useDownloadBulkExcel,
  useDownloadClassExcel,
  useDownloadClassPDF,
  useDownloadDeptPDF,
  useDownloadStudentExcel,
  useDownloadStudentPDF,
} from '@/hooks/useReports'

const SECTIONS = ['A', 'B', 'C', 'D']
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8]

const getAcademicYearOptions = () => {
  const currentYear = new Date().getFullYear()
  return Array.from({ length: 3 }).map((_, index) => {
    const year = currentYear - index
    return `${year}-${String((year + 1) % 100).padStart(2, '0')}`
  })
}

const normalizeProfileId = (profileId) =>
  profileId && typeof profileId === 'object' ? profileId._id || profileId.id || '' : profileId || ''

const normalizeDepartmentId = (user) => {
  if (!user) return ''
  if (user.departmentId) return user.departmentId
  if (user.profileId && typeof user.profileId === 'object') {
    const value = user.profileId.departmentId
    if (value && typeof value === 'object') return value._id || value.id || ''
    return value || ''
  }
  return ''
}

const toArray = (value) => (Array.isArray(value) ? value : [])
const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const estimateBadge = (label) => (
  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{label}</span>
)

function DownloadButton({ onClick, isLoading, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isLoading ? <Spinner size="sm" className="border-white border-t-white" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
      {isLoading ? 'Generating...' : label}
    </button>
  )
}

function ReportCard({
  title,
  description,
  preview,
  estimate,
  warning,
  missingRequired,
  children,
}) {
  return (
    <article
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        missingRequired ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        {estimateBadge(estimate)}
      </div>

      {warning && (
        <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
          <ExclamationTriangleIcon className="h-3.5 w-3.5" />
          {warning}
        </div>
      )}

      {preview && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {preview}
        </div>
      )}

      {missingRequired && (
        <p className="mt-3 text-xs font-semibold text-red-600">Required filters are missing for this report.</p>
      )}

      <div className="mt-4">{children}</div>
    </article>
  )
}

export default function ReportsPage() {
  const { user, isStudent, isFaculty, isAdmin } = useAuth()
  const studentProfileId = normalizeProfileId(user?.profileId)
  const academicYears = useMemo(() => getAcademicYearOptions(), [])

  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [draftFilters, setDraftFilters] = useState({
    academicYear: academicYears[0],
    semester: '',
    section: '',
    departmentId: normalizeDepartmentId(user),
    fromDate: '',
    toDate: '',
  })

  const [appliedFilters, setAppliedFilters] = useState({ ...draftFilters })
  const [targetStudentId, setTargetStudentId] = useState(isStudent ? studentProfileId : '')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [cardTouched, setCardTouched] = useState({})

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((current) => !current)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const downloadStudentPDF = useDownloadStudentPDF()
  const downloadStudentExcel = useDownloadStudentExcel()
  const downloadClassPDF = useDownloadClassPDF()
  const downloadClassExcel = useDownloadClassExcel()
  const downloadDeptPDF = useDownloadDeptPDF()
  const downloadBulkExcel = useDownloadBulkExcel()

  const downloadDeptExcel = useMutation({
    mutationFn: ({ params }) => reportsApi.downloadDeptExcel(params),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'department-attendance.xlsx'
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success('Report downloaded')
    },
    onError: (error) => toast.error(error.message || 'Download failed'),
  })

  const departmentsQuery = useQuery({
    queryKey: ['reportsDepartments'],
    queryFn: useCallback(() => adminApi.getDepartments(), []),
    enabled: !!isAdmin,
    retry: 0,
    staleTime: 10 * 60 * 1000,
    select: (response) => {
      const payload = response?.data || response || {}
      return toArray(payload.departments || payload.items || payload.data)
    },
  })

  const subjectsQuery = useQuery({
    queryKey: ['reportsSubjects', appliedFilters.departmentId],
    queryFn: useCallback(() => adminApi.getSubjects({ departmentId: appliedFilters.departmentId || undefined }), [appliedFilters.departmentId]),
    enabled: !!isFaculty || !!isAdmin,
    retry: 0,
    select: (response) => {
      const payload = response?.data || response || {}
      const rows = toArray(payload.subjects || payload.items || payload.data)
      return rows.map((row) => ({
        _id: row._id || row.id,
        name: row.name || row.subjectName || 'Subject',
        code: row.code || row.subjectCode || '',
      }))
    },
  })

  const classStudentCountQuery = useQuery({
    queryKey: ['classStudentCountPreview', appliedFilters.departmentId, appliedFilters.semester, appliedFilters.section],
    queryFn: useCallback(() =>
      adminApi.getStudents({
        departmentId: appliedFilters.departmentId || undefined,
        semester: appliedFilters.semester || undefined,
        section: appliedFilters.section || undefined,
      }), [appliedFilters.departmentId, appliedFilters.semester, appliedFilters.section]),
    enabled:
      (!!isFaculty || !!isAdmin) &&
      !!appliedFilters.section &&
      !!appliedFilters.semester,
    retry: 0,
    select: (response) => {
      const payload = response?.data || response || {}
      const rows = toArray(payload.students || payload.items || payload.data)
      return rows.length
    },
  })

  const queryErrors = [
    {
      key: 'departments',
      label: 'Departments query failed',
      isError: departmentsQuery.isError,
      retry: () => departmentsQuery.refetch(),
      show: isAdmin,
    },
    {
      key: 'subjects',
      label: 'Subjects query failed',
      isError: subjectsQuery.isError,
      retry: () => subjectsQuery.refetch(),
      show: isFaculty || isAdmin,
    },
    {
      key: 'classPreview',
      label: 'Class size preview query failed',
      isError: classStudentCountQuery.isError,
      retry: () => classStudentCountQuery.refetch(),
      show: (isFaculty || isAdmin) && !!appliedFilters.section && !!appliedFilters.semester,
    },
  ].filter((item) => item.show && item.isError)

  const studentSummaryQuery = useStudentAttendance(
    isStudent ? studentProfileId : targetStudentId || null,
    { semester: appliedFilters.semester || undefined }
  )

  const subjectList = useMemo(() => toArray(subjectsQuery.data), [subjectsQuery.data])

  const studentPreview = useMemo(() => {
    const payload = studentSummaryQuery.data || {}
    const subjects = toArray(payload.summary || payload.subjects)
    const overall = toNumber(payload.overallPercentage || payload.overallAttendance)
    if (studentSummaryQuery.isLoading) return 'Loading preview...'
    if (!subjects.length) return 'No attendance data available for selected student/filter.'
    return `Overall attendance: ${overall.toFixed(1)}% • Subjects: ${subjects.length}`
  }, [studentSummaryQuery.data, studentSummaryQuery.isLoading])

  const classPreview = useMemo(() => {
    if (classStudentCountQuery.isLoading) return 'Loading class preview...'
    if (!appliedFilters.section || !appliedFilters.semester) return 'Select semester and section to preview class size.'
    return `Estimated student count for selected class: ${toNumber(classStudentCountQuery.data)}`
  }, [appliedFilters.section, appliedFilters.semester, classStudentCountQuery.data, classStudentCountQuery.isLoading])

  const applyFilters = () => {
    if (draftFilters.fromDate && draftFilters.toDate && new Date(draftFilters.toDate) < new Date(draftFilters.fromDate)) {
      toast.error('To date must be after from date')
      return
    }
    setAppliedFilters({ ...draftFilters })
    toast.success('Filters applied')
  }

  const baseParams = {
    academicYear: appliedFilters.academicYear || undefined,
    semester: appliedFilters.semester || undefined,
    section: appliedFilters.section || undefined,
    departmentId: appliedFilters.departmentId || undefined,
    fromDate: appliedFilters.fromDate || undefined,
    toDate: appliedFilters.toDate || undefined,
  }

  const requireFor = {
    studentCard: () => {
      if (isStudent) return false
      return !targetStudentId
    },
    classCard: () =>
      !selectedSubjectId || !appliedFilters.section || !appliedFilters.fromDate || !appliedFilters.toDate,
    subjectSummaryCard: () => !selectedSubjectId || !appliedFilters.semester,
    departmentCard: () => !appliedFilters.departmentId,
    bulkCard: () => !appliedFilters.departmentId,
    lowAttendanceCard: () => !appliedFilters.departmentId || !appliedFilters.semester,
  }

  const withTouched = (key, action) => {
    setCardTouched((current) => ({ ...current, [key]: true }))
    if (requireFor[key]()) return
    action()
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <PageHeader
            title="Reports Center"
            subtitle="Role-aware report downloads with filter-driven output generation."
          />

          {queryErrors.length > 0 && (
            <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-2">
                <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 text-red-600" />
                <div className="w-full">
                  <p className="text-sm font-semibold text-red-800">Some report data failed to load.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {queryErrors.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={item.retry}
                        className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        Retry {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <FunnelIcon className="h-5 w-5 text-primary-600" />
                <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
              </div>

              <div className="space-y-3">
                <label className="block text-sm text-slate-700">
                  Academic Year
                  <select
                    value={draftFilters.academicYear}
                    onChange={(event) =>
                      setDraftFilters((current) => ({ ...current, academicYear: event.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    {academicYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm text-slate-700">
                  Semester
                  <select
                    value={draftFilters.semester}
                    onChange={(event) =>
                      setDraftFilters((current) => ({ ...current, semester: event.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="">All</option>
                    {SEMESTERS.map((semester) => (
                      <option key={semester} value={semester}>
                        {semester}
                      </option>
                    ))}
                  </select>
                </label>

                {(isFaculty || isAdmin) && (
                  <label className="block text-sm text-slate-700">
                    Section
                    <select
                      value={draftFilters.section}
                      onChange={(event) =>
                        setDraftFilters((current) => ({ ...current, section: event.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    >
                      <option value="">All</option>
                      {SECTIONS.map((section) => (
                        <option key={section} value={section}>
                          {section}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {isAdmin && (
                  <label className="block text-sm text-slate-700">
                    Department
                    {departmentsQuery.isLoading ? (
                      <div className="mt-1"><SkeletonCard height="2.5rem" /></div>
                    ) : departmentsQuery.isError ? (
                      <div className="mt-1 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                        Unable to load departments.
                      </div>
                    ) : (
                      <select
                        value={draftFilters.departmentId}
                        onChange={(event) =>
                          setDraftFilters((current) => ({ ...current, departmentId: event.target.value }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      >
                        <option value="">Select department</option>
                        {toArray(departmentsQuery.data).map((dept) => (
                          <option key={dept._id || dept.id} value={dept._id || dept.id}>
                            {dept.name || dept.code}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                )}

                <label className="block text-sm text-slate-700">
                  From Date
                  <input
                    type="date"
                    value={draftFilters.fromDate}
                    onChange={(event) =>
                      setDraftFilters((current) => ({ ...current, fromDate: event.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>

                <label className="block text-sm text-slate-700">
                  To Date
                  <input
                    type="date"
                    value={draftFilters.toDate}
                    onChange={(event) =>
                      setDraftFilters((current) => ({ ...current, toDate: event.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>

                <button
                  type="button"
                  onClick={applyFilters}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
                >
                  <DocumentArrowDownIcon className="h-4 w-4" />
                  Apply Filters
                </button>
              </div>
            </aside>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <ReportCard
                title="Personal Attendance Summary"
                description="Download student-level attendance snapshot with subject summary."
                preview={studentPreview}
                estimate="~2 MB"
                missingRequired={Boolean(cardTouched.studentCard && requireFor.studentCard())}
              >
                {!isStudent && (
                  <div className="mb-3">
                    <label className="block text-sm text-slate-700">
                      Student ID
                      <input
                        value={targetStudentId}
                        onChange={(event) => setTargetStudentId(event.target.value)}
                        placeholder="Enter student profile ID"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <DownloadButton
                    label="PDF"
                    isLoading={downloadStudentPDF.isPending}
                    onClick={() =>
                      withTouched('studentCard', () =>
                        downloadStudentPDF.mutate({
                          studentId: isStudent ? studentProfileId : targetStudentId,
                          params: { ...baseParams },
                          filename: 'personal-attendance.pdf',
                        })
                      )
                    }
                  />
                  <DownloadButton
                    label="Excel"
                    isLoading={downloadStudentExcel.isPending}
                    onClick={() =>
                      withTouched('studentCard', () =>
                        downloadStudentExcel.mutate({
                          studentId: isStudent ? studentProfileId : targetStudentId,
                          params: { ...baseParams },
                          filename: 'personal-attendance.xlsx',
                        })
                      )
                    }
                  />
                </div>
              </ReportCard>

              {(isFaculty || isAdmin) && (
                <>
                  <ReportCard
                    title="Class Attendance Report"
                    description="Generate class-wise attendance report for selected subject and date range."
                    preview={classPreview}
                    estimate="~3 MB"
                    missingRequired={Boolean(cardTouched.classCard && requireFor.classCard())}
                  >
                    <div className="mb-3 grid grid-cols-1 gap-2">
                      <select
                        value={selectedSubjectId}
                        onChange={(event) => setSelectedSubjectId(event.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                      >
                        <option value="">Select subject</option>
                        {subjectList.map((subject) => (
                          <option key={subject._id} value={subject._id}>
                            {subject.code ? `${subject.code} - ` : ''}
                            {subject.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <DownloadButton
                        label="PDF"
                        isLoading={downloadClassPDF.isPending}
                        onClick={() =>
                          withTouched('classCard', () =>
                            downloadClassPDF.mutate({
                              params: {
                                ...baseParams,
                                subjectId: selectedSubjectId,
                              },
                              filename: 'class-attendance.pdf',
                            })
                          )
                        }
                      />
                      <DownloadButton
                        label="Excel"
                        isLoading={downloadClassExcel.isPending}
                        onClick={() =>
                          withTouched('classCard', () =>
                            downloadClassExcel.mutate({
                              params: {
                                ...baseParams,
                                subjectId: selectedSubjectId,
                              },
                              filename: 'class-attendance.xlsx',
                            })
                          )
                        }
                      />
                    </div>
                  </ReportCard>

                  <ReportCard
                    title="Subject Summary Report"
                    description="Semester-level summary for a selected subject."
                    preview="Includes aggregate attendance metrics and trend-ready export columns."
                    estimate="~1.5 MB"
                    missingRequired={Boolean(cardTouched.subjectSummaryCard && requireFor.subjectSummaryCard())}
                  >
                    <div className="mb-3">
                      <select
                        value={selectedSubjectId}
                        onChange={(event) => setSelectedSubjectId(event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      >
                        <option value="">Select subject</option>
                        {subjectList.map((subject) => (
                          <option key={subject._id} value={subject._id}>
                            {subject.code ? `${subject.code} - ` : ''}
                            {subject.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <DownloadButton
                        label="PDF"
                        isLoading={downloadClassPDF.isPending}
                        onClick={() =>
                          withTouched('subjectSummaryCard', () =>
                            downloadClassPDF.mutate({
                              params: {
                                ...baseParams,
                                subjectId: selectedSubjectId,
                                reportType: 'subject-summary',
                              },
                              filename: 'subject-summary.pdf',
                            })
                          )
                        }
                      />
                      <DownloadButton
                        label="Excel"
                        isLoading={downloadClassExcel.isPending}
                        onClick={() =>
                          withTouched('subjectSummaryCard', () =>
                            downloadClassExcel.mutate({
                              params: {
                                ...baseParams,
                                subjectId: selectedSubjectId,
                                reportType: 'subject-summary',
                              },
                              filename: 'subject-summary.xlsx',
                            })
                          )
                        }
                      />
                    </div>
                  </ReportCard>
                </>
              )}

              {isAdmin && (
                <>
                  <ReportCard
                    title="Department Attendance Report"
                    description="Department-level attendance analytics and summary output."
                    preview="Combines attendance performance across all selected cohorts."
                    estimate="~4 MB"
                    missingRequired={Boolean(cardTouched.departmentCard && requireFor.departmentCard())}
                  >
                    <div className="flex flex-wrap gap-2">
                      <DownloadButton
                        label="PDF"
                        isLoading={downloadDeptPDF.isPending}
                        onClick={() =>
                          withTouched('departmentCard', () =>
                            downloadDeptPDF.mutate({
                              params: { ...baseParams },
                              filename: 'department-attendance.pdf',
                            })
                          )
                        }
                      />
                      <DownloadButton
                        label="Excel"
                        isLoading={downloadDeptExcel.isPending}
                        onClick={() =>
                          withTouched('departmentCard', () =>
                            downloadDeptExcel.mutate({
                              params: { ...baseParams },
                            })
                          )
                        }
                      />
                    </div>
                  </ReportCard>

                  <ReportCard
                    title="All Students Bulk Export"
                    description="Export department-wide student attendance data in one file."
                    preview="Best for archival, compliance, and institutional analysis workflows."
                    estimate="~8 MB"
                    warning="May take 30+ seconds for large departments"
                    missingRequired={Boolean(cardTouched.bulkCard && requireFor.bulkCard())}
                  >
                    <DownloadButton
                      label="Excel"
                      isLoading={downloadBulkExcel.isPending}
                      onClick={() =>
                        withTouched('bulkCard', () =>
                          downloadBulkExcel.mutate({
                            params: { ...baseParams },
                            filename: 'all-students-bulk.xlsx',
                          })
                        )
                      }
                    />
                  </ReportCard>

                  <ReportCard
                    title="Low Attendance Students"
                    description="Excel export including student contacts for notices and interventions."
                    preview="Recommended for physical notice dispatch and guardian communication logs."
                    estimate="~2.5 MB"
                    missingRequired={Boolean(cardTouched.lowAttendanceCard && requireFor.lowAttendanceCard())}
                  >
                    <DownloadButton
                      label="Excel"
                      isLoading={downloadBulkExcel.isPending}
                      onClick={() =>
                        withTouched('lowAttendanceCard', () =>
                          downloadBulkExcel.mutate({
                            params: {
                              ...baseParams,
                              reportType: 'low-attendance',
                            },
                            filename: 'low-attendance-students.xlsx',
                          })
                        )
                      }
                    />
                  </ReportCard>
                </>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
