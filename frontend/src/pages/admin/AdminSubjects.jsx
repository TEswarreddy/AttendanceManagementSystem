import { useEffect, useMemo, useState, useCallback } from 'react'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import { adminApi } from '@/api/adminApi'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'

const toRows = (response) => {
  const payload = response?.data || response || {}
  if (Array.isArray(payload.items)) return payload.items
  if (Array.isArray(payload.subjects)) return payload.subjects
  if (Array.isArray(payload.data)) return payload.data
  if (Array.isArray(payload)) return payload
  return []
}

export default function AdminSubjects() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    subjectCode: '',
    name: '',
    departmentId: '',
    semester: '',
    credits: '',
    type: 'theory',
  })

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((current) => !current)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const departmentsQuery = useQuery({
    queryKey: ['admin-subjects', 'departments'],
    queryFn: useCallback(() => adminApi.getDepartments(), []),
  })

  const subjectsQuery = useQuery({
    queryKey: ['admin-subjects', 'list'],
    queryFn: useCallback(() => adminApi.getSubjects({ page: 1, limit: 1000 }), []),
  })

  const saveMutation = useMutation({
    mutationFn: (payload) => (editingId ? adminApi.updateSubject(editingId, payload) : adminApi.createSubject(payload)),
    onSuccess: () => {
      toast.success(editingId ? 'Subject updated' : 'Subject created')
      setEditingId('')
      setForm({ subjectCode: '', name: '', departmentId: '', semester: '', credits: '', type: 'theory' })
      subjectsQuery.refetch()
    },
    onError: (error) => toast.error(error.message || 'Unable to save subject'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => adminApi.deleteSubject(id),
    onSuccess: () => {
      toast.success('Subject deactivated')
      subjectsQuery.refetch()
    },
    onError: (error) => toast.error(error.message || 'Unable to deactivate subject'),
  })

  const departmentRows = useMemo(() => {
    const payload = departmentsQuery.data?.data || departmentsQuery.data || {}
    if (Array.isArray(payload.departments)) return payload.departments
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload)) return payload
    return []
  }, [departmentsQuery.data])

  const subjects = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const rows = toRows(subjectsQuery.data)
    if (!keyword) return rows
    return rows.filter((row) => {
      const name = String(row?.name || '').toLowerCase()
      const code = String(row?.subjectCode || row?.code || '').toLowerCase()
      return name.includes(keyword) || code.includes(keyword)
    })
  }, [subjectsQuery.data, search])

  const subjectsBySemester = useMemo(() => {
    const grouped = subjects.reduce((acc, row) => {
      const semester = Number(row?.semester) || 0
      if (!acc[semester]) acc[semester] = []
      acc[semester].push(row)
      return acc
    }, {})

    return Object.entries(grouped)
      .sort((left, right) => Number(left[0]) - Number(right[0]))
      .map(([semester, rows]) => ({
        semester: Number(semester),
        rows: rows.sort((a, b) =>
          String(a?.subjectCode || a?.code || '').localeCompare(String(b?.subjectCode || b?.code || ''))
        ),
      }))
  }, [subjects])

  const handleSubmit = (event) => {
    event.preventDefault()
    const payload = {
      subjectCode: form.subjectCode.trim().toUpperCase(),
      name: form.name.trim(),
      departmentId: form.departmentId,
      semester: Number(form.semester),
      credits: Number(form.credits),
      type: form.type,
    }

    if (!payload.subjectCode || !payload.name || !payload.departmentId || !payload.semester || !payload.credits) {
      toast.error('Please fill all required fields')
      return
    }

    saveMutation.mutate(payload)
  }

  const onEdit = (row) => {
    setEditingId(row._id)
    setForm({
      subjectCode: row.subjectCode || row.code || '',
      name: row.name || '',
      departmentId: row.departmentId?._id || row.departmentId || '',
      semester: row.semester || '',
      credits: row.credits || '',
      type: row.type || 'theory',
    })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Subject Management</h1>

            <form className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4" onSubmit={handleSubmit}>
              <input value={form.subjectCode} onChange={(e) => setForm((c) => ({ ...c, subjectCode: e.target.value.toUpperCase() }))} placeholder="Subject Code" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} placeholder="Subject Name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <select value={form.departmentId} onChange={(e) => setForm((c) => ({ ...c, departmentId: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">Select department</option>
                {departmentRows.map((department) => (
                  <option key={department._id} value={department._id}>{department.code || department.name}</option>
                ))}
              </select>
              <input type="number" min="1" max="8" value={form.semester} onChange={(e) => setForm((c) => ({ ...c, semester: e.target.value }))} placeholder="Semester" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input type="number" min="1" max="5" value={form.credits} onChange={(e) => setForm((c) => ({ ...c, credits: e.target.value }))} placeholder="Credits" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <select value={form.type} onChange={(e) => setForm((c) => ({ ...c, type: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="theory">Theory</option>
                <option value="lab">Lab</option>
                <option value="elective">Elective</option>
              </select>
              <button type="submit" disabled={saveMutation.isPending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{editingId ? 'Update Subject' : 'Create Subject'}</button>
              {editingId && <button type="button" onClick={() => { setEditingId(''); setForm({ subjectCode: '', name: '', departmentId: '', semester: '', credits: '', type: 'theory' }) }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel Edit</button>}
            </form>

            <div className="mt-4">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by subject name/code" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>

            <div className="mt-4 space-y-4">
              {subjectsBySemester.map((group) => (
                <div key={group.semester} className="overflow-x-auto rounded-xl border border-slate-200">
                  <div className="border-b border-slate-200 bg-slate-100 px-3 py-2">
                    <p className="text-sm font-semibold text-slate-800">
                      Semester {group.semester} ({group.rows.length} subject{group.rows.length === 1 ? '' : 's'})
                    </p>
                  </div>
                  <table className="w-full min-w-[920px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-600">
                        <th className="py-2 px-3">Code</th>
                        <th className="py-2 px-3">Name</th>
                        <th className="py-2 px-3">Dept</th>
                        <th className="py-2 px-3">Credits</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={row._id} className="border-b border-slate-100">
                          <td className="py-2 px-3">{row.subjectCode || row.code}</td>
                          <td className="py-2 px-3 font-semibold">{row.name}</td>
                          <td className="py-2 px-3">{row.departmentId?.code || row.departmentId?.name || '-'}</td>
                          <td className="py-2 px-3">{row.credits}</td>
                          <td className="py-2 px-3">{row.type}</td>
                          <td className="py-2 px-3">{row.isActive === false ? 'Inactive' : 'Active'}</td>
                          <td className="py-2 px-3">
                            <div className="flex gap-2">
                              <button type="button" onClick={() => onEdit(row)} className="rounded border border-slate-300 px-2 py-1 text-xs">Edit</button>
                              <button type="button" onClick={() => deleteMutation.mutate(row._id)} disabled={deleteMutation.isPending || row.isActive === false} className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 disabled:opacity-50">Deactivate</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              {subjectsBySemester.length === 0 && (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                  No subjects found.
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
