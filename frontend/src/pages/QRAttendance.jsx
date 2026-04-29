import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@/lib/dataClientHooks.jsx'
import {
  ArrowDownTrayIcon,
  CameraIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  QrCodeIcon,
  StopCircleIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import jsQR from 'jsqr'
import toast from 'react-hot-toast'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import PageHeader from '@/components/shared/PageHeader'
import Spinner, { SkeletonCard } from '@/components/shared/Spinner'
import { useAuth } from '@/context/AuthContext'
import { adminApi } from '@/api/adminApi'
import { reportsApi } from '@/api/reportsApi'
import { useCloseQR, useGenerateQR, useQRStatus, useScanQR } from '@/hooks/useQR'
import { getUserFriendlyErrorMessage } from '@/utils/errorMessages'

const DEFAULT_DATE = new Date().toISOString().slice(0, 10)

const normalizeProfileId = (profileId) =>
  profileId && typeof profileId === 'object' ? profileId._id || profileId.id || '' : profileId || ''

const getAcademicYear = () => {
  const year = new Date().getFullYear()
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`
}

const formatRemaining = (remainingMs) => {
  const safe = Math.max(0, remainingMs)
  const minutes = String(Math.floor(safe / 60000)).padStart(2, '0')
  const seconds = String(Math.floor((safe % 60000) / 1000)).padStart(2, '0')
  return `${minutes}:${seconds}`
}

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

const normalizeTimetable = (response) => {
  const payload = response?.data || response || {}
  const items = payload.timetables || payload.items || payload.data || payload.subjects || []
  if (!Array.isArray(items)) return []

  return items.flatMap((item) => {
    const base = {
      ...item,
      subjectId: item.subjectId?._id || item.subjectId?.id || item.subjectId || item._id,
      subjectName: item.subjectId?.name || item.subject?.name || item.name || item.subjectName || 'Subject',
      subjectCode: item.subjectId?.code || item.subject?.code || item.code || item.subjectCode || '',
    }
    const schedule = Array.isArray(item.schedule) ? item.schedule : []
    if (!schedule.length) return [base]

    return schedule.map((slot) => ({
      ...base,
      day: slot.day,
      periodNumber: slot.periodNumber,
      startTime: slot.startTime,
      endTime: slot.endTime,
      isLab: Boolean(slot.isLab),
    }))
  })
}

const getStatusPayload = (data) => data?.data || data || {}

export default function QRAttendance() {
  const { user } = useAuth()
  const isStudent = user?.role === 'student'
  const isFaculty = ['faculty', 'class_teacher', 'time_table_coordinator', 'attendance_coordinator', 'admin', 'hod'].includes(user?.role)
  const showSidebar = isStudent || isFaculty
  const profileId = normalizeProfileId(user?.profileId)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [form, setForm] = useState({
    subjectId: '',
    periodNumber: '',
    date: DEFAULT_DATE,
  })
  const [activeSession, setActiveSession] = useState(null)
  const [closedSummary, setClosedSummary] = useState(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const [newScanKeys, setNewScanKeys] = useState(new Set())

  const [manualToken, setManualToken] = useState('')
  const [scanState, setScanState] = useState({ status: 'idle', message: '', subjectName: '' })
  const [cameraError, setCameraError] = useState('')
  const [cameraActive, setCameraActive] = useState(false)

  const autoRefreshDoneRef = useRef(false)
  const seenScanKeysRef = useRef(new Set())
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const scanFrameRef = useRef(null)

  const academicYear = useMemo(() => getAcademicYear(), [])

  const timetableQuery = useQuery({
    queryKey: ['qrFacultyTimetable', profileId, academicYear],
    queryFn: () => adminApi.getTimetable({ facultyId: profileId, academicYear }),
    enabled: isFaculty && !!profileId,
    staleTime: 5 * 60 * 1000,
    select: (response) => response?.data || response,
  })

  const subjects = useMemo(() => {
    const normalized = normalizeTimetable(timetableQuery.data)
    const dedup = new Map()
    normalized.forEach((item) => {
      if (!item.subjectId) return
      if (!dedup.has(String(item.subjectId))) {
        dedup.set(String(item.subjectId), {
          value: item.subjectId,
          label: `${item.subjectCode ? `${item.subjectCode} - ` : ''}${item.subjectName}`,
        })
      }
    })
    return [...dedup.values()]
  }, [timetableQuery.data])

  const selectedSubject = useMemo(
    () => subjects.find((item) => String(item.value) === String(form.subjectId)) || null,
    [form.subjectId, subjects]
  )
  const selectedDayName = useMemo(() => {
    if (!form.date) return ''
    const date = new Date(`${form.date}T00:00:00`)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString('en-US', { weekday: 'long' })
  }, [form.date])

  const periodOptions = useMemo(() => {
    if (!form.subjectId || !selectedDayName) return []
    const rows = normalizeTimetable(timetableQuery.data)
      .filter((item) => String(item.subjectId) === String(form.subjectId))
      .filter((item) => String(item.day || '').toLowerCase() === selectedDayName.toLowerCase())
      .sort((left, right) => Number(left.periodNumber || 0) - Number(right.periodNumber || 0))

    return rows.map((item) => ({
      value: String(item.periodNumber),
      label: `Period ${item.periodNumber}${item.isLab ? ' (Lab)' : ''} • ${item.startTime || '--:--'}-${item.endTime || '--:--'}`,
    }))
  }, [form.subjectId, selectedDayName, timetableQuery.data])

  const generateMutation = useGenerateQR()
  const closeMutation = useCloseQR()
  const scanMutation = useScanQR()

  const statusQuery = useQRStatus(activeSession?.sessionId)
  const statusPayload = getStatusPayload(statusQuery.data)
  const scannedStudents = useMemo(() => {
    const list = Array.isArray(statusPayload?.scannedStudents) ? statusPayload.scannedStudents : []
    return [...list].sort((a, b) => new Date(b.scannedAt || 0) - new Date(a.scannedAt || 0))
  }, [statusPayload?.scannedStudents])

  useEffect(() => {
    if (!showSidebar) return
    const onToggleSidebar = () => setSidebarOpen((current) => !current)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [showSidebar])

  useEffect(() => {
    if (!subjects.length || form.subjectId) return
    setForm((current) => ({ ...current, subjectId: String(subjects[0].value) }))
  }, [form.subjectId, subjects])

  useEffect(() => {
    if (!periodOptions.length) {
      setForm((current) => ({ ...current, periodNumber: '' }))
      return
    }

    const exists = periodOptions.some((option) => option.value === String(form.periodNumber))
    if (!exists) {
      setForm((current) => ({ ...current, periodNumber: periodOptions[0].value }))
    }
  }, [form.periodNumber, periodOptions])

  useEffect(() => {
    if (!activeSession?.expiresAt) {
      setRemainingMs(0)
      return
    }

    const tick = () => {
      const diff = new Date(activeSession.expiresAt).getTime() - Date.now()
      setRemainingMs(Math.max(0, diff))
    }

    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [activeSession?.expiresAt])

  useEffect(() => {
    if (!activeSession?.sessionId) return

    const currentKeys = new Set(
      scannedStudents.map((student) => `${student.studentId || student.rollNumber}-${student.scannedAt || ''}`)
    )

    const incoming = [...currentKeys].filter((key) => !seenScanKeysRef.current.has(key))
    if (incoming.length) {
      setNewScanKeys(new Set(incoming))
      window.setTimeout(() => setNewScanKeys(new Set()), 650)
    }

    seenScanKeysRef.current = currentKeys
  }, [activeSession?.sessionId, scannedStudents])

  const triggerGenerate = ({ reason = 'manual' } = {}) => {
    if (!form.subjectId || !form.periodNumber || !form.date) {
      toast.error('Select subject, period, and date')
      return
    }

    generateMutation.mutate(
      {
        subjectId: form.subjectId,
        periodNumber: Number(form.periodNumber),
        date: form.date,
      },
      {
        onSuccess: (response) => {
          const payload = getStatusPayload(response)
          setActiveSession({
            sessionId: payload.sessionId,
            qrBase64: payload.qrBase64,
            expiresAt: payload.expiresAt,
            subjectId: form.subjectId,
            subjectLabel: selectedSubject?.label || 'Selected Subject',
            date: form.date,
            periodNumbers: payload.periodNumbers || [Number(form.periodNumber)],
            isLabSession: Boolean(payload.isLabSession),
            isExpired: false,
          })
          setClosedSummary(null)
          autoRefreshDoneRef.current = false
          seenScanKeysRef.current = new Set()
          setNewScanKeys(new Set())
          if (reason === 'manual') toast.success('QR session generated')
          if (reason === 'auto') toast.success('QR refreshed before expiry')
        },
        onError: (error) => {
          const status = error?.response?.status
          const message = getUserFriendlyErrorMessage(error, 'Unable to generate a QR session. Please try again.')

          if (status === 409) {
            toast.error('An active QR session already exists for this class/period. Close it before creating another.')
            return
          }

          toast.error(message)
        },
      }
    )
  }

  useEffect(() => {
    if (!activeSession?.sessionId || remainingMs <= 0 || autoRefreshDoneRef.current) return
    if (remainingMs <= 100) {
      autoRefreshDoneRef.current = true
      triggerGenerate({ reason: 'auto' })
    }
  }, [remainingMs, activeSession?.sessionId])

  useEffect(() => {
    if (!activeSession?.sessionId) return
    if (remainingMs <= 0) {
      setActiveSession((current) => (current ? { ...current, isExpired: true } : current))
    }
  }, [remainingMs, activeSession?.sessionId])

  const handleCloseSession = () => {
    if (!activeSession?.sessionId) return
    closeMutation.mutate(activeSession.sessionId, {
      onSuccess: (response) => {
        const payload = getStatusPayload(response)
        const present = Number(payload.scannedCount || 0)
        const totalExpected = Number(payload.totalExpected || present)
        setClosedSummary({
          present,
          absent: Math.max(totalExpected - present, 0),
          closedAt: payload.closedAt,
        })
        setActiveSession((current) => (current ? { ...current, isExpired: true } : current))
        toast.success('QR session closed')
      },
    })
  }

  const handleDownloadReport = async () => {
    if (!activeSession?.subjectId) return
    try {
      const blob = await reportsApi.downloadClassPDF({
        subjectId: activeSession.subjectId,
        date: activeSession.date,
        periodNumber: activeSession.periodNumbers?.[0],
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `qr-class-report-${activeSession.date}-period-${activeSession.periodNumbers?.join('-') || 'na'}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success('Report downloaded')
    } catch (error) {
      toast.error(getUserFriendlyErrorMessage(error, 'Unable to download the report. Please try again.'))
    }
  }

  const stopCamera = () => {
    if (scanFrameRef.current) {
      cancelAnimationFrame(scanFrameRef.current)
      scanFrameRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }

  const scanToken = (token) => {
    const trimmed = String(token || '').trim()
    if (!trimmed) {
      setScanState({ status: 'error', message: 'Token is required', subjectName: '' })
      return
    }

    scanMutation.mutate(
      { token: trimmed },
      {
        onSuccess: (response) => {
          const payload = getStatusPayload(response)
          setScanState({
            status: 'success',
            message: payload.message || 'Attendance marked successfully',
            subjectName: payload.subjectName || 'Subject',
          })
          toast.success('Attendance marked')
          stopCamera()
        },
        onError: (error) => {
          setScanState({
            status: 'error',
            message: getUserFriendlyErrorMessage(error, 'Unable to mark attendance. Please try again.'),
            subjectName: '',
          })
        },
      }
    )
  }

  const scanFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) {
      scanFrameRef.current = requestAnimationFrame(scanFrame)
      return
    }

    if (video.readyState >= 2) {
      const context = canvas.getContext('2d', { willReadFrequently: true })
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)
      if (code?.data) {
        scanToken(code.data)
        return
      }
    }

    scanFrameRef.current = requestAnimationFrame(scanFrame)
  }

  const startCamera = async () => {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraActive(true)
      setScanState({ status: 'idle', message: '', subjectName: '' })
      scanFrameRef.current = requestAnimationFrame(scanFrame)
    } catch (error) {
      setCameraError(getUserFriendlyErrorMessage(error, 'Unable to access camera. Please check camera permissions and try again.'))
    }
  }

  useEffect(() => () => stopCamera(), [])

  if (isStudent) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="pt-20 lg:pl-72">
          <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h1 className="text-2xl font-bold text-slate-900">QR Attendance</h1>
              <p className="mt-2 text-sm text-slate-600">Scan the QR code displayed by your faculty.</p>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-100 p-3">
                <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-black">
                  <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
                  {!cameraActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">
                      Camera preview
                    </div>
                  )}
                </div>
                <canvas ref={canvasRef} className="hidden" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {!cameraActive ? (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#1F4E79] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#173b5d]"
                  >
                    <CameraIcon className="h-4 w-4" />
                    Start Camera
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <StopCircleIcon className="h-4 w-4" />
                    Stop Camera
                  </button>
                )}
              </div>

              {cameraError && (
                <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{cameraError}</p>
              )}

              <div className="mt-6 border-t border-slate-200 pt-6">
                <label className="text-sm font-semibold text-slate-700">Manual token entry</label>
                <div className="mt-2 flex gap-2">
                  <input
                    value={manualToken}
                    onChange={(event) => setManualToken(event.target.value)}
                    placeholder="Paste QR token"
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-[#1F4E79]"
                  />
                  <button
                    type="button"
                    onClick={() => scanToken(manualToken)}
                    disabled={scanMutation.isPending}
                    className="rounded-xl bg-[#1F4E79] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#173b5d] disabled:opacity-70"
                  >
                    {scanMutation.isPending ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </div>

              {scanState.status === 'success' && (
                <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-center">
                  <CheckCircleIcon className="mx-auto h-14 w-14 text-green-600" />
                  <p className="mt-3 text-lg font-bold text-green-800">Attendance marked for {scanState.subjectName}</p>
                  <p className="mt-1 text-sm text-green-700">{scanState.message}</p>
                </div>
              )}

              {scanState.status === 'error' && (
                <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-800">Unable to mark attendance</p>
                  <p className="mt-1 text-sm text-red-700">{scanState.message}</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!isFaculty) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <main className="pt-20">
          <div className="mx-auto max-w-3xl px-4 py-8">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-700 shadow-sm">
              You do not have access to QR attendance.
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <PageHeader title="QR Attendance" subtitle="Generate, monitor, and close live QR attendance sessions." />

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Session Setup</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_180px_180px_auto]">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Subject</span>
                <select
                  value={form.subjectId}
                  onChange={(event) => setForm((current) => ({ ...current, subjectId: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1F4E79]"
                >
                  <option value="">Select subject</option>
                  {subjects.map((subject) => (
                    <option key={subject.value} value={subject.value}>
                      {subject.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Period</span>
                <select
                  value={form.periodNumber}
                  onChange={(event) => setForm((current) => ({ ...current, periodNumber: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1F4E79]"
                >
                  <option value="">Select period</option>
                  {periodOptions.map((period) => (
                    <option key={period.value} value={period.value}>
                      {period.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Date</span>
                <input
                  type="date"
                  value={form.date}
                  max={DEFAULT_DATE}
                  onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1F4E79]"
                />
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => triggerGenerate({ reason: 'manual' })}
                  disabled={generateMutation.isPending || !form.subjectId || !form.periodNumber || !form.date}
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-[#1F4E79] px-5 text-sm font-semibold text-white hover:bg-[#173b5d] disabled:opacity-70"
                >
                  {generateMutation.isPending ? <Spinner size="sm" className="border-white/40 border-t-white" /> : null}
                  <span className="ml-2">Generate QR</span>
                </button>
              </div>
            </div>
          </section>

          {activeSession && (
            <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Active Session</h3>

                <div className="relative mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 p-3">
                  <div className="mx-auto flex h-[300px] w-[300px] items-center justify-center rounded-xl bg-white">
                    {activeSession.qrBase64 ? (
                      <img
                        src={activeSession.qrBase64}
                        alt="QR attendance code"
                        className={`h-[300px] w-[300px] object-contain transition ${remainingMs <= 0 ? 'grayscale opacity-60' : ''}`}
                      />
                    ) : (
                      <SkeletonCard width="300px" height="300px" />
                    )}
                  </div>

                  {remainingMs <= 0 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/45">
                      <span className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-800">Expired</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-2 text-sm text-slate-700">
                  <p><span className="font-semibold">Subject:</span> {activeSession.subjectLabel}</p>
                  <p><span className="font-semibold">Date:</span> {activeSession.date}</p>
                  <p><span className="font-semibold">Periods:</span> {(activeSession.periodNumbers || []).join(', ')}</p>
                  <p><span className="font-semibold">Type:</span> {activeSession.isLabSession ? 'Lab (combined)' : 'Theory'}</p>
                  <p><span className="font-semibold">Expires At:</span> {formatDateTime(activeSession.expiresAt)}</p>
                </div>

                <div className="mt-4 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">
                  Expires in {formatRemaining(remainingMs)}
                </div>

                <button
                  type="button"
                  onClick={() => triggerGenerate({ reason: 'manual' })}
                  disabled={generateMutation.isPending}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-70"
                >
                  <QrCodeIcon className="h-4 w-4" />
                  Refresh QR
                </button>
              </article>

              <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-slate-900">Live Scan Feed</h3>
                  <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-700">
                    <UserGroupIcon className="h-4 w-4" />
                    {statusPayload?.scannedCount || 0} students scanned
                  </span>
                </div>

                <div className="mt-4 max-h-[360px] overflow-y-auto rounded-2xl border border-slate-200">
                  {statusQuery.isLoading ? (
                    <div className="space-y-2 p-3">
                      <SkeletonCard height="3.5rem" />
                      <SkeletonCard height="3.5rem" />
                      <SkeletonCard height="3.5rem" />
                    </div>
                  ) : scannedStudents.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">No students scanned yet.</div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {scannedStudents.map((student) => {
                        const key = `${student.studentId || student.rollNumber}-${student.scannedAt || ''}`
                        const isNew = newScanKeys.has(key)
                        return (
                          <li
                            key={key}
                            className={`flex items-center justify-between gap-3 px-4 py-3 ${isNew ? 'animate-[qrSlideIn_450ms_ease-out]' : ''}`}
                          >
                            <div>
                              <p className="font-mono text-xs text-slate-500">{student.rollNumber || '-'}</p>
                              <p className="text-sm font-semibold text-slate-900">{student.name || 'Student'}</p>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <ClockIcon className="h-4 w-4" />
                              {formatDateTime(student.scannedAt)}
                              <CheckCircleIcon className="h-4 w-4 text-green-600" />
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleCloseSession}
                    disabled={closeMutation.isPending || remainingMs <= 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-70"
                  >
                    {closeMutation.isPending ? <Spinner size="sm" className="border-white/40 border-t-white" /> : null}
                    Close Session & Finalize
                  </button>
                </div>

                {closedSummary && (
                  <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4">
                    <h4 className="text-sm font-bold text-green-800">Session Summary</h4>
                    <p className="mt-1 text-sm text-green-700">Present: {closedSummary.present}</p>
                    <p className="text-sm text-green-700">Absent: {closedSummary.absent}</p>
                    <p className="text-xs text-green-700">Closed at {formatDateTime(closedSummary.closedAt)}</p>
                    <button
                      type="button"
                      onClick={handleDownloadReport}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl border border-green-300 bg-white px-4 py-2 text-sm font-semibold text-green-800 hover:bg-green-100"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4" />
                      Download Class Report
                    </button>
                  </div>
                )}
              </article>
            </section>
          )}

          {timetableQuery.isError && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Timetable could not be loaded. You can still try generating QR using a selected subject if available.
            </div>
          )}
        </div>
      </main>

      <style>{`@keyframes qrSlideIn { from { transform: translateY(-14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  )
}
