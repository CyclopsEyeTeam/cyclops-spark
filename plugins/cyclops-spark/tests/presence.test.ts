import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { createPresence } from '../hooks/core.js'
import { linkFacts } from '../hooks/link-view.js'
import type { Engine } from 'claude-code/testing'

const loose = <T>(v: unknown) => v as T
const cmd = ($: Engine, args: string) => $.command.run(loose({ command: 'spark', args, origin: { kind: 'person' }, presentation: {} }))

function engine(on: On) {
  mock.store(on)
  const clock = mock.clock(on)
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => $.ui.resolve(e).Text({ children: ['engine band'] }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  return clock
}

const PANE = {
  component: 'Pane', requestId: 'cyclops-spark',
  props: { title: 'Spark', isFocused: false, bodyColumns: 64, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  viewport: { columns: 160, rows: 40 },
} as const
// the terminal drawing as words [codePoint, fg, bg] per cell. Drawn for a dark ground, faint light fades into near-black
// cells; drawn for a light ground, nothing drawn is near-black. `lightGround` reads which one a drawing was made for
const words = (cells: unknown) => { const b = Uint8Array.from(atob(String(cells)), (c) => c.charCodeAt(0)); return Array.from(new Uint32Array(b.buffer)) }
const lightGround = (cells: unknown) => { const w = words(cells); let n = 0, dark = 0; for (let i = 0; i < w.length; i += 3) { const fg = w[i + 1]!; if (fg === 0x01000000) continue; n++; if (Math.max((fg >> 16) & 255, (fg >> 8) & 255, fg & 255) < 60) dark++ } return n > 0 && dark / n < 0.02 }
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  viewport: { columns: 100, rows: 40 },
} as const

test('the pane is a Raster in the terminal; any other surface gets only the glyph and the truthful state line', async ($, on) => {
  engine(on)
  const desk = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'desktop', ...PANE })
  expect(await desk.find({ type: 'Text', text: /Spark · idle/ })).toBeDefined()
  expect(await desk.find({ type: 'Raster' })).toBeUndefined()
  expect(await desk.find({ type: 'Image' })).toBeUndefined()
  await desk.unmount()
  const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...PANE })
  const raster = await term.find({ type: 'Raster', key: 'spark' })
  expect(raster).toBeDefined()
  expect(raster?.props.columns).toBe(63)
  await term.unmount()
})

test('a held MCP call to a local model shows as a model lane', async ($, on) => {
  engine(on)
  let release = () => {}
  on('tool.call', () => new Promise((resolve) => { release = () => resolve(loose({ result: 'ok' })) }))
  await $.turn.start(loose({ text: 'go', turnId: 'a' }))
  const call = $.tool.call(loose<never>({ tool: 'mcp__ollama__generate', model: 'gemma3', tool_use_id: 'o1' }))
  for (let i = 0; i < 5; i++) await Promise.resolve()
  expect((await cmd($, 'state')).text).toMatch(/^Spark · consulting · gemma3 lane/)
  release()
  await call
  await $.turn.complete(loose({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 'a' }))
  expect((await cmd($, 'state')).text).toMatch(/^Spark · done/)
})

test('Spark never hooks the permission check: Claude Code decides alone', async ($, on) => {
  engine(on)
  on('tool.check', async () => ({ decision: 'ask' as const }))
  expect(await $.tool.check(loose({ tool: 'Bash', input: {}, tool_use_id: 'p1' }))).toMatchObject({ decision: 'ask' })
  expect((await cmd($, 'state')).text).not.toMatch(/waiting on you/)
})

test('band preview composes beside whatever already draws the band (drawn in the terminal, the glyph elsewhere)', async ($, on) => {
  engine(on)
  await cmd($, 'band')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'cyclops-spark', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /engine band/ })).toBeDefined()
    if (surface === 'terminal') expect(await ui.find({ type: 'Raster' })).toBeDefined()
    else expect(await ui.find({ type: 'Text', text: /Spark · / })).toBeDefined()
    await ui.unmount()
  }
  await cmd($, 'band')
  const ui = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
})

test('kitty mode draws real pixels as an Image', async ($, on) => {
  engine(on)
  await cmd($, 'kitty')
  const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...PANE })
  expect(await term.find({ type: 'Image', key: 'spark' })).toBeDefined()
  await term.unmount()
  await cmd($, 'kitty')
})

test('talking with Keeper (GPT) is a peer lane, drawn in the terminal', async ($, on) => {
  engine(on)
  let release = () => {}
  on('tool.call', () => new Promise((resolve) => { release = () => resolve(loose({ result: 'ok' })) }))
  await $.turn.start(loose({ text: 'go', turnId: 'k' }))
  const call = $.tool.call(loose<never>({ tool: 'Bash', command: 'codex exec "review core.js"', tool_use_id: 'k1' }))
  for (let i = 0; i < 5; i++) await Promise.resolve()
  expect((await cmd($, 'state')).text).toMatch(/^Spark · talking with Keeper\n/)
  const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...PANE })
  expect(await term.find({ type: 'Raster', key: 'spark' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /talking with Keeper/ })).toBeDefined()
  await term.unmount()
  release()
  await call
})

// ------------------------------------------------------------------------------------------------ release-candidate additions
// The plugin's own module state lives for the whole run, so each test puts every setting back.
const reset = async ($: Engine) => { for (const c of ['calm off', 'theme auto', 'palette spark', 'sound off', 'status off', 'murmur off', 'link off']) await cmd($, c) }
const say = async ($: Engine, args: string) => String((await cmd($, args)).text ?? '')
const settings = async ($: Engine) => (await say($, 'state')).split('\n')[1] ?? ''
const refusal = (turnId: string, secs = 1) => loose<never>({ reason: 'refusal', refusal: { category: null, explanation: null }, answer: '', durationMs: secs * 1000, isAborted: false, turnId })
const answer = (turnId: string, secs: number) => loose<never>({ reason: 'answer', answer: '', durationMs: secs * 1000, isAborted: false, turnId })

