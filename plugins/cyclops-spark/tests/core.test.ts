// The state machine and scene builder, without a host: every expression must come from a real event, and the
// vocabulary this release added (stars, mend, patience, echoes, depth, halt, wake, dozing…) must behave as the mapping says.
import { expect, test } from 'claude-code/testing'
import { buildScene, createPresence, glyph, laneFor, MAPPING, PALETTE_NAMES } from '../hooks/core.js'
import { createRaster, toRGBA8 } from '../hooks/render-raster.js'
import { buildTrace, CODA_START, LAPSE_SECONDS, MOMENTS, REPLAY_LENGTH, replayAt, TRACE_END } from '../hooks/trace.js'

type Ev = Record<string, unknown>
const mk = (...evs: Ev[]) => { const p = createPresence('spark'); for (const e of evs) p.apply(e); return p }
// step the presence the way the real 20 fps loop does, so lanes retract and spin integrates
const walk = (p: ReturnType<typeof createPresence>, from: number, to: number, opts: Record<string, unknown> = {}) => { for (let t = from; t < to; t += 0.25) p.sample(t, opts) }
const ids = (p: ReturnType<typeof createPresence>, t: number, opts: Record<string, unknown> = {}) => buildScene(p.sample(t, opts), 'panel').map((s: { id: string }) => s.id)
const turn = (t0: number, secs: number, reason = 'answer', extra: Ev[] = []): Ev[] => [
  { t: t0, type: 'turn.start' }, ...extra, { t: t0 + secs, type: 'turn.end', reason, durationMs: secs * 1000 },
]

test('no event, no expression: an untouched Spark claims nothing', async () => {
  const p = mk()
  walk(p, 0, 30)
  const f = p.sample(30)
  expect([f.e.think, f.e.speak, f.e.tool, f.e.err, f.e.mend]).toEqual([0, 0, 0, 0, 0])
  expect(f.lanes).toHaveLength(0)
  expect(f.stars).toHaveLength(0)
  expect(f.echoes).toHaveLength(0)
  expect(f.mode).toBe('idle')
  const scene = ids(p, 30).join(' ')
  expect(scene).not.toMatch(/star|echo|orbit|halt|shift|firstlight|ln:/)
})

test('with ambient off a scene is a pure function of its events and the time', async () => {
  const p = mk(...turn(0, 3, 'answer', [{ t: 1, type: 'stream', kind: 'text', n: 40 }]))
  walk(p, 0, 5, { ambient: false })
  const a = JSON.stringify(buildScene(p.sample(5, { ambient: false }), 'panel'))
  const b = JSON.stringify(buildScene(p.sample(5, { ambient: false }), 'panel'))
  expect(a).toBe(b)
})

test('first light: a session wake rings once, reads as waking, then settles to idle', async () => {
  const p = mk({ t: 0, type: 'session.wake' })
  expect(p.sample(0.5).mode).toBe('waking')
  expect(ids(p, 0.6)).toContain('firstlight')
  walk(p, 0.6, 3)
  expect(p.sample(3.2).mode).toBe('idle')
  expect(ids(p, 3.3)).not.toContain('firstlight')
})

test('constellation: one star per answered turn; interrupted, errored and refused turns leave none', async () => {
  const p = mk(...turn(0, 4), ...turn(10, 2, 'aborted'), ...turn(20, 3), ...turn(30, 1, 'error'), ...turn(40, 1, 'refusal'), ...turn(50, 9), { t: 60, type: 'reply.copied' })
  walk(p, 0, 55)
  const f = p.sample(70)
  expect(f.stars).toHaveLength(3)
  expect(f.turns).toBe(3)
  expect(f.hover).toMatch(/idle · 3 turns$/)
  expect(ids(p, 70).filter((i: string) => /^star/.test(i))).toHaveLength(3)
  // a heavier (longer) turn is a heavier star
  expect(f.stars[2].w).toBeGreaterThan(f.stars[0].w - 1) // weights are real numbers in [0,1]
  expect(f.stars.every((s: { w: number }) => s.w >= 0 && s.w <= 1)).toBe(true)
})

