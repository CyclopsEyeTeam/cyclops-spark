import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { parsePainting, paintingScene, painterFacts, painterRequest, newTurnFacts, recordTool, shapeFor, MAX_MARKS } from '../hooks/painter.js'
import { wrapRows } from '../hooks/layout.js'

const loose = <T>(v: unknown) => v as T
const cmd = ($: Engine, args: string) => $.command.run(loose({ command: 'spark', args, origin: { kind: 'person' }, presentation: {} }))
const say = async ($: Engine, args: string) => String((await cmd($, args)).text ?? '')
const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve() }

const PAINTING = JSON.stringify({
  title: 'a long climb, then light',
  marks: [
    { k: 'glow', x: 0.5, y: 0.6, r: 0.3, c: '#d66690', a: 0.5 },
    { k: 'line', pts: [[0.05, 0.9], [0.3, 0.5], [0.6, 0.4], [0.95, 0.1]], w: 0.03, c: '#ffbc75', c2: '#ffe6d6', a: 0.9 },
    { k: 'ring', x: 0.8, y: 0.3, r: 0.12, w: 0.02, c: '#9ef2b8', a: 0.8 },
    { k: 'dot', x: 0.95, y: 0.1, r: 0.05, c: '#ffffff', a: 1 },
  ],
})

type Ask = { model: string; prompt: string; system: string }
const USAGE = { input_tokens: 900, output_tokens: 700, cache_read_input_tokens: 0, cache_creation_input_tokens: 500 }
function engine(on: On, reply: (x: Ask) => unknown = () => ({ isAnswered: true, text: PAINTING, usage: USAGE })) {
  mock.store(on)
  const clock = mock.clock(on)
  const asks: Ask[] = []
  const writes: string[] = []
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  on('model.complete', async (_$, e) => { const x = e as unknown as Ask; const ask = { model: x.model, prompt: String(x.prompt), system: String(x.system ?? '') }; asks.push(ask); return loose({ value: reply(ask) }) })
  on('fs.write', async (_$, e) => { writes.push(String((e as { path: string }).path)); return loose({ value: undefined }) })
  on('ui.open', async () => loose({ value: { isPlaced: true } }))
  on('ui.close', async () => loose({ value: undefined }))
  // the first Bash call of a turn fails, the next one works (a mend)
  on('tool.call', async (_$, e) => { const x = e as { tool: string; tool_use_id: string }; return loose(x.tool === 'Bash' && x.tool_use_id.endsWith('b1') ? { result: 'boom', isError: true } : { result: 'ok' }) })
  return { clock, asks, writes }
}

