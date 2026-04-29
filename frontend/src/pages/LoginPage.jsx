import { Fragment, useEffect, useMemo, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import PublicNavbar from '@/components/shared/PublicNavbar'
import {
  EyeIcon,
  EyeSlashIcon,
  BoltIcon,
  BellAlertIcon,
  ArrowDownTrayIcon,
  AcademicCapIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { authApi } from '@/api/authApi'
import { FullPageSpinner } from '@/components/shared/Spinner'
import { APP_NAME, COLLEGE_NAME } from '@/utils/constants'
import { useAuth } from '@/context/AuthContext'

const ROLE_TABS = [
  { key: 'student', label: 'Student', emailHint: 'student@college.edu' },
  { key: 'faculty', label: 'Faculty', emailHint: 'faculty@college.edu' },
  { key: 'admin', label: 'Admin', emailHint: 'admin@college.edu' },
]

const FEATURES = [
  { icon: BoltIcon, text: 'Real-time tracking' },
  { icon: BellAlertIcon, text: 'Instant alerts' },
  { icon: ArrowDownTrayIcon, text: 'Downloadable reports' },
]

const getDashboardPathByRole = (role) => {
  const normalizedRole = String(role || '').toLowerCase()

  if (normalizedRole === 'student') {
    return '/student/dashboard'
  }

  if (normalizedRole === 'faculty') {
    return '/faculty/dashboard'
  }

  if (normalizedRole === 'class_teacher') {
    return '/class-teacher/dashboard'
  }

  if (normalizedRole === 'hod') {
    return '/hod/dashboard'
  }

  if (normalizedRole === 'time_table_coordinator') {
    return '/ttc/dashboard'
  }

  if (normalizedRole === 'attendance_coordinator') {
    return '/attendance-coordinator/dashboard'
  }

  if (normalizedRole === 'admin' || normalizedRole === 'principal') {
    return '/admin/dashboard'
  }

  return '/login'
}

export default function LoginPage() {
  const navigate = useNavigate()
  const auth = useAuth()
  const [activeRole, setActiveRole] = useState('student')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loginError, setLoginError] = useState('')

  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotStep, setForgotStep] = useState('email')
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState('')

  const currentRoleHint = useMemo(
    () => ROLE_TABS.find((tab) => tab.key === activeRole)?.emailHint || 'you@example.com',
    [activeRole]
  )

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const {
    register: registerForgot,
    handleSubmit: handleForgotSubmit,
    reset: resetForgot,
    formState: { errors: forgotErrors },
  } = useForm({
    defaultValues: {
      email: '',
      otp: '',
      newPassword: '',
    },
  })

  useEffect(() => {
    if (!auth.isLoading && auth.isAuthenticated) {
      navigate(getDashboardPathByRole(auth.user?.role), { replace: true })
    }
  }, [auth.isAuthenticated, auth.isLoading, auth.user?.role, navigate])

  const onSubmit = async (data) => {
    setSubmitting(true)
    setLoginError('')

    const result = await auth.login(data)

    if (!result.success) {
      setLoginError(result.message || 'Unable to sign in. Please try again.')
      setSubmitting(false)
      return
    }

    const role = result.user?.role || auth.user?.role
    navigate(getDashboardPathByRole(role), { replace: true })
    setSubmitting(false)
  }

  const openForgotPassword = () => {
    setForgotOpen(true)
    setForgotStep('email')
    setForgotError('')
  }

  const closeForgotPassword = () => {
    setForgotOpen(false)
    setForgotStep('email')
    setForgotLoading(false)
    setForgotError('')
    resetForgot()
  }

  const submitForgotEmail = async ({ email }) => {
    setForgotLoading(true)
    setForgotError('')

    try {
      await authApi.forgotPassword({ email })
      setForgotEmail(email)
      setForgotStep('reset')
    } catch (error) {
      setForgotError(error.message || 'Failed to start password reset process.')
    } finally {
      setForgotLoading(false)
    }
  }

  const submitResetPassword = async ({ otp, newPassword }) => {
    setForgotLoading(true)
    setForgotError('')

    try {
      await authApi.resetPassword({
        email: forgotEmail,
        otp,
        newPassword,
      })
      closeForgotPassword()
    } catch (error) {
      setForgotError(error.message || 'Failed to reset password.')
    } finally {
      setForgotLoading(false)
    }
  }

  if (auth.isLoading) {
    return <FullPageSpinner />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100">
      <PublicNavbar variant="transparent" forceGuestMenu />
      <main className="mx-auto grid min-h-[calc(100vh-4.5rem)] max-w-screen-2xl grid-cols-1 lg:grid-cols-2">
        <aside className="relative hidden overflow-hidden bg-gradient-to-br from-slate-900 via-[#12314E] to-[#1F4E79] p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-sky-200/10 blur-3xl" />
          <div className="space-y-6">
            <div className="inline-flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/20 bg-white/10">
                <AcademicCapIcon className="h-7 w-7" />
              </span>
              <div>
                <p className="text-sm uppercase tracking-wide text-sky-100/90">{COLLEGE_NAME || 'Your College Name'}</p>
                <h1 className="text-2xl font-bold">{APP_NAME || 'Attendance Management System'}</h1>
              </div>
            </div>

            <p className="max-w-md text-sky-100/90">
              Keep attendance accurate, transparent, and actionable for students, faculty, and administrators.
            </p>

            <ul className="space-y-3">
              {FEATURES.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.text} className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur">
                    <Icon className="h-5 w-5 text-cyan-200" />
                    <span>{item.text}</span>
                  </li>
                )
              })}
            </ul>
          </div>

          <p className="text-sm font-medium text-sky-100/90">Academic Year 2025-2026</p>
        </aside>

        <section className="relative flex items-center justify-center bg-transparent px-4 py-10 sm:px-8">
          <div className="pointer-events-none absolute left-8 top-8 h-32 w-32 rounded-full bg-[#1F4E79]/15 blur-2xl" />
          <div className="w-full max-w-md rounded-2xl border border-slate-200/70 bg-white/95 p-6 shadow-xl shadow-slate-300/40 backdrop-blur sm:p-8">
            <h2 className="text-3xl font-bold text-slate-900">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-600">Sign in to continue</p>

            <div className="mt-6 grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1.5">
              {ROLE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveRole(tab.key)}
                  className={`rounded-lg px-2 py-2 text-sm font-semibold transition ${
                    activeRole === tab.key
                      ? 'bg-white text-[#1F4E79] shadow-sm'
                      : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  placeholder={currentRoleHint}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#1F4E79] focus:ring-2 focus:ring-[#1F4E79]/20"
                  {...register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Enter a valid email address',
                    },
                  })}
                />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 pr-10 text-sm outline-none transition focus:border-[#1F4E79] focus:ring-2 focus:ring-[#1F4E79]/20"
                    {...register('password', {
                      required: 'Password is required',
                      minLength: {
                        value: 6,
                        message: 'Password must be at least 6 characters',
                      },
                    })}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-2 my-auto rounded p-1 text-slate-500 hover:bg-slate-100"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-sm font-medium text-[#1F4E79] hover:text-[#173b5d]"
                  onClick={openForgotPassword}
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1F4E79] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#173b5d] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                )}
                Sign In
              </button>

              {loginError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {loginError}
                </div>
              )}
            </form>
          </div>
        </section>
      </main>

      <Transition appear show={forgotOpen} as={Fragment}>
        <Dialog as="div" className="relative z-[70]" onClose={closeForgotPassword}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-slate-900/50" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                  <div className="mb-4 flex items-start justify-between">
                    <Dialog.Title className="text-lg font-semibold text-slate-900">
                      {forgotStep === 'email' ? 'Forgot Password' : 'Reset Password'}
                    </Dialog.Title>
                    <button
                      onClick={closeForgotPassword}
                      className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                      aria-label="Close modal"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>

                  {forgotStep === 'email' ? (
                    <form className="space-y-4" onSubmit={handleForgotSubmit(submitForgotEmail)}>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                        <input
                          type="email"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#1F4E79] focus:ring-2 focus:ring-[#1F4E79]/20"
                          placeholder="Enter your account email"
                          {...registerForgot('email', {
                            required: 'Email is required',
                            pattern: {
                              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                              message: 'Enter a valid email address',
                            },
                          })}
                        />
                        {forgotErrors.email && (
                          <p className="mt-1 text-xs text-red-600">{forgotErrors.email.message}</p>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={forgotLoading}
                        className="inline-flex w-full items-center justify-center rounded-lg bg-[#1F4E79] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#173b5d] disabled:opacity-70"
                      >
                        {forgotLoading ? 'Sending...' : 'Send OTP'}
                      </button>
                    </form>
                  ) : (
                    <form className="space-y-4" onSubmit={handleForgotSubmit(submitResetPassword)}>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">OTP</label>
                        <input
                          type="text"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#1F4E79] focus:ring-2 focus:ring-[#1F4E79]/20"
                          placeholder="Enter OTP"
                          {...registerForgot('otp', {
                            required: 'OTP is required',
                          })}
                        />
                        {forgotErrors.otp && <p className="mt-1 text-xs text-red-600">{forgotErrors.otp.message}</p>}
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">New Password</label>
                        <input
                          type="password"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#1F4E79] focus:ring-2 focus:ring-[#1F4E79]/20"
                          placeholder="Enter new password"
                          {...registerForgot('newPassword', {
                            required: 'New password is required',
                            minLength: {
                              value: 6,
                              message: 'Password must be at least 6 characters',
                            },
                          })}
                        />
                        {forgotErrors.newPassword && (
                          <p className="mt-1 text-xs text-red-600">{forgotErrors.newPassword.message}</p>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={forgotLoading}
                        className="inline-flex w-full items-center justify-center rounded-lg bg-[#1F4E79] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#173b5d] disabled:opacity-70"
                      >
                        {forgotLoading ? 'Resetting...' : 'Reset Password'}
                      </button>
                    </form>
                  )}

                  {forgotError && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {forgotError}
                    </div>
                  )}
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  )
}
