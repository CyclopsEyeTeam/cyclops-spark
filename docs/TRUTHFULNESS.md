# The truthfulness contract

Spark keeps three kinds of motion apart, on purpose:

| Kind | What it is | What it may claim |
| --- | --- | --- |
| **Event** | state that exists only because a host event said so: a stream chunk, a tool call, a permission ask | exactly that event |
| **Transition** | the eased path between two event states: a lane growing out, a bloom fading after a turn lands | nothing new |
| **Ambient** | breathing (5.5 s ±3.5 %), a 90 s drift, sway, star twinkle | nothing. Damped while waiting, off under `/spark calm` |

Nothing starts, stops or speeds up "thinking", "tools" or "saving" on a timer. `MAPPING` in
`plugins/cyclops-spark/hooks/core.js` is the full table: each row names the host event, the state it sets and what is
drawn. The unit tests check expressions against their events, including that they are absent without them.

| Claim | How it stays true |
| --- | --- |
| thinking / speaking | only while thinking or text chunks of the main loop really stream |
| tool activity | a lane exists only between a real tool call starting and settling, plus a 4 s retract |
| waiting on you | only while a real permission ask is open; a denial is a boundary, never drawn as a failure |
| success | a bloom only on an answered turn; a mend only after a clean result on a lane that really failed; a copy only when `/copy` says it copied |
| collaboration | a model or Keeper lane comes only from a real call that names it (an MCP server name, or a `codex` / `ollama` / … command) |
| time | a patience arc is the call's real elapsed time, never a countdown; "waiting N min" is real time since the turn ended |
| the replay | `/spark replay` is its own labelled Spark, never live data, and never moves the live one |
