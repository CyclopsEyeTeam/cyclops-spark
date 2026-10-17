# Changelog

## 1.7.15

- **Spark sits higher and her painting is larger.** In a side pane she used to take all the rows her width gave her and
  leave the painting whatever was left, so a wide pane showed a very large Spark over a sliver of painting. Now they
  share the rows: Spark gives the painting what it needs to be as large as the pane's width allows (with its title,
  cost lines and the line to talk to her), keeping at least 45% of the room herself. She keeps her width, so her lanes
  still reach the sides; only her height gives way. In a 72-column pane her painting goes from about 6 rows to 17; in a
  narrow pane, where the painting was already as wide as it can be, nothing changes.

## 1.7.14

- **Free paintings: you choose what she paints.** Inspired by how Prism paints, the painter has two ways now:
  - **work** (as before, and the default): her opening, then each turn's expression, and a live one in a long turn;
  - **free**: every painting is hers, the way her opening is, of nothing in the conversation. Each is seeded only by
    the hour, the month, a word drawn at random and the names of her last few paintings, so they can run on as a
    series, answer each other or break away. She paints them on a rhythm of her own, one every `paintEvery` minutes
    (5 by default), while her painting can be seen and you are around (a turn going, or something done in the last 30
    minutes). Left alone she rests, so no tokens go on paintings nobody is there to see. With `paintEvery` at 0 she
    paints one of her own at the end of each turn instead.
  Choose with the new **Paintings** setting, `/spark paint free` (which paints one now) and `/spark paint work`, or a
  press of her new fourth tool, **✦ free** / **◇ work**, which shows the way she paints and switches it. The story names
  a free painting `· her own`; `/spark state` says `free every 5 min`.

## 1.7.13

- **Truest keeps the terminal's colour depth, and adds nothing of its own.** Studying a real truest convert beside the
  terminal it came from showed that the terminal shows her painting with 16 levels per channel. In the screenshot, 99%
  of the painting's pixels sit exactly on them (0, 17, 34 … 255), while the conversation's text beside it does not. So a
  smooth gradient or a wide glow is seen as bands, and where the three channels step at different places the bands
  change hue (plum to navy to near black). The tonal "layers" on her floor come from that, not from anything she drew.
  Truest now:
  - draws each mark flat, with the weight a terminal cell gives it, then rounds its light to those levels (the
    `truestLevels` setting: 16, or 0 for full colour), in the PNG and in the SVG (a discrete colour transfer);
  - no longer adds shadows, bloom or the softening of far layers, which were the renderer's own reading of depth and
    not the painting's.
  On the real painting, the bands on the floor, the navy and near-black zones and the plum all come back as the terminal
  showed them. Its rolls are drawn the same way, now at the full 12 frames a second.
- **The depth pass is kept as `layered`.** `/spark convert layered` (and `all layered`, `roll layered`) still makes the
  old version, to compare. It is not in the menu.

## 1.7.12

- **Painting with Prism.** Prism paints with the same brush, saving her paintings as JSON files of the same marks in
  `prism-paintings` in the project. The ones she paints during your session now join Spark's story in the order they
  were painted. Spark's own checker reads them, clamping every mark, and they are never changed.
  - `/spark story` tells both, marking hers `· Prism’s`.
  - A convert of one of hers is captioned `Prism · date · way`.
  - The roll is the two of them, each credited under her own paintings, with "Spark & Prism" on the title card.
  - Spark picks up anything new from her when a turn ends, or when you open the story, a convert or the roll.
  - `/spark prism` says what is linked. `/spark prism off | on | <folder>` turns it off or on, or points it at another
    folder; the Prism's paintings setting does the same.
- **And Spark shares hers.** While Prism's folder is there, each painting Spark makes is also written in the same form
  into `spark-paintings` as `NN-title.json`, for Prism to read: title, mood, mirror, marks, tokens, model, time, `by`
  and shape. Only the painting goes, never anything of the work. Without her folder, or with `/spark prism off`,
  nothing is written.

## 1.7.11

