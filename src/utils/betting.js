import { holePoints, calcQuota } from './handicap'

export const BET_TYPES = [
  { value: 'stroke_play', label: 'Stroke Play' },
  { value: 'match_play', label: 'Match Play' },
  { value: 'scramble', label: '2v2 Scramble' },
  { value: 'quota', label: 'Quota' },
]

export function settleBet(bet, betPlayers, holeScores, roundPlayers) {
  // Returns array of { playerId, amountWonLost }
  switch (bet.type) {
    case 'stroke_play': return settleStrokePlay(bet, betPlayers, roundPlayers)
    case 'match_play': return settleMatchPlay(bet, betPlayers, holeScores)
    case 'scramble': return settleScramble(bet, betPlayers, holeScores)
    case 'quota': return settleQuota(bet, betPlayers, holeScores, roundPlayers)
    default: return []
  }
}

function settleStrokePlay(bet, betPlayers, roundPlayers) {
  // Net stroke play - lowest net wins pot
  const scored = betPlayers.map(bp => {
    const rp = roundPlayers.find(r => r.player_id === bp.player_id)
    const gross = rp?.total_score ?? 999
    const net = gross - (rp?.handicap_at_round ?? 0)
    return { ...bp, net }
  }).sort((a, b) => a.net - b.net)

  const winners = scored.filter(s => s.net === scored[0].net)
  const pot = bet.amount * betPlayers.length
  const share = pot / winners.length

  return betPlayers.map(bp => {
    const isWinner = winners.some(w => w.player_id === bp.player_id)
    return {
      player_id: bp.player_id,
      result: isWinner ? 'win' : 'lose',
      amount_won_lost: isWinner ? share - bet.amount : -bet.amount,
    }
  })
}

function settleMatchPlay(bet, betPlayers, holeScores) {
  if (betPlayers.length !== 2) return []
  const [p1, p2] = betPlayers.map(bp => bp.player_id)
  let p1Holes = 0, p2Holes = 0

  for (let h = 1; h <= 18; h++) {
    const s1 = holeScores.find(hs => hs.player_id === p1 && hs.hole_number === h)?.score
    const s2 = holeScores.find(hs => hs.player_id === p2 && hs.hole_number === h)?.score
    if (s1 != null && s2 != null) {
      if (s1 < s2) p1Holes++
      else if (s2 < s1) p2Holes++
    }
  }

  const p1Win = p1Holes > p2Holes
  const push = p1Holes === p2Holes
  return [
    { player_id: p1, result: push ? 'push' : p1Win ? 'win' : 'lose', amount_won_lost: push ? 0 : p1Win ? bet.amount : -bet.amount },
    { player_id: p2, result: push ? 'push' : !p1Win ? 'win' : 'lose', amount_won_lost: push ? 0 : !p1Win ? bet.amount : -bet.amount },
  ]
}

function settleScramble(bet, betPlayers, holeScores) {
  // 2v2 scramble by team
  const teams = {}
  betPlayers.forEach(bp => {
    if (!teams[bp.team]) teams[bp.team] = []
    teams[bp.team].push(bp.player_id)
  })
  const teamKeys = Object.keys(teams)
  if (teamKeys.length !== 2) return []

  const teamScore = (ids) => {
    let total = 0
    for (let h = 1; h <= 18; h++) {
      const scores = ids.map(id => holeScores.find(hs => hs.player_id === id && hs.hole_number === h)?.score).filter(Boolean)
      if (scores.length) total += Math.min(...scores)
    }
    return total
  }

  const s1 = teamScore(teams[teamKeys[0]])
  const s2 = teamScore(teams[teamKeys[1]])
  const winTeam = s1 < s2 ? teamKeys[0] : s2 < s1 ? teamKeys[1] : null

  return betPlayers.map(bp => {
    const onWinTeam = winTeam && teams[winTeam].includes(bp.player_id)
    const push = winTeam === null
    return {
      player_id: bp.player_id,
      result: push ? 'push' : onWinTeam ? 'win' : 'lose',
      amount_won_lost: push ? 0 : onWinTeam ? bet.amount : -bet.amount,
    }
  })
}

function settleQuota(bet, betPlayers, holeScores, roundPlayers) {
  const results = betPlayers.map(bp => {
    const rp = roundPlayers.find(r => r.player_id === bp.player_id)
    const quota = calcQuota(rp?.handicap_at_round ?? 0)
    const scores = holeScores.filter(hs => hs.player_id === bp.player_id)
    const points = scores.reduce((sum, hs) => sum + (hs.score ? holePoints(hs.score, hs.par) : 0), 0)
    return { player_id: bp.player_id, points, quota, beaten: points - quota }
  }).sort((a, b) => b.beaten - a.beaten)

  const pot = bet.amount * betPlayers.length
  const winners = results.filter(r => r.beaten === results[0].beaten)
  const share = pot / winners.length

  return betPlayers.map(bp => {
    const isWinner = winners.some(w => w.player_id === bp.player_id)
    return {
      player_id: bp.player_id,
      result: isWinner ? 'win' : 'lose',
      amount_won_lost: isWinner ? share - bet.amount : -bet.amount,
    }
  })
}