test('commands: each setting changes, reports itself, rejects what it cannot take, and is listed by state and help', async ($, on) => {
  engine(on)
  expect((await cmd($, 'palette ember')).text).toMatch(/^palette: ember/)
  expect((await cmd($, 'palette plaid')).text).toMatch(/palette takes: spark \| aurora \| ember \| moon/)
  expect((await cmd($, 'theme light')).text).toBe('theme: light')
  expect((await cmd($, 'theme loud')).text).toMatch(/theme takes: auto \| dark \| light/)
  expect((await cmd($, 'calm on')).text).toMatch(/^calm: no ambient/)
  expect((await cmd($, 'sound loud')).text).toMatch(/sound takes: off \| soft \| full/)
  expect(await settings($)).toBe('palette ember · theme light · calm on · sound off · status off · murmur off · link off')
  // a bare word cycles through the choices
  expect((await cmd($, 'palette')).text).toMatch(/^palette: moon/)
  expect((await cmd($, 'theme')).text).toMatch(/^theme: auto/)
  const help = (await cmd($, 'help')).text
  for (const w of ['band', 'kitty', 'state', 'calm', 'theme', 'palette', 'sound', 'murmur', 'status', 'replay', 'focus']) expect(help).toContain('/spark ' + w)
  expect((await cmd($, 'nonsense')).text).toBe(help) // an unknown word shows help instead of toggling the pane
  await cmd($, 'palette spark'); await cmd($, 'calm off')
  expect(await settings($)).toBe('palette spark · theme auto→dark · calm off · sound off · status off · murmur off · link off')
})

test('calm removes the ambient motion from the drawing, and palette and theme really change what is drawn', async ($, on) => {
  engine(on)
  const cells = async () => { const ui = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...PANE }); const c = String((await ui.find({ type: 'Raster', key: 'spark' }))?.props.cells); await ui.unmount(); return c }
  const later = async () => { const t0 = Date.now(); while (Date.now() - t0 < 400) await Promise.resolve() } // real time passes (the drawing reads the wall clock)
  await cmd($, 'calm on')
  const still = await cells(); await later()
  expect(await cells()).toBe(still) // nothing real happened, and nothing ambient moves: the same drawing
  await cmd($, 'calm off')
  const a = await cells(); await later()
  expect(await cells()).not.toBe(a) // ambient breathing and drift are back
  await cmd($, 'calm on')
  await cmd($, 'palette aurora')
  const aurora = await cells()
  await cmd($, 'palette spark')
  expect(await cells()).not.toBe(aurora)
  await cmd($, 'theme light')
  expect(lightGround(await cells())).toBe(true)
  await cmd($, 'theme dark')
  expect(lightGround(await cells())).toBe(false)
  await reset($)
})

test('sound is off by default; soft speaks only what is worth hearing from another room; full adds the small ones; one at a time', async ($, on) => {
  const clock = engine(on)
  const played: Array<{ asset: string; gain?: number }> = []
  on('audio.play', async (_$, e) => { played.push({ asset: String((e.clip as { asset?: string }).asset), gain: e.gain }); return loose({ value: undefined }) })
  const fail = async (id: string) => { await $.turn.start(loose({ text: 'go', turnId: id })); await $.turn.complete(loose<never>({ reason: 'error', answer: '', durationMs: 1000, isAborted: false, turnId: id })) }
  const assets = () => played.map((p) => p.asset)

  // off: nothing plays, whatever happens
  await fail('e0')
  await $.turn.start(loose({ text: 'go', turnId: 't0' })); await $.turn.complete(refusal('t0'))
  expect(played).toHaveLength(0)

  // soft: the enabling gesture previews the level; then errors, refusals and long answers are heard
  expect((await cmd($, 'sound soft')).text).toMatch(/^sound: soft/)
  expect(assets()).toEqual(['sounds/bloom.wav'])
  expect(played[0]!.gain).toBe(0.5)
  await clock.advance(3000) // the preview (2.9 s) has finished
  await fail('e1')
  expect(assets().slice(1)).toEqual(['sounds/error.wav'])
  // a refusal lands while the error is still speaking: never on top of it; it waits, and is heard when the error has finished
  await $.turn.start(loose({ text: 'go', turnId: 't1' })); await $.turn.complete(refusal('t1'))
  expect(assets().slice(1)).toEqual(['sounds/error.wav'])
  await clock.advance(2000)
  expect(assets().slice(1)).toEqual(['sounds/error.wav', 'sounds/refusal.wav'])
  // two more while that one plays: one slot, the more important wins (a tie goes to the newest); the other is let go
  await $.turn.start(loose({ text: 'go', turnId: 't2' })); await $.turn.complete(refusal('t2'))
  await fail('e2')
  await clock.advance(3200)
  expect(assets().slice(1)).toEqual(['sounds/error.wav', 'sounds/refusal.wav', 'sounds/error.wav'])
  await clock.advance(2100)
  // a cue that has waited too long is dropped: it would point at something already over
  await fail('e3')                                                  // speaks now (1.85 s)
  await $.turn.start(loose({ text: 'go', turnId: 't3' })); await $.turn.complete(refusal('t3')) // waits behind it
  expect(assets().slice(4)).toEqual(['sounds/error.wav'])
  await clock.advance(2000)
  expect(assets().slice(4)).toEqual(['sounds/error.wav', 'sounds/refusal.wav'])
  await clock.advance(3100)
  await $.turn.start(loose({ text: 'go', turnId: 't4' })); await $.turn.complete(answer('t4', 8)) // 8 s: not long enough for soft
  expect(assets().slice(6)).toEqual([])
  await $.turn.start(loose({ text: 'go', turnId: 't5' })); await $.turn.complete(answer('t5', 45)) // 45 s: worth a chime
  expect(assets().slice(6)).toEqual(['sounds/bloom.wav'])

  // full: gain 1, and the quick answer now chimes too
  await clock.advance(3000)
  await cmd($, 'sound full')
  expect(played[played.length - 1]!.gain).toBe(1)
  await clock.advance(3000)
  await $.turn.start(loose({ text: 'go', turnId: 't6' })); await $.turn.complete(answer('t6', 8))
  expect(assets().filter((a) => a === 'sounds/bloom.wav').length).toBe(4)
  // the level preview keeps the rule too: set while a cue speaks, it waits its turn instead of playing over it
  await clock.advance(3000)
  await fail('e4')
  const n = played.length
  await cmd($, 'sound full')
  expect(assets().slice(n)).toEqual([])
  await clock.advance(2000)
  expect(assets().slice(n)).toEqual(['sounds/bloom.wav'])
  await cmd($, 'sound off')
  await reset($)
})