- **Spark's adventures as Shorts.** `/spark convert roll short` (also `shorts` or `vertical`, with any way:
  `/spark convert roll truest short`) makes the roll upright, 1080 x 1920, for YouTube Shorts and phones. Each painting
  is as large as the frame allows, with its caption larger and right under it, the two together a little above the
  middle. The eye's title card fits the upright frame too. The file ends in `-short.mp4`. If a long session runs past
  the 3 minutes a Short can be, Spark says so when the roll starts.
- **The progress bar no longer goes stale.** A still Spark (idle, resting) only redraws when something asks it to, so
  the bar sat at its first moment (1%) and stayed there after the work was done. Each move of a convert or roll now
  asks for a redraw (at most every 200 ms), and the end always does, so the bar goes when the work is done.

## 1.7.10

- **A progress bar under her tools.** While Spark converts or makes a roll beside your work, a second row appears under
  ▶ story ⇪ convert ◎ roll: what she is doing now, in her own words (laying down “the lamp…” · 3/7, raising the title,
  finding its music in G dorian, stitching the roll together; for a convert, drawing “…” or setting it in a PNG), a bar that fills in eighths of a cell so it moves smoothly, and the percentage. The roll moves it frame by frame.
  It goes away when the job is done, and only shows where the painting still keeps room of its own.

## 1.7.9

- **Truest.** Layered is now called **truest**, first in the menu: the painting as Spark sees it beside the
  conversation. It gives every mark the weight one terminal cell gives it, measured from how wide her painting was last
  drawn, so specks, rays and trails hold the same share of the picture large as small. The depth (layers, softening,
  shadows, bloom) stays. `layered` still works as a word.
- **Colour depth.** Light past full keeps its hue: only the light beyond full spills toward white, rather than each
  channel being cut off at full. A hot core still goes white, a halo stays amber, and a pink trail over violet stays
  pink. This applies everywhere Spark turns light into colour: HD and half-block cells, kitty pixels, converts and the
  roll. HD cells average their quarters in linear light and choose their two colours by perceptual distance (Oklab, with
  a fast path for flat cells, about 15% more time than before). The first encoder is kept as `toQuadrantsClassic`, the
  reference it is measured against.
- **The roll breathes.** Each painting is held for its own length, in whole beats of the music's pulse (84 a minute):
  a bar for a quiet painting that follows on from the last, up to two for a busier one or one that turns the colour
  somewhere new. The last is held a bar longer, with the music settling on its home chord.
- **Her tools.** Once there is a painting, three buttons sit top right in her pane: ▶ story (■ to end it),
  ⇪ convert and ◎ roll. Each runs `/spark` as if typed, and its answer comes back as a line of hers. They only appear
  where the painting keeps room of its own.
- **Copy her words whole.** A ⧉ copy button under her answer, and `/spark copy`, put what you said and what she
  answered on your clipboard. The terminal's own selection copies screen rows, so beside the conversation it only
  took half of each row.

## 1.7.8

- **Spark's opening.** The first painting of a conversation is now hers, not the work's: at the start there is next to
  nothing to paint from, so instead of a thin picture of one short exchange, the painter is told nothing of the
  conversation, only the hour and the month (dawn, morning, afternoon, evening, night or the small hours), her colours,
  and a word drawn at random from 32 (a threshold, a lantern, a comet, a forge…) to follow or leave. The story marks it
  `· her opening`; every painting after it is of the work, and `/clear` brings a new opening. It is a cheaper call too:
  no turn, no reply excerpt.

## 1.7.7

- **`/spark` no longer disappears after a convert.** All of a session's plugin hooks share one worker, and the engine
  checks on it with a heartbeat: a worker that leaves one unanswered is taken as wedged (a hook spinning without
  yielding), replaced, and the plugin running in it unloaded until the next launch, its `/spark` command with it. A
  layered convert at 1920 wide spent over a second at a time inside its blurs, shadows and bloom without handing over
  (several at 4k), long enough on a busy machine to miss a beat. Every large loop is now made a stretch at a time and
  hands over every ~20 ms: the layered steps (each blur pass, the shadow, the bloom, a row or column at a time),
  the drawing of a mark (row by row, and its pixels laid 65,536 at a time), the flattening to RGB, the PNG's text, and
  the roll's title card and its fade. The longest stretch is now about 40 ms at 1920 (about 100 at 4k), and the
  pictures are exactly the same, pixel for pixel.
