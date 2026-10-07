// cyclops-spark: Spark as a graphical living indicator, driven only by real host events.
//
//   /spark         open or close Spark at the side (the same as /spark side)
//   /spark side    a slim pane at the side of the conversation, about a quarter of the width
//   /spark top     a short strip above the prompt, beside whatever already draws there (no pane at all)
//   /spark kitty   terminal pane as real pixels (kitty / Ghostty) instead of half-block cells
//   /spark state   the truthful state line, the settings, and the last events the presence received
//   /spark calm    no ambient motion anywhere; events still draw
//   /spark theme   dark | light            /spark palette spark | aurora | ember | moon
//   /spark sound   off | soft | full       /spark status a glyph + the state line in the status line
//   /spark murmur  quiet sounds under real streaming: a hum while thinking, bubbles while writing
//   /spark focus   Spark large, beside the conversation, which keeps rolling and stays readable
//   /spark replay  the scripted tour of every state, in the pane, labelled as a replay (never live data)
//   /spark ask Q   a side question, answered from a fork of this session (no tools), mid-turn too, never typed anywhere
//   /spark link    on | off | status: Cyclops Link, Keeper and Prism beside Spark when they work in the same folder
//
// When a turn ends and you have not acted on it yet, Spark holds the reply out to you (reply ready) until you send a new
// prompt or copy it with /copy.
//
// This is the terminal edition: a `Raster` of '▀' cells (any terminal) or an `Image` (kitty/Ghostty), repainted with
// $.ui.blit. On any other surface Spark shows only its glyph and its truthful state line.
//
// The rule that shapes everything here: nothing animates unless something real happened. Sound, the status glyph, the
// constellation and the replay all follow it (the replay is a separate presence, labelled, and never touches the live one).

import type { EngineInterface, Register } from 'claude-code'
import { buildScene, createPresence, laneFor, PALETTE_NAMES } from './core.js'
import { base64, createRaster, toHalfBlocks, toRGBA8 } from './render-raster.js'
import { buildTrace, replayAt } from './trace.js'
import { linkFacts, linkLine, overlay, parseSheet, type LinkView, type MarkSheet } from './link-view.js'
import { KEEPER, PRISM } from './link-marks.js'

const PANE = 'cyclops-spark'
const T0 = Date.now()
const now = () => (Date.now() - T0) / 1000

type Theme = 'auto' | 'dark' | 'light'
type Sound = 'off' | 'soft' | 'full'
const THEMES: Theme[] = ['auto', 'dark', 'light']
const SOUNDS: Sound[] = ['off', 'soft', 'full']

const spark = createPresence('spark')
const recent: string[] = []
let paneOpen = false
let band = false
let kitty = false
// /spark focus. Presentation only: it never touches the presence (no event, no restart). Spark gets a large pane beside the
// conversation, which is never hidden or changed: the work keeps rolling, readable, and the prompt keeps the keyboard.
// `before` is the view to return to, exactly.
let focusMode = false
let before: { paneOpen: boolean; band: boolean; statusOn: boolean } | null = null
let lastHeal = 0         // when a lost terminal drawing last asked for a redraw
let paneSeenOnTerminal = false
let calm = false
let theme: Theme = 'auto'            // auto follows the host's own /config theme; dark and light pin it
let hostTheme: 'dark' | 'light' = 'dark' // what the host's theme row says (a plain 'auto' there cannot be known: dark)
let palette = 'spark'
let sound: Sound = 'off'
let chimeAfter = 20
let statusOn = false
let lastStatus = ''
// murmur: quiet phrases while the model really streams (thinking: a closed-mouth hum; writing: soft bubbles). Off by default
let murmurOn = false
let murmurKind: 'think' | 'write' | null = null
let murmurNextAt = -1e9
let murmurIdx = 0
const MURMUR_PHRASE_MS = 2400, MURMUR_FADE_MS = 700, MURMUR_VARIANTS = 3 // must match prototype/make-sounds.mjs
let lastTextAt = 0
let tick = 0
let ids = 0
let bandRequestId = ''
const failedTools = new Set<string>() // a tool that failed and has not yet succeeded again (for the mend cue)

// ---------------------------------------------------------------- Cyclops Link (off unless you turn it on)
// While it is on, a small helper beside Spark (link/spark_link.py) publishes her coarse state for Keeper and Prism to see
// and tells her who else works in this folder. She sends it nothing but those coarse facts, through a private file the
// helper made; she draws the others only with the looks they exported themselves (link-mark/).
let linkOn = false
let linkWanted: boolean | null = null  // SPARK_LINK=1/0 overrides the setting and the command
let linkStatus: 'off' | 'starting' | 'on' | 'unavailable' = 'off'
let linkView: LinkView | null = null
let linkFactsPath = ''
let linkSent = ''
let linkSentTick = -1e9
let linkLoop: { return: (v?: any) => Promise<unknown> } | null = null
const linkSheets: Record<string, MarkSheet | null> = {}

type Replay = { t0: number; presence: ReturnType<typeof createPresence>; trace: ReturnType<typeof buildTrace>; i: number; loop: number }
let replay: Replay | null = null

type Site = { surface: string; columns: number; rows: number; lod: 'tiny' | 'panel'; image: boolean; fill: boolean; raster: ReturnType<typeof createRaster> }
const sites = new Map<string, Site>() // requestId → a terminal site we blit into