test('compaction gathers the stars into one brighter star and keeps the count; /clear empties them', async () => {
  const p = mk(...turn(0, 4), ...turn(10, 4), ...turn(20, 4), { t: 30, type: 'compact.start' }, { t: 31, type: 'compact.end' })
  walk(p, 0, 31)
  const mid = p.sample(31.5)
  expect(mid.condense).not.toBeNull()
  expect(ids(p, 31.8).some((i: string) => /^cs\d/.test(i))).toBe(true) // old stars still travelling in
  walk(p, 31.8, 40)
  const after = p.sample(40)
  expect(after.stars).toHaveLength(1)
  expect(after.stars[0].merged).toBe(true)
  expect(after.turns).toBe(3)
  p.apply({ t: 50, type: 'session.wake', fresh: true })
  const cleared = p.sample(50.1)
  expect(cleared.stars).toHaveLength(0)
  expect(cleared.turns).toBe(0)
  // a compaction with a single star has nothing to gather
  const one = mk(...turn(0, 4), { t: 10, type: 'compact.start' }, { t: 11, type: 'compact.end' })
  expect(one.sample(12).condense).toBeNull()
})

test('mend: a clean call after a failed one on the same lane knits; a clean call alone does not', async () => {
  const bash = (id: string, t: number, error = false) => [{ t, type: 'tool.start', id, tool: 'Bash', input: { command: 'npm test' } }, { t: t + 0.4, type: 'tool.end', id, error }]
  const mended = mk({ t: 0, type: 'turn.start' }, ...bash('a', 1, true), ...bash('b', 3))
  walk(mended, 0, 3.6)
  expect(mended.sample(3.7).e.mend).toBeGreaterThan(0.3)
  expect(ids(mended, 3.7)).toContain('ln:shell:mr')
  const plain = mk({ t: 0, type: 'turn.start' }, ...bash('a', 1))
  walk(plain, 0, 1.6)
  expect(plain.sample(1.7).e.mend).toBe(0)
  expect(ids(plain, 1.7)).not.toContain('ln:shell:mr')
  // a different lane succeeding does not mend the failed one
  const other = mk({ t: 0, type: 'turn.start' }, ...bash('a', 1, true), { t: 3, type: 'tool.start', id: 'r', tool: 'Read' }, { t: 3.3, type: 'tool.end', id: 'r' })
  walk(other, 0, 3.4)
  expect(other.sample(3.5).e.mend).toBe(0)
})

test('a lane that keeps failing stays warm with it, and one clean call cools it', async () => {
  const fail = (id: string, t: number) => [{ t, type: 'tool.start', id, tool: 'Bash', input: { command: 'x' } }, { t: t + 0.3, type: 'tool.end', id, error: true }]
  const p = mk({ t: 0, type: 'turn.start' }, ...fail('a', 1), ...fail('b', 2), ...fail('c', 3))
  walk(p, 0, 6)
  expect(p.sample(6.1).lanes[0].fail).toBe(3)
  const warm = p.sample(6.2).lanes[0].colour
  expect(warm.r).toBeGreaterThan(warm.b) // still leaning red long after the last error pulse faded
  p.apply({ t: 7, type: 'tool.start', id: 'd', tool: 'Bash', input: { command: 'x' } })
  p.apply({ t: 7.4, type: 'tool.end', id: 'd' })
  expect(p.sample(7.5).lanes[0].fail).toBe(0)
})

test('patience: a call still out fills an arc from its real elapsed time, and finishes with it', async () => {
  const p = mk({ t: 0, type: 'turn.start' }, { t: 1, type: 'tool.start', id: 'L', tool: 'Bash', input: { command: 'make' } })
  walk(p, 0, 2)
  expect(ids(p, 2.2)).not.toContain('ln:shell:pat') // out for ~1 s: nothing to show yet
  walk(p, 2.2, 14)
  const f = p.sample(14)
  expect(Math.round(f.lanes[0].age)).toBe(13)
  expect(f.lanes[0].patience).toBeGreaterThan(0.3)
  expect(f.lanes[0].patience).toBeLessThan(0.6) // fills ever more slowly, never a countdown to something
  expect(ids(p, 14)).toContain('ln:shell:pat')
  expect(ids(p, 14)).not.toContain('ln:shell:pat2')
  walk(p, 14, 40)
  expect(ids(p, 40)).toContain('ln:shell:pat2') // a very long wait earns a second, fainter orbit
  p.apply({ t: 41, type: 'tool.end', id: 'L' })
  expect(ids(p, 41.1)).not.toContain('ln:shell:pat')
})

test('how a turn ends: a refusal is a boundary (no red), an error is red, an interruption is only a recoil', async () => {
  const end = (reason: string) => { const p = mk(...turn(0, 2, reason)); walk(p, 0, 2.2); return p.sample(2.4) }
  const refused = end('refusal'), errored = end('error'), aborted = end('aborted')
  expect(refused.mode).toBe('declined')
  expect(refused.halt).toBeGreaterThan(0.5)
  expect(refused.e.err).toBe(0)
  expect(refused.recoil).toBe(0)
  expect(refused.bloom).toBe(0)
  expect(errored.mode).toBe('stopped on an error')
  expect(errored.e.err).toBeGreaterThan(0.3)
  expect(errored.recoil).toBeGreaterThan(0.3)
  expect(aborted.mode).toBe('interrupted')
  expect(aborted.e.err).toBe(0)
  expect(aborted.recoil).toBeGreaterThan(0.3)
  expect(aborted.halt).toBe(0)
  const p = mk(...turn(0, 2, 'refusal'))
  walk(p, 0, 2.2)
  expect(ids(p, 2.4)).toEqual(expect.arrayContaining(['halt', 'halt2']))
})

