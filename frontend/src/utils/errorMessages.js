export const DEFAULT_ERROR_MESSAGE = 'An unexpected error occurred. Please try again later.'

const toText = (value) => String(value || '').trim().toLowerCase()

export const getUserFriendlyErrorMessage = (error, fallback = DEFAULT_ERROR_MESSAGE) => {
  const status = Number(error?.response?.status || error?.status || 0)
  const rawMessage =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    ''

  const message = toText(rawMessage)

  if (!message && status >= 500) {
    return 'Something went wrong. Please try again later.'
  }

  if (status === 401 || /invalid credentials|incorrect password|wrong password|unauthorized/.test(message)) {
    return 'Incorrect username or password. Please try again.'
  }

  if (status === 403) {
    return 'You do not have permission to perform this action.'
  }

  if (/token expired|session expired|please log in again/.test(message)) {
    return 'Your session has expired. Please log in again.'
  }

  if (/network error|failed to fetch|timeout|timed out|econn|socket|offline/.test(message)) {
    return 'Unable to connect right now. Please check your internet connection and try again.'
  }

  if (status === 409 || /already exists|duplicate|conflict/.test(message)) {
    if (/email/.test(message)) return 'Email already exists.'
    if (/phone/.test(message)) return 'Phone number already used.'
    if (/faculty id|employee id/.test(message)) return 'Faculty ID already exists.'
    if (/username/.test(message)) return 'Username already exists.'
    if (/assigned/.test(message)) return 'Faculty already assigned.'
    return 'This information already exists. Please review and try again.'
  }

  if (
    status === 400 ||
    /validation|invalid|required|must be|format|too short|too long|missing/.test(message)
  ) {
    return 'Please review the entered information and try again.'
  }

  if (/qr|scan|barcode|parsing|decode/.test(message)) {
    return 'Unable to scan QR code. Please try again.'
  }

  if (status >= 500 || /internal server|exception|stack|mongoose|mongodb|casterror|syntaxerror/.test(message)) {
    return 'Something went wrong. Please try again later.'
  }

  return fallback || DEFAULT_ERROR_MESSAGE
}