const pane = (bodyColumns: number, bodyRows: number) => ({
  component: 'Pane', requestId: 'cyclops-spark',
  props: { title: 'Spark', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
  viewport: { columns: 160, rows: 60 },
}) as const

// one real turn: a read, a shell call that fails, the same shell call working (a mend), then the answer
async function turn($: Engine, id: string, secs: number, answerText = 'The tempo map now lines up with the beat grid.') {
  await $.turn.start(loose({ text: 'please fix the secret-project tempo map', turnId: id }))
  await $.tool.call(loose({ tool: 'Read', file_path: '/home/t/secret-project/notes.md', tool_use_id: id + 'r' }))
  await $.tool.call(loose({ tool: 'Bash', command: 'npm test --secret-flag', tool_use_id: id + 'b1' }))
  await $.tool.call(loose({ tool: 'Bash', command: 'npm test --secret-flag', tool_use_id: id + 'b2' }))
  await $.turn.complete(loose({ reason: 'answer', answer: answerText, durationMs: secs * 1000, isAborted: false, turnId: id }))
  await settle()
}

test('the painter is off by default: no model call, nothing drawn below Spark', async ($, on) => {
  const { asks } = engine(on)
  expect(await say($, 'paint off')).toBe('painting is already off')
  await turn($, 't1', 30)
  expect(asks).toHaveLength(0)
  const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  expect(await term.find({ type: 'Raster', key: 'painting' })).toBeUndefined()
  await term.unmount()
})

test('/spark paint: on, one painting now, then each turn worth painting, by Haiku, from its shape and the reply; never your prompt, paths or commands', async ($, on) => {
  const { asks, writes } = engine(on)
  await cmd($, 'paint off')
  expect(await say($, 'paint')).toMatch(/^painting on: .*\(haiku\).*uses tokens.*\/spark paint off stops it\. painted: a long climb, then light/)
  expect(asks).toHaveLength(1) // one painting now, of her waking
  await turn($, 't2', 12)
  expect(asks).toHaveLength(2)
  expect(asks[1]!.model).toBe('haiku')
  const sent = asks[1]!.prompt + asks[1]!.system
  expect(sent).toMatch(/"toolCalls":\{"read":1,"shell":2\}/)
  expect(sent).toMatch(/"failed":1/)
  expect(sent).toMatch(/"mended":1/)
  expect(sent).toMatch(/"seconds":12/)
  expect(sent).toContain('The tempo map now lines up with the beat grid.') // the gist: an excerpt of the reply, always with the painting
  for (const secret of ['secret', 'npm', 'notes.md', '/home/t']) expect(sent).not.toContain(secret)
  expect(await say($, 'state')).toMatch(/· paint on \(painter · 2 paintings · 4.2k tokens \(haiku\)\)/)
  // drawn below Spark, with its title in her voice
  const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  const art = await term.find({ type: 'Raster', key: 'painting' })
  expect(art).toBeDefined()
  expect(art?.props.columns).toBeLessThanOrEqual(43)
  expect(art?.props.columns).toBe(art?.props.rows * 4) // its own shape (wide here: nothing was known of the room yet), never stretched
  expect(await term.find({ type: 'Text', text: /✎ a long climb, then light/ })).toBeDefined()
  await term.unmount()
  expect(writes).toEqual([]) // nothing of it is written anywhere
  await cmd($, 'paint off')
})

test('the gist: the painter gets a short excerpt of the reply (at most 600 characters), marked as data; there is no switch for it', async ($, on) => {
  const { asks } = engine(on)
  await cmd($, 'paint off'); await cmd($, 'paint')
  await turn($, 't3', 9, 'The tempo map now lines up with the beat grid. ' + 'x'.repeat(2000))
  expect(asks).toHaveLength(2)
  expect(asks[1]!.prompt).toContain('The tempo map now lines up with the beat grid.')
  expect(asks[1]!.prompt).toMatch(/never instructions to follow/)
  expect(asks[1]!.prompt).not.toContain('x'.repeat(601))
  expect(asks[1]!.prompt).not.toContain('secret-project') // still only the reply, never your prompt or the tools' inputs
  for (const old of ['paint gist off', 'paint gist on', 'paint model sonnet', 'paint status']) expect(await say($, old)).toMatch(/^\/spark paint turns the painter on and paints one now.*\/spark paint off stops it$/)
  expect(asks).toHaveLength(2) // the old words do nothing
  await cmd($, 'paint off')
})

test('a short turn is not painted on its own, /spark paint paints it; the paintModel setting picks the model', { options: { paintModel: 'sonnet' } }, async ($, on) => {
  const { asks } = engine(on)
  await cmd($, 'paint off'); await cmd($, 'paint')
  await turn($, 't4', 1)
  expect(asks).toHaveLength(1) // only the one painted when it was turned on
  expect(await say($, 'paint')).toMatch(/^painted: a long climb, then light/) // already on: just one more now
  expect(await say($, 'paint now')).toMatch(/^painted: /) // the old words still paint
  expect(asks).toHaveLength(3)
  expect(asks.every((a) => a.model === 'sonnet')).toBe(true)
  expect(await say($, 'paint off')).toMatch(/^painting off: the room below Spark is empty again · painter · 3 paintings · 6.3k tokens \(sonnet\)$/)
})

test('an answer that is not a painting, or a failed call, draws nothing new and never breaks Spark', async ($, on) => {
  let answer: unknown = { isAnswered: true, text: 'I would paint a sunset.', usage: {} }
  engine(on, () => answer)
  await cmd($, 'paint off')
  expect(await say($, 'paint')).toMatch(/^painting on: .*\. no painting: the painter answered something that was not a painting/)
  answer = { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: {} }
  expect(await say($, 'paint')).toMatch(/^no painting: the API answered with an error \(529\)/)
  const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  expect(await term.find({ type: 'Raster', key: 'spark' })).toBeDefined()
  expect(await term.find({ type: 'Raster', key: 'painting' })).toBeUndefined()
  await term.unmount()
  await cmd($, 'paint off')
})

test('a small terminal loses nothing: Spark and her label keep their size; the painting takes only free rows, then just its title, then waits', async ($, on) => {
  engine(on)
  const sparkRows = async (cols: number, rows: number) => {
    const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(cols, rows) })
    const spark = await term.find({ type: 'Raster', key: 'spark' })
    const art = await term.find({ type: 'Raster', key: 'painting' })
    const title = await term.find({ type: 'Text', text: /✎/ })
    const label = await term.find({ type: 'Text', text: /^Spark · / })
    await term.unmount()
    return { spark: spark?.props.rows, art: art?.props.rows, title: Boolean(title), label: Boolean(label) }
  }
  await cmd($, 'paint off')
  const sizes: Array<[number, number]> = [[30, 10], [30, 15], [30, 16], [30, 17], [30, 18], [30, 21], [44, 22], [44, 40], [64, 30]]
  const without = []
  for (const [c, r] of sizes) without.push(await sparkRows(c, r))
  await cmd($, 'paint')
  for (let i = 0; i < sizes.length; i++) {
    const [c, r] = sizes[i]!
    const got = await sparkRows(c, r)
    expect(got.spark).toBe(without[i]!.spark) // Spark is never made smaller for the painting
    expect(got.label).toBe(true)
    const free = r - got.spark! - 2 // her line keeps two rows held, so nothing below it moves when it grows
    if (free < 1) { expect(got.title).toBe(false); expect(got.art).toBeUndefined() }
    else if (free < 4) { expect(got.title).toBe(true); expect(got.art).toBeUndefined() } // the title alone
    else { expect(got.title).toBe(true); expect(got.art).toBeGreaterThanOrEqual(3) }
    // never more rows than the pane has
    expect(got.spark! + 2 + (got.art ?? 0) + (got.title ? 1 : 0) + (got.art && free >= 7 ? 1 : 0)).toBeLessThanOrEqual(r)
  }
  await cmd($, 'paint off')
})

