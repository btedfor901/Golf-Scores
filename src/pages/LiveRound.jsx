import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { scoreClass } from '../utils/handicap'
import { settleBet } from '../utils/betting'
import toast from 'react-hot-toast'

function haversineYards(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.09361)
}

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
  const [gpsPos, setGpsPos] = useState(null)
  const [courseCoords, setCourseCoords] = useState(null)
  const [activeHole, setActiveHole] = useState(1)
  const watchRef = useRef(null)

  const loadAll = useCallback(async () => {
    const [
      { data: roundData },
      { data: rpData },
      { data: hsData },
      { data: playersData },
      { data: betsData },
    ] = await Promise.all([
      supabase.from('rounds').select('*').eq('id', id).single(),
      supabase.from('round_players').select('*').eq('round_id', id),
      supabase.from('hole_scores').select('*').eq('round_id', id),
      supabase.from('players').select('*'),
      supabase.from('bets').select('*').eq('round_id', id),
    ])
    const betIds = (betsData ?? []).map(b => b.id)
    const { data: bpData } = betIds.length > 0
      ? await supabase.from('bet_players').select('*').in('bet_id', betIds)
      : { data: [] }
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
    if (player) setViewingPlayer(player.id)
  }, [loadAll, player])

  // Load course pin coordinates
  useEffect(() => {
    if (!round) return
    supabase.from('courses').select('hole_coordinates').eq('name', round.course_name).maybeSingle()
      .then(({ data }) => { if (data?.hole_coordinates) setCourseCoords(data.hole_coordinates) })
  }, [round])

  // Auto-advance active hole to first unscored hole
  useEffect(() => {
    if (!viewingPlayer || holeScores.length === 0) return
    const myScores = holeScores.filter(hs => hs.player_id === viewingPlayer).sort((a, b) => a.hole_number - b.hole_number)
    const firstUnscored = myScores.find(hs => !hs.score)
    if (firstUnscored) setActiveHole(firstUnscored.hole_number)
  }, [viewingPlayer, holeScores])

  // GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) return
    watchRef.current = navigator.geolocation.watchPosition(
      pos => setGpsPos({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    )
    return () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current) }
  }, [])

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
    // Update local state immediately so UI reflects change right away
    setHoleScores(prev => prev.map(hs => hs.id === existing.id ? { ...hs, score: newScore } : hs))
    const { error } = await supabase.from('hole_scores')
      .update({ score: newScore, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) {
      toast.error('Could not save score: ' + error.message)
      setHoleScores(prev => prev.map(hs => hs.id === existing.id ? { ...hs, score: existing.score } : hs))
    }
  }

  async function clearScore(holeNumber) {
    const targetPlayer = viewingPlayer ?? player.id
    const existing = holeScores.find(hs => hs.player_id === targetPlayer && hs.hole_number === holeNumber)
    if (!existing) return
    setHoleScores(prev => prev.map(hs => hs.id === existing.id ? { ...hs, score: null } : hs))
    await supabase.from('hole_scores').update({ score: null, updated_at: new Date().toISOString() }).eq('id', existing.id)
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

    // Update total scores
    const scoreUpdates = roundPlayers.map(rp => {
      const scores = holeScores.filter(hs => hs.player_id === rp.player_id && hs.score)
      const total = scores.reduce((sum, hs) => sum + hs.score, 0)
      return supabase.from('round_players').update({ total_score: total }).eq('id', rp.id)
    })
    await Promise.all(scoreUpdates)

    // Settle all unsettled bets
    const { data: freshRP } = await supabase.from('round_players').select('*').eq('round_id', id)
    const unsettledBets = bets.filter(b => !b.is_settled)
    for (const bet of unsettledBets) {
      const bp = betPlayers.filter(b => b.bet_id === bet.id)
      const results = settleBet(bet, bp, holeScores, freshRP ?? roundPlayers)
      if (results.length > 0) {
        await Promise.all(results.map(r =>
          supabase.from('bet_players')
            .update({ result: r.result, amount_won_lost: r.amount_won_lost })
            .eq('bet_id', bet.id).eq('player_id', r.player_id)
        ))
        await supabase.from('bets').update({ is_settled: true }).eq('id', bet.id)
      }
    }

    await supabase.from('rounds').update({ status: 'complete' }).eq('id', id)
    toast.success(`Round complete!${unsettledBets.length > 0 ? ' Bets settled.' : ''}`)
    navigate('/')
  }

  async function pressBet(bet) {
    const bp = betPlayers.filter(b => b.bet_id === bet.id)
    const { data: newBet, error } = await supabase.from('bets').insert({
      round_id: id,
      type: bet.type,
      amount: bet.amount,
      description: `Press${bet.description ? ` (${bet.description})` : ''}`,
      details: bet.details,
      created_by: player.id,
    }).select().single()
    if (error) return toast.error('Could not create press')
    await supabase.from('bet_players').insert(
      bp.map(b => ({ bet_id: newBet.id, player_id: b.player_id, team: b.team, result: 'pending', amount_won_lost: 0 }))
    )
    toast.success('Press is on! 🎯')
    loadAll()
  }

  async function concedeBet(bet, loser) {
    // loser = team number (1/2) for team bets, player_id for individual bets
    const bp = betPlayers.filter(b => b.bet_id === bet.id)
    const isTeamBet = bet.type === 'team_stroke_play' || bet.type === 'scramble'
    await Promise.all(bp.map(b => {
      const isLoser = isTeamBet ? String(b.team) === String(loser) : b.player_id === loser
      return supabase.from('bet_players')
        .update({ result: isLoser ? 'lose' : 'win', amount_won_lost: isLoser ? -bet.amount : bet.amount })
        .eq('id', b.id)
    }))
    await supabase.from('bets').update({ is_settled: true }).eq('id', bet.id)
    toast.success('Bet settled!')
    loadAll()
  }

  async function setPin(holeNumber) {
    if (!gpsPos) return toast.error('No GPS signal yet — wait a moment and try again')
    const coords = courseCoords ? [...courseCoords] : Array(18).fill(null)
    coords[holeNumber - 1] = { lat: gpsPos.lat, lng: gpsPos.lng }
    const { error } = await supabase.from('courses').update({ hole_coordinates: coords }).eq('name', round.course_name)
    if (error) return toast.error('Could not save pin')
    setCourseCoords(coords)
    toast.success(`Pin saved for hole ${holeNumber}!`)
  }

  function getDistance(holeNumber) {
    if (!gpsPos || !courseCoords || !courseCoords[holeNumber - 1]) return null
    const pin = courseCoords[holeNumber - 1]
    return haversineYards(gpsPos.lat, gpsPos.lng, pin.lat, pin.lng)
  }

  function getLiveBetStatus(bet, bp) {
    const isTeamBet = bet.type === 'team_stroke_play' || bet.type === 'scramble'
    const holesPlayed = Math.max(...roundPlayerIds.map(pid => getHolesPlayed(pid)), 0)

    if (bet.type === 'match_play' && bp.length === 2) {
      const [p1, p2] = bp.map(b => b.player_id)
      let p1Up = 0
      for (let h = 1; h <= 18; h++) {
        const s1 = holeScores.find(hs => hs.player_id === p1 && hs.hole_number === h)?.score
        const s2 = holeScores.find(hs => hs.player_id === p2 && hs.hole_number === h)?.score
        if (s1 != null && s2 != null) {
          if (s1 < s2) p1Up++
          else if (s2 < s1) p1Up--
        }
      }
      const n1 = getPlayerName(p1).split(' ')[0]
      const n2 = getPlayerName(p2).split(' ')[0]
      if (p1Up === 0) return { label: 'All Square', sub: `Thru ${holesPlayed}`, color: 'text-slate-300' }
      const leader = p1Up > 0 ? n1 : n2
      const diff = Math.abs(p1Up)
      const remaining = 18 - holesPlayed
      const status = diff > remaining ? `${leader} wins ${diff}&${remaining}` : `${leader} ${diff} UP`
      return { label: status, sub: `Thru ${holesPlayed}`, color: 'text-green-400' }
    }

    if (isTeamBet) {
      const teams = {}
      bp.forEach(b => { const t = b.team ?? 1; if (!teams[t]) teams[t] = []; teams[t].push(b.player_id) })
      const teamKeys = Object.keys(teams)
      if (teamKeys.length !== 2) return null

      const teamScore = (ids) => ids.reduce((sum, pid) => sum + getTotal(pid), 0)
      const details = bet.details ?? {}
      const givingTeam = String(details.givingTeam ?? teamKeys[0])
      const strokes = parseInt(details.strokes ?? 0)
      const receivingTeam = teamKeys.find(t => t !== givingTeam) ?? teamKeys[1]

      const scores = {}
      teamKeys.forEach(t => { scores[t] = teamScore(teams[t]) })
      const t1Raw = scores[teamKeys[0]], t2Raw = scores[teamKeys[1]]
      scores[receivingTeam] -= strokes

      const t1Net = scores[teamKeys[0]], t2Net = scores[teamKeys[1]]
      const t1Names = teams[teamKeys[0]].map(pid => getPlayerName(pid).split(' ')[0]).join(' & ')
      const t2Names = teams[teamKeys[1]].map(pid => getPlayerName(pid).split(' ')[0]).join(' & ')

      const diff = t1Net - t2Net
      const leader = diff < 0 ? `T1 (${t1Names})` : diff > 0 ? `T2 (${t2Names})` : null
      const statusLabel = diff === 0 ? 'All Square' : `${leader} leads by ${Math.abs(diff)}`
      const scoreStr = strokes > 0
        ? `T1: ${t1Raw || '--'}  T2: ${t2Raw || '--'}  (${strokes} stroke give)`
        : `T1: ${t1Raw || '--'}  T2: ${t2Raw || '--'}`

      return { label: statusLabel, sub: scoreStr, color: diff === 0 ? 'text-slate-300' : 'text-green-400' }
    }

    if (bet.type === 'stroke_play') {
      const ranked = bp.map(b => {
        const rp = roundPlayers.find(r => r.player_id === b.player_id)
        const gross = getTotal(b.player_id)
        const net = gross - (rp?.handicap_at_round ?? 0)
        return { name: getPlayerName(b.player_id).split(' ')[0], gross, net }
      }).filter(r => r.gross > 0).sort((a, b) => a.net - b.net)
      if (ranked.length === 0) return { label: 'No scores yet', sub: '', color: 'text-slate-500' }
      return { label: `${ranked[0].name} leads`, sub: ranked.map(r => `${r.name}: ${r.net}`).join('  '), color: 'text-green-400' }
    }

    return null
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

          {/* GPS Banner */}
          {round.status === 'in_progress' && (
            <div className="card p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-lg">📍</span>
                <div className="min-w-0">
                  <div className="text-xs text-slate-400">Hole {activeHole} · {gpsPos ? `±${gpsPos.accuracy}m` : 'Getting GPS...'}</div>
                  <div className="font-bold text-white text-lg leading-tight">
                    {getDistance(activeHole) !== null ? `${getDistance(activeHole)} yds` : courseCoords?.[activeHole - 1] ? '---' : 'No pin set'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setPin(activeHole)}
                className="flex-shrink-0 text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded-lg font-medium"
              >
                Set Pin
              </button>
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
              const dist = getDistance(holeNum)

              return (
                <div
                  key={holeNum}
                  onClick={() => setActiveHole(holeNum)}
                  className={`grid grid-cols-[auto_1fr_auto] items-center px-4 py-3 border-b border-slate-700/50 cursor-pointer transition-colors
                    ${activeHole === holeNum ? 'bg-green-900/20 border-l-2 border-l-green-500' : ''}
                    ${i === 8 ? 'border-b-2 border-slate-500' : ''}`}
                >
                  <div className="w-8 font-mono text-sm text-slate-400">{holeNum}</div>
                  <div className="text-center text-sm text-slate-300">
                    <div>Par {par}</div>
                    {dist !== null && <div className="text-xs text-green-400">{dist}y</div>}
                  </div>
                  <div className="w-28 flex items-center justify-end gap-2">
                    {isMyHole ? (
                      <>
                        <button onClick={() => updateScore(holeNum, -1)} className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center text-lg font-bold hover:bg-slate-600">−</button>
                        <div className={`w-8 h-8 flex items-center justify-center font-bold text-sm ${score ? scoreClass(score, par) : 'text-slate-500'}`}>
                          {score ?? par}
                        </div>
                        <button onClick={() => updateScore(holeNum, 1)} className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center text-lg font-bold hover:bg-slate-600">+</button>
                        {score && (
                          <button onClick={() => clearScore(holeNum)} className="w-5 h-5 rounded-full bg-red-900/50 text-red-400 flex items-center justify-center text-xs hover:bg-red-900/80">✕</button>
                        )}
                      </>
                    ) : (
                      <div className={`w-8 h-8 flex items-center justify-center font-bold text-sm ${score ? scoreClass(score, par) : 'text-slate-500'}`}>
                        {score ?? par}
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
                  <div className="flex flex-wrap gap-2 mb-2">
                    {bp.map(b => (
                      <span key={b.id} className={`text-xs px-2 py-0.5 rounded-full ${b.result === 'win' ? 'bg-green-700/40 text-green-300' : b.result === 'lose' ? 'bg-red-700/40 text-red-300' : 'bg-slate-700 text-slate-400'}`}>
                        {getPlayerName(b.player_id).split(' ')[0]} {b.team ? `(T${b.team})` : ''}
                      </span>
                    ))}
                  </div>

                  {/* Live bet status */}
                  {!bet.is_settled && (() => {
                    const status = getLiveBetStatus(bet, bp)
                    if (!status) return null
                    return (
                      <div className="bg-slate-700/50 rounded-lg px-3 py-2 mt-1">
                        <div className={`font-bold text-sm ${status.color}`}>{status.label}</div>
                        {status.sub && <div className="text-xs text-slate-400 mt-0.5">{status.sub}</div>}
                      </div>
                    )
                  })()}
                  {/* Settled results */}
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

                  {/* Press & Concede buttons for active bets */}
                  {!bet.is_settled && round.status === 'in_progress' && (
                    <div className="mt-3 pt-2 border-t border-slate-700 flex flex-wrap gap-2">
                      <button onClick={() => pressBet(bet)} className="text-xs bg-yellow-700/40 text-yellow-300 border border-yellow-700/50 px-3 py-1.5 rounded-lg font-medium">
                        🎯 Press
                      </button>
                      {(bet.type === 'team_stroke_play' || bet.type === 'scramble') ? (
                        <>
                          <button onClick={() => concedeBet(bet, 1)} className="text-xs bg-red-900/40 text-red-300 border border-red-800/50 px-3 py-1.5 rounded-lg">
                            Team 1 Concede
                          </button>
                          <button onClick={() => concedeBet(bet, 2)} className="text-xs bg-red-900/40 text-red-300 border border-red-800/50 px-3 py-1.5 rounded-lg">
                            Team 2 Concede
                          </button>
                        </>
                      ) : (
                        bp.map(b => (
                          <button key={b.player_id} onClick={() => concedeBet(bet, b.player_id)} className="text-xs bg-red-900/40 text-red-300 border border-red-800/50 px-3 py-1.5 rounded-lg">
                            {getPlayerName(b.player_id).split(' ')[0]} Concede
                          </button>
                        ))
                      )}
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
