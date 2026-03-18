/**
 * Simple custom handicap system:
 * Differential = Score - Course Par
 * Handicap = average of best N differentials from last 10 rounds
 *   3 rounds  → best 1
 *   4-6 rounds → best 2
 *   7-8 rounds → best 3
 *   9 rounds   → best 4
 *   10+ rounds → best 5
 */

export function calcHandicap(rounds) {
  if (!rounds || rounds.length < 3) return null
  const last10 = rounds.slice(-10)
  const diffs = last10
    .map(r => r.total_score - r.course_par)
    .sort((a, b) => a - b)

  let take = 1
  if (last10.length >= 10) take = 5
  else if (last10.length >= 9) take = 4
  else if (last10.length >= 7) take = 3
  else if (last10.length >= 4) take = 2
  else take = 1

  const best = diffs.slice(0, take)
  return parseFloat((best.reduce((a, b) => a + b, 0) / best.length).toFixed(1))
}

/**
 * Quota points per hole:
 * Double eagle (2) = 5, Eagle (-1) = 4, Birdie = 3, Par = 2, Bogey = 1, Double+ = 0
 */
export function holePoints(score, par) {
  const diff = score - par
  if (diff <= -3) return 5
  if (diff === -2) return 4 // eagle
  if (diff === -1) return 3 // birdie
  if (diff === 0) return 2  // par
  if (diff === 1) return 1  // bogey
  return 0
}

export function calcQuota(handicap) {
  return Math.round(36 - (handicap ?? 0))
}

export function scoreClass(score, par) {
  const diff = score - par
  if (diff <= -2) return 'score-eagle'
  if (diff === -1) return 'score-birdie'
  if (diff === 0) return 'score-par'
  if (diff === 1) return 'score-bogey'
  return 'score-double'
}
