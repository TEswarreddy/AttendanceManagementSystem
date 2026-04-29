import { useMutation, useQuery, useQueryClient } from '@/lib/dataClientHooks.jsx'
import toast from 'react-hot-toast'
import { attendanceApi } from '@/api/attendanceApi'
import { QUERY_KEYS } from '@/utils/constants'

const isMongoId = (value) => /^[a-f\d]{24}$/i.test(String(value || ''))

export function useStudentAttendance(studentId, params) {
  return useQuery({
    queryKey: [QUERY_KEYS.STUDENT_ATTENDANCE, studentId, params],
    queryFn: () => attendanceApi.getStudent(studentId, params),
    enabled: isMongoId(studentId),
    staleTime: 5 * 60 * 1000,
    select: (data) => data.data,
  })
}

export function useClassAttendance(params) {
  return useQuery({
    queryKey: [QUERY_KEYS.CLASS_ATTENDANCE, params],
    queryFn: () => attendanceApi.getClass(params),
    enabled: isMongoId(params?.subjectId) && !!params?.date && !!params?.session,
    select: (data) => data.data,
  })
}

export function useLowAttendance(params) {
  const validSubjectIds = Array.isArray(params?.subjectIds)
    ? params.subjectIds.filter((subjectId) => isMongoId(subjectId))
    : null

  return useQuery({
    queryKey: [QUERY_KEYS.LOW_ATTENDANCE, params],
    enabled: !Array.isArray(params?.subjectIds) || validSubjectIds.length > 0,
    queryFn: async () => {
      if (Array.isArray(params?.subjectIds) && validSubjectIds.length > 0) {
        const results = await Promise.allSettled(
          validSubjectIds.map((subjectId) =>
            attendanceApi.getLowAttendance({ ...params, subjectId, subjectIds: undefined })
          )
        )

        const mergedItems = results.flatMap((result) => {
          if (result.status !== 'fulfilled') {
            return []
          }

          const response = result.value
          const payload = response?.data || response || {}
          return payload.items || payload.students || payload.leaves || []
        })

        return { data: { items: mergedItems } }
      }

      return attendanceApi.getLowAttendance(params)
    },
    staleTime: 10 * 60 * 1000,
    select: (data) => data.data,
  })
}

export function useMarkAttendance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data) => attendanceApi.mark(data),
    onSuccess: () => {
      toast.success('Attendance marked successfully')
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CLASS_ATTENDANCE] })
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.LOW_ATTENDANCE] })
    },
    onError: () => toast.error('Unable to complete this action right now. Please try again.'),
  })
}

export function useEditAttendance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }) => attendanceApi.editOne(id, data),
    onSuccess: () => {
      toast.success('Attendance updated')
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.STUDENT_ATTENDANCE] })
    },
    onError: () => toast.error('Unable to complete this action right now. Please try again.'),
  })
}
