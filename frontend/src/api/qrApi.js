import { apiGet, apiPost } from './axiosInstance'

export const qrApi = {
  generate: (data) => apiPost('/qr/generate', data),
  scan: (data) => apiPost('/qr/scan', data),
  status: (sessionId) => apiGet(`/qr/status/${sessionId}`),
  close: (sessionId) => apiPost(`/qr/close/${sessionId}`),
}
