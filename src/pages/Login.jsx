import { useState } from 'react'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'

export default function Login() {
  const [tab, setTab] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignIn(e) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) toast.error(error.message)
    setLoading(false)
  }

  async function handleSignUp(e) {
    e.preventDefault()
    if (!name.trim()) return toast.error('Name required')
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) { toast.error(error.message); setLoading(false); return }
    // Insert player record
    if (data.user) {
      const isCommissioner = name.trim().toLowerCase() === 'trey tedford'
      await supabase.from('players').insert({
        id: data.user.id,
        name: name.trim(),
        email,
        is_commissioner: isCommissioner,
      })
    }
    toast.success('Account created! Check your email to confirm.')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">⛳</div>
          <h1 className="text-3xl font-bold text-white">Golf League</h1>
          <p className="text-slate-400 mt-1">Track scores, handicaps &amp; bets</p>
        </div>

        <div className="card">
          <div className="flex mb-6 bg-slate-700 rounded-lg p-1">
            <button onClick={() => setTab('signin')} className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'signin' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>Sign In</button>
            <button onClick={() => setTab('signup')} className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'signup' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>Sign Up</button>
          </div>

          <form onSubmit={tab === 'signin' ? handleSignIn : handleSignUp} className="space-y-4">
            {tab === 'signup' && (
              <div>
                <label className="label">Full Name</label>
                <input className="input" placeholder="e.g. Trey Tedford" value={name} onChange={e => setName(e.target.value)} required />
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Loading...' : tab === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