function emit(ev: Record<string, unknown>, quiet = false) {
  const e = { t: now(), ...ev }
  spark.apply(e)
  if (quiet) return
  const extra = ev.tool ? ' ' + String(ev.tool) : ev.via ? ' ' + String(ev.via) : ev.kind ? ' ' + String(ev.kind) : ev.effort ? ' ' + String(ev.effort) : ''
  recent.push(`${e.t.toFixed(2)} ${String(ev.type)}${extra}${ev.error ? ' ✕' : ''}${ev.denied ? ' denied' : ''}${ev.aborted ? ' aborted' : ''}${ev.reason ? ' ' + String(ev.reason) : ''}`)
  if (recent.length > 12) recent.shift()
}

function busy(f: any): boolean {
  const e = f.e
  return (f.offer !== null && f.offer.amt < 1) || (f.handoff !== null && f.handoff.u < 1) || f.active || f.lanes.length > 0 || f.compact > 0.01 || f.bloom > 0.02 || f.recoil > 0.02 || f.halt > 0.02 || f.shift > 0.02 || f.stir > 0.02 ||
    f.echoes.length > 0 || f.condense !== null || (f.woke && f.wake < 1) ||
    e.think > 0.02 || e.speak > 0.02 || e.tool > 0.02 || e.err > 0.02 || e.attend > 0.02 || e.mend > 0.02
}

const activeTheme = (): 'dark' | 'light' => theme === 'auto' ? hostTheme : theme

async function refreshTheme($: EngineInterface) {
  try {
    const row = (await $.config.list()).find((r) => r.key === 'theme')
    hostTheme = typeof row?.value === 'string' && row.value.includes('light') ? 'light' : 'dark'
  } catch { /* a host without the row: stay dark */ }
  sites.clear()
}

const ground = (): number[] => activeTheme() === 'light' ? [0.96, 0.95, 0.94] : [0.07, 0.07, 0.08] // assumed terminal ground for half-transparent pixels

function frameFor(site: Site, f: any, peers = false): { cells?: string; rgba?: string; width?: number; height?: number } {
  site.raster.draw(buildScene(f, site.lod), activeTheme())
  if (site.image) return { rgba: base64(toRGBA8(site.raster)), width: site.raster.W, height: site.raster.H }
  const words = toHalfBlocks(site.raster, ground())
  // Keeper and Prism at their seats, in their own looks, only beside the live Spark (never over the replay)
  if (peers && linkOn && linkView && !replay) overlay(words, site.raster.W, Math.floor(site.raster.H / 2), linkView, linkSheets, { now: now(), reduced: calm })
  return { cells: base64(new Uint8Array(words.buffer)) }
}

function siteFor(requestId: string, surface: string, columns: number, rows: number, lod: 'tiny' | 'panel', image: boolean, fill = false): Site {
  const was = sites.get(requestId)
  if (was && was.columns === columns && was.rows === rows && was.image === image && was.lod === lod && was.fill === fill) return was
  // an Image keeps the cells' own shape (a cell is twice as tall as wide), at most 640 pixels on its longer side
  const k = image ? Math.min(1, 640 / Math.max(columns * 8, rows * 16)) : 1
  const W = image ? Math.max(8, Math.round(columns * 8 * k)) : columns
  const H = image ? Math.max(8, Math.round(rows * 16 * k)) : rows * 2
  const site = { surface, columns, rows, lod, image, fill, raster: createRaster(W, H, { fill }) }
  sites.set(requestId, site)
  healTries = 0 // drawn again: the next loss asks quickly
  return site
}

// ---------------------------------------------------------------- what is drawn: the live presence, or the labelled replay
const sampleOpts = () => ({ ambient: !calm, theme: activeTheme(), palette })

function liveFrame(): any { return spark.sample(now(), sampleOpts()) }

// The pane may show the replay instead of the live presence. Everything else (band, status line) is always live.
function paneFrame(): { f: any; label: string } {
  if (!replay) { const f = liveFrame(); return { f, label: f.hover } }
  const r = replay
  const { t, lapse, loop } = replayAt(now() - r.t0)
  if (loop !== r.loop) { r.presence = createPresence('spark'); r.i = 0; r.loop = loop }
  for (let ev = r.trace[r.i]; ev && ev.t <= t; ev = r.trace[++r.i]) r.presence.apply(ev)
  const f = r.presence.sample(t, sampleOpts())
  return { f, label: '▶ replay (not live)' + (lapse ? ' · time-lapse ×60, no events' : '') + ' · ' + f.hover }
}

const statusText = (f: any) => f.glyph + ' ' + String(f.hover).replace(/^Spark · /, '')
function pushStatus($: EngineInterface) {
  const text = statusText(liveFrame())
  if (text === lastStatus) return
  lastStatus = text
  $.ui.status(text)
}

// Whether a drawn tree asks the person something: it holds a pressable element (a Button with something to run, a Select)
function asksSomething(node: unknown, depth = 0): boolean {
  if (!node || typeof node !== 'object' || depth > 40) return false
  if (Array.isArray(node)) return node.some((n) => asksSomething(n, depth + 1))
  const el = node as { type?: unknown; props?: Record<string, unknown>; children?: unknown; press?: unknown }
  if (el.type === 'Button' || el.type === 'Select' || el.press !== undefined || (el.props && typeof el.props.hotkey === 'string')) return true
  return asksSomething(el.children, depth + 1) || asksSomething(el.props?.children, depth + 1)
}

// ---------------------------------------------------------------- side questions
// What /btw does, from Spark: one tool-less answer over this session's own transcript ($.model.fork), beside the work and
// never in it. Nothing is typed into the terminal, so a question can never land in an open dialog or in your draft, and
// it works mid-turn. One at a time. The events (side.ask, side.answer) say only that it happened.
const SIDE = 'This is a side question from the user, asked through Spark while the main work carries on. Answer it directly in one short response. ' +
  'You cannot use tools here: if answering needs reading files, running commands or searching, say it cannot be checked from a side question and suggest asking in the main conversation.\n\nThe question: '
