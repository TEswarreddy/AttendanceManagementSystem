import { apiDelete, apiGet, apiPost, apiPut } from './axiosInstance'

export const authApi = {
  login: (data) => apiPost('/auth/login', data),
  logout: () => apiPost('/auth/logout'),
  getMe: () => apiGet('/auth/me'),
  getProfile: () => apiGet('/auth/profile'),
  createProfile: (data) => apiPost('/auth/profile', data),
  updateProfile: (data) => apiPut('/auth/profile', data),
  deleteProfile: () => apiDelete('/auth/profile'),
  refreshToken: (data) => apiPost('/auth/refresh-token', data),
  forgotPassword: (data) => apiPost('/auth/forgot-password', data),
  resetPassword: (data) => apiPost('/auth/reset-password', data),
  changePassword: (data) => apiPut('/auth/change-password', data),
}