test('a long turn lands deeper and longer than a quick one, and each lane it reached leaves an echo (max four)', async () => {
  const quick = mk(...turn(0, 1)); walk(quick, 0, 1.2)
  const long = mk(...turn(0, 100)); walk(long, 0, 100.2)
  expect(long.sample(100.7).bloom).toBeGreaterThan(quick.sample(1.7).bloom * 1.5)
  expect(long.sample(100.7).bloom).toBeGreaterThan(0.5)
  const use = (tools: Array<[string, Record<string, unknown>?]>) => {
    const evs: Ev[] = [{ t: 0, type: 'turn.start' }]
    tools.forEach(([tool, input], i) => evs.push({ t: 1 + i, type: 'tool.start', id: 'u' + i, tool, input }, { t: 1.4 + i, type: 'tool.end', id: 'u' + i }))
    evs.push({ t: 20, type: 'turn.end', reason: 'answer', durationMs: 20000 })
    const p = mk(...evs); walk(p, 0, 20.2); return p
  }
  const echoesAt = (p: ReturnType<typeof createPresence>) => { let most = 0; for (let t = 20.3; t < 23; t += 0.1) most = Math.max(most, p.sample(t).echoes.length); return most }
  expect(echoesAt(use([['Read'], ['Grep'], ['Glob']]))).toBe(1) // three tools, one lane
  expect(echoesAt(use([['Read'], ['Write'], ['Bash', { command: 'ls' }]]))).toBe(3)
  expect(echoesAt(use([['Read'], ['Write'], ['Bash', { command: 'ls' }], ['WebSearch'], ['mcp__a__b'], ['Agent', { subagent_type: 'Explore' }]]))).toBe(4)
  expect(echoesAt(mk(...turn(0, 20)))).toBe(0) // answered with no tools: just the bloom
})

test('effort: the harder the model is asked to think, the more orbits form while it thinks', async () => {
  const think = (effort?: unknown) => {
    const p = mk({ t: 0, type: 'turn.start' }, ...(effort === undefined ? [] : [{ t: 0.2, type: 'step', effort, model: 'm' }]))
    for (let t = 0.5; t < 3; t += 0.15) p.apply({ t, type: 'stream', kind: 'thinking', n: 40 })
    walk(p, 0, 3); return ids(p, 3.1).filter((i: string) => /^orbit\d/.test(i)).length
  }
  expect(think()).toBe(0)
  expect(think('low')).toBeGreaterThan(0)
  expect(think('max')).toBe(4)
  expect(think('max')).toBeGreaterThan(think('low'))
  // no thinking, no orbits, whatever the effort was
  const idle = mk({ t: 0, type: 'step', effort: 'max', model: 'm' }); walk(idle, 0, 5)
  expect(ids(idle, 5).filter((i: string) => /^orbit\d/.test(i))).toHaveLength(0)
  expect(mk({ t: 0, type: 'turn.start' }, { t: 0.1, type: 'step', effort: 'high', model: 'm' }, ...[1, 2, 3, 4, 5, 6].map((k) => ({ t: 0.3 + k * 0.1, type: 'stream', kind: 'thinking', n: 40 }))).sample(1.2).hover).toMatch(/thinking · high effort/)
})

test('a changed model rings once; the same model again does not', async () => {
  const same = mk({ t: 0, type: 'step', model: 'a' }, { t: 5, type: 'step', model: 'a' })
  expect(same.sample(5.1).shift).toBe(0)
  const changed = mk({ t: 0, type: 'step', model: 'a' }, { t: 5, type: 'step', model: 'b' })
  expect(changed.sample(5.1).shift).toBeGreaterThan(0.8)
  expect(ids(changed, 5.2)).toContain('shift')
  expect(changed.sample(12).shift).toBeLessThan(0.02)
})