- **Less memory for layered.** Its buffers are made once and reused frame after frame (the shadow keeps only its
  cover, a quarter of the size, and the whole picture is composed straight onto the finished layers), so a long roll
  asks no more than its first frame.
- **If anything in `/spark` ever does fail, it says so and stays loaded**, rather than taking the command with it.
- **Claude's breath keeps its word in one place.** The motion beside the chat's word (Gitifying…, Swirling…) was 7
  cells while thinking and 1 cell otherwise, so the word jumped left and right as the turn moved between them. Every
  motion is now exactly 5 cells, drawn in a slot of its own, so the word always starts in the same column. The thinking
  rail is shorter (5 cells, 2 s there and back), and the orbit and pulse are centred in the slot.
- **New motions.** While a turn waits on you (a permission ask), an eye watches and blinks now and then (`‹◉›`).
  While the conversation compacts, beads gather in from the edges and let go. And the waiting pulse sends a small
  ripple out at its fullest.

## 1.7.6

- **No more blue specks around Spark in HD.** Where both sides of a quarter-block cell were too faint to keep, the cell
  was drawn as a block glyph in the terminal's *default foreground*, which is its text colour (a light blue-grey on
  many themes), so about 30 cells a frame flickered in that colour at her edges. Such a cell is now a plain space on
  the terminal's own background; no glyph is ever drawn in the default foreground.
- **The welcome eye no longer appears after an update mid-conversation.** Reinstalling reloads the plugin, which looks
  like a new session to it; it now checks that no turns have been taken yet before showing the welcome.

## 1.7.5

- **`/spark convert roll`: the session as a clip.** Every painting is laid down mark by mark as it first was (2 s), held
  with its title and its place in the roll under it (3 s), and crossfaded into the next (0.6 s); the last fades out.
  Spark draws each frame herself (a painting's finished marks kept on a raster of their own, only the mark in progress
  drawn again, so a frame costs little) at 1280x720, `roll hd` 1920x1080, or a width of your own; the frames go one
  painting at a time to `link/spark_roll.py`, which pipes them into ffmpeg (x264, or ffmpeg's own mpeg4 where x264 is
  missing), smooths the 12 laid-down frames a second to 30, holds the last, and joins the paintings with `xfade`. Each
  painting's frames are removed as soon as its part is made. Without ffmpeg, a 640x360 animated PNG (standard library
  only) that plays in any browser, and Spark says how to get the MP4. No tokens; beside the work, with progress in
  `/spark state`, a note and a toast when done, and the clip in the gallery page as a video.
- The raster can draw over what it holds (`keep`), so a painting is laid down a few marks at a time.
- **Layered: a fourth way to convert, with the depth the terminal gives.** Drawn large and crisp, a painting's marks
  read flat; in the terminal they are laid down in order at a size where every speck is a block and every line a soft
  band of light. Layered (`hooks/layered.js`) draws the marks at the terminal's weight and builds the picture in depth:
  the marks in their order cut into four layers, the far ones softened, each nearer layer's shadow on what lies behind
  it, and a bloom of the brightest light. The PNG from the raster; the SVG with the same layers as filters (softening,
  shadow, a bloom by luminance, in sRGB). No tokens; it goes on beside the work.
- **The convert menus ask what, then which way.** What: this painting, this painting every way (all four), all the
  session's paintings, or the roll. Which way: faithful, layered, refined, interpretive, each with its cost. Typed:
  `layered`, `every` (`three` still works), `all <way>`, `roll <way>`.
- **The roll in any way.** Faithful or layered (laid down in depth, 8 frames a second smoothed to 30, the finished layers
  kept composed so a frame costs one layer); refined or interpretive revisit each painting first, one painter call each,
  with the cost shown. The clip's name says its way (`spark-roll-<date>-<time>-layered.mp4`).
