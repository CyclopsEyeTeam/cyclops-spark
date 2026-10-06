// Spark's Cyclops Link mark sheet: Spark's own look, drawn by her own renderer, small, one frame per Link state.
// Other presences carry a copy of link-mark/spark.json and place it at Spark's seat; they never draw Spark themselves.
//   node tools/export-link-mark.mjs        writes plugins/cyclops-spark/link-mark/spark.json
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildScene, createPresence } from '../plugins/cyclops-spark/hooks/core.js'
import { createRaster } from '../plugins/cyclops-spark/hooks/render-raster.js'

const COLS = 12, ROWS = 6, LOD = 'tiny'          // 12 x 12 pixels as half-block cells: Spark's own tiny look, then trimmed
const GROUND = [0.07, 0.07, 0.08]           // a dark terminal ground, as Spark assumes for half-transparent pixels

// Each Link state as real Spark events, sampled a moment later. Spark has no "ended" look of her own: a session that
// ended is shown as Spark dozing, dimmed, so nothing new is invented.
const STATES = {
  idle: { events: [[0, 'session.wake']], at: 40 },
  working: { events: [[0, 'session.wake'], [30, 'turn.start'], ...stream(30.2, 32, 'text')], at: 32 },
  thinking: { events: [[0, 'session.wake'], [30, 'turn.start'], ...stream(30.2, 32, 'thinking')], at: 32 },
  tool: { events: [[0, 'session.wake'], [30, 'turn.start'], [30.5, 'tool.start', { id: 'r', tool: 'Read', input: {} }]], at: 31.5 },
  waiting: { events: [[0, 'session.wake'], [30, 'turn.start'], [30.5, 'tool.start', { id: 'b', tool: 'Bash', input: {} }], [30.6, 'tool.ask', { id: 'b' }]], at: 32 },
  stopped: { events: [[0, 'session.wake'], [30, 'turn.start'], ...stream(30.2, 34, 'text'), [34, 'turn.end', { reason: 'answer', durationMs: 4000 }]], at: 40 },
  listening: { events: [[0, 'session.wake'], [30, 'prompt.edit']], at: 30.6 },
  compacting: { events: [[0, 'session.wake'], [30, 'compact.start']], at: 31.5 },
  interrupted: { events: [[0, 'session.wake'], [30, 'turn.start'], ...stream(30.2, 32, 'text'), [32, 'turn.end', { reason: 'aborted', durationMs: 2000 }]], at: 33 },
  ended: { events: [[0, 'session.wake']], at: 900, dim: 0.5 },
}
function stream(t0, t1, kind) { const out = []; for (let t = t0; t < t1; t += 0.12) out.push([+t.toFixed(2), 'stream', { kind, n: 30 }]); return out }

const to8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)))
function cells(name) {
  const s = STATES[name]
  const p = createPresence('spark')
  for (const [t, type, extra] of s.events) p.apply({ t, type, ...(extra || {}) })
  for (let t = 0; t < s.at; t += 0.5) p.sample(t, { ambient: false, theme: 'dark' })
  const f = p.sample(s.at, { ambient: false, theme: 'dark' })
  const r = createRaster(COLS, ROWS * 2)
  r.draw(buildScene(f, LOD), 'dark')
  const px = (x, y) => {
    const k = (y * COLS + x) * 4, a = Math.min(1, r.px[k + 3])
    if (a < 0.05) return null
    const d = s.dim || 1
    return [0, 1, 2].map((i) => to8(Math.min(1, (r.px[k + i] + GROUND[i] * (1 - a))) * d))
  }
  const rows = []
  for (let cy = 0; cy < ROWS; cy++) {
    const row = []
    for (let x = 0; x < COLS; x++) {
      const top = px(x, cy * 2), bot = px(x, cy * 2 + 1)
      if (!top && !bot) row.push([' ', null, null])
      else if (!bot) row.push(['▀', top, null])
      else if (!top) row.push(['▄', bot, null])
      else row.push(['▀', top, bot])
    }
    rows.push(row)
  }
  return rows
}
// trim the blank margin every frame shares, so the sheet is only Spark
function crop(all) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1
  for (const f of Object.values(all)) f.forEach((row, y) => row.forEach((c, x) => {
    if (c[0] !== ' ') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  }))
  return Object.fromEntries(Object.entries(all).map(([k, f]) => [k, f.slice(y0, y1 + 1).map((row) => row.slice(x0, x1 + 1))]))
}
const frames = crop(Object.fromEntries(Object.keys(STATES).map((k) => [k, cells(k)])))
const W = frames.idle[0].length, Hh = frames.idle.length
const ascii = Object.fromEntries(Object.keys(STATES).map((k) => [k, frames[k].map((row, y) => row.map((c, x) =>
  y === Math.floor(Hh / 2) && x === Math.floor(W / 2) ? '*' : c[0] === ' ' ? ' ' : '.').join(''))]))
const sheet = {
  v: 1, presence: 'spark', cols: W, rows: Hh,
  note: "Spark's own look, rendered by her own terminal renderer (hooks/render-raster.js) from real Spark events. A host draws it at Spark's seat; it never redraws Spark itself.",
  states_map: {},
  frames, ascii,
}
mkdirSync(new URL('../plugins/cyclops-spark/link-mark/', import.meta.url), { recursive: true })
writeFileSync(new URL('../plugins/cyclops-spark/link-mark/spark.json', import.meta.url), JSON.stringify(sheet) + '\n')
console.log('plugins/cyclops-spark/link-mark/spark.json', W + 'x' + Hh, Object.keys(frames).join(' '))
