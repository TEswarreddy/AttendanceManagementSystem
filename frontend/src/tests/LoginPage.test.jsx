import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const { authApiMock } = vi.hoisted(() => ({
  authApiMock: {
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}))

vi.mock('@/api/authApi', () => ({ authApi: authApiMock }))

describe('LoginPage', () => {
  beforeEach(() => {
    vi.resetModules()
    authApiMock.login.mockReset()
    authApiMock.logout.mockReset()
    authApiMock.getMe.mockReset()
    globalThis.__mockNavigate?.mockReset()
    localStorage.clear()
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

  it('renders email input, password input, submit button', async () => {
    await renderLoginPage()

    expect(screen.getByPlaceholderText(/student@college.edu/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/enter your password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it("shows 'Email is required' for empty submit", async () => {
    await renderLoginPage()

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Email is required')).toBeInTheDocument()
  })

  it("shows 'Password is required' for empty submit", async () => {
    await renderLoginPage()

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Password is required')).toBeInTheDocument()
  })

  it('calls authApi.login with email and password on submit', async () => {
    authApiMock.login.mockResolvedValue({
      data: {
        user: { id: 's1', name: 'Student', email: 'student@test.com', role: 'student' },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    })

    await renderLoginPage()

    fireEvent.change(screen.getByPlaceholderText(/student@college.edu/i), {
      target: { value: 'student@test.com' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter your password/i), {
      target: { value: 'Pass1234' },
    })

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(authApiMock.login).toHaveBeenCalledWith({
        email: 'student@test.com',
        password: 'Pass1234',
      })
    })
  })

  it('navigates to /student/dashboard on student role login', async () => {
    authApiMock.login.mockResolvedValue({
      data: {
        user: { id: 's2', name: 'Student', email: 'student2@test.com', role: 'student' },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    })

    await renderLoginPage()

    fireEvent.change(screen.getByPlaceholderText(/student@college.edu/i), {
      target: { value: 'student2@test.com' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter your password/i), {
      target: { value: 'Pass1234' },
    })

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(globalThis.__mockNavigate).toHaveBeenCalledWith('/student/dashboard', { replace: true })
    })
  })

  it('navigates to /faculty/dashboard on faculty role login', async () => {
    authApiMock.login.mockResolvedValue({
      data: {
        user: { id: 'f1', name: 'Faculty', email: 'faculty@test.com', role: 'faculty' },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    })

    await renderLoginPage()

    fireEvent.change(screen.getByPlaceholderText(/student@college.edu/i), {
      target: { value: 'faculty@test.com' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter your password/i), {
      target: { value: 'Pass1234' },
    })

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(globalThis.__mockNavigate).toHaveBeenCalledWith('/faculty/dashboard', { replace: true })
    })
  })

  it('shows error message from API on failed login', async () => {
    authApiMock.login.mockRejectedValue(new Error('Invalid email or password'))

    await renderLoginPage()

    fireEvent.change(screen.getByPlaceholderText(/student@college.edu/i), {
      target: { value: 'invalid@test.com' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter your password/i), {
      target: { value: 'Wrong123' },
    })

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument()
  })

  it('submit button disabled during loading state', async () => {
    let resolveLogin
    authApiMock.login.mockImplementation(
      () => new Promise((resolve) => {
        resolveLogin = resolve
      })
    )

    await renderLoginPage()

    fireEvent.change(screen.getByPlaceholderText(/student@college.edu/i), {
      target: { value: 'loading@test.com' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter your password/i), {
      target: { value: 'Pass1234' },
    })

    const submit = screen.getByRole('button', { name: /sign in/i })
    fireEvent.click(submit)

    await waitFor(() => {
      expect(submit).toBeDisabled()
    })

    resolveLogin({
      data: {
        user: { id: 's3', name: 'Student', email: 'loading@test.com', role: 'student' },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    })
  })

  it('password field toggles visibility on eye icon click', async () => {
    await renderLoginPage()

    const passwordInput = screen.getByPlaceholderText(/enter your password/i)
    expect(passwordInput).toHaveAttribute('type', 'password')

    const toggle = screen.getByRole('button', { name: /show password/i })
    fireEvent.click(toggle)

    expect(passwordInput).toHaveAttribute('type', 'text')
  })
})
