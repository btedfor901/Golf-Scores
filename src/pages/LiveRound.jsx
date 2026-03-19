import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { scoreClass } from '../utils/handicap'
import toast from 'react-hot-toast'

export default function LiveRound() {
  const { id } = useParams()
  const { player } = useAuth()
  const navigate = useNavigate()
  const [round, setRound] = useState(null)
  const [roundPlayers, setRoundPlayers] = useState([])
  const [holeScores, setHoleScores] = useState([])
  const [players, setPlayers] = useState([])
  const [bets, setBets] = useState([])
  const [betPlayers, setBetPlayers] = useState([])
  const [tab, setTab] = useState('scorecard')
  const [viewingPlayer, setViewingPlayer] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    const [
      { data: roundData },
      { data: rpData },
      { data: hsData },
      { data: playersData },
      { data: betsData },
      { data: bpData },
    ] = await Promise.all([
      supabase.from('rounds').select('*').eq('id', id).single(),
      supabase.from('round_players').select('*').eq('round_id', id),
      supabase.from('hole_scores').select('*').eq('round_id', id),
      supabase.from('players').select('*'),
      supabase.from('bets').select('*').eq('round_id', id),
      supabase.from('bet_players').select('*, bets!inner(round_id)').eq('bets.round_id', id),
    ])
    setRound(roundData)
    setRoundPlayers(rpData ?? [])
    setHoleScores(hsData ?? [])
    setPlayers(playersData ?? [])
    setBets(betsData ?? [])
    setBetPlayers(bpData ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    loadAll()
    // Default to viewing own scores
    if (player) setViewingPlayer(player.id)
  }, [loadAll, player])

  useEffect(() => {
    const sub = supabase
      .channel(`round-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hole_scores', filter: `round_id=eq.${id}` }, loadAll)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [id, loadAll])

  async function updateScore(holeNumber, delta) {
    if (!player) return
    const targetPlayer = viewingPlayer ?? player.id
    const existing = holeScores.find(hs => hs.player_id === targetPlayer && hs.hole_number === holeNumber)
    if (!existing) {
      toast.error('Hole record not found — delete and restart this round')
      return
    }
    const currentScore = existing.score ?? existing.par
    const newScore = Math.max(1, currentScore + delta)
    const { error } = await supabase.from('hole_scores')
      .update({ score: newScore, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) toast.error('Could not save score: ' + error.message)
  }

  async function cancelRound() {
    if (!confirm('Delete this round permanently? This cannot be undone.')) return
    await supabase.from('hole_scores').delete().eq('round_id', id)
    await supabase.from('round_players').delete().eq('round_id', id)
    await supabase.from('rounds').delete().eq('id', id)
    toast.success('Round deleted')
    navigate('/')
  }

  async function completeRound() {
    if (!confirm('Mark this round as complete?')) return
    // Update total scores in round_players
    const updates = roundPlayers.map(rp => {
      const scores = holeScores.filter(hs => hs.player_id === rp.player_id && hs.score)
      const total = scores.reduce((sum, hs) => sum + hs.score, 0)
      return supabase.from('round_players').update({ total_score: total }).eq('id', rp.id)
    })
    await Promise.all(updates)
    await supabase.from('rounds').update({ status: 'complete' }).eq('id', id)
    toast.success('Round completed!')
    navigate('/')
  }

  const getPlayerScores = (playerId) => holeScores.filter(hs => hs.player_id === playerId).sort((a, b) => a.hole_number - b.hole_number)
  const getTotal = (playerId) => {
    const scores = getPlayerScores(playerId).filter(hs => hs.score)
    return scores.reduce((sum, hs) => sum + hs.score, 0)
  }
  const getVsPar = (playerId) => {
    const scores = getPlayerScores(playerId).filter(hs => hs.score)
    return scores.reduce((sum, hs) => sum + hs.score - hs.par, 0)
  }
  const getHandicap = (playerId) => roundPlayers.find(rp => rp.player_id === playerId)?.handicap_at_round ?? 0
  const getPlayerName = (playerId) => players.find(p => p.id === playerId)?.name ?? 'Unknown'
  const getHolesPlayed = (playerId) => getPlayerScores(playerId).filter(hs => hs.score).length

  const roundPlayerIds = roundPlayers.map(rp => rp.player_id)

  if (loading) return <div className="text-center text-slate-400 mt-20">Loading round...</div>
  if (!round) return <div className="text-center text-slate-400 mt-20">Round not found</div>

  const isParticipant = roundPlayerIds.includes(player?.id)
  const canAdmin = player?.is_commissioner || round.created_by === player?.id

  // Leaderboard data
  const leaderboard = roundPlayerIds.map(pid => {
    const gross = getTotal(pid)
    const hcap = getHandicap(pid)
    const vsPar = getVsPar(pid)
    return { pid, gross, hcap, vsPar, holesPlayed: getHolesPlayed(pid) }
  }).sort((a, b) => {
    if (a.gross === 0) return 1
    if (b.gross === 0) return -1
    return (a.vsPar - a.hcap) - (b.vsPar - b.hcap)
  })

  return (
    <div className="space-y-4">
      {/* Round header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{round.course_name}</h1>
          <p className="text-slate-400 text-sm">Par {round.course_par} · {new Date(round.date).toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-2">
          {round.status === 'in_progress' && (
            <span className="text-xs bg-red-500/20 text-red-400 border border-red-700 px-2 py-0.5 rounded-full animate-pulse">LIVE</span>
          )}
          {canAdmin && round.status === 'in_progress' && (
            <div className="flex gap-2">
              <button onClick={completeRound} className="btn-secondary text-xs py-1 px-2">Finish</button>
              <button onClick={cancelRound} className="text-xs py-1 px-2 rounded bg-red-900/40 text-red-400 border border-red-800 hover:bg-red-900/60">Delete</button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
        {['scorecard', 'leaderboard', 'bets'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>
            {t === 'scorecard' ? '📋 Card' : t === 'leaderboard' ? '🏆 Board' : '💰 Bets'}
          </button>
        ))}
      </div>

      {/* SCORECARD TAB */}
      {tab === 'scorecard' && (
        <div className="space-y-4">
          {/* Player selector */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {roundPlayerIds.map(pid => (
              <button
                key={pid}
                onClick={() => setViewingPlayer(pid)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${viewingPlayer === pid ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                {getPlayerName(pid).split(' ')[0]}
                {pid === player?.id && ' (me)'}
              </button>
            ))}
          </div>

          {/* Score summary for viewed player */}
          {viewingPlayer && (
            <div className="card flex justify-between items-center">
              <div>
                <div className="font-semibold">{getPlayerName(viewingPlayer)}</div>
                <div className="text-slate-400 text-xs">Handicap: {getHandicap(viewingPlayer)}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">{getTotal(viewingPlayer) || '--'}</div>
                <div className={`text-sm font-medium ${getVsPar(viewingPlayer) > 0 ? 'text-red-400' : getVsPar(viewingPlayer) < 0 ? 'text-yellow-400' : 'text-slate-400'}`}>
                  {getTotal(viewingPlayer) > 0 ? (getVsPar(viewingPlayer) > 0 ? `+${getVsPar(viewingPlayer)}` : getVsPar(viewingPlayer) === 0 ? 'E' : getVsPar(viewingPlayer)) : '--'} · {getHolesPlayed(viewingPlayer)}/18 holes
                </div>
              </div>
            </div>
          )}

          {/* Hole-by-hole */}
          <div className="card overflow-hidden p-0">
            <div className="grid grid-cols-[auto_1fr_auto] text-xs text-slate-500 px-4 py-2 border-b border-slate-700">
              <span className="w-8">Hole</span>
              <span className="text-center">Par</span>
              <span className="w-28 text-right">Score</span>
            </div>
            {Array.from({ length: 18 }, (_, i) => {
              const holeNum = i + 1
              const hsForViewed = holeScores.find(hs => hs.player_id === viewingPlayer && hs.hole_number === holeNum)
              const par = hsForViewed?.par ?? 4
              const score = hsForViewed?.score
              const isMyHole = (isParticipant || canAdmin) && round.status === 'in_progress'

              return (
                <div key={holeNum} className={`grid grid-cols-[auto_1fr_auto] items-center px-4 py-3 border-b border-slate-700/50 ${i === 8 ? 'border-b-2 border-slate-500' : ''}`}>
                  <div className="w-8 font-mono text-sm text-slate-400">{holeNum}</div>
                  <div className="text-center text-sm text-slate-300">Par {par}</div>
                  <div className="w-28 flex items-center justify-end gap-2">
                    {isMyHole ? (
                      <>
                        <button onClick={() => updateScore(holeNum, -1)} className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center text-lg font-bold hover:bg-slate-600">−</button>
                        <div className={`w-8 h-8 flex items-center justify-center font-bold text-sm ${score ? scoreClass(score, par) : 'text-slate-600'}`}>
                          {score ?? '·'}
                        </div>
                        <button onClick={() => updateScore(holeNum, 1)} className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center text-lg font-bold hover:bg-slate-600">+</button>
                      </>
                    ) : (
                      <div className={`w-8 h-8 flex items-center justify-center font-bold text-sm ${score ? scoreClass(score, par) : 'text-slate-600'}`}>
                        {score ?? '·'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {/* Totals row */}
            <div className="grid grid-cols-[auto_1fr_auto] items-center px-4 py-3 bg-slate-700/30">
              <div className="w-8 text-xs text-slate-400">Total</div>
              <div className="text-center text-sm text-slate-300">{round.course_par}</div>
              <div className="w-28 flex items-center justify-end">
                <div className="font-bold text-white">{getTotal(viewingPlayer) || '--'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LEADERBOARD TAB */}
      {tab === 'leaderboard' && (
        <div className="space-y-3">
          <div className="card p-0 overflow-hidden">
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] text-xs text-slate-500 px-4 py-2 border-b border-slate-700 gap-2">
              <span>#</span>
              <span>Player</span>
              <span className="text-center">Net</span>
              <span className="text-center">Gross</span>
              <span className="text-center">Thru</span>
            </div>
            {leaderboard.map((entry, idx) => {
              const netVsPar = entry.gross > 0 ? entry.vsPar - entry.hcap : null
              return (
                <div key={entry.pid} className={`grid grid-cols-[auto_1fr_auto_auto_auto] items-center px-4 py-3 gap-2 border-b border-slate-700/50 ${entry.pid === player?.id ? 'bg-green-900/20' : ''}`}>
                  <div className="text-slate-400 text-sm font-mono w-5">{idx + 1}</div>
                  <div>
                    <div className="font-medium text-sm">{getPlayerName(entry.pid)}</div>
                    <div className="text-xs text-slate-500">HCP {entry.hcap}</div>
                  </div>
                  <div className={`text-center font-bold text-sm w-10 ${netVsPar !== null && netVsPar > 0 ? 'text-red-400' : netVsPar !== null && netVsPar < 0 ? 'text-yellow-400' : 'text-slate-400'}`}>
                    {netVsPar !== null ? (netVsPar > 0 ? `+${netVsPar.toFixed(0)}` : netVsPar === 0 ? 'E' : netVsPar.toFixed(0)) : '--'}
                  </div>
                  <div className="text-center text-sm text-slate-400 w-10">
                    {entry.gross > 0 ? (entry.vsPar > 0 ? `+${entry.vsPar}` : entry.vsPar === 0 ? 'E' : entry.vsPar) : '--'}
                  </div>
                  <div className="text-center text-xs text-slate-500 w-8">{entry.holesPlayed}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* BETS TAB */}
      {tab === 'bets' && (
        <div className="space-y-3">
          {round.status === 'in_progress' && isParticipant && (
            <Link to={`/betting/${id}`} className="btn-primary w-full text-center block py-2">+ Add Bet</Link>
          )}
          {bets.length === 0 ? (
            <div className="text-center text-slate-500 py-8">No bets yet for this round.</div>
          ) : (
            bets.map(bet => {
              const bp = betPlayers.filter(b => b.bet_id === bet.id)
              return (
                <div key={bet.id} className="card">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold capitalize">{bet.type.replace('_', ' ')}</div>
                      {bet.description && <div className="text-slate-400 text-xs">{bet.description}</div>}
                    </div>
                    <div className="text-green-400 font-bold">${bet.amount}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {bp.map(b => (
                      <span key={b.id} className={`text-xs px-2 py-0.5 rounded-full ${b.result === 'win' ? 'bg-green-700/40 text-green-300' : b.result === 'lose' ? 'bg-red-700/40 text-red-300' : 'bg-slate-700 text-slate-400'}`}>
                        {getPlayerName(b.player_id).split(' ')[0]} {b.team ? `(T${b.team})` : ''}
                      </span>
                    ))}
                  </div>
                  {bet.is_settled && (
                    <div className="mt-2 pt-2 border-t border-slate-700 space-y-1">
                      {bp.map(b => (
                        <div key={b.id} className="flex justify-between text-sm">
                          <span className="text-slate-300">{getPlayerName(b.player_id).split(' ')[0]}</span>
                          <span className={b.amount_won_lost >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {b.amount_won_lost >= 0 ? '+' : ''}${b.amount_won_lost?.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
