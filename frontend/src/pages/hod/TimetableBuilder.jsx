import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { apiGet, apiPost, apiPut } from '@/api/axiosInstance'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const FALLBACK_PERIODS = [
  { number: 1, time: '09:00-09:50' },
  { number: 2, time: '09:50-10:40' },
  { number: 3, time: '10:50-11:40' },
  { number: 4, time: '11:40-12:30' },
  { number: 5, time: '13:20-14:10' },
  { number: 6, time: '14:10-15:00' },
  { number: 7, time: '15:10-16:00' },
  { number: 8, time: '16:00-16:50' },
]

const toList = (value) => (Array.isArray(value) ? value : [])
const readData = (response) => response?.data || response || {}
const toId = (value) => {
  if (!value) return ''
  if (typeof value === 'object') return String(value._id || value.id || '')
  return String(value)
}

const parseClassKey = (semester, section) => `S${semester}-${String(section || '').toUpperCase()}`
const formatClassLabel = (semester, section) => `Semester ${semester} Section ${String(section || '').toUpperCase()}`

export default function TimetableBuilder() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [viewMode, setViewMode] = useState('class')
  const [selectedClassKey, setSelectedClassKey] = useState('')
  const [selectedFacultyId, setSelectedFacultyId] = useState('')
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [entriesOverride, setEntriesOverride] = useState(null)
  const [conflictDialog, setConflictDialog] = useState({ open: false, message: '' })
  const [lastChange, setLastChange] = useState(null)

  const [cellModal, setCellModal] = useState({
    open: false,
    day: '',
    periodNumber: null,
    existing: null,
    form: {
      subjectId: '',
      facultyId: '',
      roomNo: '',
      isLab: false,
      span: 1,
      labGroup: 'A',
      classKey: '',
    },
  })


  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const facultyQuery = useQuery({
    queryKey: ['hod-timetable', 'faculty'],
    queryFn: () => apiGet('/hod/faculty', { page: 1, limit: 200 }),
  })

  const subjectsQuery = useQuery({
    queryKey: ['hod-timetable', 'subjects'],
    queryFn: () => apiGet('/subjects'),
  })

  const studentsQuery = useQuery({
    queryKey: ['hod-timetable', 'students-for-classes'],
    queryFn: () => apiGet('/students', { page: 1, limit: 5000, includeInactive: 'false' }),
  })

  const facultyRows = useMemo(() => {
    const payload = readData(facultyQuery.data)
    const rows = toList(payload.data || payload.items || payload)
    return rows
  }, [facultyQuery.data])

  const periods = FALLBACK_PERIODS

  const studentRows = useMemo(() => {
    const payload = readData(studentsQuery.data)
    const rows = toList(payload.items || payload.data || payload.students || payload)
    return rows
  }, [studentsQuery.data])

  const subjectRows = useMemo(() => {
    const payload = readData(subjectsQuery.data)
    const rows = toList(payload.data || payload.items || payload)
    return rows
  }, [subjectsQuery.data])
  const subjectOptionsBySemester = useMemo(() => {
    const groups = new Map()
    subjectRows.forEach((subject) => {
      const semester = Number(subject?.semester) || 0
      if (!groups.has(semester)) groups.set(semester, [])
      groups.get(semester).push(subject)
    })

    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([semester, rows]) => ({
        semester,
        rows: rows.sort((left, right) =>
          String(left?.subjectCode || left?.code || left?.name || '').localeCompare(
            String(right?.subjectCode || right?.code || right?.name || '')
          )
        ),
      }))
  }, [subjectRows])

  const facultyTimetablesQuery = useQuery({
    queryKey: ['hod-timetable', 'faculty-weekly', facultyRows.map((item) => String(item._id)).join(','), selectedAcademicYear],
    queryFn: async () => {
      const rows = await Promise.allSettled(
        facultyRows.map((faculty) =>
          apiGet('/timetable', {
            facultyId: faculty._id,
            academicYear: selectedAcademicYear || undefined,
          })
        )
      )

      return rows
        .filter((result) => result.status === 'fulfilled')
        .flatMap((result) => {
          const payload = readData(result.value)
          return toList(payload.timetables).map((item) => ({ ...item }))
        })
    },
    enabled: facultyRows.length > 0,
  })

  const serverEntries = useMemo(() => {
    const rows = toList(facultyTimetablesQuery.data)

    return rows.flatMap((item) => {
      const schedule = toList(item.schedule)
      return schedule.map((slot) => ({
        timetableId: item._id,
        facultyId: String(item.facultyId?._id || item.facultyId || ''),
        subjectId: String(item.subjectId?._id || item.subjectId || ''),
        departmentId: String(item.departmentId?._id || item.departmentId || ''),
        semester: Number(item.semester),
        section: String(item.section || '').toUpperCase(),
        academicYear: item.academicYear,
        day: String(slot.day || ''),
        periodNumber: Number(slot.periodNumber),
        roomNo: slot.roomNo || '',
        isLab: Boolean(slot.isLab),
        subjectType: item.subjectType || item.subjectId?.type || (slot.isLab ? 'lab' : 'theory'),
        schedule,
      }))
    })
  }, [facultyTimetablesQuery.data])

  useEffect(() => {
    setEntriesOverride(null)
  }, [serverEntries])

  const entries = entriesOverride || serverEntries

  const classOptions = useMemo(() => {
    const map = new Map()

    const addClass = (semesterValue, sectionValue, academicYearValue = '') => {
      const semester = Number(semesterValue)
      const section = String(sectionValue || '').toUpperCase()
      if (!semester || !section) return
      const key = parseClassKey(semester, section)
      if (map.has(key)) return
      map.set(key, { key, semester, section, academicYear: academicYearValue || '' })
    }

    entries.forEach((entry) => addClass(entry.semester, entry.section, entry.academicYear))

    facultyRows.forEach((faculty) => {
      toList(faculty.classesAssigned).forEach((row) => addClass(row.semester, row.section, row.academicYear))
    })

    studentRows.forEach((student) => addClass(student.semester, student.section, student.academicYear))

    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
  }, [entries, facultyRows, studentRows])

  useEffect(() => {
    if (!classOptions.length) return

    const hasSelected = classOptions.some((item) => item.key === selectedClassKey)
    if (!selectedClassKey || !hasSelected) {
      setSelectedClassKey(classOptions[0].key)
      setSelectedAcademicYear(classOptions[0].academicYear || '')
    }
  }, [classOptions, selectedClassKey])

  useEffect(() => {
    if (!selectedFacultyId && facultyRows.length) {
      setSelectedFacultyId(String(facultyRows[0]._id || ''))
    }
  }, [facultyRows, selectedFacultyId])

  const selectedClass = useMemo(
    () => classOptions.find((item) => item.key === selectedClassKey) || null,
    [classOptions, selectedClassKey]
  )

  const subjectMap = useMemo(() => {
    const map = new Map()
    subjectRows.forEach((subject) => {
      map.set(String(subject._id || subject.id), subject)
    })
    return map
  }, [subjectRows])

  const facultyMap = useMemo(() => {
    const map = new Map()
    facultyRows.forEach((faculty) => {
      map.set(String(faculty._id), faculty)
    })
    return map
  }, [facultyRows])

  const visibleEntries = useMemo(() => {
    const yearFilter = String(selectedAcademicYear || '').trim()
    const inAcademicYear = (entry) =>
      !yearFilter || String(entry.academicYear || '').trim() === yearFilter

    if (viewMode === 'faculty') {
      return entries.filter((entry) => String(entry.facultyId) === String(selectedFacultyId) && inAcademicYear(entry))
    }

    if (!selectedClass) return []

    return entries.filter(
      (entry) =>
        Number(entry.semester) === Number(selectedClass.semester) &&
        String(entry.section) === String(selectedClass.section) &&
        inAcademicYear(entry)
    )
  }, [entries, selectedAcademicYear, selectedClass, selectedFacultyId, viewMode])

  const gridMap = useMemo(() => {
    const map = new Map()
    visibleEntries.forEach((entry) => {
      const key = `${String(entry.day).toLowerCase()}-${entry.periodNumber}`
      if (!map.has(key)) {
        map.set(key, entry)
      }
    })
    return map
  }, [visibleEntries])

  const getCell = (day, periodNumber) => gridMap.get(`${day.toLowerCase()}-${periodNumber}`)

  const applyLocalTimetablePatch = (currentEntries, meta) => {
    const cleaned = toList(currentEntries).filter((entry) => String(entry.timetableId) !== String(meta.targetTimetableId))
    const nextRows = toList(meta.schedule).map((slot) => ({
      timetableId: meta.targetTimetableId,
      facultyId: String(meta.facultyId),
      subjectId: String(meta.subjectId),
      departmentId: String(meta.departmentId || ''),
      semester: Number(meta.semester),
      section: String(meta.section || '').toUpperCase(),
      academicYear: meta.academicYear,
      day: String(slot.day || ''),
      periodNumber: Number(slot.periodNumber),
      roomNo: slot.roomNo || '',
      isLab: Boolean(slot.isLab),
      subjectType: meta.subjectType || 'theory',
      schedule: toList(meta.schedule),
    }))

    return [...cleaned, ...nextRows]
  }

  const cloneEntries = (rows) =>
    toList(rows).map((entry) => ({
      ...entry,
      schedule: toList(entry.schedule).map((slot) => ({ ...slot })),
    }))

  const saveCellMutation = useMutation({
    mutationFn: async ({ day, periodNumber, form, existing }) => {
      const resolvedClass = form.classKey
        ? classOptions.find((item) => item.key === form.classKey)
        : selectedClass

      if (!resolvedClass) {
        throw new Error('Class is required for assignment')
      }

      const span = Number(form.span || 1)
      const schedule = Array.from({ length: span }, (_, index) => {
        const currentPeriod = Number(periodNumber) + index
        const periodMeta = periods.find((item) => Number(item.number) === currentPeriod)
        const [startTime = '', endTime = ''] = String(periodMeta?.time || '').split('-')

        return {
          day,
          periodNumber: currentPeriod,
          startTime,
          endTime,
          timeSlot: periodMeta?.time || `${startTime}-${endTime}`,
          roomNo: form.roomNo || '',
          labGroupId: form.isLab ? form.labGroup : undefined,
          isLab: Boolean(form.isLab),
        }
      })

      const conflicts = entries.filter((entry) => {
        const sameSlot = schedule.some(
          (slot) =>
            String(entry.day).toLowerCase() === String(slot.day).toLowerCase() && Number(entry.periodNumber) === Number(slot.periodNumber)
        )

        if (!sameSlot) return false

        const sameClass = Number(entry.semester) === Number(resolvedClass.semester) && String(entry.section) === String(resolvedClass.section)
        const sameFaculty = String(entry.facultyId) === String(form.facultyId)

        if (existing && String(entry.timetableId) === String(existing.timetableId)) {
          return false
        }

        return sameClass || sameFaculty
      })

      if (conflicts.length) {
        const conflict = conflicts[0]
        const isSameClass =
          Number(conflict.semester) === Number(resolvedClass.semester) && String(conflict.section) === String(resolvedClass.section)
        throw new Error(isSameClass ? 'This class already has a subject in this period' : 'Faculty already assigned for this period')
      }

      const reusableEntry = entries.find(
        (entry) =>
          String(entry.facultyId) === String(form.facultyId) &&
          String(entry.subjectId) === String(form.subjectId) &&
          Number(entry.semester) === Number(resolvedClass.semester) &&
          String(entry.section) === String(resolvedClass.section) &&
          String(entry.academicYear || '') === String(selectedAcademicYear || resolvedClass.academicYear || '')
      )

      const targetTimetableId = existing?.timetableId || reusableEntry?.timetableId || null
      const baseSchedule = targetTimetableId ? toList(reusableEntry?.schedule) : []
      const mergedSchedule = targetTimetableId
        ? Array.from(
            new Map(
              [...baseSchedule, ...schedule].map((slot) => [
                `${String(slot.day || '').toLowerCase()}-${Number(slot.periodNumber)}`,
                slot,
              ])
            ).values()
          )
        : schedule

      const previousEntries = cloneEntries(entries)
      const previousTimetableRows = previousEntries.filter((item) => String(item.timetableId) === String(targetTimetableId))
      const previousTimetable = previousTimetableRows[0] || null

      const body = {
        facultyId: form.facultyId,
        subjectId: form.subjectId,
        departmentId:
          toId(facultyRows[0]?.departmentId) ||
          toId(conflicts[0]?.departmentId) ||
          toId(entries[0]?.departmentId),
        semester: resolvedClass.semester,
        section: resolvedClass.section,
        academicYear: selectedAcademicYear || resolvedClass.academicYear,
        schedule: mergedSchedule,
        subjectType: form.isLab ? 'lab' : 'theory',
      }

      if (targetTimetableId) {
        await apiPut(`/timetable/${targetTimetableId}`, body)
        return {
          targetTimetableId,
          schedule: mergedSchedule,
          semester: resolvedClass.semester,
          section: resolvedClass.section,
          academicYear: body.academicYear,
          subjectId: body.subjectId,
          facultyId: body.facultyId,
          departmentId: body.departmentId,
          subjectType: body.subjectType,
          previousEntries,
          previousTimetable,
          previousSchedule: toList(previousTimetable?.schedule),
        }
      }

      const created = await apiPost('/timetable', body)
      const createdPayload = readData(created)
      const createdTimetableId = createdPayload?.timetable?._id || createdPayload?.data?.timetable?._id

      return {
        targetTimetableId: createdTimetableId,
        schedule: mergedSchedule,
        semester: resolvedClass.semester,
        section: resolvedClass.section,
        academicYear: body.academicYear,
        subjectId: body.subjectId,
        facultyId: body.facultyId,
        departmentId: body.departmentId,
        subjectType: body.subjectType,
        previousEntries,
        previousTimetable: null,
        previousSchedule: [],
      }
    },
    onSuccess: (meta) => {
      if (!meta?.targetTimetableId) {
        facultyTimetablesQuery.refetch()
        return
      }

      setEntriesOverride((current) => applyLocalTimetablePatch(current || entries, meta))
      setLastChange(meta)
      toast.success('Timetable cell saved')
      setCellModal((current) => ({ ...current, open: false }))
      facultyTimetablesQuery.refetch()
    },
    onError: (error) => {
      const message = error.message || 'Unable to save timetable cell'
      toast.error(message)
      if (
        /occupied|clash|conflict/i.test(String(message)) ||
        /This class already has a subject in this period/i.test(String(message)) ||
        /Faculty already assigned for this period/i.test(String(message))
      ) {
        setConflictDialog({ open: true, message })
      }
      facultyTimetablesQuery.refetch()
    },
  })

  const clearCellMutation = useMutation({
    mutationFn: async (existing) => {
      if (!existing?.timetableId) throw new Error('No timetable slot selected')

      const previousEntries = cloneEntries(entries)
      const previousTimetableRows = previousEntries.filter((item) => String(item.timetableId) === String(existing.timetableId))
      const previousTimetable = previousTimetableRows[0] || null
      const nextSchedule = toList(previousTimetable?.schedule).filter(
        (slot) =>
          !(String(slot.day).toLowerCase() === String(existing.day).toLowerCase() && Number(slot.periodNumber) === Number(existing.periodNumber))
      )

      await apiPut(`/timetable/${existing.timetableId}`, {
        schedule: nextSchedule,
      })

      return {
        targetTimetableId: existing.timetableId,
        schedule: nextSchedule,
        semester: previousTimetable?.semester,
        section: previousTimetable?.section,
        academicYear: previousTimetable?.academicYear,
        subjectId: previousTimetable?.subjectId,
        facultyId: previousTimetable?.facultyId,
        departmentId: previousTimetable?.departmentId,
        subjectType: previousTimetable?.subjectType,
        previousEntries,
        previousTimetable,
        previousSchedule: toList(previousTimetable?.schedule),
      }
    },
    onSuccess: (meta) => {
      setEntriesOverride((current) => applyLocalTimetablePatch(current || entries, meta))
      setLastChange(meta)
      toast.success('Slot cleared')
      setCellModal((current) => ({ ...current, open: false }))
      facultyTimetablesQuery.refetch()
    },
    onError: (error) => toast.error(error.message || 'Unable to clear slot'),
  })

  const undoMutation = useMutation({
    mutationFn: async (change) => {
      if (!change?.targetTimetableId) throw new Error('No change to undo')

      const restorePayload = {
        schedule: toList(change.previousSchedule),
      }

      if (change.previousTimetable) {
        restorePayload.facultyId = change.previousTimetable.facultyId
        restorePayload.subjectId = change.previousTimetable.subjectId
        restorePayload.subjectType = change.previousTimetable.subjectType
        restorePayload.academicYear = change.previousTimetable.academicYear
      }

      await apiPut(`/timetable/${change.targetTimetableId}`, restorePayload)

      return change.previousEntries
    },
    onSuccess: (previousEntries) => {
      setEntriesOverride(previousEntries)
      setLastChange(null)
      toast.success('Last change has been undone')
      facultyTimetablesQuery.refetch()
    },
    onError: (error) => toast.error(error.message || 'Unable to undo last change'),
  })

  const openCellModal = (day, periodNumber) => {
    const existing = getCell(day, periodNumber) || null
    const classKey = selectedClass ? selectedClass.key : ''

    setCellModal({
      open: true,
      day,
      periodNumber,
      existing,
      form: {
        subjectId: existing?.subjectId || '',
        facultyId: existing?.facultyId || selectedFacultyId || '',
        roomNo: existing?.roomNo || '',
        isLab: String(existing?.subjectType || '').toLowerCase() === 'lab',
        span: 1,
        labGroup: 'A',
        classKey,
      },
    })
  }

  const saveCell = () => {
    if (!cellModal.form.subjectId || !cellModal.form.facultyId) {
      toast.error('Subject and faculty are required')
      return
    }

    saveCellMutation.mutate({
      day: cellModal.day,
      periodNumber: cellModal.periodNumber,
      form: cellModal.form,
      existing: cellModal.existing,
    })
  }

  const filteredFacultyForSubject = useMemo(() => {
    if (!cellModal.form.subjectId) return facultyRows

    return facultyRows.filter((faculty) => {
      const subjectsAssigned = toList(faculty.subjectsAssigned)
      if (!subjectsAssigned.length) return true
      return subjectsAssigned.some(
        (subject) => String(subject.subjectId || subject._id || subject.id) === String(cellModal.form.subjectId)
      )
    })
  }, [cellModal.form.subjectId, facultyRows])

  const matchesSearch = (entry) => {
    const query = String(searchQuery || '').trim().toLowerCase()
    if (!query) return true

    const subject = subjectMap.get(String(entry?.subjectId || ''))
    const faculty = facultyMap.get(String(entry?.facultyId || ''))
    const classLabel = formatClassLabel(entry?.semester, entry?.section).toLowerCase()

    const haystack = [
      subject?.name,
      subject?.subjectName,
      subject?.subjectCode,
      subject?.code,
      faculty?.name,
      classLabel,
      entry?.roomNo,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-xl font-bold text-slate-900">Timetable Builder</h1>
              <div className="inline-flex rounded-lg border border-slate-300 p-1 text-sm">
                <button type="button" onClick={() => setViewMode('class')} className={`rounded-md px-3 py-1.5 ${viewMode === 'class' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>Class View</button>
                <button type="button" onClick={() => setViewMode('faculty')} className={`rounded-md px-3 py-1.5 ${viewMode === 'faculty' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>Faculty View</button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Academic Year</span>
                <input type="text" value={selectedAcademicYear} onChange={(event) => setSelectedAcademicYear(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>

              {viewMode === 'class' ? (
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Class</span>
                  <select value={selectedClassKey} onChange={(event) => setSelectedClassKey(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                    {classOptions.map((item) => (
                      <option key={item.key} value={item.key}>{item.key}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Faculty</span>
                  <select value={selectedFacultyId} onChange={(event) => setSelectedFacultyId(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                    {facultyRows.map((faculty) => (
                      <option key={faculty._id} value={faculty._id}>{faculty.name}</option>
                    ))}
                  </select>
                </label>
              )}

              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Search (Faculty / Class / Subject)</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by faculty, class, or subject"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-emerald-700">Theory</span>
              <span className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-indigo-700">Lab</span>
              <span className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-rose-700">Occupied</span>
              <span className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600">Free</span>
              <button
                type="button"
                onClick={() => undoMutation.mutate(lastChange)}
                disabled={!lastChange || undoMutation.isPending}
                className="ml-auto rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
              >
                {undoMutation.isPending ? 'Undoing...' : 'Undo Last Save'}
              </button>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[1100px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="px-3 py-2 text-left text-xs uppercase tracking-wide">Day</th>
                    {periods.map((period) => (
                      <th key={period.number} className="px-3 py-2 text-left text-xs uppercase tracking-wide">
                        <p>P{period.number}</p>
                        <p className="font-normal normal-case text-[10px] text-slate-200">{period.time}</p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((dayLabel, dayIndex) => (
                    <tr key={dayLabel} className="border-b border-slate-200 even:bg-slate-50">
                      <th className="px-3 py-2 text-left align-top font-semibold text-slate-900">{dayLabel}</th>
                      {periods.map((period, periodIndex) => {
                        const dayKey = DAY_KEYS[dayIndex]
                        const cell = getCell(dayLabel, period.number)
                        const subject = subjectMap.get(String(cell?.subjectId || ''))
                        const faculty = facultyMap.get(String(cell?.facultyId || ''))
                        const isOccupied = Boolean(cell)
                        const isLab = String(cell?.subjectType || '').toLowerCase() === 'lab' || Boolean(cell?.isLab)
                        const isSearchMatch = !cell || matchesSearch(cell)

                        const detailText = isOccupied
                          ? `${subject?.name || subject?.subjectName || 'Subject'} ${subject?.subjectCode || subject?.code || ''} | ${
                              faculty?.name || 'Faculty'
                            } | ${formatClassLabel(cell?.semester, cell?.section)} | Room ${cell?.roomNo || '-'}`
                          : `${dayLabel} Period ${period.number} is free`

                        const slotClass = isOccupied
                          ? isLab
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-900'
                          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'

                        return (
                          <td key={`${dayKey}-${period.number}`} className="px-2 py-2">
                            <div
                              title={detailText}
                              className={`w-full rounded-lg border px-2 py-2 text-left text-xs transition ${slotClass} ${
                                !isSearchMatch ? 'opacity-40' : ''
                              }`}
                            >
                              {cell ? (
                                <>
                                  <p className="font-semibold">{subject?.name || subject?.subjectName || 'Subject'}</p>
                                  <p>{subject?.subjectCode || subject?.code || '-'}</p>
                                  <p>{faculty?.name || 'Faculty'}</p>
                                  <p>{formatClassLabel(cell.semester, cell.section)}</p>
                                  <p>Room {cell.roomNo || '-'}</p>
                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide">{isLab ? 'Lab Session' : 'Theory Session'}</span>
                                    <button
                                      type="button"
                                      onClick={() => openCellModal(dayLabel, period.number)}
                                      className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                      Edit
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <p className="text-slate-500">Free Slot</p>
                                  <button
                                    type="button"
                                    onClick={() => openCellModal(dayLabel, period.number)}
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                  >
                                    Assign
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>


        </div>
      </main>

      {cellModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <section className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Assign Slot • {cellModal.day} • Period {cellModal.periodNumber}</h3>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Class</span>
                <select
                  value={cellModal.form.classKey}
                  onChange={(event) => setCellModal((current) => ({ ...current, form: { ...current.form, classKey: event.target.value } }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {classOptions.map((item) => (
                    <option key={item.key} value={item.key}>{item.key}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Subject</span>
                <select
                  value={cellModal.form.subjectId}
                  onChange={(event) => setCellModal((current) => ({ ...current, form: { ...current.form, subjectId: event.target.value } }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="">Select subject</option>
                  {subjectOptionsBySemester.map((group) => (
                    <optgroup key={`subject-cell-sem-${group.semester}`} label={`Semester ${group.semester}`}>
                      {group.rows.map((subject) => (
                        <option key={subject._id} value={subject._id}>
                          {subject.name || subject.subjectName} ({subject.subjectCode || subject.code || '-'})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Faculty</span>
                <select
                  value={cellModal.form.facultyId}
                  onChange={(event) => setCellModal((current) => ({ ...current, form: { ...current.form, facultyId: event.target.value } }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="">Select faculty</option>
                  {filteredFacultyForSubject.map((faculty) => (
                    <option key={faculty._id} value={faculty._id}>{faculty.name}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Room No</span>
                <input
                  type="text"
                  value={cellModal.form.roomNo}
                  onChange={(event) => setCellModal((current) => ({ ...current, form: { ...current.form, roomNo: event.target.value } }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={cellModal.form.isLab}
                  onChange={(event) => setCellModal((current) => ({ ...current, form: { ...current.form, isLab: event.target.checked } }))}
                />
                Lab session
              </label>

              {cellModal.form.isLab && (
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Span</span>
                    <select
                      value={cellModal.form.span}
                      onChange={(event) => setCellModal((current) => ({ ...current, form: { ...current.form, span: Number(event.target.value) } }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Lab Group</span>
                    <select
                      value={cellModal.form.labGroup}
                      onChange={(event) => setCellModal((current) => ({ ...current, form: { ...current.form, labGroup: event.target.value } }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                    </select>
                  </label>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCellModal((current) => ({ ...current, open: false }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              {cellModal.existing ? (
                <button
                  type="button"
                  onClick={() => clearCellMutation.mutate(cellModal.existing)}
                  className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                  disabled={clearCellMutation.isPending}
                >
                  {clearCellMutation.isPending ? 'Clearing...' : 'Clear Slot'}
                </button>
              ) : null}
              <button type="button" onClick={saveCell} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" disabled={saveCellMutation.isPending}>{saveCellMutation.isPending ? 'Saving...' : 'Save Cell'}</button>
            </div>
          </section>
        </div>
      )}

      {conflictDialog.open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 px-4">
          <section className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-rose-700">Conflict Warning</h3>
            <p className="mt-2 text-sm text-slate-700">{conflictDialog.message}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setConflictDialog({ open: false, message: '' })}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              >
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
