import React from 'react'
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@/lib/dataClientHooks.jsx'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useStudentAttendance } from '@/hooks/useAttendance'

const { mockAuthApi, mockAttendanceApi } = vi.hoisted(() => ({
  mockAuthApi: {
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
    refreshToken: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    changePassword: vi.fn(),
  },
  mockAttendanceApi: {
    mark: vi.fn(),
    getClass: vi.fn(),
    getStudent: vi.fn(),
    editOne: vi.fn(),
    adminEdit: vi.fn(),
    getHistory: vi.fn(),
    getDeptStats: vi.fn(),
    getSubjectReport: vi.fn(),
    getLowAttendance: vi.fn(),
  },
}))

vi.mock('@/api/authApi', () => ({ authApi: mockAuthApi }))
vi.mock('@/api/attendanceApi', () => ({ attendanceApi: mockAttendanceApi }))

const createQueryWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('AuthContext tests', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAuthApi.login.mockReset()
    mockAuthApi.logout.mockReset()
    mockAuthApi.getMe.mockReset()
  })

  it('AuthProvider renders children without crashing', async () => {
    const { default: AuthProvider } = await import('@/context/AuthContext')

    render(
      <AuthProvider>
        <div>child-content</div>
      </AuthProvider>
    )

    expect(screen.getByText('child-content')).toBeInTheDocument()
  })

  it('isLoading is true on mount, false after getMe resolves', async () => {
    const { default: AuthProvider, useAuth } = await import('@/context/AuthContext')

    let resolveGetMe
    mockAuthApi.getMe.mockImplementation(
      () => new Promise((resolve) => (resolveGetMe = resolve))
    )
    window.localStorage.setItem('accessToken', 'token-1')

    function Consumer() {
      const auth = useAuth()
      return <div data-testid="loading-state">{String(auth.isLoading)}</div>
    }

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    )

    expect(screen.getByTestId('loading-state')).toHaveTextContent('true')

    await act(async () => {
      resolveGetMe({
        data: {
          user: { id: 'u1', name: 'Test User', email: 'test@example.com', role: 'student' },
        },
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('loading-state')).toHaveTextContent('false')
    })
  })

  it('isAuthenticated becomes true after successful login', async () => {
    const { default: AuthProvider, useAuth } = await import('@/context/AuthContext')

    mockAuthApi.login.mockResolvedValue({
      data: {
        user: { id: 'u100', name: 'Alice', email: 'alice@college.edu', role: 'student' },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    })

    function Consumer() {
      const auth = useAuth()
      return (
        <>
          <div data-testid="is-auth">{String(auth.isAuthenticated)}</div>
          <button onClick={() => auth.login({ email: 'alice@college.edu', password: 'Pass1234' })}>
            login
          </button>
        </>
      )
    }

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    )

    fireEvent.click(screen.getByText('login'))

    await waitFor(() => {
      expect(screen.getByTestId('is-auth')).toHaveTextContent('true')
    })
  })

  it('user object has correct shape after login (id, name, email, role)', async () => {
    const { default: AuthProvider, useAuth } = await import('@/context/AuthContext')

    mockAuthApi.login.mockResolvedValue({
      data: {
        user: {
          id: 'u200',
          name: 'Bob User',
          email: 'bob@college.edu',
          role: 'faculty',
        },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    })

    function Consumer() {
      const auth = useAuth()
      return (
        <>
          <div data-testid="user-id">{auth.user?.id || ''}</div>
          <div data-testid="user-name">{auth.user?.name || ''}</div>
          <div data-testid="user-email">{auth.user?.email || ''}</div>
          <div data-testid="user-role">{auth.user?.role || ''}</div>
          <button onClick={() => auth.login({ email: 'bob@college.edu', password: 'Pass1234' })}>
            login
          </button>
        </>
      )
    }

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    )

    fireEvent.click(screen.getByText('login'))

    await waitFor(() => {
      expect(screen.getByTestId('user-id')).toHaveTextContent('u200')
      expect(screen.getByTestId('user-name')).toHaveTextContent('Bob User')
      expect(screen.getByTestId('user-email')).toHaveTextContent('bob@college.edu')
      expect(screen.getByTestId('user-role')).toHaveTextContent('faculty')
    })
  })

  it('logout clears localStorage and sets isAuthenticated false', async () => {
    const { default: AuthProvider, useAuth } = await import('@/context/AuthContext')

    mockAuthApi.login.mockResolvedValue({
      data: {
        user: { id: 'u300', name: 'Carol', email: 'carol@college.edu', role: 'student' },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    })
    mockAuthApi.logout.mockResolvedValue({ data: {} })

    function Consumer() {
      const auth = useAuth()
      return (
        <>
          <div data-testid="is-auth">{String(auth.isAuthenticated)}</div>
          <button onClick={() => auth.login({ email: 'carol@college.edu', password: 'Pass1234' })}>
            login
          </button>
          <button onClick={() => auth.logout()}>logout</button>
        </>
      )
    }

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    )

    fireEvent.click(screen.getByText('login'))
    await waitFor(() => expect(screen.getByTestId('is-auth')).toHaveTextContent('true'))

    fireEvent.click(screen.getByText('logout'))

    await waitFor(() => {
      expect(window.localStorage.clear).toHaveBeenCalled()
      expect(screen.getByTestId('is-auth')).toHaveTextContent('false')
    })
  })

  it('useAuth throws if used outside AuthProvider', async () => {
    const { useAuth } = await import('@/context/AuthContext')

    const originalError = console.error
    console.error = vi.fn()

    function BrokenConsumer() {
      useAuth()
      return <div>broken</div>
    }

    expect(() => render(<BrokenConsumer />)).toThrow('useAuth must be used within AuthProvider')

    console.error = originalError
  })
})

