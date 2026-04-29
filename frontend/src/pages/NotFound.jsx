import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <h1 className="text-3xl font-bold text-slate-900">404 - Page Not Found</h1>
      <p className="mt-2 text-slate-600">The page you requested does not exist.</p>
      <Link to="/" className="mt-5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white">
        Back to Home
      </Link>
    </main>
  )
}