- **The roll has its own music.** An instrumental read from the paintings, no tokens (`hooks/music.js` writes the score,
  `link/spark_roll.py music` plays it): the session's colours pick the key and mode, each painting a chord of it (a soft
  pad and a bass, changing with each painting), and each mark sounds as it is laid down, by kind (dot, ring, arc: bell;
  line, curve: plucked string; spray: sparkles; glow: a swell), pitched by its height, placed by where it sits, as
  loud as its light; every kind of mark a painting has is heard, at most 14 notes a painting. Rendered at 32 kHz with
  numpy (an 85 s roll in about 5 s), at 16 kHz without; laid under the clip with an echo, a limiter and fades. The
  **Music in the roll** setting (`rollMusic`) makes a silent clip instead.
- **The roll opens with a title card.** The Cyclops eye over a soft glow in the session's colour, the title large in the
  bitmap font, and `Spark · the date · N paintings · music in <key>` under it (3.5 s: up over a second, then held,
  crossfaded into the first painting); the music opens under it with the key's home chord and a few rising bells. The
  title: `called <a title>` on the command (as you write it), else the name given with `/rename` this session, else the
  project's folder. The **Title card on the roll** setting (`rollTitle`) leaves it out. The join takes a length per
  part, as the card is shorter than a painting.

## 1.7.4

- **Every convert choice shows what it costs, and All… does more.** The menu reads `Faithful · no tokens`,
  `Refined · about 3.1k tokens`, `Interpretive · about 3.1k tokens`, `All…`; the estimates come from what painter
  revisits have used this session, or before any from the painting's own length. **All…** opens a second menu:
  **all three ways of this painting**, or **every painting of the session** faithful, refined or interpretive, each with
  its cost. Two painter calls or more run beside the work (a session's worth takes minutes): `/spark state` shows
  `converting 4 of 19 (all, refined)`, and when it is done Spark says so in the conversation and in a toast, with the
  files and the gallery page. Typed: `/spark convert three`, `/spark convert all faithful | refined | interpretive
  [hd | 4k]`; `all` alone, or a size alone (`/spark convert 4k`), asks.
- **Converting no longer stalls Spark.** A filled shape was drawn by testing every pixel against every edge, which for
  a busy painting at full size took tens of seconds (37 s for one at HD, minutes at 4k), past the ten seconds a command
  has of its own time, so `/spark` could stop answering. Shapes are now filled by scanlines, the same pixels exactly
  and about sixty times faster; the picture is drawn handing over to everything else every few milliseconds; and more
  than one picture, or one larger than HD, goes on beside the work, with a note when done.
- **No dark marks around her in HD.** A quarter-cell side that was mostly empty was drawn as its faint light mixed over
  an assumed near-black ground, which shows as black specks pulsing at her edges on a grey terminal. Below a third of
  cover such a side is now left to the terminal's own background.

## 1.7.3

- **The welcome eye.** When a session starts (and when `/clear` begins a new conversation), Spark draws the Cyclops eye
  above the prompt, with `C Y C L O P S   E Y E` and `the eye is open` beside it, until the first turn; then the room
  is given back. The eye is the launch banner's, drawn as a picture of its own (`hooks/eye.js`: the same lids, iris,
  glints and starfield, each pixel the average of 3 x 3 samples, the stars on whole pixels), so it is sharp at any size
  and in HD cells. It takes up to 9 rows, keeps two for anything else in the band, shows the eye alone when narrow, and
  leaves the band to a survey. The **Welcome eye** setting turns it off. The launch banner a shell prints is covered
  when Claude Code takes the whole screen; this one is Claude Code's own drawing, so it stays.

## Unreleased

- **Optional Cyclops launch banner.** `./install.sh` can add the Cyclops eye, drawn in truecolour half blocks, to the
  start of every `claude` launch: it asks once (default no), or take `--banner` / `--no-banner`. It lives in one marked
  block in your shell's rc file, shows only in an interactive terminal wide enough for it, stays quiet for `-p`,
  `--version` and subcommands, respects `CYCLOPS_BANNER=0`, and keeps working when `claude` is an alias.
  `./uninstall.sh` removes it and restores the rc file as it was. The plugin itself is unchanged.
