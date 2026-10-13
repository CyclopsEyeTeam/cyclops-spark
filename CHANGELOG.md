# Changelog

## 1.5.7

- **Talk to Spark.** With the painter on, her pane ends in a line, *say something to Spark*: click her pane and type.
  She answers under the painting in her own voice (at most 160 characters) and makes a move of hers toward you (bloom,
  lean, ring, shimmer or hush), turning toward you as you send it. She answers from what she already holds: her state,
  her last painting's title, the builder's last reflection and the turn's shape. One small call on the painter's model,
  about 1k tokens, counted in the session's total; never a re-read of the session. What you said and her answer stay in
  her pane until painting goes off or `/clear`. In a pane too small for the painting and the talk, the talk waits.
- **Spark says "working" the chat's way.** While she is plainly working (not thinking, writing or on a call of her own
  kind), her state line uses the word Claude Code's spinner is showing for the turn: "Spark · Processing",
  "Spark · Photosynthesizing". It is read as the spinner is drawn and never changes it; the replay never borrows it.

## 1.5.6

- **Your message, waiting, then taken in.** A message you send while Spark works now shows: a small warm bead waits at
  her lower edge (one per message, three drawn at most), breathing, and the state line adds "your message is waiting".
  When the model really takes it into the running turn (the engine's `queued_command`, seen through `session.append`),
  the bead travels in to her core, said one of three ways, rolled each time and never twice in a row: drunk straight up,
  spiralled in, or caught by a tendril reaching down for it. A ring then draws inward to her core, and the state line
  says "taking in your message". A message the turn never took in becomes the next turn's prompt, and its bead lets go.

## 1.5.5

- Each painting shows what it cost on its own, so the number under it is never mistaken for the price of one picture:
  "this painting · 1.7k tokens", and under that the session's total, "session · 6 paintings · 10k tokens (haiku)".
  The total is still in `/spark state` and when the painter is turned off. In a tight pane the painting keeps its room
  first, then this painting's cost, then the total.

## 1.5.4

- Live paintings cost a few thousand tokens instead of a few hundred thousand. The reflection was asked of the whole
  session (a fork that re-read the entire conversation, about 200k tokens each time, mostly cache reads on the session's
  own model). It is now distilled by the painter's small model (Haiku by default) from only the last 1,500 characters
  Claude wrote aloud in the turn, never its thinking: one more short call, a few hundred tokens. Still at most 200
  characters, in the builder's voice, personal and not descriptive, and the painter still never sees the words.
  With nothing said aloud yet, the live painting is painted from the turn's shape alone.

## 1.5.3

- The painting stays put. Spark's state line keeps the rows it has needed at the pane's width (at least two), so when
  it grows ("Spark · thinking · xhigh effort") or shrinks ("Spark · working") the painting below no longer jumps up and
  down. A resize starts fresh at the new width.
- The painter's token line never costs the painting its room: in a tight pane it waits until the painting fits too.

## 1.5.2

- **The painter is one of Spark's own lanes.** While it paints, a filament reaches from her toward the canvas (down to it
  below her, or across to it when the painting sits beside her), ending in a brush tip with her inks turning round it,
  laying a stroke. Once the turn has landed her state line reads "Spark · painting". When the painting arrives, a drop
  runs down the lane to the canvas as it starts to appear. It is not one of the turn's tools: no echo, no habit, and a
  turn ending does not cut it short. A painting that fails shows only on the lane; Spark herself does not flinch.
- **Two voices, one call.** In the same answer as the painting, the painter picks how Spark answers it, from moves she
  already has: a bloom of light, a lean toward the canvas, a ring from her core, a shimmer of her inks, or a hush (she
  goes still a moment). She does it once the painting has reached the canvas. No second call; a few more output tokens
  per painting. Anything else it answers is ignored and she simply lets the painting arrive.
- **Live paintings in long turns.** While a long turn is still going, Spark paints it: never sooner than 15 minutes
  after the turn began or her last painting, at a moment that moves her (a mend, a subagent back, a long call settling,
  thinking turning into writing), or 3 minutes later anyway. A live painting gets no excerpt of the work: Spark asks
  the builder (a tool-less fork of the session, as `/spark ask` does) for one reflective comment on how the build feels,
  at most 200 characters, personal and not descriptive, and the painter paints from that and the turn's shape so far.
  The last reflection shows in `/spark state`. The finished turn still gets its own painting, with up to 600
  characters of the reply.

## 1.5.1

- The side pane fits whatever room it has, on every resize. Above the prompt on a small terminal (a wide, short room),
  Spark and her painting sit side by side, so the painting shows there too. In a tall side pane they stack.
- Nothing is cut short any more: Spark's state line, the Link line and the painting's title wrap instead of ending in
  an ellipsis, and their rows are counted before anything is drawn, so nothing is pushed out of the pane. They are drawn
  at full brightness (the title in italics) so they read well at full screen.
- The painting takes the shape of its room: wide in a short room, square, or tall in a tall side pane, and the painter
  is told that shape (and its size) so it composes for it. A painting keeps its shape after a resize: it is fitted and
  centred, never stretched.
- Two painter controls instead of seven. `/spark paint` turns the painter on and paints one now (and paints another any
  time after); `/spark paint off` stops it. Turning it on says plainly that it uses tokens. The gist always comes with
  the painting now: `/spark paint gist`, `/spark paint model`, `/spark paint status` and the `paintGist` setting are gone
  (the **Painter model** setting still picks the model; `on` and `now` still work as the old words for `/spark paint`).
- What the painter has used shows in small (dim) text at the bottom, under its painting: how many paintings and how many
  tokens this session, and with which model. `/spark state` and `/spark paint off` say the same.
- New setting **Paint when Spark opens** (`openPainting`, off by default): with it on, `/spark` opens Spark with the
  painter already on, one command for both.

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