test('mend is heard only in full: a tool that works where the last call failed', async ($, on) => {
  const clock = engine(on)
  const played: string[] = []
  on('audio.play', async (_$, e) => { played.push(String((e.clip as { asset?: string }).asset)); return loose({ value: undefined }) })
  let fail = true
  on('tool.call', async () => (fail ? loose({ result: 'boom', isError: true, text: 'boom' }) : loose({ result: 'ok' })))
  await cmd($, 'sound soft'); played.length = 0
  await $.turn.start(loose({ text: 'go', turnId: 'm1' }))
  await $.tool.call(loose<never>({ tool: 'Bash', command: 'npm test', tool_use_id: 'x1' }))
  fail = false; await clock.advance(2000)
  await $.tool.call(loose<never>({ tool: 'Bash', command: 'npm test', tool_use_id: 'x2' }))
  expect(played).not.toContain('sounds/mend.wav') // soft stays quiet for it
  await cmd($, 'sound full'); played.length = 0
  fail = true; await clock.advance(2000)
  await $.tool.call(loose<never>({ tool: 'Bash', command: 'npm test', tool_use_id: 'x3' }))
  fail = false; await clock.advance(2000)
  await $.tool.call(loose<never>({ tool: 'Bash', command: 'npm test', tool_use_id: 'x4' }))
  expect(played).toContain('sounds/mend.wav')
  await $.turn.complete(answer('m1', 1))
  await reset($)
})

test('an interrupt that cuts a call short is not drawn as that call failing', async ($, on) => {
  engine(on)
  on('tool.call', async () => { throw new Error('aborted') })
  await $.turn.start(loose({ text: 'go', turnId: 'i1' }))
  await $.tool.call(loose<never>({ tool: 'Edit', tool_use_id: 'e1' })).catch(() => undefined)
  const state = (await cmd($, 'state')).text
  expect(state).toMatch(/tool\.end/)
  expect(state).not.toMatch(/tool\.end[^\n]*✕/)
  await $.turn.complete(loose<never>({ reason: 'aborted', answer: '', durationMs: 900, isAborted: true, turnId: 'i1' }))
  expect((await cmd($, 'state')).text).toMatch(/^Spark · interrupted/)
})

test('a call you deny is not drawn as that call failing, and the next clean call is not a mend', async ($, on) => {
  const clock = engine(on)
  const played: string[] = []
  on('audio.play', async (_$, e) => { played.push(String((e.clip as { asset?: string }).asset)); return loose({ value: undefined }) })
  let deny = true
  on('tool.call', async () => (deny ? loose({ deny: 'you said no' }) : loose({ result: 'ok' })))
  await cmd($, 'sound full'); played.length = 0
  await $.turn.start(loose({ text: 'go', turnId: 'd1' }))
  await $.tool.call(loose<never>({ tool: 'Bash', command: 'rm -rf build', tool_use_id: 'd1' })).catch(() => undefined)
  const state = (await cmd($, 'state')).text
  expect(state).toMatch(/tool\.end denied/)
  expect(state).not.toMatch(/tool\.end[^\n]*✕/)
  deny = false; await clock.advance(2000)
  await $.tool.call(loose<never>({ tool: 'Bash', command: 'ls', tool_use_id: 'd2' }))
  expect(played).not.toContain('sounds/mend.wav') // nothing was broken, so nothing was mended
  await $.turn.complete(answer('d1', 1))
  await reset($)
})

test('the model declining reads as declined, not as an error; /clear wakes Spark again', async ($, on) => {
  engine(on)
  on('session.end', async () => ({ sessionId: 's' }))
  await $.turn.start(loose({ text: 'go', turnId: 'r1' }))
  await $.turn.complete(refusal('r1'))
  const text = (await cmd($, 'state')).text
  expect(text).toMatch(/^Spark · declined/)
  expect(text).toMatch(/turn\.end refusal/)
  await $.session.end(loose({ reason: 'clear', sessionId: 's', resume: {} }))
  expect((await cmd($, 'state')).text).toMatch(/^Spark · waking/)
})

test('the status line carries the glyph and the same truthful words, and clears when switched off', async ($, on) => {
  engine(on)
  const lines: Array<string | undefined> = []
  on('ui.status', async (_$, e) => { lines.push(e.text); return loose<never>({ value: undefined }) })
  expect((await cmd($, 'status on')).text).toBe('status line: on')
  expect(lines[lines.length - 1]).toMatch(/^[^\sA-Za-z]\s(idle|waking)/)
  await $.turn.start(loose({ text: 'go', turnId: 's1' }))
  expect((await cmd($, 'status on')).text).toBe('status line: on') // 'on' is explicit, not a toggle
  expect(lines[lines.length - 1]).toMatch(/waiting for the model$/)
  expect((await cmd($, 'status off')).text).toBe('status line: off')
  expect(lines[lines.length - 1]).toBeUndefined()
  await $.turn.complete(answer('s1', 1))
})

