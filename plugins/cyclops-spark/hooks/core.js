// Reactive Presence V2 — core: events in, a living scene out.
//
// Three kinds of motion are kept apart, on purpose:
//   EVENT       — state that exists only because a host event said so (a stream chunk, a tool call, a permission ask…)
//   TRANSITION  — the eased path between two event states (a lane growing out, a bloom fading after a turn lands)
//   AMBIENT     — breathing and slow drift that make the entity feel alive; claims nothing, and is damped
//                 whenever the entity is genuinely holding still (waiting on you, waiting for the model)
// Nothing here starts, stops or speeds up "thinking", "tools" or "saving" on a timer.
//
// This is Spark: Claude's own presence. Keeper (GPT's presence, from his own cyclops-keeper mod) only ever appears here
// as a peer lane, when Spark is actually talking with him, and wears his own mark there.
//
// Colour is Infinite Colour, the DrawPlayer Colour Language (colour-engine.js), included as is. Spark keeps one recipe
// whose seed weights ARE its live event energies, so its colour is made from its own recent history.

import { applyTransforms, createColourRecipe, evaluateColourRecipe, mixColours } from './colour-engine.js'

// ------------------------------------------------------------------ small tools

export function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
export function rng(seed) {
  let s = (seed >>> 0) || 1
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
}
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3)
const TAU = Math.PI * 2

// An energy that a real event pumps and that decays on its own when events stop.
function energy(tau) {
  let v = 0, t0 = 0
  return {
    at: (t) => v * Math.exp(-Math.max(0, t - t0) / tau),
    add(t, amount) { v = Math.min(1, this.at(t) + amount); t0 = t },
    reset(t) { v = 0; t0 = t },
  }
}

// How hard the model was asked to think, as the host reports it on every turn.step: a word, or a number we cannot scale.
const EFFORT = { low: 0.2, medium: 0.45, high: 0.7, xhigh: 0.88, max: 1 }
const depthOf = (effort) => typeof effort === 'string' ? (EFFORT[effort] ?? 0.45) : typeof effort === 'number' ? 0.5 : 0

// A one-character face for places that cannot draw (a status line, a title, a text-only surface). Same truth as the hover.
const GLYPHS = {
  idle: '✶', listening: '✦', resting: '☾', dozing: '☾', waking: '✺', stirring: '✺', 'waiting on you': '◉', 'waiting for the model': '◌',
  thinking: '✺', writing: '✧', compacting: '▾', done: '✶', interrupted: '◦', declined: '▫', 'stopped on an error': '✕', working: '✧',
  'reply ready': '◆', copied: '◇', painting: '✐',
}
export function glyph(mode) {
  const key = String(mode || 'idle')
  if (GLYPHS[key]) return GLYPHS[key]
  const verb = key.split(' ')[0]
  return { reading: '◈', creating: '✎', running: '⌁', searching: '◍', using: '◇', consulting: '❖', 'talking': '⟡', delegating: '✢', planning: '≡' }[verb] || '✧'
}

// ------------------------------------------------------------------ lanes
// Every tool or model invoked becomes a temporary lane off the entity: reach, never replacement.

export const FAMILIES = ['read', 'write', 'shell', 'web', 'mcp', 'model', 'peer', 'agent', 'plan', 'other']

// Keeper is GPT: a peer Spark talks with, not a tool it uses. His lane is a contact, and in it his own eye (render-raster.js).
const KEEPER = /\bcodex\b|\bkeeper\b|api\.openai\.com|\bopenai\b|\bgpt-?\d/i
const peerLane = (how) => ({ key: 'peer:keeper', family: 'peer', label: 'Keeper', how })
const MODEL_PATTERNS = [
  [/\bgemma\b/i, 'gemma', 'Gemma'],
  [/\bgemini\b|\bagy\b/i, 'gemini', 'Gemini'], // agy: Antigravity, where Gemini (and Prism) work
  [/\bclef\b/i, 'clef', 'Clef'],
  [/\bclaude\s+(-p|--print)\b|api\.anthropic\.com/i, 'claude', 'Claude'],
  [/\bollama\s+(run|generate)\s+([\w.:-]+)/i, 'local', 'local model'],
  [/\b(llama|mistral|qwen|phi)[\w.:-]*\b|llama\.cpp|lmstudio/i, 'local', 'local model'],
]

// Which lane a tool call belongs to. `how` says whether the lane is certain from the tool name, or inferred from
// the command text (a model invoked through the shell) — the mapping table shows the difference.
export function laneFor(tool, input = {}) {
  const name = String(tool || '')
  const text = [input.command, input.prompt, input.model, input.url].filter(Boolean).join(' ')
  if (name === 'Agent' || name === 'Task') {
    const type = String(input.subagent_type || 'general')
    return { key: 'agent:' + type, family: 'agent', label: type + ' agent', how: 'tool name' }
  }
  if (name.startsWith('mcp__')) {
    const server = name.split('__')[1] || 'mcp'
    if (KEEPER.test(server)) return peerLane('server name')
    for (const [re, id, label] of MODEL_PATTERNS) if (re.test(server)) return { key: 'model:' + id, family: 'model', label, how: 'server name' }
    if (/ollama|lmstudio|llama|local-?model|vllm/i.test(server)) return { key: 'model:local:' + server, family: 'model', label: String(input.model || server), how: 'server name' }
    return { key: 'mcp:' + server, family: 'mcp', label: server, how: 'tool name' }
  }
  if (name === 'Bash' || name === 'BashOutput') {
    if (KEEPER.test(text)) return peerLane('command text (inferred)')
    for (const [re, id, label] of MODEL_PATTERNS) {
      const m = re.exec(text)
      if (m) return { key: 'model:' + id, family: 'model', label: id === 'local' && m[2] ? m[2] : label, how: 'command text (inferred)' }
    }
    return { key: 'shell', family: 'shell', label: 'shell', how: 'tool name' }
  }
  if (/^(Read|Grep|Glob|LS|NotebookRead|Skill)$/.test(name)) return { key: 'read', family: 'read', label: 'files', how: 'tool name' }
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(name)) return { key: 'write', family: 'write', label: 'files', how: 'tool name' }
  if (/^(WebSearch|WebFetch)$/.test(name)) return { key: 'web', family: 'web', label: 'web', how: 'tool name' }
  if (/^(TodoWrite|TaskCreate|TaskUpdate|TaskList|EnterPlanMode|ExitPlanMode)$/.test(name)) return { key: 'plan', family: 'plan', label: 'plan', how: 'tool name' }
  return { key: 'tool:' + name, family: 'other', label: name, how: 'tool name' }
}

const VERB = { read: 'reading', write: 'creating', shell: 'running', web: 'searching', mcp: 'using', model: 'consulting', peer: 'talking with', agent: 'delegating', plan: 'planning', other: 'using', paint: 'painting' }

// The painter is Spark's own sub-agent, so its lane is hers: it reaches toward the canvas (down, or to the side when the
// painting sits beside her), and it is not one of the turn's tools (no echo, no habit, never in the turn's facts).
export const PAINT_TOWARD = { below: 1.12, beside: 0.3 }
// How Spark answers her own painting, chosen by the painter in the same call (no second call): moves she already has
export const REACTIONS = ['bloom', 'lean', 'ring', 'shimmer', 'hush']

// ------------------------------------------------------------------ colour (Infinite Colour)

// Palettes are temperaments, not states: the seven seeds keep their roles (home, think, speak, tool, error, rest, mend)
// so a palette changes Spark's mood-of-colour and never what a colour means. Error stays red in every palette.
export const PALETTE_NAMES = ['spark', 'aurora', 'ember', 'moon']
const PALETTES = {
  //          home (identity)      think               speak               tool                error               rest                mend
  spark:  [[1.00, 0.90, 0.84], [0.84, 0.40, 0.56], [1.00, 0.74, 0.46], [0.96, 0.58, 0.40], [0.95, 0.20, 0.28], [0.46, 0.36, 0.42], [0.62, 0.95, 0.72]],
  aurora: [[0.86, 1.00, 0.95], [0.46, 0.38, 0.92], [0.40, 0.92, 0.78], [0.38, 0.70, 0.96], [0.95, 0.20, 0.30], [0.34, 0.42, 0.50], [0.95, 0.92, 0.55]],
  ember:  [[1.00, 0.88, 0.70], [0.78, 0.22, 0.30], [1.00, 0.66, 0.24], [0.94, 0.46, 0.20], [0.90, 0.10, 0.20], [0.44, 0.30, 0.26], [0.60, 0.92, 0.62]],
  moon:   [[0.92, 0.95, 1.00], [0.46, 0.52, 0.86], [0.78, 0.86, 1.00], [0.60, 0.74, 0.92], [0.95, 0.24, 0.32], [0.38, 0.42, 0.52], [0.72, 0.96, 0.84]],
}
// the seven seeds of a palette (home, think, speak, tool, error, rest, mend), for the painter to paint in Spark's own colours
export const paletteSeeds = (name) => (PALETTES[name] || PALETTES.spark).map((c) => c.slice())
const rgbOf = ([r, g, b]) => ({ r, g, b })
const q = (x) => Math.round(x * 50) / 50 // recipes are cached by value, like infinite_colour/engine.py
const colourCache = new Map()

function entityColour(name, e, theme) {
  const palette = PALETTES[name] ? name : 'spark' // an unknown palette is Spark, not an error
  const key = [palette, theme, q(e.think), q(e.speak), q(e.tool), q(e.err), q(e.rest), q(e.glow), q(e.mend)].join('|')
  let hit = colourCache.get(key)
  if (hit) return hit
  const seeds = (PALETTES[palette] || PALETTES.spark).map(rgbOf)
  const recipe = createColourRecipe({
    id: palette,
    seeds,
    mixWeights: [1, 1.3 * e.think, 1.3 * e.speak, 0.9 * e.tool, 1.8 * e.err, 1.2 * e.rest, 1.1 * e.mend],
    mix: { method: 'LINEAR_LIGHT' },
    transforms: { brightness: 0.86 + 0.22 * e.glow, saturation: 1 + 0.25 * e.glow - 0.35 * e.rest, emission: 0.2 + e.glow },
  })
  let body = evaluateColourRecipe(recipe)
  if (theme === 'light') body = applyTransforms(body, { brightness: 0.62, saturation: 1.25 })
  const tip = applyTransforms(body, { hueShift: -0.025, saturation: 1.3, brightness: theme === 'light' ? 0.85 : 0.94 })
  const core = theme === 'light' ? applyTransforms(body, { brightness: 0.8 }) : mixColours([body, { r: 1, g: 1, b: 1 }], [0.2, 0.8])
  hit = { body, tip, core, recipe }
  if (colourCache.size > 4096) colourCache.clear()
  colourCache.set(key, hit)
  return hit
}

function laneColour(body, lane, errAmt) {
  const shift = ((hash(lane.key) % 1000) / 1000) * 0.36 - 0.18 // each lane has its own hue signature, kin to its entity
  const own = applyTransforms(body, { hueShift: shift, saturation: 1.15 })
  return evaluateColourRecipe(createColourRecipe({
    id: 'lane:' + lane.key,
    seeds: [body, own, { r: 0.95, g: 0.2, b: 0.28 }],
    mixWeights: [0.5, 0.5, 1.6 * errAmt],
  }))
}
const arr = (c) => [c.r, c.g, c.b]

// ------------------------------------------------------------------ looks (one expression, many ways of saying it)
// Each time an expression really begins (thinking starts, writing starts, an answer lands, a call goes out, an error,
// a mend, first light), Spark rolls which way she says it this time. Still the same expression, never invented: a roll
// happens only at the real event that starts it, never on a timer. The roll is seeded by the event itself, so the same
// session (and the replay) always says it the same way, and never the same way twice in a row.
export const LOOKS = {
  think: ['coil', 'tide', 'lattice', 'pulse'],
  speak: ['currents', 'fountain', 'ripples', 'flares'],
  land: ['spring', 'petals', 'halo', 'spiral'],
  err: ['recoil', 'shiver', 'crack'],
  mend: ['knit', 'seeds', 'close'],
  wake: ['ring', 'unfurl', 'rays'],
  tool: ['reach', 'flare', 'spark'],
  take: ['drink', 'spiral', 'catch'], // a message you sent mid-turn, taken in
}

