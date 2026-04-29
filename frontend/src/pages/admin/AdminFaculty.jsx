import { useEffect, useMemo, useState, useCallback } from 'react'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import { apiGet, apiPost } from '@/api/axiosInstance'
import { adminApi } from '@/api/adminApi'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'

const toRows = (response) => {
  const payload = response?.data || response || {}
  if (Array.isArray(payload.items)) return payload.items
  if (Array.isArray(payload.data)) return payload.data
  if (Array.isArray(payload.faculty)) return payload.faculty
  if (Array.isArray(payload)) return payload
  return []
}

export default function AdminFaculty() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState({
    name: '',
    email: '',
    departmentId: '',
    phone: '',
    specialization: '',
    designation: 'Assistant Professor',
  })

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((current) => !current)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const departmentsQuery = useQuery({
    queryKey: ['admin-faculty', 'departments'],
    queryFn: useCallback(() => apiGet('/departments'), []),
  })

  const facultyQuery = useQuery({
    queryKey: ['admin-faculty', 'list'],
    queryFn: useCallback(() => apiGet('/faculty', { page: 1, limit: 1000 }), []),
  })

  const createFacultyMutation = useMutation({
    mutationFn: (payload) => {
      if (editingId) {
        return adminApi.updateFaculty(editingId, payload)
      }
      return apiPost('/admin/faculty/create', payload)
    },
    onSuccess: (response) => {
      const data = response?.data || response || {}
      const credentials = data?.credentials || {}
      const emailSent = data?.emailSent !== false

      toast.success(editingId ? 'Faculty updated' : emailSent ? 'Faculty account created' : 'Faculty created, but credential email was not sent')
      setEditingId('')
      setForm({
        name: '',
        email: '',
        departmentId: '',
        phone: '',
        specialization: '',
        designation: 'Assistant Professor',
      })
      facultyQuery.refetch()

      if (!editingId && credentials.email && credentials.temporaryPassword) {
        window.alert(`Faculty login created.\nEmail: ${credentials.email}\nTemporary Password: ${credentials.temporaryPassword}`)
      }

      if (!emailSent) {
        toast.error('SMTP is unavailable. Share the popup credentials manually.')
      }
    },
    onError: (error) => toast.error(error.message || 'Unable to create faculty account'),
  })

  const deactivateFacultyMutation = useMutation({
    mutationFn: (id) => adminApi.deleteFaculty(id),
    onSuccess: () => {
      toast.success('Faculty deactivated')
      facultyQuery.refetch()
    },
    onError: (error) => toast.error(error.message || 'Unable to deactivate faculty'),
  })

  const departmentRows = useMemo(() => {
    const payload = departmentsQuery.data?.data || departmentsQuery.data || {}
    if (Array.isArray(payload.departments)) return payload.departments
    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload)) return payload
    return []
  }, [departmentsQuery.data])

  const facultyRows = useMemo(() => {
    const rows = toRows(facultyQuery.data)
    const keyword = search.trim().toLowerCase()
    if (!keyword) return rows

    return rows.filter((row) => {
      const name = String(row?.name || '').toLowerCase()
      const email = String(row?.email || '').toLowerCase()
      return name.includes(keyword) || email.includes(keyword)
    })
  }, [facultyQuery.data, search])

  const hodFacultyIds = useMemo(() => {
    return new Set(
      departmentRows
        .map((department) => department?.hodId?._id || department?.hodId)
        .filter(Boolean)
        .map((id) => String(id))
    )
  }, [departmentRows])

  const handleCreate = (event) => {
    event.preventDefault()

    const payload = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      departmentId: form.departmentId,
      phone: form.phone.trim(),
      specialization: form.specialization.trim(),
      designation: form.designation,
    }

    if (!payload.name || !payload.email || !payload.departmentId) {
      toast.error('Name, email and department are required')
      return
    }

    createFacultyMutation.mutate(payload)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Faculty Management</h1>
            <p className="mt-1 text-sm text-slate-600">Create faculty accounts and view all faculty records.</p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">Create Faculty Account</p>

              <form className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4" onSubmit={handleCreate}>
                <input
                  type="text"
                  placeholder="Full name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <select
                  value={form.departmentId}
                  onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select department</option>
                  {departmentRows.map((department) => (
                    <option key={department._id} value={department._id}>
                      {department.code || department.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Phone (optional)"
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="Specialization (optional)"
                  value={form.specialization}
                  onChange={(event) => setForm((current) => ({ ...current, specialization: event.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <select
                  value={form.designation}
                  onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="Assistant Professor">Assistant Professor</option>
                  <option value="Associate Professor">Associate Professor</option>
                  <option value="Professor">Professor</option>
                  <option value="HOD">HOD</option>
                </select>
                <button
                  type="submit"
                  disabled={createFacultyMutation.isPending}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {createFacultyMutation.isPending ? 'Saving Faculty...' : editingId ? 'Update Faculty' : 'Create Faculty'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId('')
                      setForm({
                        name: '',
                        email: '',
                        departmentId: '',
                        phone: '',
                        specialization: '',
                        designation: 'Assistant Professor',
                      })
                    }}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Cancel Edit
                  </button>
                )}
              </form>
            </div>

            <div className="mt-4">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by faculty name / email"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="py-2">Name</th>
                    <th className="py-2">Email</th>
                    <th className="py-2">Department</th>
                    <th className="py-2">Designation</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {facultyRows.map((row) => (
                    <tr key={row._id} className="border-b border-slate-100">
                      <td className="py-2 font-semibold text-slate-900">{row.name || '-'}</td>
                      <td className="py-2 text-slate-700">{row.email || '-'}</td>
                      <td className="py-2 text-slate-700">{row.departmentId?.code || row.departmentId?.name || '-'}</td>
                      <td className="py-2 text-slate-700">{row.designation || (hodFacultyIds.has(String(row._id)) ? 'HOD' : '-')}</td>
                      <td className="py-2 text-slate-700">{row.isActive === false ? 'Inactive' : 'Active'}</td>
                      <td className="py-2 text-slate-700">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(row._id)
                              setForm({
                                name: row.name || '',
                                email: row.email || '',
                                departmentId: row.departmentId?._id || row.departmentId || '',
                                phone: row.phone || '',
                                specialization: row.specialization || '',
                                designation: row.designation || (hodFacultyIds.has(String(row._id)) ? 'HOD' : 'Assistant Professor'),
                              })
                            }}
                            className="rounded border border-slate-300 px-2 py-1 text-xs"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deactivateFacultyMutation.mutate(row._id)}
                            disabled={deactivateFacultyMutation.isPending || row.isActive === false}
                            className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 disabled:opacity-50"
                          >
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {facultyRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        No faculty found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
