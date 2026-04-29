import { useEffect, useMemo, useState, useCallback } from 'react'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import { adminApi } from '@/api/adminApi'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'

const toRows = (response) => {
  const payload = response?.data || response || {}
  if (Array.isArray(payload.items)) return payload.items
  if (Array.isArray(payload.students)) return payload.students
  if (Array.isArray(payload.data)) return payload.data
  if (Array.isArray(payload)) return payload
  return []
}

export default function AdminStudents() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [search, setSearch] = useState('')
  const [bulkFile, setBulkFile] = useState(null)
  const [bulkDepartmentId, setBulkDepartmentId] = useState('')
  const [form, setForm] = useState({
    name: '',
    email: '',
    rollNumber: '',
    phone: '',
    guardianPhone: '',
    departmentId: '',
    semester: '',
    section: '',
    batch: '',
  })

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((current) => !current)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const departmentsQuery = useQuery({
    queryKey: ['admin-students', 'departments'],
    queryFn: useCallback(() => adminApi.getDepartments(), []),
  })

  const studentsQuery = useQuery({
    queryKey: ['admin-students', 'list'],
    queryFn: useCallback(() => adminApi.getStudents({ page: 1, limit: 1000 }), []),
  })

  const saveMutation = useMutation({
    mutationFn: (payload) => {
      if (editingId) {
        return adminApi.updateStudent(editingId, payload)
      }
      return adminApi.createStudent(payload)
    },
    onSuccess: (response) => {
      const data = response?.data || response || {}
      const student = data?.student || {}
      const temporaryPassword = data?.temporaryPassword

      if (!editingId && student.email && temporaryPassword) {
        // Show popup with credentials
        window.alert(`Student account created successfully!\n\nEmail: ${student.email}\nTemporary Password: ${temporaryPassword}\n\nPlease share these credentials with the student and ask them to change the password after first login.`)
        toast.success('Student created with credentials sent')
      } else {
        toast.success(editingId ? 'Student updated' : 'Student created')
      }

      setEditingId('')
      setForm({
        name: '',
        email: '',
        rollNumber: '',
        phone: '',
        guardianPhone: '',
        departmentId: '',
        semester: '',
        section: '',
        batch: '',
      })
      studentsQuery.refetch()
    },
    onError: (error) => toast.error(error.message || 'Unable to save student'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => adminApi.deleteStudent(id),
    onSuccess: () => {
      toast.success('Student deactivated')
      studentsQuery.refetch()
    },
    onError: (error) => toast.error(error.message || 'Unable to deactivate student'),
  })

  const bulkImportMutation = useMutation({
    mutationFn: ({ file, departmentId }) => adminApi.bulkImportStudents(file, departmentId),
    onSuccess: (response) => {
      const payload = response?.data || response || {}
      const summary = payload?.summary || {}
      const failedRows = Array.isArray(payload?.failedRows) ? payload.failedRows : []

      toast.success(
        `Import completed. Created: ${summary.createdCount || 0}, Failed: ${summary.failedCount || 0}`
      )

      if (failedRows.length > 0) {
        const preview = failedRows
          .slice(0, 10)
          .map((row) => `Row ${row.rowNumber}: ${row.reason}`)
          .join('\n')
        window.alert(
          `Some rows failed during import:\n\n${preview}${
            failedRows.length > 10 ? `\n...and ${failedRows.length - 10} more rows` : ''
          }`
        )
      }

      setBulkFile(null)
      studentsQuery.refetch()
    },
    onError: (error) => toast.error(error.message || 'Unable to import students from Excel'),
  })

  const departmentRows = useMemo(() => {
    const payload = departmentsQuery.data?.data || departmentsQuery.data || {}
    if (Array.isArray(payload.departments)) return payload.departments
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload)) return payload
    return []
  }, [departmentsQuery.data])

  const students = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const rows = toRows(studentsQuery.data)
    if (!keyword) return rows
    return rows.filter((row) => {
      const name = String(row?.name || '').toLowerCase()
      const email = String(row?.email || '').toLowerCase()
      const roll = String(row?.rollNumber || '').toLowerCase()
      return name.includes(keyword) || email.includes(keyword) || roll.includes(keyword)
    })
  }, [studentsQuery.data, search])

  const handleSubmit = (event) => {
    event.preventDefault()

    const payload = {
      ...form,
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      rollNumber: form.rollNumber.trim().toUpperCase(),
      section: form.section.trim().toUpperCase(),
      batch: form.batch.trim(),
      semester: Number(form.semester),
    }

    if (!payload.name || !payload.email || !payload.rollNumber || !payload.departmentId || !payload.semester || !payload.section || !payload.batch) {
      toast.error('Please fill all required fields')
      return
    }

    saveMutation.mutate(payload)
  }

  const onEdit = (row) => {
    setEditingId(row._id)
    setForm({
      name: row.name || '',
      email: row.email || '',
      rollNumber: row.rollNumber || '',
      phone: row.phone || '',
      guardianPhone: row.guardianPhone || '',
      departmentId: row.departmentId?._id || row.departmentId || '',
      semester: row.semester || '',
      section: row.section || '',
      batch: row.batch || '',
    })
  }

  const handleBulkImport = () => {
    if (!bulkFile) {
      toast.error('Please choose an Excel file (.xlsx)')
      return
    }

    bulkImportMutation.mutate({
      file: bulkFile,
      departmentId: bulkDepartmentId || undefined,
    })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Student Management</h1>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">Bulk Create Students (Excel)</p>
              <p className="mt-1 text-xs text-slate-600">
                Required columns: name, email, rollNumber, semester, section, batch. Optional:
                phone, guardianPhone, departmentId, departmentCode, departmentName.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(event) => setBulkFile(event.target.files?.[0] || null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <select
                  value={bulkDepartmentId}
                  onChange={(event) => setBulkDepartmentId(event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Default department (optional)</option>
                  {departmentRows.map((department) => (
                    <option key={department._id} value={department._id}>
                      {department.code || department.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleBulkImport}
                  disabled={bulkImportMutation.isPending}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {bulkImportMutation.isPending ? 'Importing...' : 'Import Students'}
                </button>
              </div>
            </div>

            <form className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4" onSubmit={handleSubmit}>
              <input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} placeholder="Name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input value={form.email} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} placeholder="Email" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input value={form.rollNumber} onChange={(e) => setForm((c) => ({ ...c, rollNumber: e.target.value.toUpperCase() }))} placeholder="Roll Number" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <select value={form.departmentId} onChange={(e) => setForm((c) => ({ ...c, departmentId: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">Select department</option>
                {departmentRows.map((department) => (
                  <option key={department._id} value={department._id}>{department.code || department.name}</option>
                ))}
              </select>
              <input value={form.semester} onChange={(e) => setForm((c) => ({ ...c, semester: e.target.value }))} placeholder="Semester" type="number" min="1" max="8" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input value={form.section} onChange={(e) => setForm((c) => ({ ...c, section: e.target.value.toUpperCase() }))} placeholder="Section" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input value={form.batch} onChange={(e) => setForm((c) => ({ ...c, batch: e.target.value }))} placeholder="Batch (e.g. 2026-27)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input value={form.phone} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} placeholder="Phone (optional)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input value={form.guardianPhone} onChange={(e) => setForm((c) => ({ ...c, guardianPhone: e.target.value }))} placeholder="Guardian Phone (optional)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" disabled={saveMutation.isPending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {saveMutation.isPending ? 'Saving...' : editingId ? 'Update Student' : 'Create Student'}
              </button>
              {editingId && (
                <button type="button" onClick={() => { setEditingId(''); setForm({ name: '', email: '', rollNumber: '', phone: '', guardianPhone: '', departmentId: '', semester: '', section: '', batch: '' }) }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                  Cancel Edit
                </button>
              )}
            </form>

            <div className="mt-4">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name / email / roll" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="py-2">Roll</th><th className="py-2">Name</th><th className="py-2">Email</th><th className="py-2">Dept</th><th className="py-2">Sem</th><th className="py-2">Sec</th><th className="py-2">Status</th><th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((row) => (
                    <tr key={row._id} className="border-b border-slate-100">
                      <td className="py-2">{row.rollNumber}</td>
                      <td className="py-2 font-semibold">{row.name}</td>
                      <td className="py-2">{row.email}</td>
                      <td className="py-2">{row.departmentId?.code || row.departmentId?.name || '-'}</td>
                      <td className="py-2">{row.semester}</td>
                      <td className="py-2">{row.section}</td>
                      <td className="py-2">{row.isActive === false ? 'Inactive' : 'Active'}</td>
                      <td className="py-2">
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
          </section>
        </div>
      </main>
    </div>
  )
}