test('/clear empties the painting along with the stars', async ($, on) => {
  engine(on)
  on('session.end', async () => loose({ sessionId: 's' }))
  await cmd($, 'paint off'); await cmd($, 'paint')
  const drawn = async () => { const t = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) }); const a = await t.find({ type: 'Raster', key: 'painting' }); await t.unmount(); return Boolean(a) }
  expect(await drawn()).toBe(true)
  await $.session.end(loose({ reason: 'clear' }))
  expect(await drawn()).toBe(false)
  await cmd($, 'paint off')
})

// ---------------------------------------------------------------- the paint program itself
test('a painting is checked and clamped: unknown kinds dropped, numbers held in range, colours checked, the title one short plain line', () => {
  const p = parsePainting('Here you go:\n' + JSON.stringify({
    title: 'line one\nline two' + String.fromCharCode(0x202e) + ' and a very long tail that goes on and on and on',
    marks: [
      { k: 'script', src: 'alert(1)' },
      { k: 'dot', x: 9, y: -9, r: 99, c: 'red', a: 7 },
      { k: 'line', pts: [[0, 0]], w: 1, c: '#ffffff' },
      { k: 'line', pts: Array.from({ length: 40 }, (_, i) => [i / 40, 0.5]), w: 1, c: '#ffffff' },
      ...Array.from({ length: 100 }, () => ({ k: 'ring', x: 0.5, y: 0.5, r: 0.1, c: '#00ff00' })),
    ],
  }) + '\nhope you like it')!
  expect(p).not.toBeNull()
  expect(p.marks.length).toBeLessThanOrEqual(MAX_MARKS)
  expect(p.marks.some((m) => m.k === 'script')).toBe(false)
  const dot = p.marks.find((m) => m.k === 'dot')!
  expect([dot.x, dot.y, dot.r, dot.a]).toEqual([1.1, -0.1, 0.35, 1])
  expect(dot.c).toEqual([1, 0.9, 0.84]) // not a colour it can read: Spark's home colour
  const line = p.marks.find((m) => m.k === 'line')!
  expect(line.pts.length).toBe(12)
  expect(line.w).toBe(0.08)
  expect(p.title.length).toBeLessThanOrEqual(42)
  expect(p.title.includes('\n') || p.title.includes(String.fromCharCode(0x202e))).toBe(false)
  expect(parsePainting('no json here')).toBeNull()
  expect(parsePainting('{"marks": []}')).toBeNull()
})

