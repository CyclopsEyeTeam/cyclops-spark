import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

// Spark's feed for Cyclops Studio (One Spark): written only inside Studio, in the format Studio's strict reader
// (studio/presence_feeds.py) accepts, from the moment the session starts, and ended when it ends.

const loose = <T>(v: unknown) => v as T
const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve() }
const DIR = '/home/t/.state/cyclops-presence/pane-7/spark'
const STUDIO = { HOME: '/home/t', XDG_STATE_HOME: '/home/t/.state', CYCLOPS_STUDIO: '1', CYCLOPS_SESSION_ID: 'pane-7' }

function feedEngine(on: On, files = new Map<string, { text: string; mtimeMs: number }>()) {
  mock.store(on)
  const clock = mock.clock(on)
  const writes: Array<{ path: string; text: string }> = []
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  on('fs.write', async (_$, e) => { const x = e as { path: string; text: string }; writes.push({ path: String(x.path), text: String(x.text) }); return loose({ value: undefined }) })
  on('fs.stat', async (_$, e) => { const f = files.get((e as { path: string }).path); if (!f) throw new Error('ENOENT'); return loose({ value: { mtimeMs: f.mtimeMs, size: f.text.length, isFile: true } }) })
  on('fs.read', async (_$, e) => { const f = files.get((e as { path: string }).path); if (!f) throw new Error('ENOENT'); return loose({ value: f.text }) })
  on('tool.call', async () => loose({ result: 'ok' }))
  on('config.list', async () => loose({ value: [] }))
  on('command.register', async () => loose({ value: undefined }))
  on('session.start', async () => loose({ cwd: '/' }))
  on('session.end', async () => loose({ sessionId: 's' }))
  return { clock, writes, files }
}
const start = ($: Engine) => $.session.start(loose({ cwd: '/', surface: 'terminal', isInteractive: true }))
const last = (writes: Array<{ path: string; text: string }>, name: string) => {
  const w = writes.filter((x) => x.path === `${DIR}/${name}`).at(-1)
  return w ? JSON.parse(w.text) : undefined
}

// what Studio's reader requires of a feed part (presence_feeds.py: _read, read, _public_event); a part that fails any of
// these makes Studio drop the whole feed
function strictlyReadable(part: Record<string, unknown>, live: boolean) {
  expect(part.v).toBe(1)
  expect(typeof part.run).toBe('string')
  expect(/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$/.test(String(part.run))).toBe(true)
  expect(Number.isInteger(part.seq) && (part.seq as number) >= 0).toBe(true)
  expect(Array.isArray(part.events) && (part.events as unknown[]).length <= 20000).toBe(true)
  expect(part.caps).toEqual(['feed.v1', 'notes.v1', 'side.v1']) // never band.v1: Spark does not publish a band
  if (live) {
    expect(typeof part.aliveAt).toBe('number')
    expect(Math.abs(Date.now() / 1000 - (part.aliveAt as number))).toBeLessThan(5)
    expect(typeof part.ended).toBe('boolean')
  }
  const now = Date.now() / 1000
  for (const ev of part.events as Array<Record<string, unknown>>) {
    expect(Number.isInteger(ev.seq) && (ev.seq as number) > 0 && (ev.seq as number) <= (part.seq as number)).toBe(true)
    expect(typeof ev.t === 'number' && (ev.t as number) >= 0 && (ev.t as number) <= now + 0.001).toBe(true)
    expect(Math.round((ev.t as number) * 1000) / 1000).toBe(ev.t) // to the millisecond
    expect(/^[a-z][a-z.]{0,63}$/.test(String(ev.type))).toBe(true)
  }
}

test('outside Studio Spark writes nothing, whatever else the environment says', async ($, on) => {
  const { clock, writes } = feedEngine(on)
  mock.env(on, { HOME: '/home/t', XDG_STATE_HOME: '/home/t/.state', CYCLOPS_SESSION_ID: 'pane-7' }) // no CYCLOPS_STUDIO=1
  await start($)
  await $.turn.start(loose({ text: 'go', turnId: 'o1' })); await $.turn.complete(loose({ reason: 'answer', answer: '', durationMs: 2000, isAborted: false, turnId: 'o1' }))
  await clock.advance(6000)
  expect(writes).toEqual([])
})

test('in Studio with an id that is not a plain name, Spark writes nothing', async ($, on) => {
  const { clock, writes } = feedEngine(on)
  mock.env(on, { ...STUDIO, CYCLOPS_SESSION_ID: '../escape' })
  await start($)
  await clock.advance(6000)
  expect(writes).toEqual([])
})

test('in Studio she connects at launch: live.json with a new run and her wake as the session starts, before any prompt', async ($, on) => {
  const { writes } = feedEngine(on)
  mock.env(on, STUDIO)
  await start($)
  await settle()
  const live = last(writes, 'live.json'), durable = last(writes, 'durable.json')
  expect(live).toBeDefined()
  expect(durable).toBeDefined()
  strictlyReadable(live, true); strictlyReadable(durable, false)
  expect(live.ended).toBe(false)
  expect(live.events.map((e: { type: string }) => e.type)).toContain('session.wake')
  expect(durable.run).toBe(live.run)
  expect(writes.every((w) => w.path.startsWith(DIR + '/'))).toBe(true) // only in her own folder
})