let sideBusy = false
async function askOnTheSide($: EngineInterface, question: string, id: string, via: string): Promise<{ ok: boolean; text: string }> {
  if (sideBusy) return { ok: false, text: 'Spark is still answering the last side question.' }
  sideBusy = true
  emit({ type: 'side.ask', id, via })
  let ok = false, text = ''
  try {
    const r = await $.model.fork({ prompt: SIDE + question })
    ok = r.isAnswered
    text = r.isAnswered ? r.text.trim() : r.reason === 'nothing-to-fork' ? 'Nothing to answer from yet: this conversation has no reply so far.'
      : r.reason === 'api-error' ? `No answer: the API answered with an error${'status' in r && r.status ? ` (${r.status})` : ''}.` : 'No answer came back.'
  } catch (err) { text = 'No answer: ' + String((err as Error)?.message || err) } finally {
    sideBusy = false
    emit({ type: 'side.answer', id, ok })
  }
  return { ok, text }
}
// you took the reply. Heard in full only: it answers something you just did
async function copied($: EngineInterface, via: string, id?: string) {
  emit({ type: 'reply.copied', via, ...(id ? { id } : {}) })
  await cue($, 'copied', 'full')
}

// Playback. The host plays a clip with afplay on macOS; a Linux terminal has no player there, so on Linux Spark plays its
// own file with the desktop's player (PipeWire's pw-play, PulseAudio's paplay, or ALSA's aplay), found once and remembered.
// Anywhere else, or if none is installed, the host's own playback stands (and stays silent where it has no player).
let linuxPlayer: Promise<string[] | null> | null = null
function findLinuxPlayer($: EngineInterface): Promise<string[] | null> {
  linuxPlayer ??= (async () => {
    try {
      const os = await $.process.run(['uname', '-s'], { timeoutMs: 3000 })
      if (os.exitCode !== 0 || os.stdout.trim() !== 'Linux') return null
      for (const cand of [['pw-play'], ['paplay'], ['aplay', '-q']]) {
        const found = await $.process.run(['which', cand[0]!], { timeoutMs: 3000 }).catch(() => null)
        if (found && found.exitCode === 0) return cand
      }
    } catch { /* no process here: the host's playback */ }
    return null
  })()
  return linuxPlayer
}
// Resolves once the clip has been started, never waits for it to finish
async function playAsset($: EngineInterface, asset: string, gain: number) {
  const player = await findLinuxPlayer($)
  if (player) {
    const volume = player[0] === 'pw-play' ? [`--volume=${gain.toFixed(2)}`] : player[0] === 'paplay' ? [`--volume=${Math.round(gain * 65536)}`] : []
    void $.process.run([...player, ...volume, `${$.plugin.root}/${asset}`], { timeoutMs: 15000 }).catch(() => undefined)
    return
  }
  try { void $.audio.play({ asset }, { gain }).catch(() => undefined) } catch { /* no player here */ }
}

// Sound. Opt-in, and every cue belongs to one real event. 'soft' keeps to what is worth hearing from another room.
// The cooldown reads $.clock, so it is testable and one cue never lands on top of another.
// One semantic sound at a time. A cue that comes while another plays waits in a single slot (the most important waiting
// wins; a tie, the newest) and plays when the first has finished, unless it has gone stale (4 s): then it is dropped,
// because a late sound would point at something that is no longer happening. Nothing ever plays on top of a cue.
const CUE_SECONDS: Record<string, number> = { wake: 3.1, bloom: 2.9, ask: 1.9, error: 1.85, mend: 2.6, refusal: 3.0, compact: 3.2, copied: 1.6, name: 2.5 }
const CUE_RANK: Record<string, number> = { ask: 4, error: 3, refusal: 3, name: 2, bloom: 2, copied: 1, mend: 1, compact: 1, wake: 1 }
let soundUntil = -1e9 // when the cue now playing ends ($.clock ms)
let waiting: { name: string; at: number } | null = null
let named = false     // "I am Spark" has been said this session
async function cue($: EngineInterface, name: string, level: 'soft' | 'full', force = false) {
  const at = await $.clock.now()
  // force: the level preview /spark sound plays when you set it. It skips the level check, never the one-at-a-time rule
  if (!force && (sound === 'off' || (level === 'full' && sound !== 'full'))) return
  if (at < soundUntil) { // one at a time: wait in the slot, or give way
    if (!waiting || (CUE_RANK[name] ?? 1) >= (CUE_RANK[waiting.name] ?? 1)) {
      const first = !waiting
      waiting = { name, at }
      if (first) $.clock.after(Math.max(1, soundUntil - at + 60), () => void playWaiting($))
    }
    return
  }
  soundUntil = at + (CUE_SECONDS[name] ?? 2) * 1000
  await playAsset($, `sounds/${name}.wav`, sound === 'soft' ? 0.5 : 1)
}
async function playWaiting($: EngineInterface) {
  const w = waiting
  waiting = null
  if (!w || sound === 'off') return
  const at = await $.clock.now()
  if (at - w.at > 4000) return // stale: it would point at something already over
  if (at < soundUntil) { waiting = w; $.clock.after(Math.max(1, soundUntil - at + 60), () => void playWaiting($)); return }
  soundUntil = at + (CUE_SECONDS[w.name] ?? 2) * 1000
  await playAsset($, `sounds/${w.name}.wav`, sound === 'soft' ? 0.5 : 1)
}