test('silence deepens: resting after two minutes, dozing after ten, and the stars come out while it dozes', async () => {
  const p = mk(...turn(0, 4), ...turn(10, 4), { t: 15, type: 'reply.copied' }) // you took the reply: nothing is held out
  walk(p, 0, 15)
  const brightness = (t: number) => buildScene(p.sample(t), 'panel').filter((s: { id: string }) => /^star/.test(s.id)).reduce((n: number, s: { a: number }) => n + s.a, 0)
  const at = (t: number) => p.sample(t)
  expect(at(60).mode).toBe('idle')
  expect(at(160).mode).toBe('resting')
  expect(at(760).mode).toBe('dozing')
  expect(at(760).hover).toMatch(/dozing · 2 turns$/)
  expect(brightness(760)).toBeGreaterThan(brightness(60))
  // any real event ends it at once as a fact (the mode is no longer dozing), but the body lets go over about a second
  p.apply({ t: 800, type: 'prompt.edit' })
  expect(at(800.1).mode).toBe('stirring')
  expect(at(800.1).deep).toBeGreaterThan(0.8)
  expect(at(800.1).stir).toBeGreaterThan(0.8)
  expect(ids(p, 800.2)).toContain('stir')
  expect(at(801.0).deep).toBeLessThan(at(800.1).deep)
  expect(at(806).deep).toBeLessThan(0.01)
  expect(at(806).stir).toBeLessThan(0.01)
  expect(ids(p, 806)).not.toContain('stir')
})

test('stirring: a short pause earns no stir, a long one does, and typing after it reads stirring then listening', async () => {
  const quick = mk(...turn(0, 2), { t: 30, type: 'prompt.edit' })
  expect(quick.sample(30.1).stir).toBe(0)
  expect(quick.sample(30.1).mode).toBe('listening')
  expect(ids(quick, 30.1)).not.toContain('stir')
  const long = mk(...turn(0, 2), { t: 2.5, type: 'reply.copied' })
  walk(long, 0, 200)
  expect(long.sample(200).mode).toBe('resting')
  for (let t = 200; t < 203; t += 0.3) long.apply({ t, type: 'prompt.edit' })
  expect(long.sample(200.4).mode).toBe('stirring')
  expect(long.sample(203.5).mode).toBe('listening') // the stir has let go; now it leans to the prompt
  // a session wake is its own first light, never a stir
  const woke = mk(...turn(0, 2), { t: 900, type: 'session.wake', fresh: true })
  expect(woke.sample(900.2).stir).toBe(0)
  expect(woke.sample(900.2).mode).toBe('waking')
})

test('you said no: a denied call closes its gate quietly — no red, no failure counted, no mend when the next call works', async () => {
  const p = mk({ t: 0, type: 'turn.start' }, { t: 1, type: 'tool.start', id: 'n', tool: 'Bash', input: { command: 'rm -rf build' } }, { t: 1.05, type: 'tool.ask', id: 'n' })
  expect(p.sample(1.5).mode).toBe('waiting on you')
  p.apply({ t: 2, type: 'tool.end', id: 'n', denied: true })
  const f = p.sample(2.2)
  expect(f.e.err).toBe(0)
  expect(f.lanes[0].fail).toBe(0)
  expect(f.ask).toBe(false)
  expect(ids(p, 2.2)).toContain('ln:shell:shut')
  expect(ids(p, 2.2)).not.toContain('ln:shell:gate')
  expect(ids(p, 3.5)).not.toContain('ln:shell:shut')
  const warm = f.lanes[0].colour
  expect(warm.r).toBeLessThan(warm.g + warm.b) // not leaning red
  p.apply({ t: 4, type: 'tool.start', id: 'ok', tool: 'Bash', input: { command: 'ls' } })
  p.apply({ t: 4.3, type: 'tool.end', id: 'ok' })
  expect(p.sample(4.4).e.mend).toBe(0)
})

test('worn paths: a lane used often this session reaches quicker and sits heavier; /clear forgets the habit', async () => {
  const width = (p: ReturnType<typeof createPresence>, t: number) => (buildScene(p.sample(t), 'panel').find((s: { id: string }) => s.id === 'lf:read') as { w: number }).w
  const once = mk({ t: 0, type: 'turn.start' }, { t: 1, type: 'tool.start', id: 'a', tool: 'Read' })
  const often = mk({ t: 0, type: 'turn.start' })
  for (let k = 0; k < 12; k++) { often.apply({ t: 1 + k * 10, type: 'tool.start', id: 'r' + k, tool: 'Read' }); often.apply({ t: 1.2 + k * 10, type: 'tool.end', id: 'r' + k }) }
  walk(often, 0, 120) // the lane has retracted and been reborn many times; the count outlives the lane
  often.apply({ t: 121, type: 'tool.start', id: 'last', tool: 'Read' })
  expect(often.sample(121.2).lanes[0].calls).toBe(13)
  expect(often.sample(121.2).lanes[0].worn).toBeGreaterThan(0.8)
  expect(once.sample(1.2).lanes[0].worn).toBe(0)
  expect(often.sample(121.15).lanes[0].reach).toBeGreaterThan(once.sample(1.15).lanes[0].reach) // quicker out
  expect(width(often, 121.5)).toBeGreaterThan(width(once, 1.5) * 1.4)
  // a habit is never brightness: the filament's alpha is the same
  const alpha = (p: ReturnType<typeof createPresence>, t: number) => (buildScene(p.sample(t), 'panel').find((s: { id: string }) => s.id === 'lf:read') as { a: number }).a
  expect(Math.abs(alpha(often, 121.5) - alpha(once, 1.5))).toBeLessThan(0.01)
  often.apply({ t: 130, type: 'session.wake', fresh: true })
  often.apply({ t: 131, type: 'turn.start' }); often.apply({ t: 132, type: 'tool.start', id: 'z', tool: 'Read' })
  expect(often.sample(132.2).lanes[0].worn).toBe(0)
})

