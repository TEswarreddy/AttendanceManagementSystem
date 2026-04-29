import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import { CheckIcon, XMarkIcon, ClockIcon } from '@heroicons/react/24/outline'
import Navbar from '@/components/shared/Navbar'
import Sidebar from '@/components/shared/Sidebar'
import PageHeader from '@/components/shared/PageHeader'
import { hodApi } from '@/api/hodApi'
import { SkeletonTable, Spinner } from '@/components/shared/Spinner'
import StatusBadge from '@/components/shared/StatusBadge'

export default function HODEditApprovals() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [action, setAction] = useState(null)
  const [remark, setRemark] = useState('')
  const queryClient = useQueryClient()

  useEffect(() => {
    const onToggleSidebar = () => setSidebarOpen((prev) => !prev)
    window.addEventListener('toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('toggle-sidebar', onToggleSidebar)
  }, [])

  const approvalsQuery = useQuery({
    queryKey: ['hod-edit-approvals'],
    queryFn: () => hodApi.getPendingEditApprovals({ status: 'pending' }),
    refetchInterval: 30000,
  })

  const reviewMutation = useMutation({
    mutationFn: (data) => hodApi.reviewEditApproval(selectedRequest?._id, data),
    onSuccess: () => {
      toast.success(`Request ${action === 'approve' ? 'approved' : 'rejected'} successfully`)
      queryClient.invalidateQueries(['hod-edit-approvals'])
      setSelectedRequest(null)
      setAction(null)
      setRemark('')
    },
    onError: () => {
      toast.error('Unable to process this request right now. Please try again.')
    },
  })

  const handleReview = async () => {
    if (!selectedRequest || !action) return

    reviewMutation.mutate({
      status: action === 'approve' ? 'approved' : 'rejected',
      remark,
    })
  }

  const requests = approvalsQuery.data?.data?.data || approvalsQuery.data?.data || []

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'pending':
        return 'bg-amber-100 text-amber-700'
      case 'approved':
        return 'bg-emerald-100 text-emerald-700'
      case 'rejected':
        return 'bg-rose-100 text-rose-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <Navbar />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-20 lg:pl-72">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <PageHeader
            title="Attendance Edit Approvals"
            subtitle="Review and approve attendance edit requests from faculty members"
          />

          {approvalsQuery.isLoading ? (
            <SkeletonTable />
          ) : approvalsQuery.isError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800">
              Failed to load approval requests. Please try again.
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-slate-300 p-8 text-center">
              <ClockIcon className="mx-auto h-12 w-12 text-slate-400" />
              <p className="mt-2 text-slate-600">No pending edit requests</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Faculty</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Subject</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Reason</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-slate-900">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {requests.map((req) => (
                    <tr key={req._id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm text-slate-900">{req.facultyName || 'N/A'}</td>
                      <td className="px-6 py-4 text-sm text-slate-700">{req.subjectName || 'N/A'}</td>
                      <td className="px-6 py-4 text-sm text-slate-700">
                        {new Date(req.attendanceDate).toLocaleDateString('en-IN')}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{req.reason || '-'}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(req.status)}`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {req.status?.toLowerCase() === 'pending' && (
                          <button
                            onClick={() => {
                              setSelectedRequest(req)
                              setAction(null)
                            }}
                            className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
                          >
                            Review
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Review Modal */}
          {selectedRequest && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
                <div className="border-b border-slate-200 px-6 py-4">
                  <h3 className="text-lg font-semibold text-slate-900">Review Edit Request</h3>
                </div>

                <div className="space-y-4 px-6 py-4">
                  <div>
                    <p className="text-sm text-slate-600">Faculty: {selectedRequest.facultyName}</p>
                    <p className="text-sm text-slate-600">Subject: {selectedRequest.subjectName}</p>
                    <p className="text-sm text-slate-600">Date: {new Date(selectedRequest.attendanceDate).toLocaleDateString()}</p>
                    <p className="mt-2 text-sm text-slate-700">Reason: {selectedRequest.reason}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-900">Your Remark</label>
                    <textarea
                      value={remark}
                      onChange={(e) => setRemark(e.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      rows="3"
                      placeholder="Enter approval/rejection remark..."
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setAction('approve')
                        handleReview()
                      }}
                      disabled={reviewMutation.isPending}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      <CheckIcon className="h-4 w-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        setAction('reject')
                        handleReview()
                      }}
                      disabled={reviewMutation.isPending}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50"
                    >
                      <XMarkIcon className="h-4 w-4" />
                      Reject
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedRequest(null)
                      setAction(null)
                      setRemark('')
                    }}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
