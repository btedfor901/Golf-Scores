import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { calcHandicap } from '../utils/handicap'

export default function Dashboard() {
  const { player } = useAuth()
  const navigate = useNavigate()
  const [activeRounds, setActiveRounds] = useState([])
  const [recentRounds, setRecentRounds] = useState([])
  const [moneyTotals, setMoneyTotals] = useState([])
  const [myHandicap, setMyHandicap] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!player) { setLoading(false); return }
    loadData()

    // Real-time subscription for active rounds
    const sub = supabase
      .channel('rounds-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, loadData)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [player])

  async function loadData() {
    setLoading(true)

    const [{ data: active }, { data: recent }, { data: betResults }, { data: myRounds }] = await Promise.all([
      supabase.from('rounds').select('*, round_players(player_id, players(name))').eq('status', 'in_progress').order('created_at', { ascending: false }),
      supabase.from('rounds').select('*, round_players(player_id, players(name))').eq('status', 'complete').order('date', { ascending: false }).limit(5),
      supabase.from('bet_players').select('amount_won_lost, result, bets(round_id, rounds(date))').eq('player_id', player.id),
      supabase.from('round_players').select('handicap_at_round, total_score, rounds(course_par, date)').eq('player_id', player.id).order('created_at', { ascending: false }).limit(10),
    ])

    setActiveRounds(active ?? [])
    setRecentRounds(recent ?? [])

    // Season money
    const year = new Date().getFullYear()
    const seasonBets = (betResults ?? []).filter(br => {
      const d = br.bets?.rounds?.date
      return d && new Date(d).getFullYear() === year
    })
    const netMoney = seasonBets.reduce((sum, br) => sum + (br.amount_won_lost ?? 0), 0)

    // My handicap
    const roundsForHcap = (myRounds ?? []).map(rp => ({
      total_score: rp.total_score ?? 0,
      course_par: rp.rounds?.course_par ?? 72,
    })).filter(r => r.total_score > 0)
    setMyHandicap(calcHandicap(roundsForHcap))

    setMoneyTotals([{ net: netMoney }])
    setLoading(false)
  }

  async function startRound() {
    navigate('/round/new')
  }

  if (loading) return <div className="text-center text-slate-400 mt-20">Loading...</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {player?.name?.split(' ')[0]}!</h1>
          <p className="text-slate-400 text-sm">
            {myHandicap !== null ? `Handicap: ${myHandicap > 0 ? '+' : ''}${myHandicap}` : 'No handicap yet (need 3+ rounds)'}
          </p>
        </div>
        <button onClick={startRound} className="btn-primary text-sm">+ Start Round</button>
      </div>

      {/* Season money */}
      <div className="card">
        <h2 className="text-slate-400 text-xs uppercase tracking-wider mb-3">Your {new Date().getFullYear()} Season</h2>
        <div className="flex gap-6">
          <div>
            <div className={`text-2xl font-bold ${(moneyTotals[0]?.net ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(moneyTotals[0]?.net ?? 0) >= 0 ? '+' : ''}${(moneyTotals[0]?.net ?? 0).toFixed(2)}
            </div>
            <div className="text-slate-400 text-xs">Season Net</div>
          </div>
        </div>
      </div>

      {/* Active Rounds */}
      {activeRounds.length > 0 && (
        <div>
          <h2 className="text-slate-400 text-xs uppercase tracking-wider mb-3">🔴 Live Rounds</h2>
          <div className="space-y-2">
            {activeRounds.map(round => (
              <Link key={round.id} to={`/round/${round.id}`} className="card flex items-center justify-between hover:border-green-600 transition-colors">
                <div>
                  <div className="font-semibold">{round.course_name}</div>
                  <div className="text-slate-400 text-xs">{round.round_players?.map(rp => rp.players?.name?.split(' ')[0]).join(', ')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-red-500/20 text-red-400 border border-red-700 px-2 py-0.5 rounded-full animate-pulse">LIVE</span>
                  <span className="text-slate-400">→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent rounds */}
      {recentRounds.length > 0 && (
        <div>
          <h2 className="text-slate-400 text-xs uppercase tracking-wider mb-3">Recent Rounds</h2>
          <div className="space-y-2">
            {recentRounds.map(round => (
              <Link key={round.id} to={`/round/${round.id}`} className="card flex items-center justify-between hover:border-slate-500 transition-colors">
                <div>
                  <div className="font-semibold">{round.course_name}</div>
                  <div className="text-slate-400 text-xs">{new Date(round.date).toLocaleDateString()}</div>
                </div>
                <span className="text-slate-400">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {activeRounds.length === 0 && recentRounds.length === 0 && (
        <div className="text-center text-slate-500 mt-10">
          <div className="text-4xl mb-3">⛳</div>
          <p>No rounds yet. Start one!</p>
        </div>
      )}
    </div>
  )
}