test('a subagent that really streams makes its sibling spark beat; with none out, the stream changes nothing', async () => {
  const p = mk({ t: 0, type: 'turn.start' }, { t: 1, type: 'tool.start', id: 'a', tool: 'Agent', input: { subagent_type: 'Explore' } })
  walk(p, 0, 2)
  expect(p.sample(2.1).lanes[0].beat).toBe(0)
  p.apply({ t: 2.2, type: 'agent.stream', n: 60 })
  expect(p.sample(2.25).lanes[0].beat).toBeGreaterThan(0.3)
  expect(p.sample(8).lanes[0].beat).toBeLessThan(0.01)
  const none = mk({ t: 0, type: 'turn.start' }, { t: 1, type: 'agent.stream', n: 60 })
  expect(none.sample(1.1).e.speak).toBe(0)
  expect(none.sample(1.1).e.think).toBe(0)
})

test('palettes change the mood of colour, never what error looks like', async () => {
  expect(PALETTE_NAMES).toEqual(['spark', 'aurora', 'ember', 'moon'])
  const bodies = new Set<string>()
  for (const palette of PALETTE_NAMES) {
    const p = mk({ t: 0, type: 'turn.start' })
    for (const k of [1, 2, 3]) {
      p.apply({ t: k * 0.5, type: 'tool.start', id: 'x' + k, tool: 'Bash', input: { command: 'x' } })
      p.apply({ t: k * 0.5 + 0.2, type: 'tool.end', id: 'x' + k, error: true })
    }
    walk(p, 0, 2.2)
    const f = p.sample(2.2, { palette })
    expect(f.colours.body.r).toBeGreaterThan(f.colours.body.g)
    expect(f.colours.body.r).toBeGreaterThan(f.colours.body.b)
    expect(f.lanes[0].colour.r).toBeGreaterThan(f.lanes[0].colour.b)
    const calm = mk(...turn(0, 1)); walk(calm, 0, 10)
    bodies.add(JSON.stringify(calm.sample(10, { palette }).colours.body))
  }
  expect(bodies.size).toBe(4)
  // an unknown palette falls back to spark rather than failing
  const a = mk(), b = mk()
  expect(JSON.stringify(a.sample(1, { palette: 'nonsense' }).colours.body)).toBe(JSON.stringify(b.sample(1, { palette: 'spark' }).colours.body))
})

test('every state has a glyph and the same truth as its hover line', async () => {
  const modes = ['idle', 'listening', 'resting', 'dozing', 'waking', 'stirring', 'waiting on you', 'waiting for the model', 'thinking', 'writing', 'compacting', 'done', 'interrupted', 'declined', 'stopped on an error', 'reply ready', 'copied', 'working', 'reading', 'creating', 'running', 'searching', 'using', 'consulting', 'talking', 'delegating', 'planning']
  for (const m of modes) expect(glyph(m).length).toBeGreaterThan(0)
  expect(glyph('some mode nobody has named yet')).toBe('✧')
  const p = mk({ t: 0, type: 'turn.start' }, { t: 1, type: 'tool.start', id: 'a', tool: 'Read' })
  expect(p.sample(1.2).glyph).toBe(glyph('reading'))
})

test('every lane family is still reached the way it was, and every mapping row is complete', async () => {
  expect(laneFor('Bash', { command: 'codex exec "x"' }).family).toBe('peer')
  expect(laneFor('mcp__ollama__generate', { model: 'gemma3' }).family).toBe('model')
  expect(laneFor('Agent', { subagent_type: 'Plan' }).label).toBe('Plan agent')
  expect(MAPPING.length).toBeGreaterThanOrEqual(30)
  for (const row of MAPPING) { expect(row).toHaveLength(4); expect(row.every((c) => c.length > 3)).toBe(true) }
})

