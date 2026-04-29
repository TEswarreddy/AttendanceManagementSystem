import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ChevronUpDownIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import PageHeader from '@/components/shared/PageHeader'
import Spinner, { SkeletonTable } from '@/components/shared/Spinner'
import StatusBadge from '@/components/shared/StatusBadge'
import { attendanceApi } from '@/api/attendanceApi'
import { adminApi } from '@/api/adminApi'
import { reportsApi } from '@/api/reportsApi'
import { useAuth } from '@/context/AuthContext'
import { useClassAttendance, useMarkAttendance } from '@/hooks/useAttendance'
import { SESSIONS } from '@/utils/constants'

const STATUS_OPTIONS = [
  { value: 'P', label: 'P', className: 'border-green-200 text-green-700 data-[active=true]:bg-green-600 data-[active=true]:text-white' },
  { value: 'A', label: 'A', className: 'border-red-200 text-red-700 data-[active=true]:bg-red-600 data-[active=true]:text-white' },
  { value: 'L', label: 'L', className: 'border-amber-200 text-amber-700 data-[active=true]:bg-amber-500 data-[active=true]:text-white' },
  { value: 'ML', label: 'ML', className: 'border-blue-200 text-blue-700 data-[active=true]:bg-blue-600 data-[active=true]:text-white' },
]

const DEFAULT_TODAY = new Date().toISOString().slice(0, 10)

const normalizeProfileId = (profileId) =>
  profileId && typeof profileId === 'object' ? profileId._id || profileId.id || '' : profileId || ''
const normalizeRouteId = (value) => {
  if (!value || value === '[object Object]') return ''
  return value
}

