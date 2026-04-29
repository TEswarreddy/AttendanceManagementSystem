import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import { reportsApi } from '@/api/reportsApi'
import { QUERY_KEYS } from '@/utils/constants'

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function useDownloadStudentPDF() {
  return useMutation({
    mutationFn: ({ studentId, params }) => reportsApi.downloadStudentPDF(studentId, params),
    onSuccess: (blob, { filename }) => {
      downloadBlob(blob, filename || 'attendance.pdf')
      toast.success('Report downloaded')
    },
    onError: () => toast.error('Unable to download the report right now. Please try again.'),
  })
}

export function useDownloadStudentExcel() {
  return useMutation({
    mutationFn: ({ studentId, params }) => reportsApi.downloadStudentExcel(studentId, params),
    onSuccess: (blob, { filename }) => {
      downloadBlob(blob, filename || 'attendance.xlsx')
      toast.success('Report downloaded')
    },
    onError: () => toast.error('Unable to download the report right now. Please try again.'),
  })
}

export function useDownloadClassPDF() {
  return useMutation({
    mutationFn: ({ params }) => reportsApi.downloadClassPDF(params),
    onSuccess: (blob, { filename }) => {
      downloadBlob(blob, filename || 'class-attendance.pdf')
      toast.success('Report downloaded')
    },
    onError: () => toast.error('Unable to download the report right now. Please try again.'),
  })
}

export function useDownloadClassExcel() {
  return useMutation({
    mutationFn: ({ params }) => reportsApi.downloadClassExcel(params),
    onSuccess: (blob, { filename }) => {
      downloadBlob(blob, filename || 'class-attendance.xlsx')
      toast.success('Report downloaded')
    },
    onError: () => toast.error('Unable to download the report right now. Please try again.'),
  })
}

export function useDownloadDeptPDF() {
  return useMutation({
    mutationFn: ({ params }) => reportsApi.downloadDeptPDF(params),
    onSuccess: (blob, { filename }) => {
      downloadBlob(blob, filename || 'department-attendance.pdf')
      toast.success('Report downloaded')
    },
    onError: () => toast.error('Unable to download the report right now. Please try again.'),
  })
}

export function useDownloadBulkExcel() {
  return useMutation({
    mutationFn: ({ params }) => reportsApi.downloadBulkExcel(params),
    onSuccess: (blob, { filename }) => {
      downloadBlob(blob, filename || 'attendance-report.xlsx')
      toast.success('Report downloaded')
    },
    onError: () => toast.error('Unable to download the report right now. Please try again.'),
  })
}

export function useTriggerAlerts() {
  return useMutation({
    mutationFn: (data) => reportsApi.triggerAlerts(data),
    onSuccess: () => {
      toast.success('Alerts triggered successfully')
    },
    onError: () => toast.error('Unable to send alerts right now. Please try again.'),
  })
}

export function useDashboardStats(params) {
  return useQuery({
    queryKey: [QUERY_KEYS.DASHBOARD_STATS, params],
    queryFn: () => reportsApi.getDashboardStats(params),
    staleTime: 10 * 60 * 1000,
    select: (data) => data.data,
  })
}

export function useStudentAnalytics(studentId) {
  return useQuery({
    queryKey: ['studentAnalytics', studentId],
    queryFn: () => reportsApi.getStudentAnalytics(studentId),
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
    select: (data) => data.data,
  })
}
