import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'

export default function AttendanceCoordinatorLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-7xl px-3 pb-8 sm:px-5">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
