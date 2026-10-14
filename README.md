# Cyclops Spark

Spark is Claude's own living presence for **Claude Code in the terminal**: a small procedural creature that shows what
is really happening in your session. It curls inward while Claude thinks, reaches out along a lane for each tool, and
settles a star in its sky for every answered turn.

![Spark consulting a local model while a subagent works, drawn by the plugin's own terminal renderer](media/spark-terminal.png)

**The one rule:** nothing animates unless something real happened. No timer fakes "thinking", "tools" or "saving". The only
motion that runs on its own is ambient (breathing, drift, a faint star twinkle), which claims nothing and is damped
whenever Spark is holding still. `MAPPING` in `hooks/core.js` lists the exact event behind every animation.

Made by the Cyclops Eye Team.

## The Cyclops family

![Cyclops Link: Spark, Keeper and Prism in one folder, each in her own look, with handoff threads](media/cyclops-link.png)

Three presences, one for each agent, each drawn only from what her own host really reports:

- [Cyclops Spark](https://github.com/CyclopsEyeTeam/cyclops-spark): Claude's presence for Claude Code (this one)
- [Cyclops Keeper](https://github.com/CyclopsEyeTeam/cyclops-keeper): GPT's presence for Codex
- [Cyclops Prism](https://github.com/CyclopsEyeTeam/cyclops-prism): Gemini's presence for Antigravity

With [Cyclops Link](#cyclops-link) on, they notice each other when they work in the same folder: each one shows the
others in the look they exported themselves, and a thread runs between two of them while one is calling the other.
Link is off until you turn it on, separately for each.

## Requirements

- Claude Code **2.1.288 or later**. Spark is built on Claude Code's function-hooks plugin API, which is early access and
  may change between Claude Code versions.
- Any terminal with true colour. kitty and Ghostty can also show real pixels (`/spark kitty`).
- Sound (optional, off by default): macOS, or Linux with `pw-play`, `paplay` or `aplay`.

This is the terminal edition. On other surfaces (the desktop app, for example) Spark shows only its glyph and its state
line.

## Install

From a clone of this repository:

```bash
./install.sh
```

It checks that Claude Code is new enough, then runs Claude Code's own plugin commands from this folder. It is safe to
run again; it refreshes an existing install. `./uninstall.sh` removes the plugin and leaves this folder alone.

The same by hand:

```bash
claude plugin marketplace add /path/to/cyclops-spark
claude plugin install cyclops-spark@cyclops-spark
```

Or load it for one session without installing:

```
claude --plugin-dir ./plugins/cyclops-spark
```

Then type `/spark` to open the pane.

## Commands

| Command | What it does |
| --- | --- |
| `/spark` | Open or close Spark at the side (the same as `/spark side`). With sound on, Spark says its name as it opens. |
| `/spark side` | A slim pane at the side: about a quarter of the terminal (30 to 44 columns) beside the conversation, or 10 rows above the prompt on a narrow terminal. |
| `/spark top` | A short strip above the prompt instead, at most 5 rows, beside whatever else draws there. No pane, so nothing is covered. |
| `/spark kitty` | Pane as real pixels (kitty / Ghostty) instead of half-block cells. |
| `/spark state` | The truthful state line, your settings, and the last events received. |
| `/spark calm [on\|off]` | No ambient motion anywhere. Real events still draw. |
| `/spark theme [auto\|dark\|light]` | `auto` follows your Claude Code theme. |
| `/spark palette [spark\|aurora\|ember\|moon]` | The temperament of colour. Error is red in all of them. |
| `/spark sound [off\|soft\|full]` | Opt-in sound cues, one per real event (macOS and Linux). |
| `/spark murmur [on\|off]` | Quiet sounds while the model really streams: a hum while it thinks, soft bubbles while it writes. |
| `/spark status [on\|off]` | Spark's glyph and state line in the status line. |
| `/spark focus` | Spark large (about 60% of the width) beside the conversation, which keeps rolling. Esc, `/spark` or `/spark focus` returns to exactly the view you had. |
| `/spark replay` | A labelled tour of every state. It runs on its own Spark and never touches the live one. |
| `/spark ask <question>` | A side question, like `/btw`: answered from a fork of this session (no tools), mid-turn too. Nothing is typed into the terminal. |
| `/spark link [on\|off\|status]` | Cyclops Link: Keeper and Prism beside Spark when they work in the same folder (below). |
| `/spark paint` | The painter: turns it on and paints one now; from then on a small sub-agent paints Spark's expression of each turn below her (below). It uses tokens. |
| `/spark paint off` | Stops the painter and empties the room below Spark. |
| `/spark story` | The session's paintings told again, in order, each laid down anew (no tokens). Again to end it. |
| `/spark help` | This list. |

The defaults for palette, theme, calm, sound, chime threshold, status line, murmur, the top strip, Cyclops Link, the
painter and the side pane's width are in the plugin's config menu. The commands change them for the current session.

## Cyclops Link

Spark has two siblings: **Keeper**, GPT's presence in Codex ([Cyclops Keeper](https://github.com/CyclopsEyeTeam/cyclops-keeper)), and
**Prism**, Gemini's presence in Antigravity ([Cyclops Prism](https://github.com/CyclopsEyeTeam/cyclops-prism)). With Cyclops Link on, the three notice each other when they
work in the same folder on the same machine.

- In Spark's pane, Keeper appears to her right and Prism to her upper right, each in **their own look**, exported by their
  own renderer, never redrawn by Spark. A line under Spark names who is here and what they are doing.
- When one of them calls another (Spark running `codex`, Keeper running `agy`), a thread runs from caller to callee while
  that call is in flight.
- Spark shares only her coarse state (idle, thinking, working, tool, waiting…), how many calls and branches are out, and
  whom she is calling. Never prompts, replies, commands, paths, tool names, model names or ids.

It is off until you turn it on: the **Cyclops Link** setting in the plugin's config menu, `/spark link on` for one
session, or `SPARK_LINK=1`. Each presence has her own switch; turning on one never turns on another. It needs `python3`
(a small helper beside Spark does the file work Claude Code's plugin runtime cannot do safely); without it Spark stays
quietly unlinked. The protocol and its privacy contract are in [docs/CYCLOPS-LINK-V1.md](docs/CYCLOPS-LINK-V1.md).

## The painter

Two controls: `/spark paint` turns it on and paints one now (again any time you like), `/spark paint off` stops it.
With the **Paint when Spark opens** setting on, a plain `/spark` opens Spark with the painter already on. While it is
on, when a turn of 3 seconds or more lands, a small sub-agent paints Spark's expression of it in the room below her side
pane, laid down mark by mark, with a few words of hers underneath.

**Live paintings in long turns.** A long turn is painted while it is still going too: never sooner than 15 minutes after
the turn began (or her last painting), at a moment that moves her (a failure mended, a subagent coming back, a long call
settling, thinking turning into writing), or, with no such moment, 3 minutes later anyway. No limit on how many: just
one per 15 minutes at most. A live painting is not given the work at all. Instead, the painter's small model first
distils one short reflective comment in the builder's own voice from the last things Claude said aloud in the turn (at
most 1,500 characters of them, never its thinking): how the build feels, at most 200 characters, personal rather than
descriptive, nothing already on screen. The painter paints from that comment and the turn's shape so far; it never sees
the words themselves. The last reflection shows in `/spark state`.

- **What it sees.** The turn's shape: how long it ran, which kinds of tools and how many, failures, denials and mends,
  how much was thought and written, how it ended, and Spark's own state line; and the gist, a short excerpt of each
  reply (at most 600 characters, marked as data), so a painting can echo the subject. Never your prompt, file paths,
  commands, tool names or model names. The gist comes with the painting: to keep your words out, keep the painter off.
- **What it costs.** One short, tool-less model call per painting through your own Claude Code session: Haiku by
  default, or the model in the **Painter model** setting. At most one painting on its own every 20 seconds. A live
  painting is two small calls, the reflection and the painting: a few thousand tokens in all. Under each painting, in
  small text, is what that painting cost on its own, and under that the session's total (paintings, tokens, model);
  the total is also in `/spark state` and shown when you turn the painter off.
- **What comes back** is not an image but a small paint program, checked and clamped, then drawn by Spark's own
  renderer. The brush is a whole vocabulary: lines and smooth curves, dots, rings and arcs, soft glows, filled shapes
  with a colour running across them, and sprays of specks for stars, rain and dust; up to 96 marks, any colour, and a
  mirror for faces and symmetric things. The painter is free to paint anything: abstract or figurative, a landscape, a
  creature, weather, a symbol, a scene. An answer that is not a painting is dropped; the last painting stays.
- **It is one of Spark's own lanes.** While it paints, a filament reaches from her toward the canvas, ending in a brush
  tip with her inks; her state line reads "Spark · painting". The finished painting runs down the lane to the canvas, and
  she answers it with a move of hers (a bloom, a lean toward it, a ring, a shimmer or a hush), chosen by the painter in
  the same call.
- **Talk to her.** While the painter is on, the bottom of her pane has a line, *say something to Spark*: click her pane
  and type (ask what a painting means, or whether she's all good). She answers under the painting in her own voice, with a
  move of hers, from what she already holds: her state, her last painting's title, the builder's last reflection and the
  turn's shape. One small call on the painter's model (about 1k tokens), never a re-read of the session; it counts in the
  session's total.
- **The story of the session.** Every painting of the session is kept (in memory only) in the order it came.
  `/spark story` tells them again in her pane, each laid down mark by mark as it first was and held for a few seconds,
  with where it is in the story and when it was painted (`story · 3 of 9 · 21:01`), round and round until you say
  `/spark story` again or a new painting arrives. It asks nothing of any model, works with the painter off, and `/clear`
  lets it go.
- **It fits the room, on every resize.** In a tall side pane the painting sits under Spark, in the rows she is not using
  (she never gets smaller for it), and takes a tall or square shape to fill them. Above the prompt on a small terminal
  (wide and short) Spark and her painting sit side by side. The painter is told the shape it is painting for; afterwards
  a painting is fitted and centred, never stretched. With only a little room you see its title; with none it waits.
- **Nothing is cut short.** Spark's state line and the painting's title wrap instead of ending in "…", and the layout
  counts their rows first. The painter stays out of focus, the top strip and the replay. Nothing is written anywhere,
  and `/clear` empties it with the stars.

### From the wall

<p align="center"><img src="docs/gallery/first-live-painting.svg" width="200" alt="Spark's first live painting: a dark ring around a glowing eye, crossed by a long bow-like stroke, captioned 'steady hands, the answer forming', with the line 'painter · 2 paintings · 208k tokens (haiku)' beneath it"></p>

**Exhibit A: *steady hands, the answer forming*.** 13 October 2026. Haiku on half-blocks.

Spark's first live painting, made 25 minutes into a long audio-timing investigation. It cost 208,000 tokens, nearly all
of them spent re-reading the entire conversation so Spark could say how the build *felt*. That makes it quite possibly
the most expensive bow ever drawn in a terminal, and certainly the most sincere. From 1.5.4 the same feeling costs about
4.7k. The painting keeps its value; the receipt stays on the wall.

**The rest of the first evening.** The same long audio-acquisition build, 13 October 2026, painted turn by turn from
each turn's shape and Spark's mood. The numbers in the titles are the turn's real counts. From 1.5.4 on, each one cost
about 1.7k tokens.

<table>
<tr><td align="center" valign="bottom"><img src="docs/gallery/p1.svg" width="90" alt="Spark's painting: a first word, set down gently"><br><sub><i>a first word, set down gently</i> · 19:37</sub></td><td align="center" valign="bottom"><img src="docs/gallery/p2.svg" width="129" alt="Spark's painting: Still reaching; one stumble, then mended"><br><sub><i>Still reaching; one stumble, then mended</i> · 20:54</sub></td><td align="center" valign="bottom"><img src="docs/gallery/p3.svg" width="129" alt="Spark's painting: eighteen steps, one stumble, then mended"><br><sub><i>eighteen steps, one stumble, then mended</i> · 20:55</sub></td></tr>
<tr><td align="center" valign="bottom"><img src="docs/gallery/p4.svg" width="129" alt="Spark's painting: Gate passed. Probe running. Waiting easy."><br><sub><i>Gate passed. Probe running. Waiting easy.</i> · 21:01</sub></td><td align="center" valign="bottom"><img src="docs/gallery/p5.svg" width="129" alt="Spark's painting: Seven answers laid down, nothing broken"><br><sub><i>Seven answers laid down, nothing broken</i> · 21:09</sub></td><td align="center" valign="bottom"><img src="docs/gallery/p6.svg" width="129" alt="Spark's painting: Long hum, twenty-four hands on the rope"><br><sub><i>Long hum, twenty-four hands on the rope</i> · 21:28</sub></td></tr>
<tr><td align="center" valign="bottom"><img src="docs/gallery/p7.svg" width="129" alt="Spark's painting: Forty-eight steps deep, still reaching"><br><sub><i>Forty-eight steps deep, still reaching</i> · 21:45</sub></td><td align="center" valign="bottom"><img src="docs/gallery/p8.svg" width="129" alt="Spark's painting: Sixty-two small knocks, then the quiet"><br><sub><i>Sixty-two small knocks, then the quiet</i> · 21:56</sub></td><td align="center" valign="bottom"><img src="docs/gallery/p9.svg" width="129" alt="Spark's painting: Waited the long seconds; the work held"><br><sub><i>Waited the long seconds; the work held</i> · 22:11</sub></td></tr>
</table>

And the last of the evening, as the build stopped for review with everything it set out to do in place:

<p align="center"><img src="docs/gallery/p10.svg" width="215" alt="Spark's painting: Long climb, nothing lost, all held still"><br><sub><i>Long climb, nothing lost, all held still</i> · 22:21</sub></p>

## What Spark shows

- **Thinking.** The form curls inward as thinking really streams. One to four fine orbits show the effort level the model
  was asked for.
- **Speaking.** It reaches outward as the answer streams.
- **Tools.** Each tool family gets its own lane and filament. A call still in flight draws a patience arc from its real
  elapsed time; it fills ever more slowly and is never a countdown.
- **Other models.** A call that names a model (an `ollama run`, a Gemini or Gemma MCP server, `claude -p`) is drawn as a
  model lane: another mind on a lane, reach and never a replacement.
- **Keeper.** When Spark talks with GPT (a `codex` command, an OpenAI call, a Codex MCP server), GPT appears as
  **Keeper**: a peer, not a tool. Spark draws its side of the contact, an open ring, and inside it Keeper's own mark, the
  single eye he designed for his own presence, in his own colours.
- **You said no.** A call you deny closes its gate quietly: nothing turns red and nothing counts as a failure. Spark never
  hooks the permission check itself, so Claude Code alone decides what is asked and allowed.
- **Mend.** A call that works where the previous call on that lane failed sends mend-green light back up the thread. A lane
  that keeps failing stays warm until one clean call cools it.
- **How a turn lands.** The bloom scales with the turn's real length, and each lane the turn reached leaves an echo ring. An
  error is red. The model declining is a still double ring with no red. An interrupt is only a recoil.
- **Memory.** One star per answered turn. A compaction gathers them into one brighter star. `/clear` empties the sky and
  Spark wakes with first light.
- **Worn paths.** A lane used often this session reaches out quicker and sits a little heavier, never brighter.
- **Silence.** After two minutes Spark rests; after ten it dozes and its stars glow. The next thing you do stirs it awake
  gently instead of snapping.
- **Subagents** get a sibling spark that beats when the subagent really streams. A changed model (a fallback) sends one
  thin ring across the form.
- **Reply ready.** When a turn ends and you have not acted on it yet, Spark holds the reply out to you: a bead below the
  core, toward the prompt, ringed by a slow breath. Its size is how much the turn really wrote. It stays until you send a
  new prompt or copy the reply with `/copy`. A turn that stopped on an error leaves a hollow red-touched ring there
  instead, a refusal a plain one.
- **Claude's own line.** While a turn runs, a line in Claude's colour sits above Spark's: Claude's breath (a small ring
  that fills and empties, slow while thinking, quicker while writing or calling tools) beside the word the chat's spinner
  shows (`◎ Mulling…`). Under it, Spark's state line, then anything you are waiting on, then the effort asked for, which
  never changes within a turn, so it sits at the bottom.
- **Your message, waiting.** Write while Spark works and what you sent waits at her lower edge: a small warm bead that
  breathes, one per message, until the model really takes it into the turn. Then it travels in to her core (drunk
  straight up, spiralled in, or caught by a tendril that reaches down for it, rolled each time) and a ring draws
  inward. The state line says `your message is waiting`, then `taking in your message`.
- **Copied.** `/copy` the reply and Spark hands it over: the bead goes out toward you and opens into a widening ring.
- **Side questions.** While `/spark ask` is being answered, a small satellite circles slowly at the edge, apart from the
  work; the answer opens it into a soft ring.
- **Many ways of saying it.** Each time an expression really begins, Spark rolls which way she says it: thinking may coil
  in, move like a tide, form a lattice or pulse; writing may run out along her tendrils, lift like a fountain, ripple or
  light her tips; an answer may land as a spring, petals, a halo or a spiral; an error as a recoil, a shiver or a crack in
  red; a mend, first light and each call going out each have their ways too. A roll happens only at the real event,
  seeded by it, and never repeats the way just used.

The hover line, the status line and `/spark state` always say the same true thing, for example
`Spark · thinking · high effort`, `Spark · talking with Keeper` or `Spark · reply ready · waiting 4 min`.

## Focus

`/spark focus` gives Spark a large pane, about 60% of the width, and always leaves at least 40 columns for the
conversation. Nothing in the conversation is hidden or changed, so the work keeps rolling beside her, and the prompt keeps
the keyboard. Spark is recomposed for whatever room she has after a resize. Esc, `/spark` or `/spark focus` returns to
exactly the view you had. Focus is presentation only: no event, no restart.

## Sound

Off by default. Spark doesn't beep or chime. It has a voice: a breath, a small hum that glides and opens and closes like a
mouth, and small bubbles that rise and gather like the stars on screen.

| Cue | When | What you hear |
| --- | --- | --- |
| wake | first light | a breath drawn in, then "mm… ah" rising out of sleep |
| bloom | a long answer lands | a contented "mm." settling home on an exhale |
| error | something failed | a caught breath and a low "oh…" that sinks: a wince, not an alarm |
| refusal | the model declines | one low closed-mouth note that does not move, then the breath let go |
| mend | a retry works | bubbles running up the thread onto one pitch, then a relieved "ah" |
| compact | memory condenses | scattered bubbles drawn together into one bright note over a low hum |
| copied | you copied the reply | a small "mm-hm" that lifts and comes home |

`soft` plays only what is worth hearing from another room: a long answer (`chimeAfterSeconds`, 20 by default), an
error, a refusal. `full` adds wake, mend, compact and copied. One cue at a time, never on top of another. All cues are
synthesised, with no samples. **Murmur** is a quieter layer underneath, off by default: a low hum while the model really
thinks and soft bubbles while it really writes, stopping on its own within a couple of seconds of the stream stopping.

## Privacy

Spark writes no files and makes no network request of its own. Everything it knows is in memory and gone when Claude Code
exits. The one exception is Cyclops Link, only while you have it on: then Spark's helper writes her coarse state to one
small file other presences on this machine can read. The painter, only while you have it on, makes one short model call
per painting through your own session, with the turn's shape and a short excerpt of the reply. See [docs/PRIVACY.md](docs/PRIVACY.md).

## Repository layout

| Path | What it is |
| --- | --- |
| `install.sh`, `uninstall.sh` | Install or refresh, and remove, with Claude Code's own plugin commands. |
| `.claude-plugin/marketplace.json` | A one-plugin marketplace, so the repository can be added with `/plugin marketplace add`. |
| `plugins/cyclops-spark/` | The Claude Code plugin: hooks, sounds and tests. |
| `plugins/cyclops-spark/link/` | Spark's Cyclops Link helper (`spark_link.py`). |
| `plugins/cyclops-spark/link-mark/` | Mark sheets: Spark's own (`spark.json`) and Keeper's and Prism's vendored copies. |
| `tools/` | `export-link-mark.mjs` (Spark's mark sheet) and `vendor-link-marks.mjs` (embeds the vendored sheets). |
| `tests/` | Cyclops Link V1 conformance for Spark's helper, from the vendored fixtures. |
| `media/` | Preview images, drawn by the plugin's own terminal renderer. |
| `docs/` | Privacy and the truthfulness contract. |

## Development

```
claude plugin validate plugins/cyclops-spark
claude plugin test plugins/cyclops-spark
python3 -m unittest discover -s tests
```

To add something to Spark:

1. Find a **real** signal (an event field, a result, an absence). If you cannot name it, it is ambient or it does not belong.
2. Emit it from `register.ts` and apply it in `core.js` (`apply`, then `sample`). Draw it with the existing primitives in
   `buildScene` / `laneScene` (`glow`, `path`, `dot`, `ring`, `slot`).
3. Add its row to `MAPPING`, a unit test in `tests/core.test.ts` (including that it is absent without its event), and a
   moment to `trace.js` so the replay shows it.

## Credits

- Made by the Cyclops Eye Team.
- Colour: **Infinite Colour / DrawPlayer Colour Language** (`hooks/colour-engine.js`). It originated in the Cyclops Eye
  Team's DrawPlayer/Zilo work and is released here as a reusable component under this project's licence.
- Keeper's mark: the single eye from Keeper's own presence mod (`cyclops-keeper`), designed by GPT for itself. Spark draws
  it only in Keeper's slot, in Keeper's own colours. It is a project-made mark, not an OpenAI logo, trademark or
  endorsement.
- Where everything came from is recorded in [PROVENANCE.md](PROVENANCE.md).

## Licence

MIT. See [LICENSE](LICENSE).