// Murmur. Called for each real thinking or text chunk of the main loop, never by a timer: a phrase starts when the stream
// starts or changes kind, and the next one only while chunks keep arriving, handed over across the phrase's own long fade.
// When the stream stops, nothing new starts, so the sound ends on its own within one phrase. It never touches the cue
// cooldown: murmur sits under the cues, it does not compete with them.
async function murmur($: EngineInterface, kind: 'think' | 'write') {
  const at = await $.clock.now()
  if (at < soundUntil) return // the quiet layer gives way while a cue speaks
  if (kind === murmurKind && at < murmurNextAt) return
  murmurKind = kind
  murmurIdx = (murmurIdx + 1) % MURMUR_VARIANTS
  murmurNextAt = at + MURMUR_PHRASE_MS - MURMUR_FADE_MS
  await playAsset($, `sounds/${kind}-${murmurIdx + 1}.wav`, 0.8)
}

// Terminal frames: 20 fps while something real is happening, 8 fps of ambient otherwise (a slow heartbeat in calm), nothing when unseen.
async function paint($: EngineInterface) {
  tick += 1
  if (statusOn && tick % 5 === 0) pushStatus($)
  if (linkOn && linkFactsPath) await sendLinkFacts($)
  if (!paneOpen && !band) return
  const live = liveFrame()
  const pane = paneOpen ? paneFrame() : null
  const threads = linkOn && !replay && !calm && (linkView?.threads.length ?? 0) > 0 // a thread's bead travels while it is declared
  const active = busy(live) || (pane !== null && replay !== null) || (paneOpen && threads)
  if (!active && tick % (calm ? 60 : 6) !== 0) return
  for (const [requestId, site] of sites) {
    if (requestId === PANE && !paneOpen) continue
    if (requestId === bandRequestId && !band) continue
    const fr = frameFor(site, requestId === PANE && pane ? pane.f : live, requestId === PANE)
    const res = fr.cells
      ? await $.ui.blit({ requestId, key: 'spark', cells: fr.cells })
      : await $.ui.blit({ requestId, key: 'spark', source: { rgba: fr.rgba!, width: fr.width!, height: fr.height! } })
    if ('deny' in res && res.deny) { sites.delete(requestId); heal($) } // unmounted or resized: ask for the render that re-adds it
  }
  // a resize, or another pane's tab in front, can leave Spark's pane with nothing to paint (its old size refused): keep
  // asking for a fresh render (at most four times a second) until it is drawn again, idle or not. A redraw only
  if (paneOpen && paneSeenOnTerminal && !sites.has(PANE)) heal($)
  // other surfaces show the glyph and state line: redraw at most 8 per second, and only while something real is moving
  if (active && Date.now() - lastTextAt > 125) {
    lastTextAt = Date.now()
    $.ui.invalidate('ui.render')
  }
}

// asks for a redraw when a drawing was lost; it backs off (a quarter second, doubling up to four seconds) while nothing comes
// back, for example while another pane's tab is in front, so it never keeps the screen busy
let healTries = 0
function heal($: EngineInterface) {
  if (Date.now() - lastHeal < Math.min(4000, 250 * 2 ** Math.min(healTries, 4))) return
  lastHeal = Date.now(); healTries++
  $.ui.invalidate('ui.render')
}

// Spark's coarse facts, written for the helper only when they change (at most four times a second)
async function sendLinkFacts($: EngineInterface) {
  const text = JSON.stringify(linkFacts(liveFrame()))
  if (text === linkSent || tick - linkSentTick < 5) return // 5 frames: 250 ms
  linkSent = text; linkSentTick = tick
  await $.fs.write(linkFactsPath, text).catch(() => undefined)
}

function loadSheets() {
  if (!('keeper' in linkSheets)) linkSheets.keeper = parseSheet(KEEPER, 'keeper')
  if (!('prism' in linkSheets)) linkSheets.prism = parseSheet(PRISM, 'prism')
}

async function startLink($: EngineInterface) {
  if (linkLoop || !linkOn) return
  linkStatus = 'starting'
  loadSheets()
  const session = await $.session.id().catch(() => '')
  const folder = await $.session.root().catch(() => '')
  if (!session || !folder) { linkStatus = 'unavailable'; return }
  const stream = $.process.spawn({ argv: ['python3', `${$.plugin.root}/link/spark_link.py`], env: { SPARK_LINK_SESSION: session, SPARK_LINK_FOLDER: folder } })
  linkLoop = stream
  void (async () => {
    let buffer = '', ready = false
    try {
      for await (const { stream: pipe, text } of stream) {
        if (pipe !== 'stdout') continue
        buffer += text
        let nl
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1)
          let msg: any
          try { msg = JSON.parse(line) } catch { continue }
          if (msg?.ready?.facts) { ready = true; linkFactsPath = String(msg.ready.facts); linkSent = ''; linkStatus = 'on'; await sendLinkFacts($) }
          else if (msg?.view && Array.isArray(msg.view.peers)) { linkView = msg.view; $.ui.invalidate('ui.render') }
          else if (msg?.refused) linkStatus = 'unavailable'
        }
      }
    } catch { linkStatus = 'unavailable' /* no python3 here, or it could not start: Link stays quietly off */ }
    finally {
      if (linkLoop === stream) linkLoop = null
      linkView = null; linkFactsPath = ''
      // a helper that never said it was ready could not run here (no python3, or an unsafe directory)
      if (!ready && linkOn && linkLoop === null) linkStatus = 'unavailable'
      else if (linkStatus !== 'unavailable') linkStatus = 'off'
      $.ui.invalidate('ui.render')
    }
  })()
}

async function stopLink() {
  const loop = linkLoop
  linkLoop = null; linkView = null; linkFactsPath = ''
  if (linkStatus !== 'unavailable') linkStatus = 'off'
  if (loop) void loop.return(undefined).catch(() => undefined) // ends the helper; it says Spark has ended
}

