import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import { adminApi } from '@/api/adminApi'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8]

const toList = (value) => (Array.isArray(value) ? value : [])
const readData = (response) => response?.data || response || {}
const toRows = (response, key = 'items') => {
  const payload = readData(response)
  if (Array.isArray(payload[key])) return payload[key]
  if (Array.isArray(payload.items)) return payload.items
  if (Array.isArray(payload.data)) return payload.data
  if (Array.isArray(payload)) return payload
  return []
}

const getId = (value) => {
  if (!value) return ''
  if (typeof value === 'object') return String(value._id || value.id || '')
  return String(value)
}

const createEmptySlot = () => ({
  day: 'Monday',
  periodNumber: 1,
  startTime: '09:00',
  endTime: '10:00',
  roomNo: '',
  isLab: false,
})

const createEmptyForm = (defaults = {}) => ({
  facultyId: defaults.facultyId || '',
  subjectId: defaults.subjectId || '',
  departmentId: defaults.departmentId || '',
  semester: defaults.semester || '',
  section: defaults.section || '',
  academicYear: defaults.academicYear || '',
  subjectType: defaults.subjectType || 'theory',
  classTeacherId: defaults.classTeacherId || '',
  isActive: defaults.isActive ?? true,
  schedule: defaults.schedule && defaults.schedule.length ? defaults.schedule : [createEmptySlot()],
})

const formatSection = (section) => String(section || '').trim().toUpperCase() || '-'

const buildClassKey = (row) => [getId(row.departmentId), Number(row.semester || 0), formatSection(row.section), String(row.academicYear || '')].join('::')

const buildClassLabel = (row) => {
  const departmentLabel = row.departmentId?.code || row.departmentId?.name || 'Department'
  return `${departmentLabel} • Sem ${row.semester} • Sec ${formatSection(row.section)} • ${row.academicYear || 'Current'}`
}

const buildSlotLabel = (slot) => {
  if (!slot) return 'No slot'
  const timeRange = slot.startTime && slot.endTime ? `${slot.startTime}-${slot.endTime}` : 'No time'
  return `${slot.day || '-'} P${slot.periodNumber || '-'} ${timeRange}`
}

const flattenTimetables = (rows) =>
  toList(rows).flatMap((row) =>
    toList(row.schedule).map((slot) => ({
      timetableId: row._id,
      departmentId: row.departmentId?._id || row.departmentId,
      departmentName: row.departmentId?.name || '',
      departmentCode: row.departmentId?.code || '',
      facultyId: row.facultyId?._id || row.facultyId,
      facultyName: row.facultyId?.name || '',
      subjectId: row.subjectId?._id || row.subjectId,
      subjectName: row.subjectId?.name || '',
      subjectCode: row.subjectId?.subjectCode || '',
      subjectType: row.subjectType || row.subjectId?.type || (slot.isLab ? 'lab' : 'theory'),
      classTeacherId: row.classTeacherId?._id || row.classTeacherId || '',
      semester: Number(row.semester || 0),
      section: formatSection(row.section),
      academicYear: row.academicYear || '',
      isActive: row.isActive !== false,
      day: slot.day || '',
      periodNumber: Number(slot.periodNumber || 0),
      startTime: slot.startTime || '',
      endTime: slot.endTime || '',
      roomNo: slot.roomNo || '',
      isLab: Boolean(slot.isLab),
      labGroupId: slot.labGroupId || '',
      timetable: row,
    }))
  )

