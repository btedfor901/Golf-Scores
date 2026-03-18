import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { calcHandicap } from '../utils/handicap'

export default function Leaderboard() {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('handicapped')
  const [year] = useState(new Date().getFullYear())

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: playersData } = await supabase.from('players').select('*')
    const { data: roundPlayers } = await supabase.from('round_players')
      .select('*, rounds(course_par, date, status), player_id')
    const { data: betResults } = await supabase.from('bet_players')
      .select('player_id, amount_won_lost, bets(round_id, rounds(date))')

    const enriched = (playersData ?? []).map(p => {
      const myRounds = (roundPlayers ?? []).filter(rp =>
        rp.player_id === p.id &&
        rp.rounds?.status === 'complete' &&
        new Date(rp.rounds?.date).getFullYear() === year
      )
      const roundsWithScore = myRounds.filter(rp => rp.total_score > 0)
      const handicap = calcHandicap(roundsWithScore.map(r => ({ total_score: r.total_score, course_par: r.rounds?.course_par ?? 72 })))
      const avgScore = roundsWithScore.length ? (roundsWithScore.reduce((s, r) => s + r.total_score, 0) / roundsWithScore.length).toFixed(1) : null
      const avgNet = roundsWithScore.length && handicap !== null
        ? ((roundsWithScore.reduce((s, r) => s + r.total_score, 0) / roundsWithScore.length) - handicap).toFixed(1)
        : null
      const money = (betResults ?? [])
        .filter(br => br.player_id === p.id && new Date(br.bets?.rounds?.date).getFullYear() === year)
        .reduce((sum, br) => sum + (br.amount_won_lost ?? 0), 0)
      return { ...p, roundsPlayed: roundsWithScore.length, handicap, avgScore, avgNet, money }
    })

    setPlayers(enriched)
    setLoading(false)
  }

  const sorted = [...players].sort((a, b) => {
    if (tab === 'handicapped') {
      if (a.avgNet === null) return 1
      if (b.avgNet === null) return -1
      return parseFloat(a.avgNet) - parseFloat(b.avgNet)
    }
    if (tab === 'money') {
      return b.money - a.money
    }
    if (a.avgScore === null) return 1
    if (b.avgScore === null) return -1
    return parseFloat(a.avgScore) - parseFloat(b.avgScore)
  })

  if (loading) return <div className="text-center text-slate-400 mt-20">Loading...</div>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{year} Standings</h1>

      <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
        <button onClick={() => setTab('handicapped')} className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'handicapped' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>Handicapped</button>
        <button onClick={() => setTab('raw')} className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'raw' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>Stroke Avg</button>
        <button onClick={() => setTab('money')} className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'money' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>Money</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto] text-xs text-slate-500 px-4 py-2 border-b border-slate-700 gap-2">
          <span>#</span>
          <span>Player</span>
          <span className="text-center">{tab === 'money' ? 'Net $' : tab === 'handicapped' ? 'Net Avg' : 'Avg'}</span>
          <span className="text-center">Rounds</span>
        </div>
        {sorted.map((p, idx) => (
          <div key={p.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center px-4 py-3 gap-2 border-b border-slate-700/50">
            <div className="text-slate-400 text-sm font-mono w-5">{idx + 1}</div>
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-slate-500">HCP: {p.handicap !== null ? p.handicap : 'TBD'}</div>
            </div>
            <div className={`text-center font-bold w-16 ${tab === 'money' ? (p.money >= 0 ? 'text-green-400' : 'text-red-400') : 'text-white'}`}>
              {tab === 'money'
                ? `${p.money >= 0 ? '+' : ''}$${p.money.toFixed(2)}`
                : tab === 'handicapped'
                  ? (p.avgNet ?? '—')
                  : (p.avgScore ?? '—')}
            </div>
            <div className="text-center text-xs text-slate-500 w-10">{p.roundsPlayed}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