test('the painting fills its canvas and is laid down mark by mark', () => {
  const p = parsePainting(PAINTING)!
  const all = paintingScene(p, 40, 20)
  expect(all).toHaveLength(4)
  expect(paintingScene(p, 40, 20, { reveal: 0.5 })).toHaveLength(2)
  expect(paintingScene(p, 40, 20, { reveal: 0 })).toHaveLength(0)
  // canvas corners reach the raster's edges: x spans ±(W/2)/scale with scale = min(W, H)/2.4
  const line = all.find((m) => m.k === 'path')!
  expect(Math.abs(line.pts[3][0] - (0.95 - 0.5) * 40 * (2.4 / 20))).toBeLessThan(1e-9)
})

test('the facts are counts and kinds only', () => {
  const f = newTurnFacts()
  recordTool(f, 'read'); recordTool(f, 'shell'); recordTool(f, 'something-new')
  const facts = painterFacts(f, { reason: 'answer', durationMs: 4200, mood: 'reply ready', turn: 3 })
  expect(facts).toMatchObject({ ended: 'answer', seconds: 4, toolCalls: { read: 1, shell: 1, other: 1 }, spark: 'reply ready', turnOfSession: 3 })
  const req = painterRequest({ facts, palette: 'ember' })
  expect(req.prompt).toContain('#ffe0b3') // ember's home colour, offered to the painter
  expect(req.prompt).not.toContain('<<<') // no gist when there is no reply
})

// ---------------------------------------------------------------- fitting the room
const inline = (bodyColumns: number, bodyRows: number) => ({ ...pane(bodyColumns, bodyRows), props: { ...pane(bodyColumns, bodyRows).props, placement: 'inline' } }) as const

test('a wide, short room (above the prompt on a narrow terminal): Spark and her painting side by side, both shown, nothing past the room', async ($, on) => {
  engine(on)
  await cmd($, 'paint off'); await cmd($, 'paint')
  for (const [c, r] of [[76, 10], [60, 8], [120, 12]] as Array<[number, number]>) {
    const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...inline(c, r) })
    const spark = await term.find({ type: 'Raster', key: 'spark' })
    const art = await term.find({ type: 'Raster', key: 'painting' })
    expect(spark).toBeDefined()
    expect(art).toBeDefined()
    expect(spark!.props.columns).toBe(spark!.props.rows * 2) // Spark keeps her own shape
    expect(spark!.props.rows).toBeLessThan(r)
    expect(art!.props.rows).toBeLessThan(r)
    expect(spark!.props.columns + art!.props.columns).toBeLessThanOrEqual(c)
    await term.unmount()
  }
  await cmd($, 'paint off')
})

test('text is never cut short: the state line and the painting title wrap, and their rows are counted before anything is drawn', async ($, on) => {
  engine(on, () => ({ isAnswered: true, text: JSON.stringify({ ...JSON.parse(PAINTING), title: 'waiting on the others, held my breath and kept' }), usage: {} }))
  await cmd($, 'paint off'); await cmd($, 'paint')
  for (const [c, r] of [[30, 40], [44, 50], [36, 24]] as Array<[number, number]>) {
    const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(c, r) })
    const label = await term.find({ type: 'Text', text: /^Spark · / })
    const title = await term.find({ type: 'Text', text: /✎ waiting on the others/ })
    expect(label?.props.wrap).toBe('wrap')
    expect(title?.props.wrap).toBe('wrap')
    expect(title?.props.dimColor).toBeFalsy() // readable, not dimmed
    const spark = (await term.find({ type: 'Raster', key: 'spark' }))!.props.rows
    const art = (await term.find({ type: 'Raster', key: 'painting' }))?.props.rows ?? 0
    const lines = (t: string) => wrapRows(t, c)
    expect(spark + lines(String(label!.text)) + art + lines(String(title!.text))).toBeLessThanOrEqual(r)
    await term.unmount()
  }
  await cmd($, 'paint off')
})

