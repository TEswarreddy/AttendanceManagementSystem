import { ATTENDANCE_COLOR, ATTENDANCE_STATUS } from '@/utils/constants'

const normalizeStatus = (status) => String(status || '').toLowerCase()

const resolveConfig = (status) => {
  const key = normalizeStatus(status)

  if (key === 'p' || key === 'approved' || key === 'safe') {
    return {
      label: key === 'approved' ? 'Approved' : ATTENDANCE_STATUS.P.label,
      color: ATTENDANCE_COLOR.safe,
    }
  }

  if (key === 'l' || key === 'pending' || key === 'warning') {
    return {
      label: key === 'pending' ? 'Pending' : ATTENDANCE_STATUS.L.label,
      color: ATTENDANCE_COLOR.warning,
    }
  }

  if (key === 'a' || key === 'rejected' || key === 'critical') {
    return {
      label: key === 'rejected' ? 'Rejected' : ATTENDANCE_STATUS.A.label,
      color: ATTENDANCE_COLOR.critical,
    }
  }

  if (key === 'ml') {
    return {
      label: ATTENDANCE_STATUS.ML.label,
      color: {
        text: 'text-blue-700',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        badge: 'bg-blue-100 text-blue-800',
      },
    }
  }

  return {
    label: status || 'Unknown',
    color: {
      text: 'text-slate-700',
      bg: 'bg-slate-100',
      border: 'border-slate-300',
      badge: 'bg-slate-100 text-slate-700',
    },
  }
}

export default function StatusBadge({ status, variant = 'pill' }) {
  const config = resolveConfig(status)

  if (variant === 'dot') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.color.text}`}>
        <span className={`h-2 w-2 rounded-full ${config.color.badge.split(' ')[0]}`} />
        {config.label}
      </span>
    )
  }

  if (variant === 'chip') {
    return (
      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${config.color.text} ${config.color.border} ${config.color.bg}`}>
        {config.label}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${config.color.badge}`}>
      {config.label}
    </span>
  )
}
