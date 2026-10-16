import { Routes, Route, Link } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabaseClient'
import ReportIssue from './pages/ReportIssue'

function Home() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow p-6 text-center space-y-4">
        <h1 className="text-2xl font-bold text-slate-800">Campus Issue Reporting</h1>
        <p className="text-slate-600">Phase 0 setup is working. Pages will be added step by step.</p>
        <p className={isSupabaseConfigured ? 'text-green-700' : 'text-amber-700'}>
          {isSupabaseConfigured
            ? 'Supabase is connected.'
            : 'Supabase is not configured yet. Add your keys to .env.'}
        </p>
        <Link to="/report" className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          Report an Issue
        </Link>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/report" element={<ReportIssue />} />
      <Route path="*" element={
        <main className="min-h-screen flex items-center justify-center p-4">
          <p className="text-slate-600">Page not found.</p>
        </main>
      } />
    </Routes>
  )
}