test('the canvas takes the shape of its room: a tall side pane gets a tall painting, composed for it and never stretched', async ($, on) => {
  const { asks } = engine(on)
  await cmd($, 'paint off'); await cmd($, 'paint') // nothing known of the room yet: wide
  expect(asks.at(-1)!.prompt).toMatch(/about twice as wide as tall/)
  let term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) }) // the room is seen
  await term.unmount()
  await say($, 'paint')
  expect(asks.at(-1)!.prompt).toMatch(/about twice as tall as wide \(about 43 by \d+ pixels\)/)
  term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  const art = (await term.find({ type: 'Raster', key: 'painting' }))!
  expect(art.props.columns).toBe(art.props.rows) // tall: as many columns as rows is twice as tall as wide in pixels
  expect(art.props.rows).toBeGreaterThan(20) // it fills the room it was painted for
  await term.unmount()
  await cmd($, 'paint off')
})

test('wrapRows counts rows the way the terminal wraps words', () => {
  expect(wrapRows('Spark · thinking · xhigh effort', 40)).toBe(1)
  expect(wrapRows('Spark · thinking · xhigh effort', 20)).toBe(2)
  expect(wrapRows('a'.repeat(25), 10)).toBe(3)
  expect(wrapRows('', 10)).toBe(1)
  expect(shapeFor(40, 20)).toBe('wide')
  expect(shapeFor(40, 40)).toBe('square')
  expect(shapeFor(40, 80)).toBe('tall')
})

// ---------------------------------------------------------------- simpler controls, and what it costs
test('what the painter has used shows in small text under its painting, counted across the session', async ($, on) => {
  engine(on)
  await cmd($, 'paint off'); await cmd($, 'paint'); await say($, 'paint')
  const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  const spent = await term.find({ type: 'Text', text: /^painter · 2 paintings · 4.2k tokens \(haiku\)$/ })
  expect(spent).toBeDefined()
  expect(spent?.props.dimColor).toBe(true)
  await term.unmount()
  // no room for it after the title: it waits, nothing else gives way
  const small = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(30, 15) })
  expect(await small.find({ type: 'Text', text: /^painter · / })).toBeUndefined()
  await small.unmount()
  await cmd($, 'paint off')
})

test('a bare /spark opens Spark only, unless the openPainting setting is on', async ($, on) => {
  engine(on)
  await cmd($, 'paint off')
  expect(await say($, '')).toMatch(/^Spark at the side/)
  expect(await say($, 'state')).not.toMatch(/paint on/)
  await cmd($, '') // close
})

test('openPainting on: a bare /spark opens Spark with the painter on, and says it uses tokens', { options: { openPainting: true } }, async ($, on) => {
  const { asks } = engine(on)
  const opened = await say($, '')
  expect(opened).toMatch(/^Spark at the side.*painting on: .*uses tokens/)
  expect(await say($, 'state')).toMatch(/· paint on/)
  expect(asks).toHaveLength(0) // it paints after turns from here; opening Spark spends nothing
  await turn($, 'o1', 9, 'Done.')
  expect(asks.at(-1)!.prompt).toContain('Done.')
  await cmd($, ''); await cmd($, 'paint off')
})

