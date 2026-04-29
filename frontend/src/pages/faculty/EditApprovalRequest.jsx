import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { apiGet, apiPost } from '@/api/axiosInstance'

const STATUS_OPTIONS = ['P', 'A', 'L', 'ML']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const toIsoDate = (value) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getCalendarMatrix = (date) => {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < startOffset; i += 1) {
    cells.push(null)
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day))
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return cells
}

const normalizeSlots = (payload, dateValue) => {
  const key = new Date(dateValue).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
  const rows = Array.isArray(payload?.[key]) ? payload[key] : []

  return rows
    .map((row) => ({
      subjectId: row.subjectId,
      subjectName: row.subjectName || row.subject?.name || 'Subject',
      subjectCode: row.subjectCode || row.subject?.subjectCode || '-',
      semester: row.semester || '-',
      section: row.section || '-',
      periodNumber: Number(row.periodNumber || 0),
      roomNo: row.roomNo || '-',
      timeLabel: row.startTime && row.endTime ? `${row.startTime} - ${row.endTime}` : 'Time not set',
    }))
    .filter((row) => row.subjectId && Number.isFinite(row.periodNumber) && row.periodNumber > 0)
    .sort((a, b) => a.periodNumber - b.periodNumber)
}

const normalizeStudents = (response) => {
  const payload = response?.data || response || {}
  const classes = Array.isArray(payload.classes) ? payload.classes : []
  return classes.flatMap((row) => (Array.isArray(row.students) ? row.students : []))
}

