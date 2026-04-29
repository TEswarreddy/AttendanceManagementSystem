import React from 'react'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authApiMock } = vi.hoisted(() => ({
  authApiMock: {
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
}))

vi.mock('@/api/authApi', () => ({ authApi: authApiMock }))

describe('AuthContext', () => {
  beforeEach(() => {
    vi.resetModules()
    authApiMock.login.mockReset()
    authApiMock.logout.mockReset()
    authApiMock.getMe.mockReset()
    localStorage.clear()
  })

  it('AuthProvider renders children', async () => {
    const { default: AuthProvider } = await import('@/context/AuthContext')

    render(
      <AuthProvider>
        <div>child-node</div>
      </AuthProvider>
    )

    expect(screen.getByText('child-node')).toBeInTheDocument()
  })

  it('isLoading starts true, becomes false after getMe resolves', async () => {
    const { default: AuthProvider, useAuth } = await import('@/context/AuthContext')

    localStorage.setItem('accessToken', 'token-1')

    let resolveGetMe
    authApiMock.getMe.mockImplementation(
      () => new Promise((resolve) => {
        resolveGetMe = resolve
      })
    )

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
      resolveGetMe({ data: { user: { id: 'u1', role: 'student' } } })
    })

    await waitFor(() => {
      expect(screen.getByTestId('loading-state')).toHaveTextContent('false')
    })
  })

  it('isAuthenticated false on mount with no localStorage token', async () => {
    const { default: AuthProvider, useAuth } = await import('@/context/AuthContext')

    authApiMock.getMe.mockResolvedValue({ data: { user: null } })

    function Consumer() {
      const auth = useAuth()
      return <div data-testid="auth-state">{String(auth.isAuthenticated)}</div>
    }

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('false')
    })
  })

  it('login() sets user and isAuthenticated after API success', async () => {
    const { default: AuthProvider, useAuth } = await import('@/context/AuthContext')

    authApiMock.login.mockResolvedValue({
      data: {
        user: { id: 'u2', name: 'Alice', email: 'alice@test.com', role: 'student' },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    })

    function Consumer() {
      const auth = useAuth()

      return (
        <>
          <div data-testid="auth-state">{String(auth.isAuthenticated)}</div>
          <div data-testid="user-name">{auth.user?.name || ''}</div>
          <button
            type="button"
            onClick={() => auth.login({ email: 'alice@test.com', password: 'Pass1234' })}
          >
            do-login
          </button>
        </>
      )
    }

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    )

    screen.getByRole('button', { name: 'do-login' }).click()

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('true')
      expect(screen.getByTestId('user-name')).toHaveTextContent('Alice')
    })
  })

  it('login() returns { success:false, message } on API failure', async () => {
    const { default: AuthProvider, useAuth } = await import('@/context/AuthContext')

    authApiMock.login.mockRejectedValue(new Error('Invalid email or password'))

    function HookConsumer({ onReady }) {
      const auth = useAuth()
      onReady(auth)
      return null
    }

    let authRef
    render(
      <AuthProvider>
        <HookConsumer onReady={(ctx) => { authRef = ctx }} />
      </AuthProvider>
    )

    const result = await authRef.login({ email: 'bad@test.com', password: 'bad' })

    expect(result).toEqual({ success: false, message: 'Invalid email or password' })
  })

  it('logout() clears localStorage', async () => {
    const { default: AuthProvider, useAuth } = await import('@/context/AuthContext')

    authApiMock.login.mockResolvedValue({
      data: {
        user: { id: 'u3', name: 'Bob', email: 'bob@test.com', role: 'student' },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    })
    authApiMock.logout.mockResolvedValue({})

    function Consumer() {
      const auth = useAuth()

      return (
        <>
          <button
            type="button"
            onClick={() => auth.login({ email: 'bob@test.com', password: 'Pass1234' })}
          >
            do-login
          </button>
          <button type="button" onClick={() => auth.logout()}>
            do-logout
          </button>
        </>
      )
    }

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    )

    screen.getByRole('button', { name: 'do-login' }).click()
    await waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalled()
    })

    screen.getByRole('button', { name: 'do-logout' }).click()

    await waitFor(() => {
      expect(localStorage.clear).toHaveBeenCalled()
    })
  })

  it('useAuth throws if used outside AuthProvider', async () => {
    const { useAuth } = await import('@/context/AuthContext')

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within AuthProvider')

    consoleErrorSpy.mockRestore()
  })
})