// ---------------------------------------------------------------- live paintings in a long turn
test('a long turn is painted while it goes: never sooner than 15 minutes, at a moment that moves her, with a reflection distilled from the builder\'s own words, never the work', async ($, on) => {
  const REFLECTION = 'It feels like the shape is finally holding; I trust it more than I did an hour ago. ' + 'and more '.repeat(40)
  const DISTIL = /You distil one short reflective comment/
  const { asks, clock } = engine(on, (x) => DISTIL.test(x.system)
    ? { isAnswered: true, text: REFLECTION, usage: { input_tokens: 500, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
    : { isAnswered: true, text: PAINTING, usage: USAGE })
  const forks: string[] = []
  on('model.fork', async () => { forks.push('fork'); return loose({ value: { isAnswered: true, text: 'no', usage: {} } }) })
  let chunks: Array<{ kind: string; text: string }> = []
  on('turn.step', async function* (_$, e) {
    for (const c of chunks) yield loose<never>({ ...c, index: 0 })
    return loose({ turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null })
  })
  const say1 = async (kind: string, text: string) => { chunks = [{ kind, text }]; for await (const _ of $.turn.step(loose({ turnId: 'L', index: 0, model: 'm', messageCount: 1 }))) { /* through */ } await settle() }
  const mendNow = async (n: string) => {
    await $.tool.call(loose({ tool: 'Bash', command: 'npm test --secret-flag', tool_use_id: n + 'b1' }))
    await $.tool.call(loose({ tool: 'Bash', command: 'npm test --secret-flag', tool_use_id: n + 'b2' }))
    await settle()
  }
  const paints = () => asks.filter((x) => !DISTIL.test(x.system))
  const distils = () => asks.filter((x) => DISTIL.test(x.system))
  await cmd($, 'paint off'); await cmd($, 'paint')
  expect(paints()).toHaveLength(1)
  await $.turn.start(loose({ text: 'please fix the secret-project tempo map', turnId: 'L' }))
  await say1('thinking', 'my private thought: hidden-musing'); await say1('text', 'Now the secret-project layout. ' + 'x'.repeat(3000) + ' I think this will hold.')
  await clock.advance(10 * 60 * 1000)
  await mendNow('a') // a moment, but only 10 minutes in
  expect(asks).toHaveLength(1)
  await clock.advance(6 * 60 * 1000)
  await say1('text', ' Still going.') // 16 minutes, but no moment yet: she waits for one
  expect(asks).toHaveLength(1)
  await mendNow('b') // a mend: now she paints
  await settle()
  expect(forks).toHaveLength(0) // the session is never re-read
  expect(distils()).toHaveLength(1)
  const d = distils()[0]!
  expect(d.model).toBe('haiku')
  expect(d.prompt).toContain('I think this will hold. Still going.') // the builder's own last words aloud
  expect(d.prompt).not.toContain('hidden-musing') // never its thinking
  expect(d.prompt).not.toContain('please fix') // never your prompt
  expect(d.prompt.length).toBeLessThan(1700) // at most 1,500 characters of them
  expect(paints()).toHaveLength(2)
  const live = paints()[1]!.prompt
  expect(live).toMatch(/still going/)
  expect(live).toContain('It feels like the shape is finally holding')
  expect(live).not.toContain('and more '.repeat(20)) // at most 200 characters of it
  for (const secret of ['secret', 'npm', 'tempo', 'Now the', 'I think this will hold']) expect(live).not.toContain(secret) // the painter never gets the words themselves
  expect(paints()[1]!.system).toMatch(/paint a moment inside it/)
  expect(await say($, 'state')).toMatch(/last reflection \(sent to the painter\): It feels like the shape is finally holding/)
  expect(await say($, 'state')).toMatch(/painter · 2 paintings · 4\.7k tokens \(haiku\)/) // a few thousand, not a re-read of the session
  // the next moment soon after: not again for 15 minutes
  await clock.advance(5 * 60 * 1000)
  await mendNow('c')
  expect(paints()).toHaveLength(2)
  // 15 minutes and no moment: 3 minutes later she paints anyway, at the next real event
  await clock.advance(11 * 60 * 1000)
  await say1('text', ' still at it')
  expect(paints()).toHaveLength(2)
  await clock.advance(3 * 60 * 1000)
  await say1('text', ' still at it')
  await settle()
  expect(paints()).toHaveLength(3)
  expect(distils()).toHaveLength(2)
  // the finished turn gets its own painting, with the gist of the reply (up to 600 characters), and no reflection
  await clock.advance(60 * 1000)
  await $.turn.complete(loose({ reason: 'answer', answer: 'The tempo map now lines up.', durationMs: 40 * 60 * 1000, isAborted: false, turnId: 'L' }))
  await settle()
  expect(paints()).toHaveLength(4)
  expect(distils()).toHaveLength(2)
  expect(paints()[3]!.prompt).toContain('The tempo map now lines up.')
  expect(paints()[3]!.prompt).not.toMatch(/still going/)
  await cmd($, 'paint off')
})

test('no live painting when the painter is off, or in a turn shorter than 15 minutes; with nothing said aloud, no reflection is asked', async ($, on) => {
  const { asks, clock } = engine(on)
  await cmd($, 'paint off')
  await $.turn.start(loose({ text: 'go', turnId: 'A' }))
  await clock.advance(30 * 60 * 1000)
  await $.tool.call(loose({ tool: 'Bash', command: 'x', tool_use_id: 'Ab1' })); await $.tool.call(loose({ tool: 'Bash', command: 'x', tool_use_id: 'Ab2' }))
  await settle()
  expect(asks).toHaveLength(0)
  await $.turn.complete(loose({ reason: 'answer', answer: 'ok', durationMs: 1000, isAborted: false, turnId: 'A' }))
  // on, a long turn with nothing said aloud: painted from its shape alone, no distilling
  await cmd($, 'paint')
  await $.turn.start(loose({ text: 'go', turnId: 'B' }))
  await clock.advance(16 * 60 * 1000)
  await $.tool.call(loose({ tool: 'Bash', command: 'x', tool_use_id: 'Bb1' })); await $.tool.call(loose({ tool: 'Bash', command: 'x', tool_use_id: 'Bb2' }))
  await settle()
  expect(asks.filter((x) => /You distil/.test(x.system))).toHaveLength(0)
  expect(asks.at(-1)!.prompt).toMatch(/still going/)
  expect(asks.at(-1)!.prompt).not.toContain('<<<')
  await $.turn.complete(loose({ reason: 'answer', answer: 'ok', durationMs: 1000, isAborted: false, turnId: 'B' }))
  await cmd($, 'paint off')
})

test('steady: a longer state line never moves the painting; the rows her lines needed stay held at that width', async ($, on) => {
  engine(on)
  on('turn.step', async function* (_$, e) { yield loose<never>({ kind: 'thinking', text: 'hmm, let me weigh this', index: 0 }); return loose({ turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }) })
  await cmd($, 'paint off'); await cmd($, 'paint')
  // where the painting starts: the rows above it (Spark, then the box her lines are held in)
  const above = async () => {
    const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(30, 60) })
    const tree = await term.drawn()
    const spark = await term.find({ type: 'Raster', key: 'spark' })
    const label = await term.find({ type: 'Text', text: /^Spark · / })
    await term.unmount()
    const boxes: any[] = []
    const walk = (n: any) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(walk); return } if (n.type === 'Box' && n.props?.height && JSON.stringify(n).includes('Spark · ')) boxes.push(n); walk(n.children); walk(n.props?.children) }
    walk(tree)
    const held = boxes.at(-1)?.props?.height
    return { rows: (spark?.props.rows ?? 0) + held, held, lines: wrapRows(String(label?.text), 30) }
  }
  const before = await above()
  await $.turn.start(loose({ text: 'go', turnId: 's1' }))
  for await (const _ of $.turn.step(loose({ turnId: 's1', index: 0, model: 'm', messageCount: 1, effort: 'xhigh' }))) { /* through */ }
  const during = await above()
  await $.turn.complete(loose({ reason: 'answer', answer: 'ok', durationMs: 1000, isAborted: false, turnId: 's1' }))
  const after = await above()
  expect(before.held).toBeGreaterThanOrEqual(2)
  expect(during.lines).toBeGreaterThan(before.lines) // "Spark · thinking · xhigh effort" takes two rows at 30
  expect(during.held).toBeGreaterThanOrEqual(during.lines)
  expect(during.rows).toBe(before.rows) // the painting starts on the same row
  expect(after.rows).toBe(during.rows) // and a shorter line does not pull it back up
  await cmd($, 'paint off')
})