test('the replay is its own labelled Spark: it plays in the pane, never moves the live one, and stops on request', async ($, on) => {
  engine(on)
  on('ui.open', async () => loose({ value: { isPlaced: true } }))
  const before = (await say($, 'state')).split('\n')[0]
  const started = (await cmd($, 'replay')).text
  expect(started).toMatch(/replay on: a scripted tour, labelled as a replay/)
  const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...PANE })
  expect(await term.find({ type: 'Text', text: /▶ replay \(not live\)/ })).toBeDefined()
  await term.unmount()
  expect((await say($, 'state')).split('\n')[0]).toBe(before) // the live Spark did not move
  expect((await cmd($, 'replay')).text).toMatch(/replay off/)
  const live = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...PANE })
  expect(await live.find({ type: 'Text', text: /replay/ })).toBeUndefined()
  await live.unmount()
  await cmd($, 'help') // (state left as found)
})

test('theme auto follows the host theme (and a host that says plain auto, or says nothing, is dark); a pinned theme ignores it', async ($, on) => {
  engine(on)
  let hostSays = 'light-daltonized'
  on('config.list', async () => loose({ value: [{ key: 'verbose', value: false }, { key: 'theme', value: hostSays }] }))
  on('config.set', async (_$, e) => loose({ value: String(e.value) }))
  on('command.register', async () => loose({ value: undefined }))
  on('session.start', async () => loose({ cwd: '/' }))
  await cmd($, 'calm on')
  const lightish = async () => { const ui = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...PANE }); const c = (await ui.find({ type: 'Raster', key: 'spark' }))?.props.cells; await ui.unmount(); return lightGround(c) }
  await $.session.start(loose({ cwd: '/', surface: 'terminal', isInteractive: true }))
  expect(await lightish()).toBe(true)
  expect(await settings($)).toMatch(/theme auto→light/)
  hostSays = 'auto'
  await $.config.set(loose({ key: 'theme', value: 'auto' }))
  expect(await lightish()).toBe(false)
  hostSays = 'dark-ansi'; await $.config.set(loose({ key: 'theme', value: 'dark-ansi' }))
  await cmd($, 'theme light') // pinned: the host's theme no longer matters
  expect(await lightish()).toBe(true)
  await cmd($, 'theme auto')
  await reset($)
})


test('murmur: off by default; on, a hum while it really thinks and bubbles while it really writes, each phrase handing over only while the stream goes on', async ($, on) => {
  const clock = engine(on)
  const played: string[] = []
  on('audio.play', async (_$, e) => { played.push(String((e.clip as { asset?: string }).asset)); return loose({ value: undefined }) })
  let chunks: Array<{ kind: 'thinking' | 'text'; text: string }> = []
  on('turn.step', async function* (_$, e) {
    for (const c of chunks) yield loose<never>({ ...c, index: 0 })
    return loose({ turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null })
  })
  const step = async (kind: 'thinking' | 'text', n = 4, agentId?: string) => {
    chunks = Array.from({ length: n }, () => ({ kind, text: 'word ' }))
    for await (const _ of $.turn.step(loose({ turnId: 't', index: 0, model: 'm', messageCount: 1, ...(agentId ? { agentId } : {}) }))) { /* read it through */ }
  }
  const murmurs = () => played.filter((a) => /sounds\/(think|write)-\d\.wav/.test(a))

  // off: real streaming, no murmur
  await step('thinking'); await step('text')
  expect(murmurs()).toEqual([])

  expect((await cmd($, 'murmur on')).text).toMatch(/^murmur: on/)
  expect(await settings($)).toMatch(/murmur on · link off$/)
  // thinking starts a hum phrase; more thinking inside the phrase starts nothing new
  await step('thinking')
  expect(murmurs()).toHaveLength(1)
  expect(murmurs()[0]).toMatch(/^sounds\/think-\d\.wav$/)
  await clock.advance(1000); await step('thinking')
  expect(murmurs()).toHaveLength(1)
  // still thinking as the phrase begins to fade: the next phrase takes over, a different one
  await clock.advance(800); await step('thinking')
  expect(murmurs()).toHaveLength(2)
  expect(murmurs()[1]).toMatch(/^sounds\/think-\d\.wav$/)
  expect(murmurs()[1]).not.toBe(murmurs()[0])
  // the answer starts streaming: the bubbles begin at once, the hum fades out on its own
  await step('text')
  expect(murmurs()).toHaveLength(3)
  expect(murmurs()[2]).toMatch(/^sounds\/write-\d\.wav$/)
  // no stream, however long: nothing starts
  await clock.advance(10000)
  expect(murmurs()).toHaveLength(3)
  // a subagent's stream is its own lane's, never Spark's murmur
  await step('thinking', 4, 'sub-1')
  expect(murmurs()).toHaveLength(3)
  // and the cues are untouched by it: sound is still off, so no cue has played
  expect(played.filter((a) => !/think|write/.test(a))).toEqual([])

  expect((await cmd($, 'murmur off')).text).toBe('murmur: off')
  await step('thinking')
  expect(murmurs()).toHaveLength(3)
  await reset($)
})


test('/spark says its name when it opens, if sound is on; never with sound off', async ($, on) => {
  const clock = engine(on)
  const played: string[] = []
  on('audio.play', async (_$, e) => { played.push(String((e.clip as { asset?: string }).asset)); return loose({ value: undefined }) })
  on('ui.open', async () => loose({ value: { isPlaced: true } }))
  on('ui.close', async () => loose({ value: undefined }))
  await cmd($, '') // sound off (the default): opens quietly
  expect(played).toEqual([])
  await cmd($, '') // closes
  await cmd($, 'sound soft')
  played.length = 0
  await clock.advance(3000) // the level preview has finished
  expect((await cmd($, '')).text).toMatch(/pane open/)
  expect(played).toEqual(['sounds/name.wav'])
  await cmd($, '') // closing says nothing
  expect(played).toEqual(['sounds/name.wav'])
  await clock.advance(3000)
  await cmd($, '') // opening again in the same session: it has already said its name
  await cmd($, '')
  expect(played).toEqual(['sounds/name.wav'])
  await reset($)
})