const HELP = [
  '/spark         open or close Spark at the side',
  '/spark side    a slim pane at the side (about a quarter of the width)',
  '/spark top     a short strip above the prompt instead (no pane)',
  '/spark kitty   pane as real pixels (kitty / Ghostty)',
  '/spark state   the state line, settings and recent events',
  '/spark calm    no ambient motion (events still draw)',
  '/spark theme   auto | dark | light   (auto follows the host theme)',
  '/spark palette ' + PALETTE_NAMES.join(' | '),
  '/spark sound   off | soft | full   (macOS and Linux play; cues follow real events)',
  '/spark status  a glyph and the state line in the status line',
  '/spark murmur  quiet sounds while thinking and writing (a hum, bubbles)',
  '/spark replay  a labelled tour of every state (not live data)',
  '/spark focus   Spark large beside the conversation, which keeps rolling (Esc or /spark returns)',
  '/spark ask Q   a side question: answered beside the work (no tools), mid-turn too',
  '/spark link    on | off | status: Keeper and Prism beside Spark (Cyclops Link, off until you turn it on)',
].join('\n')

// focus asks for about 60% of the terminal (at least 64 columns, and always 40 left for the conversation), and the full
// height when it sits above the prompt. It never takes the keyboard or holds notices back: the prompt stays yours.
// A request, not a grant: the surface seats the pane, and a size you drag wins
const focusColumns = (terminal: number) => terminal > 0 ? Math.max(64, Math.min(terminal - 40, Math.round(terminal * 0.6))) : 96
const focusOpen = (columns: number, rows: number) => ({ id: PANE, title: 'Spark', closeOnEscape: true as const, rows: Math.max(8, Math.min(rows, 40)), columns: focusColumns(columns) })

// /spark side: a slim pane, so the conversation keeps most of the screen. Beside the transcript (wide terminals) it asks
// for about a quarter of the width, 30 to 44 columns; above the prompt (narrow terminals) it asks for 10 rows.
// A size you drag wins, and the drawing always fits the room it is given
const SIDE_ROWS = 10
let lastTerminal = 0 // the terminal width the last /spark command reported (0: not known)
const sideColumns = (terminal: number) => terminal > 0 ? Math.max(30, Math.min(44, Math.round(terminal * 0.25))) : 36

async function openPane($: EngineInterface, wide = 0, tall = 200): Promise<string> {
  paneOpen = true
  const opened = focusMode
    ? await $.ui.open(focusOpen(wide, tall))
    : await $.ui.open({ id: PANE, title: 'Spark', closeOnEscape: true, rows: SIDE_ROWS, columns: sideColumns(lastTerminal) })
  if (!opened.isPlaced) return 'presence pane is waiting for room'
  return focusMode ? 'focus: Spark large beside the conversation (Esc, /spark or /spark focus returns to your view)' : 'Spark at the side (Esc closes it; /spark top for a strip above the prompt instead)'
}

async function enterFocus($: EngineInterface, wide: number): Promise<string> {
  if (focusMode) return 'focus is already on (Esc, /spark or /spark focus returns to your view)'
  before = { paneOpen, band, statusOn }
  focusMode = true
  band = false
  sites.delete(PANE)
  const text = await openPane($, wide || lastTerminal)
  $.ui.invalidate('ui.render')
  return text
}

// back to exactly the view before focus: the pane closed or open at its usual size, the band and status entry as they were
async function leaveFocus($: EngineInterface, paneAlreadyClosed: boolean): Promise<string> {
  if (!focusMode) return 'focus is off'
  const was = before ?? { paneOpen: true, band: false, statusOn: false }
  focusMode = false
  before = null
  sites.delete(PANE)
  band = was.band
  if (was.statusOn !== statusOn) { statusOn = was.statusOn; lastStatus = ''; if (statusOn) pushStatus($); else $.ui.status(undefined) }
  if (was.paneOpen) await openPane($)
  else if (!paneAlreadyClosed) { paneOpen = false; await $.ui.close({ id: PANE }).catch(() => undefined) }
  $.ui.invalidate('ui.render')
  return 'focus off: back to your view'
}

const pick = <T extends string>(list: readonly T[], arg: string, current: T): T | undefined => {
  if (!arg) return list[(list.indexOf(current) + 1) % list.length]
  return (list as readonly string[]).includes(arg) ? (arg as T) : undefined
}

// Spark's own work around a gating hook never stands in the way of the real action: if drawing or a cue throws,
// it is dropped here. Errors from next(e) itself are Claude Code's and still pass through untouched.
const quietly = async (work: () => unknown): Promise<void> => { try { await work() } catch { /* presence only */ } }

