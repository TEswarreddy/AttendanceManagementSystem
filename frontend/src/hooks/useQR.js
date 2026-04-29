import { useMutation, useQuery } from '@/lib/dataClientHooks.jsx'
import { qrApi } from '@/api/qrApi'

export function useGenerateQR() {
  return useMutation({
    mutationFn: (data) => qrApi.generate(data),
  })
}

export function useScanQR() {
  return useMutation({
    mutationFn: (data) => qrApi.scan(data),
  })
}

export function useQRStatus(sessionId) {
  return useQuery({
    queryKey: ['qrStatus', sessionId],
    queryFn: () => qrApi.status(sessionId),
    enabled: !!sessionId,
    staleTime: 15 * 1000,
    refetchInterval: 10000,
  })
}

export function useCloseQR() {
  return useMutation({
    mutationFn: (sessionId) => qrApi.close(sessionId),
  })
}
