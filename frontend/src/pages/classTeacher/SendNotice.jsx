import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { apiGet, apiPost } from '@/api/axiosInstance'

const NOTICE_TYPES = ['General', 'Alert', 'Exam', 'Holiday']
const SMS_COST_PER_MESSAGE = 0.25

const normalizeStudents = (rawData) => {
  const payload = rawData?.data || rawData || []
  return Array.isArray(payload) ? payload : []
}

const normalizeHistory = (rawData) => {
  const payload = rawData?.data || rawData || []
  return Array.isArray(payload) ? payload : []
}

export default function SendNotice() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [form, setForm] = useState({
    title: '',
    type: 'General',
    message: '',
    sendSMS: false,
    sendToGuardians: false,
  })
  const [selectedStudentIds, setSelectedStudentIds] = useState([])

  const queryClient = useQueryClient()

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const studentsQuery = useQuery({
    queryKey: ['ct-notices', 'students'],
    queryFn: () => apiGet('/class-teacher/students'),
  })

  const historyQuery = useQuery({
    queryKey: ['ct-notices', 'history'],
    queryFn: () => apiGet('/class-teacher/notices'),
    retry: false,
  })

  const students = useMemo(() => normalizeStudents(studentsQuery.data), [studentsQuery.data])
  const historyRows = useMemo(() => normalizeHistory(historyQuery.data), [historyQuery.data])
  const selectedStudentSet = useMemo(() => new Set(selectedStudentIds.map(String)), [selectedStudentIds])
  const selectedStudents = useMemo(
    () => students.filter((student) => selectedStudentSet.has(String(student._id))),
    [students, selectedStudentSet]
  )
  const allStudentsSelected = students.length > 0 && selectedStudents.length === students.length

  const studentRecipients = selectedStudents.filter((student) => Boolean(student.phone)).length
  const guardianRecipients = selectedStudents.filter((student) => Boolean(student.guardianPhone)).length
  const estimatedSmsCount = (form.sendSMS ? studentRecipients : 0) + (form.sendToGuardians ? guardianRecipients : 0)
  const estimatedCost = estimatedSmsCount * SMS_COST_PER_MESSAGE

  const sendMutation = useMutation({
    mutationFn: () =>
      apiPost('/class-teacher/notices', {
        title: form.title,
        type: form.type.toLowerCase(),
        message: form.message,
        sendSMS: form.sendSMS,
        sendToGuardians: form.sendToGuardians,
        selectedStudentIds,
      }),
    onSuccess: () => {
      toast.success('Notice sent successfully')
      setForm({ title: '', type: 'General', message: '', sendSMS: false, sendToGuardians: false })
      setSelectedStudentIds([])
      queryClient.invalidateQueries({ queryKey: ['ct-notices', 'history'] })
    },
    onError: (error) => {
      toast.error(error.message || 'Unable to send notice')
    },
  })

  const submitNotice = () => {
    if (!form.title.trim() || !form.message.trim()) {
      toast.error('Title and message are required')
      return
    }

    if ((form.sendSMS || form.sendToGuardians) && selectedStudentIds.length === 0) {
      toast.error('Select at least one student to send SMS')
      return
    }

    if (!form.sendSMS && !form.sendToGuardians) {
      toast.error('Enable student SMS or guardian SMS to send a notice by SMS')
      return
    }

    sendMutation.mutate()
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Send Notice</h1>
            <p className="mt-1 text-sm text-slate-600">Publish class notices with optional SMS delivery.</p>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Title"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={form.type}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {NOTICE_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <textarea
              value={form.message}
              onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
              rows={5}
              placeholder="Write your notice message"
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />

            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{form.title || 'Notice title'}</p>
              <p className="text-xs text-slate-500">Type: {form.type}</p>
              <p className="mt-2 text-sm text-slate-700">{form.message || 'Notice body preview appears here.'}</p>
            </div>

            <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.sendSMS}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sendSMS: event.target.checked,
                  }))
                }
              />
              Send SMS to selected students
            </label>

            <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.sendToGuardians}
                onChange={(event) => setForm((current) => ({ ...current, sendToGuardians: event.target.checked }))}
              />
              Send SMS to guardians
            </label>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Select students</p>
                  <p className="text-xs text-slate-500">
                    Choose the students who should receive this notice SMS.
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() =>
                    setSelectedStudentIds(
                      allStudentsSelected ? [] : students.map((student) => String(student._id))
                    )
                  }
                  disabled={students.length === 0}
                >
                  {allStudentsSelected ? 'Clear selection' : 'Select all'}
                </button>
              </div>

              {students.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No students available for this class.</p>
              ) : (
                <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
                      <tr>
                        <th className="w-12 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={allStudentsSelected}
                            onChange={(event) =>
                              setSelectedStudentIds(event.target.checked ? students.map((student) => String(student._id)) : [])
                            }
                          />
                        </th>
                        <th className="px-3 py-2">Student</th>
                        <th className="px-3 py-2">Roll No</th>
                        <th className="px-3 py-2">Phone</th>
                        <th className="px-3 py-2">Guardian</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student) => {
                        const studentId = String(student._id)
                        const checked = selectedStudentSet.has(studentId)

                        return (
                          <tr key={studentId} className="border-t border-slate-100">
                            <td className="px-3 py-2 align-top">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => {
                                  setSelectedStudentIds((current) =>
                                    event.target.checked
                                      ? [...current, studentId]
                                      : current.filter((id) => String(id) !== studentId)
                                  )
                                }}
                              />
                            </td>
                            <td className="px-3 py-2 text-slate-900">{student.name}</td>
                            <td className="px-3 py-2 text-slate-700">{student.rollNumber || '-'}</td>
                            <td className="px-3 py-2 text-slate-700">{student.phone || '-'}</td>
                            <td className="px-3 py-2 text-slate-700">{student.guardianPhone || '-'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="mt-2 text-xs text-slate-500">
                Selected students: {selectedStudents.length}
              </p>
            </div>

            {(form.sendSMS || form.sendToGuardians) && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Estimated SMS: {estimatedSmsCount} • Estimated cost: ₹{estimatedCost.toFixed(2)}
              </p>
            )}

            <button
              type="button"
              onClick={submitNotice}
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? 'Sending...' : 'Send Notice'}
            </button>
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Notice History</h2>
            {historyQuery.isLoading ? (
              <div className="mt-3 h-24 animate-pulse rounded-xl bg-slate-100" />
            ) : historyRows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No notices sent yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="py-2">Date</th>
                      <th className="py-2">Title</th>
                      <th className="py-2">Type</th>
                      <th className="py-2">Message</th>
                      <th className="py-2">Read Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((notice) => (
                      <tr key={notice._id} className="border-b border-slate-100">
                        <td className="py-2">{new Date(notice.createdAt).toLocaleString()}</td>
                        <td className="py-2 font-medium text-slate-900">{notice.title}</td>
                        <td className="py-2">{String(notice.type || 'general').toUpperCase()}</td>
                        <td className="py-2">{String(notice.message || '').slice(0, 70)}{String(notice.message || '').length > 70 ? '...' : ''}</td>
                        <td className="py-2">{notice.readCount || 0}</td>
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