export const register: Register = (on, options) => {
  // defaults from the plugin's config menu; the commands below change them for this session
  const o = (options ?? {}) as Record<string, unknown>
  if (THEMES.includes(o.theme as Theme)) theme = o.theme as Theme
  if (PALETTE_NAMES.includes(String(o.palette))) palette = String(o.palette)
  if (SOUNDS.includes(o.sound as Sound)) sound = o.sound as Sound
  if (typeof o.calm === 'boolean') calm = o.calm
  if (typeof o.statusLine === 'boolean') statusOn = o.statusLine
  if (typeof o.murmur === 'boolean') murmurOn = o.murmur
  if (typeof o.band === 'boolean') band = o.band // the band from the start (a band needs no seat, so it shows at any width)
  if (typeof o.chimeAfterSeconds === 'number' && o.chimeAfterSeconds >= 0) chimeAfter = o.chimeAfterSeconds
  if (typeof o.link === 'boolean') linkOn = o.link

  on('session.start', async ($, e, next) => {
    await refreshTheme($)
    await $.command.register({ name: 'spark', description: 'Spark, Claude\'s living presence: /spark [side|top|focus|kitty|state|calm|theme|palette|sound|murmur|status|replay|ask|link|help]', immediate: true })
    const wanted = (await $.env.get('SPARK_LINK').catch(() => undefined))?.trim().toLowerCase()
    linkWanted = wanted === '1' || wanted === 'on' ? true : wanted === '0' || wanted === 'off' ? false : null
    if (linkWanted !== null) linkOn = linkWanted
    if (linkOn) await startLink($)
    $.clock.every(50, () => void paint($))
    emit({ type: 'session.wake' })
    await cue($, 'wake', 'full')
    return next(e)
  })

  // follow the host's theme when the person changes it
  on('config.set', { key: 'theme' }, async ($, e, next) => { const res = await next(e); await quietly(() => refreshTheme($)); return res })

  // a /clear ends the conversation without a new session.start: the stars are gone and Spark wakes again
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') { emit({ type: 'session.wake', fresh: true }); await cue($, 'wake', 'full') }
    const res = await next(e)
    if (e.reason === 'clear' && linkOn) { await stopLink(); await startLink($) } // a new conversation is a new instance
    return res
  })

  // ---------------------------------------------------------------- real events → presence events
  on('prompt.edit', async ($, e, next) => { emit({ type: 'prompt.edit' }); return next(e) })
  on('prompt.submit', async ($, e, next) => { await quietly(() => emit({ type: 'prompt.submit' })); return next(e) })
  on('turn.start', async ($, e, next) => { emit({ type: 'turn.start' }); return next(e) })

  on('turn.step', async function* ($, e, next) {
    const sub = Boolean(e.agentId)
    // how hard the model is asked to think, and which model answers: real, per request (a subagent's are its own)
    if (!sub) emit({ type: 'step', model: e.model, effort: e.effort, index: e.index })
    const stream = next(e)
    for await (const chunk of stream) {
      if (chunk.kind === 'thinking' || chunk.kind === 'text') {
        // a subagent's stream lives inside its lane (its sibling spark beats); only the main loop moves Spark itself
        emit(sub ? { type: 'agent.stream', n: chunk.text.length } : { type: 'stream', kind: chunk.kind, n: chunk.text.length }, sub)
        if (!sub && murmurOn) await murmur($, chunk.kind === 'thinking' ? 'think' : 'write')
      }
      yield chunk
    }
    return await stream.result
  })

  on('tool.call', async ($, e, next) => {
    if ('agentId' in e && e.agentId) return next(e)
    const id = e.tool_use_id ?? 'call' + ++ids
    const raw = e as unknown as Record<string, unknown>
    await quietly(() => emit({ type: 'tool.start', id, tool: e.tool, input: { command: raw.command, subagent_type: raw.subagent_type, model: raw.model, url: raw.url } }))
    let failed = false
    let denied = false // you (or a rule) said no: a boundary, not a fault — the gate closes, nothing turns red
    let threw = true   // a call that throws was cut short (an interrupt), not failed: it settles without red
    try {
      const ran = await next(e)
      threw = false
      denied = ran.deny !== undefined
      failed = !denied && ran.isError === true
      return ran
    } finally {
      await quietly(async () => {
        emit({ type: 'tool.end', id, error: failed, denied, aborted: threw })
        if (threw || denied) { /* neither a failure nor a mend */ }
        else if (failed) failedTools.add(e.tool)
        else if (failedTools.delete(e.tool)) await cue($, 'mend', 'full') // it worked where the last call failed
      })
    }
  })

  on('session.compact', async ($, e, next) => {
    if (e.agentId) return next(e)
    await quietly(() => emit({ type: 'compact.start' }))
    try { return await next(e) } finally { await quietly(async () => { emit({ type: 'compact.end' }); await cue($, 'compact', 'full') }) }
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      const reason = e.reason === 'answer' ? 'answer' : e.reason === 'aborted' ? 'aborted' : e.reason === 'refusal' ? 'refusal' : 'error'
      emit({ type: 'turn.end', reason, durationMs: e.durationMs })
      const secs = e.durationMs / 1000
      if (reason === 'answer') { if (secs >= chimeAfter) await cue($, 'bloom', 'soft'); else if (secs >= 5) await cue($, 'bloom', 'full') }
      else if (reason === 'error') await cue($, 'error', 'soft')
      else if (reason === 'refusal') await cue($, 'refusal', 'soft')
    }
    return next(e)
  })

  // Claude Code's own /copy takes the last response too
  // Claude Code's own /copy takes the last response too: counted only when it says it copied (a picker left, or nothing
  // to copy, is not a copy)
  on('command.run', { command: 'copy' }, async ($, e, next) => {
    const res = await next(e)
    if (typeof res?.text === 'string' && /copied to clipboard/i.test(res.text)) await quietly(() => copied($, 'copy'))
    return res
  })

  // ---------------------------------------------------------------- command
  on('command.run', { command: 'spark' }, async ($, e) => {
    const [word = '', arg = ''] = e.args.trim().toLowerCase().split(/\s+/)
    let text: string
    if (typeof e.presentation?.columns === 'number' && e.presentation.columns > 0 && !focusMode) lastTerminal = e.presentation.columns
    if (word === 'top' || word === 'band') { // a short strip above the prompt; the side pane gives way to it
      band = arg === 'on' ? true : arg === 'off' ? false : !band
      if (band && paneOpen && !focusMode) { paneOpen = false; await $.ui.close({ id: PANE }).catch(() => undefined) }
      text = band ? 'Spark on top: a short strip above the prompt (/spark top again hides it)' : 'Spark top strip off'
    }
    else if (word === 'side') {
      if (focusMode) text = await leaveFocus($, false)
      else if (paneOpen && arg !== 'on') { paneOpen = false; await $.ui.close({ id: PANE }).catch(() => undefined); text = 'Spark side pane closed' }
      else {
        band = false // one place at a time
        text = paneOpen ? 'Spark is already at the side' : await openPane($)
        if (!named && sound !== 'off') { named = true; await cue($, 'name', 'soft') }
      }
    }
    else if (word === 'kitty') { kitty = !kitty; text = kitty ? 'pane: real pixels (kitty / Ghostty)' : 'pane: half-block cells' }
    else if (word === 'calm') { calm = arg === 'on' ? true : arg === 'off' ? false : !calm; text = calm ? 'calm: no ambient motion (events still draw)' : 'calm off: ambient breathing and drift are back' }
    else if (word === 'theme') {
      const next = pick(THEMES, arg, theme)
      if (next) { theme = next; sites.clear() }
      text = next ? 'theme: ' + theme + (theme === 'auto' ? ' (the host says ' + hostTheme + ')' : '') : 'theme takes: ' + THEMES.join(' | ')
    }
    else if (word === 'palette') {
      const next = pick(PALETTE_NAMES as readonly string[], arg, palette)
      if (next) palette = next
      text = next ? 'palette: ' + palette + ' (error is red in every palette)' : 'palette takes: ' + PALETTE_NAMES.join(' | ')
    }
    else if (word === 'sound') {
      const next = pick(SOUNDS, arg, sound)
      if (next) { sound = next; if (sound !== 'off') await cue($, 'bloom', 'soft', true) } // a preview of the level
      text = next ? 'sound: ' + sound + (sound === 'off' ? '' : ' (plays on macOS and Linux; each cue follows a real event)') : 'sound takes: ' + SOUNDS.join(' | ')
    }
    else if (word === 'status') {
      statusOn = arg === 'on' ? true : arg === 'off' ? false : !statusOn
      if (statusOn) { lastStatus = ''; pushStatus($) } else { lastStatus = ''; $.ui.status(undefined) }
      text = statusOn ? 'status line: on' : 'status line: off'
    }
    else if (word === 'murmur') {
      murmurOn = arg === 'on' ? true : arg === 'off' ? false : !murmurOn
      if (!murmurOn) { murmurKind = null; murmurNextAt = -1e9 }
      text = murmurOn ? 'murmur: on (a hum while thinking, bubbles while writing; only while the model really streams)' : 'murmur: off'
    }
    else if (word === 'focus') {
      const want = arg === 'on' ? true : arg === 'off' ? false : !focusMode
      text = want ? await enterFocus($, lastTerminal) : await leaveFocus($, false)
    }
    else if (word === 'ask') {
      const question = e.args.trim().replace(/^ask\s*/i, '')
      if (!question) text = 'ask what? /spark ask <your question> (answered on the side: no tools, the work goes on)'
      else {
        const r = await askOnTheSide($, question, 'ask' + ++ids, 'command')
        text = (r.ok ? 'Spark · side answer\n' : 'Spark · side question\n') + r.text
      }
    }
    else if (word === 'replay') {
      if (replay) { replay = null; text = 'replay off: the pane shows the live Spark' }
      else {
        replay = { t0: now(), presence: createPresence('spark'), trace: buildTrace(), i: 0, loop: 0 }
        const opened = paneOpen ? '' : (await openPane($)) + '; '
        text = opened + 'replay on: a scripted tour, labelled as a replay. It never touches the live Spark. /spark replay stops it'
      }
    }
    else if (word === 'state') {
      text = liveFrame().hover + '\n' + `palette ${palette} · theme ${theme === 'auto' ? 'auto→' + hostTheme : theme} · calm ${calm ? 'on' : 'off'} · sound ${sound} · status ${statusOn ? 'on' : 'off'} · murmur ${murmurOn ? 'on' : 'off'} · link ${linkOn ? linkStatus : 'off'}\n` + recent.join('\n')
    }
    else if (word === 'link') {
      if (arg === 'on' || arg === 'off') {
        linkOn = arg === 'on'
        if (linkOn) await startLink($); else await stopLink()
        text = linkOn
          ? (linkStatus === 'unavailable' ? 'link: Spark could not start her Link helper (it needs python3); she stays unlinked' : 'link on: Spark shares her coarse state and shows Keeper and Prism when they work in this folder. Nothing else is shared')
          : 'link off: Spark says she has ended and is removed a minute later'
      } else if (arg === '' || arg === 'status') {
        text = 'link ' + (linkOn ? linkStatus : 'off') + (linkOn && linkView ? ' · ' + linkLine(linkView) : '') + (linkWanted !== null ? ' (SPARK_LINK overrides the setting)' : '')
      } else text = 'link takes: on | off | status'
    }
    else if (word === 'help' || (word !== '' && word !== 'pane')) text = HELP
    else if (focusMode) text = await leaveFocus($, false) // a bare /spark in focus: back to your view
    else if (paneOpen) { paneOpen = false; await $.ui.close({ id: PANE }).catch(() => undefined); text = 'presence pane closed' }
    else { // opening Spark: the first time in a session it says its name (when sound is on); never again in that session
      band = false // at the side now, so the strip above the prompt gives way
      text = await openPane($)
      if (!named && sound !== 'off') { named = true; await cue($, 'name', 'soft') }
    }
    $.ui.invalidate('ui.render')
    return { text }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const res = await next(e)
    paneOpen = false
    if (focusMode) await quietly(() => leaveFocus($, true)) // Esc in focus: back to the view before it (which may mean the pane, at its usual size)
    return res
  })

  // ---------------------------------------------------------------- drawing
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { f, label } = paneFrame()
    if (e.surface === 'terminal') {
      paneSeenOnTerminal = true
      const { Box, Text, Raster, Image } = $.ui.resolve(e)
      let columns = Math.max(16, Math.min(160, (e.props.bodyColumns ?? 60) - 1))
      let rows = Math.max(8, Math.min(60, Math.round(columns / 2.1)))
      const bodyRows = e.props.scroll?.bodyRows ?? 0
      // the label (and the Link line) always fit under the drawing: it never pushes them out of a short pane
      const under = 1 + (linkOn && linkView && !replay ? 1 : 0)
      if (!focusMode && bodyRows > under + 2 && rows > bodyRows - under) rows = bodyRows - under
      if (focusMode) {
        // the whole body, as it is *now*: every render recomputes from the pane's current size, so a resize is
        // recompute → recompose → keep painting. Never larger than the room (a drawing taller than its pane is clipped
        // away), with the truthful line under it when there is room for both
        const bodyCols = e.props.bodyColumns ?? 60
        const showLabel = bodyRows >= 6
        const room = (bodyRows || 8) - (showLabel ? 1 : 0) // a size not reported yet: draw small, the next render has it
        if (room < 4 || bodyCols < 8) return Box({ flexDirection: 'row', justifyContent: 'center', width: bodyCols, children: [Text({ children: [f.glyph + ' ' + label], wrap: 'truncate-end' })] })
        rows = Math.min(120, room)
        columns = Math.min(320, bodyCols)
        const site = siteFor(PANE, e.surface, columns, rows, 'panel', kitty, true)
        const fr = frameFor(site, f, true)
        const art = fr.cells
          ? Raster({ key: 'spark', columns, rows, cells: fr.cells })
          : Image({ key: 'spark', columns, rows, alt: label, source: { rgba: fr.rgba!, width: fr.width!, height: fr.height! } })
        return Box({ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: bodyCols, ...(bodyRows ? { height: bodyRows } : {}),
          children: showLabel ? [art, Text({ children: [label], dimColor: true, wrap: 'truncate-end' })] : [art] })
      }
      if (e.props.placement === 'inline' && bodyRows > 0 && bodyRows - 1 < rows) { rows = Math.max(2, bodyRows - 1); columns = Math.min(columns, rows * 2) } // a short inline pane: fit it, never clip it
      const site = siteFor(PANE, e.surface, columns, rows, 'panel', kitty)
      const fr = frameFor(site, f, true)
      const art = fr.cells
        ? Raster({ key: 'spark', columns, rows, cells: fr.cells })
        : Image({ key: 'spark', columns, rows, alt: label, source: { rgba: fr.rgba!, width: fr.width!, height: fr.height! } })
      const linked = linkOn && linkView && !replay ? [Text({ children: [linkLine(linkView)], dimColor: true, wrap: 'truncate-end' })] : []
      return Box({ flexDirection: 'column', children: [art, Text({ children: [label], dimColor: true, wrap: 'truncate-end' }), ...linked] })
    }
    // not a terminal: the glyph and the same truthful line, nothing drawn
    const { Box, Text } = els
    const line = Text({ children: [f.glyph + ' ' + label + (linkOn && linkView && !replay ? ' · ' + linkLine(linkView) : '')], dimColor: true, wrap: 'truncate-end' })
    return focusMode
      ? Box({ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: e.props.bodyColumns, children: [line] })
      : Box({ flexDirection: 'column', children: [line] })
  })

  // The top strip above the prompt. What others draw there that asks you something (Claude Code's "You should know" and
  // "Heads up" offers, a survey: anything with something to press) is Spark speaking: with Spark on top, it is drawn as
  // Spark's speech bubble, joined to it by a short line. Nothing in it is read, copied or changed: it is their own tree,
  // so its keys still answer it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const els = $.ui.resolve(e)
    if (focusMode || !band) return below // in focus, what draws above the prompt is left exactly as it is
    const f = liveFrame()
    let art
    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      bandRequestId = e.requestId
      // the top strip: 5 rows tall at most (fewer if the band has less room), twice as wide, so Spark reads as herself
      const rows = Math.max(3, Math.min(5, (e.props.maxRows ?? 6) - 1))
      const columns = rows * 5
      const site = siteFor(e.requestId, e.surface, columns, rows, 'tiny', false)
      art = Raster({ key: 'spark', columns, rows, cells: frameFor(site, f).cells! })
    }
    const { Box, Text } = els
    // Spark and her truthful line side by side, so the strip stays as short as the drawing
    const words = [Text({ children: [f.hover], dimColor: true, wrap: 'truncate-end' }), ...(linkOn && linkView ? [Text({ children: [linkLine(linkView)], dimColor: true, wrap: 'truncate-end' })] : [])]
    const left = art
      ? Box({ flexDirection: 'row', columnGap: 1, alignItems: 'center', children: [art, Box({ flexDirection: 'column', children: words })] })
      : Box({ flexDirection: 'row', columnGap: 1, children: [Text({ children: [f.glyph] }), ...words] })
    if (below && asksSomething(below)) // Spark speaking: the offer as its bubble, joined to it
      return Box({ flexDirection: 'row', columnGap: 1, children: [left, Text({ children: ['╶─'], dimColor: true }), below as never] })
    return Box({ flexDirection: 'row', columnGap: 2, children: below ? [left, below as never] : [left] })
  })
}
