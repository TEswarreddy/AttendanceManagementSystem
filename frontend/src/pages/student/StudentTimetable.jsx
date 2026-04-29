import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@/lib/dataClientHooks.jsx'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { apiGet } from '@/api/axiosInstance'

const DAY_COLUMNS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
]

const DAY_INDEX_TO_KEY = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
}

const DEFAULT_PERIOD_TIMES = {
  1: { start: '09:00', end: '09:50' },
  2: { start: '09:50', end: '10:40' },
  3: { start: '10:50', end: '11:40' },
  4: { start: '11:40', end: '12:30' },
  5: { start: '13:20', end: '14:10' },
  6: { start: '14:10', end: '15:00' },
  7: { start: '15:10', end: '16:00' },
  8: { start: '16:00', end: '16:50' },
}

const SUBJECT_COLORS = [
  'bg-rose-100 border-rose-200 text-rose-800',
  'bg-cyan-100 border-cyan-200 text-cyan-800',
  'bg-lime-100 border-lime-200 text-lime-800',
  'bg-amber-100 border-amber-200 text-amber-800',
  'bg-violet-100 border-violet-200 text-violet-800',
  'bg-sky-100 border-sky-200 text-sky-800',
  'bg-orange-100 border-orange-200 text-orange-800',
]

const parseMinutes = (timeValue) => {
  if (!timeValue) {
    return null
  }

  const match = String(timeValue).match(/(\d{1,2}):(\d{2})/)
  if (!match) {
    return null
  }

  const hour = Number(match[1])
  const minute = Number(match[2])

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null
  }

  return hour * 60 + minute
}

const getSubjectKey = (slot) => {
  return String(slot.subjectCode || slot.subjectName || slot.subjectId || 'misc')
}

const readTimetablePayload = (response) => {
  const top = response?.data || response || {}
  if (top && typeof top === 'object' && top.data && typeof top.data === 'object' && !Array.isArray(top.data)) {
    return top.data
  }
  return top
}

const normalizeSlot = (slot, periodFallback) => {
  const periodNumber = Number(slot?.periodNumber || slot?.period || periodFallback)
  const subjectName = slot?.subject?.name || slot?.subjectName || slot?.name || 'Break'
  const subjectCode = slot?.subject?.code || slot?.subjectCode || ''
  const facultyName = slot?.faculty?.name || slot?.facultyName || '-'
  const subjectType = String(slot?.subject?.type || slot?.subjectType || '').toLowerCase()
  const slotType = subjectType === 'lab' || /lab/i.test(subjectName) ? 'lab' : 'theory'

  return {
    periodNumber,
    startTime: slot?.startTime || DEFAULT_PERIOD_TIMES[periodNumber]?.start || '--:--',
    endTime: slot?.endTime || DEFAULT_PERIOD_TIMES[periodNumber]?.end || '--:--',
    subjectName,
    subjectCode,
    facultyName,
    slotType,
  }
}

const buildDayBlocks = (slots) => {
  const ordered = (Array.isArray(slots) ? slots : [])
    .map((slot, index) => normalizeSlot(slot, index + 1))
    .sort((left, right) => left.periodNumber - right.periodNumber)

  const blocks = []

  for (let index = 0; index < ordered.length; ) {
    const current = ordered[index]
    let span = 1

    if (current.slotType === 'lab') {
      while (index + span < ordered.length && span < 3) {
        const next = ordered[index + span]
        const sameSubject = getSubjectKey(next) === getSubjectKey(current)
        const consecutive = next.periodNumber === current.periodNumber + span
        const isLab = next.slotType === 'lab'

        if (!sameSubject || !consecutive || !isLab) {
          break
        }

        span += 1
      }
    }

    blocks.push({
      ...current,
      span,
    })

    index += span
  }

  return blocks
}

const createColorMap = (allBlocks) => {
  const colorMap = new Map()
  let paletteIndex = 0

  for (const block of allBlocks) {
    if (block.subjectName === 'Break') {
      continue
    }

    const key = getSubjectKey(block)
    if (!colorMap.has(key)) {
      colorMap.set(key, SUBJECT_COLORS[paletteIndex % SUBJECT_COLORS.length])
      paletteIndex += 1
    }
  }

  return colorMap
}

