import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import { PlusIcon, CheckCircleIcon, ClockIcon, XCircleIcon } from '@heroicons/react/24/outline'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import PageHeader from '@/components/shared/PageHeader'
import { apiGet, apiPost } from '@/api/axiosInstance'
import { SkeletonTable, Spinner } from '@/components/shared/Spinner'

const readPayload = (response) => {
  const top = response?.data || response || {}
  if (top && typeof top === 'object' && top.data !== undefined) {
    return top.data
  }
  return top
}

export default function StudentLeaveRequests() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ fromDate: '', toDate: '', reason: '' })
  const queryClient = useQueryClient()

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const leavesQuery = useQuery({
    queryKey: ['student-leaves'],
    queryFn: () => apiGet('/student/leaves', { limit: 50 }),
    refetchInterval: 30000,
  })

  const createLeaveMutation = useMutation({
    mutationFn: (data) => apiPost('/leaves', data),
    onSuccess: () => {
      toast.success('Leave request submitted successfully')
      setFormData({ fromDate: '', toDate: '', reason: '' })
      setShowForm(false)
      queryClient.invalidateQueries(['student-leaves'])
    },
    onError: () => {
      toast.error('Unable to submit your leave request right now. Please try again.')
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.fromDate || !formData.toDate || !formData.reason) {
      toast.error('Please fill all fields')
      return
    }
    createLeaveMutation.mutate(formData)
  }

  const leavesPayload = readPayload(leavesQuery.data)
  const leaves = Array.isArray(leavesPayload) ? leavesPayload : []

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return 'bg-emerald-100 text-emerald-700'
      case 'rejected':
        return 'bg-rose-100 text-rose-700'
      case 'pending':
        return 'bg-amber-100 text-amber-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return <CheckCircleIcon className="h-4 w-4" />
      case 'rejected':
        return <XCircleIcon className="h-4 w-4" />
      case 'pending':
        return <ClockIcon className="h-4 w-4" />
      default:
        return null
    }
  }

  const stats = {
    pending: leaves.filter((l) => l.status?.toLowerCase() === 'pending').length,
    approved: leaves.filter((l) => l.status?.toLowerCase() === 'approved').length,
    rejected: leaves.filter((l) => l.status?.toLowerCase() === 'rejected').length,
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <PageHeader
            title="Leave Requests"
            subtitle="View and manage your leave applications"
          />

          {/* Stats Cards */}
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Pending', value: stats.pending, color: 'bg-amber-50 text-amber-700' },
              { label: 'Approved', value: stats.approved, color: 'bg-emerald-50 text-emerald-700' },
              { label: 'Rejected', value: stats.rejected, color: 'bg-rose-50 text-rose-700' },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-lg border border-slate-200 ${stat.color} p-4`}>
                <p className="text-sm font-medium opacity-75">{stat.label}</p>
                <p className="mt-2 text-3xl font-bold">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* New Request Button */}
          <div className="mb-6">
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <PlusIcon className="h-4 w-4" />
              New Leave Request
            </button>
          </div>

          {/* Form */}
          {showForm && (
            <div className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Request Leave</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-900">From Date</label>
                    <input
                      type="date"
                      value={formData.fromDate}
                      onChange={(e) => setFormData({ ...formData, fromDate: e.target.value })}
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900">To Date</label>
                    <input
                      type="date"
                      value={formData.toDate}
                      onChange={(e) => setFormData({ ...formData, toDate: e.target.value })}
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-900">Reason</label>
                  <textarea
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    rows="3"
                    placeholder="Enter reason for leave..."
                    required
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={createLeaveMutation.isPending}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {createLeaveMutation.isPending ? 'Submitting...' : 'Submit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false)
                      setFormData({ fromDate: '', toDate: '', reason: '' })
                    }}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Leave History */}
          {leavesQuery.isLoading ? (
            <SkeletonTable />
          ) : leavesQuery.isError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800">
              Failed to load leave requests. Please try again.
            </div>
          ) : leaves.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-slate-300 p-12 text-center">
              <ClockIcon className="mx-auto h-16 w-16 text-slate-400" />
              <p className="mt-4 text-lg font-medium text-slate-900">No Leave Requests</p>
              <p className="mt-1 text-slate-600">You haven't submitted any leave requests yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">From Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">To Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Reason</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {leaves.map((leave) => (
                    <tr key={leave._id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm text-slate-900">
                        {new Date(leave.fromDate).toLocaleDateString('en-IN')}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900">
                        {new Date(leave.toDate).toLocaleDateString('en-IN')}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">{leave.reason}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(leave.status)}`}>
                          {getStatusIcon(leave.status)}
                          {leave.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