- The banner is held for 2 seconds before Claude Code starts (any key goes on at once): Claude Code draws over the
  whole screen as it opens, which covered the eye before it could be seen. `CYCLOPS_BANNER_HOLD` sets the seconds
  (`0` for none).
- `./install.sh` refreshes the launch banner when it is already on, without asking: the block in your rc file is a copy
  made when it was installed, so before this an update (such as the 2-second hold) only reached it with `--banner`.

## 1.7.2

- **Spark in HD, in any terminal.** Every cell now holds four pixels instead of two: the raster is drawn at two pixels
  across and four down per cell, each quarter of a cell is the average of its two pixels, and of the ways to split the
  four quarters into the cell's two colours the closest is chosen, shown with the quadrant blocks (U+2596 to U+259F,
  with the half and full blocks), which terminals draw as they draw the half blocks. The half block is one of those
  splits, so no cell is ever worse than before. Her paintings are drawn the same way. Her thinnest marks keep the weight
  they had (the stroke and speck floors scale with the finer grid), so she is sharper without being dimmer: the same
  light, measured, within a few percent. `/spark hd off` (or the **HD cells** setting) returns to the half blocks.
- Her light is back where 1.7.0 had it: 1.7.1 thinned the floor of her tendrils (paths) from half a pixel to 0.45,
  which took about 7% of her light at rest. Restored.

## 1.7.1

- **`/spark convert` works at full size.** The plugin runtime takes at most 4 MiB in one write, and an HD or 4k picture's
  bytes are far more than that as text, so the conversion failed on the first write. Spark now hands the helper the
  bytes in numbered parts of at most 3 MB (`<name>.rgb.b64.0`, `.1`, ...), and `spark_png.py` reads them in order and
  removes them once the PNG is written.
- **`/spark paint` from a fresh terminal opens Spark and the painter together.** It no longer needs `/spark` first: when
  her pane is not up, the command opens it at the side, turns the painter on and paints one, and says all of that.
- **Converted paintings keep the terminal's colour and light.** The PNG was drawn with each mark over the last and the
  SVG blended once as a group, so a converted painting came out flat and dim beside the one in the pane. Both are now
  drawn exactly as the terminal draws: on a dark ground every mark adds its light to what is under it (two lights make
  white, a glow brightens the hill it sits on), flattened onto the ground the same way her cells are; the SVG gives
  every mark `plus-lighter` (browsers) with `screen` as the fallback, and the glow's falloff matches the raster's.
  Specks and fine lines keep a small floor (3 px at HD, 6 at 4k), as a speck is a whole cell in the terminal.
- **Nothing above the painting changes place.** Claude's breath line and the effort line each keep their row (blank
  between turns), so her state line is always the second row and the painting never has text reordered above it; the
  effort stays on its line for the whole turn, whatever she is doing, not only while thinking.
- **`/spark story` is told once through, then held on the last page**, not round and round. While it is on, small
  controls sit under its line: pause (holds the page: `· held`, so you can convert that one, since `/spark convert`
  takes the page showing), play (again, at the end), back, next and end; or `/spark story pause | play | next | back |
  end`. The pages turn by the host's clock.

## 1.7.0

- **`/spark convert`: a painting made large.** On its own it asks which way in Claude Code's own dialog, and you
  click one; or say it (`/spark convert refined 4k`). Three ways, after Keeper's idea: **faithful** draws the same marks at
  full size (no model); **refined** asks the painter for its own painting again with finer curves, smoother gradients
  and more detailed light, subject and composition kept; **interpretive** lets it revisit the painting freely. `all`
  does every painting of the session faithfully; `hd` (1920 wide) or `4k`. Each comes as an SVG, written by Spark, and
  a PNG, written by a small python helper (`link/spark_png.py`) from bytes she hands it as text, plus an `index.html`
  gallery, into the new **Convert folder** setting (`spark-paintings` in the project by default). The first time Spark
  writes files, and only on the command. The PNG is drawn with each mark over the last, as the SVG is, so a dark mark on
  a bright one shows. The caption is on the picture: the title, and under it `Spark · the date · the way`, in a small
  bitmap font (`hooks/font.js`, traced from a classic terminal font) sized to the picture; the SVG carries the same
  lines as text. The **Caption on converted paintings** setting turns it off.