const toCsvValue = (value) => {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

const downloadCsv = (filename, rows) => {
  const headers = [
    'Department',
    'Class',
    'Semester',
    'Section',
    'Academic Year',
    'Faculty',
    'Subject',
    'Subject Type',
    'Day',
    'Period',
    'Start Time',
    'End Time',
    'Room',
    'Status',
  ]

  const lines = [
    headers.join(','),
    ...toList(rows).map((row) =>
      [
        row.departmentCode || row.departmentName || '',
        `Sem ${row.semester}`,
        row.semester,
        row.section,
        row.academicYear,
        row.facultyName,
        [row.subjectCode, row.subjectName].filter(Boolean).join(' - '),
        row.subjectType || '',
        row.day,
        row.periodNumber,
        row.startTime,
        row.endTime,
        row.roomNo,
        row.isActive ? 'Active' : 'Inactive',
      ]
        .map(toCsvValue)
        .join(',')
    ),
  ]

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export default function AdminTimetable() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('')
  const [selectedSemester, setSelectedSemester] = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('')
  const [selectedFacultyId, setSelectedFacultyId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedClassKey, setSelectedClassKey] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState(createEmptyForm())

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((current) => !current)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const departmentsQuery = useQuery({
    queryKey: ['admin-timetable', 'departments'],
    queryFn: () => adminApi.getDepartments(),
  })

  const facultyQuery = useQuery({
    queryKey: ['admin-timetable', 'faculty'],
    queryFn: () => adminApi.getFaculty({ page: 1, limit: 100 }),
  })

  const subjectsQuery = useQuery({
    queryKey: ['admin-timetable', 'subjects'],
    queryFn: () => adminApi.getSubjects({ page: 1, limit: 100 }),
  })

  const timetableQuery = useQuery({
    queryKey: ['admin-timetable', 'all', showInactive],
    queryFn: () =>
      adminApi.getTimetable({
        all: 'true',
        includeInactive: showInactive ? 'true' : 'false',
      }),
  })

  const departmentRows = useMemo(() => {
    const payload = readData(departmentsQuery.data)
    if (Array.isArray(payload.departments)) return payload.departments
    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload)) return payload
    return []
  }, [departmentsQuery.data])

  const facultyRows = useMemo(() => toRows(facultyQuery.data, 'faculty'), [facultyQuery.data])
  const subjectRows = useMemo(() => toRows(subjectsQuery.data, 'subjects'), [subjectsQuery.data])
  const timetableRows = useMemo(() => toRows(timetableQuery.data, 'timetables'), [timetableQuery.data])
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

  const timetableSlots = useMemo(() => flattenTimetables(timetableRows), [timetableRows])

  const departmentOptions = useMemo(() => {
    const map = new Map()
    departmentRows.forEach((department) => {
      map.set(String(department._id), department)
    })

    timetableRows.forEach((row) => {
      const departmentId = getId(row.departmentId)
      if (!departmentId || map.has(departmentId)) return
      map.set(departmentId, {
        _id: departmentId,
        name: row.departmentId?.name || row.departmentName || 'Department',
        code: row.departmentId?.code || row.departmentCode || 'DEP',
      })
    })

    return Array.from(map.values()).sort((left, right) => String(left.code || left.name).localeCompare(String(right.code || right.name)))
  }, [departmentRows, timetableRows])

  const filteredTimetables = useMemo(() => {
    const query = String(searchQuery || '').trim().toLowerCase()

    return timetableRows.filter((row) => {
      if (selectedDepartmentId && getId(row.departmentId) !== selectedDepartmentId) return false
      if (selectedSemester && Number(row.semester) !== Number(selectedSemester)) return false
      if (selectedSection && formatSection(row.section) !== formatSection(selectedSection)) return false
      if (selectedAcademicYear && String(row.academicYear || '').trim() !== String(selectedAcademicYear || '').trim()) return false
      if (selectedFacultyId && getId(row.facultyId) !== selectedFacultyId) return false
      if (selectedSubjectId && getId(row.subjectId) !== selectedSubjectId) return false

      if (!query) return true

      const haystack = [
        row.departmentId?.name,
        row.departmentId?.code,
        row.facultyId?.name,
        row.subjectId?.name,
        row.subjectId?.subjectCode,
        row.semester,
        row.section,
        row.academicYear,
        toList(row.schedule)
          .map((slot) => [slot.day, slot.periodNumber, slot.startTime, slot.endTime, slot.roomNo].filter(Boolean).join(' '))
          .join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [searchQuery, selectedAcademicYear, selectedDepartmentId, selectedFacultyId, selectedSection, selectedSemester, selectedSubjectId, timetableRows])

  const classOptions = useMemo(() => {
    const map = new Map()

    filteredTimetables.forEach((row) => {
      const key = buildClassKey(row)
      if (!map.has(key)) {
        map.set(key, {
          key,
          departmentId: getId(row.departmentId),
          departmentName: row.departmentId?.name || row.departmentName || '',
          departmentCode: row.departmentId?.code || row.departmentCode || '',
          semester: Number(row.semester),
          section: formatSection(row.section),
          academicYear: row.academicYear || '',
          rows: [],
        })
      }

      map.get(key).rows.push(row)
    })

    return Array.from(map.values()).sort((left, right) => left.key.localeCompare(right.key))
  }, [filteredTimetables])

  const departmentSummary = useMemo(() => {
    const map = new Map()

    filteredTimetables.forEach((row) => {
      const departmentId = getId(row.departmentId) || 'unknown'
      if (!map.has(departmentId)) {
        map.set(departmentId, {
          departmentId,
          departmentName: row.departmentId?.name || row.departmentName || 'Unknown Department',
          departmentCode: row.departmentId?.code || row.departmentCode || 'DEP',
          timetableCount: 0,
          slotCount: 0,
          classMap: new Map(),
          facultySet: new Set(),
          subjectSet: new Set(),
        })
      }

      const bucket = map.get(departmentId)
      bucket.timetableCount += 1
      bucket.slotCount += toList(row.schedule).length
      bucket.classMap.set(buildClassKey(row), true)
      if (getId(row.facultyId)) bucket.facultySet.add(getId(row.facultyId))
      if (getId(row.subjectId)) bucket.subjectSet.add(getId(row.subjectId))
    })

    return Array.from(map.values())
      .map((bucket) => ({
        ...bucket,
        classCount: bucket.classMap.size,
        facultyCount: bucket.facultySet.size,
        subjectCount: bucket.subjectSet.size,
      }))
      .sort((left, right) => String(left.departmentCode || left.departmentName).localeCompare(String(right.departmentCode || right.departmentName)))
  }, [filteredTimetables])

  const activeClassKey = selectedClassKey || classOptions[0]?.key || ''
  const selectedClass = useMemo(() => classOptions.find((item) => item.key === activeClassKey) || null, [activeClassKey, classOptions])
  const activeDepartmentId = selectedDepartmentId || ''

  const selectedClassSlots = useMemo(() => {
    if (!selectedClass) return []
    return filteredTimetables.filter(
      (row) =>
        getId(row.departmentId) === selectedClass.departmentId &&
        Number(row.semester) === Number(selectedClass.semester) &&
        formatSection(row.section) === formatSection(selectedClass.section) &&
        String(row.academicYear || '') === String(selectedClass.academicYear || '')
    )
  }, [filteredTimetables, selectedClass])

  const gridMap = useMemo(() => {
    const map = new Map()

    selectedClassSlots.forEach((row) => {
      toList(row.schedule).forEach((slot) => {
        map.set(`${String(slot.day || '').toLowerCase()}-${Number(slot.periodNumber || 0)}`, {
          row,
          slot,
        })
      })
    })

    return map
  }, [selectedClassSlots])

  const openCreate = () => {
    setEditingId('')
    setForm(
      createEmptyForm({
        departmentId: activeDepartmentId || selectedClass?.departmentId || '',
        semester: selectedSemester || '',
        section: selectedSection || '',
        academicYear: selectedClass?.academicYear || selectedAcademicYear || '',
      })
    )
    setEditorOpen(true)
  }

  const openEdit = (row) => {
    setEditingId(row._id)
    setForm(
      createEmptyForm({
        facultyId: getId(row.facultyId),
        subjectId: getId(row.subjectId),
        departmentId: getId(row.departmentId),
        semester: String(row.semester || ''),
        section: formatSection(row.section),
        academicYear: row.academicYear || '',
        subjectType: row.subjectType || 'theory',
        classTeacherId: getId(row.classTeacherId),
        isActive: row.isActive !== false,
        schedule: toList(row.schedule).length ? toList(row.schedule).map((slot) => ({ ...slot, isLab: Boolean(slot.isLab) })) : [createEmptySlot()],
      })
    )
    setEditorOpen(true)
  }

  const resetEditor = () => {
    setEditingId('')
    setEditorOpen(false)
    setForm(createEmptyForm())
  }

  const createPayload = () => ({
    facultyId: form.facultyId,
    subjectId: form.subjectId,
    departmentId: form.departmentId,
    semester: Number(form.semester),
    section: formatSection(form.section),
    academicYear: String(form.academicYear || '').trim(),
    subjectType: form.subjectType,
    classTeacherId: form.classTeacherId || undefined,
    isActive: Boolean(form.isActive),
    schedule: toList(form.schedule)
      .filter((slot) => slot.day && Number.isFinite(Number(slot.periodNumber)))
      .map((slot) => ({
        day: slot.day,
        periodNumber: Number(slot.periodNumber),
        startTime: slot.startTime,
        endTime: slot.endTime,
        roomNo: slot.roomNo || '',
        isLab: Boolean(slot.isLab) || String(form.subjectType).toLowerCase() === 'lab',
        labGroupId: slot.labGroupId || undefined,
      })),
  })

  const saveMutation = useMutation({
    mutationFn: (payload) => (editingId ? adminApi.updateTimetable(editingId, payload) : adminApi.createTimetable(payload)),
    onSuccess: () => {
      toast.success(editingId ? 'Timetable updated' : 'Timetable created')
      timetableQuery.refetch()
      resetEditor()
    },
    onError: (error) => toast.error(error.message || 'Unable to save timetable'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id) => adminApi.deleteTimetable(id),
    onSuccess: () => {
      toast.success('Timetable deactivated')
      timetableQuery.refetch()
    },
    onError: (error) => toast.error(error.message || 'Unable to deactivate timetable'),
  })

  const handleSubmit = (event) => {
    event.preventDefault()

    const payload = createPayload()
    if (!payload.facultyId || !payload.subjectId || !payload.departmentId || !payload.semester || !payload.section || !payload.academicYear) {
      toast.error('Please fill all required fields')
      return
    }

    if (!payload.schedule.length) {
      toast.error('Add at least one schedule slot')
      return
    }

    saveMutation.mutate(payload)
  }

  const updateSlot = (index, field, value) => {
    setForm((current) => ({
      ...current,
      schedule: current.schedule.map((slot, slotIndex) => (slotIndex === index ? { ...slot, [field]: value } : slot)),
    }))
  }

  const addSlot = () => {
    setForm((current) => ({
      ...current,
      schedule: [...current.schedule, createEmptySlot()],
    }))
  }

  const removeSlot = (index) => {
    setForm((current) => ({
      ...current,
      schedule: current.schedule.length > 1 ? current.schedule.filter((_, slotIndex) => slotIndex !== index) : [createEmptySlot()],
    }))
  }

  const printSchedule = () => {
    window.print()
  }

  const downloadVisible = () => {
    const exportRows = flattenTimetables(filteredTimetables)
    downloadCsv(`timetable-${new Date().toISOString().slice(0, 10)}.csv`, exportRows)
  }

  const selectedGridRows = useMemo(() => {
    return PERIODS.map((period) =>
      DAYS.map((day) => {
        const cell = gridMap.get(`${day.toLowerCase()}-${period}`) || null
        return { day, period, cell }
      })
    )
  }, [gridMap])

  const printRows = useMemo(() => flattenTimetables(selectedClassSlots), [selectedClassSlots])

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72 print:pt-0 print:pl-0">
        <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-5 text-white shadow-xl print:hidden">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs uppercase tracking-[0.25em] text-sky-200">Admin timetable studio</p>
                <h1 className="mt-2 text-3xl font-semibold">Department, class, and faculty timetable control</h1>
                <p className="mt-3 max-w-2xl text-sm text-slate-300">
                  Review every timetable across departments, narrow to a specific class, inspect faculty and subject timings, edit schedules, and export what you are seeing.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={openCreate} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100">
                  New Timetable
                </button>
                <button type="button" onClick={downloadVisible} className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
                  Download CSV
                </button>
                <button type="button" onClick={printSchedule} className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
                  Print View
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Timetables', value: timetableRows.length },
                { label: 'Departments', value: departmentSummary.length || departmentOptions.length },
                { label: 'Classes', value: classOptions.length },
                { label: 'Schedule slots', value: timetableSlots.length },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-300">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
                <p className="text-sm text-slate-500">Use department, semester, section, year, faculty, and subject filters to focus the timetable board.</p>
              </div>

              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-slate-900" />
                Show inactive timetables
              </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search department, faculty, subject, room" className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-400" />

              <select value={selectedDepartmentId} onChange={(event) => setSelectedDepartmentId(event.target.value)} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-400">
                <option value="">All departments</option>
                {departmentOptions.map((department) => (
                  <option key={department._id} value={department._id}>
                    {department.code || department.name}
                  </option>
                ))}
              </select>

              <input value={selectedAcademicYear} onChange={(event) => setSelectedAcademicYear(event.target.value)} placeholder="Academic year" className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-400" />

              <select value={selectedSemester} onChange={(event) => setSelectedSemester(event.target.value)} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-400">
                <option value="">All semesters</option>
                {Array.from({ length: 8 }, (_, index) => index + 1).map((semester) => (
                  <option key={semester} value={semester}>
                    Semester {semester}
                  </option>
                ))}
              </select>

              <input value={selectedSection} onChange={(event) => setSelectedSection(event.target.value.toUpperCase())} placeholder="Section" className="rounded-2xl border border-slate-300 px-4 py-3 text-sm uppercase outline-none transition focus:border-slate-400" />

              <select value={selectedFacultyId} onChange={(event) => setSelectedFacultyId(event.target.value)} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-400">
                <option value="">All faculty</option>
                {facultyRows.map((faculty) => (
                  <option key={faculty._id} value={faculty._id}>
                    {faculty.employeeId || faculty.name} - {faculty.name}
                  </option>
                ))}
              </select>

              <select value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-400">
                <option value="">All subjects</option>
                {subjectOptionsBySemester.map((group) => (
                  <optgroup key={`subject-filter-sem-${group.semester}`} label={`Semester ${group.semester}`}>
                    {group.rows.map((subject) => (
                      <option key={subject._id} value={subject._id}>
                        {subject.subjectCode || subject.code || subject.name} - {subject.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm print:border-0 print:shadow-none">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Selected class schedule</h2>
                  <p className="text-sm text-slate-500">{selectedClass ? buildClassLabel(selectedClass) : 'Pick a class from the list to inspect its weekly schedule.'}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={openCreate} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                    Add timetable
                  </button>
                  <button type="button" onClick={downloadVisible} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                    Export filtered rows
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[1100px] w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-3 text-left font-semibold text-slate-700">Period</th>
                      {DAYS.map((day) => (
                        <th key={day} className="border-b border-slate-200 bg-slate-50 px-3 py-3 text-left font-semibold text-slate-700">
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGridRows.map((row) => (
                      <tr key={row[0].period} className="align-top">
                        <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-3 font-semibold text-slate-700">
                          P{row[0].period}
                        </td>
                        {row.map(({ day, period, cell }) => (
                          <td key={`${day}-${period}`} className="min-w-[180px] border-b border-slate-100 px-2 py-2 align-top">
                            {cell ? (
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">{day}</p>
                                <p className="mt-1 font-semibold text-slate-900">{cell.row?.subjectId?.subjectCode || cell.row?.subjectId?.code || 'Subject'} - {cell.row?.subjectId?.name || 'Unnamed'}</p>
                                <p className="mt-1 text-xs text-slate-600">Faculty: {cell.row?.facultyId?.name || 'Unknown'}</p>
                                <p className="text-xs text-slate-600">Room: {cell.slot.roomNo || '-'}</p>
                                <p className="text-xs text-slate-600">{buildSlotLabel(cell.slot)}</p>
                                <div className="mt-3 flex gap-2">
                                  <button type="button" onClick={() => openEdit(cell.row)} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700">
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deactivateMutation.mutate(cell.row?._id)}
                                    disabled={deactivateMutation.isPending || cell.row?.isActive === false}
                                    className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 disabled:opacity-50"
                                  >
                                    Deactivate
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                                Empty slot
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {departmentSummary.map((department) => (
                  <button
                    key={department.departmentId}
                    type="button"
                    onClick={() => setSelectedDepartmentId(department.departmentId)}
                    className={`rounded-2xl border p-4 text-left transition ${activeDepartmentId === department.departmentId ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                  >
                    <p className={`text-xs uppercase tracking-[0.18em] ${activeDepartmentId === department.departmentId ? 'text-slate-300' : 'text-slate-500'}`}>
                      {department.departmentCode || department.departmentName}
                    </p>
                    <p className="mt-2 text-base font-semibold">{department.departmentName}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <span>Classes: {department.classCount}</span>
                      <span>Slots: {department.slotCount}</span>
                      <span>Faculty: {department.facultyCount}</span>
                      <span>Subjects: {department.subjectCount}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Classes</h3>
                    <p className="text-sm text-slate-500">Pick a class to inspect its weekly schedule.</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{classOptions.length} classes</span>
                </div>

                <div className="mt-4 space-y-2 max-h-[26rem] overflow-auto pr-1">
                  {classOptions.length ? (
                    classOptions.map((item) => (
                      <button
                        type="button"
                        key={item.key}
                        onClick={() => setSelectedClassKey(item.key)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${activeClassKey === item.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{item.departmentCode || item.departmentName}</p>
                            <p className="text-xs opacity-80">Sem {item.semester} • Sec {item.section}</p>
                          </div>
                          <span className="text-xs opacity-70">{item.rows.length} timetable rows</span>
                        </div>
                        <p className="mt-2 text-xs opacity-80">{item.academicYear || 'Academic year not set'}</p>
                      </button>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No classes match the current filters.</p>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
                <h3 className="text-base font-semibold text-slate-900">Filtered timetable rows</h3>
                <p className="text-sm text-slate-500">Edit individual timetable records, deactivate rows, or export the current filtered result.</p>

                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="max-h-[28rem] overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-3 py-3">Class</th>
                          <th className="px-3 py-3">Faculty</th>
                          <th className="px-3 py-3">Subject</th>
                          <th className="px-3 py-3">Timing</th>
                          <th className="px-3 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTimetables.map((row) => {
                          const slot = toList(row.schedule)[0] || null
                          return (
                            <tr key={row._id} className="border-t border-slate-100">
                              <td className="px-3 py-3">
                                <p className="font-semibold text-slate-900">{buildClassLabel(row)}</p>
                                <p className="text-xs text-slate-500">{row.isActive === false ? 'Inactive' : 'Active'}</p>
                              </td>
                              <td className="px-3 py-3">{row.facultyId?.name || '-'}</td>
                              <td className="px-3 py-3">
                                <p className="font-medium text-slate-900">{row.subjectId?.subjectCode || row.subjectId?.code || '-'}</p>
                                <p className="text-xs text-slate-500">{row.subjectId?.name || '-'}</p>
                              </td>
                              <td className="px-3 py-3 text-slate-700">{slot ? buildSlotLabel(slot) : '-'}</td>
                              <td className="px-3 py-3">
                                <div className="flex flex-wrap gap-2">
                                  <button type="button" onClick={() => openEdit(row)} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700">
                                    Edit
                                  </button>
                                  <button type="button" onClick={() => deactivateMutation.mutate(row._id)} disabled={deactivateMutation.isPending || row.isActive === false} className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 disabled:opacity-50">
                                    Deactivate
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                        {!filteredTimetables.length && (
                          <tr>
                            <td className="px-3 py-8 text-center text-slate-500" colSpan={5}>
                              No timetable records match the current filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>
          </section>

          <section className="mt-6 hidden rounded-3xl border border-slate-200 bg-white p-6 print:block">
            <h2 className="text-2xl font-semibold text-slate-900">Timetable Print View</h2>
            <p className="mt-1 text-sm text-slate-600">{selectedClass ? buildClassLabel(selectedClass) : 'Filtered timetable data'}</p>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Department</th>
                    <th className="px-3 py-2">Class</th>
                    <th className="px-3 py-2">Faculty</th>
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2">Timing</th>
                  </tr>
                </thead>
                <tbody>
                  {printRows.map((row, index) => (
                    <tr key={`${row.timetableId}-${index}`} className="border-t border-slate-100">
                      <td className="px-3 py-2">{row.departmentCode || row.departmentName || '-'}</td>
                      <td className="px-3 py-2">Sem {row.semester} / {row.section}</td>
                      <td className="px-3 py-2">{row.facultyName || '-'}</td>
                      <td className="px-3 py-2">{[row.subjectCode, row.subjectName].filter(Boolean).join(' - ') || '-'}</td>
                      <td className="px-3 py-2">{buildSlotLabel(row)}</td>
                    </tr>
                  ))}
                  {!printRows.length && (
                    <tr>
                      <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>
                        No rows to print.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10 print:hidden">
          <div className="w-full max-w-5xl rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Timetable editor</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">{editingId ? 'Update timetable row' : 'Create timetable row'}</h2>
                <p className="mt-1 text-sm text-slate-500">Edit the class, faculty, subject, and schedule slots in one place.</p>
              </div>
              <button type="button" onClick={resetEditor} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <select value={form.departmentId} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value }))} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm">
                  <option value="">Department</option>
                  {departmentOptions.map((department) => (
                    <option key={department._id} value={department._id}>
                      {department.code || department.name}
                    </option>
                  ))}
                </select>

                <select value={form.facultyId} onChange={(event) => setForm((current) => ({ ...current, facultyId: event.target.value }))} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm">
                  <option value="">Faculty</option>
                  {facultyRows.map((faculty) => (
                    <option key={faculty._id} value={faculty._id}>
                      {faculty.employeeId || faculty.name} - {faculty.name}
                    </option>
                  ))}
                </select>

                <select value={form.subjectId} onChange={(event) => setForm((current) => ({ ...current, subjectId: event.target.value }))} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm">
                  <option value="">Subject</option>
                  {subjectOptionsBySemester.map((group) => (
                    <optgroup key={`subject-editor-sem-${group.semester}`} label={`Semester ${group.semester}`}>
                      {group.rows.map((subject) => (
                        <option key={subject._id} value={subject._id}>
                          {subject.subjectCode || subject.code || subject.name} - {subject.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                <input type="number" min="1" max="8" value={form.semester} onChange={(event) => setForm((current) => ({ ...current, semester: event.target.value }))} placeholder="Semester" className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" />
                <input value={form.section} onChange={(event) => setForm((current) => ({ ...current, section: event.target.value.toUpperCase() }))} placeholder="Section" className="rounded-2xl border border-slate-300 px-4 py-3 text-sm uppercase" />
                <input value={form.academicYear} onChange={(event) => setForm((current) => ({ ...current, academicYear: event.target.value }))} placeholder="Academic year" className="rounded-2xl border border-slate-300 px-4 py-3 text-sm" />
                <select value={form.subjectType} onChange={(event) => setForm((current) => ({ ...current, subjectType: event.target.value }))} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm">
                  <option value="theory">Theory</option>
                  <option value="lab">Lab</option>
                  <option value="elective">Elective</option>
                </select>
                <select value={form.isActive ? 'true' : 'false'} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === 'true' }))} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm">
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
                <select value={form.classTeacherId} onChange={(event) => setForm((current) => ({ ...current, classTeacherId: event.target.value }))} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm">
                  <option value="">Class teacher</option>
                  {facultyRows.map((faculty) => (
                    <option key={faculty._id} value={faculty._id}>
                      {faculty.employeeId || faculty.name} - {faculty.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Schedule slots</h3>
                    <p className="text-sm text-slate-500">Add every day and period used by this timetable row.</p>
                  </div>
                  <button type="button" onClick={addSlot} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                    Add slot
                  </button>
                </div>

                <div className="space-y-3">
                  {form.schedule.map((slot, index) => (
                    <div key={`${slot.day}-${index}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-2 xl:grid-cols-7">
                      <select value={slot.day} onChange={(event) => updateSlot(index, 'day', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
                        {DAYS.map((day) => (
                          <option key={day} value={day}>
                            {day}
                          </option>
                        ))}
                      </select>

                      <select value={slot.periodNumber} onChange={(event) => updateSlot(index, 'periodNumber', Number(event.target.value))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
                        {PERIODS.map((period) => (
                          <option key={period} value={period}>
                            Period {period}
                          </option>
                        ))}
                      </select>

                      <input type="time" value={slot.startTime} onChange={(event) => updateSlot(index, 'startTime', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                      <input type="time" value={slot.endTime} onChange={(event) => updateSlot(index, 'endTime', event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                      <input value={slot.roomNo || ''} onChange={(event) => updateSlot(index, 'roomNo', event.target.value)} placeholder="Room" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                      <label className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700">
                        <input type="checkbox" checked={Boolean(slot.isLab)} onChange={(event) => updateSlot(index, 'isLab', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-slate-900" />
                        Lab slot
                      </label>

                      <div className="flex items-center justify-end md:col-span-2 xl:col-span-1">
                        <button type="button" onClick={() => removeSlot(index)} className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700">
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={resetEditor} className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700">
                  Cancel
                </button>
                <button type="submit" disabled={saveMutation.isPending} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  {editingId ? 'Update timetable' : 'Create timetable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
