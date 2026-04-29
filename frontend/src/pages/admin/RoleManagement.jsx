import { useEffect, useMemo, useState, useCallback } from 'react'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { apiGet, apiPut } from '@/api/axiosInstance'
import { useAuth } from '@/context/AuthContext'

const ROLES = ['student', 'faculty', 'class_teacher', 'time_table_coordinator', 'attendance_coordinator', 'hod', 'admin', 'principal']
const PERMISSION_OPTIONS = [
  'attendance:mark',
  'attendance:edit',
  'reports:view',
  'reports:download',
  'users:manage',
  'settings:update',
]

const toList = (value) => (Array.isArray(value) ? value : [])
const normalizeRows = (response) => {
  const payload = response?.data || response || {}
  if (Array.isArray(payload.items)) return payload.items
  if (Array.isArray(payload.data)) return payload.data
  if (Array.isArray(payload)) return payload
  return []
}

const toDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

const getAllowedRoles = (user) => {
  const profileModel = String(user?.profileModel || '')
  const currentRole = String(user?.role || '')

  if (!profileModel) {
    if (currentRole === 'student') {
      return ['student']
    }

    if (['faculty', 'class_teacher', 'time_table_coordinator', 'attendance_coordinator', 'hod'].includes(currentRole)) {
      return ['faculty', 'class_teacher', 'time_table_coordinator', 'attendance_coordinator', 'hod']
    }

    if (currentRole === 'admin') {
      return ['admin', 'principal']
    }

    if (currentRole === 'principal') {
      return ['admin', 'principal']
    }
  }

  if (profileModel === 'Student') {
    return ['student']
  }

  if (profileModel === 'Faculty') {
    return ['faculty', 'class_teacher', 'time_table_coordinator', 'attendance_coordinator', 'hod']
  }

  return ['admin', 'principal']
}

