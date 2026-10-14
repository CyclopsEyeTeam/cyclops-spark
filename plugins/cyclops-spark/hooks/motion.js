// Claude's breath, above Spark's line while a turn runs: four small motions, one for what the turn is doing right now,
// all on a steady beat (never random):
//   thinking    sway    a spark slides side to side along a short rail, slowly, a trail behind it
//   writing     wave    a crest rolls along a row of beads, left to right, as the words go out
//   a call out  orbit   a half-lit moon turns: something is away and coming back
//   otherwise   pulse   a ring fills and empties, the breath of waiting
const RAIL = 7
const WAVE = ['·', '•', '●', '•', '·']
const ORBIT = ['◐', '◓', '◑', '◒']
const PULSE = ['·', '∘', '○', '◎', '◉', '●', '◉', '◎', '○', '∘']

export function motion(kind, t) {
  if (kind === 'sway') { // a triangle wave over the rail, 2.4 s there and back
    const u = (t / 2.4) % 1, k = u < 0.5 ? u * 2 : 2 - u * 2
    const head = Math.round(k * (RAIL - 1)), back = u < 0.5 ? head - 1 : head + 1
    return Array.from({ length: RAIL }, (_, i) => (i === head ? '●' : i === back ? '·' : ' ')).join('')
  }
  if (kind === 'wave') { const k = Math.floor(t * 6) % WAVE.length; return WAVE.map((_, i) => WAVE[(i + WAVE.length - k) % WAVE.length]).join('') }
  if (kind === 'orbit') return ORBIT[Math.floor(t * 4) % ORBIT.length]
  return PULSE[Math.floor(t * 8) % PULSE.length]
}

export function motionFor(f) {
  if (f.mode === 'thinking') return 'sway'
  if (f.mode === 'writing') return 'wave'
  if (Array.isArray(f.lanes) && f.lanes.some((l) => l.inflight > 0 && l.family !== 'paint')) return 'orbit'
  return 'pulse'
}
