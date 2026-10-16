// THE ROLL'S MUSIC: an instrumental of the paintings themselves, no words and no tokens. Nothing is borrowed: the score
// is read from the paintings, and link/spark_roll.py plays it with a few small instruments of its own.
//
// The key is the session's colour: the hue of all its paintings together picks the root (round the circle of fifths,
// so neighbouring colours are neighbouring keys), and their warmth and light pick the mode (warm and bright: major;
// cool or dark: dorian; dark and cool: aeolian). Each painting is a chord of that key, chosen by its own colour (a
// warmer, lighter painting a brighter degree), held as a soft pad under it from the moment it starts to be laid down,
// with its root in the bass. As its marks are laid down, they sound: a dot, ring or arc a bell; a line or curve a
// plucked string; a spray a few high sparkles; a glow a slow swell. The note is the mark's height on the canvas (higher
// is higher), its place left or right is where it sits in the stereo, its strength its light. So the music moves when
// the picture moves, and holds when it holds.

const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
}
const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5] // pitch classes round the circle of fifths, from C
const VOICE = { dot: 'bell', ring: 'bell', arc: 'bell', line: 'pluck', curve: 'pluck', spray: 'sparkle', glow: 'swell' }

const rgbOf = (c) => Array.isArray(c) ? c : [0.5, 0.5, 0.5]
function hsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  if (d < 1e-6) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}
// A painting's colour as the eye takes it in: each mark's colour, weighted by its light and by how much of the canvas it
// covers (a fill or a glow more than a speck). Hue as a direction (so red and magenta average to red, not green),
// how coloured, how light, how warm (-1 cool .. 1 warm)
export function colourOf(p) {
  let x = 0, y = 0, s = 0, l = 0, w = 0, warm = 0
  for (const m of p.marks) {
    const size = m.k === 'fill' ? 4 : m.k === 'glow' ? 2 + 6 * (m.r || 0) : m.k === 'spray' ? 0.6 : 0.4
    const k = size * (m.a ?? 1)
    for (const c of [m.c, m.c2].filter(Boolean)) {
      const [h, sat, lig] = hsl(rgbOf(c))
      const a = (h * Math.PI) / 180
      x += Math.cos(a) * sat * k; y += Math.sin(a) * sat * k; s += sat * k; l += lig * k; w += k
      warm += (Math.cos(((h - 30) * Math.PI) / 180)) * sat * k // orange the warmest, blue the coolest
    }
  }
  if (!w) return { hue: 0, sat: 0, light: 0.5, warm: 0 }
  return { hue: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, sat: s / w, light: l / w, warm: warm / Math.max(1e-6, s) }
}

// BREATHING ROOM. The roll does not hold every painting for the same time: the music sets each one's hold, in beats of
// its own steady pulse (84 a minute). A painting with more in it, or one that turns the colour of the session somewhere
// new, is given longer to be looked at (up to eight beats); a quiet one that follows on from the last, less (four, a
// bar); and the last painting is held a bar longer, the music settling home under it. The chord changes with each
// painting, so the music breathes where the pictures do.
export const BEAT = 60 / 84
export function rollHolds(list) {
  const colours = list.map(colourOf)
  return list.map((p, i) => {
    const busy = Math.min(1, p.marks.length / 60) // how much is in it
    let turn = 0.5 // how far its colour moves from the one before (the first: halfway)
    if (i > 0) {
      const a = colours[i - 1], b = colours[i]
      const dh = Math.abs(((a.hue - b.hue + 540) % 360) - 180) / 180 * Math.min(1, (a.sat + b.sat) * 2) // hue matters as far as either has colour
      turn = Math.min(1, dh + Math.abs(a.light - b.light) * 2.5)
    }
    const beats = 4 + Math.round(Math.min(1, 0.5 * busy + 0.5 * turn) * 4) + (i === list.length - 1 ? 4 : 0)
    return Math.round(beats * BEAT * 1000) / 1000
  })
}

