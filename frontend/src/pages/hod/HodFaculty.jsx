import { useEffect, useMemo, useState, useCallback } from 'react'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { hodApi } from '@/api/hodApi'
import { useAuth } from '@/context/AuthContext'
import { SECTIONS, SEMESTERS } from '@/utils/constants'

const getAcademicYear = () => {
  const now = new Date()
  const year = now.getFullYear()
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`
}

const getDepartmentFromUser = (user) => {
  const directDepartment = user?.departmentId
  if (directDepartment) {
    if (typeof directDepartment === 'object') {
      return {
        departmentId: directDepartment.id || directDepartment._id || '',
        departmentLabel: directDepartment.code || directDepartment.name || 'your department',
      }
    }

    return {
      departmentId: directDepartment,
      departmentLabel: 'your department',
    }
  }

  const profile = user?.profileId
  if (!profile || typeof profile !== 'object') {
    return {
      departmentId: '',
      departmentLabel: 'your department',
    }
  }

  const department = profile.departmentId
  if (!department) {
    return {
      departmentId: '',
      departmentLabel: 'your department',
    }
  }

  if (typeof department === 'object') {
    return {
      departmentId: department._id || department.id || '',
      departmentLabel: department.code || department.name || 'your department',
    }
  }

  return {
    departmentId: department,
    departmentLabel: 'your department',
  }
}

const toRows = (response) => {
  const payload = response?.data || response || {}
  if (Array.isArray(payload.items)) return payload.items
  if (Array.isArray(payload.data)) return payload.data
  if (Array.isArray(payload.faculty)) return payload.faculty
  if (Array.isArray(payload)) return payload
  return []
}

export default function HodFaculty() {
  const { user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    specialization: '',
    designation: 'Assistant Professor',
  })
  const [assignForm, setAssignForm] = useState({
    facultyId: '',
    semester: '1',
    section: SECTIONS[0] || 'A',
    academicYear: getAcademicYear(),
  })
  const [coordinatorFacultyId, setCoordinatorFacultyId] = useState('')
  const [attendanceCoordinatorFacultyId, setAttendanceCoordinatorFacultyId] = useState('')

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((current) => !current)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const facultyQuery = useQuery({
    queryKey: ['hod-faculty', 'list', search],
    queryFn: useCallback(() => hodApi.getDeptFaculty({ page: 1, limit: 1000, search }), [search]),
  })

  const createMutation = useMutation({
    mutationFn: (payload) => hodApi.addFaculty(payload),
    onSuccess: (response) => {
      const data = response?.data || response || {}
      const faculty = data?.faculty || {}
      const temporaryPassword = data?.temporaryPassword

      toast.success('Faculty added to your department')
      setForm({
        name: '',
        email: '',
        phone: '',
        specialization: '',
        designation: 'Assistant Professor',
      })
      facultyQuery.refetch()

      if (faculty.email && temporaryPassword) {
        window.alert(`Faculty login created.\nEmail: ${faculty.email}\nTemporary Password: ${temporaryPassword}`)
      }
    },
    onError: (error) => {
      if (error?.status === 409) {
        const backendMessage = String(error?.backendMessage || '').toLowerCase()
        if (backendMessage.includes('email')) return toast.error('Email already exists')
        if (backendMessage.includes('phone')) return toast.error('Phone number already used')
        if (backendMessage.includes('assigned')) return toast.error('Faculty already assigned to this department')
      }

      toast.error(error.message || 'Unable to create faculty')
    },
  })

  const assignMutation = useMutation({
    mutationFn: (payload) => hodApi.assignClassTeacher(payload),
    onSuccess: (response, variables) => {
      const selectedFaculty = facultyRows.find((row) => String(row._id) === String(variables.facultyId))
      const facultyName = selectedFaculty?.name || 'Faculty'
      toast.success(`${facultyName} assigned as class teacher`)

      facultyQuery.refetch()
      setAssignForm((current) => ({
        ...current,
        facultyId: '',
      }))
    },
    onError: (error) => toast.error(error.message || 'Unable to assign class teacher'),
  })

  const assignCoordinatorMutation = useMutation({
    mutationFn: (payload) => hodApi.assignTimeTableCoordinator(payload),
    onSuccess: (response) => {
      const payload = response?.data || response || {}
      toast.success(`${payload.facultyName || 'Faculty'} assigned as Time Table Coordinator`)
      setCoordinatorFacultyId('')
      facultyQuery.refetch()
    },
    onError: (error) => toast.error(error.message || 'Unable to assign Time Table Coordinator'),
  })

  const assignAttendanceCoordinatorMutation = useMutation({
    mutationFn: (payload) => hodApi.assignAttendanceCoordinator(payload),
    onSuccess: (response) => {
      const payload = response?.data || response || {}
      toast.success(`${payload.facultyName || 'Faculty'} assigned as Attendance Coordinator`)
      setAttendanceCoordinatorFacultyId('')
      facultyQuery.refetch()
    },
    onError: (error) => toast.error(error.message || 'Unable to assign Attendance Coordinator'),
  })

  const facultyRows = toRows(facultyQuery.data)

  const { departmentId, departmentLabel } = useMemo(() => {
    const fromUser = getDepartmentFromUser(user)
    if (fromUser.departmentId) {
      return fromUser
    }

    const facultyDepartment = facultyRows.find((row) => row?.departmentId)
    const department = facultyDepartment?.departmentId

    if (department && typeof department === 'object') {
      return {
        departmentId: department.id || department._id || '',
        departmentLabel: department.code || department.name || 'your department',
      }
    }

    if (department) {
      return {
        departmentId: department,
        departmentLabel: 'your department',
      }
    }

    return {
      departmentId: '',
      departmentLabel: 'your department',
    }
  }, [facultyRows, user])

  const classTeacherRows = facultyRows.filter((row) => Array.isArray(row.classesAssigned) && row.classesAssigned.length > 0)

  const filteredRows = (() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) {
      return facultyRows
    }

    return facultyRows.filter((row) => {
      const name = String(row?.name || '').toLowerCase()
      const email = String(row?.email || '').toLowerCase()
      return name.includes(keyword) || email.includes(keyword)
    })
  })()

  const sortedAssignments = [...classTeacherRows].sort((left, right) => {
    const leftSemester = Number(left?.classesAssigned?.[0]?.semester || 0)
    const rightSemester = Number(right?.classesAssigned?.[0]?.semester || 0)
    if (leftSemester !== rightSemester) return leftSemester - rightSemester
    return String(left.name || '').localeCompare(String(right.name || ''))
  })

  const handleSubmit = (event) => {
    event.preventDefault()

    if (createMutation.isPending) {
      return
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      specialization: form.specialization.trim(),
      designation: form.designation,
    }

    if (!payload.name || !payload.email) {
      toast.error('Name and email are required')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      toast.error('Please enter a valid email')
      return
    }

    if (payload.phone && !/^\+?[0-9]{10,15}$/.test(payload.phone)) {
      toast.error('Phone must be 10-15 digits')
      return
    }

    createMutation.mutate(payload)
  }

  const handleAssignClassTeacher = (event) => {
    event.preventDefault()

    if (!departmentId) {
      toast.error('Department information is unavailable. Load your faculty list first or re-login.')
      return
    }

    if (!assignForm.facultyId || !assignForm.semester || !assignForm.section || !assignForm.academicYear) {
      toast.error('Please select faculty, semester, section and academic year')
      return
    }

    assignMutation.mutate({
      facultyId: assignForm.facultyId,
      departmentId,
      semester: Number(assignForm.semester),
      section: String(assignForm.section).toUpperCase(),
      academicYear: String(assignForm.academicYear).trim(),
    })
  }

  const handleAssignCoordinator = (event) => {
    event.preventDefault()
    if (!coordinatorFacultyId) {
      toast.error('Please select a faculty member')
      return
    }

    assignCoordinatorMutation.mutate({ facultyId: coordinatorFacultyId })
  }

  const handleAssignAttendanceCoordinator = (event) => {
    event.preventDefault()
    if (!attendanceCoordinatorFacultyId) {
      toast.error('Please select a faculty member')
      return
    }

    assignAttendanceCoordinatorMutation.mutate({ facultyId: attendanceCoordinatorFacultyId })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Class Teacher Assignment</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Assign a faculty member to a class and section in {departmentLabel}.
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {sortedAssignments.length} active assignment{sortedAssignments.length === 1 ? '' : 's'}
              </div>
            </div>

            <form className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5" onSubmit={handleAssignClassTeacher}>
              <select
                value={assignForm.facultyId}
                onChange={(event) => setAssignForm((current) => ({ ...current, facultyId: event.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select faculty</option>
                {facultyRows.map((faculty) => (
                  <option key={faculty._id} value={faculty._id}>{faculty.name || '-'}</option>
                ))}
              </select>

              <select
                value={assignForm.semester}
                onChange={(event) => setAssignForm((current) => ({ ...current, semester: event.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select semester</option>
                {SEMESTERS.map((semester) => (
                  <option key={semester} value={semester}>
                    Semester {semester}
                  </option>
                ))}
              </select>

              <select
                value={assignForm.section}
                onChange={(event) => setAssignForm((current) => ({ ...current, section: event.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select section</option>
                {SECTIONS.map((section) => (
                  <option key={section} value={section}>
                    Section {section}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={assignForm.academicYear}
                onChange={(event) => setAssignForm((current) => ({ ...current, academicYear: event.target.value }))}
                placeholder="Academic year"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />

              <button
                type="submit"
                disabled={assignMutation.isPending}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {assignMutation.isPending ? 'Assigning...' : 'Assign Class Teacher'}
              </button>
            </form>

            <p className="mt-3 text-xs text-slate-500">Each class can have only one official class teacher assignment.</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">Assign Time Table Coordinator</p>
              <form className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4" onSubmit={handleAssignCoordinator}>
                <select
                  value={coordinatorFacultyId}
                  onChange={(event) => setCoordinatorFacultyId(event.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-3"
                >
                  <option value="">Select faculty</option>
                  {facultyRows.map((faculty) => (
                    <option key={faculty._id} value={faculty._id}>
                      {faculty.name || '-'}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={assignCoordinatorMutation.isPending}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {assignCoordinatorMutation.isPending ? 'Assigning...' : 'Assign Coordinator'}
                </button>
              </form>
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">Assign Attendance Coordinator</p>
              <form className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4" onSubmit={handleAssignAttendanceCoordinator}>
                <select
                  value={attendanceCoordinatorFacultyId}
                  onChange={(event) => setAttendanceCoordinatorFacultyId(event.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-3"
                >
                  <option value="">Select faculty</option>
                  {facultyRows.map((faculty) => (
                    <option key={faculty._id} value={faculty._id}>
                      {faculty.name || '-'}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={assignAttendanceCoordinatorMutation.isPending}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {assignAttendanceCoordinatorMutation.isPending ? 'Assigning...' : 'Assign Coordinator'}
                </button>
              </form>
            </div>

            <h1 className="text-xl font-bold text-slate-900">Faculty Management</h1>
            <p className="mt-1 text-sm text-slate-600">Create faculty accounts inside your department and review assigned staff.</p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">Create Faculty Account</p>

              <form className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3" onSubmit={handleSubmit}>
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
                </select>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {createMutation.isPending ? 'Saving Faculty...' : 'Create Faculty'}
                </button>
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
                    <th className="py-2">Designation</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Role</th>
                    <th className="py-2">Class Teacher</th>
                    <th className="py-2">Subjects</th>
                    <th className="py-2">Classes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row._id} className="border-b border-slate-100">
                      <td className="py-2 font-semibold text-slate-900">{row.name || '-'}</td>
                      <td className="py-2 text-slate-700">{row.email || '-'}</td>
                      <td className="py-2 text-slate-700">{row.designation || '-'}</td>
                      <td className="py-2 text-slate-700">{row.isActive === false ? 'Inactive' : 'Active'}</td>
                      <td className="py-2 text-slate-700">
                        {row.isTimeTableCoordinator ? 'Time Table Coordinator' : String(row.userRole || 'faculty').replaceAll('_', ' ')}
                      </td>
                      <td className="py-2 text-slate-700">
                        {Array.isArray(row.classesAssigned) && row.classesAssigned.length > 0 ? (
                          <div className="space-y-1">
                            {row.classesAssigned.map((assignment) => (
                              <div key={`${assignment.academicYear}-${assignment.semester}-${assignment.section}`} className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                                Sem {assignment.semester} / Sec {assignment.section} • {assignment.academicYear}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">Not assigned</span>
                        )}
                      </td>
                      <td className="py-2 text-slate-700">{Array.isArray(row.subjectsAssigned) ? row.subjectsAssigned.length : 0}</td>
                      <td className="py-2 text-slate-700">{Array.isArray(row.classesAssigned) ? row.classesAssigned.length : 0}</td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-500">
                        No faculty found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Current Class Teacher Assignments</h2>
            <p className="mt-1 text-sm text-slate-600">These are the class and section responsibilities already mapped for your department.</p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="py-2">Faculty</th>
                    <th className="py-2">Class</th>
                    <th className="py-2">Academic Year</th>
                    <th className="py-2">Designation</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAssignments.length > 0 ? (
                    sortedAssignments.flatMap((faculty) =>
                      (faculty.classesAssigned || []).map((assignment) => (
                        <tr key={`${faculty._id}-${assignment.academicYear}-${assignment.semester}-${assignment.section}`} className="border-b border-slate-100">
                          <td className="py-2 font-medium text-slate-900">{faculty.name || '-'}</td>
                          <td className="py-2 text-slate-700">Sem {assignment.semester} / Sec {assignment.section}</td>
                          <td className="py-2 text-slate-700">{assignment.academicYear || '-'}</td>
                          <td className="py-2 text-slate-700">{faculty.designation || '-'}</td>
                        </tr>
                      ))
                    )
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-500">
                        No class teachers assigned yet.
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