// ------------------------------------------------------------------ the presence (state machine)

export function createPresence(entity = 'spark', seed = 7) { // Spark only
  entity = 'spark'
  const think = energy(0.9), speak = energy(0.9), tool = energy(1.4), err = energy(1.6), attend = energy(1.2), mend = energy(1.6)
  const lanes = new Map()      // key → lane
  const callLane = new Map()   // tool_use_id → lane key
  const asks = new Set()
  let motes = []
  let active = false, turnAt = -1, firstStreamAt = -1, end = null, compact = null, lastEventAt = 0
  let spin = 0, lastT = 0
  // — things Spark remembers about this session, each one a real event kept —
  let wakeAt = -99                       // session.wake: first light (also after a /clear)
  let stars = [], condense = null        // one star per answered turn; a compaction gathers them into one
  let turnCount = 0                      // answered turns this session
  let depth = 0, effortLabel = ''        // how hard the model was asked to think (turn.step effort)
  let lastModel = null, shiftAt = -99    // the model that answered changed mid-session
  let turnLanes = new Set()              // lanes this turn reached through (its echo rings)
  let stirAt = -99, stirRest = 0, stirDeep = 0   // the first real event after a long silence: how rested Spark was when it came
  const worn = new Map()                 // lane key → calls this session: a path used often becomes a habit
  // — what the last turn left for you, held until you act on it —
  let replyChars = 0                     // how much the turn really wrote (text chunks, counted, never kept)
  let offer = null                       // { at, kind: answer | error | refusal, chars }: the turn's ending, still waiting for you
  let handoff = null                     // { at, had }: you copied the reply (/copy)
  const sideAsks = new Map()             // id → when: side questions you asked (/spark ask), still being answered
  let sideDone = null                    // { at, ok, a }: the last side answer arriving
  const log = []
  // LOOKS: which way each expression is said this time, rolled when it really begins
  const looks = { think: -1, speak: -1, land: -1, err: -1, mend: -1, wake: -1, take: -1 } // nothing said yet: the first roll may be any way
  const rolls = { think: 0, speak: 0, land: 0, err: 0, mend: 0, wake: 0, tool: 0, take: 0 }
  let mendLookAt = -99
  let react = null                       // { at, move, a }: how she answers a painting that just arrived
  // QUEUED: what you sent while she was working, waiting at her edge until the model really takes it in
  let queued = []                        // when each waiting message arrived (at most a few are drawn)
  let take = null                        // { at }: the last message taken in, mid-turn
  function roll(kind, t) {
    const n = LOOKS[kind].length
    rolls[kind] += 1
    let v = hash(kind + ':' + rolls[kind] + ':' + Math.round(t * 1000)) % n
    if (kind !== 'tool' && v === looks[kind]) v = (v + 1) % n // never the same way twice in a row
    if (kind !== 'tool') looks[kind] = v
    return v
  }

  function laneSlot(key) {
    // a stable angle per lane, nudged away from lanes already out
    let a = ((hash(key) % 3600) / 3600) * TAU
    for (let tries = 0; tries < 12; tries++) {
      let clash = false
      for (const l of lanes.values()) {
        const d = Math.abs(((a - l.angle + Math.PI * 3) % TAU) - Math.PI)
        if (d < 0.7) { clash = true; break }
      }
      if (!clash) break
      a += 0.75
    }
    return a
  }

  function apply(ev) {
    const t = ev.t
    // STIR: any real event after a long silence rouses Spark. It does not snap awake: it remembers how deeply it rested
    // and unfolds from there. (The quiet is measured from the last event, exactly as rest and dozing are.)
    const quiet = t - lastEventAt
    if (!active && lastEventAt > 0 && quiet > 120 && ev.type !== 'session.wake') {
      stirAt = t; stirRest = clamp((quiet - 120) / 30); stirDeep = quiet > 600 ? clamp((quiet - 600) / 180) : 0
    }
    lastEventAt = t
    log.push(ev)
    if (log.length > 400) log.shift()
    switch (ev.type) {
      case 'session.wake':
        wakeAt = t
        roll('wake', t)
        stirAt = -99
        if (ev.fresh) { // a cleared conversation starts clean: no stars, no lingering end-of-turn state, nothing still out, no habits
          stars = []; condense = null; turnCount = 0; lastModel = null; end = null; active = false; compact = null; motes = []
          offer = null; handoff = null; sideAsks.clear(); sideDone = null
          asks.clear(); lanes.clear(); callLane.clear(); worn.clear(); react = null; queued = []; take = null
        }
        break
      case 'step': {
        if (ev.effort !== undefined) { depth = depthOf(ev.effort); effortLabel = typeof ev.effort === 'string' ? ev.effort : '' }
        if (ev.model) { if (lastModel && lastModel !== ev.model) shiftAt = t; lastModel = ev.model }
        break
      }
      case 'agent.stream':
        for (const l of lanes.values()) if (l.family === 'agent' && l.inflight.size > 0) l.beat.add(t, Math.min(0.5, (ev.n || 20) / 80))
        break
      case 'prompt.edit': attend.add(t, 0.35); break
      case 'prompt.submit': attend.reset(t); offer = null; break // you moved on: what was waiting is no longer
      case 'prompt.queue': if (active) { queued.push(t); if (queued.length > 12) queued.shift() } break // you wrote while she worked: it waits
      case 'spark.answer': // she answers what you said to her in her pane, with a move of hers, toward you
        attend.add(t, 0.4)
        if (REACTIONS.includes(ev.react)) react = { at: t + 0.1, move: ev.react, a: Math.PI / 2 }
        break
      case 'prompt.take': // the model took a waiting message into the turn: it travels in to her core
        queued.shift()
        take = { at: t }
        roll('take', t)
        attend.add(t, 0.5)
        break
      case 'turn.start': active = true; turnAt = t; firstStreamAt = -1; end = null; turnLanes = new Set(); offer = null; replyChars = 0; queued = []; break // what waited is this turn's prompt now
      case 'side.ask': sideAsks.set(String(ev.id || 'side'), t); break // a side question: answered beside the work, never in it
      case 'side.answer': {
        const from = sideAsks.get(String(ev.id || 'side'))
        sideAsks.delete(String(ev.id || 'side'))
        if (from !== undefined) sideDone = { at: t, ok: ev.ok !== false, a: sideAngle(t - from) }
        break
      }
      case 'reply.copied': // you took the reply with /copy. It hands over whatever was waiting
        handoff = { at: t, had: offer ? offer.kind : null, chars: offer ? offer.chars : 0 }
        offer = null
        break
      case 'stream': {
        if (firstStreamAt < 0) firstStreamAt = t
        if (ev.kind !== 'thinking') replyChars += ev.n || 0
        if (ev.kind === 'thinking' ? think.at(t) < 0.05 : speak.at(t) < 0.05) roll(ev.kind === 'thinking' ? 'think' : 'speak', t) // a new spell of it
        const amt = Math.min(0.6, (ev.n || 20) / 60)
        if (ev.kind === 'thinking') think.add(t, amt)
        else speak.add(t, amt)
        const r = rng(hash(String(t) + ev.kind))
        const count = Math.max(1, Math.min(4, Math.round((ev.n || 20) / 14)))
        for (let i = 0; i < count; i++) motes.push({ t: t + i * 0.04, kind: ev.kind, i: Math.floor(r() * 64), s: r() })
        break
      }
      case 'tool.start': {
        const info = laneFor(ev.tool, ev.input)
        let lane = lanes.get(info.key)
        if (!lane) {
          lane = { ...info, angle: laneSlot(info.key), bornAt: t, lastAt: t, retractAt: -1, inflight: new Map(), pulses: [], errAt: -99, calls: 0, fail: 0, mendAt: -99, deniedAt: -99, beat: energy(0.8) }
          lanes.set(info.key, lane)
        }
        lane.retractAt = -1
        lane.lastAt = t
        lane.calls += 1
        worn.set(info.key, (worn.get(info.key) || 0) + 1) // WORN: every call on this path this session, kept after the lane retracts
        lane.inflight.set(ev.id, t)
        lane.pulses.push({ t, dir: 1, err: false, look: roll('tool', t) })
        callLane.set(ev.id, info.key)
        turnLanes.add(info.family === 'peer' ? 'peer' : info.key)
        tool.add(t, 0.5)
        break
      }
      case 'paint.start': { // the painter starts: Spark reaches toward the canvas
        const id = String(ev.id || 'paint')
        let lane = lanes.get('paint')
        if (!lane) {
          const angle = typeof ev.toward === 'number' && Number.isFinite(ev.toward) ? ev.toward : PAINT_TOWARD.below
          lane = { key: 'paint', family: 'paint', label: 'painter', how: 'painter', angle, bornAt: t, lastAt: t, retractAt: -1, inflight: new Map(), pulses: [], errAt: -99, calls: 0, fail: 0, mendAt: -99, deniedAt: -99, handAt: -99, beat: energy(0.8) }
          lanes.set('paint', lane)
        }
        lane.retractAt = -1
        lane.lastAt = t
        lane.calls += 1
        lane.inflight.set(id, t)
        lane.pulses.push({ t, dir: 1, err: false })
        tool.add(t, 0.3)
        break
      }
      case 'paint.end': { // a painting arrives (handed down to the canvas), or none does: only the lane says so, never Spark's body
        const lane = lanes.get('paint')
        if (!lane) break
        lane.inflight.delete(String(ev.id || 'paint'))
        lane.lastAt = t
        if (ev.ok === false) { lane.errAt = t; lane.pulses.push({ t, dir: -1, err: true }) }
        else {
          lane.handAt = t; lane.pulses.push({ t, dir: 1, err: false })
          // her answer to it, once the drop has reached the canvas: a real event (the painting arrived), said her own way
          if (REACTIONS.includes(ev.react)) react = { at: t + 0.6, move: ev.react, a: lane.angle }
        }
        break
      }
      case 'tool.ask': asks.add(ev.id); break
      case 'tool.end': {
        const lane = lanes.get(callLane.get(ev.id))
        asks.delete(ev.id)
        callLane.delete(ev.id) // a settled call is forgotten: the map holds only calls still out, however long the session
        if (!lane) break
        lane.inflight.delete(ev.id)
        lane.lastAt = t
        if (ev.aborted) { lane.pulses.push({ t, dir: -1, err: false }); break } // interrupted mid-call: it settles, but it did not fail and did not succeed
        if (ev.denied) { lane.deniedAt = t; lane.pulses.push({ t, dir: -1, err: false }); break } // DENIED: you said no. The gate closes quietly; the tool neither failed nor succeeded
        lane.pulses.push({ t, dir: -1, err: !!ev.error })
        if (ev.error) { lane.errAt = t; lane.fail += 1; err.add(t, 0.75) }
        else {
          // MEND: a call settles cleanly on a lane whose previous call failed — the thread is knit back together
          if (lane.fail > 0) { lane.mendAt = t; mend.add(t, Math.min(0.9, 0.4 + 0.15 * lane.fail)); roll('mend', t); mendLookAt = t }
          lane.fail = 0
        }
        break
      }
      case 'compact.start': compact = { start: t, end: -1 }; break
      case 'compact.end':
        if (compact) compact.end = t
        if (stars.length > 1) { // CONDENSE: compaction gathers the session's stars into one brighter star
          const sx = stars.reduce((a, s) => a + Math.sin(s.a), 0), cx = stars.reduce((a, s) => a + Math.cos(s.a), 0)
          condense = { at: t, from: stars.map((s) => ({ a: s.a, r: s.r })) }
          stars = [{ born: t, w: Math.min(1, 0.4 + 0.07 * stars.length), a: Math.atan2(sx, cx), r: 0.98, merged: true }]
        }
        break
      case 'turn.end': {
        active = false
        const secs = ev.durationMs != null ? ev.durationMs / 1000 : turnAt >= 0 ? t - turnAt : 0
        const reason = ev.reason || 'answer'
        // the turn's real size shapes how it lands: a long one exhales deeper, each lane it reached leaves an echo
        end = { t, reason, weight: clamp(Math.log10(1 + Math.max(0, secs)) / 2), echoes: Math.min(4, turnLanes.size) }
        if (reason === 'answer') roll('land', t)
        else if (reason === 'error') roll('err', t) // an interrupt was you: it stays a plain recoil, never red
        if (reason === 'answer') {
          turnCount += 1
          stars.push({ born: t, w: end.weight, a: (turnCount * 2.39996 + 0.7) % TAU, r: 0.97 + 0.1 * ((turnCount * 0.618) % 1) })
          if (stars.length > 24) stars.splice(stars[0].merged ? 1 : 0, 1)
        }
        if (reason === 'error') err.add(t, 0.5)
        // READY: an ending you have not acted on yet is held, so it can be seen from across the room. Interrupting was you
        offer = reason === 'aborted' ? null : { at: t, kind: reason, chars: replyChars }
        asks.clear()
        for (const l of lanes.values()) if (l.family !== 'paint') l.inflight.clear() // the painter is not the turn's: it goes on
        break
      }
    }
  }

  // The scene state at time t. Pure apart from integrating `spin` and pruning what has finished.
  function sample(t, opts = {}) {
    const ambientOn = opts.ambient !== false
    const dt = clamp(t - lastT, 0, 0.25)
    lastT = t
    const e = { think: think.at(t), speak: speak.at(t), tool: tool.at(t), err: err.at(t), attend: attend.at(t), mend: mend.at(t) }

    // lanes: retract a few seconds after their last call settles
    for (const [key, l] of lanes) {
      if (l.inflight.size === 0 && l.retractAt < 0 && t - l.lastAt > 4) l.retractAt = t
      if (l.retractAt >= 0 && t - l.retractAt > 0.7) lanes.delete(key)
      l.pulses = l.pulses.filter((p) => t - p.t < 0.9)
    }
    motes = motes.filter((m) => t - m.t < 1.4 && t >= m.t - 0.05)

    if (condense && t - condense.at > 2.6) condense = null
    const ask = asks.size > 0
    const compactAmt = compact ? (compact.end < 0 ? easeOut((t - compact.start) / 0.5) : 1 - easeOut((t - compact.end) / 0.7)) : 0
    if (compact && compact.end >= 0 && t - compact.end > 0.8) compact = null
    const awaiting = active && firstStreamAt < 0 && !ask                          // turn running, nothing streamed yet
    const quiet = t - lastEventAt
    const restNow = !active && quiet > 120 ? clamp((quiet - 120) / 30) : 0          // long absence of any event
    const deepNow = !active && quiet > 600 ? clamp((quiet - 600) / 180) : 0         // a much longer absence: dozing, the session's stars show
    // STIR: after an event ends a long silence, rest and dozing let go over ~1.2s instead of vanishing in one frame
    const stirK = stirAt >= 0 ? Math.exp(-(t - stirAt) / 1.2) : 0
    const stir = stirK * stirRest
    const rest = Math.max(restNow, stir)
    const deep = Math.max(deepNow, stirK * stirDeep)
    const woke = wakeAt > -50
    const wake = woke ? clamp((t - wakeAt) / 2.6) : 1                               // first light, 0 → 1
    const since = end ? t - end.t : 99
    const w = end ? end.weight : 0
    const bloom = end && end.reason === 'answer' ? (0.55 + 0.9 * w) * Math.exp(-since / (0.7 + 0.8 * w)) : 0
    const recoil = end && (end.reason === 'aborted' || end.reason === 'error') ? Math.exp(-since / 0.6) : 0
    const halt = end && end.reason === 'refusal' ? Math.exp(-since / 1.6) : 0     // a refusal is a boundary, not a fault: a still ring, no red
    const shift = shiftAt >= 0 ? Math.exp(-(t - shiftAt) / 1.4) : 0                // the answering model changed
    // READY: the held ending comes out of the core once the bloom has had its moment; COPIED: the handoff lasts 0.9s
    const offerOut = offer ? { kind: offer.kind, age: t - offer.at, amt: easeOut((t - offer.at - 0.35) / 0.8), size: clamp(Math.log10(1 + offer.chars / 80) / 2.2) } : null
    if (handoff && t - handoff.at > 2.4) handoff = null
    // SIDE: a side question out is a small satellite on a slow orbit, placed by its real elapsed time; its answer a soft ring
    let sideFrom = Infinity
    for (const at of sideAsks.values()) if (at < sideFrom) sideFrom = at
    const sideOut = sideAsks.size ? { age: t - sideFrom, a: sideAngle(t - sideFrom), n: sideAsks.size } : null
    if (sideDone && t - sideDone.at > 1.2) sideDone = null
    const sideDoneOut = sideDone ? { u: clamp((t - sideDone.at) / 0.9), ok: sideDone.ok, a: sideDone.a } : null
    const handoffOut = handoff ? { u: clamp((t - handoff.at) / 0.9), age: t - handoff.at, had: handoff.had, size: clamp(Math.log10(1 + handoff.chars / 80) / 2.2) } : null
    const echoes = []
    if (end && end.reason === 'answer') for (let k = 0; k < end.echoes; k++) {
      const u = (since - 0.18 - k * 0.3) / 1.6
      if (u > 0 && u < 1) echoes.push({ k, u })
    }
    // ambient is damped whenever the entity is really holding still
    const ra = react ? t - react.at : -1
    if (react && ra > 2.4) react = null
    const reactOut = react && ra >= 0 ? { move: react.move, u: clamp(ra / 2.4), a: react.a, k: Math.sin(Math.PI * clamp(ra / 2.4)) } : null
    const hush = reactOut && reactOut.move === 'hush' ? reactOut.k : 0       // she goes quiet, looking at it
    if (take && t - take.at > 2.2) take = null
    const takeOut = take ? { u: clamp((t - take.at) / 1.4), age: t - take.at } : null
    const queueOut = queued.length ? { n: queued.length, ages: queued.slice(0, 3).map((at) => t - at) } : null
    const hold = (ask ? 0.12 : awaiting ? 0.35 : 1 - 0.6 * rest - 0.2 * deep) * (1 - 0.75 * hush)
    const damp = ambientOn ? hold : 0
    spin += dt * (2.2 * e.think + 1.2 * e.speak + 0.6 * e.tool)

    const outNow = [...lanes.values()].filter((l) => l.inflight.size > 0)
    const anyInflight = outNow.find((l) => l.family !== 'paint')   // the turn's own calls: the painter never speaks for the turn
    const painterOut = outNow.find((l) => l.family === 'paint')
    const askLane = ask ? [...lanes.values()].find((l) => [...l.inflight.keys()].some((id) => asks.has(id))) : null
    const glow = clamp(0.55 * e.think + 0.6 * e.speak + 0.35 * e.tool + 0.8 * bloom + 0.3 * e.mend)
    const colours = entityColour(opts.palette || 'spark', { ...e, rest, glow }, opts.theme || 'dark')

    // what the hover may truthfully say
    let mode
    if (ask) mode = 'waiting on you'
    else if (compactAmt > 0.05) mode = 'compacting'
    else if (active) {
      if (anyInflight) mode = VERB[anyInflight.family] + (anyInflight.family === 'mcp' || anyInflight.family === 'peer' ? ' ' + anyInflight.label : '')
      else if (e.speak > 0.12) mode = 'writing'
      else if (e.think > 0.12) mode = 'thinking'
      else if (awaiting) mode = 'waiting for the model'
      else mode = 'working'
    } else if (handoffOut && handoffOut.age < 2 && (!end || handoff.at >= end.t)) mode = 'copied' // the newest thing that happened
    else if (since < 3) mode = end.reason === 'answer' ? 'done' : end.reason === 'aborted' ? 'interrupted' : end.reason === 'refusal' ? 'declined' : 'stopped on an error'
    else if (painterOut) mode = 'painting'                                          // her painter is at work
    else if (stir > 0.4) mode = 'stirring'                                           // roused from rest: the unfolding comes before the listening
    else if (e.attend > 0.08) mode = 'listening'
    else if (woke && t - wakeAt < 2.6) mode = 'waking'
    else if (offerOut) mode = offerOut.kind === 'answer' ? 'reply ready' : offerOut.kind === 'refusal' ? 'declined' : 'stopped on an error'
    else mode = deepNow > 0.5 ? 'dozing' : restNow > 0.5 ? 'resting' : 'idle'
    const laneShown = askLane || anyInflight
    const idleish = mode === 'idle' || mode === 'resting' || mode === 'dozing' || mode === 'listening'
    // while she is plainly working, or waiting on the model, she says it in the chat's own word (Processing, Channeling…),
    // as Claude Code draws it
    const said = (mode === 'working' || mode === 'waiting for the model') && typeof opts.word === 'string' && opts.word ? opts.word : mode
    const hover = 'Spark · ' + said + (laneShown && laneShown.family !== 'peer' && laneShown.family !== 'paint' ? ' · ' + laneShown.label + ' lane' : '') +
      (mode === 'thinking' && effortLabel ? ' · ' + effortLabel + ' effort' : '') +
      (idleish && turnCount > 0 ? ' · ' + turnCount + (turnCount === 1 ? ' turn' : ' turns') : '') +
      (sideOut ? ' · answering your side question' : '') +
      (takeOut && takeOut.age < 2.2 ? ' · taking in your message' : queueOut ? ' · ' + (queueOut.n === 1 ? 'your message is waiting' : queueOut.n + ' messages waiting') : '') +
      (offerOut && offerOut.age >= 60 && (mode === 'reply ready' || mode === 'stopped on an error' || mode === 'declined') ? ' · ' + (mode === 'reply ready' ? 'waiting ' : '') + ago(offerOut.age) : '')

    const lanesOut = [...lanes.values()].map((l) => {
      // PATIENCE: the real elapsed time of the oldest call still in flight on this lane, as a slowly filling arc
      let oldest = Infinity
      for (const st of l.inflight.values()) if (st < oldest) oldest = st
      const age = l.inflight.size ? t - oldest : 0
      // WORN: a path taken often this session is a habit — it reaches out quicker and its filament sits heavier (log scale, ≤1 at ~16 calls)
      const wornAmt = clamp(Math.log10(worn.get(l.key) || 1) / 1.2)
      return {
        key: l.key, family: l.family, label: l.label, angle: l.angle,
        reach: l.retractAt >= 0 ? 1 - easeOut((t - l.retractAt) / 0.7) : easeOut((t - l.bornAt) / (0.4 - 0.15 * wornAmt)),
        inflight: l.inflight.size, pulses: l.pulses, errAge: t - l.errAt,
        asking: !!askLane && askLane.key === l.key,
        age, patience: age > 1.5 ? 1 - Math.exp(-(age - 1.5) / 25) : 0,
        fail: l.fail, mendAge: t - l.mendAt, handAge: t - (l.handAt ?? -99), deniedAge: t - l.deniedAt, beat: l.beat.at(t), worn: wornAmt, calls: worn.get(l.key) || 0,
        // a lane whose last calls keep failing stays warm with it; one clean call and it cools (and mends)
        colour: laneColour(colours.body, l, Math.max(Math.exp(-(t - l.errAt) / 1.2), Math.min(0.5, 0.2 * l.fail))),
      }
    })
    return {
      t, entity, e, ask, askLane: lanesOut.find((l) => l.asking) || null, compact: compactAmt, awaiting, rest, deep, stir, stirring: stirK, woke, wake, bloom, recoil, halt, shift, echoes, damp, hold, spin, active,
      endReason: end && end.reason, since, colours, mode, hover, glyph: glyph(mode), motes, theme: opts.theme || 'dark', lanes: lanesOut,
      offer: offerOut, handoff: handoffOut, side: sideOut, sideDone: sideDoneOut,
      attendAmt: e.attend,
      depth, turns: turnCount, stars: stars.map((s, i) => ({ i, a: s.a, r: s.r, w: s.w, merged: !!s.merged })),
      condense: condense ? { u: clamp((t - condense.at) / 1.4), from: condense.from } : null,
      looks: { ...looks }, mendSince: t - mendLookAt, react: reactOut, queue: queueOut, take: takeOut,
      // her painter's inks: the think, speak and mend seeds of the palette, the colours it is asked to paint in
      inks: [1, 2, 6].map((i) => (PALETTES[opts.palette] || PALETTES.spark)[i].map((v) => (opts.theme === 'light' ? v * 0.6 : v))),
    }
  }

  return { apply, sample, log, get lanes() { return lanes }, get offer() { return offer }, get pendingCalls() { return callLane.size } }
}

