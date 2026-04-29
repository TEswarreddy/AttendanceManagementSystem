import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Bars3Icon,
  BellIcon,
  ChevronDownIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  KeyIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { APP_NAME } from '@/utils/constants'
import { useAuth } from '@/context/AuthContext'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import { notificationsApi } from '@/api/notificationsApi'

const toList = (value) => (Array.isArray(value) ? value : [])
const formatSegment = (segment) => (segment ? segment.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Dashboard')

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const profileMenuRef = useRef(null)
  const notificationMenuRef = useRef(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)

  const currentPage = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean)
    return formatSegment(segments.at(-1))
  }, [location.pathname])

  useEffect(() => {
    setProfileOpen(false)
    setNotificationOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileOpen(false)
      }
      if (!notificationMenuRef.current?.contains(event.target)) {
        setNotificationOpen(false)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setProfileOpen(false)
        setNotificationOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const roleLabel = user?.role ? user.role.replace(/_/g, ' ').toUpperCase() : 'GUEST'

  const notificationsQuery = useQuery({
    queryKey: ['navbar-notifications', user?.id],
    queryFn: () => notificationsApi.getNotifications({ limit: 10 }),
    enabled: Boolean(user?.id),
    refetchInterval: 30000,
  })

  const unreadQuery = useQuery({
    queryKey: ['navbar-notifications-unread', user?.id],
    queryFn: () => notificationsApi.getUnreadCount(),
    enabled: Boolean(user?.id),
    refetchInterval: 30000,
  })

  const markReadMutation = useMutation({
    mutationFn: (notificationId) => notificationsApi.markAsRead(notificationId),
    onSuccess: () => {
      notificationsQuery.refetch()
      unreadQuery.refetch()
    },
  })

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      notificationsQuery.refetch()
      unreadQuery.refetch()
    },
  })

  const notificationsPayload = notificationsQuery.data?.data || notificationsQuery.data || {}
  const notifications = toList(notificationsPayload.data || notificationsPayload.items || notificationsPayload)
  const unreadNotificationsList = notifications.filter((notification) => Boolean(notification.unread))

  const unreadPayload = unreadQuery.data?.data || unreadQuery.data || {}
  const unreadNotifications = Number(unreadPayload.unreadCount || unreadPayload.data?.unreadCount || 0)

  const formatDate = (value) => {
    if (!value) return '-'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="fixed top-0 z-[80] w-full border-b border-white/60 bg-white/85 shadow-[0_14px_40px_rgba(15,23,42,0.09)] backdrop-blur-lg">
      <div className="mx-auto flex h-[4.5rem] w-full max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            className="inline-flex rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden"
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
            aria-label="Toggle menu"
          >
            <Bars3Icon className="h-6 w-6" />
          </button>

          <Link to="/" className="flex min-w-0 items-center gap-3">
            <img src="/college-logo.png" alt="College logo" className="h-9 w-9 rounded-lg object-cover shadow" />
            <span className="truncate text-sm font-semibold text-slate-900 sm:text-base">{APP_NAME || 'Attendance Management System'}</span>
          </Link>
        </div>

        <div className="hidden min-w-0 flex-1 items-center gap-3 px-5 lg:flex">
          <p className="truncate text-sm text-slate-500">Home / {currentPage}</p>
          <div className="ml-auto hidden items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-2 shadow-sm xl:flex">
            <MagnifyingGlassIcon className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search"
              className="w-44 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              aria-label="Search"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative" ref={notificationMenuRef}>
            <button
              className="relative rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
              aria-label="Notifications"
              onClick={() => {
                setNotificationOpen((prev) => !prev)
                if (profileOpen) setProfileOpen(false)
                notificationsQuery.refetch()
                unreadQuery.refetch()
              }}
            >
              <BellIcon className="h-5 w-5" />
              {unreadNotifications > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </span>
              ) : null}
            </button>

            {notificationOpen ? (
              <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                <div className="mb-2 flex items-center justify-between px-2">
                  <p className="text-sm font-semibold text-slate-900">Notifications</p>
                  <button
                    type="button"
                    onClick={() => markAllMutation.mutate()}
                    className="text-xs font-semibold text-primary-700"
                    disabled={markAllMutation.isPending || unreadNotificationsList.length === 0}
                  >
                    {markAllMutation.isPending ? 'Marking...' : 'Mark all read'}
                  </button>
                </div>

                <div className="max-h-80 space-y-1 overflow-y-auto">
                  {unreadNotificationsList.length === 0 ? (
                    <p className="rounded-lg px-3 py-3 text-sm text-slate-500">No new notifications</p>
                  ) : (
                    unreadNotificationsList.map((notification) => {
                      const notificationId = String(notification.id || notification._id || '')
                      const canMarkRead = notificationId && !notificationId.startsWith('alert-')

                      return (
                        <article key={notificationId} className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm">
                          <p className="font-semibold text-slate-900">{notification.title}</p>
                          <p className="mt-1 text-xs text-slate-700">{notification.message}</p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-500">{formatDate(notification.createdAt)}</span>
                            {canMarkRead ? (
                              <button
                                type="button"
                                onClick={() => markReadMutation.mutate(notificationId)}
                                className="text-[11px] font-semibold text-primary-700"
                                disabled={markReadMutation.isPending}
                              >
                                Mark read
                              </button>
                            ) : null}
                          </div>
                        </article>
                      )
                    })
                  )}
                </div>

                <div className="mt-2 border-t border-slate-200 pt-2">
                  <Link
                    to="/notifications"
                    className="block rounded-lg px-3 py-2 text-center text-sm font-semibold text-primary-700 hover:bg-primary-50"
                    onClick={() => setNotificationOpen(false)}
                  >
                    View all notifications
                  </Link>
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => {
                setProfileOpen((prev) => !prev)
                if (notificationOpen) setNotificationOpen(false)
              }}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-slate-100"
            >
              <UserCircleIcon className="h-7 w-7 text-slate-600" />
              <div className="hidden text-left sm:block">
                <p className="max-w-32 truncate text-sm font-medium text-slate-900">{user?.name || 'User'}</p>
                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">{roleLabel}</span>
              </div>
              <ChevronDownIcon className="h-4 w-4 text-slate-500" />
            </button>

            {profileOpen ? (
              <div className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                <Link
                  to="/profile"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  onClick={() => setProfileOpen(false)}
                >
                  <UserCircleIcon className="h-4 w-4" />
                  Profile
                </Link>
                <Link
                  to="/change-password"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  onClick={() => setProfileOpen(false)}
                >
                  <KeyIcon className="h-4 w-4" />
                  Change Password
                </Link>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  onClick={handleLogout}
                >
                  <ArrowRightOnRectangleIcon className="h-4 w-4" />
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}
