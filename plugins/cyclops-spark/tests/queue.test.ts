// What you send while Spark works: it waits at her edge, and when the model really takes it into the turn it travels in
// to her core. Both only from real events (the prompt typed mid-turn, the queued_command the engine appends).
import { expect, mock, test } from 'claude-code/testing'
import { buildScene, createPresence, LOOKS } from '../hooks/core.js'

type Ev = Record<string, unknown>
const loose = <T>(v: unknown) => v as T
const mk = (...evs: Ev[]) => { const p = createPresence('spark'); for (const e of evs) p.apply(e); return p }
const walk = (p: ReturnType<typeof createPresence>, from: number, to: number) => { for (let t = from; t < to; t += 0.1) p.sample(t) }
const ids = (p: ReturnType<typeof createPresence>, t: number) => buildScene(p.sample(t), 'panel').map((s: { id: string }) => s.id).join(' ')

test('a message sent mid-turn waits at her edge, one bead each, and says so', async () => {
  const p = mk({ t: 0, type: 'turn.start' }, { t: 1, type: 'prompt.queue' })
  let f = p.sample(1.5)
  expect(f.queue?.n).toBe(1)
  expect(f.hover).toMatch(/· your message is waiting/)
  expect(ids(p, 1.5)).toMatch(/qbead0/)
  p.apply({ t: 2, type: 'prompt.queue' })
  f = p.sample(2.5)
  expect(f.hover).toMatch(/· 2 messages waiting/)
  expect(ids(p, 2.5)).toMatch(/qbead1/)
})

test('taken in: the bead travels to her core and a ring draws inward; the hover says it, then lets go', async () => {
  const p = mk({ t: 0, type: 'turn.start' }, { t: 1, type: 'prompt.queue' }, { t: 3, type: 'prompt.take' })
  walk(p, 0, 3.3)
  let f = p.sample(3.3)
  expect(f.queue).toBeNull()
  expect(f.take?.u).toBeGreaterThan(0)
  expect(f.hover).toMatch(/· taking in your message/)
  expect(ids(p, 3.3)).toMatch(/qtake/)
  expect(ids(p, 4.5)).toMatch(/qin/) // the inward ring, once it has arrived
  walk(p, 3.3, 5.5)
  f = p.sample(5.5)
  expect(f.take).toBeNull()
  expect(f.hover).not.toMatch(/message/)
})

test('every way of taking it in draws finite geometry, and the ways are rolled, never the same twice in a row', async () => {
  const seen = new Set<number>()
  const p = mk({ t: 0, type: 'turn.start' })
  let last = -1
  for (let i = 0; i < 9; i++) {
    const t0 = 1 + i * 3
    p.apply({ t: t0, type: 'prompt.queue' }); p.apply({ t: t0 + 0.5, type: 'prompt.take' })
    for (let t = t0 + 0.5; t < t0 + 2; t += 0.1) {
      const f = p.sample(t)
      for (const s of buildScene(f, 'panel')) for (const v of Object.values(s)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true)
    }
    const look = p.sample(t0 + 0.6).looks.take
    expect(look).not.toBe(last)
    last = look
    seen.add(look)
  }
  expect(seen.size).toBe(LOOKS.take!.length)
})

test('what waited and was never taken in becomes the next turn\'s prompt: a new turn, or /clear, lets it go', async () => {
  const p = mk({ t: 0, type: 'turn.start' }, { t: 1, type: 'prompt.queue' }, { t: 2, type: 'turn.end', reason: 'answer', durationMs: 2000 }, { t: 2.1, type: 'turn.start' })
  expect(p.sample(2.2).queue).toBeNull()
  const q = mk({ t: 0, type: 'turn.start' }, { t: 1, type: 'prompt.queue' }, { t: 1.5, type: 'session.wake', fresh: true })
  expect(q.sample(1.6).queue).toBeNull()
  const idle = mk({ t: 1, type: 'prompt.queue' }) // nothing is running: nothing waits
  expect(idle.sample(1.2).queue).toBeNull()
})

test('wired to the real events: a prompt typed over a turn waits, and the queued_command the engine appends takes it in', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('prompt.submit', async (_$, e) => loose({ text: (e as { text: string }).text }))
  mock.session(on) // the kit keeps the rows the engine appends
  const state = async () => String((await $.command.run(loose({ command: 'spark', args: 'state', origin: { kind: 'person' }, presentation: {} }))).text ?? '')
  await $.turn.start(loose({ text: 'go', turnId: 'w1' }))
  await $.prompt.submit(loose({ text: 'also check the seek path', turnId: 'w1', wait: false, origin: { kind: 'person' } }))
  expect(await state()).toMatch(/· your message is waiting/)
  await $.session.append(loose({ message: { type: 'attachment', name: 'queued_command', content: [] }, door: 'attachment', origin: { kind: 'engine' }, uuid: 'u1' }))
  expect(await state()).toMatch(/· taking in your message/)
})

test('while she is plainly working, Spark says it in the chat spinner\'s own word', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on)
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  on('ui.render', { component: 'Spinner' }, async ($, e) => $.ui.resolve(e).Text({ children: [(e.props as { word: string }).word] }))
  const state = async () => String((await $.command.run(loose({ command: 'spark', args: 'state', origin: { kind: 'person' }, presentation: {} }))).text ?? '').split('\n')[0]
  await $.turn.start(loose({ text: 'go', turnId: 'p1' }))
  await $.tool.call(loose({ tool: 'Read', file_path: 'x', tool_use_id: 'r1' })).catch(() => undefined)
  await clock.advance(5000)
  const spin = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', component: 'Spinner', requestId: 'main', props: { word: 'Photosynthesizing', message: null, suffix: '…', mode: 'thinking' } })
  await spin.unmount()
  expect(await state()).toMatch(/^Spark · /) // read as drawn, and the spinner itself is drawn exactly as the engine would
  await $.turn.complete(loose({ reason: 'answer', answer: 'ok', durationMs: 6000, isAborted: false, turnId: 'p1' }))
  await clock.advance(5000)
  expect(await state()).not.toMatch(/Photosynthesizing/) // the turn is over: the word goes with it
})

test('the chat\'s word stands only for plain working: thinking, writing and her calls keep their own words, and the replay never borrows it', async () => {
  const p = mk({ t: 0, type: 'turn.start' }, { t: 1, type: 'stream', kind: 'text', n: 40 })
  expect(p.sample(10, { word: 'Processing' }).hover).toMatch(/^Spark · Processing$/)
  expect(p.sample(10, {}).hover).toMatch(/^Spark · working$/)
  p.apply({ t: 11, type: 'stream', kind: 'thinking', n: 40 })
  expect(p.sample(11.1, { word: 'Processing' }).hover).toMatch(/^Spark · thinking/)
  p.apply({ t: 12, type: 'tool.start', id: 'r', tool: 'Read', input: {} })
  expect(p.sample(12.1, { word: 'Processing' }).hover).toMatch(/^Spark · reading/)
  expect(p.sample(12.1, { word: 'Processing' }).glyph).toBe(p.sample(12.1, {}).glyph)
})