// Where a side question's satellite is after `age` seconds out: a slow orbit from the top, a turn every ~14 s
function sideAngle(age) { return -Math.PI / 2 + age * 0.45 }

// How long something has really been waiting, said plainly (never a countdown)
function ago(s) {
  const m = Math.floor(s / 60)
  return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 >= 5 ? ' ' + (m % 60) + ' min' : '')
}

// ------------------------------------------------------------------ scenes
// A scene is a flat list of primitives in unit space (-1.2..1.2, y down). The software rasteriser draws it for the
// terminal (half-block cells or kitty pixels). Each primitive has a stable id.

const P = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
function bez(p0, p1, p2, p3, u) {
  const v = 1 - u
  return [v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
    v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]]
}
function angleToward(a, target, k) {
  const d = ((target - a + Math.PI * 3) % TAU) - Math.PI
  return a + d * k
}

export function buildScene(f, lod = 'panel') {
  const out = []
  const tiny = lod === 'tiny'
  const light = f.theme === 'light'
  const { body, tip, core } = f.colours
  const amb = f.damp
  const t = f.t
  const breath = Math.sin((TAU * t) / 5.5) * 0.035 * amb                      // AMBIENT
  const sway = (i) => Math.sin(t * 0.7 + i * 1.7) * 0.06 * amb                 // AMBIENT
  const squash = 1 - 0.42 * f.compact                                          // EVENT: compaction (eased)
  const sq = ([x, y]) => [x, y * squash]

  // ---- lanes first (they sit under the body)
  const laneAnchor = 0.16
  for (const l of f.lanes) laneScene(out, l, f, laneAnchor, tiny)
  if (f.react) reactScene(out, f, tiny)

  {
    const N = tiny ? 7 : 13
    const r = rng(7)
    const tendrils = []
    const lk = f.looks || {}
    const thinkCurl = [1.4, 0.3, 0.2, 0.6][Math.max(0, lk.think | 0)] ?? 1.4 // coil curls in hard; the others leave room for their own figure
    for (let i = 0; i < N; i++) {
      const a0 = (TAU * i) / N + (r() - 0.5) * 0.36
      const L0 = 0.62 + r() * 0.3
      const c0 = (0.38 + r() * 0.25) * (i % 4 ? 1 : -0.6)
      let a = a0 + 0.09 * Math.sin((TAU * t) / 90) * amb + f.spin * 0.05 // slow drift + stream-driven turn
      a = angleToward(a, Math.PI / 2, 0.22 * f.e.attend)                   // EVENT: leans toward the prompt while you type
      if (f.react && f.react.move === 'lean') a = angleToward(a, f.react.a, 0.35 * f.react.k) // EVENT: she leans toward her painting
      if (f.ask) a = f.askLane && i === 0 ? angleToward(a, f.askLane.angle, 0.8) : angleToward(a, Math.PI / 2, 0.25)
      if (lk.err === 1 && f.endReason === 'error' && f.recoil > 0.02) a += 0.1 * f.recoil * Math.sin(f.since * 38 + i * 2.3) // EVENT look: an error as a shiver
      if (lk.speak === 1) a = angleToward(a, -Math.PI / 2, 0.14 * f.e.speak)                     // EVENT look: writing as a fountain, lifting
      const spring = f.bloom * Math.sin(f.since * 9) * (lk.land > 0 ? 0.06 : 0.12) // TRANSITION: settles after a turn lands
      let L = L0 * (1 + breath) * (1 - 0.3 * f.e.think + 0.24 * f.e.speak + spring) * (1 - 0.32 * f.recoil)
      if (f.awaiting) L *= 0.9
      if (f.rest) L *= 1 - 0.12 * f.rest
      if (f.deep) L *= 1 - 0.2 * f.deep                                    // dozing: the form folds like a bud
      if (f.halt) L *= 1 - 0.2 * f.halt                                    // a refusal: gathered in, composed
      if (f.woke) L *= 0.35 + 0.65 * easeOut(f.wake)                       // EVENT: first light, tendrils unfurl
      if (f.react) L *= f.react.move === 'bloom' ? 1 + 0.14 * f.react.k : f.react.move === 'hush' ? 1 - 0.12 * f.react.k : 1
      if (f.ask && f.askLane && i === 0) L = Math.max(L, 0.9 * f.askLane.reach)
      if (lk.think === 3) L *= 1 + 0.14 * f.e.think * Math.sin(f.spin * 2.2 + i * 0.5) // EVENT look: thinking as a pulse through the form
      if (lk.speak === 2) L *= 1 + 0.16 * f.e.speak * Math.sin(f.spin * 2.5 - i * 1.1) // EVENT look: writing as ripples along the form
      const tide = lk.think === 1 ? 0.55 * f.e.think * Math.sin(f.spin * 1.6 - i * 0.9) : 0 // EVENT look: thinking as a tide around it
      const curl = c0 * (1 + thinkCurl * f.e.think - 0.55 * f.e.speak + 1.2 * f.compact) + sway(i) + tide
      const p0 = P(0.08, a), p1 = P(0.4 * L, a - curl * 0.3), p2 = P(0.8 * L, a + curl * 0.9), p3 = P(L, a + curl * 0.5)
      const steps = tiny ? 6 : 12
      const pts = []
      for (let k = 0; k <= steps; k++) pts.push(sq(bez(p0, p1, p2, p3, k / steps)))
      tendrils.push({ p0, p1, p2, p3 })
      out.push({ id: 'ten' + i, k: 'path', pts, w: tiny ? 0.05 : 0.016, c0: arr(core), c1: arr(tip), a: 0.95 - 0.35 * f.rest })
      const tipR = (tiny ? 0.07 : 0.026) * (1 + (lk.speak === 3 ? 1.4 : 0.5) * f.e.speak) // flares: the tips light up
      out.push({ id: 'tip' + i, k: 'dot', x: pts[steps][0], y: pts[steps][1], r: tipR, c: arr(tip), a: 0.95 })
    }
    // EVENT motes: one per real stream chunk (a few per chunk), never on a timer
    for (const m of f.motes) {
      const age = (t - m.t) / 1.2
      if (age < 0) continue
      if (m.kind === 'thinking') {
        let x, y
        if (lk.think === 1) { x = 0.1 * Math.sin(age * 5 + m.s * TAU); y = -0.08 - 0.5 * age }                     // tide: rising
        else if (lk.think === 2) [x, y] = P(0.08 + 0.28 * easeOut(age * 1.6), (Math.round(m.s * 8) / 8) * TAU + f.spin * 0.4) // lattice: to a node
        else if (lk.think === 3) [x, y] = P(0.1 + 0.3 * age, m.s * TAU)                                              // pulse: straight out
        else [x, y] = P(0.1 + 0.12 * age, m.s * TAU + age * 3.2 + f.spin * 0.2)                                    // coil: spiralling
        ;[x, y] = sq([x, y])
        out.push({ id: 'm' + m.t, k: 'dot', x, y, r: tiny ? 0.05 : lk.think > 0 ? 0.024 : 0.016, c: arr(core), a: 0.9 * (1 - age) })
      } else if (lk.speak === 1) { // fountain: each chunk arcs up out of the core and falls away
        const trail = tiny ? 1 : 3
        for (let k = 0; k < trail; k++) {
          const u = clamp(age - k * 0.05)
          const [x, y] = sq([(m.s - 0.5) * 0.9 * u, -0.6 * u + 0.75 * u * u])
          out.push({ id: 'm' + m.t + ':' + k, k: 'dot', x, y, r: (tiny ? 0.05 : 0.028) * (1 - k * 0.2), c: arr(k ? tip : core), a: (1 - age) * (1 - k * 0.25) })
        }
      } else if (lk.speak === 3) { // flares: each chunk lights a tendril's tip
        const tn = tendrils[m.i % N]
        const [x, y] = sq(tn.p3)
        out.push({ id: 'm' + m.t, k: 'glow', x, y, r: (tiny ? 0.1 : 0.08) * (0.6 + age), c: arr(tip), a: 0.8 * (1 - age) })
        out.push({ id: 'm' + m.t + ':c', k: 'dot', x, y, r: tiny ? 0.06 : 0.03, c: arr(core), a: 1 - age })
      } else {
        const tn = tendrils[m.i % N]
        const trail = tiny ? 1 : 4
        for (let k = 0; k < trail; k++) {
          const u = clamp(age - k * 0.05)
          const [x, y] = sq(bez(tn.p0, tn.p1, tn.p2, tn.p3, u))
          out.push({ id: 'm' + m.t + ':' + k, k: 'dot', x, y, r: (tiny ? 0.05 : 0.018) * (1 - k * 0.2), c: arr(k ? tip : core), a: (1 - age) * (1 - k * 0.25) })
        }
      }
    }
    // core: halo, a ring of beads turned by the stream, a bright centre
    const haloR = 0.26 * (1 + 0.7 * f.e.think + 0.35 * f.e.speak + 0.6 * f.bloom + 0.25 * f.e.mend) * (1 + breath) * (f.woke ? 0.5 + 0.5 * easeOut(f.wake) : 1)
    out.unshift({ id: 'halo', k: 'glow', x: 0, y: 0, r: haloR, c: arr(body), a: light ? 0.35 : 0.85 - 0.4 * f.rest - 0.15 * f.deep })
    if (!tiny) {
      for (let k = 0; k < 10; k++) {
        const [x, y] = sq(P(0.062, (TAU * k) / 10 - f.spin * 0.6 - t * 0.5 * amb))
        out.push({ id: 'bead' + k, k: 'dot', x, y, r: 0.009, c: arr(core), a: 0.95 })
      }
    }
    expressions(out, f, { tiny, tip, core, sq, amb })
    out.push({ id: 'centre', k: 'dot', x: 0, y: 0, r: (tiny ? 0.11 : 0.034) * (1 + 0.25 * f.e.think + 0.3 * f.bloom), c: arr(core), a: 1 })
  }

  // permission ask: the whole entity holds still, a gate forms on the asking lane (drawn in laneScene)
  return out
}

