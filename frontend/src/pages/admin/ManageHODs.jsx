import { useEffect, useMemo, useState, useCallback } from 'react'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import api, { apiGet, apiPost, apiPut } from '@/api/axiosInstance'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'

const toList = (value) => (Array.isArray(value) ? value : [])
const toDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString()
}

const normalizeRows = (response) => {
  const payload = response?.data || response || {}
  if (Array.isArray(payload.items)) return payload.items
  if (Array.isArray(payload.data)) return payload.data
  if (Array.isArray(payload.faculty)) return payload.faculty
  if (Array.isArray(payload)) return payload
  return []
}

export default function ManageHODs() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [assignByDept, setAssignByDept] = useState({})
  const [transferByDept, setTransferByDept] = useState({})
  const [selectedFacultyId, setSelectedFacultyId] = useState('')
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    departmentId: '',
    phone: '',
    specialization: '',
  })

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((current) => !current)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const departmentsQuery = useQuery({
    queryKey: ['admin-hods', 'departments'],
    queryFn: useCallback(() => apiGet('/departments'), []),
  })

  const facultyQuery = useQuery({
    queryKey: ['admin-hods', 'faculty'],
    queryFn: useCallback(() => apiGet('/faculty', { page: 1, limit: 1000 }), []),
  })

  const refreshHodData = useCallback(() => {
    departmentsQuery.refetch()
    facultyQuery.refetch()
  }, [departmentsQuery, facultyQuery])

  const assignMutation = useMutation({
    mutationFn: ({ departmentId, facultyId }) => apiPost('/admin/hods', { departmentId, facultyId }),
    onSuccess: () => {
      toast.success('HOD assigned')
      refreshHodData()
    },
    onError: (error) => toast.error(error.message || 'Unable to assign HOD'),
  })

  const transferMutation = useMutation({
    mutationFn: ({ departmentId, facultyId }) =>
      apiPut('/admin/hods', {
        action: 'transfer',
        facultyId,
        fromDepartmentId: departmentId,
        toDepartmentId: departmentId,
      }),
    onSuccess: () => {
      toast.success('HOD updated')
      refreshHodData()
    },
    onError: (error) => toast.error(error.message || 'Unable to transfer HOD'),
  })

  const removeMutation = useMutation({
    mutationFn: ({ departmentId, facultyId }) => api.delete('/admin/hods', { data: { departmentId, facultyId } }),
    onSuccess: () => {
      toast.success('HOD removed and reverted to faculty role')
      refreshHodData()
    },
    onError: (error) => toast.error(error.message || 'Unable to remove HOD'),
  })

  const createHodMutation = useMutation({
    mutationFn: (payload) => apiPost('/admin/hods/create', payload),
    onSuccess: (response) => {
      const data = response?.data || response || {}
      const credentials = data?.credentials || {}
      const emailSent = data?.emailSent !== false

      toast.success(emailSent ? 'HOD account created and assigned' : 'HOD assigned, but credential email was not sent')
      setCreateForm({
        name: '',
        email: '',
        departmentId: '',
        phone: '',
        specialization: '',
      })
      setSelectedFacultyId('')
      setAssignByDept({})
      setTransferByDept({})
      refreshHodData()

      if (credentials.email && credentials.temporaryPassword) {
        window.alert(`HOD login created.\nEmail: ${credentials.email}\nTemporary Password: ${credentials.temporaryPassword}`)
      }

      if (!emailSent) {
        toast.error('SMTP is unavailable. Share the popup credentials manually.')
      }
    },
    onError: (error) => toast.error(error.message || 'Unable to create HOD account'),
  })

  const facultyRows = useMemo(() => {
    return normalizeRows(facultyQuery.data)
      .map((row) => ({
        _id: row._id || row.id,
        name: row.name || row.email || 'Faculty',
        email: row.email || '',
        employeeId: row.employeeId || '',
        designation: row.designation || '',
        departmentId: row.departmentId || null,
        departmentName: row.departmentId?.name || row.departmentName || '',
      }))
      .filter((row) => row._id)
  }, [facultyQuery.data])
  const departmentRows = useMemo(() => {
    const payload = departmentsQuery.data?.data || departmentsQuery.data || {}
    if (Array.isArray(payload.departments)) return payload.departments
    if (Array.isArray(payload.items)) return payload.items
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload)) return payload
    return []
  }, [departmentsQuery.data])

  const deptRows = useMemo(() => {
    const departments = departmentRows

    return departments.map((department) => {
      const deptFaculty = facultyRows.filter(
        (faculty) => String(faculty.departmentId?._id || faculty.departmentId || '') === String(department._id || '')
      )

      const hodProfile = department.hodId
        ? {
            facultyId: department.hodId._id || department.hodId,
            name: department.hodId.name || department.hodId.employeeId || 'HOD',
            since: department.updatedAt || department.createdAt,
          }
        : deptFaculty.find((faculty) => String(faculty.designation || '').toLowerCase() === 'hod')
          ? {
              facultyId:
                deptFaculty.find((faculty) => String(faculty.designation || '').toLowerCase() === 'hod')._id,
              name:
                deptFaculty.find((faculty) => String(faculty.designation || '').toLowerCase() === 'hod').name,
              since: department.updatedAt || department.createdAt,
            }
          : null

      return {
        deptId: department._id,
        deptName: department.code || department.name || 'Department',
        faculty: deptFaculty,
        currentHod: hodProfile,
      }
    })
  }, [departmentRows, facultyRows])

  const handleAssign = (row) => {
    const facultyId = assignByDept[row.deptId]
    if (!facultyId) {
      toast.error('Select a faculty member first')
      return
    }

    assignMutation.mutate({
      departmentId: row.deptId,
      facultyId,
    })
  }

  const handleTransfer = (row) => {
    const facultyId = transferByDept[row.deptId]
    if (!facultyId) {
      toast.error('Select a new HOD first')
      return
    }

    transferMutation.mutate({
      departmentId: row.deptId,
      facultyId,
    })
  }

  const handleRemove = (row) => {
    if (!row.currentHod?.facultyId) {
      toast.error('No HOD assigned for this department')
      return
    }

    const confirmed = window.confirm('Remove current HOD and revert role back to faculty?')
    if (!confirmed) return

    removeMutation.mutate({
      departmentId: row.deptId,
      facultyId: row.currentHod.facultyId,
    })
  }

  const handleCreateAndAssign = () => {
    const hasExistingFaculty = Boolean(selectedFacultyId)
    const payload = {
      facultyId: hasExistingFaculty ? selectedFacultyId : undefined,
      name: hasExistingFaculty ? '' : createForm.name.trim(),
      email: hasExistingFaculty ? '' : createForm.email.trim().toLowerCase(),
      departmentId: createForm.departmentId,
      phone: hasExistingFaculty ? '' : createForm.phone.trim(),
      specialization: hasExistingFaculty ? '' : createForm.specialization.trim(),
    }

    if (!payload.departmentId) {
      toast.error('Department is required')
      return
    }

    if (!hasExistingFaculty && (!payload.name || !payload.email)) {
      toast.error('Name, email and department are required')
      return
    }

    createHodMutation.mutate(payload)
  }

  const handleFacultySelection = (facultyId) => {
    setSelectedFacultyId(facultyId)

    if (!facultyId) {
      setCreateForm((current) => ({
        ...current,
        name: '',
        email: '',
      }))
      return
    }

    const faculty = facultyRows.find((row) => row._id === facultyId)
    if (!faculty) {
      return
    }

    setCreateForm((current) => ({
      ...current,
      name: faculty.name || current.name,
      email: faculty.email || current.email,
    }))
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Manage HOD Assignments</h1>
            <p className="mt-1 text-sm text-slate-600">Assign, remove, and transfer HOD roles across departments.</p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">
                {selectedFacultyId ? 'Promote Existing Faculty to HOD' : 'Create New HOD Account and Auto-Assign'}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Select an existing faculty member to promote, then choose the department. Or create a new HOD account in one step.
              </p>

              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                <select
                  value={selectedFacultyId}
                  onChange={(event) => handleFacultySelection(event.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
                >
                  <option value="">Create new faculty as HOD</option>
                  {facultyRows.map((faculty) => (
                    <option key={faculty._id} value={faculty._id}>
                      {faculty.name} {faculty.employeeId ? `(${faculty.employeeId})` : ''} - {faculty.departmentName || 'No department'}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Full name"
                  value={createForm.name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={createForm.email}
                  onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <select
                  value={createForm.departmentId}
                  onChange={(event) => setCreateForm((current) => ({ ...current, departmentId: event.target.value }))}
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
                  value={createForm.phone}
                  onChange={(event) => setCreateForm((current) => ({ ...current, phone: event.target.value }))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="Specialization (optional)"
                  value={createForm.specialization}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, specialization: event.target.value }))
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleCreateAndAssign}
                  disabled={createHodMutation.isPending}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {createHodMutation.isPending
                    ? 'Saving HOD...'
                    : selectedFacultyId
                      ? 'Promote Faculty to HOD'
                      : 'Create & Assign HOD'}
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="py-2">Dept</th>
                    <th className="py-2">Current HOD</th>
                    <th className="py-2">Since</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deptRows.map((row) => (
                    <tr key={row.deptId} className="border-b border-slate-100 align-top">
                      <td className="py-3 font-semibold text-slate-900">{row.deptName}</td>
                      <td className="py-3 text-slate-700">{row.currentHod?.name || 'Not Assigned'}</td>
                      <td className="py-3 text-slate-600">{toDate(row.currentHod?.since)}</td>
                      <td className="py-3">
                        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                          <div className="rounded-lg border border-slate-200 p-2">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Assign HOD</p>
                            <select
                              value={assignByDept[row.deptId] || ''}
                              onChange={(event) =>
                                setAssignByDept((current) => ({
                                  ...current,
                                  [row.deptId]: event.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                            >
                              <option value="">Select faculty</option>
                              {row.faculty.map((faculty) => (
                                <option key={faculty._id} value={faculty._id}>{faculty.name}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleAssign(row)}
                              className="mt-2 w-full rounded-lg bg-slate-900 px-2 py-1.5 text-xs font-semibold text-white"
                              disabled={assignMutation.isPending}
                            >
                              Assign HOD
                            </button>
                          </div>

                          <div className="rounded-lg border border-slate-200 p-2">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Remove HOD</p>
                            <button
                              type="button"
                              onClick={() => handleRemove(row)}
                              className="w-full rounded-lg bg-rose-600 px-2 py-1.5 text-xs font-semibold text-white"
                              disabled={removeMutation.isPending || !row.currentHod?.facultyId}
                            >
                              Remove HOD
                            </button>
                          </div>

                          <div className="rounded-lg border border-slate-200 p-2">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Transfer HOD</p>
                            <select
                              value={transferByDept[row.deptId] || ''}
                              onChange={(event) =>
                                setTransferByDept((current) => ({
                                  ...current,
                                  [row.deptId]: event.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                            >
                              <option value="">Select new HOD</option>
                              {row.faculty
                                .filter((faculty) => String(faculty._id) !== String(row.currentHod?.facultyId || ''))
                                .map((faculty) => (
                                  <option key={faculty._id} value={faculty._id}>{faculty.name}</option>
                                ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleTransfer(row)}
                              className="mt-2 w-full rounded-lg bg-amber-600 px-2 py-1.5 text-xs font-semibold text-white"
                              disabled={assignMutation.isPending || !row.currentHod}
                            >
                              Transfer HOD
                            </button>
                          </div>
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
