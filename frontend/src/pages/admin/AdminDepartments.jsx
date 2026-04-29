import { useEffect, useMemo, useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import { PlusIcon, BuildingOffice2Icon, CheckCircleIcon } from '@heroicons/react/24/outline'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { adminApi } from '@/api/adminApi'

const normalizeDepartments = (response) => {
  const payload = response?.data || response || {}
  if (Array.isArray(payload.departments)) return payload.departments
  if (Array.isArray(payload.items)) return payload.items
  if (Array.isArray(payload.data)) return payload.data
  if (Array.isArray(payload)) return payload
  return []
}

const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 8
}

export default function AdminDepartments() {
  const queryClient = useQueryClient()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState({
    name: '',
    code: '',
    totalSemesters: 8,
  })

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((current) => !current)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const departmentsQuery = useQuery({
    queryKey: ['admin-departments'],
    queryFn: useCallback(() => adminApi.getDepartments(), []),
    select: normalizeDepartments,
  })

  const createMutation = useMutation({
    mutationFn: (data) => (editingId ? adminApi.updateDepartment(editingId, data) : adminApi.createDepartment(data)),
    onSuccess: () => {
      toast.success(editingId ? 'Department updated' : 'Department created')
      setEditingId('')
      setForm({ name: '', code: '', totalSemesters: 8 })
      queryClient.invalidateQueries({ queryKey: ['admin-departments'] })
      queryClient.invalidateQueries({ queryKey: ['adminDashboardDepartments'] })
    },
    onError: (error) => toast.error(error.message || 'Unable to create department'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id) => adminApi.deleteDepartment(id),
    onSuccess: () => {
      toast.success('Department deactivated')
      queryClient.invalidateQueries({ queryKey: ['admin-departments'] })
    },
    onError: (error) => toast.error(error.message || 'Unable to deactivate department'),
  })

  const departments = departmentsQuery.data || []

  const stats = useMemo(() => {
    const total = departments.length
    const active = departments.filter((department) => department.isActive !== false).length
    const withHod = departments.filter((department) => department.hodId).length

    return { total, active, withHod }
  }, [departments])

  const handleSubmit = (event) => {
    event.preventDefault()

    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      totalSemesters: toNumber(form.totalSemesters),
    }

    if (!payload.name || !payload.code) {
      toast.error('Department name and code are required')
      return
    }

    createMutation.mutate(payload)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <PlusIcon className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Create Department</h1>
                  <p className="text-sm text-slate-600">Add a new department from the admin side.</p>
                </div>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Department Name</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Computer Science"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-900"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Department Code</span>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
                    }
                    placeholder="CSE"
                    maxLength={10}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm uppercase outline-none transition focus:border-slate-900"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Total Semesters</span>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    step="1"
                    value={form.totalSemesters}
                    onChange={(event) => setForm((current) => ({ ...current, totalSemesters: event.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-900"
                    required
                  />
                  <p className="mt-1 text-xs text-slate-500">Allowed range: 1 to 8 semesters.</p>
                </label>

                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <BuildingOffice2Icon className="h-5 w-5" />
                  {createMutation.isPending ? 'Saving...' : editingId ? 'Update Department' : 'Create Department'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId('')
                      setForm({ name: '', code: '', totalSemesters: 8 })
                    }}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Cancel Edit
                  </button>
                )}
              </form>

              <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="text-lg font-bold text-slate-900">{stats.total}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Active</p>
                  <p className="text-lg font-bold text-slate-900">{stats.active}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">With HOD</p>
                  <p className="text-lg font-bold text-slate-900">{stats.withHod}</p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Departments</h2>
                  <p className="mt-1 text-sm text-slate-600">All active departments available in the system.</p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  <CheckCircleIcon className="h-4 w-4" />
                  Auto-refresh on save
                </div>
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-3 pr-4">Name</th>
                      <th className="py-3 pr-4">Code</th>
                      <th className="py-3 pr-4">Semesters</th>
                      <th className="py-3 pr-4">HOD</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {departmentsQuery.isLoading ? (
                      <tr>
                        <td className="py-8 text-slate-500" colSpan={6}>
                          Loading departments...
                        </td>
                      </tr>
                    ) : departments.length === 0 ? (
                      <tr>
                        <td className="py-8 text-slate-500" colSpan={6}>
                          No departments created yet.
                        </td>
                      </tr>
                    ) : (
                      departments.map((department) => (
                        <tr key={department._id} className="border-b border-slate-100">
                          <td className="py-3 pr-4 font-medium text-slate-900">{department.name}</td>
                          <td className="py-3 pr-4 text-slate-700">{department.code}</td>
                          <td className="py-3 pr-4 text-slate-700">{department.totalSemesters}</td>
                          <td className="py-3 pr-4 text-slate-700">
                            {department.hodId?.name || department.hodId?.employeeId || 'Not assigned'}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                department.isActive === false
                                  ? 'bg-slate-100 text-slate-600'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {department.isActive === false ? 'Inactive' : 'Active'}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(department._id)
                                  setForm({
                                    name: department.name || '',
                                    code: department.code || '',
                                    totalSemesters: department.totalSemesters || 8,
                                  })
                                }}
                                className="rounded border border-slate-300 px-2 py-1 text-xs"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deactivateMutation.mutate(department._id)}
                                disabled={deactivateMutation.isPending || department.isActive === false}
                                className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 disabled:opacity-50"
                              >
                                Deactivate
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}