// ------------------------------------------------------------------------------------------------ focus
const FOCUS_PANE = (bodyColumns: number, bodyRows: number, placement: 'dock' | 'inline', columns = placement === 'dock' ? 20 : bodyColumns + 2, rows = bodyRows + 6) => // viewport = the conversation's (beside a dock, the strip)
  ({ ...PANE, props: { ...PANE.props, placement, bodyColumns, scroll: { offset: 0, bodyRows } }, viewport: { columns, rows, isFullscreen: true } }) as never
function focusEngine($: Engine, on: On) {
  const clock = engine(on)
  const opens: Array<Record<string, unknown>> = []
  const closes: string[] = []
  on('ui.open', async (_$, e) => { opens.push({ ...(e as object) }); return loose({ value: { isPlaced: true } }) })
  on('ui.close', async (_$, e) => { closes.push(String((e as { id: string }).id)); return loose({ value: undefined }) })
  on('ui.render', { component: 'AssistantMessage' }, async ($, e) => $.ui.resolve(e).Text({ children: ['reply row'] }))
  on('ui.render', { component: 'UserMessage' }, async ($, e) => $.ui.resolve(e).Text({ children: ['prompt row'] }))
  on('ui.render', { component: 'PromptHint' }, async ($, e) => $.ui.resolve(e).Text({ children: ['hint'] }))
  on('prompt.submit', async (_$, e) => loose({ text: (e as { text: string }).text }))
  let chunks: Array<{ kind: 'text'; text: string }> = []
  on('turn.step', async function* (_$, e) {
    for (const c of chunks) yield loose<never>({ ...c, index: 0 })
    return loose({ turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null })
  })
  const reply = async (text: string, turnId = 't') => { chunks = [{ kind: 'text', text }]; for await (const _ of $.turn.step(loose({ turnId, index: 0, model: 'm', messageCount: 1 }))) { /* through */ } }
  const focus = (args: string, columns = 210) => $.command.run(loose({ command: 'spark', args, origin: { kind: 'person' }, presentation: { isFullscreen: true, columns } }))
  const draw = async (component: 'UserMessage' | 'AssistantMessage' | 'PromptHint', text: string) => {
    const ui = await $.ui.mount(loose<never>({ plugin: 'cyclops-spark', surface: 'terminal', component, props: { text, origin: { kind: 'person' }, isFirstOfReply: true }, viewport: { columns: 210, rows: 56 } }))
    const t = await ui.find({ type: 'Text' }); await ui.unmount(); return t?.text ?? ''
  }
  const art = async (props: never) => {
    const ui = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...(props as object) } as never)
    const r = await ui.find({ type: 'Raster' }), t = await ui.find({ type: 'Text' }); await ui.unmount()
    return { raster: r ? { columns: r.props.columns as number, rows: r.props.rows as number } : null, text: t?.text ?? '' }
  }
  return { clock, opens, closes, reply, focus, draw, art }
}

test('focus: Spark owns the screen, with only your current exchange left beside it; leaving restores exactly the view before', async ($, on) => {
  const { opens, closes, reply, focus, draw, art } = focusEngine($, on)
  await cmd($, 'status on') // the view before focus: pane closed, band off, status entry on
  const ask = async (text: string, turnId: string, answer: string) => { await $.prompt.submit(loose({ text })); await $.turn.start(loose({ text, turnId })); await reply(answer, turnId) }
  await ask('an older prompt', 't1', 'an older answer')
  await ask('how is the build?', 't2', 'The build is green.')
  expect(await draw('UserMessage', 'an older prompt')).toBe('prompt row') // before focus, everything shows

  expect((await focus('focus')).text).toMatch(/^focus: Spark has the screen/)
  expect(opens.at(-1)).toMatchObject({ id: 'cyclops-spark', columns: 210, focus: true, closeOnEscape: true, holdToasts: true })
  // the whole body is Spark's, no label (it is not a replay), composed wide rather than a square in the middle
  expect((await art(FOCUS_PANE(200, 52, 'dock'))).raster).toEqual({ columns: 200, rows: 52 })
  // the current exchange stays; the rest of the conversation, the hint and Spark's status entry step aside
  expect(await draw('UserMessage', 'how is the build?')).toBe('prompt row')
  expect(await draw('AssistantMessage', 'The build is green.')).toBe('reply row')
  expect(await draw('UserMessage', 'an older prompt')).toBe('')
  expect(await draw('AssistantMessage', 'an older answer')).toBe('')
  expect(await draw('PromptHint', '')).toBe('')
  expect(await settings($)).toMatch(/status off/)

  expect((await focus('focus')).text).toBe('focus off: back to your view')
  expect(closes).toContain('cyclops-spark') // the pane was closed before focus, so it closes again
  expect(await settings($)).toMatch(/status on/)
  expect(await draw('UserMessage', 'an older prompt')).toBe('prompt row')
  expect(await draw('PromptHint', '')).toBe('hint')
  await cmd($, 'status off')
  await reset($)
})

