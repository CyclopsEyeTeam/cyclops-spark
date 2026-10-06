# Privacy and data

**Spark writes no files and makes no network request of its own.** The test
*Spark writes nothing anywhere, whatever the environment says* checks this. The single exception is Cyclops Link, and only
while you have it on (below).

## In memory only (gone when Claude Code exits)

- The last 12 event lines, for `/spark state`. They name event kinds and tool names, never what was said.
- The current exchange: your latest prompt and the reply streaming to it (at most 400 000 characters), used only so
  `/spark focus` can keep that exchange on screen.
- The core's state: energies, lanes (keyed by tool family, MCP server or model name), calls still out, per-lane call
  counts and this session's stars.
- A side question's text, while it is in flight to `$.model.fork`.

To classify a lane, Spark reads a call's command, model, URL or subagent type in memory. It keeps only the lane's key
and label (for example `shell`, `gemma3`, `Keeper`), never the command or its arguments.

## Model use

Only `/spark ask`, which you type yourself, uses the model: one tool-less `$.model.fork` over this session's own
transcript, through Claude Code's own API connection. Nothing is added to the conversation.

## Settings

The `userConfig` options (palette, theme, calm, sound, chimeAfterSeconds, statusLine, murmur, band, link) are stored by
Claude Code as plugin settings. None of them is personal data.

## Processes

When sound is on in a Linux terminal, Spark runs `uname -s` and `which pw-play|paplay|aplay` once, then the player with a
file inside the plugin. While Cyclops Link is on, Spark runs `python3 link/spark_link.py` from the plugin for as long as
Link stays on. Nothing else is executed.

## Cyclops Link (off unless you turn it on)

While it is on:

- Spark starts her helper with two things only: this session's id and its project folder. The helper turns them into two
  salted, one-way 16-character ids (an instance and a room) with a random salt kept in the Link directory. Neither the
  session id nor the folder is written anywhere.
- Spark writes her coarse facts to a private file the helper made (`$XDG_STATE_HOME/cyclops-spark/<instance>.facts`, in a
  0700 directory): `{"state", "tools", "branches", "reaching"}`. Nothing else is in it, and it is deleted when the helper
  stops.
- The helper publishes one record, `$XDG_STATE_HOME/cyclops-link/spark-<instance>.json` (0600, in a 0700 directory):
  Cyclops Link V1's eleven fields, exactly: version, presence, host, instance, room, state, counts, `reaching`, the time,
  and whether it ended. `reaching` names only a presence class (`keeper`, `prism`) while a call to it is in flight; Spark
  knows that from her own lanes (a call naming codex/keeper, or gemini/agy), and never passes on the command.
- It reads the other presences' records in the same directory, refusing anything not owned by you, writable by others,
  linked, oversized or malformed.
- When Link goes off or Claude Code closes, the record says so (`ended`) and is removed a minute later.
- No network, no messages, no commands between presences: only these small files on your own machine.