## 1.6.2

- **Claude's breath has four motions** (`hooks/motion.js`), one for what the turn is doing: a spark swaying side to
  side along a short rail while thinking (2.4 s there and back, a trail behind it), a wave rolling along a row of beads
  while writing, a half-lit moon turning while a call is out, and the ring filling and emptying while waiting. All on a
  steady beat, never random; the painter's own lane never counts as a call out.

## 1.6.1

- Spark's answers in her pane can run to 250 characters (they were 160, and sometimes ended mid-word). She is asked
  for whole sentences, never cut mid-thought.

## 1.6.0

- **Claude's own line.** While a turn runs, a line in Claude's colour sits above Spark's text: Claude's breath, a small
  ring that fills and empties (slow while thinking, quicker while writing or calling tools), beside the word the chat's
  spinner shows: `◎ Mulling…`. It is only there while a turn really runs, and never in the replay.
- **The effort sits at the bottom.** Spark's text is now her state line, then anything you are waiting on (a message,
  a side question), then the effort asked for (`xhigh effort`, dim), which never changes within a turn. The text keeps
  at least three rows, so the painting below never moves as lines come and go.
- **A whole brush for the painter.** Beyond lines, dots, rings and glows, the painter now has smooth curves, arcs,
  filled shapes with a colour running across them, and sprays of specks (stars, rain, dust); up to 96 marks of up to
  24 points, widths and radii twice what they were, any colour it likes (Spark's are home, not a rule), and a mirror
  (x, y or both) that draws every mark again reflected, for faces, creatures and symmetric things. It is asked to paint
  whatever it wants, abstract or figurative, and to never settle into one habit. The renderer gained filled polygons
  (with a soft edge and a gradient) and arcs. A spray is seeded, so it is the same specks every time it is drawn.
- **"Your message is waiting" lets go when it should.** A message you send mid-turn can be taken in as a prompt row of
  its own, not only as a queued_command; both now count as taking it in, so the waiting bead and line no longer stay
  after the model has read it. A new turn's own prompt is never mistaken for one.

## 1.5.9

- The side pane opens roomy again. It is a quarter of the widest terminal width Spark knows (30 to 44 columns), and
  she now learns that width from what the terminal really draws (her own pane, the band, the chat's spinner) as well as
  from the command, which could report less than the terminal is. With nothing known yet it opens at 44, not 36.
- New setting **Side pane width** (`sideWidth`, 24 to 120 columns; 0, the default, is automatic): the side pane opens
  that wide every time. A size you drag still wins for the session.

## 1.5.8

- **The story of the session.** Spark keeps every painting of the session, in order (in memory only, at most 60).
  `/spark story` tells them again in her pane: each laid down anew, mark by mark, then held, 7 seconds apiece, with a
  small line saying where it is in the story and when it was painted (`story · 3 of 9 · 21:01 · while it worked` for a
  live one). Round and round until `/spark story` again or a new painting arrives. No model is asked, so it costs no
  tokens; it works with the painter off too. `/clear` lets the story go.

## 1.5.7

- **Talk to Spark.** With the painter on, her pane ends in a line, *say something to Spark*: click her pane and type.
  She answers under the painting in her own voice (at most 160 characters) and makes a move of hers toward you (bloom,
  lean, ring, shimmer or hush), turning toward you as you send it. She answers from what she already holds: her state,
  her last painting's title, the builder's last reflection and the turn's shape. One small call on the painter's model,
  about 1k tokens, counted in the session's total; never a re-read of the session. What you said and her answer stay in
  her pane until painting goes off or `/clear`. In a pane too small for the painting and the talk, the talk waits.
- **Spark says "working" the chat's way.** While she is plainly working or waiting on the model (not thinking, writing
  or on a call of her own kind), her state line uses the word Claude Code's spinner is showing for the turn:
  "Spark · Processing", "Spark · Channeling". It is read as the spinner is drawn and never changes it; the replay never borrows it.

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
