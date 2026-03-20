import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function History() {
  const { player } = useAuth()
  const [rounds, setRounds] = useState([])
  const [loading, setLoading] = useState(true)

  function loadRounds() {
    supabase.from('rounds')
      .select('*, round_players(player_id, total_score, handicap_at_round, players(name))')
      .eq('status', 'complete')
      .order('date', { ascending: false })
      .then(({ data }) => { setRounds(data ?? []); setLoading(false) })
  }

  useEffect(() => { loadRounds() }, [])

  async function deleteRound(e, roundId) {
    e.preventDefault()
    if (!confirm('Delete this round and all its scores/bets? This cannot be undone.')) return
    await supabase.from('bet_players').delete().in('bet_id',
      (await supabase.from('bets').select('id').eq('round_id', roundId)).data?.map(b => b.id) ?? []
    )
    await supabase.from('bets').delete().eq('round_id', roundId)
    await supabase.from('hole_scores').delete().eq('round_id', roundId)
    await supabase.from('round_players').delete().eq('round_id', roundId)
    await supabase.from('rounds').delete().eq('id', roundId)
    toast.success('Round deleted')
    loadRounds()
  }

  if (loading) return <div className="text-center text-slate-400 mt-20">Loading...</div>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Round History</h1>
      {rounds.length === 0 && (
        <div className="text-center text-slate-500 py-10">No completed rounds yet.</div>
      )}
      {rounds.map(round => {
        const sorted = [...(round.round_players ?? [])].sort((a, b) => (a.total_score ?? 999) - (b.total_score ?? 999))
        return (
          <Link key={round.id} to={`/round/${round.id}`} className="card block hover:border-slate-500 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="font-semibold">{round.course_name}</div>
                <div className="text-slate-400 text-xs">Par {round.course_par} · {new Date(round.date).toLocaleDateString()}</div>
              </div>
              {player?.is_commissioner && (
                <button
                  onClick={(e) => deleteRound(e, round.id)}
                  className="text-xs bg-red-900/40 text-red-400 border border-red-800/50 px-2 py-1 rounded-lg hover:bg-red-900/60"
                >
                  Delete
                </button>
              )}
            </div>
            <div className="space-y-1">
              {sorted.slice(0, 3).map((rp, idx) => (
                <div key={rp.player_id} className="flex justify-between text-sm">
                  <span className={idx === 0 ? 'text-yellow-400 font-medium' : 'text-slate-400'}>
                    {idx === 0 ? '🏆 ' : `${idx + 1}. `}{rp.players?.name?.split(' ')[0]}
                  </span>
                  <span className={idx === 0 ? 'text-white font-bold' : 'text-slate-400'}>
                    {rp.total_score ?? '--'}
                  </span>
                </div>
              ))}
              {sorted.length > 3 && <div className="text-xs text-slate-500">+{sorted.length - 3} more</div>}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
