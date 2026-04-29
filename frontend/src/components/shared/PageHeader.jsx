import { SparklesIcon } from '@heroicons/react/24/outline'

export default function PageHeader({ title, subtitle, actions = null, eyebrow = 'Workspace' }) {
  const hasArrayActions = Array.isArray(actions) && actions.length > 0
  const hasCustomActions = !Array.isArray(actions) && Boolean(actions)

  const variantStyles = {
    primary: 'ui-btn-primary',
    secondary: 'ui-btn-secondary',
    danger: 'ui-btn-danger',
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-br from-white via-white to-primary-50/70 p-5 shadow-lg shadow-slate-200/60 backdrop-blur md:p-6">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary-200/40 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-12 left-14 h-24 w-24 rounded-full bg-cyan-100/70 blur-2xl" />

      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-700 ring-1 ring-primary-100">
            <SparklesIcon className="h-3.5 w-3.5" />
            {eyebrow}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 max-w-2xl text-sm text-slate-600 md:text-base">{subtitle}</p>}
        </div>

        {hasCustomActions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}

        {hasArrayActions ? (
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className={`${
                  variantStyles[action.variant || 'primary']
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