// Everything below is a real event echoing: nothing here runs on its own clock except the faint ambient twinkle of stars.
function expressions(out, f, { tiny, tip, core, sq, amb }) {
  const t = f.t
  // FIRST LIGHT: a ring leaves the centre once, when the session really begins (or is cleared)
  const lk = f.looks || {}
  if (f.woke && f.wake < 1) {
    const v = easeOut(f.wake)
    // first light always leaves its ring; the other ways of saying it draw it fainter, beside their own figure
    out.push({ id: 'firstlight', k: 'ring', x: 0, y: 0, r: 0.08 + 1.0 * v, w: 0.002 + 0.012 * (1 - f.wake), c: arr(tip), a: (lk.wake > 0 && !tiny ? 0.3 : 0.85) * (1 - f.wake) })
    if (lk.wake === 1 && !tiny) for (let j = 0; j < 13; j++) { // unfurl: a spiral of light opening
      const [x, y] = sq(P(0.08 + 0.8 * v * (j / 13), j * 0.48 + f.wake * 1.5))
      out.push({ id: 'wake' + j, k: 'dot', x, y, r: 0.024, c: arr(tip), a: 0.9 * (1 - f.wake) })
    } else if (lk.wake === 2 && !tiny) for (let j = 0; j < 8; j++) { // rays: eight strokes of first light
      const a = (TAU * j) / 8 + 0.2
      out.push({ id: 'wake' + j, k: 'path', pts: [sq(P(0.1 + 0.3 * v, a)), sq(P(0.1 + 0.75 * v, a))], w: 0.014, c0: arr(core), c1: arr(tip), a: 0.85 * (1 - f.wake) })
    }
  }
  if (!tiny) looksScene(out, f, lk, { tip, core, sq })
  // STIR: roused after a long silence — a quieter cousin of first light: one soft ring stretches out as the fold lets go
  if (f.stir > 0.03) out.push({ id: 'stir', k: 'ring', x: 0, y: 0, r: 0.12 + 0.55 * easeOut(1 - f.stirring), w: 0.003 + 0.008 * f.stirring, c: arr(core), a: 0.55 * f.stir })
  // DEPTH: the harder the model is asked to think (turn.step effort), the more orbits form around the core while it does
  if (!tiny && f.depth > 0 && f.e.think > 0.08) {
    const n = 1 + Math.round(f.depth * 3)
    const k0 = Math.min(1, f.e.think * 1.6)
    for (let k = 0; k < n; k++) {
      out.push({ id: 'orbit' + k, k: 'ring', x: 0, y: 0, r: 0.115 + 0.05 * k, w: 0.005, c: arr(core), a: 0.75 * k0 })
      const oa = f.spin * (0.9 + 0.35 * k) * (k % 2 ? -1 : 1) + k * 1.9
      const [x, y] = sq(P(0.115 + 0.05 * k, oa))
      out.push({ id: 'orbitbead' + k, k: 'dot', x, y, r: 0.0085, c: arr(core), a: 0.95 * k0 })
    }
  }
  // MODEL SHIFT: the model that answered changed — one thin ring crosses the form
  if (f.shift > 0.02) out.push({ id: 'shift', k: 'ring', x: 0, y: 0, r: 0.2 + 0.85 * (1 - f.shift), w: 0.004 + 0.006 * f.shift, c: arr(tip), a: 0.7 * f.shift })
  // ECHOES: each lane a turn reached through leaves one ring behind when the answer lands
  for (const ec of f.echoes) out.push({ id: 'echo' + ec.k, k: 'ring', x: 0, y: 0, r: 0.3 + 0.85 * easeOut(ec.u), w: 0.002 + 0.007 * (1 - ec.u), c: arr(tip), a: 0.55 * Math.pow(1 - ec.u, 1.2) })
  // HALT: a refusal is a boundary, not a fault — a still double ring, no red, fading slowly
  if (f.halt > 0.02) {
    out.push({ id: 'halt', k: 'ring', x: 0, y: 0, r: 0.42, w: 0.009, c: arr(core), a: 0.85 * f.halt })
    out.push({ id: 'halt2', k: 'ring', x: 0, y: 0, r: 0.47, w: 0.004, c: arr(tip), a: 0.5 * f.halt })
  }
  // CONSTELLATION: one star per answered turn, gathered into one brighter star by a compaction.
  // Brighter while dozing (the session's memory comes out), dimmer while resting.
  if (!tiny && f.stars.length) {
    const vis = 1 - 0.45 * f.rest + 0.65 * f.deep
    const cd = f.condense
    if (cd && cd.u < 1) { // the old stars travelling in
      const m = f.stars[0]
      const [mx, my] = P(m.r, m.a)
      const ease = cd.u * cd.u
      cd.from.forEach((s, i) => {
        const [x0, y0] = P(s.r, s.a)
        const [x, y] = sq([x0 + (mx - x0) * ease, y0 + (my - y0) * ease])
        out.push({ id: 'cs' + i, k: 'dot', x, y, r: 0.014, c: arr(tip), a: 0.85 * (1 - cd.u) })
      })
    }
    f.stars.forEach((s, i) => {
      const appear = f.condense && s.merged ? easeOut(f.condense.u) : 1
      const [x, y] = sq(P(s.r, s.a))
      const tw = 1 - 0.28 * amb * (0.5 + 0.5 * Math.sin(t * (0.8 + 0.37 * (i % 7)) + i * 2.1))
      const r = (0.011 + 0.015 * s.w + (s.merged ? 0.012 : 0)) * appear
      const a = Math.min(1, (0.5 + 0.45 * s.w) * tw * vis) * appear
      const c = arr(s.merged ? core : tip)
      if (s.merged || s.w > 0.35) out.push({ id: 'sg' + i, k: 'glow', x, y, r: 0.045 + 0.045 * s.w + (s.merged ? 0.03 : 0), c, a: 0.4 * vis * appear })
      out.push({ id: 'star' + i, k: 'dot', x, y, r, c, a })
      if (s.merged || s.w > 0.6) { // a four-point sparkle for the heavy ones: long turns, and the gathered star
        const L = 0.05 + 0.04 * s.w + (s.merged ? 0.03 : 0)
        out.push({ id: 'sp' + i + 'a', k: 'path', pts: [[x - L, y], [x + L, y]], w: 0.003, c0: c, c1: c, a: a * 0.7 })
        out.push({ id: 'sp' + i + 'b', k: 'path', pts: [[x, y - L], [x, y + L]], w: 0.003, c0: c, c1: c, a: a * 0.7 })
      }
    })
    if (cd && cd.u > 0.85 && cd.u < 1) { // the gathering lands: one small ring from the new star
      const m = f.stars[0], [x, y] = sq(P(m.r, m.a)), v = (cd.u - 0.85) / 0.15
      out.push({ id: 'csring', k: 'ring', x, y, r: 0.03 + 0.12 * v, w: 0.004, c: arr(core), a: 0.7 * (1 - v) })
    }
  }
  offering(out, f, { tiny, tip, core, sq, amb })
  queueing(out, f, { tiny, tip, core, sq })
  if (f.side) { // a side question out: a small satellite, apart from the work
    const [x, y] = sq(P(0.6, f.side.a))
    out.push({ id: 'sideglow', k: 'glow', x, y, r: tiny ? 0.12 : 0.06, c: arr(tip), a: 0.5 })
    out.push({ id: 'side', k: 'dot', x, y, r: tiny ? 0.06 : 0.016, c: arr(core), a: 0.95 })
    if (!tiny) out.push({ id: 'sidering', k: 'ring', x, y, r: 0.034, w: 0.003, c: arr(tip), a: 0.6 })
  }
  if (f.sideDone && f.sideDone.u < 1) { // its answer came: the satellite opens into a soft ring (dimmer if there was no answer)
    const [x, y] = sq(P(0.6, f.sideDone.a)), v = easeOut(f.sideDone.u)
    out.push({ id: 'sidedone', k: 'ring', x, y, r: 0.03 + 0.12 * v, w: tiny ? 0.02 : 0.005, c: arr(tip), a: (f.sideDone.ok ? 0.8 : 0.35) * (1 - f.sideDone.u) })
  }
}

