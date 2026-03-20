import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '🏠' },
  { to: '/leaderboard', label: 'Standings', icon: '🏆' },
  { to: '/history', label: 'History', icon: '📋' },
]

export default function Layout({ children }) {
  const { player, signOut } = useAuth()
  const location = useLocation()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <span className="text-green-400 text-xl">⛳</span>
          <span className="font-bold text-white text-lg">Golf League</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-sm hidden sm:block">{player?.name}</span>
          {player?.is_commissioner && (
            <Link to="/commissioner" className="text-xs bg-yellow-600/20 text-yellow-400 border border-yellow-700 px-2 py-1 rounded">
              Admin
            </Link>
          )}
          <button onClick={signOut} className="text-slate-400 hover:text-white text-sm">Sign out</button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full pb-24">
        {children}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 flex justify-around py-2 z-50">
        {navItems.map(item => (
          <Link
            key={item.to}
            to={item.to}
            className={`flex flex-col items-center px-4 py-1 text-xs ${location.pathname === item.to ? 'text-green-400' : 'text-slate-400'}`}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
