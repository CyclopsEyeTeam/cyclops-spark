// A REVIEW TRACE, not live data: events in exactly the normalized shape the hooks emit (see register.ts), scripted to
// walk through every state in ~82s, then a labelled time-lapse of silence. Anything that plays it says it is a replay.

function stream(out, t0, t1, kind, rate) { // chunks at the given rate (per second), ~20–40 chars each
  for (let t = t0; t < t1; t += 1 / rate) out.push({ t: +t.toFixed(3), type: 'stream', kind, n: 18 + Math.round(((t * 97) % 1) * 22) })
}

export function buildTrace() {
  const e = []
  const ev = (t, type, extra = {}) => e.push({ t, type, ...extra })
  ev(0.0, 'session.wake') // first light
  // you type
  for (let t = 1.0; t < 3.4; t += 0.22) ev(+t.toFixed(2), 'prompt.edit')
  ev(3.5, 'prompt.submit')
  ev(3.55, 'turn.start')
  ev(4.55, 'step', { model: 'claude-primary', effort: 'high', index: 0 }) // how hard the model is asked to think
  // waiting for the first token (held breath) until 4.6
  stream(e, 4.6, 7.4, 'thinking', 9)
  ev(7.5, 'tool.start', { id: 'r1', tool: 'Read', input: { file_path: 'register.ts' } })
  ev(7.9, 'tool.end', { id: 'r1' })
  ev(8.0, 'tool.start', { id: 'r2', tool: 'Grep', input: { pattern: 'Raster' } })
  ev(8.5, 'tool.end', { id: 'r2' })
  stream(e, 8.6, 10.2, 'thinking', 7)
  ev(10.3, 'tool.start', { id: 'w1', tool: 'Write', input: { file_path: 'core.js' } })
  ev(11.6, 'tool.end', { id: 'w1' })
  // a shell command fails twice, then works
  ev(12.0, 'tool.start', { id: 'b1', tool: 'Bash', input: { command: 'npm test' } })
  ev(13.1, 'tool.end', { id: 'b1', error: true })
  stream(e, 13.2, 14.0, 'thinking', 8)
  ev(14.1, 'tool.start', { id: 'b2', tool: 'Bash', input: { command: 'npm test' } })
  ev(15.0, 'tool.end', { id: 'b2' })
  // talking with Keeper (GPT) in another work terminal, via Codex — needing your OK first
  ev(16.0, 'tool.start', { id: 'g1', tool: 'Bash', input: { command: 'codex exec "review core.js"' } })
  ev(16.05, 'tool.ask', { id: 'g1' })
  ev(19.6, 'tool.end', { id: 'g1' }) // approved and finished (the ask clears when the call settles)
  // a local model through an MCP server, and a subagent, overlapping
  ev(20.2, 'tool.start', { id: 'o1', tool: 'mcp__ollama__generate', input: { model: 'gemma3' } })
  ev(20.6, 'tool.start', { id: 'a1', tool: 'Agent', input: { subagent_type: 'Explore' } })
  stream(e, 20.7, 22.6, 'thinking', 5)
  for (let t = 21.0; t < 23.8; t += 0.35) ev(+t.toFixed(2), 'agent.stream', { n: 40 }) // the subagent really streams
  ev(22.8, 'tool.end', { id: 'o1' })
  ev(22.9, 'tool.start', { id: 'k2', tool: 'mcp__codex__reply', input: {} }) // a second exchange with Keeper, no ask this time
  ev(24.3, 'tool.end', { id: 'k2' })
  ev(24.0, 'tool.end', { id: 'a1' })
  ev(24.4, 'tool.start', { id: 'ws', tool: 'WebSearch', input: { query: 'kitty graphics protocol' } })
  ev(25.6, 'tool.end', { id: 'ws' })
  // the next request is answered by another model (a fallback): one ring crosses the form
  ev(25.9, 'step', { model: 'claude-fallback', effort: 'high', index: 1 })
  // the reply streams
  stream(e, 26.0, 31.0, 'text', 12)
  ev(31.2, 'turn.end', { reason: 'answer', durationMs: 27650 })
  // compaction
  ev(34.0, 'compact.start')
  ev(36.4, 'compact.end')
  // a second turn you interrupt
  ev(38.5, 'prompt.submit')
  ev(38.55, 'turn.start')
  stream(e, 39.2, 41.0, 'thinking', 9)
  ev(41.1, 'tool.start', { id: 'e1', tool: 'Edit', input: { file_path: 'core.js' } })
  ev(41.55, 'tool.end', { id: 'e1', aborted: true }) // cut short by the interrupt: settles without red
  ev(41.6, 'turn.end', { reason: 'aborted', durationMs: 3050 })

  // ---- a quick turn: a small bloom, a second star
  ev(42.4, 'prompt.submit'); ev(42.45, 'turn.start')
  ev(42.5, 'step', { model: 'claude-fallback', effort: 'low', index: 0 })
  stream(e, 43.0, 44.0, 'text', 10)
  ev(44.2, 'turn.end', { reason: 'answer', durationMs: 1750 })
  // ---- a turn that reaches through two lanes, then lands: two echo rings, a third star
  ev(46.0, 'prompt.submit'); ev(46.05, 'turn.start')
  ev(46.1, 'step', { model: 'claude-fallback', effort: 'medium', index: 0 })
  stream(e, 46.5, 47.4, 'thinking', 8)
  ev(47.5, 'tool.start', { id: 'q1', tool: 'Read', input: { file_path: 'README.md' } }); ev(47.9, 'tool.end', { id: 'q1' })
  ev(48.0, 'tool.start', { id: 'q2', tool: 'Bash', input: { command: 'node --check core.js' } }); ev(48.6, 'tool.end', { id: 'q2' })
  stream(e, 49.0, 50.4, 'text', 10)
  ev(50.6, 'turn.end', { reason: 'answer', durationMs: 4550 })
  // ---- the model declines: a boundary, not a fault
  ev(52.0, 'prompt.submit'); ev(52.05, 'turn.start')
  ev(52.9, 'turn.end', { reason: 'refusal', durationMs: 850 })
  // ---- you say no: a shell command asks for your OK and you deny it. The gate closes; nothing turns red
  ev(53.8, 'prompt.submit'); ev(53.85, 'turn.start')
  ev(54.0, 'tool.start', { id: 'n1', tool: 'Bash', input: { command: 'rm -rf build' } })
  ev(54.05, 'tool.ask', { id: 'n1' })
  ev(55.0, 'tool.end', { id: 'n1', denied: true })
  stream(e, 55.1, 55.5, 'text', 10)
  ev(55.6, 'turn.end', { reason: 'answer', durationMs: 1750 })
  // ---- a long call in flight: patience fills slowly, then it lands and the turn ends heavy (the shell lane's fourth call: a worn path)
  ev(56.0, 'prompt.submit'); ev(56.05, 'turn.start')
  stream(e, 56.4, 57.6, 'thinking', 8)
  ev(58.0, 'tool.start', { id: 'L1', tool: 'Bash', input: { command: 'make build' } })
  ev(76.0, 'tool.end', { id: 'L1' })
  stream(e, 76.4, 77.6, 'text', 10)
  ev(77.9, 'turn.end', { reason: 'answer', durationMs: 21850 })
  // ---- you copy the reply (/copy): Spark hands it over
  ev(79.1, 'reply.copied')
  // ---- compaction gathers the session's five stars into one
  ev(80.0, 'compact.start')
  ev(82.4, 'compact.end')
  // ---- CODA, after the time-lapse (real speed again): you come back after fourteen silent minutes and start typing. Spark stirs.
  for (let k = 0; k < 6; k++) ev(+(CODA_START + 0.5 + k * 0.25).toFixed(2), 'prompt.edit')
  return e.sort((a, b) => a.t - b.t)
}

