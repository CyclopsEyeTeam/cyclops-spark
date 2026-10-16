// Claude's breath, above Spark's line while a turn runs: a small motion for what the turn is doing right now, all on a
// steady beat (never random). Every motion is exactly WIDTH cells, so the word beside it (Gitifying…, Swirling…) always
// starts in the same column, whichever motion is playing and wherever it is in its beat:
//   thinking    sway    a spark slides side to side along a short rail, a trail behind it
//   writing     wave    a crest rolls along a row of beads, left to right, as the words go out
//   a call out  orbit   a half-lit moon turns, a small satellite passing round it: something is away and coming back
//   asking you  blink   the eye, open and watching, blinking now and then: it waits on you
//   compacting  gather  beads drawn in from the edges to the middle, and let go: the conversation folding up
//   otherwise   pulse   a ring fills and empties, and at its fullest a ripple spreads out from it: the breath of waiting
export const WIDTH = 5
const WAVE = ['·', '•', '●', '•', '·']
const ORBIT = ['◐', '◓', '◑', '◒']
const PULSE = ['·', '∘', '○', '◎', '◉', '●', '◉', '◎', '○', '∘']
const GATHER = ['●   ●', '·● ●·', ' ·●· ', '  ●  ', ' ·●· ', '·● ●·']

const centred = (c, left = ' ', right = ' ') => ' ' + left + c + right + ' '

export function motion(kind, t) {
  if (kind === 'sway') { // a triangle wave over the rail, 2 s there and back
    const u = (t / 2) % 1, k = u < 0.5 ? u * 2 : 2 - u * 2
    const head = Math.round(k * (WIDTH - 1)), back = u < 0.5 ? head - 1 : head + 1
    return Array.from({ length: WIDTH }, (_, i) => (i === head ? '●' : i === back ? '·' : ' ')).join('')
  }
  if (kind === 'wave') { const k = Math.floor(t * 6) % WAVE.length; return WAVE.map((_, i) => WAVE[(i + WAVE.length - k) % WAVE.length]).join('') }
  if (kind === 'orbit') { // the moon turns; its satellite is left of it, then behind (hidden), then right, then in front
    const k = Math.floor(t * 4) % ORBIT.length
    return centred(ORBIT[k], k === 0 ? '·' : ' ', k === 2 ? '·' : ' ')
  }
  if (kind === 'blink') { // open for most of a 3 s beat, a quick blink at the end of it
    const u = (t / 3) % 1
    return centred(u < 0.9 ? '◉' : u < 0.95 ? '◡' : '─', u < 0.9 ? '‹' : ' ', u < 0.9 ? '›' : ' ')
  }
  if (kind === 'gather') return GATHER[Math.floor(t * 5) % GATHER.length]
  const k = Math.floor(t * 8) % PULSE.length // pulse
  return k === 5 ? centred(PULSE[k], '∘', '∘') : k === 6 ? '∘ ' + PULSE[k] + ' ∘' : centred(PULSE[k])
}

export function motionFor(f) {
  if (f.mode === 'waiting on you') return 'blink'
  if (f.mode === 'compacting') return 'gather'
  if (f.mode === 'thinking') return 'sway'
  if (f.mode === 'writing') return 'wave'
  if (Array.isArray(f.lanes) && f.lanes.some((l) => l.inflight > 0 && l.family !== 'paint')) return 'orbit'
  return 'pulse'
}
