import React from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@/lib/dataClientHooks.jsx'
import { MemoryRouter } from 'react-router-dom'
import AuthProvider from '@/context/AuthContext'

export function renderWithProviders(ui, { route = '/', initialEntries = ['/'] } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const entries = Array.isArray(initialEntries) && initialEntries.length ? initialEntries : [route]

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={entries}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}
