// The painter as Spark's own lane, and how she answers her painting: both only from real events (the painter starting,
// a painting arriving), and the answer chosen by the painter in the same call, from moves she already has.
import { expect, test } from 'claude-code/testing'
import { buildScene, createPresence, PAINT_TOWARD, REACTIONS } from '../hooks/core.js'
import { parsePainting, painterRequest, painterFacts, newTurnFacts } from '../hooks/painter.js'

type Ev = Record<string, unknown>
const mk = (...evs: Ev[]) => { const p = createPresence('spark'); for (const e of evs) p.apply(e); return p }
const walk = (p: ReturnType<typeof createPresence>, from: number, to: number) => { for (let t = from; t < to; t += 0.25) p.sample(t) }
const ids = (p: ReturnType<typeof createPresence>, t: number) => buildScene(p.sample(t), 'panel').map((s: { id: string }) => s.id).join(' ')
const answered = (t0: number, secs: number): Ev[] => [{ t: t0, type: 'turn.start' }, { t: t0 + secs, type: 'turn.end', reason: 'answer', durationMs: secs * 1000 }]

test('the painter is a lane of hers: it reaches toward the canvas, below or beside, and reads as painting once the turn has landed', async () => {
  const p = mk(...answered(0, 5), { t: 5.1, type: 'paint.start', id: 'p1', toward: PAINT_TOWARD.below })
  walk(p, 5, 6)
  let f = p.sample(6)
  expect(f.mode).toBe('done') // the landing has its moment first
  walk(p, 6, 9)
  f = p.sample(9)
  const lane = f.lanes.find((l: { family: string }) => l.family === 'paint')
  expect(lane).toBeDefined()
  expect(lane.angle).toBe(PAINT_TOWARD.below)
  expect(lane.inflight).toBe(1)
  expect(f.mode).toBe('painting')
  expect(f.hover).toMatch(/^Spark · painting( ·|$)/)
  expect(f.hover).not.toMatch(/lane/)
  expect(f.glyph).toBe('✐')
  expect(ids(p, 9)).toMatch(/ln:paint:st/) // the brush tip laying its stroke
  // beside, in a wide short room
  const q = mk({ t: 0, type: 'paint.start', id: 'p', toward: PAINT_TOWARD.beside })
  expect(q.sample(0.5).lanes[0].angle).toBe(PAINT_TOWARD.beside)
})

test('it is not one of the turn\'s tools: no echo, no habit, a turn ending does not cut it short, and a turn\'s own call is named first', async () => {
  const p = mk({ t: 0, type: 'turn.start' }, { t: 0.5, type: 'paint.start', id: 'p1' }, { t: 1, type: 'tool.start', id: 'r', tool: 'Read', input: {} })
  expect(p.sample(1.2).mode).toBe('reading') // the turn's own call, not the painter
  p.apply({ t: 1.5, type: 'tool.end', id: 'r' })
  p.apply({ t: 3, type: 'turn.end', reason: 'answer', durationMs: 3000 })
  walk(p, 3, 7)
  const f = p.sample(7)
  expect(f.lanes.find((l: { family: string }) => l.family === 'paint').inflight).toBe(1) // still painting after the turn
  expect(f.mode).toBe('painting')
  const echoes = p.sample(3.6).echoes.length
  expect(echoes).toBeLessThanOrEqual(1) // only the Read lane echoes
})

test('a painting arriving is handed down the lane, and she answers it her own way; a failed one stays on the lane, she does not flinch', async () => {
  const p = mk({ t: 0, type: 'paint.start', id: 'p1' }, { t: 4, type: 'paint.end', id: 'p1', ok: true, react: 'ring' })
  walk(p, 0, 4.2)
  expect(ids(p, 4.2)).toMatch(/ln:paint:drop/)
  expect(p.sample(4.3).react).toBeNull() // the drop reaches the canvas first
  const f = p.sample(5.5)
  expect(f.react?.move).toBe('ring')
  expect(ids(p, 5.6)).toMatch(/react:ring/)
  walk(p, 5.6, 8)
  expect(p.sample(8).react).toBeNull() // and it passes
  expect(p.sample(8).mode).not.toBe('painting')

  for (const move of REACTIONS) {
    const r = mk({ t: 0, type: 'paint.start', id: 'p' }, { t: 1, type: 'paint.end', id: 'p', ok: true, react: move })
    walk(r, 0, 2.5)
    const g = r.sample(2.5)
    expect(g.react?.move).toBe(move)
    for (const s of buildScene(g, 'panel')) for (const v of Object.values(s)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true)
  }

  const odd = mk({ t: 0, type: 'paint.start', id: 'p' }, { t: 1, type: 'paint.end', id: 'p', ok: true, react: 'explode' })
  walk(odd, 0, 2.5)
  expect(odd.sample(2.5).react).toBeNull() // not one of hers: she simply lets it arrive

  const bad = mk({ t: 0, type: 'paint.start', id: 'p' }, { t: 1, type: 'paint.end', id: 'p', ok: false, react: 'ring' })
  walk(bad, 0, 1.3)
  const b = bad.sample(1.3)
  expect(b.e.err).toBe(0) // the painting failed, not the work: Spark herself shows no error
  expect(b.react).toBeNull()
  expect(b.lanes[0].errAge).toBeLessThan(1)
})

test('/clear forgets the painter lane and any answer still to come', async () => {
  const p = mk({ t: 0, type: 'paint.start', id: 'p' }, { t: 1, type: 'paint.end', id: 'p', ok: true, react: 'bloom' }, { t: 1.2, type: 'session.wake', fresh: true })
  walk(p, 1.2, 2.5)
  const f = p.sample(2.5)
  expect(f.lanes).toHaveLength(0)
  expect(f.react).toBeNull()
})

test('the painter chooses her answer in the same call: offered her moves, and only those are kept', async () => {
  const req = painterRequest({ facts: painterFacts(newTurnFacts(), { reason: 'answer', durationMs: 1000, mood: 'done', turn: 1 }) })
  for (const move of REACTIONS) expect(req.prompt).toContain(move)
  const marks = [{ k: 'dot', x: 0.5, y: 0.5, r: 0.1, c: '#ffffff' }]
  expect(parsePainting(JSON.stringify({ title: 'x', spark: 'lean', marks }))?.react).toBe('lean')
  expect(parsePainting(JSON.stringify({ title: 'x', spark: 'dance wildly', marks }))?.react).toBeNull()
  expect(parsePainting(JSON.stringify({ title: 'x', marks }))?.react).toBeNull()
})
