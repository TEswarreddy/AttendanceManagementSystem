import { useEffect, useMemo, useState } from 'react'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import PageHeader from '@/components/shared/PageHeader'
import { BellIcon } from '@heroicons/react/24/outline'
import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import { notificationsApi } from '@/api/notificationsApi'

const toList = (value) => (Array.isArray(value) ? value : [])

const formatDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

export default function NotificationsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [filterType, setFilterType] = useState('all')

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const notificationsQuery = useQuery({
    queryKey: ['notifications-page', filterType],
    queryFn: () => notificationsApi.getNotifications({ type: filterType, limit: 100 }),
    refetchInterval: 30000,
  })

  const markMutation = useMutation({
    mutationFn: (id) => notificationsApi.markAsRead(id),
    onSuccess: () => notificationsQuery.refetch(),
  })

  const notifications = useMemo(() => {
    const payload = notificationsQuery.data?.data || notificationsQuery.data || {}
    return toList(payload.data || payload.items || payload)
  }, [notificationsQuery.data])

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-5xl px-4 pb-10 sm:px-6 lg:px-8">
          <PageHeader title="Notifications" subtitle="Notifications across notices and alerts." />

          <div className="mb-4 inline-flex rounded-lg border border-slate-300 p-1 text-sm">
            {['all', 'notice', 'alert'].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilterType(item)}
                className={`rounded-md px-3 py-1.5 ${filterType === item ? 'bg-slate-900 text-white' : 'text-slate-700'}`}
              >
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-slate-500">
                <BellIcon className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-3">No notifications found.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((notification) => (
                  <article
                    key={notification.id}
                    className={`rounded-xl border px-4 py-3 ${notification.unread ? 'border-primary-300 bg-primary-50' : 'border-slate-200 bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{notification.title}</p>
                        <p className="mt-1 text-sm text-slate-700">{notification.message}</p>
                        <p className="mt-2 text-xs text-slate-500">{formatDate(notification.createdAt)}</p>
                      </div>
                      {notification.unread && notification.type === 'notice' ? (
                        <button
                          type="button"
                          onClick={() => markMutation.mutate(notification.id)}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                          disabled={markMutation.isPending}
                        >
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
