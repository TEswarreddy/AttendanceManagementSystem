export function FullPageSpinner({ title = 'Attendance Management System' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 text-2xl font-bold text-white">
        A
      </div>
      <p className="text-lg font-semibold text-slate-800">{title}</p>
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-100 border-t-primary-600" />
      <p className="text-sm text-slate-500">Loading, please wait...</p>
    </div>
  )
}

export function Spinner({ size = 'md', className = '' }) {
  const sizeMap = {
    sm: 'h-4 w-4 border-2',
    md: 'h-6 w-6 border-2',
    lg: 'h-10 w-10 border-4',
  }

  const spinnerSize = sizeMap[size] || sizeMap.md

  return (
    <span
      className={`inline-block animate-spin rounded-full border-slate-200 border-t-primary-600 ${spinnerSize} ${className}`}
      role="status"
      aria-label="Loading"
    />
  )
}

export default Spinner

export function SkeletonCard({ width = '100%', height = '6rem', className = '' }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-slate-200 ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  )
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      <SkeletonCard height="2.5rem" className="bg-slate-300" />
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonCard key={index} height="3rem" />
      ))}
    </div>
  )
}