export default function StudentTimetable() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())

  useEffect(() => {
    const onToggleSidebar = () => {
      setSidebarOpen((prev) => !prev)
    }

    window.addEventListener('toggle-sidebar', onToggleSidebar)

    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date())
    }, 60 * 1000)

    return () => {
      window.removeEventListener('toggle-sidebar', onToggleSidebar)
      window.clearInterval(intervalId)
    }
  }, [])

  const timetableQuery = useQuery({
    queryKey: ['student-timetable'],
    queryFn: () => apiGet('/student/timetable'),
  })

  useEffect(() => {
    const refreshTimetable = () => {
      timetableQuery.refetch()
    }

    window.addEventListener('timetable-updated', refreshTimetable)
    return () => window.removeEventListener('timetable-updated', refreshTimetable)
  }, [timetableQuery])

  const timetableData = useMemo(() => readTimetablePayload(timetableQuery.data), [timetableQuery.data])

  const dayBlocks = useMemo(() => {
    const mapped = {}
    DAY_COLUMNS.forEach(({ key }) => {
      mapped[key] = buildDayBlocks(timetableData?.[key])
    })
    return mapped
  }, [timetableData])

  const allBlocks = useMemo(
    () => DAY_COLUMNS.flatMap(({ key }) => dayBlocks[key]),
    [dayBlocks]
  )

  const colorMap = useMemo(() => createColorMap(allBlocks), [allBlocks])

  const blockLookup = useMemo(() => {
    const lookup = {}
    DAY_COLUMNS.forEach(({ key }) => {
      lookup[key] = new Map()
      dayBlocks[key].forEach((block) => {
        lookup[key].set(block.periodNumber, block)
      })
    })
    return lookup
  }, [dayBlocks])

  const periodRange = useMemo(() => {
    const ranges = {}

    for (let period = 1; period <= 8; period += 1) {
      ranges[period] = {
        start: DEFAULT_PERIOD_TIMES[period].start,
        end: DEFAULT_PERIOD_TIMES[period].end,
      }
    }

    allBlocks.forEach((block) => {
      if (!ranges[block.periodNumber]?.start && block.startTime) {
        ranges[block.periodNumber].start = block.startTime
      }
      if (!ranges[block.periodNumber]?.end && block.endTime) {
        ranges[block.periodNumber].end = block.endTime
      }
    })

    return ranges
  }, [allBlocks])

  const currentDay = DAY_INDEX_TO_KEY[currentTime.getDay()] || null
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()
  const activeRowSpans = DAY_COLUMNS.reduce((acc, day) => {
    acc[day.key] = 0
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f0fdf4_0%,#ecfeff_45%,#eef2ff_100%)]">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-3 pb-10 sm:px-5">
          <section className="mb-4 rounded-3xl border border-white bg-white/80 p-4 shadow-lg backdrop-blur-sm sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-600">Weekly Plan</p>
            <h1
              className="text-xl font-bold text-slate-900 sm:text-2xl"
              style={{ fontFamily: 'Poppins, Nunito, Segoe UI, sans-serif' }}
            >
              Student Timetable
            </h1>
            <p className="text-sm text-slate-600">Period-wise view from Monday to Saturday</p>
          </section>

          {timetableQuery.isLoading ? (
            <div className="rounded-3xl border border-white bg-white/85 p-4 shadow-lg">
              <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ) : timetableQuery.isError ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              Unable to load timetable right now.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-3xl border border-white bg-white/90 shadow-lg">
              <table className="min-w-[920px] w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="sticky left-0 z-20 min-w-[170px] border-b border-slate-700 bg-slate-900 px-3 py-3 text-left text-xs uppercase tracking-wide">
                      Period / Time
                    </th>
                    {DAY_COLUMNS.map((day) => (
                      <th key={day.key} className="border-b border-slate-700 px-3 py-3 text-left text-xs uppercase tracking-wide">
                        {day.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }, (_, index) => index + 1).map((periodNumber) => (
                    <tr key={periodNumber} className="even:bg-slate-50/70">
                      <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-2 text-left align-top">
                        <p className="font-semibold text-slate-900">Period {periodNumber}</p>
                        <p className="text-xs text-slate-500">
                          {periodRange[periodNumber]?.start || '--:--'} - {periodRange[periodNumber]?.end || '--:--'}
                        </p>
                      </th>

                      {DAY_COLUMNS.map(({ key }) => {
                        if (activeRowSpans[key] > 0) {
                          activeRowSpans[key] -= 1
                          return null
                        }

                        const block = blockLookup[key].get(periodNumber)

                        if (!block) {
                          return (
                            <td key={`${key}-${periodNumber}`} className="border-b border-slate-200 px-3 py-2 align-top text-slate-400">
                              Break
                            </td>
                          )
                        }

                        const color = block.slotType === 'lab'
                          ? 'bg-indigo-100 border-indigo-200 text-indigo-800'
                          : colorMap.get(getSubjectKey(block)) || 'bg-slate-100 border-slate-200 text-slate-700'

                        const startMinutes = parseMinutes(block.startTime)
                        const endMinutes = parseMinutes(block.endTime)

                        const isCurrentCell =
                          key === currentDay &&
                          startMinutes !== null &&
                          endMinutes !== null &&
                          currentMinutes >= startMinutes &&
                          currentMinutes <= endMinutes

                        if (block.span > 1) {
                          activeRowSpans[key] = block.span - 1
                        }

                        return (
                          <td
                            key={`${key}-${periodNumber}`}
                            rowSpan={block.span}
                            className="border-b border-slate-200 p-2 align-top"
                          >
                            <div
                              className={`h-full min-h-[78px] rounded-xl border p-2 ${color} ${isCurrentCell ? 'ring-2 ring-cyan-400 ring-offset-1 animate-pulse' : ''}`}
                            >
                              <p className="text-xs font-semibold uppercase tracking-wide">{block.subjectCode || block.subjectName}</p>
                              <p className="text-sm font-bold leading-5">{block.subjectName}</p>
                              <p className="mt-1 text-xs">{block.facultyName}</p>
                              {block.slotType === 'lab' && (
                                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide">Lab ({block.span} periods)</p>
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
          )}
        </div>
      </main>
    </div>
  )
}
