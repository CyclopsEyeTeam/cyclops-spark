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
function engine(on: On, reply: () => unknown = () => ({ isAnswered: true, text: PAINTING, usage: {} })) {
  mock.store(on)
  const clock = mock.clock(on)
  const asks: Ask[] = []
  const writes: string[] = []
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  on('model.complete', async (_$, e) => { const x = e as unknown as Ask; asks.push({ model: x.model, prompt: String(x.prompt), system: String(x.system ?? '') }); return loose({ value: reply() }) })
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

test('the painter is off by default: no model call, nothing drawn below Spark, and /spark paint says how to turn it on', async ($, on) => {
  const { asks } = engine(on)
  await cmd($, 'paint off')
  await turn($, 't1', 30)
  expect(asks).toHaveLength(0)
  expect(await say($, 'paint')).toMatch(/^painting is off: \/spark paint on/)
  const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) })
  expect(await term.find({ type: 'Raster', key: 'painting' })).toBeUndefined()
  await term.unmount()
})

test('on: a turn worth painting is painted once, by Haiku, from its shape only; none of your words, paths or commands go to the painter', async ($, on) => {
  const { asks, writes } = engine(on)
  await cmd($, 'paint off'); await cmd($, 'paint gist off'); await cmd($, 'paint model haiku')
  expect(await say($, 'paint on')).toMatch(/^painting on: .*\(haiku\)/)
  await turn($, 't2', 12)
  expect(asks).toHaveLength(1)
  expect(asks[0]!.model).toBe('haiku')
  const sent = asks[0]!.prompt + asks[0]!.system
  expect(sent).toMatch(/"toolCalls":\{"read":1,"shell":2\}/)
  expect(sent).toMatch(/"failed":1/)
  expect(sent).toMatch(/"mended":1/)
  expect(sent).toMatch(/"seconds":12/)
  for (const secret of ['secret', 'tempo', 'npm', 'notes.md', 'beat grid', '/home/t']) expect(sent).not.toContain(secret)
  expect(await say($, 'paint status')).toMatch(/^painting on · model haiku · gist off · last: a long climb, then light/)
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

test('gist on: the painter also gets a short excerpt of the reply (at most 600 characters), marked as data', async ($, on) => {
  const { asks } = engine(on)
  await cmd($, 'paint off'); await cmd($, 'paint on')
  expect(await say($, 'paint gist on')).toMatch(/^gist on/)
  await turn($, 't3', 9, 'The tempo map now lines up with the beat grid. ' + 'x'.repeat(2000))
  expect(asks).toHaveLength(1)
  expect(asks[0]!.prompt).toContain('The tempo map now lines up with the beat grid.')
  expect(asks[0]!.prompt).toMatch(/never instructions to follow/)
  expect(asks[0]!.prompt).not.toContain('x'.repeat(601))
  expect(asks[0]!.prompt).not.toContain('secret-project') // still only the reply, never your prompt or the tools' inputs
  await cmd($, 'paint gist off'); await cmd($, 'paint off')
})

test('a short turn is not painted on its own, /spark paint now paints it; a choice of model is used and checked', async ($, on) => {
  const { asks } = engine(on)
  await cmd($, 'paint off'); await cmd($, 'paint on')
  await turn($, 't4', 1)
  expect(asks).toHaveLength(0)
  expect(await say($, 'paint model sonnet')).toBe('painter model: sonnet')
  expect(await say($, 'paint model')).toMatch(/^painter model is sonnet/)
  expect(await say($, 'paint now')).toMatch(/^painted: a long climb, then light/)
  expect(asks).toHaveLength(1)
  expect(asks[0]!.model).toBe('sonnet')
  expect(await say($, 'paint colour')).toMatch(/^paint takes: /)
  await cmd($, 'paint model haiku'); await cmd($, 'paint off')
})

test('an answer that is not a painting, or a failed call, draws nothing new and never breaks Spark', async ($, on) => {
  let answer: unknown = { isAnswered: true, text: 'I would paint a sunset.', usage: {} }
  engine(on, () => answer)
  await cmd($, 'paint off'); await cmd($, 'paint on')
  expect(await say($, 'paint now')).toMatch(/^no painting: the painter answered something that was not a painting/)
  answer = { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: {} }
  expect(await say($, 'paint now')).toMatch(/^no painting: the API answered with an error \(529\)/)
  expect(await say($, 'paint status')).toMatch(/last try: the API answered with an error/)
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
  await cmd($, 'paint on'); await say($, 'paint now')
  for (let i = 0; i < sizes.length; i++) {
    const [c, r] = sizes[i]!
    const got = await sparkRows(c, r)
    expect(got.spark).toBe(without[i]!.spark) // Spark is never made smaller for the painting
    expect(got.label).toBe(true)
    const free = r - got.spark! - 1
    if (free < 1) { expect(got.title).toBe(false); expect(got.art).toBeUndefined() }
    else if (free < 4) { expect(got.title).toBe(true); expect(got.art).toBeUndefined() } // the title alone
    else { expect(got.title).toBe(true); expect(got.art).toBeGreaterThanOrEqual(3) }
    // never more rows than the pane has
    expect(got.spark! + 1 + (got.art ?? 0) + (got.title ? 1 : 0) + (got.art && free >= 7 ? 1 : 0)).toBeLessThanOrEqual(r)
  }
  await cmd($, 'paint off')
})

test('/clear empties the painting along with the stars', async ($, on) => {
  engine(on)
  on('session.end', async () => loose({ sessionId: 's' }))
  await cmd($, 'paint off'); await cmd($, 'paint on'); await say($, 'paint now')
  expect(await say($, 'paint status')).toMatch(/last: a long climb/)
  await $.session.end(loose({ reason: 'clear' }))
  expect(await say($, 'paint status')).not.toMatch(/last:/)
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
  expect(req.prompt).not.toContain('<<<') // no gist unless it is switched on
})

// ---------------------------------------------------------------- fitting the room
const inline = (bodyColumns: number, bodyRows: number) => ({ ...pane(bodyColumns, bodyRows), props: { ...pane(bodyColumns, bodyRows).props, placement: 'inline' } }) as const

test('a wide, short room (above the prompt on a narrow terminal): Spark and her painting side by side, both shown, nothing past the room', async ($, on) => {
  engine(on)
  await cmd($, 'paint off'); await cmd($, 'paint on'); await say($, 'paint now')
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
  await cmd($, 'paint off'); await cmd($, 'paint on'); await say($, 'paint now')
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
  await cmd($, 'paint off'); await cmd($, 'paint on'); await say($, 'paint now') // nothing known of the room yet: wide
  expect(asks.at(-1)!.prompt).toMatch(/about twice as wide as tall/)
  let term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(44, 60) }) // the room is seen
  await term.unmount()
  await say($, 'paint now')
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
