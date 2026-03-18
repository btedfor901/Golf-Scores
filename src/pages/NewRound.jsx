import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { calcHandicap } from '../utils/handicap'
import toast from 'react-hot-toast'

export default function NewRound() {
  const { player } = useAuth()
  const navigate = useNavigate()
  const [players, setPlayers] = useState([])
  const [selected, setSelected] = useState([])
  const [courseName, setCourseName] = useState('')
  const [coursePar, setCoursePar] = useState(72)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [holePars, setHolePars] = useState(Array(18).fill(4))
  const [showHolePars, setShowHolePars] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('players').select('*').order('name').then(({ data }) => {
      setPlayers(data ?? [])
      // Auto-select self
      if (player) setSelected([player.id])
    })
  }, [player])

  function togglePlayer(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  function updateHolePar(index, val) {
    const updated = [...holePars]
    updated[index] = parseInt(val) || 4
    setHolePars(updated)
    setCoursePar(updated.reduce((a, b) => a + b, 0))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (selected.length < 1) return toast.error('Select at least one player')
    if (!courseName.trim()) return toast.error('Enter course name')
    setLoading(true)

    // Create round
    const { data: round, error } = await supabase.from('rounds').insert({
      course_name: courseName.trim(),
      course_par: holePars.reduce((a, b) => a + b, 0),
      date,
      status: 'in_progress',
      created_by: player.id,
    }).select().single()

    if (error) { toast.error(error.message); setLoading(false); return }

    // Get handicaps for each player
    const handicapPromises = selected.map(async (pid) => {
      const { data: roundData } = await supabase
        .from('round_players')
        .select('handicap_at_round, total_score, rounds(course_par, date)')
        .eq('player_id', pid)
        .order('created_at', { ascending: false })
        .limit(10)
      const hcap = calcHandicap((roundData ?? []).map(r => ({
        total_score: r.total_score ?? 0,
        course_par: r.rounds?.course_par ?? 72,
      })).filter(r => r.total_score > 0))
      return { round_id: round.id, player_id: pid, handicap_at_round: hcap ?? 0 }
    })

    const roundPlayers = await Promise.all(handicapPromises)
    await supabase.from('round_players').insert(roundPlayers)

    // Pre-create hole score rows
    const holeRows = selected.flatMap(pid =>
      Array.from({ length: 18 }, (_, i) => ({
        round_id: round.id,
        player_id: pid,
        hole_number: i + 1,
        par: holePars[i],
        score: null,
      }))
    )
    await supabase.from('hole_scores').insert(holeRows)

    toast.success('Round started!')
    navigate(`/round/${round.id}`)
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Start New Round</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card space-y-4">
          <div>
            <label className="label">Course Name</label>
            <input className="input" placeholder="Augusta National" value={courseName} onChange={e => setCourseName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Date</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Course Par: {holePars.reduce((a, b) => a + b, 0)}</label>
              <button type="button" onClick={() => setShowHolePars(!showHolePars)} className="text-xs text-green-400 underline">
                {showHolePars ? 'Hide' : 'Set per hole'}
              </button>
            </div>
            {!showHolePars && (
              <input className="input" type="number" min="60" max="80" value={coursePar} onChange={e => {
                const v = parseInt(e.target.value) || 72
                setCoursePar(v)
                setHolePars(Array(18).fill(4)) // reset when setting total
              }} />
            )}
            {showHolePars && (
              <div className="grid grid-cols-9 gap-1 mt-2">
                {holePars.map((p, i) => (
                  <div key={i} className="text-center">
                    <div className="text-xs text-slate-500 mb-0.5">{i + 1}</div>
                    <select value={p} onChange={e => updateHolePar(i, e.target.value)} className="bg-slate-700 border border-slate-600 rounded text-white text-xs w-full px-0 py-1 text-center">
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <label className="label">Players</label>
          <div className="space-y-2">
            {players.map(p => (
              <label key={p.id} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={() => togglePlayer(p.id)}
                  className="w-4 h-4 accent-green-500"
                />
                <span>{p.name}</span>
                {p.id === player?.id && <span className="text-xs text-slate-400">(you)</span>}
              </label>
            ))}
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full text-base py-3">
          {loading ? 'Starting...' : 'Start Round ⛳'}
        </button>
      </form>
    </div>
  )
}
