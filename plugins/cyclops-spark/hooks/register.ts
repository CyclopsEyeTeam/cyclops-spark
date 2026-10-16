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
//   /spark paint   the painter, a small sub-agent that paints Spark's expression of each turn in the room below her:
//                  /spark paint turns it on and paints one now, /spark paint off stops it. It sees the turn's shape and a
//                  short excerpt of the reply. It uses tokens: what it has used shows under the painting
//   /spark story   the session's paintings told again, in order, each laid down anew (in memory only; no tokens)
//   /spark convert [faithful|refined|interpretive|all] [hd|4k]: the painting made large, as SVG and PNG, into the
//                  convert folder (the one time Spark writes files, and only when you ask)
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
import { buildScene, createPresence, laneFor, PAINT_TOWARD, PALETTE_NAMES } from './core.js'
import { base64, createRaster, toHalfBlocks, toQuadrants, toRGB8, toRGBA8 } from './render-raster.js'
import { eyeColumns, eyeRaster } from './eye.js'
import { layeredFloor, layeredRaster, layeredScenes, layeredStepper } from './layered.js'
import { rollScore, sessionColour } from './music.js'
import { buildTrace, replayAt } from './trace.js'
import { linkFacts, linkLine, overlay, parseSheet, type LinkView, type MarkSheet } from './link-view.js'
import { KEEPER, PRISM } from './link-marks.js'
import { cleanReflection, reflectRequest, SPOKEN_CHARS, talkRequest, parseTalk, TALK_IN, newTurnFacts, recordTool, painterFacts, painterRequest, parsePainting, paintingScene, shapeFor, SHAPES, type Painting, type TurnFacts } from './painter.js'
import { wrapRows } from './layout.js'
import { motion, motionFor } from './motion.js'
import { canvasFor, captionLines, captionStrip, galleryHTML, titleCard, HD_MARKS, markFloor, revisitRequest, rollLayout, rollSize, sceneSVG, SIZES, slug, withCaption } from './convert.js'

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
// WELCOME: the Cyclops eye above the prompt when a session starts (or /clear begins a new one), until the first turn,
// then the room is given back. The launch banner a shell prints before Claude Code is covered when Claude Code takes the
// screen; this one is Claude Code's own drawing, so it stays. The welcome setting turns it off
let welcomeOn = true
let welcome = false
let welcomeArt: { key: string; cells: string } | null = null
let rollTitleOn = true // the roll opens with a title card: the rollTitle setting turns it off
let sessionName = '' // the name the conversation was given with /rename, the roll's title when there is one
let rollMusic = true // the roll's own music, read from its paintings (hooks/music.js); the rollMusic setting turns it off
let hd = true // HD cells: four pixels to a cell (quadrant blocks) instead of two, in any terminal; /spark hd off returns to half blocks
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

// ---------------------------------------------------------------- the painter (off unless you turn it on)
// One tool-less completion per painting ($.model.complete, Haiku unless you pick another model), given only the turn's
// shape (counts and kinds) and a short excerpt of the reply (the gist). Its answer is a small paint
// program, drawn by Spark's own renderer in the room under her: only room she is not using, so she never gets smaller.
let paintOn = false
let paintModel = 'haiku'
let openPainting = false // the openPainting setting: a bare /spark also turns the painter on. Off by default
const paintSpent = { paintings: 0, calls: 0, tokens: 0 } // what the painter has used this session, shown under its painting
let painting: (Painting & { at: number; n: number; shape: string; cost: number }) | null = null // cost: what this one painting used, in tokens
// STEADY: Spark's lines keep the rows they have needed at a width (at least three), so a longer state line ("thinking ·
// xhigh effort") never shoves the painting down and a shorter one never pulls it back up. Kept per width: a resize
// starts fresh at the new width.
const textHeld = new Map<number, number>()
function heldRows(width: number, need: number): number {
  const h = Math.max(3, need, textHeld.get(width) ?? 0) // three: Claude's breath, her line, the effort
  if (textHeld.size > 64) textHeld.clear()
  textHeld.set(width, h)
  return h
}
// STORY: every painting of this session, in order, kept in memory (never written), to be told again with /spark story
type StoryEntry = Painting & { shape: string; cost: number; clock: string; live: boolean }
const story: StoryEntry[] = []
const STORY_MAX = 60
const STORY_S = 7 // each painting is laid down again, then held, for this long
// Told once through, then held on the last page. `paused`: the moment it was held (the page stays), `done`: it reached
// the end on its own. Controls under the painting, only while it is on: pause/play, back, next, end
// Its pages turn by the host's clock ($.clock.now, read each tick into hostT while a story is on); `shownAt` is when
// the page showing was laid down (Spark's own clock, for the reveal)
let storyOn: { at: number; paused: number | null; done: boolean; shownAt: number } | null = null
let storySlide = -1
let hostT = 0 // the host's clock, in seconds, as of the last tick
const storyElapsed = () => storyOn ? Math.max(0, (storyOn.paused ?? hostT) - storyOn.at) : 0
const storyIndex = () => storyOn && story.length ? Math.min(story.length - 1, Math.floor(storyElapsed() / STORY_S)) : -1
// hold the story on a page, or let it go on from the page it is on
function storyPause(hold: boolean) {
  if (!storyOn) return
  if (hold) { if (storyOn.paused === null) storyOn.paused = hostT }
  else if (storyOn.paused !== null) { storyOn.at += hostT - storyOn.paused; storyOn.paused = null; storyOn.done = false }
}
// turn to a page (clamped), laid down anew; a held story stays held on it
function storyTurn(k: number) {
  if (!storyOn || !story.length) return
  const page = Math.max(0, Math.min(story.length - 1, k))
  storyOn.at = hostT - page * STORY_S
  if (storyOn.paused !== null) storyOn.paused = hostT
  storyOn.done = false
  if (page !== storySlide) { storySlide = page; storyOn.shownAt = now() }
}
// what the painting area shows: in a story, the session's paintings in turn (each laid down again); otherwise the last one
function shownPainting(): (Painting & { at: number; n: number; shape: string; cost: number }) | null {
  const k = storyIndex()
  if (k < 0) return painting
  const e = story[k]!
  return { ...e, at: storyOn!.shownAt, n: 1e6 + k }
}
let paintBeside = false // the pane's last layout put the painting beside Spark (a wide, short room), not below her
let paintRoom: { columns: number; rows: number } | null = null // the room the last painting area had: the next canvas takes its shape
let paintCount = 0
let paintBusy = false
let paintNote = ''      // why the last painting did not come
let lastAutoPaint = -1e9
let turnsSeen = 0
let turnFacts: TurnFacts | null = null
type TurnEnd = { reason: string; durationMs: number }
let lastTurn: { facts: TurnFacts | null; end: TurnEnd; answer: string } | null = null
type PaintSite = { columns: number; rows: number; image: boolean; hd: boolean; raster: ReturnType<typeof createRaster>; key: string; frame: { cells?: string; rgba?: string; width?: number; height?: number } }
let paintSite: PaintSite | null = null
const REVEAL_S = 2.4          // a new painting is laid down mark by mark over this long
const AUTO_MIN_MS = 3000      // turns shorter than this are not painted on their own (/spark paint still paints them)
const AUTO_GAP_S = 20         // at most one painting on its own every 20 s
// LIVE: in a long turn she paints while it is still going: never sooner than 15 minutes after the turn began or her last
// painting, at a moment that moves her (a mend, a subagent coming back, a long call settling, thinking turning into
// writing); with no such moment, 3 minutes later anyway
const LIVE_GAP_S = 15 * 60
const LIVE_WAIT_S = 3 * 60
const LONG_CALL_S = 60
// these three in the host's own time ($.clock.now, in seconds), the clock a long turn is really measured by
let turnBegan = -1      // when the turn still going began (-1: none is)
let lastPaintAt = -1e9  // when she last began a painting
let lastLiveAt = -1e9   // when she last began a live one
const hostNow = async ($: EngineInterface) => (await $.clock.now()) / 1000
let lastStream = ''     // the main loop's last stream kind, to notice thinking turning into writing
let reflection = ''     // the builder's last reflection, as sent to the painter (shown in /spark state)
// TALK: what you last said to Spark from her pane, and her answer (in memory only; /clear and painting off let it go)
let talk: { said: string; reply: string; busy: boolean } | null = null
let sayTo: ((words: string) => void) | null = null // the pane's Input sends here
let spoken = ''         // the last SPOKEN_CHARS the builder said aloud this turn (text, never thinking), in memory only
const MODEL_ID = /^[\w.:\-\[\]\/@]{1,80}$/

type Replay = { t0: number; presence: ReturnType<typeof createPresence>; trace: ReturnType<typeof buildTrace>; i: number; loop: number }
let replay: Replay | null = null

type Site = { surface: string; columns: number; rows: number; lod: 'tiny' | 'panel'; image: boolean; fill: boolean; hd: boolean; raster: ReturnType<typeof createRaster> }
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
  site.raster.draw(buildScene(f, site.lod), activeTheme(), { res: site.hd ? 2 : 1 })
  if (site.image) return { rgba: base64(toRGBA8(site.raster)), width: site.raster.W, height: site.raster.H }
  const words = site.hd ? toQuadrants(site.raster, ground()) : toHalfBlocks(site.raster, ground())
  // Keeper and Prism at their seats, in their own looks, only beside the live Spark (never over the replay)
  if (peers && linkOn && linkView && !replay) overlay(words, site.columns, site.rows, linkView, linkSheets, { now: now(), reduced: calm })
  return { cells: base64(new Uint8Array(words.buffer)) }
}

