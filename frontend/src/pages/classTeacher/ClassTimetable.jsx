import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@/lib/dataClientHooks.jsx'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import PageHeader from '@/components/shared/PageHeader'
import Spinner from '@/components/shared/Spinner'
import { classTeacherApi } from '@/api/classTeacherApi'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8]

const toSafeArray = (value) => (Array.isArray(value) ? value : [])

const getClassLabel = (classRow) => {
  const dept = classRow.departmentCode || classRow.departmentName || 'Dept'
  return `${dept} • Semester ${classRow.semester} • Section ${classRow.section}`
}

const buildScheduleGrid = (scheduleRows) => {
  const grid = new Map()

  toSafeArray(scheduleRows).forEach((slot) => {
    const dayKey = String(slot.day || '')
    const periodKey = Number(slot.periodNumber)
    if (!dayKey || !Number.isFinite(periodKey)) return

    const key = `${dayKey}-${periodKey}`
    if (!grid.has(key)) {
      grid.set(key, [])
    }

    grid.get(key).push(slot)
  })

  return grid
}

export default function ClassTimetable() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('')

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const timetableQuery = useQuery({
    queryKey: ['class-teacher-timetable', selectedAcademicYear],
    queryFn: () =>
      classTeacherApi.getAssignedTimetable({
        academicYear: selectedAcademicYear || undefined,
      }),
    select: (response) => response?.data || response || {},
  })

  const payload = timetableQuery.data || {}
  const classes = toSafeArray(payload.classes)
  const availableAcademicYears = toSafeArray(payload.availableAcademicYears)
  const activeAcademicYear = payload.academicYear || ''

  useEffect(() => {
    if (!selectedAcademicYear && activeAcademicYear) {
      setSelectedAcademicYear(activeAcademicYear)
    }
  }, [activeAcademicYear, selectedAcademicYear])

  const classCards = useMemo(
    () =>
      classes.map((classRow) => ({
        ...classRow,
        label: getClassLabel(classRow),
        scheduleGrid: buildScheduleGrid(classRow.schedule),
      })),
    [classes]
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <PageHeader
            title="Assigned Class Timetable"
            subtitle="Complete weekly timetable for all classes assigned to you as class teacher."
            actions={[
              {
                label: timetableQuery.isFetching ? 'Refreshing...' : 'Refresh',
                onClick: () => timetableQuery.refetch(),
                variant: 'secondary',
              },
            ]}
          />

          <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Academic Year</span>
              <select
                value={selectedAcademicYear}
                onChange={(event) => setSelectedAcademicYear(event.target.value)}
                className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none"
              >
                {availableAcademicYears.map((year) => (
                  <option key={String(year)} value={String(year)}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {timetableQuery.isLoading ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <Spinner />
            </section>
          ) : classCards.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
              No class timetable assignments found for this academic year.
            </section>
          ) : (
            <div className="space-y-5">
              {classCards.map((classRow) => (
                <section key={`${classRow.departmentId}-${classRow.semester}-${classRow.section}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{classRow.label}</h2>
                      <p className="text-sm text-slate-500">Total weekly slots: {classRow.totalSlots}</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-[980px] w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Period</th>
                          {DAYS.map((day) => (
                            <th key={day} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">{day}</th>
                          ))}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-200">
                        {PERIODS.map((period) => (
                          <tr key={period}>
                            <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-800">Period {period}</td>
                            {DAYS.map((day) => {
                              const slots = classRow.scheduleGrid.get(`${day}-${period}`) || []

                              return (
                                <td key={`${day}-${period}`} className="px-4 py-3 align-top">
                                  {slots.length === 0 ? (
                                    <span className="text-xs text-slate-400">—</span>
                                  ) : (
                                    <div className="space-y-2">
                                      {slots.map((slot, index) => (
                                        <article key={`${slot.subjectId}-${slot.periodNumber}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                                          <p className="text-sm font-semibold text-slate-900">{slot.subjectName || 'Subject'}</p>
                                          <p className="text-xs text-slate-600">{slot.subjectCode || '-'}</p>
                                          <p className="text-xs text-slate-600">{slot.startTime && slot.endTime ? `${slot.startTime} - ${slot.endTime}` : 'Time not set'}</p>
                                          <p className="text-xs text-slate-600">Faculty: {slot.facultyName || '-'}</p>
                                          <p className="text-xs text-slate-600">Room: {slot.roomNo || '-'}</p>
                                        </article>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