test('focus survives any resize: every size recomputes and recomposes, tiny rooms fall back to the glyph, and no resize invents activity', async ($, on) => {
  const { clock, opens, focus, art } = focusEngine($, on)
  await focus('focus')
  const stateBefore = (await say($, 'state')).split('\n')
  const sizes: Array<[number, number, 'dock' | 'inline', number, number]> = [ // [body cols, body rows, seat, conversation cols, screen rows]
    [200, 52, 'dock', 24, 60],    // full size
    [90, 52, 'dock', 20, 60],     // narrow dock
    [100, 3, 'inline', 100, 40],  // the narrow-terminal case that used to vanish: seated above the prompt, almost no room
    [100, 30, 'inline', 100, 40], // given room again
    [60, 40, 'dock', 20, 46],     // tall and thin: recomposed upward, not cropped
    [320, 90, 'dock', 20, 96],    // maximised
    [150, 44, 'dock', 22, 50],    // unmaximised
  ]
  for (let round = 0; round < 3; round++) { // shrink, expand, and rapid consecutive resizes
    for (const [w, h, place, vw, vh] of sizes) {
      const { raster, text } = await art(FOCUS_PANE(w, h, place, vw, vh))
      if (h < 4) { expect(raster).toBeNull(); expect(text).toMatch(/Spark · idle/) } // too small to draw: the glyph and the truth
      else expect(raster).toEqual({ columns: Math.min(320, w), rows: Math.min(120, h) })
    }
  }
  await clock.advance(400) // let the resizes above settle
  // a narrow terminal seats the pane above the prompt with little room: once the resize settles, focus asks once per size
  const asks = opens.length
  await art(FOCUS_PANE(100, 3, 'inline', 101, 41)); await clock.advance(400)
  expect(opens.length).toBe(asks + 1)
  expect(opens.at(-1)).toMatchObject({ rows: 41, focus: true })
  await art(FOCUS_PANE(100, 3, 'inline', 101, 41)); await clock.advance(400)
  expect(opens.length).toBe(asks + 1) // never a loop
  // a terminal made wider leaves the dock at its old width: focus reseats its own pane for the new room, and stays focus
  await art(FOCUS_PANE(120, 50, 'dock', 139, 60)); await clock.advance(400) // a 260-column terminal: a 139-column strip beside a 120-column dock
  expect(opens.length).toBe(asks + 2)
  expect(opens.at(-1)).toMatchObject({ columns: 260, focus: true })
  expect(await settings($)).toMatch(/status off · murmur off · link off$/) // still focus: nothing was restored
  // resizing is presentation: the state line and the recent events are exactly what they were
  expect((await say($, 'state')).split('\n')).toEqual(stateBefore)
  await focus('focus')
  await reset($)
})

test('focus during real activity keeps the activity, and leaving returns to the exact previous view (the pane, at its usual size)', async ($, on) => {
  const { opens, focus, art } = focusEngine($, on)
  await cmd($, '') // the view before: the pane open at its usual size, and the band on
  await cmd($, 'band')
  await $.turn.start(loose({ text: 'go', turnId: 'live' }))
  await $.tool.check(loose({ tool: 'Bash', input: {}, tool_use_id: 'nope' })).catch(() => undefined)
  const busy = (await say($, 'state')).split('\n')[0]
  await focus('focus')
  expect((await art(FOCUS_PANE(150, 40, 'dock'))).raster).toEqual({ columns: 150, rows: 40 })
  expect((await say($, 'state')).split('\n')[0]).toBe(busy) // entering focus changed nothing about what Spark is doing
  expect((await cmd($, '')).text).toBe('focus off: back to your view') // a bare /spark leaves focus too
  expect(opens.at(-1)).toMatchObject({ id: 'cyclops-spark', columns: 64, rows: 30 }) // back to the usual pane
  expect(opens.at(-1)).not.toHaveProperty('focus')
  expect((await say($, 'state')).split('\n')[1]).toMatch(/status off/)
  const band = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...BAND })
  expect(await band.find({ type: 'Raster' })).toBeTruthy() // the band is back as it was
  await band.unmount()
  // and focus can be entered again
  expect((await focus('focus')).text).toMatch(/^focus: Spark has the screen/)
  await focus('focus'); await cmd($, 'band'); await cmd($, '')
  await reset($)
})

// ------------------------------------------------------------------------------------------------ nothing written
function feedEngine(on: On) {
  const clock = engine(on)
  const writes: Array<{ path: string; text: string }> = []
  on('fs.write', async (_$, e) => { writes.push({ path: String((e as { path: string }).path), text: String((e as { text: string }).text) }); return loose({ value: undefined }) })
  on('config.list', async () => loose({ value: [] }))
  on('command.register', async () => loose({ value: undefined }))
  on('session.start', async () => loose({ cwd: '/' }))
  on('session.end', async () => loose({ sessionId: 's' }))
  return { clock, writes }
}

test('Spark writes nothing anywhere, whatever the environment says', async ($, on) => {
  const { clock, writes } = feedEngine(on)
  mock.env(on, { HOME: '/home/t', XDG_STATE_HOME: '/home/t/.state', CYCLOPS_SESSION_ID: 'pane-7' })
  await $.session.start(loose({ cwd: '/', surface: 'terminal', isInteractive: true }))
  await $.turn.start(loose({ text: 'go', turnId: 'o1' })); await $.turn.complete(answer('o1', 2))
  await clock.advance(6000)
  expect(writes).toEqual([])
})

test('band at start: with the setting on, Spark is in the band from the first draw, no command needed', { options: { band: true } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Raster' })).toBeTruthy()
  await ui.unmount()
  await cmd($, 'band') // and the command still turns it off for the session
  const off = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...BAND })
  expect(await off.find({ type: 'Raster' })).toBeFalsy()
  await off.unmount()
})