const getAcademicYear = () => {
  const year = new Date().getFullYear()
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`
}

const getSummary = (records) =>
  Object.values(records).reduce(
    (acc, status) => {
      acc[status] = (acc[status] || 0) + 1
      acc.total += 1
      return acc
    },
    { P: 0, A: 0, L: 0, ML: 0, total: 0 }
  )

const formatRelativeTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000))
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

const normalizeTimetable = (response) => {
  const payload = response?.data || response || {}
  const items = payload.timetables || payload.items || payload.data || payload.subjects || []

  if (!Array.isArray(items)) return []

  return items.map((item) => ({
    ...item,
    subjectId: item.subjectId?._id || item.subjectId?.id || item.subjectId || item._id,
    subjectName: item.subjectId?.name || item.subject?.name || item.name || item.subjectName || 'Subject',
    subjectCode: item.subjectId?.code || item.subject?.code || item.code || item.subjectCode || '',
    semester: item.semester,
    section: item.section,
    departmentId: item.departmentId?._id || item.departmentId,
  }))
}

export default function MarkAttendance() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const facultyProfileId = normalizeProfileId(user?.profileId)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState('name')
  const [openRemarksStudentId, setOpenRemarksStudentId] = useState(null)
  const [activeStudentId, setActiveStudentId] = useState(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [lastSavedSummary, setLastSavedSummary] = useState(null)
  const [isDirty, setIsDirty] = useState(false)
  const [draft, setDraft] = useState({
    subjectId: normalizeRouteId(searchParams.get('subjectId')),
    session: searchParams.get('session') || 'morning',
    date: searchParams.get('date') || DEFAULT_TODAY,
  })
  const [loadedClass, setLoadedClass] = useState(null)
  const [records, setRecords] = useState({})
  const [remarks, setRemarks] = useState({})
  const [rosterError, setRosterError] = useState(false)
  const hydratedTokenRef = useRef(null)

  const academicYear = useMemo(() => getAcademicYear(), [])

  const timetableQuery = useQuery({
    queryKey: ['facultyTimetable', facultyProfileId, academicYear],
    queryFn: () => adminApi.getTimetable({ facultyId: facultyProfileId, academicYear }),
    enabled: !!facultyProfileId,
    staleTime: 5 * 60 * 1000,
    select: (response) => response?.data || response,
  })

  const timetable = useMemo(() => normalizeTimetable(timetableQuery.data), [timetableQuery.data])

  const subjectOptions = useMemo(() => {
    const options = timetable.map((item) => ({
      value: item.subjectId,
      label: `${item.subjectCode ? `${item.subjectCode} - ` : ''}${item.subjectName}`,
      semester: item.semester,
      section: item.section,
      departmentId: item.departmentId,
    }))

    if (draft.subjectId && !options.some((item) => String(item.value) === String(draft.subjectId))) {
      options.unshift({ value: draft.subjectId, label: `Subject ${draft.subjectId.slice(-6)}` })
    }

    return options
  }, [draft.subjectId, timetable])

  const selectedSubject = useMemo(
    () => subjectOptions.find((item) => String(item.value) === String(draft.subjectId)) || null,
    [draft.subjectId, subjectOptions]
  )

  const classAttendanceQuery = useClassAttendance(loadedClass)

  const reportQuery = useQuery({
    queryKey: [
      'markAttendanceRoster',
      loadedClass?.subjectId,
      loadedClass?.date,
      loadedClass?.semester || selectedSubject?.semester || null,
      loadedClass?.section || selectedSubject?.section || null,
      loadedClass?.loadToken || null,
    ],
    queryFn: () =>
      attendanceApi.getSubjectReport(loadedClass.subjectId, {
        semester: loadedClass?.semester || selectedSubject?.semester,
        section: loadedClass?.section || selectedSubject?.section,
        fromDate: loadedClass.date,
        toDate: loadedClass.date,
      }),
    enabled: !!loadedClass?.subjectId && !!loadedClass?.date,
    staleTime: 60 * 1000,
    retry: 0,
    select: (response) => response?.data || response,
    onError: () => setRosterError(true),
  })

  const markAttendanceMutation = useMarkAttendance()

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((current) => !current)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  useEffect(() => {
    if (loadedClass || !draft.subjectId || !draft.session || !draft.date) return
    setLoadedClass({
      subjectId: draft.subjectId,
      session: draft.session,
      date: draft.date,
      loadToken: Date.now(),
      semester: selectedSubject?.semester,
      section: selectedSubject?.section,
    })
  }, [draft.date, draft.session, draft.subjectId, loadedClass, selectedSubject?.section, selectedSubject?.semester])

  useEffect(() => {
    const beforeUnload = (event) => {
      if (!isDirty) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [isDirty])

  const rosterRows = useMemo(() => {
    const reportRows = Array.isArray(reportQuery.data?.studentRows) ? reportQuery.data.studentRows : []
    const attendanceRows = Array.isArray(classAttendanceQuery.data?.records) ? classAttendanceQuery.data.records : []
    const attendanceMap = new Map(
      attendanceRows.map((item) => [String(item.studentId), { status: item.status || 'A', remarks: item.remarks || '' }])
    )

    const sourceRows = reportRows.length > 0 ? reportRows : attendanceRows

    return sourceRows.map((row) => {
      const studentId = String(row.studentId || row._id)
      const existing = attendanceMap.get(studentId)
      return {
        studentId,
        name: row.name || row.studentName || 'Student',
        rollNumber: row.rollNumber || '-',
        status: existing?.status || row.status || 'A',
        remarks: existing?.remarks || row.remarks || '',
      }
    })
  }, [classAttendanceQuery.data, reportQuery.data])

  useEffect(() => {
    if (!loadedClass?.loadToken || rosterRows.length === 0) return
    if (hydratedTokenRef.current === loadedClass.loadToken) return

    const nextRecords = {}
    const nextRemarks = {}
    rosterRows.forEach((row) => {
      nextRecords[row.studentId] = row.status || 'A'
      nextRemarks[row.studentId] = row.remarks || ''
    })

    hydratedTokenRef.current = loadedClass.loadToken
    setRecords(nextRecords)
    setRemarks(nextRemarks)
    setIsDirty(false)
    setLastSavedSummary(getSummary(nextRecords))
    setLastSavedAt(classAttendanceQuery.data?.records?.[0]?.markedAt || null)
    setRosterError(false)
  }, [loadedClass?.loadToken, rosterRows, classAttendanceQuery.data])

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const rows = rosterRows.filter((row) => {
      if (!query) return true
      return row.name.toLowerCase().includes(query) || row.rollNumber.toLowerCase().includes(query)
    })

    const sorter =
      sortMode === 'roll'
        ? (a, b) => a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true, sensitivity: 'base' })
        : (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

    return [...rows].sort(sorter)
  }, [rosterRows, searchQuery, sortMode])

  const summary = useMemo(() => getSummary(records), [records])
  const totalStudents = rosterRows.length

  const lastMarkedSummary = useMemo(() => {
    const rows = Array.isArray(classAttendanceQuery.data?.records) ? classAttendanceQuery.data.records : []
    if (!rows.length) return null

    const latestMarkedAt = rows.reduce((latest, item) => {
      const time = new Date(item.markedAt || 0).getTime()
      return time > latest ? time : latest
    }, 0)

    const counts = rows.reduce(
      (acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1
        acc.total += 1
        return acc
      },
      { P: 0, A: 0, L: 0, ML: 0, total: 0 }
    )

    return { text: `Last marked: ${formatRelativeTime(latestMarkedAt)} — ${counts.P} Present, ${counts.A} Absent` }
  }, [classAttendanceQuery.data?.records])

  const updateRecord = (studentId, status) => {
    setRecords((current) => ({ ...current, [studentId]: status }))
    setIsDirty(true)
  }

  const updateRemark = (studentId, value) => {
    setRemarks((current) => ({ ...current, [studentId]: value }))
    setIsDirty(true)
  }

  const setAll = (status) => {
    setRecords(
      rosterRows.reduce((acc, row) => {
        acc[row.studentId] = status
        return acc
      }, {})
    )
    setIsDirty(true)
  }

  const handleRowKeyDown = (event, studentId) => {
    const key = String(event.key || '').toLowerCase()
    if (['p', 'a', 'l', 'm'].includes(key)) {
      event.preventDefault()
      updateRecord(studentId, key === 'm' ? 'ML' : key.toUpperCase())
    }
  }

  const loadClass = () => {
    if (!draft.subjectId || !draft.session || !draft.date) {
      toast.error('Select a subject, date, and session')
      return
    }

    if (draft.date > DEFAULT_TODAY) {
      toast.error('Future dates are not allowed')
      return
    }

    hydratedTokenRef.current = null
    setLoadedClass({
      subjectId: draft.subjectId,
      session: draft.session,
      date: draft.date,
      loadToken: Date.now(),
      semester: selectedSubject?.semester,
      section: selectedSubject?.section,
    })
    setSearchParams({ subjectId: draft.subjectId, session: draft.session, date: draft.date })
    setOpenRemarksStudentId(null)
    setActiveStudentId(null)
    setRosterError(false)
  }

  const handleSubmit = () => {
    if (!loadedClass?.subjectId) {
      toast.error('Load a class first')
      return
    }

    const payload = {
      subjectId: loadedClass.subjectId,
      session: loadedClass.session,
      date: loadedClass.date,
      records: filteredRows.map((row) => ({
        studentId: row.studentId,
        status: records[row.studentId] || 'A',
        remarks: remarks[row.studentId] || '',
      })),
    }

    markAttendanceMutation.mutate(payload, {
      onSuccess: () => {
        setIsDirty(false)
        setShowConfetti(true)
        setLastSavedAt(new Date().toISOString())
        setLastSavedSummary(summary)
        setTimeout(() => setShowConfetti(false), 2400)
      },
    })
  }

  const downloadClassPdf = async () => {
    if (!loadedClass?.subjectId) return

    try {
      const blob = await reportsApi.downloadClassPDF({
        subjectId: loadedClass.subjectId,
        session: loadedClass.session,
        date: loadedClass.date,
      })

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `class-${loadedClass.subjectId}-${loadedClass.date}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success('PDF downloaded')
    } catch (error) {
      toast.error(error.message || 'Unable to download PDF')
    }
  }

  const pieces = useMemo(() => {
    if (!showConfetti) return []
    return Array.from({ length: 24 }).map((_, index) => ({
      id: index,
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      size: 8 + Math.random() * 10,
      color: ['#16a34a', '#2563eb', '#f59e0b', '#ef4444'][index % 4],
      rotate: Math.random() * 360,
    }))
  }, [showConfetti])

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-40 sm:px-6 lg:px-8">
          <PageHeader title="Mark Attendance" subtitle="Load a class, update attendance, add remarks, and save the session." />

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_160px_160px_auto]">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Subject</span>
                <select
                  value={draft.subjectId}
                  onChange={(event) => setDraft((current) => ({ ...current, subjectId: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1F4E79]"
                >
                  <option value="">Select a subject</option>
                  {subjectOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Date</span>
                <input
                  type="date"
                  value={draft.date}
                  max={DEFAULT_TODAY}
                  onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1F4E79]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Session</span>
                <select
                  value={draft.session}
                  onChange={(event) => setDraft((current) => ({ ...current, session: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1F4E79]"
                >
                  {SESSIONS.map((session) => (
                    <option key={session.value} value={session.value}>
                      {session.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={loadClass}
                  disabled={!draft.subjectId || !draft.session || !draft.date || draft.date > DEFAULT_TODAY}
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-[#1F4E79] px-5 text-sm font-semibold text-white transition hover:bg-[#173b5d] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Load Class
                </button>
              </div>
            </div>
          </section>

          {loadedClass ? (
            <>
              <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Loaded class</p>
                    <h2 className="mt-1 text-xl font-bold text-slate-900">{selectedSubject?.label || draft.subjectId}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {draft.date} • {draft.session === 'morning' ? 'Morning' : 'Afternoon'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{totalStudents} students</span>
                    {lastMarkedSummary && <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700">{lastMarkedSummary.text}</span>}
                  </div>
                </div>
              </section>

              <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAll('P')}
                      className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 transition hover:bg-green-100"
                    >
                      Mark All Present
                    </button>
                    <button
                      type="button"
                      onClick={() => setAll('A')}
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                    >
                      Mark All Absent
                    </button>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{totalStudents} students</span>
                    {lastMarkedSummary && <span className="text-sm text-slate-500">{lastMarkedSummary.text}</span>}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search by name or roll number"
                      className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-[#1F4E79] sm:w-80"
                    />
                    <button
                      type="button"
                      onClick={() => setSortMode((current) => (current === 'name' ? 'roll' : 'name'))}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <ChevronUpDownIcon className="h-4 w-4" />
                      Sort by {sortMode === 'name' ? 'Roll Number' : 'Name'}
                    </button>
                  </div>
                </div>

                {searchQuery && (
                  <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <span className="font-semibold text-slate-800">Previously marked:</span>{' '}
                    {lastMarkedSummary?.text || 'No previous record for this class'}
                  </div>
                )}
              </section>

              <section className="mt-5 space-y-3">
                {reportQuery.isLoading && <SkeletonTable rows={6} />}

                {!reportQuery.isLoading && rosterRows.length === 0 && (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
                    No roster data available for this class.
                  </div>
                )}

                {!reportQuery.isLoading &&
                  filteredRows.map((row) => {
                    const activeStatus = records[row.studentId] || 'A'
                    const showRemarkInput = openRemarksStudentId === row.studentId

                    return (
                      <article
                        key={row.studentId}
                        tabIndex={0}
                        onFocus={() => setActiveStudentId(row.studentId)}
                        onKeyDown={(event) => handleRowKeyDown(event, row.studentId)}
                        className={`rounded-3xl border bg-white p-4 shadow-sm outline-none transition focus:border-[#1F4E79] focus:ring-2 focus:ring-[#1F4E79]/10 ${activeStudentId === row.studentId ? 'border-[#1F4E79]' : 'border-slate-200'}`}
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="font-mono text-sm text-slate-500">{row.rollNumber}</p>
                            <h3 className="mt-1 text-lg font-bold text-slate-900">{row.name}</h3>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <StatusBadge status={activeStatus} variant="chip" />
                              {remarks[row.studentId] && (
                                <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">Remarks added</span>
                              )}
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">P / A / L / ML shortcuts</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {STATUS_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                data-active={activeStatus === option.value}
                                onClick={() => updateRecord(row.studentId, option.value)}
                                className={`min-w-12 rounded-lg border px-4 py-2 text-sm font-bold transition ${activeStatus === option.value ? option.active : option.idle}`}
                              >
                                {option.label}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setOpenRemarksStudentId((current) => (current === row.studentId ? null : row.studentId))}
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              <PencilSquareIcon className="h-4 w-4" />
                              Remarks
                            </button>
                          </div>
                        </div>

                        {showRemarkInput && (
                          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                            <input
                              value={remarks[row.studentId] || ''}
                              onChange={(event) => updateRemark(row.studentId, event.target.value)}
                              placeholder="Optional remarks"
                              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-[#1F4E79]"
                            />
                            <button
                              type="button"
                              onClick={() => setOpenRemarksStudentId(null)}
                              className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              Done
                            </button>
                          </div>
                        )}
                      </article>
                    )
                  })}
              </section>

              <section className="sticky bottom-4 z-20 mt-8 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      {summary.P} P | {summary.A} A | {summary.L} L | {summary.ML} ML — {summary.total} total
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Press P, A, L, or M on a focused student card to change status.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {lastSavedAt && (
                      <span className="inline-flex items-center gap-2 rounded-xl bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
                        <CheckCircleIcon className="h-4 w-4" />
                        Saved {formatRelativeTime(lastSavedAt)}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!isDirty || markAttendanceMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#1F4E79] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#173b5d] disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {markAttendanceMutation.isPending ? <Spinner size="sm" className="border-white/40 border-t-white" /> : null}
                      {markAttendanceMutation.isPending ? 'Saving...' : 'Save Attendance'}
                    </button>
                  </div>
                </div>

                {lastSavedAt && (
                  <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-200 pt-4">
                    <button
                      type="button"
                      onClick={downloadClassPdf}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4" />
                      Download Class PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLoadedClass(null)
                        setRecords({})
                        setRemarks({})
                        setIsDirty(false)
                        setLastSavedAt(null)
                        setLastSavedSummary(null)
                        setSearchQuery('')
                        setOpenRemarksStudentId(null)
                        setActiveStudentId(null)
                        hydratedTokenRef.current = null
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <SparklesIcon className="h-4 w-4" />
                      Mark Another Session
                    </button>
                    <Link
                      to={`/faculty/reports?subjectId=${loadedClass.subjectId}&date=${loadedClass.date}&session=${loadedClass.session}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                    >
                      <DocumentTextIcon className="h-4 w-4" />
                      View Class Summary
                    </Link>
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              Select a subject, date, and session, then load the class to begin marking attendance.
            </section>
          )}
        </div>
      </main>

      {showConfetti && (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
          {Array.from({ length: 24 }).map((_, index) => (
            <span
              key={index}
              className="absolute top-0 rounded-sm"
              style={{
                left: `${Math.random() * 100}%`,
                width: `${8 + Math.random() * 10}px`,
                height: `${4 + Math.random() * 5}px`,
                backgroundColor: ['#16a34a', '#2563eb', '#f59e0b', '#ef4444'][index % 4],
                animation: 'mark-confetti 1.8s ease-out forwards',
                transform: `rotate(${Math.random() * 360}deg)`,
              }}
            />
          ))}
        </div>
      )}

      <Transition appear show={rosterError} as={Fragment}>
        <Dialog as="div" className="relative z-[70]" onClose={() => setRosterError(false)}>
          <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-slate-900/50" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                <Dialog.Panel className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-slate-900">Roster fallback</Dialog.Title>
                      <p className="mt-1 text-sm text-slate-600">
                        The roster report could not be loaded. The page can still work from the attendance records that are already available.
                      </p>
                    </div>
                    <button type="button" onClick={() => setRosterError(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <style>{`@keyframes mark-confetti { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(540deg); opacity: 0; } }`}</style>
    </div>
  )
}
