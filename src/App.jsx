import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewRound from './pages/NewRound'
import LiveRound from './pages/LiveRound'
import History from './pages/History'
import Leaderboard from './pages/Leaderboard'
import Betting from './pages/Betting'
import Commissioner from './pages/Commissioner'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-center" toastOptions={{ style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' } }} />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/round/new" element={<ProtectedRoute><Layout><NewRound /></Layout></ProtectedRoute>} />
          <Route path="/round/:id" element={<ProtectedRoute><Layout><LiveRound /></Layout></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><Layout><History /></Layout></ProtectedRoute>} />
          <Route path="/leaderboard" element={<ProtectedRoute><Layout><Leaderboard /></Layout></ProtectedRoute>} />
          <Route path="/betting/:roundId" element={<ProtectedRoute><Layout><Betting /></Layout></ProtectedRoute>} />
          <Route path="/commissioner" element={<ProtectedRoute commissionerOnly><Layout><Commissioner /></Layout></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
