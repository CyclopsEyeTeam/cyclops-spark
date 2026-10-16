// Long pixel work, a stretch at a time. All of Spark's hooks share one worker with the engine, which sends it a
// heartbeat and replaces it (and unloads the plugin that held it, /spark and all, until it reloads) when one goes
// unanswered: a hook spinning without yielding. So every large loop here is a generator that yields after each row
// (or column) it finishes: run whole (`drain`) for a small picture or a test, or a stretch at a time (`drainAsync`),
// awaiting `pause` whenever about `every` ms have gone.
export function drain(g) { let r = g.next(); while (!r.done) r = g.next(); return r.value }
export async function drainAsync(g, pause, every = 20) {
  let since = Date.now(), r = g.next()
  while (!r.done) {
    if (Date.now() - since > every) { await pause(); since = Date.now() }
    r = g.next()
  }
  return r.value
}