describe('LoginPage tests', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAuthApi.login.mockReset()
    mockAuthApi.logout.mockReset()
    mockAuthApi.getMe.mockReset()
    globalThis.__mockNavigate.mockReset()
  })

  const renderLoginPage = async () => {
    const { default: AuthProvider } = await import('@/context/AuthContext')
    const { default: LoginPage } = await import('@/pages/LoginPage')

    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    )
  }

  it('renders email and password fields', async () => {
    await renderLoginPage()

    expect(screen.getByPlaceholderText(/student@college.edu/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/enter your password/i)).toBeInTheDocument()
  })

  it('shows validation errors for empty form submit', async () => {
    await renderLoginPage()

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument()
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument()
  })

  it('calls authApi.login with correct credentials', async () => {
    mockAuthApi.login.mockResolvedValue({
      data: {
        user: { id: 'stu-1', name: 'Student User', email: 'student@college.edu', role: 'student' },
        accessToken: 'token-a',
        refreshToken: 'token-r',
      },
    })

    await renderLoginPage()

    fireEvent.change(screen.getByPlaceholderText(/student@college.edu/i), {
      target: { value: 'student@college.edu' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter your password/i), {
      target: { value: 'Pass1234' },
    })

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockAuthApi.login).toHaveBeenCalledWith({
        email: 'student@college.edu',
        password: 'Pass1234',
      })
    })
  })

  it('navigates to /student/dashboard for student role after login', async () => {
    mockAuthApi.login.mockResolvedValue({
      data: {
        user: { id: 'stu-2', name: 'Student User', email: 'student2@college.edu', role: 'student' },
        accessToken: 'token-a',
        refreshToken: 'token-r',
      },
    })

    await renderLoginPage()

    fireEvent.change(screen.getByPlaceholderText(/student@college.edu/i), {
      target: { value: 'student2@college.edu' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter your password/i), {
      target: { value: 'Pass1234' },
    })

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(globalThis.__mockNavigate).toHaveBeenCalledWith('/student/dashboard', { replace: true })
    })
  })

  it('shows error message for wrong credentials', async () => {
    mockAuthApi.login.mockRejectedValue(new Error('Invalid email or password'))

    await renderLoginPage()

    fireEvent.change(screen.getByPlaceholderText(/student@college.edu/i), {
      target: { value: 'wrong@college.edu' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter your password/i), {
      target: { value: 'badpass' },
    })

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument()
  })

  it('login button is disabled and shows spinner during submit', async () => {
    let resolveLogin
    mockAuthApi.login.mockImplementation(
      () => new Promise((resolve) => (resolveLogin = resolve))
    )

    await renderLoginPage()

    fireEvent.change(screen.getByPlaceholderText(/student@college.edu/i), {
      target: { value: 'pending@college.edu' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter your password/i), {
      target: { value: 'Pass1234' },
    })

    const submitButton = screen.getByRole('button', { name: /sign in/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(submitButton).toBeDisabled()
      expect(document.querySelector('span.animate-spin')).toBeTruthy()
    })

    await act(async () => {
      resolveLogin({
        data: {
          user: { id: 'stu-3', name: 'Pending User', email: 'pending@college.edu', role: 'student' },
          accessToken: 'token-a',
          refreshToken: 'token-r',
        },
      })
    })
  })
})

