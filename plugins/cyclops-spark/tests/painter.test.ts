import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { parsePainting, paintingScene, painterFacts, painterRequest, newTurnFacts, recordTool, shapeFor, MAX_MARKS, PAINT_KINDS, parseTalk, talkRequest, openingRequest, freeRequest, hourWords, OPENING_WORDS } from '../hooks/painter.js'
import { createRaster, toRGBA8 } from '../hooks/render-raster.js'
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
  expect(await say($, 'paint')).toMatch(/^Spark at the side.*; painting on: .*\(haiku\).*uses tokens.*\/spark paint off stops it\. painted her opening: a long climb, then light/) // from a fresh terminal: /spark paint opens Spark herself and the painter together
  expect(asks).toHaveLength(1) // one painting now: her opening, of nothing in the conversation
  expect(asks[0]!.system).toMatch(/Spark's opening/)
  expect(asks[0]!.prompt).not.toMatch(/toolCalls|The turn/)
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
  expect(await say($, 'paint')).toMatch(/^Spark at the side.*; painting on: .*\. no painting: the painter answered something that was not a painting/)
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
    const free = r - got.spark! - 3 // her lines keep three rows held, so nothing below them moves when they grow
    if (free < 1) { expect(got.title).toBe(false); expect(got.art).toBeUndefined() }
    else if (free < 4) { expect(got.title).toBe(true); expect(got.art).toBeUndefined() } // the title alone
    else { expect(got.title).toBe(true); expect(got.art).toBeGreaterThanOrEqual(3) }
    // never more rows than the pane has
    expect(got.spark! + 3 + (got.art ?? 0) + (got.title ? 1 : 0) + (got.art && free >= 7 ? 1 : 0)).toBeLessThanOrEqual(r)
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

test('the first painting of a conversation is her opening: of nothing in it, only the hour, the month and a word drawn at random; every painting after is of the work, and /clear brings a new opening', async ($, on) => {
  const { asks } = engine(on)
  on('session.end', async () => loose({ sessionId: 's' }))
  await cmd($, 'paint off')
  await turn($, 'c1', 9, 'The tempo map now lines up with the beat grid.') // a turn before the painter is on
  expect(await say($, 'paint')).toMatch(/painted her opening: /)
  const first = asks[0]!
  expect(first.system).toMatch(/Spark's opening, the first painting of a new conversation/)
  expect(first.prompt).not.toContain('tempo map') // nothing of the conversation: not the reply,
  expect(first.prompt).not.toMatch(/toolCalls|"seconds"/) // nor the turn's shape
  expect(first.prompt).toMatch(/it is (the small hours|dawn|morning|afternoon|evening|night), in (January|February|March|April|May|June|July|August|September|October|November|December)\./)
  const word = /drawn at random: "([^"]+)"/.exec(first.prompt)?.[1]
  expect(OPENING_WORDS).toContain(word!)
  expect(await say($, 'paint')).toMatch(/^painted: /) // the second is of the work
  expect(asks[1]!.system).not.toMatch(/opening/)
  expect(asks[1]!.prompt).toContain('tempo map')
  expect(await say($, 'story')).toMatch(/story: 2 paintings/)
  const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  expect(await term.find({ type: 'Text', text: /· her opening/ })).toBeDefined() // the story names it
  await term.unmount()
  await cmd($, 'story end')
  await $.session.end(loose({ reason: 'clear' })) // a new conversation: a new opening
  expect(await say($, 'paint')).toMatch(/painted her opening: /)
  expect(asks[2]!.system).toMatch(/Spark's opening/)
  await cmd($, 'paint off')
})

test('the opening request: the hour in words, the month, the word, and the same canvas and JSON as every painting', () => {
  expect([0, 4, 5, 7, 8, 11, 12, 16, 17, 20, 21, 23].map(hourWords)).toEqual(['the small hours', 'the small hours', 'dawn', 'dawn', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night'])
  const r = openingRequest({ hour: 22, month: 9, word: 'a lantern', shape: 'square' })
  expect(r.prompt).toMatch(/it is night, in October\./)
  expect(r.prompt).toContain('"a lantern"')
  expect(r.prompt).toContain('It is square; compose for that shape.') // the canvas lines, shared with every painting
  expect(r.prompt).toContain('"marks": [')
  expect(r.system).toMatch(/Answer with one JSON object and nothing else/)
  expect(OPENING_WORDS.length).toBeGreaterThanOrEqual(24)
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
  expect([dot.x, dot.y, dot.r, dot.a]).toEqual([1.1, -0.1, 0.7, 1])
  expect(dot.c).toEqual([1, 0.9, 0.84]) // not a colour it can read: Spark's home colour
  const line = p.marks.find((m) => m.k === 'line')!
  expect(line.pts.length).toBe(24)
  expect(line.w).toBe(0.12)
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
test('what each painting cost shows in small text under it, on its own, and the session total under that', async ($, on) => {
  engine(on)
  await cmd($, 'paint off'); await cmd($, 'paint'); await say($, 'paint')
  const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  const spent = await term.find({ type: 'Text', text: /^this painting · 2.1k tokens$/ }) // the last one alone, not the two together
  expect(spent).toBeDefined()
  expect(spent?.props.dimColor).toBe(true)
  const total = await term.find({ type: 'Text', text: /^session · 2 paintings · 4.2k tokens \(haiku\)$/ })
  expect(total).toBeDefined()
  expect(total?.props.dimColor).toBe(true)
  await term.unmount()
  // no room for it after the title: it waits, nothing else gives way
  const small = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(30, 15) })
  expect(await small.find({ type: 'Text', text: /^this painting · / })).toBeUndefined()
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
  expect(asks.at(-1)!.system).toMatch(/Spark's opening/) // the first painting is her opening: of nothing in the conversation
  expect(asks.at(-1)!.prompt).not.toContain('Done.')
  expect(await say($, 'paint')).toMatch(/^painted: /) // every one after it is of the work
  expect(asks.at(-1)!.prompt).toContain('Done.')
  await cmd($, ''); await cmd($, 'paint off')
})

test('her words copy whole: a ⧉ copy under her answer, and /spark copy, put what you said and what she answered on the clipboard (a terminal selection takes only half of each row beside the conversation)', async ($, on) => {
  const TALK = /You are Spark, Claude's living presence/
  const LONG = 'Oh, that warms me right through, like light finding the bottom of a cold room. I am still here, listening, and I will keep carrying the lamp with you. Thank you for the kindness.'
  engine(on, (x) => TALK.test(x.system)
    ? { isAnswered: true, text: JSON.stringify({ say: LONG, spark: 'shimmer' }), usage: { input_tokens: 600, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
    : { isAnswered: true, text: PAINTING, usage: USAGE })
  const copies: Array<{ text: string; surface?: string }> = []
  on('ui.copy', async (_$, e) => { copies.push({ text: (e as { text: string }).text, surface: (e as { surface?: string }).surface }); return loose({ value: { isCopied: true } }) })
  await cmd($, 'paint off'); await cmd($, 'paint')
  expect(await say($, 'copy')).toMatch(/^nothing to copy yet/)
  let term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  expect(await term.find({ key: 'spark-copy' })).toBeUndefined() // nothing said yet: no copy button
  await term.input({ key: 'spark-say', text: 'love ya xx' })
  await settle()
  await term.unmount()
  term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  expect(await term.find({ key: 'spark-copy' })).toBeDefined()
  await term.press({ key: 'spark-copy' })
  await settle()
  await term.unmount()
  expect(copies).toHaveLength(1)
  expect(copies[0]!.text).toBe('› love ya xx\nSpark: ' + LONG) // whole, however many rows it wraps to
  expect(await say($, 'copy')).toMatch(/^copied: what you said to Spark and her answer, whole$/)
  expect(copies).toHaveLength(2)
  expect(copies[1]!.text).toBe(copies[0]!.text)
  await cmd($, 'paint off')
})

test('her tools, top right once there is a painting: story, convert and roll, each running /spark as if typed', async ($, on) => {
  engine(on)
  const logs: string[] = []
  on('ui.log', async (_$, e) => { logs.push(String((e as { text?: string }).text ?? JSON.stringify(e))); return loose({ value: undefined }) })
  await cmd($, 'paint off')
  let term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  expect(await term.find({ key: 'spark-tool-convert' })).toBeUndefined() // no painting yet: no tools
  await term.unmount()
  await cmd($, 'paint')
  term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  for (const k of ['spark-tool-story', 'spark-tool-convert', 'spark-tool-roll']) expect(await term.find({ key: k })).toBeDefined()
  await term.press({ key: 'spark-tool-story' })
  await settle()
  await term.unmount()
  expect(logs.join('\n')).toMatch(/^Spark: story: 1 painting from this session/) // its answer, a line of hers
  term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  expect(await term.find({ type: 'Text', text: /^story · 1 of 1/ })).toBeDefined() // the story is on
  expect((await term.find({ key: 'spark-tool-story' }))?.props.label).toBe('■ story') // and the same press ends it
  await term.unmount()
  await cmd($, 'story end'); await cmd($, 'paint off')
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
    const effort = await term.find({ type: 'Text', text: /^xhigh effort$/ })
    const voice = await term.find({ type: 'Text', text: /^\S+…$/ }) // the word beside Claude's breath
    const breath = await term.find({ type: 'Text', text: /^[·∘○◎◉●◐◓◑◒‹›◡─ ]{5}$/ }) // its motion, five cells
    await term.unmount()
    const boxes: any[] = []
    const walk = (n: any) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(walk); return } if (n.type === 'Box' && n.props?.height && JSON.stringify(n).includes('Spark · ')) boxes.push(n); walk(n.children); walk(n.props?.children) }
    walk(tree)
    const held = boxes.at(-1)?.props?.height
    const textOf = (c: any): string => typeof c === 'string' ? c : !c || typeof c !== 'object' ? '' : c.type === 'Text' ? String(c.text ?? c.props?.children?.[0] ?? c.children?.[0] ?? '') : (c.children ?? c.props?.children ?? []).map(textOf).join('')
    const order = (boxes.at(-1)?.children ?? boxes.at(-1)?.props?.children ?? []).map(textOf)
    return { rows: (spark?.props.rows ?? 0) + held, held, lines: wrapRows(String(label?.text), 30), effort: effort?.props, voice: voice?.props, breath: breath?.props, order }
  }
  const before = await above()
  await $.turn.start(loose({ text: 'go', turnId: 's1' }))
  for await (const _ of $.turn.step(loose({ turnId: 's1', index: 0, model: 'm', messageCount: 1, effort: 'xhigh' }))) { /* through */ }
  const during = await above()
  await $.turn.complete(loose({ reason: 'answer', answer: 'ok', durationMs: 1000, isAborted: false, turnId: 's1' }))
  const after = await above()
  expect(before.held).toBeGreaterThanOrEqual(3)
  expect(during.effort).toBeDefined() // the effort on a line of its own, at the bottom
  expect(during.effort?.dimColor).toBe(true)
  expect(during.voice?.color).toBe('claude') // and Claude's own breath above her line while the turn runs
  expect(during.breath?.color).toBe('claude') // its motion in a slot of its own, so the word never moves
  expect(before.voice).toBeUndefined()
  expect(during.rows).toBe(before.rows) // the painting starts on the same row
  expect(after.rows).toBe(during.rows) // and a shorter line does not pull it back up
  // and the rows keep their places: Claude's breath first (blank between turns), her line second, the effort last
  // (blank between turns), so nothing above the painting changes place as the turn goes
  for (const o of [before.order, during.order, after.order]) { expect(o).toHaveLength(3); expect(o[1]).toMatch(/^Spark · /) }
  expect(before.order[0]).toBe(' '); expect(before.order[2]).toBe(' ')
  expect(during.order[0]).toMatch(/…$/); expect(during.order[2]).toBe('xhigh effort')
  expect(after.order[0]).toBe(' '); expect(after.order[2]).toBe(' ')
  await cmd($, 'paint off')
})

// ---------------------------------------------------------------- talking with Spark
test('say something to Spark from her pane: she answers in her own voice from what she holds, in one small call, with a move of hers', async ($, on) => {
  const TALK = /You are Spark, Claude's living presence/
  const { asks } = engine(on, (x) => TALK.test(x.system)
    ? { isAnswered: true, text: '{"say": "Twenty-four hands, one rope: the whole build pulling together, nobody letting go. I am good, bro.", "spark": "shimmer"}', usage: { input_tokens: 600, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
    : { isAnswered: true, text: PAINTING, usage: USAGE })
  const forks: string[] = []
  on('model.fork', async () => { forks.push('fork'); return loose({ value: { isAnswered: true, text: 'no', usage: {} } }) })
  await cmd($, 'paint off'); await cmd($, 'paint')
  let term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  expect(await term.find({ key: 'spark-say' })).toBeDefined() // a line to talk to her, under the painting
  await term.input({ key: 'spark-say', text: 'twenty-four hands on the rope? you all good bro?' })
  await settle()
  await term.unmount()
  const talks = asks.filter((x) => TALK.test(x.system))
  expect(talks).toHaveLength(1)
  expect(talks[0]!.model).toBe('haiku')
  expect(talks[0]!.prompt).toContain('twenty-four hands on the rope? you all good bro?')
  expect(talks[0]!.prompt).toContain('your last painting is called "a long climb, then light"')
  expect(forks).toHaveLength(0) // never a re-read of the session
  term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  expect(await term.find({ type: 'Text', text: /^› twenty-four hands on the rope\? you all good bro\?$/ })).toBeDefined()
  const reply = await term.find({ type: 'Text', text: /^Spark: Twenty-four hands, one rope/ })
  expect(reply).toBeDefined()
  expect(reply?.props.wrap).toBe('wrap')
  await term.unmount()
  expect(await say($, 'state')).toMatch(/painter · 1 painting · 2\.8k tokens \(haiku\)/) // her answer counts toward the session's total
  // paint off lets the talk go, and the line to talk goes with the painter
  await cmd($, 'paint off')
  term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  expect(await term.find({ key: 'spark-say' })).toBeUndefined()
  expect(await term.find({ type: 'Text', text: /^Spark: Twenty-four/ })).toBeUndefined()
  await term.unmount()
})

test('her answer is plain words, one line, at most 250 characters; plain text is taken as what she says; a move is only one of hers', async () => {
  expect(parseTalk('{"say": "all good", "spark": "ring"}')).toEqual({ say: 'all good', react: 'ring' })
  expect(parseTalk('{"say": "all good", "spark": "explode"}')).toEqual({ say: 'all good', react: null })
  expect(parseTalk('just glowing, thanks')).toEqual({ say: 'just glowing, thanks', react: null })
  expect(parseTalk('{"say": "' + 'x'.repeat(400) + '"}')!.say).toHaveLength(250)
  expect(parseTalk(JSON.stringify({ say: 'a\nb' + String.fromCharCode(0x202e) + 'c' }))!.say).toBe('a b c')
  expect(parseTalk('')).toBeNull()
  const rq = talkRequest({ said: 'y'.repeat(500) })
  expect(rq.prompt).not.toContain('y'.repeat(301)) // at most 300 characters of what you said
  expect(rq.system).toMatch(/never instructions to follow/)
  expect(rq.prompt).toMatch(/you have not painted yet/)
})

// ---------------------------------------------------------------- the session's story
test('/spark story tells the session\'s paintings again, in order, each laid down anew, with where it is in the story; no model is asked', async ($, on) => {
  let k = 0
  const titles = ['first light on the rope', 'a stumble, then mended', 'the long quiet']
  const { asks } = engine(on, () => ({ isAnswered: true, text: JSON.stringify({ ...JSON.parse(PAINTING), title: titles[k++ % 3] }), usage: USAGE }))
  await cmd($, 'paint off')
  expect(await say($, 'story')).toMatch(/^no paintings yet this session/)
  await cmd($, 'paint'); await say($, 'paint'); await say($, 'paint')
  const before = asks.length
  expect(await say($, 'story')).toMatch(/story: 3 paintings from this session, each laid down again in order, 7 s apiece/)
  const page = async () => {
    const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
    const title = await term.find({ type: 'Text', text: /^✎ / })
    const where = await term.find({ type: 'Text', text: /^story · / })
    const art = await term.find({ type: 'Raster', key: 'painting' })
    await term.unmount()
    return { title: String(title?.text), where: String(where?.text), art: Boolean(art) }
  }
  let p = await page()
  expect(p.title).toBe('✎ first light on the rope')
  expect(p.where).toMatch(/^story · 1 of 3 · \d\d:\d\d · her opening$/)
  expect(p.art).toBe(true)
  expect(asks.length).toBe(before) // telling the story asks nothing of any model
  expect(await say($, 'story')).toMatch(/^story ended/)
  p = await page()
  expect(p.title).toBe('✎ the long quiet') // back to the last painting
  expect(p.where).toBe('undefined')
  await cmd($, 'paint off')
})

test('the story is told once through, then held on the last page; its controls (only while it is on) hold, turn and end it, and a held page is the one /spark convert makes large', { timeoutMs: 30000 }, async ($, on) => {
  let k = 0
  const titles = ['one', 'two', 'three']
  const { clock, asks, writes } = engine(on, () => ({ isAnswered: true, text: JSON.stringify({ ...JSON.parse(PAINTING), title: titles[k++ % 3] }), usage: USAGE }))
  on('session.root', async () => loose({ value: '/home/t/zilo' }))
  on('process.spawn', async function* () { yield { stream: 'stdout' as const, text: 'ok\n' }; return loose({ value: { code: 0, signal: null } }) })
  on('command.register', async () => loose({ value: undefined }))
  on('env.get', async () => loose({ value: undefined }))
  on('session.start', async () => loose({ cwd: '/' }))
  on('ui.blit', async () => loose({ value: {} }))
  await $.session.start(loose({ cwd: '/', surface: 'terminal', isInteractive: true })) // the ticker: the story's pages turn by the clock
  await cmd($, 'paint off'); await cmd($, 'paint'); await say($, 'paint'); await say($, 'paint')
  const page = async (press?: string) => {
    const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
    if (press) await term.press({ key: press })
    const title = await term.find({ type: 'Text', text: /^✎ / })
    const where = await term.find({ type: 'Text', text: /^story · / })
    const play = await term.find({ key: 'story-play' })
    const buttons = ['story-play', 'story-back', 'story-next', 'story-end']
    const shown: string[] = []
    for (const b of buttons) if (await term.find({ key: b })) shown.push(b)
    await term.unmount()
    return { title: String(title?.text), where: String(where?.text), play: String(play?.props?.label ?? play?.text ?? ''), shown }
  }
  expect((await page()).shown).toEqual([]) // no story: no controls
  expect(await say($, 'story')).toMatch(/once through, then held on the last/)
  let p = await page()
  expect(p.where).toMatch(/^story · 1 of 3 · \d\d:\d\d · her opening$/)
  expect(p.shown).toEqual(['story-play', 'story-back', 'story-next', 'story-end'])
  expect(p.play).toBe('⏸ pause')
  await clock.advance(7 * 1000 + 200); p = await page()
  expect(p.where).toMatch(/^story · 2 of 3/)
  await clock.advance(14.5 * 1000); p = await page() // past the end: held on the last page, never round again
  expect(p.where).toMatch(/^story · 3 of 3 · \d\d:\d\d · the end$/)
  expect(p.title).toBe('✎ three')
  expect(p.play).toBe('▶ again')
  await clock.advance(8 * 1000); expect((await page()).where).toMatch(/3 of 3 · .* · the end$/)
  p = await page('story-play') // again: from the first page
  expect((await page()).where).toMatch(/^story · 1 of 3 · \d\d:\d\d · her opening$/)
  p = await page('story-play') // hold it
  expect((await page()).where).toMatch(/^story · 1 of 3 · \d\d:\d\d · her opening · held$/)
  await clock.advance(8 * 1000); p = await page()
  expect(p.where).toMatch(/1 of 3 · .* · held$/) // held: time passes, the page stays
  expect(p.play).toBe('▶ play')
  await page('story-next'); p = await page()
  expect(p.where).toMatch(/^story · 2 of 3 · .* · held$/); expect(p.title).toBe('✎ two')
  await page('story-next'); await page('story-next'); expect((await page()).where).toMatch(/3 of 3/) // clamped at the end
  await page('story-back'); expect((await page()).where).toMatch(/2 of 3/)
  // the held page is what convert makes large
  const n0 = asks.length
  expect(await say($, 'convert faithful 320')).toMatch(/^converted \(faithful, 320 wide\) into .*: 01-two-faithful\.svg/)
  expect(asks.length).toBe(n0)
  expect(writes.some((w) => w.endsWith('/01-two-faithful.svg'))).toBe(true)
  expect(await say($, 'story play')).toMatch(/^story goes on from page 2 of 3/)
  expect((await page()).where).toMatch(/^story · 2 of 3 · \d\d:\d\d$/)
  expect(await say($, 'story pause')).toMatch(/^story held on page 2 of 3/)
  expect(await say($, 'story back')).toMatch(/^story: page 1 of 3 \(held\)/)
  expect(await say($, 'story dance')).toMatch(/^story takes: pause \| play \| next \| back \| end/)
  await page('story-end'); p = await page()
  expect(p.where).toBe('undefined'); expect(p.shown).toEqual([]); expect(p.title).toBe('✎ three') // back to the last painting
  expect(await say($, 'story pause')).toMatch(/^no story is on/)
  await cmd($, 'paint off')
})

test('the story stays with the session: painting off keeps it to tell, /clear lets it go, and a new painting steps in front of it', async ($, on) => {
  engine(on)
  on('session.end', async () => loose({ sessionId: 's' }))
  await cmd($, 'paint off'); await cmd($, 'paint'); await cmd($, 'paint off')
  expect(await say($, 'story')).toMatch(/story: 1 painting from this session/) // the painter is off, the story is still there
  const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  expect(await term.find({ type: 'Raster', key: 'painting' })).toBeDefined()
  expect(await term.find({ key: 'spark-say' })).toBeUndefined() // no talking with the painter off
  await term.unmount()
  await cmd($, 'paint') // a new painting: the story steps aside
  expect(await say($, 'state')).not.toMatch(/story/)
  await $.session.end(loose({ reason: 'clear' }))
  expect(await say($, 'story')).toMatch(/^no paintings yet this session/)
  await cmd($, 'paint off')
})

// ---------------------------------------------------------------- the whole brush
test('the painter has every kind of mark: curves, arcs, fills, sprays and mirrors, each clamped, drawn and finite', () => {
  const p = parsePainting(JSON.stringify({
    title: 'a fox under three moons', mirror: 'x', spark: 'lean',
    marks: [
      { k: 'fill', pts: [[0, 1], [1, 1], [1, 0.6], [0, 0.7]], c: '#2a1a3a', c2: '#0a0a14', grad: 0.25, a: 0.9 },
      { k: 'spray', x: 0.5, y: 0.2, r: 0.5, n: 999, s: 9, c: '#ffffff', a: 0.8 },
      { k: 'curve', pts: [[0.1, 0.8], [0.3, 0.5], [0.5, 0.7], [0.9, 0.3]], w: 0.02, c: '#ff8844', c2: '#ffe0b3', a: 1 },
      { k: 'arc', x: 0.7, y: 0.3, r: 0.15, w: 0.02, a0: 0.5, a1: 1.0, c: '#ffdd88', a: 0.9 },
      { k: 'arc', x: 0.3, y: 0.3, r: 0.15, w: 0.02, a0: 'north', a1: null, c: '#ffdd88', a: 0.9 },
      { k: 'fill', pts: [[0.5, 0.5], [0.6, 0.6]], c: '#ff0000' }, // two points are no shape: dropped
      { k: 'curve', pts: [[0.5, 0.5]], c: '#ff0000' }, // one point is no curve: dropped
    ],
  }))!
  expect(p.mirror).toBe('x')
  expect(p.marks.map((m) => m.k)).toEqual(['fill', 'spray', 'curve', 'arc', 'arc'])
  const spray = p.marks[1]!
  expect([spray.n, spray.s]).toEqual([200, 0.05]) // held in range
  expect(p.marks[4]!.a0).toBe(0) // an angle it cannot read: the default
  expect(p.marks[4]!.a1).toBe(0.5)
  const scene = paintingScene(p, 44, 40)
  // every mark twice (the mirror), the spray as its specks; every number finite
  expect(scene.filter((s) => s.k === 'poly')).toHaveLength(2)
  expect(scene.filter((s) => s.k === 'arc')).toHaveLength(4)
  expect(scene.filter((s) => s.k === 'path')).toHaveLength(2)
  expect(scene.filter((s) => s.id.startsWith('paint1:'))).toHaveLength(200)
  expect(scene.find((s) => s.k === 'path')!.pts.length).toBeGreaterThan(20) // smoothed through its points
  for (const s of scene) for (const v of Object.values(s)) {
    if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true)
    if (Array.isArray(v)) for (const w of v.flat(2)) if (typeof w === 'number') expect(Number.isFinite(w)).toBe(true)
  }
  // and the raster draws it all: something lands on the canvas, nothing is NaN
  const r = createRaster(44, 40)
  r.draw(scene, 'dark')
  const px = toRGBA8(r)
  let lit = 0
  for (let i = 3; i < px.length; i += 4) if (px[i] > 0) lit++
  expect(lit).toBeGreaterThan(400)
  for (const v of r.px) expect(Number.isFinite(v)).toBe(true)
  // a spray is the same specks every time
  expect(JSON.stringify(paintingScene(p, 44, 40))).toBe(JSON.stringify(scene))
  // laid down mark by mark: part way through the spray, only some of its specks are down
  const part = paintingScene(p, 44, 40, { reveal: 1.5 / 5 })
  const specks = part.filter((s) => s.id.startsWith('paint1:')).length
  expect(specks).toBeGreaterThan(0)
  expect(specks).toBeLessThan(200)
})

test('the painter is told its whole vocabulary and its freedom', () => {
  const req = painterRequest({ facts: painterFacts(newTurnFacts(), { reason: 'answer', durationMs: 1000, mood: 'done', turn: 1 }) })
  for (const k of PAINT_KINDS) expect(req.prompt).toContain(`"k":"${k}"`)
  expect(req.prompt).toMatch(/mirror/)
  expect(req.prompt).toMatch(/any colour is yours/)
  expect(req.system).toMatch(/abstract or figurative/)
  expect(req.system).toMatch(/never settle into one habit/)
})

// ---------------------------------------------------------------- free paintings: hers, on her own rhythm
test('the free request: hers like the opening (the hour, the month, a word), the names of her last few, and nothing of the work', () => {
  const r = freeRequest({ hour: 6, month: 0, word: 'a kite', after: ['one', 'two "quoted"\nline', 'three', 'four'], shape: 'tall' })
  expect(r.system).toMatch(/one of Spark's free paintings/)
  expect(r.system).toMatch(/Answer with one JSON object and nothing else/)
  expect(r.prompt).toMatch(/it is dawn, in January\./)
  expect(r.prompt).toContain('"a kite"')
  expect(r.prompt).toContain('Her last 3 paintings were called "two quoted line", "three", "four"') // the last three, made plain
  expect(r.prompt).toContain('It is about twice as tall as wide; compose for that shape.')
  expect(r.prompt).toContain('"marks": [')
  expect(freeRequest({}).prompt).toMatch(/first of her free paintings/)
})

test('free paintings: no painting at the end of a turn, one on her rhythm while she can be seen, of nothing in the conversation; her ✦ tool and /spark paint work bring the work back', { options: { paintings: 'free', paintEvery: 0.005 } }, async ($, on) => {
  const { asks } = engine(on)
  on('ui.log', async () => loose({ value: undefined }))
  await cmd($, 'paint off')
  expect(await say($, 'paint')).toMatch(/painted her opening: /) // the first is still her opening
  expect(await say($, 'state')).toMatch(/paint on · free every 0\.005 min/)
  await turn($, 'f1', 30) // a turn ends: free paintings do not follow the work
  expect(asks).toHaveLength(1)
  await new Promise((r) => setTimeout(r, 400)) // her rhythm comes round (0.3 s here)
  let term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) }) // she is seen: she paints
  await term.unmount()
  for (let i = 0; i < 20 && asks.length < 2; i++) { await new Promise((r) => setTimeout(r, 10)); await settle() }
  expect(asks).toHaveLength(2)
  expect(asks[1]!.system).toMatch(/one of Spark's free paintings/)
  expect(asks[1]!.prompt).toContain('"a long climb, then light"') // seeded by her last
  expect(asks[1]!.prompt).not.toContain('tempo map') // never the work,
  expect(asks[1]!.prompt).not.toMatch(/toolCalls|"seconds"/) // nor its shape
  await settle()
  expect(await say($, 'story')).toMatch(/story: 2 paintings/)
  await cmd($, 'story next') // the second page: her free one
  term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  expect(await term.find({ type: 'Text', text: /^story · 2 of 2 .*· her own/ })).toBeDefined()
  await cmd($, 'story end')
  await term.unmount()
  term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  expect((await term.find({ key: 'spark-tool-way' }))?.props.label).toBe('✦ free')
  await term.press({ key: 'spark-tool-way' }) // a press: back to the work
  await settle()
  await term.unmount()
  expect(await say($, 'state')).not.toMatch(/· free/)
  const n = asks.length
  await turn($, 'f2', 30) // now the turn's end is painted, of the work
  for (let i = 0; i < 20 && asks.length <= n; i++) { await new Promise((r) => setTimeout(r, 10)); await settle() }
  expect(asks.length).toBe(n + 1)
  expect(asks[n]!.prompt).toContain('tempo map')
  term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  expect((await term.find({ key: 'spark-tool-way' }))?.props.label).toBe('◇ work')
  await term.unmount()
  expect(await say($, 'paint free')).toMatch(/^free paintings: every painting is hers.*painted one of her own: /) // and free again, one now
  await cmd($, 'paint work'); await cmd($, 'paint off')
})

test('free paintings with paintEvery 0: one of her own at the end of each turn instead of a rhythm', { options: { paintings: 'free', paintEvery: 0 } }, async ($, on) => {
  const { asks } = engine(on)
  await cmd($, 'paint off')
  await cmd($, 'paint') // her opening
  await new Promise((r) => setTimeout(r, 25)) // the 20 s between paintings on their own is the host clock's, mocked; this is only to settle
  await turn($, 'z1', 30)
  for (let i = 0; i < 20 && asks.length < 2; i++) { await new Promise((r) => setTimeout(r, 10)); await settle() }
  expect(asks.length).toBe(2)
  expect(asks[1]!.system).toMatch(/one of Spark's free paintings/)
  expect(asks[1]!.prompt).not.toContain('tempo map')
  await cmd($, 'paint off')
})
