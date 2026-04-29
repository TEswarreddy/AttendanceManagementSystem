import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react'
import { authApi } from '@/api/authApi'

const AuthContext = createContext(undefined)

const ACCESS_TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'
const AUTH_USER_KEY = 'authUser'

const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
}

const ACTIONS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  SET_LOADING: 'SET_LOADING',
  UPDATE_USER: 'UPDATE_USER',
}

const resolveUser = (response) => response?.data?.user || response?.user || null

const normalizeAuthPayload = (response) => {
  const topLevel = response?.data || response || {}
  const data = topLevel?.data || topLevel

  return {
    user: data?.user || topLevel?.user || null,
    accessToken: data?.accessToken || topLevel?.accessToken || null,
    refreshToken: data?.refreshToken || topLevel?.refreshToken || null,
  }
}

const persistAuth = ({ user, accessToken, refreshToken }) => {
  if (accessToken) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  }

  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  }

  if (user) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
  }
}

const clearAuthStorage = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(AUTH_USER_KEY)
}

const readStoredUser = () => {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const authReducer = (state, action) => {
  switch (action.type) {
    case ACTIONS.LOGIN:
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
      }
    case ACTIONS.LOGOUT:
      return {
        user: null,
        isAuthenticated: false,
        isLoading: false,
      }
    case ACTIONS.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload,
      }
    case ACTIONS.UPDATE_USER:
      return {
        ...state,
        user: state.user ? { ...state.user, ...action.payload } : state.user,
      }
    default:
      return state
  }
}

const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState)

  const syncUserFromServer = useCallback(async ({ clearOnFailure = false, applyState = true } = {}) => {
    const response = await authApi.getMe()
    const user = resolveUser(response)

    if (user && applyState) {
      persistAuth({ user })
      dispatch({ type: ACTIONS.LOGIN, payload: user })
    }

    if (user) return user

    if (clearOnFailure) {
      clearAuthStorage()
      dispatch({ type: ACTIONS.LOGOUT })
    }

    return null
  }, [])

  useEffect(() => {
    let isMounted = true

    const restoreAuth = async () => {
      dispatch({ type: ACTIONS.SET_LOADING, payload: true })

      try {
        const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY)
        const storedUser = readStoredUser()

        if (!accessToken) {
          if (isMounted) {
            dispatch({ type: ACTIONS.LOGOUT })
          }
          return
        }

        if (storedUser && isMounted) {
          dispatch({ type: ACTIONS.LOGIN, payload: storedUser })
        }

        const user = await syncUserFromServer({ clearOnFailure: true, applyState: false })

        if (user && isMounted) {
          persistAuth({ user })
          dispatch({ type: ACTIONS.LOGIN, payload: user })
        } else if (isMounted) {
          clearAuthStorage()
          dispatch({ type: ACTIONS.LOGOUT })
        }
      } catch {
        clearAuthStorage()
        if (isMounted) {
          dispatch({ type: ACTIONS.LOGOUT })
        }
      } finally {
        if (isMounted) {
          dispatch({ type: ACTIONS.SET_LOADING, payload: false })
        }
      }
    }

    restoreAuth()

    return () => {
      isMounted = false
    }
  }, [syncUserFromServer])

  useEffect(() => {
    const handleStorageChange = (event) => {
      if (![ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, AUTH_USER_KEY].includes(event.key)) {
        return
      }

      const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY)
      const storedUser = readStoredUser()

      if (!accessToken || !storedUser) {
        dispatch({ type: ACTIONS.LOGOUT })
        return
      }

      dispatch({ type: ACTIONS.LOGIN, payload: storedUser })
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  useEffect(() => {
    if (!state.isAuthenticated) {
      return undefined
    }

    const refreshAuthUser = async () => {
      try {
        await syncUserFromServer()
      } catch {
        // Keep session as-is here; global axios interceptor handles hard auth failures.
      }
    }

    const intervalId = window.setInterval(refreshAuthUser, 30000)
    window.addEventListener('focus', refreshAuthUser)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshAuthUser)
    }
  }, [state.isAuthenticated, syncUserFromServer])

  const login = async (credentials, legacyPassword) => {
    try {
      const email =
        typeof credentials === 'object' && credentials !== null
          ? credentials.email
          : credentials
      const password =
        typeof credentials === 'object' && credentials !== null
          ? credentials.password
          : legacyPassword

      const response = await authApi.login({ email, password })
      const payload = normalizeAuthPayload(response)

      if (!payload.accessToken || !payload.user) {
        throw new Error('Invalid login response from server')
      }

      persistAuth(payload)
      dispatch({ type: ACTIONS.LOGIN, payload: payload.user })

      return { success: true, user: payload.user }
    } catch (error) {
      return { success: false, message: error.message }
    }
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } catch {
      // Ignore logout API errors.
    }

    clearAuthStorage()
    dispatch({ type: ACTIONS.LOGOUT })
  }

  const updateUser = (userData) => {
    dispatch({ type: ACTIONS.UPDATE_USER, payload: userData })
  }

  const refreshUser = async () => {
    try {
      const user = await syncUserFromServer()
      return { success: Boolean(user), user }
    } catch (error) {
      return { success: false, message: error.message }
    }
  }

  const hasRole = (...roles) => roles.includes(state.user?.role)
  const isStudent = state.user?.role === 'student'
  const isFaculty = ['faculty', 'class_teacher', 'time_table_coordinator', 'attendance_coordinator'].includes(state.user?.role)
  const isAdmin = ['admin', 'hod'].includes(state.user?.role)

  const value = useMemo(
    () => ({
      ...state,
      login,
      logout,
      updateUser,
      refreshUser,
      hasRole,
      isStudent,
      isFaculty,
      isAdmin,
    }),
    [state]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export default AuthProvider