describe('ProtectedRoute tests', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  const renderProtectedRoute = async ({ authState, allowedRoles = ['student'] }) => {
    const authModule = await import('@/context/AuthContext')
    vi.spyOn(authModule, 'useAuth').mockReturnValue(authState)

    const { default: ProtectedRoute } = await import('@/components/shared/ProtectedRoute')

    render(
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route element={<ProtectedRoute allowedRoles={allowedRoles} />}>
            <Route path="/private" element={<div>private-content</div>} />
          </Route>
          <Route path="/login" element={<div>login-page</div>} />
          <Route path="/unauthorized" element={<div>unauthorized-page</div>} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('shows FullPageSpinner while isLoading', async () => {
    await renderProtectedRoute({
      authState: {
        isAuthenticated: false,
        isLoading: true,
        user: null,
      },
    })

    expect(screen.getByText(/loading, please wait/i)).toBeInTheDocument()
  })

  it('redirects to /login when not authenticated', async () => {
    await renderProtectedRoute({
      authState: {
        isAuthenticated: false,
        isLoading: false,
        user: null,
      },
    })

    await waitFor(() => {
      expect(screen.getByText('login-page')).toBeInTheDocument()
    })
  })

  it('redirects to /unauthorized when wrong role', async () => {
    await renderProtectedRoute({
      authState: {
        isAuthenticated: true,
        isLoading: false,
        user: { role: 'faculty' },
      },
      allowedRoles: ['student'],
    })

    await waitFor(() => {
      expect(screen.getByText('unauthorized-page')).toBeInTheDocument()
    })
  })

  it('renders Outlet when authenticated with correct role', async () => {
    await renderProtectedRoute({
      authState: {
        isAuthenticated: true,
        isLoading: false,
        user: { role: 'student' },
      },
      allowedRoles: ['student'],
    })

    await waitFor(() => {
      expect(screen.getByText('private-content')).toBeInTheDocument()
    })
  })
})

describe('useStudentAttendance hook tests', () => {
  beforeEach(() => {
    mockAttendanceApi.getStudent.mockReset()
  })

  it('fetches attendance data on mount', async () => {
    mockAttendanceApi.getStudent.mockResolvedValue({
      data: {
        summary: [{ percentage: 84, status: 'safe' }],
      },
    })

    const wrapper = createQueryWrapper()
    renderHook(() => useStudentAttendance('student-1', {}), {
      wrapper,
    })

    await waitFor(() => {
      expect(mockAttendanceApi.getStudent).toHaveBeenCalledWith('student-1', {})
    })
  })

  it('returns correct isLoading state', async () => {
    let resolveRequest
    mockAttendanceApi.getStudent.mockImplementation(
      () => new Promise((resolve) => (resolveRequest = resolve))
    )

    const wrapper = createQueryWrapper()
    const { result } = renderHook(() => useStudentAttendance('student-2', {}), {
      wrapper,
    })

    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      resolveRequest({
        data: {
          summary: [{ percentage: 71, status: 'warning' }],
        },
      })
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('data.summary array has percentage and status fields', async () => {
    mockAttendanceApi.getStudent.mockResolvedValue({
      data: {
        summary: [
          { percentage: 90, status: 'safe' },
          { percentage: 62, status: 'critical' },
        ],
      },
    })

    const wrapper = createQueryWrapper()
    const { result } = renderHook(() => useStudentAttendance('student-3', {}), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.data.summary).toBeDefined()
      expect(result.current.data.summary[0]).toHaveProperty('percentage')
      expect(result.current.data.summary[0]).toHaveProperty('status')
    })
  })
})