test('the replay is honest: sorted, every call settles, every labelled moment says what its hover line says, and it loops', async () => {
  const trace = buildTrace()
  expect(trace.every((e, i) => i === 0 || e.t >= trace[i - 1]!.t)).toBe(true)
  const open = new Set<string>()
  for (const e of trace) { if (e.type === 'tool.start') open.add(String(e.id)); if (e.type === 'tool.end') open.delete(String(e.id)) }
  expect([...open]).toEqual([])
  // every event is in the trace proper, or in the coda after the time-lapse (never inside the lapse itself)
  expect(trace.every((e) => e.t <= TRACE_END || e.t >= CODA_START)).toBe(true)
  expect(trace.some((e) => e.t >= CODA_START)).toBe(true)
  const want: Array<[number, RegExp]> = [[0.6, /waking/], [2.6, /listening/], [6.0, /thinking · high effort/], [17.5, /waiting on you/], [53.3, /declined/], [54.6, /waiting on you · shell lane/], [37.6, /reply ready/], [79.3, /copied/], [83.2, /idle · 5 turns/]]
  const p = createPresence('spark'); let i = 0
  const seen = new Map<number, string>()
  for (let t = 0; t <= 84; t += 0.1) { const tt = +t.toFixed(2); while (i < trace.length && trace[i]!.t <= tt) p.apply(trace[i++]!); const f = p.sample(tt); for (const [mt] of want) if (Math.abs(mt - tt) < 0.051) seen.set(mt, f.hover) }
  for (const [mt, re] of want) expect(seen.get(mt) ?? '').toMatch(re)
  expect(MOMENTS.length).toBeGreaterThanOrEqual(20)
  // time-lapse reaches dozing, never before the trace is over
  expect(replayAt(10).lapse).toBe(false)
  const lapse = replayAt(TRACE_END + 8)
  expect(lapse.lapse).toBe(true)
  expect(lapse.t).toBeGreaterThan(TRACE_END + 400)
  expect(replayAt(REPLAY_LENGTH + 5).loop).toBe(1)
  const end = p.sample(TRACE_END + 14 * 60)
  expect(end.mode).toBe('dozing')
  // the coda runs at real speed after the lapse, and the stir in it really shows: dozing → stirring → listening
  const coda = replayAt(TRACE_END + LAPSE_SECONDS + 1.1)
  expect(coda.lapse).toBe(false)
  expect(Math.abs(coda.t - (CODA_START + 1.1))).toBeLessThan(1e-6)
  while (i < trace.length && trace[i]!.t <= coda.t) p.apply(trace[i++]!)
  expect(p.sample(coda.t).mode).toBe('stirring')
  expect(p.sample(CODA_START + 3.5).mode).toBe('listening')
})

test('an interrupt that cuts a call short settles it without red, without counting a failure, and without a mend', async () => {
  const p = mk({ t: 0, type: 'turn.start' }, { t: 1, type: 'tool.start', id: 'e', tool: 'Edit', input: {} }, { t: 2, type: 'tool.end', id: 'e', aborted: true })
  expect(p.sample(2.1).e.err).toBe(0)
  expect(p.sample(2.1).lanes[0].fail).toBe(0)
  expect(p.sample(2.1).lanes[0].inflight).toBe(0)
  // and it does not hide a real earlier failure: that lane is still failing until a call actually succeeds
  const q = mk({ t: 0, type: 'turn.start' }, { t: 1, type: 'tool.start', id: 'a', tool: 'Bash', input: { command: 'x' } }, { t: 2, type: 'tool.end', id: 'a', error: true },
    { t: 3, type: 'tool.start', id: 'b', tool: 'Bash', input: { command: 'x' } }, { t: 3.5, type: 'tool.end', id: 'b', aborted: true })
  expect(q.sample(3.6).lanes[0].fail).toBe(1)
  expect(q.sample(3.6).e.mend).toBe(0)
})

test('a /clear right after a turn ends starts clean: nothing from the old conversation lingers over the wake', async () => {
  const p = mk(...turn(0, 2, 'refusal'), { t: 1, type: 'tool.start', id: 'z', tool: 'Read' })
  p.apply({ t: 2.5, type: 'session.wake', fresh: true })
  const f = p.sample(2.6)
  expect(f.mode).toBe('waking')
  expect(f.lanes).toHaveLength(0)
  expect(f.halt).toBe(0)
  expect(f.stars).toHaveLength(0)
})