// The other ways of saying things (LOOKS): each drawn only while its real expression is under way
function looksScene(out, f, lk, { tip, core, sq }) {
  const k0 = Math.min(1, f.e.think * 1.6)
  if (lk.think === 2 && f.e.think > 0.08) { // lattice: thought as a figure of nodes and chords, turned by the stream
    const nodes = []
    for (let j = 0; j < 8; j++) nodes.push(sq(P(0.36, (TAU * j) / 8 + f.spin * 0.4)))
    nodes.forEach(([x, y], j) => {
      const [x2, y2] = nodes[(j + 3) % 8]
      out.push({ id: 'lat' + j, k: 'path', pts: [[x, y], [x2, y2]], w: 0.006, c0: arr(core), c1: arr(tip), a: 0.55 * k0 })
      out.push({ id: 'node' + j, k: 'dot', x, y, r: 0.02, c: arr(core), a: 0.95 * k0 })
    })
  }
  if (lk.think === 3 && f.e.think > 0.08) for (let j = 0; j < 3; j++) { // pulse: rings leaving the core in time with the stream
    const u = (f.spin * 0.25 + j / 3) % 1
    out.push({ id: 'pulse' + j, k: 'ring', x: 0, y: 0, r: 0.15 + 0.55 * u, w: 0.012, c: arr(core), a: 0.7 * k0 * (1 - u) })
  }
  if (lk.speak === 2 && f.e.speak > 0.08) for (let j = 0; j < 2; j++) { // ripples: soft broken rings carried out by the stream
    const u = (f.spin * 0.18 + j / 2) % 1
    out.push({ id: 'ripple' + j, k: 'ring', x: 0, y: 0, r: 0.3 + 0.6 * u, w: 0.012, c: arr(tip), a: 0.75 * Math.min(1, f.e.speak * 1.6) * (1 - u), dash: true })
  }
  // an answer landing, said another way
  if (f.endReason === 'answer' && f.since < 1.6 && lk.land > 0) {
    const u = clamp(f.since / 1.5), v = easeOut(u), fade = 1 - u
    if (lk.land === 1) for (let j = 0; j < 8; j++) { // petals
      const [x, y] = sq(P(0.22 + 0.5 * v, (TAU * j) / 8 + 0.3))
      out.push({ id: 'petal' + j, k: 'dot', x, y, r: 0.03 * (1 - 0.4 * u), c: arr(tip), a: fade })
    } else if (lk.land === 2) { // halo: a bright ring, then its echo
      out.push({ id: 'land0', k: 'ring', x: 0, y: 0, r: 0.3 + 0.25 * v, w: 0.018 * fade + 0.006, c: arr(core), a: 0.85 * fade })
      const u2 = clamp((f.since - 0.25) / 1.3)
      if (u2 > 0 && u2 < 1) out.push({ id: 'land1', k: 'ring', x: 0, y: 0, r: 0.3 + 0.4 * easeOut(u2), w: 0.01, c: arr(tip), a: 0.6 * (1 - u2) })
    } else for (let j = 0; j < 12; j++) { // spiral
      const [x, y] = sq(P(0.15 + 0.6 * v * ((j + 1) / 12), j * 0.55 + u * 2))
      out.push({ id: 'spiral' + j, k: 'dot', x, y, r: 0.024, c: arr(j % 3 ? tip : core), a: fade * (0.5 + 0.5 * (j / 12)) })
    }
  }
  // an error, said as a crack in a ring (always the error red)
  if (lk.err === 2 && f.endReason === 'error' && f.recoil > 0.02) out.push({ id: 'crack', k: 'ring', x: 0, y: 0, r: 0.34, w: 0.016, c: [0.95, 0.34, 0.36], a: 0.9 * f.recoil, dash: true })
  // a mend: the thread knit back together, at the core
  if (f.mendSince < 1.6) {
    const u = clamp(f.mendSince / 1.6), v = easeOut(u), fade = 1 - u
    if (lk.mend === 0) out.push({ id: 'knit', k: 'ring', x: 0, y: 0, r: 0.55 - 0.3 * v, w: 0.014, c: arr(tip), a: 0.75 * fade })
    else if (lk.mend === 1) for (let j = 0; j < 6; j++) { // seeds drawn back in
      const [x, y] = sq(P(0.6 - 0.55 * v, (TAU * j) / 6 + 0.5))
      out.push({ id: 'seed' + j, k: 'dot', x, y, r: 0.026, c: arr(tip), a: 0.95 * fade })
    } else for (let h = 0; h < 2; h++) { // two halves closing into one ring
      const pts = []
      const a0 = h * Math.PI + (1 - v) * 1.2 * (h ? 1 : -1)
      for (let j = 0; j <= 10; j++) pts.push(sq(P(0.4, a0 + (j / 10) * Math.PI * (0.55 + 0.45 * v))))
      out.push({ id: 'close' + h, k: 'path', pts, w: 0.014, c0: arr(core), c1: arr(tip), a: 0.8 * fade })
    }
  }
  // a call going out, said as a flare at its root or a spark along its way
  for (const l of f.lanes) for (const p of l.pulses) {
    if (p.dir !== 1 || !p.look) continue
    const u = clamp((f.t - p.t) / 0.6)
    if (u >= 1) continue
    if (p.look === 1) { const [x, y] = sq(P(0.2, l.angle)); out.push({ id: 'flare' + l.key + p.t, k: 'glow', x, y, r: 0.07 + 0.08 * u, c: arr(l.colour), a: 0.6 * (1 - u) }) }
    else { const [x, y] = sq(P(0.12 + 0.55 * u, l.angle)); out.push({ id: 'spk' + l.key + p.t, k: 'dot', x, y, r: 0.024, c: arr(core), a: 1 - u }) }
  }
}

