import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { apiGet, apiPost, apiPut } from '@/api/axiosInstance'

const ROLL_REGEX = /^\d{2}[A-Z]{2}\d{1}[A-Z]\d{4}$/
const SORT_OPTIONS = ['roll', 'name', 'percentage']

const parseClassInfo = (className) => {
  const name = String(className || '')
  const match = name.match(/^(.*?)\s+Sem(\d+)\s+Section\s+([A-Z0-9]+)/i)
  if (!match) {
    return { department: '-', semester: '', section: '' }
  }

  return {
    department: match[1].trim(),
    semester: String(match[2]),
    section: String(match[3]).toUpperCase(),
  }
}

const normalizeStudents = (rawData) => {
  const payload = rawData?.data || rawData || []
  return Array.isArray(payload) ? payload : []
}

export default function ManageStudents() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [sortBy, setSortBy] = useState('roll')
  const [addForm, setAddForm] = useState({
    name: '',
    rollNumber: '',
    email: '',
    phone: '',
    guardianName: '',
    guardianPhone: '',
    guardianRelation: 'Father',
    batch: '2022-2026',
  })
  const [editForm, setEditForm] = useState({
    phone: '',
    guardianPhone: '',
    guardianName: '',
    guardianRelation: 'Father',
  })

  const queryClient = useQueryClient()

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const dailyQuery = useQuery({
    queryKey: ['ct-students', 'daily'],
    queryFn: () => apiGet('/class-teacher/daily-attendance'),
  })

  const studentsQuery = useQuery({
    queryKey: ['ct-students', 'list'],
    queryFn: () => apiGet('/class-teacher/students'),
  })

  const classInfo = useMemo(() => {
    const payload = dailyQuery.data?.data || dailyQuery.data || {}
    return parseClassInfo(payload.className)
  }, [dailyQuery.data])

  const students = useMemo(() => normalizeStudents(studentsQuery.data), [studentsQuery.data])

  const addMutation = useMutation({
    mutationFn: (payload) => apiPost('/class-teacher/students', payload),
    onSuccess: () => {
      toast.success('Student added successfully')
      setShowAddModal(false)
      setAddForm({
        name: '',
        rollNumber: '',
        email: '',
        phone: '',
        guardianName: '',
        guardianPhone: '',
        guardianRelation: 'Father',
        batch: '2022-2026',
      })
      queryClient.invalidateQueries({ queryKey: ['ct-students', 'list'] })
    },
    onError: (error) => toast.error(error.message || 'Unable to add student'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ studentId, payload }) => apiPut(`/class-teacher/students/${studentId}`, payload),
    onSuccess: () => {
      toast.success('Student updated')
      setEditingStudent(null)
      queryClient.invalidateQueries({ queryKey: ['ct-students', 'list'] })
    },
    onError: (error) => toast.error(error.message || 'Unable to update student'),
  })

  const rollValid = ROLL_REGEX.test(String(addForm.rollNumber || '').toUpperCase())

  const filteredStudents = useMemo(() => {
    const query = searchText.trim().toLowerCase()

    const list = students.filter((student) => {
      if (!query) return true
      return (
        String(student.name || '').toLowerCase().includes(query) ||
        String(student.rollNumber || '').toLowerCase().includes(query)
      )
    })

    const sorted = [...list].sort((left, right) => {
      if (sortBy === 'name') {
        return String(left.name || '').localeCompare(String(right.name || ''))
      }

      if (sortBy === 'percentage') {
        return Number(right.attendanceSummary?.overallPercentage || 0) - Number(left.attendanceSummary?.overallPercentage || 0)
      }

      return String(left.rollNumber || '').localeCompare(String(right.rollNumber || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    })

    return sorted
  }, [searchText, sortBy, students])

  const submitAddStudent = () => {
    if (!rollValid) {
      toast.error('Invalid roll number format')
      return
    }

    if (!classInfo.semester || !classInfo.section) {
      toast.error('Class assignment info unavailable')
      return
    }

    addMutation.mutate({
      ...addForm,
      rollNumber: String(addForm.rollNumber).toUpperCase(),
      semester: Number(classInfo.semester),
      section: classInfo.section,
    })
  }

  const openEdit = (student) => {
    setEditingStudent(student)
    setEditForm({
      phone: student.phone || '',
      guardianPhone: student.guardianPhone || '',
      guardianName: student.guardianName || '',
      guardianRelation: student.guardianRelation || 'Father',
    })
  }

  const submitEdit = () => {
    if (!editingStudent?._id) return

    updateMutation.mutate({
      studentId: editingStudent._id,
      payload: {
        ...editForm,
        section: classInfo.section || undefined,
      },
    })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Manage Students</h1>
                <p className="text-sm text-slate-600">Full student management for your assigned class.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              >
                Add Student
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <input
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search by name or roll number"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option === 'roll' ? 'Roll Number' : option === 'name' ? 'Name' : 'Percentage'}</option>
                ))}
              </select>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Class: {classInfo.department || '-'} • Sem {classInfo.semester || '-'} • Sec {classInfo.section || '-'}
              </p>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="py-2">Roll No</th>
                    <th className="py-2">Name</th>
                    <th className="py-2">Phone</th>
                    <th className="py-2">Guardian</th>
                    <th className="py-2">Overall %</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => {
                    const percentage = Number(student.attendanceSummary?.overallPercentage || 0)
                    const status = percentage >= 75 ? 'Safe' : 'At Risk'
                    return (
                      <tr key={student._id} className="border-b border-slate-100">
                        <td className="py-2 font-medium text-slate-900">{student.rollNumber}</td>
                        <td className="py-2">{student.name}</td>
                        <td className="py-2">{student.phone || '-'}</td>
                        <td className="py-2">{student.guardianPhone || '-'}</td>
                        <td className="py-2">{percentage.toFixed(1)}%</td>
                        <td className="py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status === 'Safe' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {status}
                          </span>
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(student)}
                              className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => toast('Attendance detail route can be linked here')}
                              className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                            >
                              View Attendance
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Add Student</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Name" value={addForm.name} onChange={(event) => setAddForm((current) => ({ ...current, name: event.target.value }))} />
              <div>
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Roll Number" value={addForm.rollNumber} onChange={(event) => setAddForm((current) => ({ ...current, rollNumber: event.target.value.toUpperCase() }))} />
                <p className={`mt-1 text-xs ${rollValid ? 'text-emerald-700' : 'text-rose-700'}`}>
                  Format hint: 22AK1A3208
                </p>
              </div>
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Email" type="email" value={addForm.email} onChange={(event) => setAddForm((current) => ({ ...current, email: event.target.value }))} />
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Phone" value={addForm.phone} onChange={(event) => setAddForm((current) => ({ ...current, phone: event.target.value }))} />
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Guardian Name" value={addForm.guardianName} onChange={(event) => setAddForm((current) => ({ ...current, guardianName: event.target.value }))} />
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Guardian Phone" value={addForm.guardianPhone} onChange={(event) => setAddForm((current) => ({ ...current, guardianPhone: event.target.value }))} />
              <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={addForm.guardianRelation} onChange={(event) => setAddForm((current) => ({ ...current, guardianRelation: event.target.value }))}>
                <option>Father</option>
                <option>Mother</option>
                <option>Other</option>
              </select>
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Batch (2022-2026)" value={addForm.batch} onChange={(event) => setAddForm((current) => ({ ...current, batch: event.target.value }))} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddModal(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={submitAddStudent} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                {addMutation.isPending ? 'Saving...' : 'Add Student'}
              </button>
            </div>
          </section>
        </div>
      )}

      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <section className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Edit Student</h2>
            <div className="mt-3 grid grid-cols-1 gap-3">
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Phone" value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} />
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Guardian Phone" value={editForm.guardianPhone} onChange={(event) => setEditForm((current) => ({ ...current, guardianPhone: event.target.value }))} />
              <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Guardian Name" value={editForm.guardianName} onChange={(event) => setEditForm((current) => ({ ...current, guardianName: event.target.value }))} />
              <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={editForm.guardianRelation} onChange={(event) => setEditForm((current) => ({ ...current, guardianRelation: event.target.value }))}>
                <option>Father</option>
                <option>Mother</option>
                <option>Other</option>
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingStudent(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={submitEdit} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                {updateMutation.isPending ? 'Updating...' : 'Save Changes'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
