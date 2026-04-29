import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import PageHeader from '@/components/shared/PageHeader'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import { authApi } from '@/api/authApi'
import { useAuth } from '@/context/AuthContext'

const initialExtra = {
  fullName: '',
  phone: '',
  alternatePhone: '',
  gender: '',
  dateOfBirth: '',
  address: '',
  bio: '',
  profilePhoto: '',
}

const initialRoleFields = {
  name: '',
  phone: '',
  guardianPhone: '',
  specialization: '',
  profilePhoto: '',
}

const toDateInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

const valueOrEmpty = (value) => (value === null || value === undefined ? '' : String(value))

export default function ProfilePage() {
  const { updateUser } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [accountEmail, setAccountEmail] = useState('')
  const [roleFields, setRoleFields] = useState(initialRoleFields)
  const [extraProfile, setExtraProfile] = useState(initialExtra)

  const profileQuery = useQuery({
    queryKey: ['profile-page'],
    queryFn: () => authApi.getProfile(),
    select: (response) => response?.data?.profile || response?.profile || null,
  })

  const profile = profileQuery.data
  const account = profile?.account || {}
  const roleProfile = profile?.roleProfile || null
  const extra = profile?.extraProfile || null

  const isStudent = account.role === 'student'
  const isFacultyRole = ['faculty', 'class_teacher', 'time_table_coordinator', 'attendance_coordinator', 'hod'].includes(account.role)

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  useEffect(() => {
    if (!profile) return

    setAccountEmail(valueOrEmpty(account.email))
    setRoleFields({
      name: valueOrEmpty(roleProfile?.name),
      phone: valueOrEmpty(roleProfile?.phone),
      guardianPhone: valueOrEmpty(roleProfile?.guardianPhone),
      specialization: valueOrEmpty(roleProfile?.specialization),
      profilePhoto: valueOrEmpty(roleProfile?.profilePhoto),
    })

    setExtraProfile({
      fullName: valueOrEmpty(extra?.fullName || roleProfile?.name),
      phone: valueOrEmpty(extra?.phone || roleProfile?.phone),
      alternatePhone: valueOrEmpty(extra?.alternatePhone),
      gender: valueOrEmpty(extra?.gender),
      dateOfBirth: toDateInput(extra?.dateOfBirth),
      address: valueOrEmpty(extra?.address),
      bio: valueOrEmpty(extra?.bio),
      profilePhoto: valueOrEmpty(extra?.profilePhoto || roleProfile?.profilePhoto),
    })
  }, [account.email, extra, profile, roleProfile])

  const saveMutation = useMutation({
    mutationFn: () =>
      authApi.updateProfile({
        account: { email: accountEmail },
        roleProfile: {
          name: roleFields.name,
          phone: roleFields.phone,
          guardianPhone: roleFields.guardianPhone,
          specialization: roleFields.specialization,
          profilePhoto: roleFields.profilePhoto,
        },
        extraProfile: {
          ...extraProfile,
          gender: extraProfile.gender || null,
          dateOfBirth: extraProfile.dateOfBirth || null,
        },
      }),
    onSuccess: (response) => {
      const nextProfile = response?.data?.profile || response?.profile
      const nextAccount = nextProfile?.account || null
      toast.success('Profile saved successfully')
      if (nextAccount) {
        updateUser({
          email: nextAccount.email,
          role: nextAccount.role,
        })
      }
      profileQuery.refetch()
    },
    onError: (error) => toast.error(error.message || 'Unable to save profile'),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      authApi.createProfile({
        ...extraProfile,
        gender: extraProfile.gender || null,
        dateOfBirth: extraProfile.dateOfBirth || null,
      }),
    onSuccess: () => {
      toast.success('Profile details created')
      profileQuery.refetch()
    },
    onError: (error) => toast.error(error.message || 'Unable to create profile details'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => authApi.deleteProfile(),
    onSuccess: () => {
      toast.success('Additional profile details deleted')
      setExtraProfile(initialExtra)
      profileQuery.refetch()
    },
    onError: (error) => toast.error(error.message || 'Unable to delete profile details'),
  })

  const canDeleteExtra = Boolean(extra?.id)

  const roleSummary = useMemo(() => {
    if (!roleProfile) return []

    const rows = [
      { label: 'Name', value: roleProfile.name },
      { label: 'Department', value: roleProfile.departmentName },
      { label: 'Department Code', value: roleProfile.departmentCode },
      { label: 'Phone', value: roleProfile.phone },
      { label: 'Role', value: account.role },
    ]

    if (roleProfile.rollNumber) rows.push({ label: 'Roll Number', value: roleProfile.rollNumber })
    if (roleProfile.semester !== undefined) rows.push({ label: 'Semester', value: roleProfile.semester })
    if (roleProfile.section) rows.push({ label: 'Section', value: roleProfile.section })
    if (roleProfile.batch) rows.push({ label: 'Batch', value: roleProfile.batch })
    if (roleProfile.designation) rows.push({ label: 'Designation', value: roleProfile.designation })
    if (roleProfile.specialization) rows.push({ label: 'Specialization', value: roleProfile.specialization })

    return rows
  }, [account.role, roleProfile])

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6 lg:px-8">
          <PageHeader title="My Profile" subtitle="View and manage complete account details." />

          {profileQuery.isLoading ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading profile...</section>
          ) : null}

          {!profileQuery.isLoading && profile ? (
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Account Details</h2>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Email</span>
                    <input
                      type="email"
                      value={accountEmail}
                      onChange={(event) => setAccountEmail(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <div className="text-sm">
                    <p className="mb-1 font-medium text-slate-700">Role</p>
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">{account.role || '-'}</p>
                  </div>
                  <div className="text-sm">
                    <p className="mb-1 font-medium text-slate-700">Last Login</p>
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                      {account.lastLogin ? new Date(account.lastLogin).toLocaleString() : '-'}
                    </p>
                  </div>
                  <div className="text-sm">
                    <p className="mb-1 font-medium text-slate-700">Created</p>
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                      {account.createdAt ? new Date(account.createdAt).toLocaleString() : '-'}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Role Details</h2>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {roleSummary.map((row) => (
                    <div key={row.label} className="text-sm">
                      <p className="mb-1 font-medium text-slate-700">{row.label}</p>
                      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">{row.value || '-'}</p>
                    </div>
                  ))}
                </div>

                {roleProfile ? (
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Display Name</span>
                      <input
                        type="text"
                        value={roleFields.name}
                        onChange={(event) => setRoleFields((current) => ({ ...current, name: event.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>

                    <label className="text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Phone</span>
                      <input
                        type="text"
                        value={roleFields.phone}
                        onChange={(event) => setRoleFields((current) => ({ ...current, phone: event.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>

                    {isStudent ? (
                      <label className="text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Guardian Phone</span>
                        <input
                          type="text"
                          value={roleFields.guardianPhone}
                          onChange={(event) => setRoleFields((current) => ({ ...current, guardianPhone: event.target.value }))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </label>
                    ) : null}

                    {isFacultyRole ? (
                      <label className="text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Specialization</span>
                        <input
                          type="text"
                          value={roleFields.specialization}
                          onChange={(event) => setRoleFields((current) => ({ ...current, specialization: event.target.value }))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Extended Profile Details</h2>
                <p className="mt-1 text-sm text-slate-500">Create, update, or delete your extended profile information.</p>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Full Name</span>
                    <input
                      type="text"
                      value={extraProfile.fullName}
                      onChange={(event) => setExtraProfile((current) => ({ ...current, fullName: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Primary Phone</span>
                    <input
                      type="text"
                      value={extraProfile.phone}
                      onChange={(event) => setExtraProfile((current) => ({ ...current, phone: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Alternate Phone</span>
                    <input
                      type="text"
                      value={extraProfile.alternatePhone}
                      onChange={(event) => setExtraProfile((current) => ({ ...current, alternatePhone: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Gender</span>
                    <select
                      value={extraProfile.gender}
                      onChange={(event) => setExtraProfile((current) => ({ ...current, gender: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    >
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Date Of Birth</span>
                    <input
                      type="date"
                      value={extraProfile.dateOfBirth}
                      onChange={(event) => setExtraProfile((current) => ({ ...current, dateOfBirth: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Profile Photo URL</span>
                    <input
                      type="text"
                      value={extraProfile.profilePhoto}
                      onChange={(event) => setExtraProfile((current) => ({ ...current, profilePhoto: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                </div>

                <label className="mt-4 block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Address</span>
                  <textarea
                    value={extraProfile.address}
                    onChange={(event) => setExtraProfile((current) => ({ ...current, address: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    rows={3}
                  />
                </label>

                <label className="mt-4 block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Bio</span>
                  <textarea
                    value={extraProfile.bio}
                    onChange={(event) => setExtraProfile((current) => ({ ...current, bio: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    rows={4}
                  />
                </label>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
                  >
                    {saveMutation.isPending ? 'Saving...' : 'Update Profile'}
                  </button>

                  {!canDeleteExtra ? (
                    <button
                      type="button"
                      onClick={() => createMutation.mutate()}
                      disabled={createMutation.isPending}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-70"
                    >
                      {createMutation.isPending ? 'Creating...' : 'Create Extended Profile'}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate()}
                    disabled={!canDeleteExtra || deleteMutation.isPending}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
                  >
                    {deleteMutation.isPending ? 'Deleting...' : 'Delete Extended Profile'}
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
