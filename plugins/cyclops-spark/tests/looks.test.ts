// Looks: one expression, many ways of saying it. Every roll comes from a real event, is seeded by it, and never repeats
// the way just used; every way draws only while its expression is under way.
import { expect, test } from 'claude-code/testing'
import { buildScene, createPresence, LOOKS } from '../hooks/core.js'

type Ev = Record<string, unknown>
const mk = (...evs: Ev[]) => { const p = createPresence('spark'); for (const e of evs) p.apply(e); return p }
const walk = (p: ReturnType<typeof createPresence>, from: number, to: number, opts: Record<string, unknown> = {}) => { for (let t = from; t < to; t += 0.25) p.sample(t, opts) }
const turn = (t0: number, secs: number, reason = 'answer', extra: Ev[] = []): Ev[] => [
  { t: t0, type: 'turn.start' }, ...extra, { t: t0 + secs, type: 'turn.end', reason, durationMs: secs * 1000 },
]

// a spell of thinking or writing: a first chunk after quiet, then more chunks while it goes on
const spell = (t0: number, kind: string, n = 6): Ev[] => Array.from({ length: n }, (_, i) => ({ t: t0 + i * 0.2, type: 'stream', kind, n: 40 }))

test('looks: each real start of an expression rolls a way of saying it, never the same way twice in a row, the same for the same events', async () => {
  const evs: Ev[] = [{ t: 0, type: 'session.wake' }]
  for (let k = 0; k < 12; k++) evs.push(...spell(10 + k * 20, 'thinking'), ...spell(15 + k * 20, 'text'))
  const seen = { think: [] as number[], speak: [] as number[] }
  const p = createPresence('spark')
  for (const e of evs) { p.apply(e); const f = p.sample(Number(e.t)); seen.think.push(f.looks.think); seen.speak.push(f.looks.speak) }
  const changes = (xs: number[]) => xs.filter((v, i) => i > 0 && v !== xs[i - 1])
  // a roll only at the first chunk of a spell (12 spells each, the first from nothing said yet), each differing from the one before
  expect(changes(seen.think).length).toBe(12)
  expect(changes(seen.speak).length).toBe(12)
  expect(new Set(seen.think.filter((v) => v >= 0)).size).toBeGreaterThan(2) // more than one way really gets used
  // the same events say it the same way (the replay and tests are stable)
  const q = createPresence('spark')
  for (const e of evs) q.apply(e)
  expect(q.sample(300).looks).toEqual(p.sample(300).looks)
})

test('looks: time alone rolls nothing (no event, no new way of saying it)', async () => {
  const p = mk({ t: 0, type: 'session.wake' }, ...spell(5, 'thinking'))
  const before = p.sample(6).looks
  walk(p, 6, 400)
  expect(p.sample(400).looks).toEqual(before)
})

test('looks: every way of saying each expression draws something of its own while it is under way, and nothing after', async () => {
  const drawn = (p: ReturnType<typeof createPresence>, t: number) => buildScene(p.sample(t), 'panel').map((s: { id: string }) => s.id).join(' ')
  // thinking: lattice and pulse add their own figure
  for (let k = 0; k < 40; k++) {
    const p = mk({ t: 0, type: 'session.wake' }, ...Array.from({ length: k + 1 }, (_, i) => spell(10 + i * 20, 'thinking')).flat())
    const t = 10 + k * 20 + 1.1, look = p.sample(t).looks.think
    const ids = drawn(p, t)
    if (look === 2) expect(ids).toMatch(/node0/)
    if (look === 3) expect(ids).toMatch(/pulse0/)
    expect(drawn(p, t + 30)).not.toMatch(/node0|pulse0/) // the spell is over: nothing of it stays
  }
  // an answer landing: petals, halo or spiral (or the spring, which is the form itself)
  const lands = new Set<number>()
  for (let k = 0; k < 12; k++) {
    const p = mk(...Array.from({ length: k + 1 }, (_, i) => turn(i * 10, 4)).flat())
    const t = k * 10 + 4.3, look = p.sample(t).looks.land
    lands.add(look)
    const ids = drawn(p, t)
    if (look === 1) expect(ids).toMatch(/petal0/)
    if (look === 2) expect(ids).toMatch(/land0/)
    if (look === 3) expect(ids).toMatch(/spiral0/)
    expect(drawn(p, t + 5)).not.toMatch(/petal|land0|spiral/)
  }
  expect(lands.size).toBeGreaterThan(2)
  expect(LOOKS.land).toHaveLength(4)
  // an error as a crack is always the error red
  for (let k = 0; k < 8; k++) {
    const p = mk(...Array.from({ length: k + 1 }, (_, i) => turn(i * 10, 2, 'error')).flat())
    const f = p.sample(k * 10 + 2.1)
    const crack = buildScene(f, 'panel').find((s: { id: string }) => s.id === 'crack')
    if (f.looks.err === 2) expect(crack?.c).toEqual([0.95, 0.34, 0.36])
    else expect(crack).toBeUndefined()
  }
})

test('looks: a mend is said at the core too, only right after the call that knit it', async () => {
  for (let k = 0; k < 6; k++) {
    const evs: Ev[] = [{ t: 0, type: 'turn.start' }]
    for (let i = 0; i <= k; i++) evs.push({ t: 1 + i * 5, type: 'tool.start', tool: 'Bash', id: 'a' + i, input: { command: 'make' } }, { t: 1.5 + i * 5, type: 'tool.end', id: 'a' + i, error: true }, { t: 2 + i * 5, type: 'tool.start', tool: 'Bash', id: 'b' + i, input: { command: 'make' } }, { t: 3 + i * 5, type: 'tool.end', id: 'b' + i })
    const p = mk(...evs)
    const t = 3.4 + k * 5, look = p.sample(t).looks.mend
    const ids = buildScene(p.sample(t), 'panel').map((s: { id: string }) => s.id).join(' ')
    expect(ids).toMatch(look === 0 ? /knit/ : look === 1 ? /seed0/ : /close0/)
    expect(buildScene(p.sample(t + 3), 'panel').map((s: { id: string }) => s.id).join(' ')).not.toMatch(/knit|seed0|close0/)
  }
})

test('looks: before anything has been said one way or another, the form is whole (every point a real number)', async () => {
  for (const evs of [[], [{ t: 0, type: 'turn.start' }, { t: 1, type: 'turn.end', reason: 'answer', durationMs: 1000 }], [{ t: 0, type: 'tool.start', tool: 'Read', id: 'r', input: {} }]] as Ev[][]) {
    const p = mk(...evs)
    walk(p, 0, 2)
    const scene = buildScene(p.sample(2), 'panel')
    expect(scene.filter((s: { id: string }) => /^ten\d/.test(s.id))).toHaveLength(13)
    const nums = JSON.stringify(scene).match(/null|NaN/g)
    expect(nums).toBeNull()
  }
})

test('looks: first light always leaves its ring, whichever way it is said', async () => {
  for (let k = 0; k < 6; k++) {
    const p = mk(...Array.from({ length: k + 1 }, (_, i) => ({ t: i * 10, type: 'session.wake', fresh: true })))
    const ids = buildScene(p.sample(k * 10 + 0.6), 'panel').map((s: { id: string }) => s.id)
    expect(ids).toContain('firstlight')
    const look = p.sample(k * 10 + 0.6).looks.wake
    if (look > 0) expect(ids.some((id: string) => /^wake\d/.test(id))).toBe(true)
  }
})