test('/copy hands the reply over: Spark says copied, the cue is heard in full only, and nothing is held out after', async ($, on) => {
  const clock = engine(on)
  const played: string[] = []
  on('audio.play', async (_$, e) => { played.push(String((e.clip as { asset?: string }).asset)); return loose({ value: undefined }) })
  let copyAnswer = 'Copied to clipboard (12 characters)'
  on('command.run', { command: 'copy' }, async () => ({ text: copyAnswer }))
  const copy = () => $.command.run(loose({ command: 'copy', args: '', origin: { kind: 'person' }, presentation: {} }))
  await cmd($, 'sound soft')
  await $.turn.start(loose({ text: 'go', turnId: 'c1' }))
  await $.turn.complete(answer('c1', 1))
  expect((await cmd($, 'state')).text).toMatch(/^Spark · done/)
  played.length = 0
  expect((await copy()).text).toBe('Copied to clipboard (12 characters)') // the host's own /copy still runs, untouched
  expect((await cmd($, 'state')).text).toMatch(/^Spark · copied/)
  expect((await cmd($, 'state')).text).toMatch(/reply\.copied copy/)
  expect(played).toEqual([]) // soft: only what is worth hearing from another room
  await cmd($, 'sound full')
  await $.turn.start(loose({ text: 'again', turnId: 'c2' }))
  await $.turn.complete(answer('c2', 1))
  await clock.advance(2000) // the full preview waits behind the soft one (one at a time), then plays: let both finish
  await clock.advance(3000)
  await clock.advance(3000)
  played.length = 0
  await copy()
  expect(played.some((a) => a.endsWith('copied.wav'))).toBe(true)
  // a /copy that did not copy (nothing to copy, a picker left open) is not a copy
  await $.turn.start(loose({ text: 'again', turnId: 'c3' }))
  await $.turn.complete(answer('c3', 1))
  copyAnswer = 'Nothing to copy'
  await copy()
  expect((await cmd($, 'state')).text).toMatch(/^Spark · (done|reply ready)/)
})

test('a side question: /spark ask answers from a fork of this session, mid-turn, and nothing of it is written anywhere', async ($, on) => {
  const { clock, writes } = feedEngine(on)
  mock.env(on, { HOME: '/home/t' })
  const forks: string[] = []
  on('model.fork', async (_$, e) => { forks.push(String((e as { prompt: string }).prompt)); return loose({ value: { isAnswered: true, text: ' The cache lives in core.js. ', usage: {} } }) })
  await $.session.start(loose({ cwd: '/', surface: 'terminal', isInteractive: true }))
  await $.turn.start(loose({ text: 'go', turnId: 'q1' })) // the work is still going
  const res = await cmd($, 'ask where is the colour cache?')
  expect(res.text).toBe('Spark · side answer\nThe cache lives in core.js.')
  expect(forks).toHaveLength(1)
  expect(forks[0]).toMatch(/side question/)
  expect(forks[0]).toMatch(/where is the colour cache\?$/) // asked as typed (the command word only taken off)
  expect((await cmd($, 'ask')).text).toMatch(/^ask what\?/)
  await clock.advance(1500)
  expect((await cmd($, 'state')).text).toMatch(/side\.answer/) // the events say only that it happened
  expect(writes).toEqual([]) // never the question, never the answer, nowhere
})

test('an offer above the prompt ("You should know") is Spark speaking: it stays in focus as Spark\'s bubble, and joins Spark in the band', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  let offer = true
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const t = offer
      ? Box({ flexDirection: 'column', children: [Text({ children: ['You should know · the cache now costs more'] }), Button({ label: 'Learn more', hotkey: '1', onPress: () => undefined })] })
      : Text({ children: ['a quiet line'] })
    return t
  })
  on('ui.open', async () => loose({ value: { isPlaced: true } }))
  on('ui.close', async () => loose({ value: undefined }))
  const focus = (args: string) => $.command.run(loose({ command: 'spark', args, origin: { kind: 'person' }, presentation: { isFullscreen: true, columns: 200 } }))
  const look = async () => {
    const ui = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...BAND })
    const out = { offer: Boolean(await ui.find({ type: 'Text', text: /You should know/ })), button: Boolean(await ui.find({ type: 'Button' })),
      joined: Boolean(await ui.find({ type: 'Text', text: /╶/ })), quiet: Boolean(await ui.find({ type: 'Text', text: /a quiet line/ })), spark: Boolean(await ui.find({ type: 'Raster' })) }
    await ui.unmount(); return out
  }
  // ordinary view: the offer as it is, untouched
  expect(await look()).toMatchObject({ offer: true, button: true, joined: false })
  // focus: the offer stays (it asks you something), spoken by Spark; a quiet line steps aside
  await focus('focus')
  expect(await look()).toMatchObject({ offer: true, button: true, joined: true })
  offer = false
  expect(await look()).toMatchObject({ quiet: false, offer: false })
  await focus('focus')
  // Spark in the band: the offer is its bubble, joined to it
  offer = true
  await cmd($, 'band')
  expect(await look()).toMatchObject({ spark: true, offer: true, button: true, joined: true })
  offer = false
  expect(await look()).toMatchObject({ spark: true, quiet: true, joined: false })
})


// ------------------------------------------------------------------------------------------------ Cyclops Link
// The helper is simulated at the process boundary: what Spark starts, what she sends it, and what she draws from it.
const LINK_VIEW = {
  peers: [
    { presence: 'keeper', instance: 'aaaaaaaaaaaaaaaa', state: 'tool', tools: 1, branches: 0, bearing: 0 },
    { presence: 'prism', instance: 'bbbbbbbbbbbbbbbb', state: 'working', tools: 0, branches: 0, bearing: 60 },
  ],
  threads: [{ from: 'keeper', to: 'spark' }],
}
function fakeHelper(on: On, opts: { fail?: boolean } = {}) {
  const seen = { spawns: [] as Array<{ argv: readonly string[]; env?: Record<string, string> }>, ended: 0, sendView: (_v: unknown) => {}, nudge: () => {} }
  on('process.spawn', async function* (_$, e) {
    seen.spawns.push({ argv: e.argv, env: e.env })
    if (opts.fail) { yield { stream: 'stderr' as const, text: 'env: python3: No such file or directory\n' }; seen.ended++; return loose({ value: { code: 127, signal: null } }) }
    const queue: string[] = [JSON.stringify({ ready: { facts: '/home/t/.local/state/cyclops-spark/0123456789abcdef.facts' } }) + '\n']
    let wake = () => {}
    seen.sendView = (v) => { queue.push(JSON.stringify({ view: v }) + '\n'); wake() }
    seen.nudge = () => wake() // the real child is killed at once; this fake ends at its next line
    try {
      for (;;) {
        while (queue.length) yield { stream: 'stdout' as const, text: queue.shift()! }
        await new Promise<void>((r) => { wake = r })
        yield { stream: 'stdout' as const, text: '\n' } // a quiet line: where the loop that owns the child can end it
      }
    } finally { seen.ended++ }
    return loose({ value: { code: 0, signal: null } })
  })
  on('session.id', async () => loose({ value: 'session-secret-7f3a' }))
  on('session.root', async () => loose({ value: '/home/alex/clients/acme-merger' }))
  return seen
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }

test('Cyclops Link is off by default: no helper is started and nothing is written', async ($, on) => {
  const { clock, writes } = feedEngine(on)
  const seen = fakeHelper(on)
  await $.session.start(loose({ cwd: '/', surface: 'terminal', isInteractive: true }))
  await clock.advance(2000)
  expect(seen.spawns).toHaveLength(0)
  expect(writes).toEqual([])
  expect(await say($, 'link')).toMatch(/^link off/)
})

test('/spark link on: the helper gets only the session and folder; Spark sends it only her coarse facts', async ($, on) => {
  const { clock, writes } = feedEngine(on)
  const seen = fakeHelper(on)
  let release = () => {}
  on('tool.call', () => new Promise((resolve) => { release = () => resolve(loose({ result: 'ok' })) }))
  await $.session.start(loose({ cwd: '/', surface: 'terminal', isInteractive: true }))
  expect(await say($, 'link on')).toMatch(/^link on/)
  await settle()
  expect(seen.spawns).toHaveLength(1)
  expect(seen.spawns[0]!.argv[0]).toBe('python3')
  expect(seen.spawns[0]!.argv[1]).toMatch(/\/link\/spark_link\.py$/)
  expect(seen.spawns[0]!.env).toEqual({ SPARK_LINK_SESSION: 'session-secret-7f3a', SPARK_LINK_FOLDER: '/home/alex/clients/acme-merger' })
  await $.turn.start(loose({ text: 'deploy with key sk-live-4f9a and password hunter2', turnId: 'L1' }))
  const call = $.tool.call(loose<never>({ tool: 'Bash', command: 'codex exec "rotate AKIAIOSFODNN7EXAMPLE"', tool_use_id: 'call_Zx81' }))
  await settle(); await clock.advance(600); await settle()
  const facts = writes.filter((w) => w.path.endsWith('.facts')).map((w) => JSON.parse(w.text))
  expect(facts.at(-1)).toEqual({ state: 'tool', tools: 1, branches: 0, reaching: ['keeper'] })
  for (const w of writes) {
    expect(w.path).toBe('/home/t/.local/state/cyclops-spark/0123456789abcdef.facts')
    for (const bad of ['hunter2', 'sk-live', 'AKIA', 'codex exec', 'rotate', 'call_Zx81', 'acme', 'session-secret', 'Bash']) expect(w.text).not.toContain(bad)
  }
  release(); await call
  await $.turn.complete(answer('L1', 1))
  await clock.advance(600); await settle()
  expect(JSON.parse(writes.at(-1)!.text)).toEqual({ state: 'stopped', tools: 0, branches: 0, reaching: [] })
  expect(await say($, 'link off')).toMatch(/^link off/)
  for (let i = 0; i < 5; i++) { seen.nudge(); await settle(); await clock.advance(60) }
  expect(seen.ended).toBe(1)
  await reset($)
})

test('linked: Keeper and Prism appear at their seats in their own looks, named under Spark; gone when Link goes off', async ($, on) => {
  const { clock } = feedEngine(on)
  const seen = fakeHelper(on)
  await $.session.start(loose({ cwd: '/', surface: 'terminal', isInteractive: true }))
  await say($, 'link on'); await settle()
  seen.sendView(LINK_VIEW); await settle()
  const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...PANE })
  await clock.advance(200); await settle()
  const raster = await term.find({ type: 'Raster', key: 'spark' })
  const w = words(raster?.props.cells)
  const cols = Number(raster?.props.columns)
  const chars = (x0: number, x1: number) => { let s = ''; for (let i = 0; i < w.length; i += 3) { const x = (i / 3) % cols; if (x >= x0 && x < x1) s += String.fromCodePoint(w[i]!) } return s }
  const right = chars(cols - 16, cols)
  expect([...right].some((c) => c.codePointAt(0)! > 0x2800 && c.codePointAt(0)! <= 0x28ff)).toBe(true) // Keeper's own woven braille
  expect(right).toContain('⟨')                                                                         // Prism's own faceted core
  expect(right).toContain('keeper · tool')
  expect(await term.find({ type: 'Text', text: /linked · Keeper tool · Prism working/ })).toBeDefined()
  await term.unmount()
  await say($, 'link off'); await settle()
  const after = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...PANE })
  expect(await after.find({ type: 'Text', text: /linked/ })).toBeUndefined()
  expect(chars.call(null, 0, 0)).toBe('')
  await after.unmount()
  await reset($)
})

test('linked but python3 cannot start: Spark stays quietly unlinked and says why', async ($, on) => {
  const { clock, writes } = feedEngine(on)
  fakeHelper(on, { fail: true })
  const text = await say($, 'link on'); await settle(); await clock.advance(200); await settle()
  expect(await say($, 'link status')).toMatch(/^link unavailable/)
  expect(writes).toEqual([])
  expect(text).toMatch(/link/)
  await reset($)
})

test('a Gemini or agy call is Spark reaching Prism; a plain shell call reaches no one', async () => {
  for (const [command, reach] of [['agy --prism', ['prism']], ['gemini -p "x"', ['prism']], ['ls -la', []]] as const) {
    const p = createPresence('spark')
    p.apply({ t: 0, type: 'turn.start' })
    p.apply({ t: 0.1, type: 'tool.start', id: 'a', tool: 'Bash', input: { command } })
    expect(linkFacts(p.sample(0.5)).reaching).toEqual([...reach])
    expect(linkFacts(p.sample(0.5)).state).toBe('tool')
  }
})
