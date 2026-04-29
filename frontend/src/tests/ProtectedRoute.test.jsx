import React from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

import ProtectedRoute from '@/components/shared/ProtectedRoute'

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuthMock.mockReset()
  })

  const renderRoute = (allowedRoles = ['student']) =>
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

  it('shows spinner while isLoading', () => {
    useAuthMock.mockReturnValue({ isLoading: true, isAuthenticated: false, user: null })

    renderRoute()

    expect(screen.getByText(/loading, please wait/i)).toBeInTheDocument()
  })

  it('redirects to /login when not authenticated', () => {
    useAuthMock.mockReturnValue({ isLoading: false, isAuthenticated: false, user: null })

    renderRoute()

    expect(screen.getByText('login-page')).toBeInTheDocument()
  })

  it('redirects to /unauthorized for wrong role', () => {
    useAuthMock.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { role: 'student' },
    })

    renderRoute(['faculty'])

    expect(screen.getByText('unauthorized-page')).toBeInTheDocument()
  })

  it('renders children when authenticated with correct role', () => {
    useAuthMock.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: { role: 'student' },
    })

    renderRoute(['student'])

    expect(screen.getByText('private-content')).toBeInTheDocument()
  })
})
