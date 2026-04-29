import axios from 'axios'
import { getUserFriendlyErrorMessage } from '@/utils/errorMessages'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'
const readStorage = (key) => localStorage.getItem(key) || sessionStorage.getItem(key)

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(
  (config) => {
    const accessToken = readStorage('accessToken')

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }

    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest?._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = readStorage('refreshToken')

        if (!refreshToken) {
          throw error
        }

        const { data } = await axios.post(`${BASE_URL}/auth/refresh-token`, {
          refreshToken,
        })

        localStorage.setItem('accessToken', data.data.accessToken)
        originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`

        return api(originalRequest)
      } catch {
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(error)
      }
    }

    const message = getUserFriendlyErrorMessage(error, 'We could not complete your request. Please try again.')
    const wrappedError = new Error(message)
    wrappedError.status = Number(error?.response?.status || 0)
    wrappedError.backendMessage =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      ''
    wrappedError.details = error?.response?.data?.errors || []

    return Promise.reject(wrappedError)
  }
)

export default api

const extractId = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }

  return value._id || value.id || value.value || value
}

const normalizeParamValue = (key, value) => {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => normalizeParamValue(key, item))
      .filter((item) => item !== undefined)
    return normalized.length > 0 ? normalized : undefined
  }

  if (typeof value === 'object') {
    if (key && /id$/i.test(key)) {
      const extracted = extractId(value)
      if (typeof extracted === 'string' && extracted === '[object Object]') {
        return undefined
      }
      return extracted
    }

    return undefined
  }

  if (typeof value === 'string' && value === '[object Object]') {
    return undefined
  }

  return value
}

const normalizeParams = (params) => {
  if (!params || typeof params !== 'object') {
    return params
  }

  return Object.entries(params).reduce((acc, [key, value]) => {
    const normalizedValue = normalizeParamValue(key, value)
    if (normalizedValue !== undefined) {
      acc[key] = normalizedValue
    }
    return acc
  }, {})
}

export const apiGet = (url, params) => api.get(url, { params: normalizeParams(params) })
export const apiPost = (url, data) => api.post(url, data)
export const apiPut = (url, data) => api.put(url, data)
export const apiDelete = (url) => api.delete(url)
export const apiDownload = (url, params) =>
  api.get(url, { params: normalizeParams(params), responseType: 'blob' })