// READY and COPIED. When a turn ends with nothing done about it yet, Spark holds it out toward you, just below the core on
// the side the prompt is: a bead the size of what was really written (one line is a seed, a long answer a full pearl),
// on a faint stem, ringed by a slow breath. It stays, whatever else Spark is doing at rest, until you act: a new prompt,
// or a copy (/copy). A copy hands it over: the bead travels out to you and opens into a ring.
// A turn that stopped on an error leaves a hollow red-touched ring instead; a refusal a hollow plain one. Nothing to copy
// from those, but still something waiting for you to look at.
const READY_Y = 0.42

// QUEUED and TAKEN. A message you send while she works waits at her lower edge, on the side the prompt is: a small bead
// that breathes, one per message (three drawn at most). When the model really takes it into the turn, it travels in to
// her core, said one of three ways (rolled): drunk straight up into her, spiralled in, or caught by a tendril that
// reaches down for it. The core answers with a ring drawing inward: taken in, not sent out.
const QUEUE_Y = 0.92
function queueing(out, f, { tiny, tip, core, sq }) {
  const t = f.t
  const ink = f.inks ? f.inks[1] : arr(tip) // her speak colour: something of yours, warm, apart from her white tips
  const bead = tiny ? 0.07 : 0.045
  if (f.queue) f.queue.ages.forEach((age, i) => {
    const x = (i - (Math.min(3, f.queue.n) - 1) / 2) * 0.2
    const [qx, qy] = sq([x, QUEUE_Y])
    const born = easeOut(age / 0.5), breath = 0.6 + 0.4 * Math.sin((TAU * (t + i * 0.7)) / 2.4)
    out.push({ id: 'qglow' + i, k: 'glow', x: qx, y: qy, r: (tiny ? 0.14 : 0.1) * born, c: ink, a: 0.55 * breath })
    out.push({ id: 'qring' + i, k: 'ring', x: qx, y: qy, r: bead * (1.5 + 0.5 * breath) * born, w: tiny ? 0.03 : 0.008, c: ink, a: 0.8 * breath, dash: true })
    out.push({ id: 'qbead' + i, k: 'dot', x: qx, y: qy, r: bead * born, c: ink, a: 1 })
    out.push({ id: 'qheart' + i, k: 'dot', x: qx, y: qy, r: bead * 0.45 * born, c: arr(core), a: 0.9 })
  })
  const k = f.take
  if (!k) return
  const look = (f.looks && f.looks.take) | 0
  const way = (u) => { // where the bead is at u (0 where it waited, 1 at her core), said the rolled way
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2 // eased both ends: it is drawn in, not thrown
    if (look === 1) { const a = Math.PI / 2 + e * TAU * 1.25, r = QUEUE_Y * (1 - e); return [r * Math.cos(a), r * Math.sin(a)] } // spiral
    if (look === 2) { const up = clamp((u - 0.4) / 0.6); return [0, QUEUE_Y * (1 - (up < 0.5 ? 2 * up * up : 1 - Math.pow(-2 * up + 2, 2) / 2))] } // caught, then brought in
    return [0, QUEUE_Y * (1 - e)] // drink: straight up into her
  }
  if (k.u < 1) {
    if (look === 2) { // catch: a tendril reaches down for it first
      const down = clamp(k.u / 0.4), tipY = k.u < 0.4 ? QUEUE_Y * easeOut(down) : way(k.u)[1]
      const pts = []
      for (let j = 0; j <= 10; j++) { const v = j / 10; pts.push(sq([Math.sin(v * Math.PI) * 0.12, tipY * v])) }
      out.push({ id: 'qcatch', k: 'path', pts, w: tiny ? 0.05 : 0.02, c0: arr(core), c1: ink, a: 0.95 })
    }
    for (let j = 3; j >= 0; j--) { // the bead, with a short trail of where it has just been
      const [bx, by] = sq(way(Math.max(0, k.u - j * 0.05)))
      if (j === 0) {
        out.push({ id: 'qtakeg', k: 'glow', x: bx, y: by, r: tiny ? 0.14 : 0.1, c: ink, a: 0.6 })
        out.push({ id: 'qtake', k: 'dot', x: bx, y: by, r: bead * (1 - 0.3 * k.u), c: ink, a: 1 })
      } else out.push({ id: 'qtr' + j, k: 'dot', x: bx, y: by, r: bead * (0.7 - 0.15 * j), c: ink, a: 0.5 - 0.12 * j })
    }
  }
  if (k.u > 0.75) { // taken in: a ring drawing inward to the core, and the core brightens
    const v = clamp((k.age - 1.05) / 0.9)
    if (v < 1) {
      out.push({ id: 'qin', k: 'ring', x: 0, y: 0, r: 0.7 - 0.6 * easeOut(v), w: tiny ? 0.05 : 0.016, c: ink, a: 0.9 * (1 - v) })
      out.push({ id: 'qinglow', k: 'glow', x: 0, y: 0, r: 0.25, c: ink, a: 0.5 * Math.sin(Math.PI * v) })
    }
  }
}

function offering(out, f, { tiny, tip, core, sq, amb }) {
  const t = f.t
  const o = f.offer
  if (o && o.amt > 0.01) {
    const [x, y] = sq([0, 0.08 + (READY_Y - 0.08) * o.amt])
    const breath = 0.5 + 0.5 * Math.sin((TAU * t) / 3.2)
    if (o.kind === 'answer') {
      const r = (tiny ? 0.075 : 0.03) * (0.8 + 0.7 * o.size) * (0.6 + 0.4 * o.amt)
      if (!tiny) out.push({ id: 'readystem', k: 'path', pts: [sq([0, 0.08]), [x, y - r * 1.4]], w: 0.004, c0: arr(core), c1: arr(tip), a: 0.35 * o.amt })
      out.push({ id: 'readyglow', k: 'glow', x, y, r: r * (tiny ? 2.2 : 4.6), c: arr(tip), a: (0.7 + 0.2 * breath * amb) * o.amt })
      out.push({ id: 'ready', k: 'dot', x, y, r, c: arr(core), a: o.amt })
      if (!tiny) out.push({ id: 'readyring', k: 'ring', x, y, r: r * (2.1 + 0.35 * breath * amb), w: 0.005, c: arr(tip), a: (0.75 - 0.2 * breath * amb) * o.amt })
    } else {
      const c = o.kind === 'error' ? [0.95, 0.34, 0.36] : arr(core)
      const r = tiny ? 0.07 : 0.034
      out.push({ id: 'ready', k: 'ring', x, y, r, w: tiny ? 0.03 : 0.01, c, a: 0.95 * o.amt })
      if (!tiny) out.push({ id: 'readyring', k: 'ring', x, y, r: r * (1.9 + 0.25 * breath * amb), w: 0.004, c, a: 0.5 * o.amt })
    }
  }
  const h = f.handoff
  if (h && h.u < 1) {
    const v = easeOut(h.u)
    if (h.had === 'answer') { // the bead goes out to you and opens
      const r = (tiny ? 0.075 : 0.03) * (0.8 + 0.7 * h.size)
      const [x, y] = sq([0, READY_Y + 0.34 * v])
      out.push({ id: 'handoff', k: 'dot', x, y, r: r * (1 - 0.7 * v), c: arr(core), a: 1 - v })
      out.push({ id: 'handoffglow', k: 'glow', x, y, r: r * (4.6 + 3 * v), c: arr(tip), a: 0.7 * (1 - v) })
      out.push({ id: 'handoffring', k: 'ring', x, y, r: r * (2.1 + 5 * v), w: (tiny ? 0.025 : 0.009) * (1 - 0.6 * v), c: arr(tip), a: 0.95 * (1 - h.u) })
      if (!tiny) for (let k = 0; k < 3; k++) { // three motes left in its wake, falling back toward the core
        const a = Math.PI / 2 + (k - 1) * 0.55
        const [mx, my] = sq([Math.cos(a) * 0.1 * v, READY_Y + Math.sin(a) * 0.1 * v - 0.12 * v])
        out.push({ id: 'handoffmote' + k, k: 'dot', x: mx, y: my, r: 0.009, c: arr(tip), a: 0.8 * (1 - h.u) })
      }
    } else { // copied again, or with nothing held out: one small, quiet ring where the bead would be
      const [x, y] = sq([0, READY_Y])
      out.push({ id: 'handoffring', k: 'ring', x, y, r: (tiny ? 0.06 : 0.02) + 0.11 * v, w: tiny ? 0.02 : 0.004, c: arr(tip), a: 0.45 * (1 - h.u) })
    }
  }
}

// How she answers a painting that just arrived (the painter's choice, from moves she has). Lean and hush move her
// tendrils (above); these are drawn
function reactScene(out, f, tiny) {
  const { move, u, k } = f.react
  const { tip, core } = f.colours
  if (move === 'bloom') out.push({ id: 'react:bloom', k: 'glow', x: 0, y: 0, r: 0.45 + 0.3 * u, c: arr(tip), a: 0.55 * k })
  else if (move === 'ring') out.push({ id: 'react:ring', k: 'ring', x: 0, y: 0, r: 0.15 + 0.85 * easeOut(u), w: tiny ? 0.04 : 0.012, c: arr(core), a: 1 - u })
  else if (move === 'shimmer') for (let i = 0; i < 10; i++) {
    const [x, y] = P(0.55 + 0.2 * ((i * 0.618) % 1), (TAU * i) / 10 + 0.3)
    out.push({ id: 'react:sh' + i, k: 'dot', x, y, r: tiny ? 0.06 : 0.045, c: f.inks ? f.inks[i % 3] : arr(i % 2 ? tip : core), a: k * (0.6 + 0.4 * Math.sin(f.t * 14 + i * 2.1)) })
  }
}