export default function RoleManagement() {
  const { user, isLoading: authLoading } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [roleModal, setRoleModal] = useState({ open: false, user: null })
  const [nextRole, setNextRole] = useState('faculty')
  const [permissionChecklist, setPermissionChecklist] = useState([])
  const canManageRoles = ['admin', 'principal'].includes(String(user?.role || ''))

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((current) => !current)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const rolesQuery = useQuery({
    queryKey: ['role-management', roleFilter],
    queryFn: useCallback(() => apiGet('/admin/roles', { page: 1, limit: 1000, role: roleFilter || undefined }), [roleFilter]),
    enabled: !authLoading && canManageRoles,
  })

  const auditQuery = useQuery({
    queryKey: ['role-management', 'audit'],
    queryFn: useCallback(() => apiGet('/admin/audit-logs', { page: 1, limit: 200, action: 'edit' }), []),
    enabled: !authLoading && canManageRoles,
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, newRole, additionalPermissions }) =>
      apiPut(`/admin/roles/${userId}`, {
        newRole,
        additionalPermissions,
      }),
    onSuccess: () => {
      toast.success('Role updated')
      setRoleModal({ open: false, user: null })
      rolesQuery.refetch()
      auditQuery.refetch()
    },
    onError: (error) => toast.error(error.message || 'Unable to update role'),
  })

  const users = useMemo(
    () =>
      normalizeRows(rolesQuery.data)
        .map((userRow) => ({
          ...userRow,
          _id: userRow?._id || userRow?.id,
        }))
        .filter((userRow) => userRow._id),
    [rolesQuery.data]
  )
  const auditRows = useMemo(() => normalizeRows(auditQuery.data), [auditQuery.data])

  const departments = useMemo(() => {
    const map = new Map()
    users.forEach((user) => {
      const dept = user?.profileId?.departmentId
      const id = dept?._id || dept?.id || dept
      if (!id) return
      if (!map.has(String(id))) {
        map.set(String(id), {
          _id: String(id),
          name: dept?.code || dept?.name || String(id),
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [users])

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase()

    return users.filter((user) => {
      const profile = user.profileId || {}
      const dept = profile.departmentId
      const deptId = String(dept?._id || dept?.id || dept || '')

      const matchesSearch =
        !term ||
        String(profile.name || '').toLowerCase().includes(term) ||
        String(user.email || '').toLowerCase().includes(term) ||
        String(user.role || '').toLowerCase().includes(term)

      const matchesDept = !deptFilter || deptId === deptFilter
      return matchesSearch && matchesDept
    })
  }, [deptFilter, search, users])

  const getRoleTrail = (userId) =>
    auditRows
      .filter((item) => String(item.targetId || '') === String(userId) && String(item.reason || '').toLowerCase().includes('role'))
      .slice(0, 5)

  const openChangeRoleModal = (user) => {
    setRoleModal({ open: true, user })
    const allowedRoles = getAllowedRoles(user)
    setNextRole(allowedRoles.includes(user.role) ? user.role : allowedRoles[0])
    setPermissionChecklist(toList(user.permissions))
  }

  const togglePermission = (permission) => {
    setPermissionChecklist((current) => {
      if (current.includes(permission)) {
        return current.filter((item) => item !== permission)
      }
      return [...current, permission]
    })
  }

  const submitRoleChange = () => {
    if (!roleModal.user?._id) return

    if (!canManageRoles) {
      toast.error('You are not authorized to manage roles')
      return
    }

    const allowedRoles = getAllowedRoles(roleModal.user)
    if (!allowedRoles.includes(nextRole)) {
      toast.error('Invalid role for this user profile')
      return
    }

    if (String(roleModal.user.role || '') === String(nextRole || '')) {
      toast.error('Selected role is the same as current role')
      return
    }

    updateRoleMutation.mutate({
      userId: roleModal.user._id,
      newRole: nextRole,
      additionalPermissions: permissionChecklist,
    })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Role Management</h1>
            <p className="mt-1 text-sm text-slate-600">Manage user roles, permissions and role-change audit trails.</p>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, email, role"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />

              <select value={deptFilter} onChange={(event) => setDeptFilter(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept._id} value={dept._id}>{dept.name}</option>
                ))}
              </select>

              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">All Roles</option>
                {ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="py-2">Name</th>
                    <th className="py-2">Email</th>
                    <th className="py-2">Current Role</th>
                    <th className="py-2">Dept</th>
                    <th className="py-2">Last Login</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const profile = user.profileId || {}
                    const dept = profile.departmentId
                    const trail = getRoleTrail(user._id)

                    return (
                      <tr key={user._id} className="border-b border-slate-100 align-top">
                        <td className="py-3 font-semibold text-slate-900">{profile.name || '-'}</td>
                        <td className="py-3 text-slate-700">{user.email || '-'}</td>
                        <td className="py-3 text-slate-700">{user.role || '-'}</td>
                        <td className="py-3 text-slate-700">{dept?.code || dept?.name || '-'}</td>
                        <td className="py-3 text-slate-600">{toDateTime(user.lastLogin || user.lastLoginAt || user.updatedAt)}</td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => openChangeRoleModal(user)}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Change Role
                          </button>

                          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                            <p className="text-xs font-semibold text-slate-600">Last 5 role changes</p>
                            <div className="mt-1 space-y-1 text-xs text-slate-600">
                              {trail.length === 0 ? (
                                <p>No role changes tracked.</p>
                              ) : (
                                trail.map((item) => (
                                  <p key={item._id}>{toDateTime(item.createdAt)} • {item.reason || item.action}</p>
                                ))
                              )}
                            </div>
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

      {roleModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <section className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Change Role</h3>
            <p className="mt-1 text-sm text-slate-600">Update role and optional permissions for {roleModal.user?.profileId?.name || roleModal.user?.email}.</p>

            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Role</span>
              <select value={nextRole} onChange={(event) => setNextRole(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {getAllowedRoles(roleModal.user).map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </label>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">Permissions Checklist</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PERMISSION_OPTIONS.map((permission) => (
                  <label key={permission} className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={permissionChecklist.includes(permission)}
                      onChange={() => togglePermission(permission)}
                    />
                    {permission}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setRoleModal({ open: false, user: null })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={submitRoleChange} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" disabled={updateRoleMutation.isPending}>{updateRoleMutation.isPending ? 'Saving...' : 'Apply Changes'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
