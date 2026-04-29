import { useEffect } from 'react'
import {
  InformationCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  CheckCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

const BANNER_STYLES = {
  info: {
    wrapper: 'border-blue-200 bg-blue-50 text-blue-800',
    icon: InformationCircleIcon,
  },
  warning: {
    wrapper: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: ExclamationTriangleIcon,
  },
  error: {
    wrapper: 'border-red-200 bg-red-50 text-red-800',
    icon: XCircleIcon,
  },
  success: {
    wrapper: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: CheckCircleIcon,
  },
}

export default function AlertBanner({
  type = 'info',
  message,
  onDismiss,
  actionLabel,
  onAction,
}) {
  const config = BANNER_STYLES[type] || BANNER_STYLES.info
  const Icon = config.icon

  useEffect(() => {
    if (!onDismiss) {
      return undefined
    }

    const timerId = setTimeout(() => {
      onDismiss()
    }, 5000)

    return () => clearTimeout(timerId)
  }, [onDismiss])

  return (
    <div className={`fixed right-4 top-20 z-[60] w-[min(92vw,32rem)] rounded-xl border p-3 shadow-lg ${config.wrapper}`} role="alert">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="flex-1 text-sm font-medium">{message}</p>

        {actionLabel && onAction && (
          <button className="rounded-md px-2 py-1 text-xs font-semibold underline" onClick={onAction}>
            {actionLabel}
          </button>
        )}

        {onDismiss && (
          <button onClick={onDismiss} className="rounded-md p-1 hover:bg-black/5" aria-label="Dismiss alert">
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