function laneScene(out, l, f, anchor, tiny) {
  const t = f.t
  const c = arr(l.colour)
  const reach = l.reach
  if (reach <= 0.01) return
  const peer = l.family === 'peer' // Keeper gets real room for his own eye
  const R = peer ? 0.5 + 0.3 * reach : (0.62 + 0.36 * reach) * (tiny ? 0.95 : 1)
  const a = l.angle
  const [nx, ny0] = P(R, a)
  const s = (tiny ? 0.11 : 0.05) * (0.4 + 0.6 * reach) * (peer && !tiny ? 2.6 : 1)
  const endR = peer ? R - s * 1.12 : R // a peer's filament stops at the edge of the contact, leaving his slot clear
  const ny = ny0 * (1 - 0.42 * f.compact)
  const [sx, sy] = P(anchor, a)
  const [ex, ey0] = P(endR, a)
  const ey = ey0 * (1 - 0.42 * f.compact)
  // the filament: curved, kinked for a moment after an error
  const kink = l.errAge < 1.2 ? Math.sin(l.errAge * 30) * 0.06 * (1 - l.errAge / 1.2) : 0
  const bend = 0.12
  const mid = [(sx + ex) / 2 + Math.cos(a + Math.PI / 2) * (bend + kink), (sy + ey) / 2 + Math.sin(a + Math.PI / 2) * (bend + kink)]
  const pts = []
  const steps = tiny ? 5 : 14
  for (let k = 0; k <= steps; k++) {
    const u = k / steps
    pts.push([(1 - u) * (1 - u) * sx + 2 * (1 - u) * u * mid[0] + u * u * ex, (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * mid[1] + u * u * ey])
  }
  const lit = l.inflight ? 1 : 0.45
  const worn = l.worn || 0 // WORN: a well-used path this session is drawn a touch heavier (never brighter: habit, not importance)
  out.push({ id: 'lf:' + l.key, k: 'path', pts, w: (tiny ? 0.03 : 0.009) * (1 + 0.6 * worn), c0: c, c1: c, a: (0.35 + 0.5 * lit) * reach })
  if (l.family === 'paint' && f.inks) out.push({ id: 'lf2:' + l.key, k: 'path', pts, w: tiny ? 0.03 : 0.014, c0: f.inks[0], c1: f.inks[1], a: (0.3 + 0.45 * lit) * reach })
  if (l.family === 'peer' && !tiny) { // a conversation runs both ways: a second strand beside the first
    const off = 0.022, nxo = Math.cos(a + Math.PI / 2) * off, nyo = Math.sin(a + Math.PI / 2) * off
    out.push({ id: 'lf2:' + l.key, k: 'path', pts: pts.map(([x, y], k) => [x + nxo * Math.sin((k / steps) * Math.PI), y + nyo * Math.sin((k / steps) * Math.PI)]), w: 0.006, c0: c, c1: c, a: (0.25 + 0.4 * lit) * reach })
  }
  // EVENT pulses: out on call start, back on result (red-shifted and jagged on error)
  for (const p of l.pulses) {
    const u = clamp((t - p.t) / 0.6)
    const at = p.dir > 0 ? u : 1 - u
    const i = Math.min(steps, Math.round(at * steps))
    out.push({ id: 'lp:' + l.key + p.t, k: 'dot', x: pts[i][0], y: pts[i][1], r: tiny ? 0.06 : 0.022, c: p.err ? [1, 0.3, 0.32] : c, a: 1 - u * 0.6 })
  }
  // the node: geometry signature by family; it only turns while a call is in flight
  const spinIn = l.inflight ? t * 1.6 : 0
  const storm = l.fail >= 2 && l.inflight ? Math.sin(t * 42) * 0.004 * Math.min(3, l.fail) : 0 // a lane that keeps failing stays unsteady
  const jitter = (l.errAge < 1 ? (Math.sin(l.errAge * 60) * 0.012) : 0) + storm
  const X = nx + jitter, Y = ny
  const id = 'ln:' + l.key
  const poly = (n, rad, rot) => { const ps = []; for (let k = 0; k <= n; k++) ps.push([X + rad * Math.cos(rot + (TAU * k) / n), Y + rad * Math.sin(rot + (TAU * k) / n)]); return ps }
  out.push({ id: id + ':g', k: 'glow', x: X, y: Y, r: s * (peer ? 1.5 : 2.6), c, a: (l.inflight ? 0.7 : 0.3) * reach * (peer ? 0.5 : 1) })
  switch (l.family) {
    case 'read': // chevrons drawn inward: material flowing toward the entity
      out.push({ id, k: 'dot', x: X, y: Y, r: s * 0.6, c, a: reach })
      for (let k = 0; k < 2; k++) {
        const d = s * (1.4 + k * 0.9) - (l.inflight ? ((t * 0.12) % (s * 0.9)) : 0)
        const ia = a + Math.PI
        const tipP = [X + Math.cos(ia) * d, Y + Math.sin(ia) * d]
        out.push({ id: id + ':c' + k, k: 'path', pts: [[tipP[0] + Math.cos(ia + 2.4) * s * 0.6, tipP[1] + Math.sin(ia + 2.4) * s * 0.6], tipP, [tipP[0] + Math.cos(ia - 2.4) * s * 0.6, tipP[1] + Math.sin(ia - 2.4) * s * 0.6]], w: 0.008, c0: c, c1: c, a: 0.8 * reach })
      }
      break
    case 'write': // a node laying a short wake of marks
      out.push({ id, k: 'dot', x: X, y: Y, r: s * 0.7, c, a: reach })
      for (let k = 1; k <= 3; k++) out.push({ id: id + ':w' + k, k: 'dot', x: X + Math.cos(a + Math.PI / 2) * s * 1.1 * k, y: Y + Math.sin(a + Math.PI / 2) * s * 1.1 * k, r: s * (0.35 - k * 0.07), c, a: (0.8 - k * 0.2) * reach })
      break
    case 'shell':
      out.push({ id, k: 'path', pts: poly(4, s, spinIn + Math.PI / 4), w: 0.01, c0: c, c1: c, a: reach, closed: true })
      break
    case 'web':
      out.push({ id, k: 'path', pts: poly(24, s * 1.1, spinIn).slice(0, 19), w: 0.01, c0: c, c1: c, a: reach })
      break
    case 'mcp':
      out.push({ id, k: 'path', pts: poly(3 + (hash(l.key) % 4), s * 1.05, spinIn * 0.6), w: 0.01, c0: c, c1: c, a: reach, closed: true })
      break
    case 'model': { // another mind on a lane: a double ring with a satellite — reach, not a replacement
      out.push({ id, k: 'ring', x: X, y: Y, r: s * 0.8, w: 0.009, c, a: reach })
      out.push({ id: id + ':o', k: 'ring', x: X, y: Y, r: s * 1.5, w: 0.006, c, a: 0.6 * reach })
      const sa = (l.inflight ? t * 2.2 : 0) + (hash(l.key) % 100) / 16
      out.push({ id: id + ':s', k: 'dot', x: X + Math.cos(sa) * s * 1.5, y: Y + Math.sin(sa) * s * 1.5, r: s * 0.32, c, a: reach })
      break
    }
    case 'peer': { // Keeper: a peer, not a tool. Spark draws only its side of the contact (an open ring facing it);
      // the inside is Keeper's slot, where the renderer draws his own mark (his eye), never Spark's.
      const open = a + Math.PI
      const ps = []
      for (let k = 0; k <= 20; k++) { const u = open + 0.7 + (k / 20) * (TAU - 1.4); ps.push([X + s * 1.15 * Math.cos(u), Y + s * 1.15 * Math.sin(u)]) }
      out.push({ id, k: 'path', pts: ps, w: 0.011, c0: c, c1: c, a: reach })
      out.push({ id: id + ':slot', k: 'slot', who: 'keeper', x: X, y: Y, r: s * 0.95, reach, asking: l.asking, inflight: l.inflight, t })
      break
    }
    case 'agent': { // a tiny sibling spark; it reaches and turns faster each time the subagent really streams
      const bt = l.beat || 0
      out.push({ id, k: 'dot', x: X, y: Y, r: s * (0.45 + 0.25 * bt), c, a: reach })
      for (let k = 0; k < 5; k++) {
        const ka = (TAU * k) / 5 + spinIn * 0.5 + bt * 1.4
        const g = 1 + 0.55 * bt
        out.push({ id: id + ':t' + k, k: 'path', pts: [[X, Y], [X + Math.cos(ka) * s * 1.1 * g, Y + Math.sin(ka) * s * 1.1 * g], [X + Math.cos(ka + 0.5) * s * 1.6 * g, Y + Math.sin(ka + 0.5) * s * 1.6 * g]], w: 0.007, c0: c, c1: c, a: 0.85 * reach })
      }
      break
    }
    case 'paint': { // her painter: a brush tip with her inks around it, laying a stroke toward the canvas while it paints;
      // a painting handed down drops from it toward the canvas
      const inks = f.inks || [c, c, c]
      const S = s * 2
      const lay = l.inflight ? (t * 0.62) % 1 : 1
      const ox = Math.cos(a) * S * 1.5, oy = Math.sin(a) * S * 1.5
      const px = Math.cos(a + Math.PI / 2), py = Math.sin(a + Math.PI / 2)
      const stroke = []
      for (let k = 0; k <= 10; k++) {
        const u = -1 + 2 * (k / 10) * lay
        const wave = Math.sin(u * 3.2 + (l.inflight ? t * 2 : 0)) * S * 0.3
        stroke.push([X + ox + px * S * 1.6 * u + Math.cos(a) * wave, Y + oy + py * S * 1.6 * u + Math.sin(a) * wave])
      }
      out.push({ id: id + ':st', k: 'path', pts: stroke, w: tiny ? 0.04 : 0.024, c0: inks[0], c1: inks[1], a: (l.inflight ? 0.95 : 0.6) * reach })
      out.push({ id, k: 'dot', x: X, y: Y, r: S * 0.5, c: arr(f.colours.core), a: reach })
      for (let k = 0; k < 3; k++) { // the inks, turning slowly round the tip while it paints
        const ka = (TAU * k) / 3 + (l.inflight ? t * 1.3 : 0) - Math.PI / 2
        out.push({ id: id + ':ink' + k, k: 'dot', x: X + Math.cos(ka) * S, y: Y + Math.sin(ka) * S, r: S * 0.35, c: inks[k], a: reach })
      }
      if (l.handAge >= 0 && l.handAge < 0.8) {
        const u = easeOut(l.handAge / 0.8)
        out.push({ id: id + ':drop', k: 'dot', x: X + Math.cos(a) * (S * 1.5 + 0.34 * u), y: Y + Math.sin(a) * (S * 1.5 + 0.34 * u), r: (tiny ? 0.07 : 0.045) * (1 - 0.4 * u), c: inks[1], a: 1 - 0.7 * u })
      }
      break
    }
    case 'plan':
      for (let k = 0; k < 3; k++) out.push({ id: id + ':p' + k, k: 'path', pts: [[X - s, Y + (k - 1) * s * 0.7], [X + s * (1 - k * 0.25), Y + (k - 1) * s * 0.7]], w: 0.009, c0: c, c1: c, a: reach })
      break
    default:
      out.push({ id, k: 'dot', x: X, y: Y, r: s * 0.7, c, a: reach })
  }
  // PATIENCE: the real elapsed time of the oldest call still out, as an arc that fills ever more slowly (never a countdown)
  if (l.patience > 0 && !tiny) {
    const pr = s * (peer ? 1.75 : 1.8), sweep = l.patience * TAU * 0.94, pts2 = []
    for (let k = 0; k <= 28; k++) { const u = -Math.PI / 2 + (k / 28) * sweep; pts2.push([X + pr * Math.cos(u), Y + pr * Math.sin(u)]) }
    out.push({ id: id + ':pat', k: 'path', pts: pts2, w: 0.006, c0: c, c1: c, a: 0.75 * reach })
    if (l.age > 30) out.push({ id: id + ':pat2', k: 'ring', x: X, y: Y, r: pr * 1.3, w: 0.003, c, a: 0.35 * reach, dash: true }) // a long wait gets a second, fainter orbit
  }
  // MEND: a call settles cleanly where the last one failed — warm light runs back up the thread and the node exhales
  if (l.mendAge >= 0 && l.mendAge < 1.1) {
    const mc = [0.62, 0.95, 0.72], v = l.mendAge / 1.1
    for (let k = 0; k < 4; k++) {
      const u = clamp(l.mendAge * 1.6 - k * 0.12)
      if (u <= 0 || u >= 1) continue
      const i = Math.min(steps, Math.max(0, Math.round((1 - u) * steps)))
      out.push({ id: id + ':m' + k, k: 'dot', x: pts[i][0], y: pts[i][1], r: tiny ? 0.05 : 0.014 * (1 - k * 0.15), c: mc, a: (1 - v) * (1 - k * 0.2) })
    }
    out.push({ id: id + ':mr', k: 'ring', x: X, y: Y, r: s * (1.0 + 1.6 * v), w: 0.006, c: mc, a: 0.75 * (1 - v) })
  }
  // DENIED: you said no — the gate closes onto the node and fades. No red: a boundary you set, not a fault of the tool
  if (l.deniedAge >= 0 && l.deniedAge < 0.9) {
    const v = easeOut(l.deniedAge / 0.9)
    out.push({ id: id + ':shut', k: 'ring', x: X, y: Y, r: s * (peer ? 1.35 : 2.2) * (1 - 0.6 * v), w: 0.012 * (1 - 0.5 * v), c: f.colours ? arr(f.colours.core) : c, a: 0.9 * (1 - v), dash: true })
  }
  // EVENT: a permission ask — a gate around the node, breathing slowly while it is genuinely held
  if (l.asking) {
    const pulse = 0.55 + 0.45 * Math.sin((TAU * t) / 1.6)
    out.push({ id: id + ':gate', k: 'ring', x: X, y: Y, r: s * (peer ? 1.35 : 2.2), w: 0.012, c: f.colours ? arr(f.colours.core) : c, a: pulse, dash: true })
  }
}

// The exact event → animation mapping, kept beside the code that implements it (the review page prints this).
export const MAPPING = [
  ['prompt.edit (you type)', 'EVENT', 'attend energy +0.35/edit, decays τ1.2s', 'tendrils lean toward the prompt; hover says "listening"'],
  ['prompt.submit', 'EVENT', 'attend cleared', 'lean released'],
  ['turn.start, before any stream chunk', 'EVENT', 'awaiting = true', 'held breath: tendrils draw in 10%, ambient damped to 35%. No thinking animation until a chunk arrives'],
  ['turn.step chunk kind=thinking', 'EVENT', 'think energy += chars/60 (≤0.6), τ0.9s; 1–4 motes per chunk', 'tendrils curl tight and shorten, halo swells, bead ring turns (speed ∝ chunk flow); motes orbit the core'],
  ['turn.step chunk kind=text', 'EVENT', 'speak energy, same law; motes per chunk', 'tendrils straighten and reach out; motes travel out along tendrils with short trails'],
  ['tool.call start', 'EVENT', 'lane created/reused by tool → family; outbound pulse', 'a filament grows from the entity to a lane node (0.4s ease); node geometry = family signature; node turns only while the call is in flight'],
  ['tool.call result', 'EVENT', 'inbound pulse', 'a pulse returns along the filament'],
  ['tool.call result isError / deny', 'EVENT', 'err energy +0.75 τ1.6s; lane errAt', 'filament kinks, node jitters, pulse returns red-shifted; colour recipe leans to the error seed'],
  ['tool.check decision=ask', 'EVENT', 'ask = true until that call settles', 'everything holds still (ambient 12%); one tendril reaches to the asking lane; a dashed gate forms around its node and breathes at 1.6s (the wait is real)'],
  ['tool.call result deny (you said no)', 'EVENT + TRANSITION', 'lane.deniedAt; no err energy, no fail count, no mend later', 'the gate closes onto the node over 0.9s and fades. No red: a boundary you set is not a fault of the tool'],
  ['tool.call on a lane used often this session', 'EVENT (kept)', 'worn = log10(calls)/1.2 per lane key, kept after the lane retracts; /clear empties it', 'a habit: the filament reaches out quicker (0.4s → 0.25s) and sits up to 60% heavier, never brighter'],
  ['Bash command or MCP server naming codex / keeper / openai / gpt-N', 'EVENT (inferred lane)', 'family = peer, label Keeper', 'Keeper lane: an open ring facing Spark on a two-strand filament (a conversation runs both ways), with Keeper\'s own eye inside in his own colours; it narrows while his call waits on your OK. Hover: "Spark · talking with Keeper"'],
  ['Bash command matching ollama run / gemma / gemini / agy / clef / claude -p', 'EVENT (inferred lane)', 'family = model, label from the pattern', 'model lane: double ring + satellite, kin colour: an external model is reach, never a replacement'],
  ['mcp__<server>__*', 'EVENT', 'lane per server (model lane if the server name is a model)', 'polygon node, vertex count from the server name hash'],
  ['Agent / Task (subagent)', 'EVENT', 'agent lane per subagent type', 'a tiny sibling spark on a lane'],
  ['prompt.submit while a turn runs (you write mid-turn)', 'EVENT (held)', 'queued += 1 until the model takes it in; turn.start or /clear lets go', 'a small breathing bead waits at her lower edge, on the prompt side, one per message (three drawn). Hover: "· your message is waiting"'],
  ['session.append attachment queued_command (the model takes your message in)', 'EVENT + TRANSITION', 'queued -= 1; take 0→1 over 1.4s; attend +0.5; take look rolled (drink | spiral | catch)', 'the bead travels in to her core (straight up, spiralling, or caught by a tendril reaching down), then a ring draws inward to the core. Hover: "· taking in your message"'],
  ['you say something to Spark in her pane (painter on)', 'EVENT', 'attend +0.35 as you send it; on her answer attend +0.4 and react (bloom | lean | ring | shimmer | hush) toward the prompt, chosen in the same call', 'she turns toward you, and answers with a move of hers as her words appear under the painting'],
  ['painter starts (/spark paint, or a turn worth painting)', 'EVENT', 'paint lane toward the canvas (below, or beside when side by side); not a turn tool: no echo, no habit, outlives turn.end', 'a filament reaches toward the canvas and a brush tip lays a stroke while the painter works. Hover: "Spark · painting" once the turn has landed'],
  ['painter answers with a move for Spark (bloom | lean | ring | shimmer | hush)', 'EVENT + TRANSITION', 'react 0→1 over 2.4s, starting 0.6s after the painting arrives; chosen in the same call as the painting', 'she answers her painting: a bloom of light, a lean toward the canvas, a ring from the core, a shimmer around her, or a hush (she goes still). Nothing else changes'],
  ['painter answers', 'EVENT', 'paint lane handAt (or errAt when nothing came back)', 'a pulse runs down the filament and a drop falls toward the canvas as the painting starts to appear; a failed one returns red-shifted on the lane only, Spark herself does not flinch'],
  ['session.compact start → end', 'EVENT + TRANSITION', 'compact eased 0→1 in 0.5s, back in 0.7s', 'whole form squashes vertically, tendrils fold; springs back when compaction finishes'],
  ['turn.complete reason=answer', 'EVENT + TRANSITION', 'bloom = (0.55+0.9·w)·e^(−t/(0.7+0.8·w)), w = log10(1+turn seconds)/2 from durationMs', 'halo flash and a damped spring outward, then settles. A long turn exhales deeper and longer than a quick one; each distinct lane the turn reached leaves one expanding echo ring (max 4)'],
  ['turn.complete reason=aborted', 'EVENT + TRANSITION', 'recoil = e^(−t/0.6)', 'tendrils retract sharply, then recover. No red: you chose this'],
  ['turn.complete reason=error', 'EVENT + TRANSITION', 'recoil + err energy +0.5', 'tendrils retract and the colour leans to the error seed. Hover: "stopped on an error"'],
  ['turn.complete reason=refusal', 'EVENT + TRANSITION', 'halt = e^(−t/1.6)', 'a still double ring around the core, tendrils gathered in 20%, no red: a boundary, not a fault. Hover: "declined"'],
  ['turn.complete reason=answer (each)', 'EVENT (kept)', 'one star per answered turn, ≤24; golden-angle placement; brightness from the turn’s w', 'a star settles in the outer field and stays for the session. Heavy turns get a four-point sparkle. Hover while idle: "· N turns"'],
  ['session.compact end (≥2 stars)', 'EVENT + TRANSITION', 'stars gather over 1.4s into one merged star', 'the session’s stars travel in and fuse into one brighter, larger star with a small ring: compaction is memory condensing. The turn count is kept'],
  ['session.start / session.end reason=clear', 'EVENT + TRANSITION', 'wake 0→1 over 2.6s (clear also empties the stars)', 'first light: a ring leaves the core, the halo opens and the tendrils unfurl from 35%. Hover: "waking"'],
  ['turn.step effort = low … max', 'EVENT (kept)', 'depth 0.2 / 0.45 / 0.7 / 0.88 / 1', 'while thinking, 1–4 fine orbits with beads form around the core, one more per effort tier. Hover: "thinking · high effort"'],
  ['turn.step model changes (e.g. a fallback)', 'EVENT + TRANSITION', 'shift = e^(−t/1.4)', 'one thin ring crosses the whole form once'],
  ['tool.call success after a failed call on the same lane', 'EVENT + TRANSITION', 'mend energy +0.4…0.9; lane.mendAt', 'mend-green light runs back up the filament and the node exhales a ring; the halo warms'],
  ['2+ failed calls in a row on a lane', 'EVENT (kept)', 'lane.fail ≥ 2 until a call succeeds', 'the lane stays warm with red (≤50%) and its node trembles while a call is out; one clean call cools it'],
  ['a call in flight for more than 1.5s', 'EVENT (elapsed time)', 'patience = 1 − e^(−(age−1.5)/25)', 'a thin arc fills around the lane node, ever more slowly, never a countdown; past 30s a second dashed orbit joins it'],
  ['subagent turn.step chunks (thinking / text)', 'EVENT', 'beat energy on in-flight agent lanes, τ0.8s', 'the sibling spark reaches further and turns faster each time its subagent really streams. Spark itself stays still'],
  ['lanes, 4s after their last call settled', 'TRANSITION', 'retract over 0.7s', 'filament withdraws, node fades'],
  ['no event for 120s+', 'EVENT (absence)', 'rest 0→1 over 30s', 'dims, slows, desaturates (recipe leans to the rest seed)'],
  ['no event for 600s+', 'EVENT (absence)', 'deep 0→1 over 180s', 'dozing: the form folds in like a bud, ambient drops further, and the session’s stars glow brighter and twinkle. Hover: "dozing"'],
  ['the first event after 120s+ of silence', 'EVENT + TRANSITION', 'stir = e^(−t/1.2) · how rested it was (rest and deep let go at that rate instead of snapping)', 'stirring: the fold releases over a second or so, the dimming lifts, the stars settle back, and one soft ring stretches out from the core. Hover: "stirring", then "listening"'],
  ['turn.complete reason=answer, not yet acted on', 'EVENT (held)', 'offer = { at, chars streamed as text this turn }; held until prompt.submit, turn.start, reply.copied or /clear', 'reply ready: after the bloom, a bead comes out of the core toward the prompt on a faint stem and stays there, ringed by a slow breath (ambient, damped). Its size is how much the turn really wrote (log scale). It stays through rest and dozing. Hover: "reply ready", "· waiting N min" after a minute'],
  ['turn.complete reason=error / refusal, not yet acted on', 'EVENT (held)', 'offer kind error / refusal, same lifetime (an interrupt holds nothing: that was you)', 'a hollow ring in the same place: red-touched for an error, plain for a refusal. Hover keeps "stopped on an error" / "declined" with how long ago'],
  ['reply.copied (/copy said it copied)', 'EVENT + TRANSITION', 'handoff over 0.9s; offer cleared', 'the bead travels out toward you, shrinks and opens into a widening ring, three motes falling back behind it. With nothing held out (a second copy), only one small quiet ring. Hover: "copied" for 2s'],
  ['side.ask → side.answer (/spark ask)', 'EVENT (held) + TRANSITION', 'one per question out; angle = −90° + 0.45 rad per second it has been out', 'a small satellite with its own glow circles slowly at the edge, apart from the work, while a side question is being answered (a fork of this session: no tools, nothing added to the conversation); its answer opens it into a soft ring (dimmer when no answer came). Hover adds "· answering your side question"'],
  ['always', 'AMBIENT', 'breath 5.5s ±3.5%, drift 90s, sway, star twinkle', 'claims nothing; damped while waiting on you or on the model; /spark calm switches it off everywhere'],
  ['the first chunk of a spell of thinking (after quiet)', 'EVENT (rolled)', 'look.think = one of coil, tide, lattice, pulse; seeded by the event, never the same twice running', 'thinking said another way each time: curling in, a tide around the form with rising motes, a lattice of nodes and chords, or rings pulsing out'],
  ['the first chunk of a spell of writing', 'EVENT (rolled)', 'look.speak = one of currents, fountain, ripples, flares', 'writing said another way each time: motes running out along the tendrils, the form lifting like a fountain, broken rings carried out, or the tips lighting up'],
  ['turn.complete reason=answer (the roll)', 'EVENT (rolled)', 'look.land = one of spring, petals, halo, spiral', 'the landing said another way each time, on top of the bloom: the spring alone, eight petals opening, a bright ring and its echo, or a spiral of light'],
  ['turn.complete reason=error (the roll)', 'EVENT (rolled)', 'look.err = one of recoil, shiver, crack; an interrupt rolls nothing', 'the recoil alone, a brief shiver through the tendrils, or a broken ring in the error red. An interrupt stays a plain recoil: no red, you chose it'],
  ['tool.end that mends a lane (the roll)', 'EVENT (rolled)', 'look.mend = one of knit, seeds, close', 'the mend said at the core as well: a ring drawing in, seeds drawn back, or two halves closing into one ring'],
  ['session.wake (the roll)', 'EVENT (rolled)', 'look.wake = one of ring, unfurl, rays', 'first light as one ring, a spiral of light opening, or eight rays'],
  ['tool.start (each call, the roll)', 'EVENT (rolled)', 'pulse.look = one of reach, flare, spark', 'a call going out: the lane alone, a flare at its root, or a spark travelling out along it'],
]
