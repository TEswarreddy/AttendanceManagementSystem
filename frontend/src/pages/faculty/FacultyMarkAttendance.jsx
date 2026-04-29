import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueries, useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { apiGet, apiPost } from '@/api/axiosInstance'

const STATUS_OPTIONS = ['P', 'A', 'L']

const dayKeyFromDate = (dateValue) => {
  const date = new Date(dateValue)
  const day = date.getDay()
  const keys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return keys[day]
}

const todayIso = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseTime = (time) => {
  if (!time) return null
  const match = String(time).match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

const isCurrentPeriod = (slot) => {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const start = parseTime(slot.startTime)
  const end = parseTime(slot.endTime)
  if (start === null || end === null) return false
  return currentMinutes >= start && currentMinutes <= end
}

const getTodaySlots = (payload, dateValue) => {
  const key = dayKeyFromDate(dateValue)
  const rows = Array.isArray(payload?.[key]) ? payload[key] : []
  const sortedRows = rows
    .map((row, index) => ({
      ...row,
      periodNumber: Number(row.periodNumber || index + 1),
    }))
    .sort((a, b) => a.periodNumber - b.periodNumber)

  const grouped = []

  sortedRows.forEach((row, index) => {
    const isLab = String(row.subjectType || '').toLowerCase() === 'lab' || Boolean(row.isLab)
    const previous = grouped[grouped.length - 1]

    const canMergeIntoPreviousLab =
      isLab &&
      previous &&
      previous.isLab &&
      String(previous.subjectId || '') === String(row.subjectId || '') &&
      String(previous.semester || '') === String(row.semester || '') &&
      String(previous.section || '') === String(row.section || '') &&
      String(previous.roomNo || '') === String(row.roomNo || '') &&
      Number(row.periodNumber) === Number(previous.periodNumbers[previous.periodNumbers.length - 1]) + 1

    if (canMergeIntoPreviousLab) {
      previous.periodNumbers.push(Number(row.periodNumber))
      previous.endTime = row.endTime || previous.endTime
      return
    }

    grouped.push({
      id: `${row.subjectId || row.subjectCode || index}-${row.periodNumber || index}`,
      subjectId: row.subjectId,
      subjectName: row.subjectName || row.subject?.name || 'Subject',
      subjectCode: row.subjectCode || row.subject?.code || '-',
      periodNumber: Number(row.periodNumber || index + 1),
      periodNumbers: [Number(row.periodNumber || index + 1)],
      startTime: row.startTime || '--:--',
      endTime: row.endTime || '--:--',
      semester: row.semester || '-',
      section: row.section || '-',
      roomNo: row.roomNo || '-',
      isLab,
      subjectType: row.subjectType || (isLab ? 'lab' : 'theory'),
    })
  })

  return grouped
}

const normalizeClasses = (responseData) => {
  const data = responseData?.data || responseData || {}
  const classes = Array.isArray(data.classes) ? data.classes : []
  return classes.flatMap((cls) => (Array.isArray(cls.students) ? cls.students : []))
}

export default function FacultyMarkAttendance() {
  const [searchParams] = useSearchParams()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [records, setRecords] = useState({})
  const [activeStudentId, setActiveStudentId] = useState(null)
  const [dateValue] = useState(todayIso)

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const timetableQuery = useQuery({
    queryKey: ['faculty-mark', 'timetable'],
    queryFn: () => apiGet('/faculty/timetable'),
  })

  const todaySlots = useMemo(
    () => getTodaySlots(timetableQuery.data?.data || timetableQuery.data, dateValue),
    [dateValue, timetableQuery.data]
  )

  useEffect(() => {
    if (!todaySlots.length) return

    const subjectId = String(searchParams.get('subjectId') || '')
    const periodNumbersCsv = String(searchParams.get('periodNumbers') || '').trim()
    const periodNumbers = periodNumbersCsv
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b)

    const singlePeriod = Number(searchParams.get('periodNumber'))
    const targetPeriods = periodNumbers.length
      ? periodNumbers
      : Number.isFinite(singlePeriod) && singlePeriod > 0
        ? [singlePeriod]
        : []

    const matched = todaySlots.find((slot) => {
      if (subjectId && String(slot.subjectId || '') !== subjectId) return false
      if (!targetPeriods.length) return true
      if (slot.periodNumbers.length !== targetPeriods.length) return false
      return slot.periodNumbers.every((period, index) => Number(period) === Number(targetPeriods[index]))
    })

    if (matched) {
      setSelectedSlot((current) => current || matched)
    }
  }, [todaySlots, searchParams])

  const statusTargets = useMemo(
    () =>
      todaySlots.flatMap((slot) =>
        slot.periodNumbers.map((periodNumber) => ({
          slotId: slot.id,
          subjectId: slot.subjectId,
          periodNumber,
        }))
      ),
    [todaySlots]
  )

  const statusQueries = useQueries({
    queries: statusTargets.map((target) => ({
      queryKey: ['faculty-mark', 'slot-status', target.subjectId, target.periodNumber, dateValue],
      queryFn: () =>
        apiGet('/faculty/attendance/period', {
          subjectId: target.subjectId,
          date: dateValue,
          periodNumber: target.periodNumber,
        }),
      enabled: Boolean(target.subjectId),
      retry: false,
    })),
  })

  const statusMap = useMemo(() => {
    const map = new Map()
    let queryIndex = 0

    todaySlots.forEach((slot) => {
      let marked = slot.periodNumbers.length > 0
      let markedCount = 0
      let totalStudents = 0

      slot.periodNumbers.forEach(() => {
        const query = statusQueries[queryIndex]
        queryIndex += 1

        const data = query?.data?.data || query?.data || {}
        const cls = Array.isArray(data.classes) ? data.classes[0] : null
        marked = marked && Boolean(cls && cls.markedCount > 0)
        markedCount += cls?.markedCount || 0
        totalStudents = Math.max(totalStudents, cls?.totalStudents || 0)
      })

      map.set(slot.id, {
        marked,
        markedCount,
        totalStudents,
      })
    })

    return map
  }, [statusQueries, todaySlots])

  const selectedStudentsQuery = useQuery({
    queryKey: ['faculty-mark', 'students', selectedSlot?.subjectId, selectedSlot?.periodNumber, dateValue],
    queryFn: () =>
      apiGet('/faculty/attendance/period', {
        subjectId: selectedSlot.subjectId,
        date: dateValue,
        periodNumber: selectedSlot.periodNumber,
      }),
    enabled: Boolean(selectedSlot?.subjectId && selectedSlot?.periodNumber),
    retry: false,
  })

  const students = useMemo(() => normalizeClasses(selectedStudentsQuery.data?.data || selectedStudentsQuery.data), [selectedStudentsQuery.data])

  useEffect(() => {
    if (!students.length) return
    setRecords((current) => {
      const next = { ...current }
      students.forEach((student) => {
        const fallback = student.status === 'not_marked_yet' ? 'P' : student.status
        if (!next[student.studentId]) {
          next[student.studentId] = fallback
        }
      })
      return next
    })
  }, [students])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!activeStudentId) return
      const key = String(event.key || '').toUpperCase()
      if (!STATUS_OPTIONS.includes(key)) return
      event.preventDefault()
      setRecords((current) => ({ ...current, [activeStudentId]: key }))
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeStudentId])

  const markMutation = useMutation({
    mutationFn: async ({ requests }) => {
      const results = await Promise.all(
        requests.map((payload) => apiPost('/faculty/attendance/mark', payload))
      )
      return results
    },
    onSuccess: () => {
      toast.success('Attendance saved. Absent SMS will be sent automatically.')
    },
    onError: (error) => {
      toast.error(error.message || 'Unable to save attendance')
    },
  })

  const markAllPresent = () => {
    setRecords((current) => {
      const next = { ...current }
      students.forEach((student) => {
        next[student.studentId] = 'P'
      })
      return next
    })
  }

  const handleSubmit = () => {
    if (!selectedSlot) {
      toast.error('Select a period first')
      return
    }

    const payloadRecords = students.map((student) => ({
      studentId: student.studentId,
      status: records[student.studentId] || 'P',
    }))

    if (!payloadRecords.length) {
      toast.error('No students to submit')
      return
    }

    markMutation.mutate({
      requests: selectedSlot.periodNumbers.map((periodNumber) => ({
        subjectId: selectedSlot.subjectId,
        periodNumber,
        date: dateValue,
        records: payloadRecords,
      })),
    })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Period-Based Mark Attendance</h1>
            <p className="mt-1 text-sm text-slate-600">Step 1: Choose today&apos;s period</p>

            {timetableQuery.isLoading ? (
              <div className="mt-4 h-24 animate-pulse rounded-xl bg-slate-100" />
            ) : todaySlots.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">No classes scheduled today.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {todaySlots.map((slot) => {
                  const info = statusMap.get(slot.id)
                  const marked = Boolean(info?.marked)
                  const current = isCurrentPeriod(slot)
                  const stateLabel = marked ? 'Marked' : current ? 'Mark Now' : 'Mark'
                  const stateStyle = marked
                    ? 'border-blue-200 bg-blue-50 text-blue-800'
                    : current
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-slate-50 text-slate-700'

                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => {
                        setSelectedSlot(slot)
                        setActiveStudentId(null)
                      }}
                      className={`rounded-2xl border p-4 text-left transition hover:shadow-md ${stateStyle} ${selectedSlot?.id === slot.id ? 'ring-2 ring-slate-400' : ''}`}
                    >
                      <p className="text-sm font-bold">
                        {slot.periodNumbers.length > 1
                          ? `Periods ${slot.periodNumbers[0]}-${slot.periodNumbers[slot.periodNumbers.length - 1]}`
                          : `Period ${slot.periodNumber}`}
                      </p>
                      <p className="text-sm">{slot.startTime} - {slot.endTime}</p>
                      <p className="mt-1 text-sm font-semibold">{slot.subjectName}</p>
                      <p className="text-xs">Class: Sem {slot.semester} / Sec {slot.section}</p>
                      <p className="text-xs">Room: {slot.roomNo}</p>
                      {slot.isLab ? <p className="mt-1 text-xs font-semibold text-indigo-700">Lab Session</p> : null}
                      <p className="mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold">{stateLabel}{marked ? ' ✓' : ''}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Step 2: Student List</h2>
                {selectedSlot ? (
                  <p className="text-sm text-slate-600">
                    {selectedSlot.periodNumbers.length > 1
                      ? `Periods ${selectedSlot.periodNumbers[0]}-${selectedSlot.periodNumbers[selectedSlot.periodNumbers.length - 1]}`
                      : `Period ${selectedSlot.periodNumber}`}{' '}
                    • {selectedSlot.subjectName} • {selectedSlot.startTime} - {selectedSlot.endTime}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">Select a period to load students</p>
                )}
              </div>
              <button
                type="button"
                onClick={markAllPresent}
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"
                disabled={!students.length}
              >
                Mark All Present
              </button>
            </div>

            {selectedStudentsQuery.isLoading ? (
              <div className="mt-4 h-40 animate-pulse rounded-xl bg-slate-100" />
            ) : !selectedSlot ? null : students.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">No students found for this period.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {students.map((student) => (
                  <article
                    key={student.studentId}
                    tabIndex={0}
                    onFocus={() => setActiveStudentId(student.studentId)}
                    className={`rounded-xl border p-3 ${activeStudentId === student.studentId ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{student.name}</p>
                        <p className="text-xs text-slate-600">{student.rollNumber}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {STATUS_OPTIONS.map((option) => (
                          <label key={option} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-slate-300 px-2 py-1 text-xs font-semibold">
                            <input
                              type="radio"
                              name={`status-${student.studentId}`}
                              value={option}
                              checked={(records[student.studentId] || 'P') === option}
                              onChange={() => setRecords((current) => ({ ...current, [student.studentId]: option }))}
                            />
                            {option}
                          </label>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Step 3: Submit</h2>
            <p className="mt-1 text-sm text-slate-600">Submit period attendance with period number.</p>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!selectedSlot || markMutation.isPending}
              className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {markMutation.isPending ? 'Saving...' : 'Submit Attendance'}
            </button>
          </section>
        </div>
      </main>
    </div>
  )
}
