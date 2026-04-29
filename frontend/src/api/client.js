import axios from 'axios'
import { getUserFriendlyErrorMessage } from '@/utils/errorMessages'
import { resolveApiBaseUrl } from '@/api/resolveApiBaseUrl'

const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL)
const ACCESS_TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'

let refreshPromise = null

const readStorage = (key) => localStorage.getItem(key) || sessionStorage.getItem(key)
const getAccessToken = () => readStorage(ACCESS_TOKEN_KEY)
const getRefreshToken = () => readStorage(REFRESH_TOKEN_KEY)

const setTokens = ({ accessToken, refreshToken }) => {
  if (accessToken) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  }

  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  }
}

const clearTokens = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

const redirectToLogin = () => {
  if (window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

const extractMessage = (error) =>
  getUserFriendlyErrorMessage(error, 'We could not complete your request. Please try again.')

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use(
  (config) => {
    const token = getAccessToken()

    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  (error) => Promise.reject(error)
)

const requestTokenRefresh = async () => {
  const refreshToken = getRefreshToken()

  if (!refreshToken) {
    throw new Error('No refresh token available')
  }

  const response = await axios.post('/api/auth/refresh', { refreshToken })

  const payload = response?.data?.data || response?.data || {}
  const accessToken = payload.accessToken
  const nextRefreshToken = payload.refreshToken || refreshToken

  if (!accessToken) {
    throw new Error('Refresh response missing access token')
  }

  setTokens({
    accessToken,
    refreshToken: nextRefreshToken,
  })

  return accessToken
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config || {}
    const status = error?.response?.status

    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        if (!refreshPromise) {
          refreshPromise = requestTokenRefresh().finally(() => {
            refreshPromise = null
          })
        }

        const newAccessToken = await refreshPromise
        originalRequest.headers = originalRequest.headers || {}
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        return api(originalRequest)
      } catch (refreshError) {
        clearTokens()
        redirectToLogin()

        return Promise.reject({
          ...refreshError,
          message: extractMessage(refreshError),
        })
      }
    }

    return Promise.reject({
      ...error,
      message: extractMessage(error),
    })
  }
)

/**
 * @template T
 * @typedef {{ data: T | null, error: string | null }} ApiResult
 */

/**
 * @template T
 * @param {Promise<import('axios').AxiosResponse<T>>} requestPromise
 * @returns {Promise<ApiResult<T>>}
 */
const toApiResult = async (requestPromise) => {
  try {
    const response = await requestPromise
    return {
      data: response.data,
      error: null,
    }
  } catch (error) {
    return {
      data: null,
      error: extractMessage(error),
    }
  }
}

/** @template T */
export const apiGet = (url, config = {}) => toApiResult(api.get(url, config))
/** @template T */
export const apiPost = (url, body = {}, config = {}) => toApiResult(api.post(url, body, config))
/** @template T */
export const apiPut = (url, body = {}, config = {}) => toApiResult(api.put(url, body, config))
/** @template T */
export const apiDelete = (url, config = {}) => toApiResult(api.delete(url, config))

export { extractMessage as extractApiErrorMessage }
export default api
