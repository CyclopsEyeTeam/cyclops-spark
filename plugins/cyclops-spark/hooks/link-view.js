// What Spark shows of the other presences when Cyclops Link is on, and what she tells them.
//
// Spark never draws Keeper or Prism herself. Each of them exported her own small look from her own renderer
// (link-mark/keeper.json, link-mark/prism.json, vendored with their SOURCE note); Spark places that look at the peer's
// seat in the canonical triangle and draws the handoff threads their own records declare, over her own cells, on cells
// she left empty. Seats (SPEC §11): Spark sees Keeper to the right (0°) and Prism to the upper right (60°).
//
// What she tells them is only her coarse state in Link's words, how many calls and branches are out, and which presence
// she is reaching while a call to it is in flight. Her lanes already know that: a Keeper lane is a call to Keeper, a
// Gemini lane (gemini, agy) is a call to Prism's host.

import { DEFAULT } from './render-raster.js'

const STATES = new Set(['idle', 'listening', 'thinking', 'working', 'tool', 'waiting', 'compacting', 'stopped', 'interrupted', 'ended'])
const NAMES = { spark: 'Spark', keeper: 'Keeper', prism: 'Prism' }

// ------------------------------------------------------------------ Spark's facts, in Link's words
const STOPPED = new Set(['done', 'declined', 'stopped on an error', 'reply ready', 'copied'])
export function linkFacts(f) {
  let tools = 0, branches = 0
  const reaching = new Set()
  for (const l of f.lanes || []) {
    if (!(l.inflight > 0)) continue
    if (l.family === 'agent') branches += l.inflight
    else tools += l.inflight
    if (l.family === 'peer' && l.key === 'peer:keeper') reaching.add('keeper')
    if (l.key === 'model:gemini') reaching.add('prism')
  }
  const mode = String(f.mode || 'idle')
  let state
  if (mode === 'waiting on you') state = 'waiting'
  else if (mode === 'compacting') state = 'compacting'
  else if (f.active) state = tools + branches > 0 ? 'tool' : mode === 'thinking' ? 'thinking' : 'working'
  else if (mode === 'interrupted') state = 'interrupted'
  else if (STOPPED.has(mode)) state = 'stopped'
  else if (mode === 'listening' || mode === 'stirring') state = 'listening'
  else state = 'idle'
  const reach = state === 'stopped' || state === 'interrupted' || state === 'idle' ? [] : [...reaching].sort()
  return { state, tools: Math.min(256, tools), branches: Math.min(32, branches), reaching: reach }
}

// ------------------------------------------------------------------ mark sheets (display only)
const rgbOk = (v) => v === null || (Array.isArray(v) && v.length === 3 && v.every((c) => Number.isInteger(c) && c >= 0 && c <= 255))
export function parseSheet(text, presence) {
  try {
    if (typeof text !== 'string' || text.length > 256 * 1024) return null
    const raw = JSON.parse(text)
    if (raw.v !== 1 || raw.presence !== presence) return null
    const { cols, rows } = raw
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || cols > 64 || rows < 1 || rows > 32) return null
    const frames = {}
    for (const [state, grid] of Object.entries(raw.frames || {})) {
      if (!STATES.has(state) || !Array.isArray(grid) || grid.length !== rows) return null
      frames[state] = grid.map((row) => {
        if (!Array.isArray(row) || row.length !== cols) throw new Error('row')
        return row.map((c) => {
          if (!rgbOk(c[1]) || !rgbOk(c[2])) throw new Error('colour')
          return [typeof c[0] === 'string' && [...c[0]].length === 1 ? c[0] : ' ', c[1], c[2]]
        })
      })
    }
    if (!frames.idle) return null
    const statesMap = {}
    for (const [k, v] of Object.entries(raw.states_map || {})) if (STATES.has(k) && frames[v]) statesMap[k] = v
    const core = Array.isArray(raw.core) && raw.core.length === 4 && raw.core.every(Number.isInteger) &&
      raw.core[0] >= 0 && raw.core[0] < raw.core[2] && raw.core[2] <= cols && raw.core[1] >= 0 && raw.core[1] < raw.core[3] && raw.core[3] <= rows ? raw.core : null
    return { presence, cols, rows, frames, statesMap, core }
  } catch { return null }
}

export const frameFor = (sheet, state) => sheet.frames[state] ? state : sheet.statesMap[state] && sheet.frames[sheet.statesMap[state]] ? sheet.statesMap[state] : 'idle'

function accent(sheet) {
  let best = [200, 200, 200], score = -1
  for (const row of sheet.frames.idle) for (const [, fg] of row) if (fg && fg[0] + fg[1] + fg[2] > score) { best = fg; score = fg[0] + fg[1] + fg[2] }
  return best
}
const pack = (rgb, k = 1) => rgb ? (Math.round(rgb[0] * k) << 16) | (Math.round(rgb[1] * k) << 8) | Math.round(rgb[2] * k) : DEFAULT

