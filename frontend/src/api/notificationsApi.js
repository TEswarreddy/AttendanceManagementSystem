import { apiGet, apiPut } from './axiosInstance'

export const notificationsApi = {
  getNotifications: (params) => apiGet('/notifications', params),
  getUnreadCount: () => apiGet('/notifications/unread-count'),
  markAsRead: (notificationId) => apiPut(`/notifications/${notificationId}/read`),
  markAllAsRead: () => apiPut('/notifications/read-all'),
}
