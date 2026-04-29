import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import { authApi } from '@/api/authApi'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/context/AuthContext'

const DASHBOARD_BY_ROLE = {
  student: '/student/dashboard',
  faculty: '/faculty/dashboard',
  class_teacher: '/class-teacher/dashboard',
  hod: '/hod/dashboard',
  attendance_coordinator: '/attendance-coordinator/dashboard',
  admin: '/admin/dashboard',
  principal: '/admin/dashboard',
}

export default function ChangePassword() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const [errors, setErrors] = useState({})

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const changePasswordMutation = useMutation({
    mutationFn: (data) => authApi.changePassword(data),
    onSuccess: async () => {
      toast.success('Password changed successfully. Please log in again.')
      await logout()
      navigate('/login', { replace: true })
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to change password')
    },
  })

  const validateForm = () => {
    const newErrors = {}

    if (!form.currentPassword.trim()) {
      newErrors.currentPassword = 'Current password is required'
    }

    if (!form.newPassword.trim()) {
      newErrors.newPassword = 'New password is required'
    } else {
      // Check minimum length (8 characters)
      if (form.newPassword.length < 8) {
        newErrors.newPassword = 'Password must be at least 8 characters'
      }
      // Check for uppercase letter
      else if (!/[A-Z]/.test(form.newPassword)) {
        newErrors.newPassword = 'Password must contain at least 1 uppercase letter'
      }
      // Check for number
      else if (!/[0-9]/.test(form.newPassword)) {
        newErrors.newPassword = 'Password must contain at least 1 number'
      }
      // Check if different from current
      else if (form.newPassword === form.currentPassword) {
        newErrors.newPassword = 'New password must be different from current password'
      }
    }

    if (!form.confirmPassword.trim()) {
      newErrors.confirmPassword = 'Please confirm your password'
    } else if (form.newPassword !== form.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    if (!validateForm()) {
      toast.error('Please fix the errors below')
      return
    }

    changePasswordMutation.mutate({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    })
  }

  const dashboardPath = DASHBOARD_BY_ROLE[user?.role] || '/login'

  const handleInputChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }))
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-md px-4 py-8 sm:px-6 lg:px-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900">Change Password</h1>
              <p className="mt-2 text-sm text-slate-600">Update your account password to keep your account secure</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Current Password */}
              <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-700">
                  Current Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative mt-1">
                  <input
                    id="currentPassword"
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={form.currentPassword}
                    onChange={(e) => handleInputChange('currentPassword', e.target.value)}
                    placeholder="Enter your current password"
                    className={`w-full rounded-lg border px-4 py-2 pr-10 text-sm ${
                      errors.currentPassword
                        ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                        : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'
                    } focus:outline-none focus:ring-2`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  >
                    {showCurrentPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>
                {errors.currentPassword && <p className="mt-1 text-sm text-rose-500">{errors.currentPassword}</p>}
              </div>

              {/* New Password */}
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700">
                  New Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative mt-1">
                  <input
                    id="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    value={form.newPassword}
                    onChange={(e) => handleInputChange('newPassword', e.target.value)}
                    placeholder="Enter your new password"
                    className={`w-full rounded-lg border px-4 py-2 pr-10 text-sm ${
                      errors.newPassword
                        ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                        : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'
                    } focus:outline-none focus:ring-2`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  >
                    {showNewPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>
                {errors.newPassword && <p className="mt-1 text-sm text-rose-500">{errors.newPassword}</p>}
                <p className="mt-1 text-xs text-slate-500">
                  Requirements: Minimum 8 characters, 1 uppercase letter, 1 number (e.g., Password123)
                </p>
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
                  Confirm Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative mt-1">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    placeholder="Re-enter your new password"
                    className={`w-full rounded-lg border px-4 py-2 pr-10 text-sm ${
                      errors.confirmPassword
                        ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                        : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'
                    } focus:outline-none focus:ring-2`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  >
                    {showConfirmPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="mt-1 text-sm text-rose-500">{errors.confirmPassword}</p>}
              </div>

              {/* Info Box */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <p className="font-semibold">Password Requirements:</p>
                <ul className="mt-2 list-inside space-y-1 text-xs">
                  <li>✓ Minimum 8 characters</li>
                  <li>✓ At least 1 uppercase letter (A-Z)</li>
                  <li>✓ At least 1 number (0-9)</li>
                  <li>✓ Examples: Password123, MySecure@Pass1, Test@Pass99</li>
                </ul>
                <p className="mt-3 border-t border-blue-200 pt-2 font-semibold">Security Tips:</p>
                <ul className="mt-2 list-inside space-y-1 text-xs">
                  <li>• Don't share your password with anyone</li>
                  <li>• Use unique passwords for different accounts</li>
                  <li>• You'll need to log in again after changing your password</li>
                </ul>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => navigate(dashboardPath)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changePasswordMutation.isPending}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {changePasswordMutation.isPending ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  )
}