function siteFor(requestId: string, surface: string, columns: number, rows: number, lod: 'tiny' | 'panel', image: boolean, fill = false): Site {
  const was = sites.get(requestId)
  const fine = hd && !image
  if (was && was.columns === columns && was.rows === rows && was.image === image && was.lod === lod && was.fill === fill && was.hd === fine) return was
  // an Image keeps the cells' own shape (a cell is twice as tall as wide), at most 640 pixels on its longer side
  const k = image ? Math.min(1, 640 / Math.max(columns * 8, rows * 16)) : 1
  // cells: two pixels to a cell (half blocks), or in HD two across and four down (shown as four quarters, each the
  // average of two)
  const W = image ? Math.max(8, Math.round(columns * 8 * k)) : fine ? columns * 2 : columns
  const H = image ? Math.max(8, Math.round(rows * 16 * k)) : fine ? rows * 4 : rows * 2
  const site = { surface, columns, rows, lod, image, fill, hd: fine, raster: createRaster(W, H, { fill }) }
  sites.set(requestId, site)
  healTries = 0 // drawn again: the next loss asks quickly
  return site
}

// ---------------------------------------------------------------- what is drawn: the live presence, or the labelled replay
const sampleOpts = () => ({ ambient: !calm, theme: activeTheme(), palette })
// the word Claude Code's spinner is showing for this turn (Processing, Swirling…), read as it is drawn, never changed
let spinnerWord = ''
let queuedMsgs = 0 // messages you sent while a turn ran that the model has not taken in yet (the beads at her edge)

function liveFrame(): any { return spark.sample(now(), { ...sampleOpts(), word: spinnerWord }) }

// The pane may show the replay instead of the live presence. Everything else (band, status line) is always live.
type Said = { head: string; notes: string[]; effort: string }
function paneFrame(): { f: any; label: string; said: Said } {
  if (!replay) { const f = liveFrame(); return { f, label: f.hover, said: f.said } }
  const r = replay
  const { t, lapse, loop } = replayAt(now() - r.t0)
  if (loop !== r.loop) { r.presence = createPresence('spark'); r.i = 0; r.loop = loop }
  for (let ev = r.trace[r.i]; ev && ev.t <= t; ev = r.trace[++r.i]) r.presence.apply(ev)
  const f = r.presence.sample(t, sampleOpts())
  const prefix = '▶ replay (not live)' + (lapse ? ' · time-lapse ×60, no events' : '') + ' · '
  return { f, label: prefix + f.hover, said: { ...f.said, head: prefix + f.said.head } }
}

