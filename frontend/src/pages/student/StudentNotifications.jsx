import { useState, useEffect } from 'react'
import { useQuery } from '@/lib/dataClientHooks.jsx'
import { BellAlertIcon, BellIcon, SparklesIcon } from '@heroicons/react/24/outline'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import PageHeader from '@/components/shared/PageHeader'
import { apiGet } from '@/api/axiosInstance'
import { SkeletonTable } from '@/components/shared/Spinner'

const NOTIFICATION_TYPES = {
  absent: { icon: BellAlertIcon, color: 'text-rose-600', bg: 'bg-rose-50' },
  attendance: { icon: SparklesIcon, color: 'text-blue-600', bg: 'bg-blue-50' },
  notice: { icon: BellIcon, color: 'text-amber-600', bg: 'bg-amber-50' },
}

const readPayload = (response) => {
  const top = response?.data || response || {}
  if (top && typeof top === 'object' && top.data !== undefined) {
    return top.data
  }
  return top
}

export default function StudentNotifications() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [filterType, setFilterType] = useState('all')

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const notificationsQuery = useQuery({
    queryKey: ['student-notifications', filterType],
    queryFn: () => apiGet('/student/notifications', { type: filterType !== 'all' ? filterType : undefined, limit: 50 }),
    refetchInterval: 30000,
  })

  const notificationsPayload = readPayload(notificationsQuery.data)
  const notifications = Array.isArray(notificationsPayload) ? notificationsPayload : []

  const filteredNotifications = filterType === 'all' ? notifications : notifications.filter((n) => n.type === filterType)

  const getNotificationConfig = (type) => NOTIFICATION_TYPES[type] || NOTIFICATION_TYPES.notice

  const formatDateTime = (dateString) => {
    return new Intl.DateTimeFormat('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString))
  }

  const NotificationCard = ({ notification }) => {
    const config = getNotificationConfig(notification.type)
    const Icon = config.icon

    return (
      <div className={`rounded-lg border border-slate-200 p-4 shadow-sm transition hover:shadow-md ${config.bg}`}>
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <Icon className={`h-6 w-6 ${config.color}`} />
          </div>
          <div className="flex-grow min-w-0">
            <h3 className="font-semibold text-slate-900">{notification.title}</h3>
            <p className="mt-1 text-sm text-slate-700">{notification.message}</p>
            {notification.details && (
              <div className="mt-2 text-xs text-slate-600">
                <p>Subject: {notification.details.subjectName || 'N/A'}</p>
                {notification.details.percentage && <p>Attendance: {notification.details.percentage.toFixed(1)}%</p>}
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">{formatDateTime(notification.createdAt)}</p>
          </div>
          {notification.type === 'absent' && (
            <div className="flex-shrink-0">
              <span className="inline-block rounded-full bg-rose-200 px-2 py-1 text-xs font-medium text-rose-700">
                Action Required
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <PageHeader
            title="Notifications"
            subtitle="Stay updated with attendance alerts and important announcements"
          />

          {/* Filter Tabs */}
          <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200">
            {[
              { value: 'all', label: 'All Notifications' },
              { value: 'absent', label: 'Absence Alerts' },
              { value: 'attendance', label: 'Attendance Alerts' },
              { value: 'notice', label: 'Notices' },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setFilterType(tab.value)}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
                  filterType === tab.value
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Notifications List */}
          {notificationsQuery.isLoading ? (
            <SkeletonTable />
          ) : notificationsQuery.isError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800">
              Failed to load notifications. Please try again.
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-slate-300 p-12 text-center">
              <BellIcon className="mx-auto h-16 w-16 text-slate-400" />
              <p className="mt-4 text-lg font-medium text-slate-900">No Notifications</p>
              <p className="mt-1 text-slate-600">You'll see notifications about your attendance here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredNotifications.map((notification) => (
                <NotificationCard key={notification._id || notification.id} notification={notification} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
