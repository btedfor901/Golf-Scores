import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'

export default function Commissioner() {
  const { player } = useAuth()
  const [players, setPlayers] = useState([])
  const [rounds, setRounds] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from('players').select('*').order('name'),
      supabase.from('rounds').select('*, round_players(player_id, total_score, players(name))').order('date', { ascending: false }).limit(20),
    ])
    setPlayers(p ?? [])
    setRounds(r ?? [])
    setLoading(false)
  }

  async function toggleCommissioner(p) {
    await supabase.from('players').update({ is_commissioner: !p.is_commissioner }).eq('id', p.id)
    toast.success('Updated')
    loadData()
  }

  async function deleteRound(roundId) {
    if (!confirm('Delete this round? This cannot be undone.')) return
    await supabase.from('rounds').delete().eq('id', roundId)
    toast.success('Round deleted')
    loadData()
  }

  async function completeRound(roundId) {
    await supabase.from('rounds').update({ status: 'complete' }).eq('id', roundId)
    toast.success('Round marked complete')
    loadData()
  }

  if (loading) return <div className="text-center text-slate-400 mt-20">Loading...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-yellow-400">⚙️</span>
        <h1 className="text-2xl font-bold">Commissioner Panel</h1>
      </div>

      {/* Players */}
      <div>
        <h2 className="text-slate-400 text-xs uppercase tracking-wider mb-3">Players</h2>
        <div className="card p-0 divide-y divide-slate-700">
          {players.map(p => (
            <div key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-slate-400">{p.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {p.is_commissioner && <span className="text-xs text-yellow-400 border border-yellow-700 px-2 py-0.5 rounded">Admin</span>}
                {p.id !== player?.id && (
                  <button onClick={() => toggleCommissioner(p)} className="text-xs btn-secondary py-1 px-2">
                    {p.is_commissioner ? 'Remove Admin' : 'Make Admin'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rounds */}
      <div>
        <h2 className="text-slate-400 text-xs uppercase tracking-wider mb-3">All Rounds</h2>
        <div className="space-y-2">
          {rounds.map(round => (
            <div key={round.id} className="card">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <Link to={`/round/${round.id}`} className="font-semibold hover:text-green-400">{round.course_name}</Link>
                  <div className="text-xs text-slate-400">{new Date(round.date).toLocaleDateString()} · {round.round_players?.length ?? 0} players</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${round.status === 'in_progress' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                  {round.status === 'in_progress' ? 'LIVE' : 'Complete'}
                </span>
              </div>
              <div className="flex gap-2">
                {round.status === 'in_progress' && (
                  <button onClick={() => completeRound(round.id)} className="btn-secondary text-xs py-1 px-2">Mark Complete</button>
                )}
                <button onClick={() => deleteRound(round.id)} className="btn-danger text-xs py-1 px-2">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
