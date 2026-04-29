const DEFAULT_API_BASE_URL = '/api'

/**
 * Handles malformed API URLs such as `:5000/api` by coercing them to
 * `http://localhost:5000/api` for local development.
 */
export const resolveApiBaseUrl = (rawValue) => {
  const value = typeof rawValue === 'string' ? rawValue.trim() : ''

  if (!value) {
    return DEFAULT_API_BASE_URL
  }

  if (value.startsWith(':')) {
    return `http://localhost${value}`
  }

  return value
}

export default resolveApiBaseUrl
