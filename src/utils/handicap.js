/**
 * WHS Handicap System
 *
 * Score Differential = (Adjusted Gross Score - Course Rating) x (113 / Slope Rating)
 * Handicap Index     = Average of best 8 of last 20 differentials (rounded to nearest tenth)
 *
 * Sliding scale for fewer than 20 rounds:
 *   3  rounds → best 1  (subtract 2.0)
 *   4  rounds → best 1  (subtract 1.0)
 *   5  rounds → best 1
 *   6  rounds → best 2
 *   7-8 rounds → best 2
 *   9  rounds → best 3
 *   10-11 → best 4
 *   12-14 → best 5
 *   15-16 → best 6
 *   17-18 → best 7
 *   19   → best 8 (subtract 1.0)
 *   20+  → best 8
 */

export function calcDifferential(adjustedScore, courseRating, slopeRating) {
  const slope = slopeRating || 113
  const rating = courseRating || 72
  return parseFloat(((adjustedScore - rating) * (113 / slope)).toFixed(1))
}

export function calcHandicap(rounds) {
  if (!rounds || rounds.length < 3) return null
  const last20 = rounds.slice(-20)
  const n = last20.length

  // Score differentials — use stored differential if available, else fall back to simple calc
  const diffs = last20
    .map(r => r.score_differential ?? calcDifferential(r.total_score, r.course_rating, r.slope_rating))
    .sort((a, b) => a - b)

  let take, adjustment = 0
  if (n >= 20) { take = 8 }
  else if (n === 19) { take = 8; adjustment = -1.0 }
  else if (n >= 17) { take = 7 }
  else if (n >= 15) { take = 6 }
  else if (n >= 12) { take = 5 }
  else if (n >= 10) { take = 4 }
  else if (n === 9) { take = 3 }
  else if (n >= 7) { take = 2 }
  else if (n === 6) { take = 2 }
  else if (n === 5) { take = 1 }
  else if (n === 4) { take = 1; adjustment = -1.0 }
  else { take = 1; adjustment = -2.0 }

  const best = diffs.slice(0, take)
  const avg = best.reduce((a, b) => a + b, 0) / best.length
  return parseFloat((avg + adjustment).toFixed(1))
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