export default function EditApprovalRequest() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [view, setView] = useState('month')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedSlotKey, setSelectedSlotKey] = useState('')
  const [statusMap, setStatusMap] = useState({})

  const selectedDateIso = useMemo(() => toIsoDate(selectedDate), [selectedDate])

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const timetableQuery = useQuery({
    queryKey: ['faculty-edit-attendance', 'timetable'],
    queryFn: () => apiGet('/faculty/timetable'),
    select: (response) => response?.data || response || {},
  })

  const daySlots = useMemo(() => normalizeSlots(timetableQuery.data, selectedDateIso), [timetableQuery.data, selectedDateIso])

  useEffect(() => {
    if (!daySlots.length) {
      setSelectedSlotKey('')
      return
    }

    if (!daySlots.some((slot) => `${slot.subjectId}-${slot.periodNumber}` === selectedSlotKey)) {
      const first = daySlots[0]
      setSelectedSlotKey(`${first.subjectId}-${first.periodNumber}`)
    }
  }, [daySlots, selectedSlotKey])

  const selectedSlot = useMemo(
    () => daySlots.find((slot) => `${slot.subjectId}-${slot.periodNumber}` === selectedSlotKey) || null,
    [daySlots, selectedSlotKey]
  )

  const studentsQuery = useQuery({
    queryKey: ['faculty-edit-attendance', selectedDateIso, selectedSlot?.subjectId, selectedSlot?.periodNumber],
    enabled: Boolean(selectedSlot?.subjectId && selectedSlot?.periodNumber),
    queryFn: () =>
      apiGet('/faculty/attendance/period', {
        subjectId: selectedSlot.subjectId,
        date: selectedDateIso,
        periodNumber: selectedSlot.periodNumber,
      }),
  })

  const students = useMemo(() => normalizeStudents(studentsQuery.data?.data || studentsQuery.data), [studentsQuery.data])

  useEffect(() => {
    if (!students.length) {
      setStatusMap({})
      return
    }

    setStatusMap((current) => {
      const next = { ...current }
      students.forEach((student) => {
        if (!next[student.studentId]) {
          next[student.studentId] = student.status === 'not_marked_yet' ? 'P' : student.status
        }
      })
      return next
    })
  }, [students])

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selectedSlot) {
        throw new Error('Select a timetable slot first')
      }

      const records = students.map((student) => ({
        studentId: student.studentId,
        status: statusMap[student.studentId] || 'P',
      }))

      return apiPost('/faculty/attendance/mark', {
        subjectId: selectedSlot.subjectId,
        date: selectedDateIso,
        periodNumber: selectedSlot.periodNumber,
        records,
      })
    },
    onSuccess: () => {
      toast.success('Attendance updated successfully')
      studentsQuery.refetch()
    },
    onError: (error) => {
      toast.error(error.message || 'Unable to update attendance')
    },
  })

  const renderYearView = () => {
    const year = selectedDate.getFullYear()

    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {MONTH_NAMES.map((monthName, index) => {
          const isSelected = selectedDate.getMonth() === index

          return (
            <button
              key={monthName}
              type="button"
              onClick={() => {
                setSelectedDate(new Date(year, index, 1))
                setView('month')
              }}
              className={`rounded-xl border px-3 py-4 text-sm font-semibold transition ${
                isSelected
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-primary-300'
              }`}
            >
              {monthName} {year}
            </button>
          )
        })}
      </div>
    )
  }

  const renderMonthView = () => {
    const cells = getCalendarMatrix(selectedDate)
    const selectedIso = selectedDateIso

    return (
      <div>
        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
            <div key={label} className="py-1">{label}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, idx) => {
            if (!cell) {
              return <div key={`empty-${idx}`} className="h-12 rounded-lg bg-slate-50" />
            }

            const iso = toIsoDate(cell)
            const isSelected = iso === selectedIso
            const isFuture = cell > new Date()

            return (
              <button
                key={iso}
                type="button"
                onClick={() => {
                  setSelectedDate(cell)
                  setView('day')
                }}
                disabled={isFuture}
                className={`h-12 rounded-lg border text-sm font-medium transition ${
                  isSelected
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-primary-300'
                } disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
              >
                {cell.getDate()}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderDayView = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        Selected date: <span className="font-semibold">{selectedDateIso}</span>
      </div>

      {!daySlots.length ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          No assigned timetable slots on this date.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {daySlots.map((slot) => {
            const key = `${slot.subjectId}-${slot.periodNumber}`
            const isActive = selectedSlotKey === key

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedSlotKey(key)}
                className={`rounded-xl border p-3 text-left transition ${
                  isActive
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-slate-200 bg-white hover:border-primary-300'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">Period {slot.periodNumber} • {slot.subjectName}</p>
                <p className="text-xs text-slate-600">{slot.subjectCode} • Sem {slot.semester} • Sec {slot.section}</p>
                <p className="text-xs text-slate-600">{slot.timeLabel} • Room {slot.roomNo}</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Edit Attendance</h1>
                <p className="text-sm text-slate-600">Directly edit attendance for any previous date from the calendar.</p>
              </div>

              <div className="flex gap-2">
                {['year', 'month', 'day'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setView(mode)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize ${
                      view === mode ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {view === 'year' && renderYearView()}
            {view === 'month' && renderMonthView()}
            {view === 'day' && renderDayView()}
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Attendance Editor</h2>
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !students.length || !selectedSlot}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

            {studentsQuery.isLoading ? (
              <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
            ) : !selectedSlot ? (
              <p className="text-sm text-slate-600">Select a day and class slot to edit attendance.</p>
            ) : students.length === 0 ? (
              <p className="text-sm text-slate-600">No students found for this slot/date.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="py-2">Roll No</th>
                      <th className="py-2">Student Name</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student.studentId} className="border-b border-slate-100">
                        <td className="py-2 font-medium text-slate-900">{student.rollNumber}</td>
                        <td className="py-2">{student.name}</td>
                        <td className="py-2">
                          <select
                            value={statusMap[student.studentId] || 'P'}
                            onChange={(event) =>
                              setStatusMap((current) => ({
                                ...current,
                                [student.studentId]: event.target.value,
                              }))
                            }
                            className="rounded-lg border border-slate-300 px-2 py-1"
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </td>
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
