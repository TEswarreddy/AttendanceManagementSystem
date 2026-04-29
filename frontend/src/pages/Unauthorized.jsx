import { Link } from 'react-router-dom'

export default function Unauthorized() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <h1 className="text-3xl font-bold text-slate-900">Unauthorized</h1>
      <p className="mt-2 text-slate-600">You do not have permission to access this page.</p>
      <Link to="/" className="mt-5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white">
        Go to Dashboard
      </Link>
    </main>
  )
}
