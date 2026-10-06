# Privacy and data

**Spark writes no files and makes no network request of its own.** The test
*Spark writes nothing anywhere, whatever the environment says* checks this.

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

The `userConfig` options (palette, theme, calm, sound, chimeAfterSeconds, statusLine, murmur, band) are stored by Claude
Code as plugin settings. None of them is personal data.

## Processes

When sound is on in a Linux terminal, Spark runs `uname -s` and `which pw-play|paplay|aplay` once, then the player with a
file inside the plugin. Nothing else is executed.
