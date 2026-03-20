import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { BET_TYPES } from '../utils/betting'
import toast from 'react-hot-toast'

export default function Betting() {
  const { roundId } = useParams()
  const { player } = useAuth()
  const navigate = useNavigate()
  const [round, setRound] = useState(null)
  const [roundPlayers, setRoundPlayers] = useState([])
  const [players, setPlayers] = useState([])
  const [betType, setBetType] = useState('stroke_play')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [selectedPlayers, setSelectedPlayers] = useState([])
  const [teams, setTeams] = useState({})
  const [strokesGivingTeam, setStrokesGivingTeam] = useState(1)
  const [strokesAmount, setStrokesAmount] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('rounds').select('*').eq('id', roundId).single(),
      supabase.from('round_players').select('*, players(name)').eq('round_id', roundId),
      supabase.from('players').select('*'),
    ]).then(([{ data: r }, { data: rp }, { data: p }]) => {
      setRound(r)
      setRoundPlayers(rp ?? [])
      setPlayers(p ?? [])
    })
  }, [roundId])

  function togglePlayer(pid) {
    setSelectedPlayers(prev => prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid])
  }

  function setTeam(pid, team) {
    setTeams(prev => ({ ...prev, [pid]: team }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!amount || parseFloat(amount) <= 0) return toast.error('Enter a valid amount')
    if (selectedPlayers.length < 2) return toast.error('Select at least 2 players')
    setLoading(true)

    const details = betType === 'team_stroke_play'
      ? { givingTeam: strokesGivingTeam, strokes: parseInt(strokesAmount) || 0 }
      : null

    const { data: bet, error } = await supabase.from('bets').insert({
      round_id: roundId,
      type: betType,
      amount: parseFloat(amount),
      description: description.trim() || null,
      details,
      created_by: player.id,
    }).select().single()

    if (error) { toast.error(error.message); setLoading(false); return }

    const useTeams = betType === 'scramble' || betType === 'team_stroke_play'
    await supabase.from('bet_players').insert(
      selectedPlayers.map(pid => ({
        bet_id: bet.id,
        player_id: pid,
        team: useTeams ? (teams[pid] ?? 1) : null,
        result: 'pending',
        amount_won_lost: 0,
      }))
    )

    toast.success('Bet created!')
    navigate(`/round/${roundId}`)
    setLoading(false)
  }

  const getPlayerName = pid => players.find(p => p.id === pid)?.name ?? 'Unknown'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Add Bet</h1>
      {round && <p className="text-slate-400 text-sm">{round.course_name} · {new Date(round.date).toLocaleDateString()}</p>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card space-y-4">
          <div>
            <label className="label">Bet Type</label>
            <div className="grid grid-cols-2 gap-2">
              {BET_TYPES.map(bt => (
                <button key={bt.value} type="button" onClick={() => setBetType(bt.value)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${betType === bt.value ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-slate-600 text-slate-400'}`}>
                  {bt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Amount per player ($)</label>
            <input className="input" type="number" min="0.01" step="0.01" placeholder="10.00" value={amount} onChange={e => setAmount(e.target.value)} required />
          </div>

          <div>
            <label className="label">Notes (optional)</label>
            <input className="input" placeholder="e.g. Nassau front 9" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>

        <div className="card">
          <label className="label">Players in this bet</label>
          <div className="space-y-3">
            {roundPlayers.map(rp => (
              <div key={rp.player_id} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedPlayers.includes(rp.player_id)}
                  onChange={() => togglePlayer(rp.player_id)}
                  className="w-4 h-4 accent-green-500"
                />
                <span className="flex-1 text-sm">{rp.players?.name}</span>
                {(betType === 'scramble' || betType === 'team_stroke_play') && selectedPlayers.includes(rp.player_id) && (
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setTeam(rp.player_id, 1)} className={`px-2 py-0.5 text-xs rounded ${(teams[rp.player_id] ?? 1) === 1 ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>T1</button>
                    <button type="button" onClick={() => setTeam(rp.player_id, 2)} className={`px-2 py-0.5 text-xs rounded ${teams[rp.player_id] === 2 ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'}`}>T2</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {betType === 'team_stroke_play' && (
          <div className="card space-y-4">
            <label className="label">Strokes Given</label>
            <div className="flex items-center gap-3">
              <select className="input flex-1" value={strokesGivingTeam} onChange={e => setStrokesGivingTeam(Number(e.target.value))}>
                <option value={1}>Team 1 gives strokes</option>
                <option value={2}>Team 2 gives strokes</option>
              </select>
              <input className="input w-24" type="number" min="1" max="36" placeholder="# strokes" value={strokesAmount} onChange={e => setStrokesAmount(e.target.value)} required />
            </div>
            <p className="text-xs text-slate-400">
              Team {strokesGivingTeam === 1 ? 2 : 1} receives {strokesAmount || '?'} strokes — their combined score is reduced by that amount.
            </p>
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full py-3">
          {loading ? 'Creating...' : 'Create Bet 💰'}
        </button>
      </form>
    </div>
  )
}
