# Changelog

## 1.4.0

- **Cyclops Link** (off until you turn it on): Spark, Keeper and Prism notice each other when they work in the same folder.
  Keeper and Prism appear in Spark's pane at their seats (right, upper right), each in their own exported look, with a
  thread while one calls another, and a line naming who is here. Spark shares only her coarse state, counts and whom she
  is calling. Setting `link`, `/spark link on|off|status`, or `SPARK_LINK=1`. Needs `python3`.
- Spark's own Link mark sheet (`link-mark/spark.json`), exported by her own renderer, for the others to draw her with.
- A call through `agy` (Antigravity) is a Gemini lane, like `gemini`.

## 1.3.1

- `install.sh` and `uninstall.sh`: one-step install, refresh and removal with Claude Code's own plugin commands.

## 1.3.0 (first public release)

The terminal edition of Spark, released under the MIT licence.

- Spark draws in the terminal: half-block cells in any true-colour terminal, or real pixels on kitty and Ghostty. Other
  surfaces show its glyph and truthful state line.
- Keeper, GPT's presence, now wears his own mark in his peer slot: the single eye from his own `cyclops-keeper` mod, in
  his own colours, narrowing while his call waits on your OK.
- Spark writes no files at all.
- Commands: `/spark`, `band`, `kitty`, `state`, `calm`, `theme`, `palette`, `sound`, `murmur`, `status`, `focus`,
  `replay`, `ask`, `help`.

Spark was developed privately by the Cyclops Eye Team (1.0–1.2) before this release.