test('reply ready: an answered turn is held out toward you until you act, and never appears without one', async () => {
  // nothing held without an ending: a wake, typing, a turn still running
  const none = mk({ t: 0, type: 'session.wake' }, { t: 3, type: 'prompt.edit' }, { t: 4, type: 'turn.start' }, { t: 5, type: 'stream', kind: 'text', n: 400 })
  expect(none.sample(6).offer).toBe(null)
  expect(ids(none, 6).join(' ')).not.toMatch(/ready|handoff/)
  // an answer: done first (the bloom has its moment), then reply ready, and it is still there an hour later, through dozing
  const p = mk(...turn(0, 4, 'answer', [{ t: 1, type: 'stream', kind: 'text', n: 900 }]))
  expect(p.sample(4.5).mode).toBe('done')
  expect(p.sample(8).mode).toBe('reply ready')
  expect(ids(p, 8)).toContain('ready')
  expect(p.sample(8).glyph).toBe('◆')
  expect(p.sample(4 + 240).hover).toBe('Spark · reply ready · waiting 4 min')
  const late = p.sample(4 + 3600)
  expect(late.deep).toBeGreaterThan(0.5)
  expect(late.mode).toBe('reply ready')
  expect(late.hover).toBe('Spark · reply ready · waiting 1 h')
  // coming back and typing stirs it, then it listens, and still holds the reply out
  for (let t = 3605; t < 3608; t += 0.3) p.apply({ t, type: 'prompt.edit' })
  expect(p.sample(3605.2).mode).toBe('stirring')
  expect(p.sample(3608.5).mode).toBe('listening')
  expect(p.sample(3608.5).offer).not.toBe(null)
  expect(ids(p, 3608.5)).toContain('ready')
  // a new prompt lets it go: you moved on
  p.apply({ t: 3609, type: 'prompt.submit' })
  expect(p.sample(3609.1).offer).toBe(null)
})

test('the bead is the size of what the turn really wrote', async () => {
  const small = mk(...turn(0, 2, 'answer', [{ t: 1, type: 'stream', kind: 'text', n: 30 }]))
  const big = mk(...turn(0, 2, 'answer', [{ t: 1, type: 'stream', kind: 'text', n: 9000 }]))
  const thinkingOnly = mk(...turn(0, 2, 'answer', [{ t: 1, type: 'stream', kind: 'thinking', n: 9000 }]))
  const r = (p: ReturnType<typeof createPresence>) => buildScene(p.sample(6), 'panel').find((s: { id: string }) => s.id === 'ready').r
  expect(r(big)).toBeGreaterThan(r(small) * 1.4)
  expect(r(thinkingOnly)).toBeLessThan(r(small) * 1.01) // thinking is not the reply
})

test('copied: a copy hands the reply over once, and a copy with nothing held out is only a quiet ring', async () => {
  const p = mk(...turn(0, 4, 'answer', [{ t: 1, type: 'stream', kind: 'text', n: 900 }]))
  p.sample(8)
  p.apply({ t: 10, type: 'reply.copied' })
  const f = p.sample(10.3)
  expect(f.offer).toBe(null)
  expect(f.mode).toBe('copied')
  expect(f.glyph).toBe('◇')
  expect(ids(p, 10.3)).toContain('handoff')
  expect(ids(p, 10.3)).not.toContain('ready')
  expect(p.sample(13).mode).toBe('idle')
  expect(ids(p, 13).join(' ')).not.toMatch(/ready|handoff/)
  // a second copy: nothing was held, so no bead travels
  p.apply({ t: 20, type: 'reply.copied' })
  const again = ids(p, 20.3)
  expect(again).toContain('handoffring')
  expect(again).not.toContain('handoff')
  // copying during a running turn (the previous reply) does not end that turn's own reply later
  const q = mk(...turn(0, 2, 'answer'), { t: 5, type: 'turn.start' }, { t: 6, type: 'reply.copied' }, { t: 9, type: 'turn.end', reason: 'answer', durationMs: 4000 })
  expect(q.sample(13).mode).toBe('reply ready')
})

test('an error or a refusal is held as a hollow ring; an interrupt holds nothing; /clear lets go', async () => {
  const e = mk(...turn(0, 2, 'error'))
  expect(e.sample(6).mode).toBe('stopped on an error')
  expect(e.sample(6).offer.kind).toBe('error')
  expect(e.sample(2 + 300).hover).toBe('Spark · stopped on an error · 5 min')
  const r = mk(...turn(0, 2, 'refusal'))
  expect(r.sample(6).mode).toBe('declined')
  const a = mk(...turn(0, 2, 'aborted'))
  expect(a.sample(6).offer).toBe(null)
  expect(a.sample(6).mode).toBe('idle')
  const c = mk(...turn(0, 2, 'answer'), { t: 3, type: 'session.wake', fresh: true })
  expect(c.sample(3.1).offer).toBe(null)
})

