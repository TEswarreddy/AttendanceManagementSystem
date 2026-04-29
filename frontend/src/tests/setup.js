import '@testing-library/jest-dom'
import React from 'react'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

globalThis.React = React

const storage = {}
const navigateMock = vi.fn()

Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn((key) => (key in storage ? storage[key] : null)),
    setItem: vi.fn((key, value) => {
      storage[key] = String(value)
    }),
    removeItem: vi.fn((key) => {
      delete storage[key]
    }),
    clear: vi.fn(() => {
      Object.keys(storage).forEach((key) => delete storage[key])
    }),
  },
  writable: true,
})

globalThis.__mockNavigate = navigateMock

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock, useParams: () => ({}) }
})

vi.mock('@/api/axiosInstance', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  apiDownload: vi.fn(),
}))

globalThis.URL.createObjectURL = vi.fn()
globalThis.URL.revokeObjectURL = vi.fn()

beforeEach(() => {
  navigateMock.mockReset()
  window.localStorage.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})
