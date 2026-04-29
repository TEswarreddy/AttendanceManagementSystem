import { forwardRef } from 'react'

export const FormCard = forwardRef(
  ({ title, subtitle, children, onSubmit, isLoading, submitLabel = 'Submit', cancelLabel = 'Cancel', onCancel }, ref) => {
    return (
      <div className="ui-card">
        {title && <h3 className="mb-2 text-lg font-semibold text-slate-900">{title}</h3>}
        {subtitle && <p className="mb-4 text-sm text-slate-600">{subtitle}</p>}

        <form ref={ref} onSubmit={onSubmit} className="space-y-4">
          {children}

          {onSubmit && (
            <div className="flex gap-3 border-t border-slate-200 pt-4">
              <button
                type="submit"
                disabled={isLoading}
                className="ui-btn-primary"
              >
                {isLoading ? 'Loading...' : submitLabel}
              </button>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="ui-btn-secondary"
                >
                  {cancelLabel}
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    )
  }
)

FormCard.displayName = 'FormCard'

export const FormField = ({ label, error, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-900">
      {label}
      {required && <span className="text-red-600"> *</span>}
    </label>
    <div className="mt-1">{children}</div>
    {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
  </div>
)

export const FormInput = forwardRef(({ className = '', ...props }, ref) => (
  <input
    ref={ref}
    className={`ui-input ${className}`}
    {...props}
  />
))

FormInput.displayName = 'FormInput'

export const FormTextarea = forwardRef(({ className = '', ...props }, ref) => (
  <textarea
    ref={ref}
    className={`ui-input ${className}`}
    {...props}
  />
))

FormTextarea.displayName = 'FormTextarea'

export const FormSelect = forwardRef(({ options, className = '', ...props }, ref) => (
  <select
    ref={ref}
    className={`ui-input ${className}`}
    {...props}
  >
    {options?.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
))

FormSelect.displayName = 'FormSelect'
