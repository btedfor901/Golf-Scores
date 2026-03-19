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
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [holePars, setHolePars] = useState(Array(18).fill(4))
  const [savedCourses, setSavedCourses] = useState([])
  const [saveCourse, setSaveCourse] = useState(false)
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('players').select('*').order('name'),
      supabase.from('courses').select('*').order('name'),
    ]).then(([{ data: pData }, { data: cData }]) => {
      setPlayers(pData ?? [])
      setSavedCourses(cData ?? [])
      if (player) setSelected([player.id])
    })
  }, [player])

  function selectSavedCourse(course) {
    setCourseName(course.name)
    setHolePars(course.hole_pars)
    setSelectedCourseId(course.id)
    setSaveCourse(false)
  }

  function clearCourse() {
    setCourseName('')
    setHolePars(Array(18).fill(4))
    setSelectedCourseId(null)
    setSaveCourse(false)
  }

  function updateHolePar(index, val) {
    const updated = [...holePars]
    updated[index] = parseInt(val) || 4
    setHolePars(updated)
  }

  function togglePlayer(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  const coursePar = holePars.reduce((a, b) => a + b, 0)

  async function handleSubmit(e) {
    e.preventDefault()
    if (selected.length < 1) return toast.error('Select at least one player')
    if (!courseName.trim()) return toast.error('Enter course name')
    setLoading(true)

    // Save course if requested
    if (saveCourse && !selectedCourseId) {
      const { error: courseError } = await supabase.from('courses').insert({
        name: courseName.trim(),
        hole_pars: holePars,
        created_by: player.id,
      })
      if (courseError && !courseError.message.includes('duplicate')) {
        toast.error('Could not save course: ' + courseError.message)
      }
    }

    // Create round
    const { data: round, error } = await supabase.from('rounds').insert({
      course_name: courseName.trim(),
      course_par: coursePar,
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

        {/* Course Selection */}
        <div className="card space-y-4">
          <div>
            <label className="label">Course Name</label>
            <input
              className="input"
              placeholder="e.g. Augusta National"
              value={courseName}
              onChange={e => { setCourseName(e.target.value); setSelectedCourseId(null) }}
              required
            />
          </div>

          {/* Saved Courses */}
          {savedCourses.length > 0 && (
            <div>
              <label className="label">Saved Courses</label>
              <div className="flex flex-wrap gap-2">
                {savedCourses.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectedCourseId === c.id ? clearCourse() : selectSavedCourse(c)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedCourseId === c.id ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                  >
                    {c.name} (Par {c.hole_pars.reduce((a, b) => a + b, 0)})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="label">Date</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
        </div>

        {/* Hole Pars */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <label className="label mb-0">Hole Pars <span className="text-slate-500 font-normal">(Total: Par {coursePar})</span></label>
          </div>
          <div className="grid grid-cols-9 gap-2">
            {holePars.slice(0, 9).map((p, i) => (
              <div key={i} className="text-center">
                <div className="text-xs text-slate-500 mb-1">{i + 1}</div>
                <select
                  value={p}
                  onChange={e => updateHolePar(i, e.target.value)}
                  className="bg-slate-700 border border-slate-600 rounded text-white text-sm w-full py-1.5 text-center"
                >
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-700 pt-3">
            <div className="text-xs text-slate-500 text-center mb-2">Back 9</div>
            <div className="grid grid-cols-9 gap-2">
              {holePars.slice(9).map((p, i) => (
                <div key={i + 9} className="text-center">
                  <div className="text-xs text-slate-500 mb-1">{i + 10}</div>
                  <select
                    value={p}
                    onChange={e => updateHolePar(i + 9, e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded text-white text-sm w-full py-1.5 text-center"
                  >
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Save course checkbox — only show if not a saved course */}
          {!selectedCourseId && (
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={saveCourse}
                onChange={e => setSaveCourse(e.target.checked)}
                className="w-4 h-4 accent-green-500"
              />
              <span className="text-sm text-slate-300">Save this course for future rounds</span>
            </label>
          )}
        </div>

        {/* Players */}
        <div className="card">
          <label className="label">Players in this Round</label>
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