// CLAUDE'S OWN LINE, above Spark's: the builder's breath while a turn really runs, in Claude's colour, beside the word the
// chat's spinner shows. A ring that fills and empties: slow while thinking, quicker while writing or calling tools.
// Only while a turn runs; never in the replay
// Claude's breath: four small motions (hooks/motion.js), one for what the turn is doing right now
function voiceLine(f: any): string {
  if (replay || turnBegan < 0) return ''
  return motion(motionFor(f), now()) + ' ' + (spinnerWord || 'Working') + '…'
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
  if (paneOpen && !focusMode && !replay && turnBegan >= 0 && tick % 3 === 0) $.ui.invalidate('ui.render') // Claude's breath, above her line
  // a new painting is laid down mark by mark: its own small drawing, repainted only while it is being laid down
  if (storyOn) { // the next page of the story; past the last one it holds there (told once, not round and round)
    hostT = (await $.clock.now()) / 1000
    if (storyOn.paused === null && storyElapsed() >= story.length * STORY_S) { storyOn.paused = hostT; storyOn.done = true; storyOn.at = storyOn.paused - (story.length - 1) * STORY_S; $.ui.invalidate('ui.render') }
    const k = storyIndex(); if (k !== storySlide) { storySlide = k; storyOn.shownAt = now(); $.ui.invalidate('ui.render') }
  }
  const shown = shownPainting()
  if ((paintOn || storyOn) && shown && paintSite && paneOpen && !focusMode && now() - shown.at < REVEAL_S + 0.2) {
    const fr = paintFrame(paintSite.columns, paintSite.rows)
    const res = fr.cells
      ? await $.ui.blit({ requestId: PANE, key: 'painting', cells: fr.cells })
      : await $.ui.blit({ requestId: PANE, key: 'painting', source: { rgba: fr.rgba!, width: fr.width!, height: fr.height! } })
    if ('deny' in res && res.deny) { paintSite = null; heal($) }
  }
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

// ---------------------------------------------------------------- painting
const logRecent = (line: string) => { recent.push(`${now().toFixed(2)} ${line}`); if (recent.length > 12) recent.shift() }

// counts a call into the session's total, and says what it used
const spend = (u: Record<string, number> | undefined): number => {
  if (!u) return 0
  const n = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
  paintSpent.calls++; paintSpent.tokens += n
  return n
}

// You said something to her: she answers in her own voice, from what she already holds (one short call, never the session)
async function talkTo($: EngineInterface, words: string): Promise<void> {
  const said = cleanReflection(words).slice(0, TALK_IN) || String(words || '').replace(/\s+/g, ' ').trim().slice(0, TALK_IN)
  if (!said || talk?.busy) return
  talk = { said, reply: '', busy: true }
  emit({ type: 'prompt.edit' }, true) // she turns toward you
  $.ui.invalidate('ui.render')
  try {
    const rq = talkRequest({ said, mood: String(liveFrame().hover).replace(/^Spark · /, ''), title: painting?.title || '', reflection, facts: turnFacts ? painterFacts(turnFacts, { reason: 'still going', durationMs: 0, mood: '', turn: turnsSeen + 1 }) : null, palette })
    const r = await $.model.complete({ model: paintModel, system: rq.system, prompt: rq.prompt, maxTokens: 400, effort: 'low', timeoutMs: 20000 })
    spend((r as { usage?: Record<string, number> }).usage)
    const a = r.isAnswered ? parseTalk(r.text) : null
    talk = { said, reply: a ? a.say : 'no answer came back this time', busy: false }
    if (a) emit({ type: 'spark.answer', react: a.react }, true)
    logRecent('talk')
  } catch (err) {
    talk = { said, reply: 'no answer came back: ' + String((err as Error)?.message || err).slice(0, 80), busy: false }
  } finally {
    if (talk) talk.busy = false
    $.ui.invalidate('ui.render')
  }
}

// /spark convert: the painting made large (see hooks/convert.js and hooks/layered.js). The one time Spark writes files,
// and only when you ask. Two menus, every choice with what it costs beside it. The first asks what: this painting, this
// painting every way, all the session's paintings, or the roll (all of them as a clip); the second asks which way:
// Faithful (the same marks, large), Layered (the same marks in depth, as the terminal shows them), Refined or
// Interpretive (the painter revisits each: one call a painting).
type Way = 'faithful' | 'layered' | 'refined' | 'interpretive'
const WAYS: Way[] = ['faithful', 'layered', 'refined', 'interpretive']
const revisits = (w: Way) => w === 'refined' || w === 'interpretive'
const Cap = (w: string) => w[0]!.toUpperCase() + w.slice(1)
type Job = { source: Painting & { shape: string }; way: Way }
// What the painter revisiting a painting has used this session, so the next estimate is from real calls
const revisitSeen = { calls: 0, tokens: 0 }
// About what these conversions will use: faithful and layered nothing; refined or interpretive one painter call each,
// at what such calls have used this session when there have been some, otherwise the request's own length (about 3.5
// characters a token) and an answer of about 17 tokens a mark, for a little more than the painting's own marks
function jobsEstimate(jobs: Job[]): number {
  let n = 0
  for (const { source: p, way } of jobs) {
    if (!revisits(way)) continue
    if (revisitSeen.calls) { n += revisitSeen.tokens / revisitSeen.calls; continue }
    const rq = revisitRequest({ painting: p, mode: way as 'refined' | 'interpretive', palette, theme: activeTheme(), reflection })
    n += Math.ceil((rq.system.length + rq.prompt.length) / 3.5) + Math.ceil(Math.min(HD_MARKS, Math.max(40, p.marks.length * 1.6)) * 17) + 60
  }
  return Math.round(n)
}
const costText = (jobs: Job[]) => { const t = jobsEstimate(jobs); return t ? 'about ' + kilo(t) + ' tokens' : 'no tokens' }
let convertProgress: { done: number; total: number; what: string } | null = null // a conversion beside the work: how far it has got
const plural = (n: number) => `${n} ${n === 1 ? 'painting' : 'paintings'}`
const busyText = () => convertProgress ? `Spark is still converting: ${convertProgress.done} of ${convertProgress.total} (${convertProgress.what})` : 'Spark is still converting'
const isSize = (w: string) => w in SIZES || /^\d{3,4}$/.test(w)
// The painter revisits one of its own paintings (refined or interpretive): one call; a painting that does not come back
// is drawn as it was (with a note)
async function revisitPainting($: EngineInterface, source: Painting & { shape: string }, way: 'refined' | 'interpretive'): Promise<{ p: Painting & { shape: string }; ok: boolean; note: string }> {
  const rq = revisitRequest({ painting: source, mode: way, palette, theme: activeTheme(), reflection })
  const r = await $.model.complete({ model: paintModel, system: rq.system, prompt: rq.prompt, maxTokens: 6000, effort: 'low', timeoutMs: 60000 })
  const used = spend((r as { usage?: Record<string, number> }).usage)
  if (used) { revisitSeen.calls++; revisitSeen.tokens += used }
  const q = r.isAnswered ? parsePainting(r.text, palette, HD_MARKS) : null
  if (!q) return { p: source, ok: false, note: r.isAnswered ? 'the painter answered something that was not a painting; it was drawn as it was' : 'the painter sent nothing back; it was drawn as it was' }
  return { p: { ...q, shape: source.shape }, ok: true, note: '' }
}
// the second menu: which way, each with what it costs for these paintings
async function askWay($: EngineInterface, question: string, list: Array<Painting & { shape: string }>): Promise<Way | null> {
  const labels = WAYS.map((w) => `${Cap(w)} · ${costText(list.map((source) => ({ source, way: w })))}`)
  let choice = ''
  try { choice = await $.ui.ask(question, { options: labels, header: 'Which way' }) } catch { return null }
  const k = labels.indexOf(choice)
  return k < 0 ? null : WAYS[k]!
}
// /spark convert [faithful | layered | refined | interpretive | every | all [way] | roll [way]] [hd | 4k | width]
async function convertPainting($: EngineInterface, words: string[], raw: string[] = words): Promise<string> {
  // `called <a title>`: the roll's title, as you write it
  let called = ''
  const at = words.indexOf('called')
  if (at >= 0) { called = raw.slice(at + 1).join(' ').replace(/^["']|["']$/g, '').trim().slice(0, 60); words = words.slice(0, at) }
  let [mode = '', next = '', after = ''] = words
  if (mode === 'three') mode = 'every' // the old word
  let way: Way | '' = ''
  let sizeWord = next
  if (mode && isSize(mode) && !(WAYS as string[]).includes(mode)) { sizeWord = mode; mode = '' } // /spark convert 4k: pick, at that size
  if ((mode === 'all' || mode === 'roll') && (WAYS as string[]).includes(next)) { way = next as Way; sizeWord = after } // all refined 4k, roll layered hd
  if ((WAYS as string[]).includes(mode)) { way = mode as Way; mode = 'one' }
  const known = ['', 'one', 'every', 'all', 'roll']
  if (!known.includes(mode)) return 'convert takes: faithful | layered | refined | interpretive (this painting that way) | every (this painting every way) | all [way] (every painting of the session) | roll [way] (every painting as a clip), then a size: hd (1920 wide, the default) or 4k, for the roll hd (1080p). On its own, /spark convert lets you click'
  const stillWidth = (w: string) => w === '' ? SIZES.hd! : SIZES[w] ?? (/^\d{3,4}$/.test(w) ? Math.max(256, Math.min(4096, Number(w))) : 0)
  if (mode === 'roll' && !rollSize(sizeWord)) return 'roll size: hd (1080p, 1920 wide), or a width (16:9); 720p (1280 wide) when nothing is said'
  if (mode !== 'roll' && !stillWidth(sizeWord)) return 'convert size: hd (1920 wide) or 4k (3840)'
  const pick = shownPainting()
  if (!pick && !story.length) return 'no paintings yet this session: /spark paint makes one'
  if (!mode) { // the first menu: what
    const n = story.length
    const options: Array<[string, string]> = []
    if (pick) options.push(['This painting…', 'one'], [`Every way, this painting · ${costText(WAYS.map((w) => ({ source: pick, way: w })))}`, 'every'])
    if (n) options.push([`All ${plural(n)}…`, 'all'], [`The roll: all ${n} as a clip…`, 'roll'])
    let choice = ''
    try { choice = await $.ui.ask('What shall Spark make large?', { options: options.map(([l]) => l), header: 'Convert' }) } catch { return 'convert: nothing chosen' }
    const o = options.find(([l]) => l === choice)
    if (!o) return 'convert: nothing chosen'
    mode = o[1]
  }
  if (!way && mode !== 'every') { // the second: which way
    const list = mode === 'one' ? (pick ? [pick] : []) : story.slice()
    if (!list.length) return mode === 'one' ? 'no painting is showing: /spark story shows them, /spark paint makes one' : 'no paintings yet this session: /spark paint makes one'
    const q = mode === 'one' ? 'Which way, this painting?' : mode === 'roll' ? `The roll of all ${plural(list.length)}: which way?` : `All ${plural(list.length)}: which way?`
    const w = await askWay($, q, list)
    if (!w) return 'convert: nothing chosen'
    way = w
  }
  if (mode === 'roll') return rollPaintings($, way as Way, sizeWord, called)
  const width = stillWidth(sizeWord)
  if (!width) return 'convert size: hd (1920 wide) or 4k (3840)'
  if (convertBusy) return busyText()
  if (mode !== 'all' && !pick) return story.length ? 'no painting is showing: /spark story shows them, /spark paint makes one' : 'no paintings yet this session: /spark paint makes one'
  if (mode === 'all' && !story.length) return 'no paintings yet this session: /spark paint makes one'
  const jobs: Job[] = mode === 'all' ? story.map((source) => ({ source, way: way as Way })) : mode === 'every' ? WAYS.map((w) => ({ source: pick!, way: w })) : [{ source: pick!, way: way as Way }]
  const said = mode === 'all' ? `all, ${way}` : mode === 'every' ? 'every way' : way
  convertBusy = true
  const root = await $.session.root().catch(() => '')
  const folder = convertFolder.startsWith('/') || convertFolder.startsWith('~') ? convertFolder : (root ? root + '/' : '') + convertFolder
  const written: string[] = []
  let note = ''
  const theme = activeTheme()
  const pause = () => $.clock.now()
  const run = async (): Promise<string> => {
    try {
      for (const { source, way: w } of jobs) {
        await pause() // between pictures: let everything else run
        let p: Painting & { shape: string } = source
        let tag: string = w
        if (revisits(w)) { const r = await revisitPainting($, source, w as 'refined' | 'interpretive'); p = r.p; if (!r.ok) { note = r.note; tag = 'faithful' } }
        const [W, H] = canvasFor(p.shape, width)
        const n = converted.length + 1
        const name = slug(p.title, n) + '-' + tag
        const when = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        const caption = convertCaption ? captionLines(p.title, tag, when) : null
        let px: { W: number; H: number; px: Float32Array }
        if (tag === 'layered') { // in depth: its layers, the far ones softened, shadows, the bloom
          await $.fs.write(`${folder}/${name}.svg`, sceneSVG([], W, H, { theme, title: p.title, caption, floor: layeredFloor(W, H), layers: layeredScenes(p, W, H, { theme }) }))
          px = await layeredRaster(p, W, H, { theme, pause })
        } else {
          const scene = paintingScene(p, W, H, { reveal: 1, theme })
          const floor = markFloor(W) // specks and fine lines stay visible at full size, as they are in the terminal
          await $.fs.write(`${folder}/${name}.svg`, sceneSVG(scene, W, H, { theme, title: p.title, caption, floor }))
          const raster = createRaster(W, H)
          await raster.drawAsync(scene, theme, { floor }, pause) // exactly as the terminal draws it: light added to light on a dark ground, over on a light one; handing over now and then, so Spark keeps moving
          px = raster
        }
        written.push(`${name}.svg`)
        // the PNG: the pixels flattened onto the ground the same way her cells are, handed to the python helper as text
        const flat = toRGB8(px as never, ground())
        const { rgb, H: fullH } = caption ? withCaption(flat, W, H, caption, ground(), { light: theme === 'light' }) : { rgb: flat, H }
        // in parts of at most 3 MB of text each: one write may carry 4 MiB, and a 4k picture is far more than that
        const b64 = base64(rgb), PART = 3_000_000, parts = Math.ceil(b64.length / PART)
        const b64Path = `${folder}/${name}.rgb.b64`
        for (let k = 0; k < parts; k++) await $.fs.write(`${b64Path}.${k}`, b64.slice(k * PART, (k + 1) * PART))
        let png = false
        try {
          const proc = $.process.spawn({ argv: ['python3', `${$.plugin.root}/link/spark_png.py`, b64Path, `${folder}/${name}.png`, String(W), String(fullH), String(parts)] })
          for await (const _ of proc) { /* its lines are not needed */ }
          const end = await proc.result
          png = (end as { code?: number } | null)?.code === 0
        } catch { png = false }
        if (png) written.push(`${name}.png`)
        else { note = note || 'no PNG: python3 was not found (the SVG opens in any browser, at any size)' }
        converted.push({ file: png ? `${name}.png` : `${name}.svg`, title: p.title || 'untitled', when: new Date().toTimeString().slice(0, 5), mode: tag })
        logRecent('convert ' + tag)
        if (convertProgress) convertProgress.done++
      }
      await $.fs.write(`${folder}/index.html`, galleryHTML(converted))
      written.push('index.html')
    } catch (err) {
      return 'convert failed: ' + String((err as Error)?.message || err).slice(0, 120)
    } finally {
      convertBusy = false
      convertProgress = null
    }
    return `converted (${said}, ${width} wide) into ${folder}: ${written.join(', ')}` + (note ? '. ' + note : '')
  }
  // more than one picture, one larger than HD, a layered one, or two painter calls or more: it goes on beside the work
  // (a command has ten seconds of its own time), and Spark says in the conversation when it is done (/spark state shows
  // how far it has got). One faithful, refined or interpretive picture at HD is quick and comes back at once
  const calls = jobs.filter((j) => revisits(j.way)).length
  if (calls >= 2 || jobs.length >= 2 || width > SIZES.hd! || jobs.some((j) => j.way === 'layered')) {
    const est = jobsEstimate(jobs)
    convertProgress = { done: 0, total: jobs.length, what: said }
    const what = mode === 'every' ? 'this painting every way' : mode === 'all' ? `all ${plural(jobs.length)}, ${way}` : `this painting, ${way}`
    void quietly(async () => {
      const text = await run()
      await quietly(() => $.ui.log('Spark: ' + text))
      await quietly(() => $.ui.toast(text.startsWith('converted') ? `Spark: converted ${what}` : 'Spark: ' + text))
    })
    return `converting ${what}, ${width} wide, into ${folder}: ${calls ? `${calls} painter ${calls === 1 ? 'call' : 'calls'}, about ${kilo(est)} tokens` : 'no tokens'}. It goes on beside the work; Spark says when it is done (/spark state shows how far)`
  }
  return run()
}

// /spark convert roll [way]: the session's paintings as a clip. Each is laid down mark by mark as it first was (2 s),
// held with its title (3 s), and crossfaded into the next; the last fades out. The way is the convert's: faithful (the
// same marks), layered (in depth), refined or interpretive (the painter revisits each first: one call a painting). Spark
// draws every frame herself and hands them to a small helper (link/spark_roll.py) as text, one painting at a time;
// ffmpeg makes the MP4. Without ffmpeg, a smaller animated PNG. It goes on beside the work, and Spark says in the
// conversation when it is done.
const ROLL = { reveal: 2, hold: 3, fade: 0.6, fps: 12, layeredFps: 8 } // seconds laid down, held, crossfaded; frames a second laid down (layered frames cost more, so fewer, smoothed the same)
async function hasFfmpeg($: EngineInterface): Promise<boolean> {
  try {
    const proc = $.process.spawn({ argv: ['ffmpeg', '-hide_banner', '-version'] })
    for await (const _ of proc) { /* its lines are not needed */ }
    return ((await proc.result) as { code?: number } | null)?.code === 0
  } catch { return false }
}
async function runHelper($: EngineInterface, args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  let out = '', err = ''
  try {
    const proc = $.process.spawn({ argv: ['python3', `${$.plugin.root}/link/spark_roll.py`, ...args] })
    for await (const piece of proc) { const p = piece as { stream?: string; text?: string }; if (p.stream === 'stderr') err += p.text ?? ''; else out += p.text ?? '' }
    return { ok: ((await proc.result) as { code?: number } | null)?.code === 0, out, err }
  } catch (e) { return { ok: false, out, err: err || String((e as Error)?.message || e) } }
}
// The roll's title: the one you gave it (`called ...`), else the conversation's name (/rename), else the project's folder
const TITLE = { fadeFrames: 12, fps: 12, hold: 2.5 } // the card comes up over a second, then holds: 3.5 s, crossfaded into the first painting
async function rollPaintings($: EngineInterface, way: Way, sizeWord: string, called = ''): Promise<string> {
  if (!story.length) return 'no paintings yet this session: /spark paint makes one'
  if (convertBusy) return busyText()
  const asked = rollSize(sizeWord)
  if (!asked) return 'roll size: hd (1080p, 1920 wide), or a width (16:9); 720p (1280 wide) when nothing is said'
  convertBusy = true
  const video = await hasFfmpeg($)
  const [W, H] = video ? asked : [640, 360]
  const fps = way === 'layered' ? ROLL.layeredFps : ROLL.fps
  const frames = video ? Math.round(ROLL.reveal * fps) : 8
  const list = story.slice(), n = list.length
  const root = await $.session.root().catch(() => '')
  const lead = rollTitleOn ? 1 : 0 // segments before the first painting: the title card
  const title = called || sessionName || root.replace(/\/+$/, '').split('/').pop() || 'Spark'
  const titleSecs = video ? TITLE.fadeFrames / TITLE.fps + TITLE.hold : 0
  const folder = convertFolder.startsWith('/') || convertFolder.startsWith('~') ? convertFolder : (root ? root + '/' : '') + convertFolder
  const d = new Date(), pad = (v: number) => String(v).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
  const name = `spark-roll-${stamp}-${way}.${video ? 'mp4' : 'png'}`
  const work = `${folder}/.spark-roll-${stamp}`
  const when = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const theme = activeTheme(), g = ground(), light = theme === 'light'
  const pause = () => $.clock.now()
  const PART = 3_000_000
  const parts = Math.ceil(Math.ceil((W * H * 3) / 3) * 4 / PART)
  const calls = revisits(way) ? n : 0
  const est = jobsEstimate(list.map((source) => ({ source, way })))
  convertProgress = { done: 0, total: n, what: `the roll, ${way}` }
  const notes: string[] = []
  const rolled: Array<Painting & { shape: string }> = [] // the paintings as rolled (revisited ones as the painter gave them back): the music is read from these
  const run = async (): Promise<string> => {
    try {
      const gb = g.map((v) => Math.round(v * 255))
      for (let i = 0; i < n; i++) {
        let p: Painting & { shape: string } = list[i]!
        if (revisits(way)) { const r = await revisitPainting($, p, way as 'refined' | 'interpretive'); p = r.p; if (!r.ok && !notes.length) notes.push(r.note.replace(/^the painter/, 'for some paintings the painter')) }
        rolled.push(p)
        const seq = i + lead // its place in the clip, after the title card
        const lines = captionLines(p.title, `${i + 1} of ${n}`, when)
        const L = rollLayout(p.shape, W, H, lines.length)
        // the frame: the ground, the caption strip at the bottom (the same for all this painting's frames), the painting
        const frame = new Uint8Array(W * H * 3)
        for (let k = 0; k < W * L.areaH; k++) { frame[k * 3] = gb[0]!; frame[k * 3 + 1] = gb[1]!; frame[k * 3 + 2] = gb[2]! }
        frame.set(captionStrip(W, lines, g, { light }), W * L.areaH * 3)
        const nm = p.marks.length
        // each frame's pixels with f/frames of the marks laid: in depth (layered), or as the terminal draws them, the
        // finished marks kept on a raster of their own and only the one in progress drawn again
        let next: (q: number) => Promise<{ px: Float32Array }>
        if (way === 'layered') {
          const st = layeredStepper(p, L.pw, L.ph, { theme })
          next = async (q) => ({ px: await st.frame(q, pause) })
        } else {
          const floor = markFloor(L.pw)
          const base = createRaster(L.pw, L.ph), shot = createRaster(L.pw, L.ph)
          let laid = 0
          next = async (q) => {
            const whole = Math.min(nm, Math.floor(q))
            if (whole > laid) { await base.drawAsync(paintingScene({ ...p, marks: p.marks.slice(laid, whole) }, L.pw, L.ph, { reveal: 1, theme }), theme, { floor, keep: true }, pause); laid = whole }
            if (q - whole > 0.001 && whole < nm) {
              shot.px.set(base.px)
              shot.draw(paintingScene({ ...p, marks: [p.marks[whole]!] }, L.pw, L.ph, { reveal: q - whole, theme }), theme, { floor, keep: true })
              return shot
            }
            return base
          }
        }
        for (let f = 1; f <= frames; f++) {
          await pause() // let everything else run
          const shown = await next((f / frames) * nm)
          const rgb = toRGB8({ W: L.pw, H: L.ph, px: shown.px } as never, g)
          for (let y = 0; y < L.ph; y++) frame.set(rgb.subarray(y * L.pw * 3, (y + 1) * L.pw * 3), ((L.oy + y) * W + L.ox) * 3)
          const b64 = base64(frame)
          for (let k = 0; k < parts; k++) await $.fs.write(`${work}/f${String(seq).padStart(3, '0')}-${String(f - 1).padStart(3, '0')}.b64.${k}`, b64.slice(k * PART, (k + 1) * PART))
        }
        if (video) { // this painting's part of the clip, now, so its frames are gone before the next is drawn
          const seg = await runHelper($, ['segment', work, String(seq), String(frames), String(W), String(H), String(parts), String(fps), String(ROLL.hold)])
          if (!seg.ok) return 'no roll: ' + (/No such file|not found|ENOENT|code 127/i.test(seg.err) && !seg.out ? 'python3 was not found (the roll needs it, with ffmpeg)' : seg.err.trim().slice(-160) || 'the helper could not make it')
        }
        if (convertProgress) convertProgress.done++
        logRecent('roll ' + (i + 1))
      }
      const out = `${folder}/${name}`
      // the music: read from the paintings as rolled, played by the helper into a WAV the join lays under the clip
      let music = '', key = ''
      const score = rollScore(rolled, { reveal: ROLL.reveal, hold: ROLL.hold, fade: ROLL.fade, lead: lead && video ? titleSecs - ROLL.fade : 0 })
      // the title card, made last so it can name the music's key, but first in the clip
      if (lead) {
        const sub = `Spark · ${when} · ${plural(n)}${video && rollMusic ? ` · music in ${score.key}` : ''}`
        const glow = sessionColour(rolled)
        const tf = video ? TITLE.fadeFrames : frames
        const full = titleCard({ W, H, title, sub, ground: g, light, glow }) // drawn once; each frame brings it up out of the ground
        const card = new Uint8Array(full.length)
        for (let f = 1; f <= tf; f++) {
          await pause()
          const a = Math.min(1, f / tf)
          for (let k = 0; k < full.length; k += 3) for (let c = 0; c < 3; c++) card[k + c] = Math.round(full[k + c]! * a + gb[c]! * (1 - a))
          const b64 = base64(card)
          for (let k = 0; k < parts; k++) await $.fs.write(`${work}/f000-${String(f - 1).padStart(3, '0')}.b64.${k}`, b64.slice(k * PART, (k + 1) * PART))
        }
        if (video) {
          const seg = await runHelper($, ['segment', work, '0', String(TITLE.fadeFrames), String(W), String(H), String(parts), String(TITLE.fps), String(TITLE.hold)])
          if (!seg.ok) return 'no roll: ' + (seg.err.trim().slice(-160) || 'the helper could not make the title')
        }
      }
      if (video && rollMusic) {
        await $.fs.write(`${work}/score.json`, JSON.stringify(score))
        const played = await runHelper($, ['music', `${work}/score.json`, `${work}/music.wav`])
        if (played.ok) { music = `${work}/music.wav`; key = score.key }
        else notes.push('no music: ' + (played.err.trim().slice(-120) || 'the helper could not play it'))
      }
      const made = video
        ? await runHelper($, ['join', work, String(n + lead), out, [...(lead ? [titleSecs] : []), ...list.map(() => ROLL.reveal + ROLL.hold)].join(','), String(ROLL.fade), ...(music ? [music] : [])])
        : await runHelper($, ['apng', work, String(n + lead), String(frames), String(W), String(H), String(parts), '250', '2600', '3', out])
      if (!made.ok) return 'no roll: ' + (/No such file|not found|ENOENT/i.test(made.err) && !made.out ? 'python3 was not found (the roll needs it)' : made.err.trim().slice(-160) || 'the helper could not make it')
      const secs = Number(made.out.trim().split(/\s+/)[2]) || 0
      converted.push({ file: name, title: `the roll · ${plural(n)}`, when: d.toTimeString().slice(0, 5), mode: `roll, ${way}${video ? '' : ', animated PNG'}` })
      await $.fs.write(`${folder}/index.html`, galleryHTML(converted))
      const long = secs >= 60 ? `${Math.floor(secs / 60)} min ${Math.round(secs % 60)} s` : `${Math.round(secs)} s`
      return `rolled ${plural(n)} (${way})${lead ? `, opening with “${title}”,` : ''} into ${out} (${video ? `${W}x${H} MP4${key ? `, with its own music in ${key}` : ''}` : `${W}x${H} animated PNG: ffmpeg was not found, so a smaller one that plays in any browser (sudo apt install ffmpeg for the MP4)`}, ${long}), and the gallery page` + (notes.length ? '. ' + notes[0] : '')
    } catch (err) {
      return 'no roll: ' + String((err as Error)?.message || err).slice(0, 120)
    } finally {
      convertBusy = false
      convertProgress = null
    }
  }
  const length = n * (ROLL.reveal + ROLL.hold) - (n - 1) * ROLL.fade + (lead && video ? titleSecs - ROLL.fade : 0)
  void quietly(async () => {
    const text = await run()
    await quietly(() => $.ui.log('Spark: ' + text))
    await quietly(() => $.ui.toast(text.startsWith('rolled') ? `Spark: the roll is ready (${plural(n)}, ${way})` : 'Spark: ' + text))
  })
  return `rolling all ${plural(n)} into a clip, ${way}, ${video ? `${W}x${H} MP4, about ${Math.round(length)} s long` : `${W}x${H} animated PNG (ffmpeg was not found: sudo apt install ffmpeg for an MP4)`}, into ${folder}: ${lead ? `opening with a title card, “${title}”, then ` : ''}each laid down, held with its title, then crossfaded into the next${video && rollMusic ? ', to music of its own, read from the paintings' : ''}. ${calls ? `${calls} painter ${calls === 1 ? 'call' : 'calls'}, about ${kilo(est)} tokens` : 'No tokens'}. It goes on beside the work; Spark says when it is done (/spark state shows how far)`
}

// A live painting, if the turn has run long enough since the last one and this is a moment (or she has waited enough)
async function maybePaintLive($: EngineInterface, moment: boolean) {
  if (!paintOn || paintBusy || turnBegan < 0 || !turnFacts) return
  const since = (await hostNow($)) - Math.max(turnBegan, lastPaintAt)
  if (since < LIVE_GAP_S || (!moment && since < LIVE_GAP_S + LIVE_WAIT_S)) return
  lastLiveAt = lastPaintAt = Math.max(turnBegan, lastPaintAt) + since // the turn's end waits its 20 s after it
  void quietly(() => paintNow($, 'live'))
}

// One painting: of the last turn (or of her waking, before any turn), or, live, of the long turn still going. One at a
// time; nothing is written anywhere.
async function paintNow($: EngineInterface, why: 'turn' | 'asked' | 'live'): Promise<string> {
  if (paintBusy) return 'Spark is already painting'
  paintBusy = true
  let cost = 0 // what this painting uses: its reflection (live) and the painting itself
  lastPaintAt = await hostNow($).catch(() => lastPaintAt)
  const id = 'paint' + (paintCount + 1) + ':' + now().toFixed(2)
  let ok = false, react: string | null = null
  emit({ type: 'paint.start', id, toward: paintBeside ? PAINT_TOWARD.beside : PAINT_TOWARD.below }, true) // her painter is her own lane
  $.ui.invalidate('ui.render')
  const live = why === 'live' && turnBegan >= 0
  const turn = live
    ? { facts: turnFacts, end: { reason: 'still going', durationMs: (lastPaintAt - turnBegan) * 1000 }, answer: '' }
    : lastTurn ?? { facts: null, end: { reason: 'answer', durationMs: 0 }, answer: '' }
  try {
    const facts = painterFacts(turn.facts, { ...turn.end, mood: String(liveFrame().hover).replace(/^Spark · /, ''), turn: live ? turnsSeen + 1 : turnsSeen })
    let words = ''
    if (live && spoken.trim()) { // the builder's reflection, distilled by the small model from their own last words aloud
      const rq = reflectRequest(spoken)
      const f = await $.model.complete({ model: paintModel, system: rq.system, prompt: rq.prompt, maxTokens: 200, effort: 'low', timeoutMs: 20000 })
      cost += spend((f as { usage?: Record<string, number> }).usage)
      words = f.isAnswered ? cleanReflection(f.text) : ''
      if (words) reflection = words
    }
    const shape = paintRoom ? shapeFor(paintRoom.columns, paintRoom.rows * 2) : 'wide' // a cell is one pixel wide, two tall
    const req = painterRequest({ facts, palette, theme: activeTheme(), gist: live ? '' : turn.answer, reflection: words, live, shape, size: paintRoom ? [paintRoom.columns, paintRoom.rows * 2] : null })
    const r = await $.model.complete({ model: paintModel, system: req.system, prompt: req.prompt, maxTokens: 3000, effort: 'low', timeoutMs: 40000 })
    cost += spend((r as { usage?: Record<string, number> }).usage) // every arm carries what the call really cost
    if (!r.isAnswered) {
      paintNote = r.reason === 'api-error' ? `the API answered with an error${'status' in r && r.status ? ` (${r.status})` : ''}` : r.reason === 'aborted' ? 'it took too long' : 'the painter sent nothing back'
      logRecent('paint ✕')
      return 'no painting: ' + paintNote
    }
    const p = parsePainting(r.text, palette)
    if (!p) { paintNote = 'the painter answered something that was not a painting'; logRecent('paint ✕'); return 'no painting: ' + paintNote }
    painting = { ...p, at: now(), n: ++paintCount, shape, cost }
    story.push({ ...p, shape, cost, clock: new Date().toTimeString().slice(0, 5), live: why === 'live' })
    if (story.length > STORY_MAX) story.shift()
    storyOn = null // a new painting is shown as it arrives: the story steps aside
    ok = true; react = p.react
    paintSpent.paintings++
    paintNote = ''
    logRecent('paint ' + why)
    return 'painted' + (p.title ? ': ' + p.title : '') + (paneOpen && !focusMode ? '' : ' (it shows below Spark at the side: /spark)')
  } catch (err) {
    paintNote = String((err as Error)?.message || err) // a model the session may not use, for example
    logRecent('paint ✕')
    return 'no painting: ' + paintNote
  } finally {
    paintBusy = false
    emit({ type: 'paint.end', id, ok, react }, true) // handed down to the canvas (and how she answers it), or nothing came
    $.ui.invalidate('ui.render')
  }
}

// The painting as cells (or kitty pixels) for a canvas of columns × rows, drawn again only when something changed
function paintFrame(columns: number, rows: number): PaintSite['frame'] {
  const image = kitty
  const fine = hd && !image
  if (!paintSite || paintSite.columns !== columns || paintSite.rows !== rows || paintSite.image !== image || paintSite.hd !== fine) {
    const k = image ? Math.min(1, 640 / Math.max(columns * 8, rows * 16)) : 1
    const W = image ? Math.max(8, Math.round(columns * 8 * k)) : fine ? columns * 2 : columns
    const H = image ? Math.max(8, Math.round(rows * 16 * k)) : fine ? rows * 4 : rows * 2
    paintSite = { columns, rows, image, hd: fine, raster: createRaster(W, H), key: '', frame: {} }
  }
  const site = paintSite
  const P = shownPainting()
  const reveal = P ? Math.min(1, (now() - P.at) / REVEAL_S) : 1
  const key = `${P?.n ?? 0}|${reveal >= 1 ? 1 : reveal.toFixed(2)}|${activeTheme()}`
  if (site.key !== key) {
    site.raster.draw(paintingScene(P, site.raster.W, site.raster.H, { reveal, theme: activeTheme() }), activeTheme(), { res: site.hd ? 2 : 1 })
    site.frame = image ? { rgba: base64(toRGBA8(site.raster)), width: site.raster.W, height: site.raster.H } : { cells: base64(new Uint8Array((site.hd ? toQuadrants : toHalfBlocks)(site.raster, ground()).buffer)) }
    site.key = key
  }
  return site.frame
}

// What the painter has used this session, said plainly: shown small (dim) under the painting, in /spark state and when the painter is turned off
const kilo = (n: number) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n)
const paintOnText = () => `painting on: after each turn a small painter (${paintModel}) paints Spark's expression of it below her, from the turn's shape and a short excerpt of the reply. Each painting is one short ${paintModel} call through your session and uses tokens; what it has used shows under the painting. /spark paint paints one any time, /spark paint off stops it`
const spentText = () => `painter · ${paintSpent.paintings} ${paintSpent.paintings === 1 ? 'painting' : 'paintings'} · ${kilo(paintSpent.tokens)} tokens (${paintModel})`

// What goes in the room it is given, `width` columns by `room` rows: the painting at its own shape (wide, square or tall,
// whichever the room had when it was painted), as large as fits, centred, and its title in full under it. A little room:
// the title alone. None: nothing (the painting waits for room).
function paintBlock(els: any, width: number, room0: number): any[] {
  if (!(paintOn || storyOn) || room0 < 1 || width < 4) return []
  const painting = shownPainting() // in a story, the page it is on
  const { Box, Text, Raster, Image, Input, Button } = els
  // TALK, at the very bottom: what you last said, her answer, and a line to say something to her. It takes its rows
  // first only in a room big enough to hold the painting too; in a small one it waits
  const talkEls: any[] = []
  let talkRows = 0
  if (paintOn && sayTo && Input && room0 >= 8) {
    const heard = talk ? [Text({ children: ['› ' + talk.said], dimColor: true, wrap: 'truncate-end' })] : []
    const answer = talk ? (talk.busy ? 'Spark is listening…' : 'Spark: ' + talk.reply) : ''
    const answerRows = answer ? wrapRows(answer, width) : 0
    talkRows = heard.length + answerRows + 1
    talkEls.push(...heard, ...(answer ? [Text({ children: [answer], italic: true, wrap: 'wrap' })] : []),
      Input({ key: 'spark-say', placeholder: 'say something to Spark', submitLabel: 'say', value: '', autoFocus: true, onSubmit: (v: string) => { if (sayTo) sayTo(v) } })) // autoFocus: a click on her pane puts you here
  }
  const room = room0 - talkRows
  const busyWord = paintBusy ? (painting ? ' · painting…' : 'painting…') : ''
  if (!painting) return [...(busyWord ? [Text({ children: ['✎ ' + busyWord], italic: true, wrap: 'truncate-end' })] : []), ...talkEls]
  const words = '✎ ' + (painting.title || 'untitled') + busyWord
  const lines = wrapRows(words, width)
  const caption = Text({ children: [words], italic: true, wrap: lines <= room ? 'wrap' : 'truncate-end' })
  // what it cost, in small (dim) text at the bottom: this painting on its own, then the session's total. Each line only
  // when there is room for it after the title, and never at the cost of the painting itself (it needs at least 3 rows)
  const k = storyIndex()
  const costs = k >= 0
    ? [`story · ${k + 1} of ${story.length} · ${story[k]!.clock}${story[k]!.live ? ' · while it worked' : ''}${storyOn!.done ? ' · the end' : storyOn!.paused !== null ? ' · held' : ''}`] // which page of the session's story
    : painting.cost > 0 ? [`this painting · ${kilo(painting.cost)} tokens`, `session · ${spentText().replace(/^painter · /, '')}`] : []
  let spendRows = 0
  const spent: any[] = []
  for (const c of costs) {
    const r = wrapRows(c, width), after = spendRows + r
    if (!(room - lines - after >= 3 || (room - lines < 3 && room >= lines + after))) break
    spendRows = after
    spent.push(Text({ children: [c], dimColor: true, wrap: 'wrap' }))
  }
  // the story's controls, on one row under its line, only while a story is on: hold it on this page (to convert it:
  // /spark convert takes the page showing), let it go on, turn back or forward, or end it
  if (k >= 0 && Button && spendRows && room - lines - spendRows - 1 >= 3) {
    const held = storyOn!.paused !== null
    const ctl = (key: string, label: string, press: () => void) => Button({ key, label, plain: true, dimColor: true, onPress: press })
    spent.push(Box({ flexDirection: 'row', columnGap: 2, children: [
      ctl('story-play', held ? (storyOn!.done ? '▶ again' : '▶ play') : '⏸ pause', () => { if (!storyOn) return; if (held && storyOn.done) { storyTurn(0); storyPause(false) } else storyPause(!held) }),
      ctl('story-back', '‹ back', () => storyTurn(k - 1)),
      ctl('story-next', 'next ›', () => storyTurn(k + 1)),
      ctl('story-end', '■ end', () => { storyOn = null }),
    ] }))
    spendRows += 1
  }
  const gap = room >= lines + spendRows + 7 ? 1 : 0
  const free = Math.min(60, room - lines - spendRows - gap)
  paintRoom = { columns: width, rows: Math.max(3, free) } // the next painting is composed for this room's shape
  const a = SHAPES[painting.shape] ?? 2 // width over height, in pixels (a cell is one pixel wide, two tall)
  const rows = Math.min(free, Math.floor(width / (2 * a)))
  if (rows < 3) return [caption, ...spent, ...talkEls]
  const columns = Math.max(4, Math.min(width, Math.round(rows * 2 * a))) // its own shape: fitted, never stretched
  const fr = paintFrame(columns, rows)
  const art = fr.cells
    ? Raster({ key: 'painting', columns, rows, cells: fr.cells })
    : Image({ key: 'painting', columns, rows, alt: painting.title || 'a painting', source: { rgba: fr.rgba!, width: fr.width!, height: fr.height! } })
  const centred = Box({ flexDirection: 'row', justifyContent: 'center', width, children: [art] })
  return [...(gap ? [Text({ children: [' '] })] : []), centred, caption, ...spent, ...talkEls]
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

// The welcome's tree for a band of maxRows by columns (leaving `keep` rows for what others draw there): the eye as large
// as the room allows, up to 9 rows, and beside it its name and a line, as the launch banner has them. Too little room
// (fewer than 4 rows, or too narrow for the eye): nothing, the band is left as it was
const WELCOME_TITLE = 'C Y C L O P S   E Y E', WELCOME_LINE = '· · ·  the eye is open  · · ·'
function welcomeTree(els: any, maxRows: number, columns: number, keep: number): any {
  let rows = Math.min(9, maxRows - keep)
  while (rows >= 4 && eyeColumns(rows) > columns) rows--
  if (rows < 4) return null
  const cols = eyeColumns(rows), room = columns - cols - 2 // beside it: its name, and the line when there is room for it too
  const fine = hd, light = activeTheme() === 'light'
  const key = `${rows}|${fine}|${light}`
  if (welcomeArt?.key !== key) {
    const r = eyeRaster(fine ? cols * 2 : cols, fine ? rows * 4 : rows * 2, { light })
    welcomeArt = { key, cells: base64(new Uint8Array((fine ? toQuadrants : toHalfBlocks)(r, ground()).buffer)) }
  }
  const { Box, Text, Raster } = els
  const eye = Raster({ key: 'cyclops-eye', columns: cols, rows, cells: welcomeArt.cells })
  if (room < WELCOME_TITLE.length) return eye
  return Box({ flexDirection: 'row', columnGap: 2, alignItems: 'center', children: [eye, Box({ flexDirection: 'column', children: [
    Text({ children: [WELCOME_TITLE], bold: true, color: light ? '#c2700e' : '#ffaa28' }),
    ...(room >= WELCOME_LINE.length ? [Text({ children: [WELCOME_LINE], color: light ? '#4a6aa8' : '#6e8cc8' })] : []),
  ] })] })
}

const HELP = [
  '/spark         open or close Spark at the side',
  '/spark side    a slim pane at the side (about a quarter of the width)',
  '/spark top     a short strip above the prompt instead (no pane)',
  '/spark kitty   pane as real pixels (kitty / Ghostty)',
  '/spark hd      on | off: four pixels to a cell in any terminal (on by default; off is the half blocks)',
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
  '/spark paint   a small painter paints each turn below Spark, and one now (it uses tokens); /spark paint off stops it',
  '/spark story   the session\'s paintings told again in order, each laid down anew (no tokens); /spark story again ends it',
  '/spark convert the painting made large, SVG and PNG, into the convert folder: click what (this painting, every way, all paintings, the roll) then which way (faithful, layered, refined, interpretive, each with its token cost), or say it: /spark convert layered 4k, every, all refined, roll layered hd',
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
let lastViewport = 0 // the terminal width the surface last drew at (any of Spark's drawings, the spinner too)
let convertFolder = 'spark-paintings' // the convertFolder setting: where /spark convert writes, relative to the project
let converted: Array<{ file: string; title: string; when: string; mode: string }> = [] // this session's conversions, for the gallery page
let convertBusy = false
let convertCaption = true // the convertCaption setting: the title and a line (Spark · the date · the way) under the picture
let sideWidth = 0    // the sideWidth setting: the side pane's width in columns, 0 for automatic
// automatic: a quarter of the widest terminal width known, 30 to 44 columns; 44 when none is known yet
const sideColumns = (terminal: number) => {
  if (sideWidth > 0) return Math.max(24, Math.min(120, Math.round(sideWidth)))
  const t = Math.max(terminal, lastViewport)
  return t > 0 ? Math.max(30, Math.min(44, Math.round(t * 0.25))) : 44
}
const seeViewport = (e: { viewport?: { columns?: number } }) => { const c = e.viewport?.columns; if (typeof c === 'number' && c > 0) lastViewport = c }

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
  if (typeof o.hd === 'boolean') hd = o.hd
  if (typeof o.rollMusic === 'boolean') rollMusic = o.rollMusic
  if (typeof o.rollTitle === 'boolean') rollTitleOn = o.rollTitle
  if (typeof o.welcome === 'boolean') welcomeOn = o.welcome
  if (typeof o.statusLine === 'boolean') statusOn = o.statusLine
  if (typeof o.murmur === 'boolean') murmurOn = o.murmur
  if (typeof o.band === 'boolean') band = o.band // the band from the start (a band needs no seat, so it shows at any width)
  if (typeof o.chimeAfterSeconds === 'number' && o.chimeAfterSeconds >= 0) chimeAfter = o.chimeAfterSeconds
  if (typeof o.link === 'boolean') linkOn = o.link
  if (typeof o.paint === 'boolean') paintOn = o.paint
  if (typeof o.paintModel === 'string' && MODEL_ID.test(o.paintModel.trim())) paintModel = o.paintModel.trim()
  if (typeof o.openPainting === 'boolean') openPainting = o.openPainting
  if (typeof o.sideWidth === 'number' && o.sideWidth >= 0) sideWidth = o.sideWidth
  if (typeof o.convertFolder === 'string' && o.convertFolder.trim()) convertFolder = o.convertFolder.trim()
  if (typeof o.convertCaption === 'boolean') convertCaption = o.convertCaption

  on('session.start', async ($, e, next) => {
    await refreshTheme($)
    await $.command.register({ name: 'spark', description: 'Spark, Claude\'s living presence: /spark [side|top|focus|kitty|hd|state|calm|theme|palette|sound|murmur|status|replay|ask|link|paint|story|convert|help]', immediate: true })
    const wanted = (await $.env.get('SPARK_LINK').catch(() => undefined))?.trim().toLowerCase()
    linkWanted = wanted === '1' || wanted === 'on' ? true : wanted === '0' || wanted === 'off' ? false : null
    if (linkWanted !== null) linkOn = linkWanted
    if (linkOn) await startLink($)
    $.clock.every(50, () => void paint($))
    // a session just begun: a plugin reloaded mid-conversation (an update) finds turns already taken, and stays quiet
    welcome = welcomeOn && (await $.session.turns().catch(() => 0)) === 0
    emit({ type: 'session.wake' })
    await cue($, 'wake', 'full')
    return next(e)
  })

  // follow the host's theme when the person changes it
  on('config.set', { key: 'theme' }, async ($, e, next) => { const res = await next(e); await quietly(() => refreshTheme($)); return res })

  // a /clear ends the conversation without a new session.start: the stars are gone and Spark wakes again
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') { emit({ type: 'session.wake', fresh: true }); await cue($, 'wake', 'full'); painting = null; paintSite = null; lastTurn = null; turnsSeen = 0; reflection = ''; spoken = ''; talk = null; story.length = 0; storyOn = null; welcome = welcomeOn; $.ui.invalidate('ui.render') }
    const res = await next(e)
    if (e.reason === 'clear' && linkOn) { await stopLink(); await startLink($) } // a new conversation is a new instance
    return res
  })

  // ---------------------------------------------------------------- real events → presence events
  on('prompt.edit', async ($, e, next) => { emit({ type: 'prompt.edit' }); return next(e) })
  on('prompt.submit', async ($, e, next) => {
    // typed (or delivered) while a turn runs: it waits until the model takes it in, at her edge
    if (e.turnId) queuedMsgs++
    await quietly(() => emit(e.turnId ? { type: 'prompt.queue' } : { type: 'prompt.submit' }))
    return next(e)
  })
  // the chat's spinner: Spark reads the word it shows, so "working" says it the same way. It draws exactly what it would
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    seeViewport(e as never)
    const p = e.props as { word?: string; message?: string | null }
    const w = String((p.message || p.word || '')).replace(/[….]+$/, '').trim()
    if (w && w.length <= 40) spinnerWord = w
    return next(e)
  })
  // the model takes a waiting message into the running turn. The engine keeps it as a queued_command attachment, or as a
  // prompt (or a delivery) row of its own; any of them, on the main loop while something is waiting, is the take
  const taken = async (e: { agentId?: string }) => {
    if (e.agentId || queuedMsgs < 1 || turnBegan < 0) return
    queuedMsgs--
    await quietly(() => emit({ type: 'prompt.take' }))
  }
  on('session.append', { door: 'attachment' }, async ($, e, next) => { if (e.message?.name === 'queued_command') await taken(e); return next(e) })
  on('session.append', { door: 'prompt' }, async ($, e, next) => { await taken(e); return next(e) })
  on('session.append', { door: 'delivery' }, async ($, e, next) => { await taken(e); return next(e) })
  on('turn.start', async ($, e, next) => { if (welcome) { welcome = false; $.ui.invalidate('ui.render') } emit({ type: 'turn.start' }); turnFacts = newTurnFacts(); turnBegan = await hostNow($).catch(() => -1); lastStream = ''; spoken = ''; queuedMsgs = 0; return next(e) })

  on('turn.step', async function* ($, e, next) {
    const sub = Boolean(e.agentId)
    // how hard the model is asked to think, and which model answers: real, per request (a subagent's are its own)
    if (!sub) { emit({ type: 'step', model: e.model, effort: e.effort, index: e.index }); if (turnFacts) { turnFacts.steps++; turnFacts.effort = e.effort ?? turnFacts.effort } }
    const stream = next(e)
    for await (const chunk of stream) {
      if (chunk.kind === 'thinking' || chunk.kind === 'text') {
        // a subagent's stream lives inside its lane (its sibling spark beats); only the main loop moves Spark itself
        emit(sub ? { type: 'agent.stream', n: chunk.text.length } : { type: 'stream', kind: chunk.kind, n: chunk.text.length }, sub)
        if (turnFacts) { if (sub) turnFacts.agentStreams++; else if (chunk.kind === 'thinking') turnFacts.thinkChars += chunk.text.length; else turnFacts.textChars += chunk.text.length }
        if (!sub && murmurOn) await murmur($, chunk.kind === 'thinking' ? 'think' : 'write')
        if (!sub && chunk.kind === 'text') spoken = (spoken + chunk.text).slice(-SPOKEN_CHARS) // what the builder says aloud, never its thinking
        if (!sub) { await quietly(() => maybePaintLive($, lastStream === 'thinking' && chunk.kind === 'text')); lastStream = chunk.kind } // thinking turning into writing moves her
      }
      yield chunk
    }
    return await stream.result
  })

  on('tool.call', async ($, e, next) => {
    if ('agentId' in e && e.agentId) return next(e)
    const id = e.tool_use_id ?? 'call' + ++ids
    const raw = e as unknown as Record<string, unknown>
    const input = { command: raw.command, subagent_type: raw.subagent_type, model: raw.model, url: raw.url }
    const family = laneFor(e.tool, input as Record<string, unknown>).family
    const began = now() // wall time: read without a wait, so the call goes out exactly as before
    await quietly(() => { emit({ type: 'tool.start', id, tool: e.tool, input }); recordTool(turnFacts, family) })
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
        if (turnFacts) { if (threw) turnFacts.interrupted++; else if (denied) turnFacts.denied++; else if (failed) turnFacts.errors++; else if (failedTools.has(e.tool)) turnFacts.mends++ }
        if (threw || denied) { /* neither a failure nor a mend */ }
        else if (failed) failedTools.add(e.tool)
        else if (failedTools.delete(e.tool)) { await cue($, 'mend', 'full'); await maybePaintLive($, true); return } // it worked where the last call failed
        await maybePaintLive($, !threw && (family === 'agent' || now() - began >= LONG_CALL_S)) // a subagent back, or a long call settled
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
      if (reason !== 'aborted') {
        turnsSeen++
        lastTurn = { facts: turnFacts, end: { reason, durationMs: e.durationMs }, answer: typeof e.answer === 'string' ? e.answer : '' }
        // the painter, on its own: a turn worth painting, at most one every 20 s, never in the turn's way
        const sinceLive = (await hostNow($).catch(() => Infinity)) - lastLiveAt
        if (paintOn && !paintBusy && e.durationMs >= AUTO_MIN_MS && now() - lastAutoPaint >= AUTO_GAP_S && sinceLive >= AUTO_GAP_S) { lastAutoPaint = now(); void quietly(() => paintNow($, 'turn')) }
      }
      turnFacts = null; spoken = ''; spinnerWord = ''
      turnBegan = -1
    }
    return next(e)
  })

  // Claude Code's own /copy takes the last response too
  // Claude Code's own /copy takes the last response too: counted only when it says it copied (a picker left, or nothing
  // to copy, is not a copy)
  // the name you give the conversation with /rename: the roll's title (read only from the command you typed)
  on('command.run', { command: 'rename' }, async ($, e, next) => {
    const res = await next(e)
    const name = String((e as { args?: string }).args ?? '').trim()
    if (name) sessionName = name.slice(0, 60)
    return res
  })
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
        if (openPainting && !paintOn) { paintOn = true; text += '; ' + paintOnText() } // the openPainting setting
        if (!named && sound !== 'off') { named = true; await cue($, 'name', 'soft') }
      }
    }
    else if (word === 'kitty') { kitty = !kitty; text = kitty ? 'pane: real pixels (kitty / Ghostty)' : hd ? 'pane: HD cells (four pixels to a cell)' : 'pane: half-block cells' }
    else if (word === 'hd') {
      if (arg !== '' && arg !== 'on' && arg !== 'off') text = 'hd takes: on | off'
      else { hd = arg === 'on' ? true : arg === 'off' ? false : !hd; sites.clear(); paintSite = null; $.ui.invalidate('ui.render'); text = hd ? 'hd on: Spark and her paintings in four pixels to a cell (quadrant blocks), finer lines, the same light' : 'hd off: two pixels to a cell (half blocks), as before 1.7.2' }
    }
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
      text = liveFrame().hover + '\n' + `palette ${palette} · theme ${theme === 'auto' ? 'auto→' + hostTheme : theme} · calm ${calm ? 'on' : 'off'} · hd ${hd ? 'on' : 'off'} · sound ${sound} · status ${statusOn ? 'on' : 'off'} · murmur ${murmurOn ? 'on' : 'off'} · link ${linkOn ? linkStatus : 'off'}${paintOn ? ' · paint on' + (paintSpent.calls ? ` (${spentText()})` : '') : ''}${convertProgress ? ` · converting ${convertProgress.done} of ${convertProgress.total} (${convertProgress.what})` : ''}\n` + (reflection ? `last reflection (sent to the painter): ${reflection}\n` : '') + recent.join('\n')
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
    else if (word === 'convert') text = await convertPainting($, e.args.trim().toLowerCase().split(/\s+/).slice(1), e.args.trim().split(/\s+/).slice(1))
    else if (word === 'story') { // the session's paintings, told again in order, once through: nothing is asked of any model
      const page = () => storyOn ? `page ${storyIndex() + 1} of ${story.length}` : ''
      if (storyOn && (arg === 'pause' || arg === 'hold')) { storyPause(true); text = `story held on ${page()}: /spark convert makes this one large; /spark story play goes on` }
      else if (storyOn && (arg === 'play' || arg === 'go')) { if (storyOn.done) storyTurn(0); storyPause(false); text = `story goes on from ${page()}` }
      else if (storyOn && (arg === 'next' || arg === 'back')) { storyTurn(storyIndex() + (arg === 'next' ? 1 : -1)); text = `story: ${page()}${storyOn.paused !== null ? ' (held)' : ''}` }
      else if (storyOn && arg !== '' && arg !== 'end' && arg !== 'off') text = 'story takes: pause | play | next | back | end'
      else if (storyOn) { storyOn = null; text = 'story ended: back to the last painting' }
      else if (arg !== '' && arg !== 'on') text = story.length ? 'no story is on: /spark story starts one' : 'no paintings yet this session: /spark paint makes one'
      else if (!story.length) text = 'no paintings yet this session: /spark paint makes one'
      else {
        if (!paneOpen) { band = false; text = (await openPane($)) + '; ' } else text = ''
        hostT = (await $.clock.now()) / 1000
        storyOn = { at: hostT, paused: null, done: false, shownAt: now() }; storySlide = 0
        text += `story: ${story.length} ${story.length === 1 ? 'painting' : 'paintings'} from this session, each laid down again in order, ${STORY_S} s apiece, once through, then held on the last. Under the painting: pause (to convert that one), back, next, end; or /spark story pause | play | next | back | end`
      }
    }
    else if (word === 'paint') { // two controls: /spark paint (on, and one now; opens Spark herself if she is not up) and /spark paint off
      if (arg === 'off') {
        const was = paintOn
        paintOn = false; painting = null; paintSite = null; talk = null
        text = (was ? 'painting off: the room below Spark is empty again' : 'painting is already off') + (paintSpent.calls ? ' · ' + spentText() : '')
      } else if (arg === '' || arg === 'on' || arg === 'now') { // on and now are the old words for the same thing
        const turning = !paintOn
        paintOn = true
        let opened = ''
        if (!paneOpen && !focusMode) { band = false; opened = (await openPane($)) + '; ' } // she is not there yet: the painting needs her pane, so open it
        const made = await paintNow($, 'asked')
        text = opened + (turning ? paintOnText() + '. ' + made.replace(/ \(it shows below Spark at the side: \/spark\)$/, '') : made)
      } else text = '/spark paint turns the painter on and paints one now (it uses tokens); /spark paint off stops it'
    }
    else if (word === 'help' || (word !== '' && word !== 'pane')) text = HELP
    else if (focusMode) text = await leaveFocus($, false) // a bare /spark in focus: back to your view
    else if (paneOpen) { paneOpen = false; await $.ui.close({ id: PANE }).catch(() => undefined); text = 'presence pane closed' }
    else { // opening Spark: the first time in a session it says its name (when sound is on); never again in that session
      band = false // at the side now, so the strip above the prompt gives way
      text = await openPane($)
      if (openPainting && !paintOn) { paintOn = true; text += '; ' + paintOnText() } // the openPainting setting
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
    seeViewport(e as never)
    sayTo = (words: string) => { void quietly(() => talkTo($, words)) } // the Input under her painting talks to her
    const els = $.ui.resolve(e)
    const { f, label, said } = paneFrame()
    if (e.surface === 'terminal') {
      paneSeenOnTerminal = true
      const { Box, Text, Raster, Image } = $.ui.resolve(e)
      const W = e.props.bodyColumns ?? 60
      const bodyRows = e.props.scroll?.bodyRows ?? 0
      let columns = Math.max(16, Math.min(160, W - 1))
      let rows = Math.max(8, Math.min(60, Math.round(columns / 2.1)))
      if (focusMode) {
        // the whole body, as it is *now*: every render recomputes from the pane's current size, so a resize is
        // recompute → recompose → keep painting. Never larger than the room (a drawing taller than its pane is clipped
        // away), with the truthful line under it when there is room for both
        const bodyCols = W
        const labelRows = wrapRows(label, bodyCols)
        const showLabel = bodyRows >= 5 + labelRows
        const room = (bodyRows || 8) - (showLabel ? labelRows : 0) // a size not reported yet: draw small, the next render has it
        if (room < 4 || bodyCols < 8) return Box({ flexDirection: 'row', justifyContent: 'center', width: bodyCols, children: [Text({ children: [f.glyph + ' ' + label], wrap: 'wrap' })] })
        rows = Math.min(120, room)
        columns = Math.min(320, bodyCols)
        const site = siteFor(PANE, e.surface, columns, rows, 'panel', kitty, true)
        const fr = frameFor(site, f, true)
        const art = fr.cells
          ? Raster({ key: 'spark', columns, rows, cells: fr.cells })
          : Image({ key: 'spark', columns, rows, alt: label, source: { rgba: fr.rgba!, width: fr.width!, height: fr.height! } })
        return Box({ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: bodyCols, ...(bodyRows ? { height: bodyRows } : {}),
          children: showLabel ? [art, Text({ children: [label], wrap: 'wrap' })] : [art] })
      }
      // The side pane, laid out for the room it really has, on every render (a resize is just the next render). Text is
      // never cut short: the state line, the Link line and the painting's title wrap, and their rows are counted first.
      const linkText = linkOn && linkView && !replay ? linkLine(linkView) : ''
      // her lines, each on a row of its own that is always there, so nothing above the painting ever changes place:
      // Claude's own breath (blank between turns), her state line, what you are waiting on, then the effort (blank
      // between turns; it never changes within one, so it sits at the bottom), then Link
      const voice = voiceLine(f)
      const lines: Array<[string, Record<string, unknown>]> = [
        [voice || ' ', { color: 'claude' }],
        [said.head, {}],
        ...said.notes.map((n): [string, Record<string, unknown>] => ['· ' + n, {}]),
        [said.effort || ' ', { dimColor: true }],
        ...(linkText ? [[linkText, { dimColor: true }]] as Array<[string, Record<string, unknown>]> : []),
      ]
      const textRows = (width: number) => heldRows(width, lines.reduce((n, [t]) => n + wrapRows(t, width), 0))
      // her lines in a box of the rows held for them, so whatever sits below never moves when they change
      const sparkText = (width: number) => [Box({ flexDirection: 'column', width, height: textRows(width),
        children: lines.map(([t, style]) => Text({ children: [t], wrap: 'wrap', ...style })) })]
      const draw = (cols: number, rws: number) => {
        const site = siteFor(PANE, e.surface, cols, rws, 'panel', kitty)
        const fr = frameFor(site, f, true)
        return fr.cells
          ? Raster({ key: 'spark', columns: cols, rows: rws, cells: fr.cells })
          : Image({ key: 'spark', columns: cols, rows: rws, alt: label, source: { rgba: fr.rgba!, width: fr.width!, height: fr.height! } })
      }
      const painted = (paintOn || storyOn !== null) && !replay && (shownPainting() !== null || paintBusy)
      // A wide, short room (above the prompt on a narrow terminal, or a pane dragged wide): Spark and her painting side by
      // side, so neither has to give way. Spark keeps her own shape (twice as many columns as rows) and the larger share.
      paintBeside = bodyRows > 0 && W >= 40 && (e.props.placement === 'inline' || W >= bodyRows * 3) // where her painter's lane reaches
      if (painted && paintBeside) {
        const left = Math.max(16, Math.floor((W - 2) * 0.45)), right = W - 2 - left
        let rws = Math.max(2, Math.min(60, bodyRows - textRows(left)))
        let cols = Math.min(left, rws * 2)
        if (cols < rws * 2) rws = Math.max(2, Math.floor(cols / 2))
        cols = Math.max(4, cols)
        return Box({ flexDirection: 'row', columnGap: 2, children: [
          Box({ flexDirection: 'column', width: left, children: [draw(cols, rws), ...sparkText(left)] }),
          Box({ flexDirection: 'column', width: right, children: paintBlock(els, right, bodyRows) }),
        ] })
      }
      // Otherwise a column: Spark, her line, then the painting in the rows she does not use (she never gets smaller for it)
      const under = textRows(W)
      if (bodyRows > under + 2 && rows > bodyRows - under) rows = bodyRows - under
      if (e.props.placement === 'inline' && bodyRows > 0 && bodyRows - under < rows) { rows = Math.max(2, bodyRows - under); columns = Math.min(columns, rows * 2) } // a short inline pane: fit it, never clip it
      const below = (paintOn || storyOn !== null) && !replay && bodyRows > 0 ? paintBlock(els, columns, bodyRows - rows - under) : [] // the painter on: her painting, and a line to talk to her
      return Box({ flexDirection: 'column', width: W, children: [draw(columns, rows), ...sparkText(W), ...below] })
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
    seeViewport(e as never)
    const below = await next(e)
    const els = $.ui.resolve(e)
    if (welcome && !focusMode && e.surface === 'terminal' && !e.props.hasSurvey) { // the welcome, until the first turn
      const w = welcomeTree(els, e.props.maxRows ?? 0, e.props.bodyColumns ?? 0, below ? 2 : 0)
      if (w) return below ? els.Box({ flexDirection: 'column', children: [w, below as never] }) : w
    }
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