export function linkLine(view) {
  if (!view) return ''
  if (!view.peers.length) return 'linked · alone here'
  const byClass = new Map()
  for (const p of view.peers) if (!byClass.has(p.presence)) byClass.set(p.presence, p)
  return 'linked · ' + [...byClass.values()].map((p) => NAMES[p.presence] + ' ' + p.state).join(' · ')
}

// ------------------------------------------------------------------ composing over Spark's own cells
// words: Spark's Raster cells, [codePoint, fg, bg] per cell, W per row. Mutated in place.
export function overlay(words, W, rows, view, sheets, { now = 0, reduced = false } = {}) {
  if (!view || !view.peers.length) return words
  const solid = new Set()
  const at = (x, y) => (y * W + x) * 3
  const blank = (x, y) => x >= 0 && y >= 0 && x < W && y < rows && words[at(x, y)] === 0x20 && words[at(x, y) + 2] === DEFAULT && !solid.has(y * W + x)
  const put = (x, y, ch, fg, bg) => { if (x < 0 || y < 0 || x >= W || y >= rows) return; const k = at(x, y); words[k] = ch.codePointAt(0); words[k + 1] = fg; words[k + 2] = bg }
  const byClass = new Map()
  for (const p of view.peers) { if (!byClass.has(p.presence)) byClass.set(p.presence, []); byClass.get(p.presence).push(p) }
  const anchors = { spark: [W / 2, rows / 2] }
  let prismBottom = -1
  for (const presence of ['prism', 'keeper']) {
    const peers = byClass.get(presence)
    if (!peers) continue
    const sheet = sheets[presence], first = peers[0]
    const label = presence + ' · ' + first.state + (peers.length > 1 ? ' ×' + peers.length : '')
    let x0, y0, w, h, hue
    if (sheet) {
      let crop = [0, 0, sheet.cols, sheet.rows]
      if ((sheet.cols > W * 0.3 || sheet.rows > rows / 3) && sheet.core) crop = sheet.core
      w = crop[2] - crop[0]; h = crop[3] - crop[1]
      x0 = W - w - 1
      y0 = presence === 'prism' ? 1 : Math.max(Math.round(rows / 2 - h / 2), prismBottom + 2)
      y0 = Math.max(1, Math.min(rows - h, y0))
      const name = frameFor(sheet, first.state)
      for (let yy = crop[1]; yy < crop[3]; yy++) for (let xx = crop[0]; xx < crop[2]; xx++) {
        const [ch, fg, bg] = sheet.frames[name][yy][xx]
        if (ch === ' ' && !bg) continue
        const x = x0 + xx - crop[0], y = y0 + yy - crop[1]
        put(x, y, ch, pack(fg), pack(bg))
        solid.add(y * W + x)
      }
      hue = accent(sheet)
    } else { // no sheet from her: her name only, never an invented look
      w = NAMES[presence].length; h = 1; x0 = W - w - 1; y0 = presence === 'prism' ? 1 : Math.round(rows / 2); hue = [200, 200, 200]
      ;[...NAMES[presence]].forEach((ch, i) => { put(x0 + i, y0, ch, pack(hue), DEFAULT); solid.add(y0 * W + x0 + i) })
    }
    anchors[presence] = [x0 + w / 2, y0 + h / 2]
    if (presence === 'prism') prismBottom = y0 + h
    const text = [...label].slice(0, W - 1)
    const lx = Math.max(0, x0 + w - text.length)
    if (y0 - 1 >= 0) text.forEach((ch, i) => { put(lx + i, y0 - 1, ch, pack(hue, 0.8), DEFAULT); solid.add((y0 - 1) * W + lx + i) })
  }
  for (const th of view.threads) {
    const a = anchors[th.from], b = anchors[th.to]
    if (!a || !b) continue
    const hue = sheets[th.from] ? accent(sheets[th.from]) : [255, 230, 214]
    const n = Math.max(1, Math.floor(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]) * 2)))
    const path = [], seen = new Set()
    for (let i = 0; i <= n; i++) {
      const x = Math.round(a[0] + (b[0] - a[0]) * i / n), y = Math.round(a[1] + (b[1] - a[1]) * i / n)
      if (seen.has(y * W + x)) continue
      seen.add(y * W + x)
      if (blank(x, y)) path.push([x, y])
    }
    for (const [x, y] of path) put(x, y, '·', pack(hue, 0.55), DEFAULT)
    if (path.length && !reduced) { const [x, y] = path[Math.floor((now * 6) % path.length)]; put(x, y, '•', pack(hue), DEFAULT) }
  }
  return words
}