// The score for the roll: the timing of the roll (each painting starting at i * (reveal + hold - fade), its marks laid
// down over the first `reveal` seconds), the key, and every sound with its time, pitch (MIDI), length, strength and place
// `lead`: seconds before the first painting (the title card), sounded as the opening: the key's home chord swelling in,
// and a few bells rising through it
// `holds`: each painting's own hold (rollHolds), in place of the one `hold` for all
export function rollScore(list, { reveal = 2, hold = 3, fade = 0.6, maxNotes = 14, lead = 0, holds = null } = {}) {
  const spanOf = (i) => reveal + (holds && holds[i] != null ? holds[i] : hold)
  const starts = []
  let at0 = lead
  for (let i = 0; i < list.length; i++) { starts.push(at0); at0 += spanOf(i) - fade }
  const total = list.length ? starts[list.length - 1] + spanOf(list.length - 1) : lead
  const colours = list.map(colourOf)
  // the session's colour: the key
  let x = 0, y = 0, light = 0, warm = 0
  for (const c of colours) { const a = (c.hue * Math.PI) / 180; x += Math.cos(a) * (c.sat + 0.05); y += Math.sin(a) * (c.sat + 0.05); light += c.light; warm += c.warm }
  const n = Math.max(1, list.length)
  const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
  light /= n; warm /= n
  const root = FIFTHS[Math.round(hue / 30) % 12]
  const mode = warm > 0.1 && light > 0.32 ? 'major' : warm < -0.15 && light < 0.3 ? 'aeolian' : 'dorian'
  const scale = MODES[mode]
  const base = root > 5 ? root - 12 : root // the key's root nearest C, so every key sits in the same register
  const tone = (degree, octave) => { const d = ((degree % 7) + 7) % 7; return 12 * (octave + 1) + base + scale[d] + 12 * Math.floor(degree / 7) }
  // each instrument keeps to its own range (MIDI): a note above or below it moves by octaves into it
  const RANGE = { bell: [64, 88], pluck: [52, 76], sparkle: [76, 96], swell: [55, 72] }
  const within = (midi, voice) => { const [lo, hi] = RANGE[voice]; while (midi > hi) midi -= 12; while (midi < lo) midi += 12; return midi }
  // each painting's chord: its warmth and light relative to the session's, onto the degrees from darkest to brightest
  const ladder = mode === 'major' ? [5, 1, 3, 0, 4, 3, 0] : [0, 5, 3, 6, 2, 3, 6] // vi ii IV I V IV I (major); i VI iv VII III iv VII
  const events = []
  const chords = []
  let last = -1
  list.forEach((p, i) => {
    const c = colours[i]
    const t0 = starts[i], span = spanOf(i)
    const lift = Math.max(0, Math.min(0.999, 0.5 + (c.light - light) * 2.2 + (c.warm - warm) * 0.6))
    let degree = ladder[Math.floor(lift * ladder.length)]
    if (degree === last && list.length > 1) degree = ladder[(Math.floor(lift * ladder.length) + 2) % ladder.length] // a new painting, a new chord
    if (holds && i === list.length - 1 && list.length > 1) degree = 0 // the last painting: home, the music settling under it
    last = degree
    const chord = [0, 2, 4, 6].map((k) => tone(degree + k, 3)) // a seventh chord about middle C
    chords.push({ t: t0, degree, chord })
    events.push({ v: 'pad', t: t0, midi: chord, len: span + fade, vel: 0.5 + 0.3 * c.sat, pan: 0 })
    events.push({ v: 'bass', t: t0, midi: [tone(degree, 2)], len: span, vel: 0.7, pan: 0 })
    // the marks that sound, as they are laid down: at most maxNotes a painting, spread evenly over the ones that can
    // every kind of mark it has is heard at least once (its first), then the rest spread evenly, in the order laid
    const voiced = p.marks.map((m, j) => ({ m, j })).filter(({ m }) => VOICE[m.k])
    const pickN = Math.min(maxNotes, voiced.length)
    const take = new Set()
    for (const v of voiced) if (take.size < pickN && ![...take].some((t) => voiced[t].m.k === v.m.k)) take.add(voiced.indexOf(v))
    for (let k = 0; take.size < pickN && k < pickN * 4; k++) take.add(Math.floor(((k % pickN + 0.5) * voiced.length) / pickN + Math.floor(k / pickN)) % voiced.length)
    const chosen = [...take].sort((a, b) => a - b).map((t) => voiced[t])
    const pentatonic = [0, 1, 2, 4, 5].map((o) => degree + o) // from the chord's root: root, second, third, fifth, sixth (no clashing half steps)
    for (const { m, j } of chosen) {
      const at = t0 + (reveal * (j + 1)) / p.marks.length
      const height = 1 - Math.max(0, Math.min(1, m.y ?? (m.pts ? m.pts.reduce((s, q) => s + q[1], 0) / m.pts.length : 0.5)))
      const across = Math.max(0, Math.min(1, m.x ?? (m.pts ? m.pts.reduce((s, q) => s + q[0], 0) / m.pts.length : 0.5)))
      const voice = VOICE[m.k]
      const steps = Math.round(height * 7) // up to seven steps of the chord's colours, about an octave and a third
      const deg = pentatonic[steps % 5] + 7 * Math.floor(steps / 5)
      const octave = 4
      const vel = Math.max(0.25, Math.min(1, (m.a ?? 1) * (voice === 'swell' ? 0.7 : 1)))
      if (voice === 'sparkle') { // a few high specks of sound, each a step apart, close together
        for (let k = 0; k < 3; k++) events.push({ v: 'sparkle', t: at + k * 0.09, midi: [within(tone(deg + k * 2, octave), 'sparkle')], len: 0.9, vel: vel * 0.6, pan: across * 2 - 1 })
      } else events.push({ v: voice, t: at, midi: [within(tone(deg, octave), voice)], len: voice === 'swell' ? 2.6 : voice === 'pluck' ? 1.6 : 2.4, vel, pan: across * 2 - 1 })
    }
  })
  if (lead > 0) { // the opening, under the title: home, and the first notes of it
    const home = [0, 2, 4, 6].map((k) => tone(k, 3))
    events.push({ v: 'pad', t: 0, midi: home, len: lead + fade + 0.4, vel: 0.55, pan: 0 })
    events.push({ v: 'bass', t: 0.2, midi: [tone(0, 2)], len: lead + fade, vel: 0.6, pan: 0 })
    ;[0, 2, 4, 7].forEach((d, k) => events.push({ v: 'bell', t: 0.5 + k * 0.45, midi: [within(tone(d, 4), 'bell')], len: 2.4, vel: 0.7 - k * 0.08, pan: -0.45 + k * 0.3 }))
  }
  events.sort((a, b) => a.t - b.t)
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
  return { key: `${names[root]} ${mode}`, root, mode, total: Math.round(total * 1000) / 1000, chords, events }
}

// The session's colour as an RGB glow (0..1): the hue of its paintings together, kept soft and light
export function sessionColour(list) {
  let x = 0, y = 0
  for (const p of list) { const c = colourOf(p), a = (c.hue * Math.PI) / 180; x += Math.cos(a) * (c.sat + 0.05); y += Math.sin(a) * (c.sat + 0.05) }
  const h = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, sat = 0.55, l = 0.6
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }
  return [f(h / 360 + 1 / 3), f(h / 360), f(h / 360 - 1 / 3)]
}