test('a side question is a satellite while it is out and a soft ring when its answer comes; none without one', async () => {
  const none = mk({ t: 0, type: 'session.wake' }, ...turn(1, 3))
  expect(ids(none, 6).join(' ')).not.toMatch(/side/)
  const p = mk({ t: 0, type: 'session.wake' }, { t: 1, type: 'turn.start' }, { t: 2, type: 'side.ask', id: 'q1' })
  const f = p.sample(4)
  expect(f.side.n).toBe(1)
  expect(f.hover).toMatch(/answering your side question$/)
  expect(ids(p, 4)).toContain('side')
  // the work goes on: the side question changes nothing about it
  expect(f.mode).toBe('waiting for the model')
  p.apply({ t: 6, type: 'side.answer', id: 'q1', ok: true })
  expect(p.sample(6.2).side).toBe(null)
  expect(ids(p, 6.3)).toContain('sidedone')
  expect(ids(p, 8).join(' ')).not.toMatch(/side/)
  // an answer for a question never asked draws nothing
  p.apply({ t: 9, type: 'side.answer', id: 'nope' })
  expect(ids(p, 9.2).join(' ')).not.toMatch(/side/)
})

test('a long session forgets settled calls: only calls still out are held, and a second end for the same call changes nothing', async () => {
  const p = mk({ t: 0, type: 'turn.start' })
  for (let i = 0; i < 5000; i++) {
    p.apply({ t: 1 + i * 0.01, type: 'tool.start', id: 'c' + i, tool: 'Read', input: {} })
    p.apply({ t: 1.005 + i * 0.01, type: 'tool.end', id: 'c' + i, error: false })
  }
  expect(p.pendingCalls).toBe(0)
  p.apply({ t: 60, type: 'tool.start', id: 'x', tool: 'Bash', input: { command: 'ls' } })
  expect(p.pendingCalls).toBe(1)
  p.apply({ t: 61, type: 'tool.end', id: 'x', error: true })
  const fail = p.sample(61.1).lanes.find((l: { family: string }) => l.family === 'shell').fail
  p.apply({ t: 61.2, type: 'tool.end', id: 'x', error: true }) // a repeated end is not a second failure
  expect(p.sample(61.3).lanes.find((l: { family: string }) => l.family === 'shell').fail).toBe(fail)
  expect(p.pendingCalls).toBe(0)
})

test('a turn that has started but not streamed draws no thinking motion: only the held breath, until a real chunk arrives', async () => {
  const p = mk({ t: 0, type: 'session.wake' }, { t: 5, type: 'prompt.submit' }, { t: 5, type: 'turn.start' }, { t: 5.1, type: 'step', effort: 'max', model: 'm' })
  const f = p.sample(9)
  expect(f.e.think).toBe(0)
  expect(f.e.speak).toBe(0)
  expect(ids(p, 9).join(' ')).not.toMatch(/orbit|\bm\d/)
  p.apply({ t: 9.1, type: 'stream', kind: 'thinking', n: 40 })
  expect(p.sample(9.2).e.think).toBeGreaterThan(0)
  expect(ids(p, 9.2).join(' ')).toMatch(/orbit/)
})

test('Keeper wears his own eye in his slot: his colours, only while his lane is out, narrower while he waits on you', async () => {
  const lavender = (p: ReturnType<typeof createPresence>, t: number) => {
    const r = createRaster(240, 240); r.draw(buildScene(p.sample(t, { theme: 'dark' }), 'panel'), 'dark')
    const px = toRGBA8(r); let n = 0
    for (let i = 0; i < px.length; i += 4) if (px[i + 3]! > 200 && Math.abs(px[i]! - 196) < 26 && Math.abs(px[i + 1]! - 169) < 26 && Math.abs(px[i + 2]! - 226) < 26) n++
    return n
  }
  const none = mk({ t: 0, type: 'turn.start' }, { t: 1, type: 'tool.start', id: 'r', tool: 'Read', input: {} })
  expect(lavender(none, 1.6)).toBe(0) // no Keeper lane, no Keeper
  const p = mk({ t: 0, type: 'turn.start' }, { t: 1, type: 'tool.start', id: 'k', tool: 'Bash', input: { command: 'codex exec "hello"' } })
  const slot = buildScene(p.sample(1.6), 'panel').find((s: { k: string }) => s.k === 'slot')
  expect(slot?.who).toBe('keeper')
  expect(lavender(p, 1.6)).toBeGreaterThan(10) // his rim, in his own lavender
})