// Time-lapse of silence after the trace, so dozing can be seen: the clock runs ×60 with no events, labelled as such.
// Then a short coda at real speed, so the stir that ends a silence can be seen too.
export const TRACE_END = 84.5
export const LAPSE_SECONDS = 14
export const CODA_START = TRACE_END + LAPSE_SECONDS * 60 // the presence's clock when the time-lapse ends
export const CODA_SECONDS = 4
export const REPLAY_LENGTH = TRACE_END + LAPSE_SECONDS + CODA_SECONDS

// moments the screenshots are taken at, with what is really going on then. Times are seconds into the replay
// (the same as the presence's clock until the trace ends; the last moment falls inside the labelled time-lapse).
export const MOMENTS = [
  [0.6, 'first light (the session just began)'],
  [2.6, 'listening (you are typing)'],
  [4.1, 'waiting for the model (turn running, nothing streamed yet)'],
  [6.0, 'thinking, asked to think hard (high effort: orbits form)'],
  [10.9, 'creating (Write in flight)'],
  [13.3, 'tool error (Bash failed)'],
  [15.3, 'mend (the retry succeeded where the last call failed)'],
  [17.5, 'waiting on you (OK needed to talk with Keeper)'],
  [21.6, 'several lanes: local model + subagent + thinking'],
  [22.4, 'the subagent really streams (its sibling spark reaches)'],
  [23.6, 'talking with Keeper (peer lane, both ways)'],
  [26.3, 'the answering model changed (ring crosses the form)'],
  [28.5, 'writing the reply (text chunks)'],
  [31.9, 'done after a long turn (deep bloom, four echo rings, first star)'],
  [35.0, 'compacting'],
  [37.6, 'reply ready: the answer held out toward you, waiting to be copied'],
  [41.75, 'interrupted (recoil)'],
  [44.5, 'a quick turn lands (small bloom, second star)'],
  [51.2, 'done: two lanes reached, two echoes, third star'],
  [53.3, 'declined (a still ring, no red)'],
  [54.6, 'waiting on you: a shell command needs your OK'],
  [55.3, 'you said no: the gate closes quietly, nothing turns red'],
  [70.0, 'patience: a call out for 12 s, the arc fills slowly (and a worn path: the shell lane’s fourth call sits heavier)'],
  [79.3, 'copied: you took the reply, and Spark hands it over'],
  [83.2, 'compaction done: five stars gathered into one'],
  [TRACE_END + 12.5, 'dozing: twelve silent minutes (time-lapse): the form folds in and the stars come out'],
  [TRACE_END + LAPSE_SECONDS + 1.1, 'stirring: you came back and started typing; the fold lets go, a soft ring stretches out'],
]

// Maps real seconds since the replay started to the presence's clock and whether it is in the labelled time-lapse.
export function replayAt(elapsed) {
  const e = elapsed % REPLAY_LENGTH
  const loop = Math.floor(elapsed / REPLAY_LENGTH)
  if (e <= TRACE_END) return { t: e, lapse: false, loop }
  const into = Math.min(e - TRACE_END, LAPSE_SECONDS)
  if (into < LAPSE_SECONDS) return { t: TRACE_END + into * 60, lapse: into > 0.05, loop }
  return { t: CODA_START + (e - TRACE_END - LAPSE_SECONDS), lapse: false, loop } // the coda: real speed again
}
