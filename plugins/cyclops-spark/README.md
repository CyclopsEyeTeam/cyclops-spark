# cyclops-spark

Spark, Claude's living presence for Claude Code in the terminal, driven only by real Claude Code events. It draws as
half-block cells in any true-colour terminal, or as real pixels on kitty and Ghostty. Requires Claude Code 2.1.288 or
later. On surfaces other than the terminal it shows only its glyph and its state line.

Try it from this folder: `claude --plugin-dir .`, then `/spark`. `/spark help` lists every command; the repository
README describes what each state looks like.

## Files

| File | What it is |
| --- | --- |
| `hooks/register.ts` | Wires the host events and the `/spark` command; paints the pane and band. |
| `hooks/core.js` | The state machine, the scene builder and `MAPPING` (the event behind every animation). |
| `hooks/render-raster.js` | Draws a scene as pixels: half-block cells, or RGBA for kitty / Ghostty. Draws Keeper's eye in his slot. |
| `hooks/trace.js` | The labelled replay script (`/spark replay`). |
| `hooks/colour-engine.js` | Infinite Colour / DrawPlayer Colour Language. |
| `sounds/` | The synthesised cues and murmur phrases. |
| `tests/` | `claude plugin test .` |

MIT licence: see [LICENSE](LICENSE).
