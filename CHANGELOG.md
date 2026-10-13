# Changelog

## 1.5.1

- The side pane fits whatever room it has, on every resize. Above the prompt on a small terminal (a wide, short room),
  Spark and her painting sit side by side, so the painting shows there too. In a tall side pane they stack.
- Nothing is cut short any more: Spark's state line, the Link line and the painting's title wrap instead of ending in
  an ellipsis, and their rows are counted before anything is drawn, so nothing is pushed out of the pane. They are drawn
  at full brightness (the title in italics) so they read well at full screen.
- The painting takes the shape of its room: wide in a short room, square, or tall in a tall side pane, and the painter
  is told that shape (and its size) so it composes for it. A painting keeps its shape after a resize: it is fitted and
  centred, never stretched.

## 1.5.0

- **The painter** (off until you turn it on): a small sub-agent paints Spark's expression of each turn in the room below
  her side pane, with a few words of hers under it. It is one short, tool-less model call per painting through your own
  session (Haiku by default; the `paintModel` setting or `/spark paint model <name>` picks another), at most one every
  20 seconds, and only for turns of 3 seconds or more; `/spark paint now` makes one any time. It sees only the turn's
  shape: how long it ran, which kinds of tools and how many, failures, denials, mends, how much was thought and written,
  how it ended. Never your words, paths, commands or tool names. The `paintGist` setting (or `/spark paint gist on`) also
  gives it a short excerpt (at most 600 characters) of each reply, so a painting can echo the subject. What comes back is
  a small paint program, checked and clamped, drawn by Spark's own renderer and laid down mark by mark. Nothing is written
  anywhere; `/clear` empties it with the stars.
- The painting only ever takes rows Spark is not using: she and her label never get smaller for it. With a little room it
  shows only its title; with none it waits. Not in focus, the top strip or the replay.
- **Many ways of saying it.** Each time an expression really begins, Spark rolls which way she says it this time:
  thinking (coil, tide, lattice, pulse), writing (currents, fountain, ripples, flares), an answer landing (spring,
  petals, halo, spiral), an error (recoil, shiver, crack), a mend (knit, seeds, close), first light (ring, unfurl, rays)
  and each call going out (reach, flare, spark). Still the same expression, never invented: a roll happens only at the
  real event that starts it, is seeded by that event (the same session, and the replay, always say it the same way), and
  never repeats the way just used. All of it is in `MAPPING`.

## 1.4.4

- Spark takes far less of the screen. `/spark side` (and a bare `/spark`) opens a slim pane: about a quarter of the
  terminal, 30 to 44 columns, beside the conversation, or 10 rows above the prompt on a narrow terminal. Her label always
  fits under the drawing.
- `/spark top`: a short strip above the prompt instead (at most 5 rows, Spark and her state line side by side), with no
  pane at all. Choosing one puts the other away. `/spark band` still works as another name for it.
- `/spark focus` is gentler: Spark gets a large pane (about 60% of the width, always leaving 40 columns) beside the
  conversation, which is no longer hidden, so the work keeps rolling. It no longer takes the keyboard or holds notices
  back, and it never closes and reopens itself on a resize. Esc, `/spark` or `/spark focus` leave it.
- Spark comes back after a resize or a tab switch: a drawing that was lost keeps asking for a redraw (backing off up to
  every four seconds) until it is shown again, idle or busy.

## 1.4.3

- Spark no longer hooks the permission check at all, so the plugin directory can confirm that every permission
  decision stays with you and Claude Code. The cost: no ask cue and no "waiting on you" state; a call you deny still
  closes its gate quietly.

## 1.4.2

- Ready for the Claude plugin directory: a listing icon (Spark herself, rendered by her own renderer), settings
  written the way the directory reads them (the choices are in each description), the permission hook passing Claude
  Code's verdict straight through, and a README section listing everything Spark touches on your machine.

## 1.4.1

- Gating hooks: Spark's own work (drawing, cues, focus) is wrapped so it can never block a prompt, tool call, compact or copy. Claude Code's own errors still pass through.

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
