import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, commissionerOnly = false }) {
  const { user, player, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-slate-400">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (commissionerOnly && !player?.is_commissioner) return <Navigate to="/" replace />
  return children
}