test('in Studio: a turn is in the feed as kinds and counts only, a call as its lane; streams stay live; a heartbeat keeps her alive; the end says ended', async ($, on) => {
  const { clock, writes } = feedEngine(on)
  mock.env(on, STUDIO)
  on('turn.step', async function* (_$, e) {
    yield loose<never>({ kind: 'thinking', text: 'the secret plan is to', index: 0 })
    yield loose<never>({ kind: 'text', text: 'Here is the secret answer.', index: 0 })
    return loose({ turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null })
  })
  await start($)
  await $.turn.start(loose({ text: 'please fix the secret-project', turnId: 'f1' }))
  for await (const _ of $.turn.step(loose({ turnId: 'f1', index: 0, model: 'm', messageCount: 1, effort: 'high' }))) { /* through */ }
  await $.tool.call(loose({ tool: 'Bash', command: 'npm test --secret-flag https://secret.example', tool_use_id: 'toolu_secret_1' }))
  await $.turn.complete(loose({ reason: 'answer', answer: 'Here is the secret answer.', durationMs: 4000, isAborted: false, turnId: 'f1' }))
  await clock.advance(1200); await settle()
  const live = last(writes, 'live.json'), durable = last(writes, 'durable.json')
  strictlyReadable(live, true); strictlyReadable(durable, false)
  const types = (p: { events: Array<{ type: string }> }) => p.events.map((e) => e.type)
  for (const t of ['session.wake', 'turn.start', 'step', 'tool.start', 'tool.end', 'turn.end']) expect(types(durable)).toContain(t)
  expect(types(durable)).not.toContain('stream') // the high-rate ones live only in live.json
  expect(types(live)).toContain('stream')
  const call = durable.events.find((e: { type: string }) => e.type === 'tool.start')
  expect(call.lane).toEqual({ key: 'shell', family: 'shell', label: 'shell', how: 'tool name' })
  expect(call.input).toBeUndefined()
  expect(call.id).toMatch(/^c[0-9a-f]{8}$/) // the host's id only as a short hash
  expect(writes.some((w) => /secret/.test(w.text))).toBe(false) // no prompt, reply, thinking, command, URL or id
  // the seq counts up by one, the same events in both files
  const seqs = live.events.map((e: { seq: number }) => e.seq)
  expect(seqs).toEqual(seqs.slice().sort((a: number, b: number) => a - b))
  // nothing happening: a heartbeat within 5 s keeps her alive
  const before = writes.filter((w) => w.path.endsWith('live.json')).length
  await clock.advance(5200); await settle()
  expect(writes.filter((w) => w.path.endsWith('live.json')).length).toBeGreaterThan(before)
  // the session ends: ended at once, and what Studio offered from this session is emptied
  await $.session.end(loose({ reason: 'other' }))
  await settle()
  expect(last(writes, 'live.json').ended).toBe(true)
  expect(last(writes, 'side.json')).toEqual({ v: 1, run: live.run, answers: [] })
  expect(last(writes, 'notes.json')).toEqual({ v: 1, run: live.run, notes: [] })
})

test('in Studio: live.json at most 5 times a second while things happen, durable.json at most once', async ($, on) => {
  const { clock, writes } = feedEngine(on)
  mock.env(on, STUDIO)
  on('turn.step', async function* (_$, e) {
    for (let i = 0; i < 50; i++) {
      yield loose<never>({ kind: 'text', text: 'word ', index: 0 })
      if (i % 10 === 0) await $.tool.call(loose({ tool: 'Read', file_path: '/x', tool_use_id: 'r' + i }))
      await clock.advance(20)
    }
    return loose({ turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null })
  })
  await start($)
  await settle()
  const live0 = writes.filter((w) => w.path.endsWith('live.json')).length, durable0 = writes.filter((w) => w.path.endsWith('durable.json')).length
  await $.turn.start(loose({ text: 'go', turnId: 'b1' }))
  for await (const _ of $.turn.step(loose({ turnId: 'b1', index: 0, model: 'm', messageCount: 1 }))) { /* a busy second of streaming, and a call or two */ }
  await settle()
  expect(writes.filter((w) => w.path.endsWith('live.json')).length - live0).toBeLessThanOrEqual(6)
  expect(writes.filter((w) => w.path.endsWith('live.json')).length - live0).toBeGreaterThanOrEqual(3) // and it did write as things happened
  expect(writes.filter((w) => w.path.endsWith('durable.json')).length - durable0).toBeLessThanOrEqual(2)
  strictlyReadable(last(writes, 'live.json'), true)
})

test('in Studio: a side question asked from Studio is answered on the side into side.json; the feed says only that it happened', async ($, on) => {
  const files = new Map<string, { text: string; mtimeMs: number }>()
  const { clock, writes } = feedEngine(on, files)
  mock.env(on, STUDIO)
  const forks: string[] = []
  on('model.fork', async (_$, e) => { forks.push(String((e as { prompt: string }).prompt)); return loose({ value: { isAnswered: true, text: ' It lives in core.js. ', usage: {} } }) })
  await start($)
  await settle()
  files.set('/home/t/.state/cyclops-presence/pane-7/studio.json', { text: JSON.stringify({ v: 1, ask: { id: 'ask-1', t: +(Date.now() / 1000).toFixed(3), text: 'where is the cache?' } }), mtimeMs: 5 })
  await clock.advance(1500); await settle(); await settle()
  expect(forks).toHaveLength(1)
  expect(forks[0]).toContain('where is the cache?')
  expect(last(writes, 'side.json')?.answers).toEqual([expect.objectContaining({ id: 'ask-1', ok: true, text: 'It lives in core.js.' })])
  await clock.advance(1200); await settle()
  const durable = last(writes, 'durable.json')
  expect(durable.events.map((e: { type: string }) => e.type)).toEqual(expect.arrayContaining(['side.ask', 'side.answer']))
  expect(writes.filter((w) => !w.path.endsWith('side.json')).some((w) => /cache|core\.js/.test(w.text))).toBe(false) // never in the feed
})
