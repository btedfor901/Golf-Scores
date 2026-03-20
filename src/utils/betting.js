import { holePoints, calcQuota } from './handicap'

export const BET_TYPES = [
  { value: 'stroke_play', label: 'Stroke Play' },
  { value: 'match_play', label: 'Match Play' },
  { value: 'team_stroke_play', label: '2v2 Stroke Play' },
  { value: 'scramble', label: '2v2 Scramble' },
  { value: 'quota', label: 'Quota' },
]

export function settleBet(bet, betPlayers, holeScores, roundPlayers) {
  const fromHole = bet.press_from_hole ?? 1
  const relevantHoles = holeScores.filter(hs => hs.hole_number >= fromHole)
  switch (bet.type) {
    case 'stroke_play': return settleStrokePlay(bet, betPlayers, relevantHoles)
    case 'match_play': return settleMatchPlay(bet, betPlayers, relevantHoles)
    case 'team_stroke_play': return settleTeamStrokePlay(bet, betPlayers, relevantHoles)
    case 'scramble': return settleScramble(bet, betPlayers, relevantHoles)
    case 'quota': return settleQuota(bet, betPlayers, relevantHoles, roundPlayers)
    default: return []
  }
}

function settleStrokePlay(bet, betPlayers, holeScores) {
  // Net stroke play - lowest gross score wins (uses hole scores for press support)
  const scored = betPlayers.map(bp => {
    const gross = holeScores.filter(hs => hs.player_id === bp.player_id && hs.score).reduce((s, hs) => s + hs.score, 0) || 999
    return { ...bp, net: gross }
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

function settleTeamStrokePlay(bet, betPlayers, holeScores) {
  // Group by team
  const teams = {}
  betPlayers.forEach(bp => {
    const t = bp.team ?? 1
    if (!teams[t]) teams[t] = []
    teams[t].push(bp.player_id)
  })
  const teamKeys = Object.keys(teams)
  if (teamKeys.length !== 2) return []

  // Combined gross score per team using hole scores (supports press)
  const teamGross = (ids) => ids.reduce((sum, id) => {
    return sum + holeScores.filter(hs => hs.player_id === id && hs.score).reduce((s, hs) => s + hs.score, 0)
  }, 0)

  // Strokes: details = { givingTeam: '1', strokes: 4 }
  const details = bet.details ?? {}
  const givingTeam = String(details.givingTeam ?? teamKeys[0])
  const strokes = parseInt(details.strokes ?? 0)
  const receivingTeam = teamKeys.find(t => t !== givingTeam) ?? teamKeys[1]

  const scores = {}
  teamKeys.forEach(t => { scores[t] = teamGross(teams[t]) })
  scores[receivingTeam] -= strokes  // apply strokes to receiving team

  const winTeam = scores[teamKeys[0]] < scores[teamKeys[1]] ? teamKeys[0]
    : scores[teamKeys[1]] < scores[teamKeys[0]] ? teamKeys[1] : null

  return betPlayers.map(bp => {
    const t = String(bp.team ?? 1)
    const onWinTeam = winTeam && t === winTeam
    const push = winTeam === null
    return {
      player_id: bp.player_id,
      result: push ? 'push' : onWinTeam ? 'win' : 'lose',
      amount_won_lost: push ? 0 : onWinTeam ? bet.amount : -bet.amount,
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
