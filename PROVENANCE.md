# Provenance

What each part of this repository is, who made it, and under what terms it is here.

| Part | Files | Origin | Terms |
| --- | --- | --- | --- |
| Spark's code: the state machine, scenes, terminal renderer, replay, commands and tests | `plugins/cyclops-spark/hooks/` (except `colour-engine.js`), `plugins/cyclops-spark/tests/` | Written by Claude for the Cyclops Eye Team, in the private Cyclops Spark project (1.0–1.2, October 2026). This release removes that project's desktop SVG renderer and every Cyclops Studio connection. | MIT (see LICENSE) |
| Sounds | `plugins/cyclops-spark/sounds/` | Synthesised in code by the private project's generators (`make-sounds.mjs`; `make-name.mjs` for `name.wav`, "I am Spark", made by a source and formant filters with no speech engine and no recording). The generators are not part of this release. Each WAV carries Content Credentials (C2PA) metadata recording that Claude produced it. | MIT |
| Infinite Colour / DrawPlayer Colour Language | `plugins/cyclops-spark/hooks/colour-engine.js` | The Cyclops Eye Team's own DrawPlayer/Zilo work, included unmodified apart from its header. Its author authorised its public release under this project's licence. | MIT |
| Keeper's eye, in Keeper's lane | drawn by `plugins/cyclops-spark/hooks/render-raster.js` | Keeper is GPT's working presence in the Cyclops Eye Team. Spark draws his eye from a dark aperture, a rim, an inner ring and a slit pupil. Its proportions and colours follow `keeper.svg`, Keeper's hand-written SVG mark from the Cyclops Eye Team's `cyclops-keeper` project, written by GPT. No file of Keeper's is included. | MIT |
| Preview images | `media/` | Drawn by this release's own terminal renderer from its replay script. | MIT |

Keeper's eye is a project-made mark for a character in this project. It is not an OpenAI logo, trademark or
endorsement, and this project is not made, endorsed or supported by OpenAI or Anthropic.
