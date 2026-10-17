// /spark convert: a painting made large, three ways (faithful, refined, interpretive), as SVG and PNG into the convert
// folder. The one time Spark writes files, and only when asked.
import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { parsePainting, paintingScene } from '../hooks/painter.js'
import { canvasFor, captionHeight, captionLines, captionStrip, flattenRGBA, galleryHTML, revisitRequest, rollLayout, rollSize, sceneSVG, slug, titleCard, titleCardAsync, withCaption } from '../hooks/convert.js'
import { base64, base64Async, createRaster, spill, toQuadrants, toQuadrantsClassic, toRGB8, toRGB8Async } from '../hooks/render-raster.js'
import { blur, layeredRaster, layeredStepper, layersOf } from '../hooks/layered.js'
import { BEAT, colourOf, rollHolds, rollScore } from '../hooks/music.js'

const loose = <T>(v: unknown) => v as T
const cmd = ($: Engine, args: string) => $.command.run(loose({ command: 'spark', args, origin: { kind: 'person' }, presentation: {} }))
const say = async ($: Engine, args: string) => String((await cmd($, args)).text ?? '')
const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve() }

const PAINTING = JSON.stringify({
  title: 'a fox under three moons', mirror: 'x', spark: 'ring',
  marks: [
    { k: 'fill', pts: [[0, 0], [1, 0], [1, 1], [0, 1]], c: '#0b0a1e', c2: '#2a1850', grad: 0.25, a: 1 },
    { k: 'glow', x: 0.5, y: 0.6, r: 0.3, c: '#d66690', a: 0.5 },
    { k: 'curve', pts: [[0.05, 0.9], [0.3, 0.5], [0.6, 0.4], [0.95, 0.1]], w: 0.03, c: '#ffbc75', c2: '#ffe6d6', a: 0.9 },
    { k: 'arc', x: 0.8, y: 0.3, r: 0.12, w: 0.02, a0: 0.5, a1: 1, c: '#9ef2b8', a: 0.8 },
    { k: 'ring', x: 0.2, y: 0.3, r: 0.1, w: 0.02, c: '#9ef2b8', a: 0.8 },
    { k: 'spray', x: 0.5, y: 0.2, r: 0.4, n: 12, s: 0.006, c: '#ffffff', a: 0.8 },
    { k: 'dot', x: 0.95, y: 0.1, r: 0.05, c: '#ffffff', a: 1 },
  ],
})
const REFINED = JSON.stringify({ title: 'the fox, closer', spark: 'bloom', marks: Array.from({ length: 150 }, (_, i) => ({ k: 'dot', x: (i % 15) / 15, y: Math.floor(i / 15) / 10, r: 0.02, c: '#ffbc75', a: 0.8 })) })

const pane = (bodyColumns: number, bodyRows: number) => ({
  component: 'Pane', requestId: 'cyclops-spark',
  props: { title: 'Spark', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
  viewport: { columns: 160, rows: 60 },
}) as const

type Ask = { system: string; prompt: string }
function engine(on: On, { python = true, revisit = REFINED, ffmpeg = true }: { python?: boolean; revisit?: string; ffmpeg?: boolean } = {}) {
  mock.store(on)
  mock.clock(on)
  const asks: Ask[] = []
  const files = new Map<string, string>()
  const spawns: string[][] = []
  on('model.complete', async (_$, e) => {
    const x = e as unknown as { system?: string; prompt: string }
    asks.push({ system: String(x.system ?? ''), prompt: String(x.prompt) })
    const text = /You are given one of your own small paintings/.test(String(x.system)) ? revisit : PAINTING
    return loose({ value: { isAnswered: true, text, usage: { input_tokens: 900, output_tokens: 700, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } })
  })
  on('fs.write', async (_$, e) => { const { path, text } = e as { path: string; text: string }; files.set(path, text); return loose({ value: undefined }) })
  on('session.root', async () => loose({ value: '/home/t/zilo' }))
  on('process.spawn', async function* (_$, e) {
    const argv = [...(e as { argv: readonly string[] }).argv]
    spawns.push(argv)
    if (!python || (!ffmpeg && argv[0] === 'ffmpeg')) { yield { stream: 'stderr' as const, text: `env: ${argv[0]}: No such file or directory\n` }; return loose({ value: { code: 127, signal: null } }) }
    // the roll's helper says where the clip went and how long it is
    yield { stream: 'stdout' as const, text: argv[2] === 'join' ? `ok ${argv[5]} 9.4\n` : argv[2] === 'apng' ? `ok ${argv[12]} 8.7\n` : 'ok\n' }
    return loose({ value: { code: 0, signal: null } })
  })
  on('ui.open', async () => loose({ value: { isPlaced: true } }))
  on('ui.close', async () => loose({ value: undefined }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  const logs: string[] = [], toasts: string[] = []
  on('ui.log', async (_$, e) => { logs.push(String((e as { text: string }).text)); return loose({ value: undefined }) })
  on('ui.toast', async (_$, e) => { toasts.push(String((e as { text: string }).text)); return loose({ value: undefined }) })
  return { asks, files, spawns, logs, toasts }
}
// a conversion that goes on beside the work: wait (in real time) until it has said it is done
const until = async (done: () => boolean) => { for (let i = 0; i < 400 && !done(); i++) { await settle(); await new Promise((r) => setTimeout(r, 0)) } }

test('faithful: the same marks drawn large, SVG written by Spark and PNG by the helper, into the convert folder; no model is asked', async ($, on) => {
  const { asks, files, spawns } = engine(on)
  expect(await say($, 'convert')).toMatch(/^no paintings yet this session/)
  await cmd($, 'paint'); await settle()
  const before = asks.length
  const out = await say($, 'convert faithful 320')
  expect(out).toMatch(/^converted \(faithful, 320 wide\) into \/home\/t\/zilo\/spark-paintings: 01-a-fox-under-three-moons-faithful\.svg, 01-a-fox-under-three-moons-faithful\.png, index\.html$/)
  expect(asks.length).toBe(before) // nothing asked of any model
  const svg = files.get('/home/t/zilo/spark-paintings/01-a-fox-under-three-moons-faithful.svg')!
  expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="320" height="230"/) // wide: 2:1, the painting's own shape, and the caption strip under it
  expect(svg).toMatch(/<text [^>]*font-style="italic">a fox under three moons<\/text><text [^>]*>Spark · \d{1,2} \w{3} \d{4} · faithful<\/text>/) // the caption, on the picture
  expect(svg).toContain('<title>a fox under three moons</title>')
  expect(svg).toContain('mix-blend-mode:screen') // additive light, as on the dark terminal
  expect((svg.match(/<polygon/g) || []).length).toBe(2) // the fill, and its mirror
  expect((svg.match(/<polyline/g) || []).length).toBe(2)
  expect((svg.match(/ A /g) || []).length).toBe(2) // the arcs
  expect((svg.match(/<circle/g) || []).length).toBeGreaterThan(28) // glows, rings, dots, the specks, all twice
  expect(svg).toContain('radialGradient')
  expect(svg).toContain('linearGradient')
  // the helper was asked for the PNG with the flattened bytes, and the gallery page lists the PNG
  expect(spawns).toHaveLength(1)
  expect(spawns[0]![0]).toBe('python3')
  expect(spawns[0]![1]).toMatch(/\/link\/spark_png\.py$/)
  expect(spawns[0]!.slice(2)).toEqual(['/home/t/zilo/spark-paintings/01-a-fox-under-three-moons-faithful.rgb.b64', '/home/t/zilo/spark-paintings/01-a-fox-under-three-moons-faithful.png', '320', '230', '1']) // one part: a small picture
  expect(files.has('/home/t/zilo/spark-paintings/01-a-fox-under-three-moons-faithful.rgb.b64')).toBe(false) // the bytes go in numbered parts, never one file
  const b64 = files.get('/home/t/zilo/spark-paintings/01-a-fox-under-three-moons-faithful.rgb.b64.0')!
  expect(b64.length).toBe(Math.ceil((320 * 230 * 3) / 3) * 4) // base64 of exactly W×H×3 bytes, the caption strip included
  const page = files.get('/home/t/zilo/spark-paintings/index.html')!
  expect(page).toContain('<img src="01-a-fox-under-three-moons-faithful.png" alt="a fox under three moons">')
  expect(page).toContain('faithful')
  await cmd($, 'paint off')
})

test('refined and interpretive ask the painter once, with its own program, and may use more marks; what comes back is drawn large', async ($, on) => {
  const { asks, files } = engine(on)
  await cmd($, 'paint'); await settle()
  const n0 = asks.length
  expect(await say($, 'convert refined 256')).toMatch(/^converted \(refined, 256 wide\) into .*01-the-fox-closer-refined\.svg, 01-the-fox-closer-refined\.png, index\.html$/) // the first conversion of this session
  expect(asks.length).toBe(n0 + 1)
  const ask = asks.at(-1)!
  expect(ask.system).toMatch(/refined, for a large canvas: keep its subject, composition and colours/)
  expect(ask.prompt).toContain('"a fox under three moons" (mirror: x)')
  expect(ask.prompt).toMatch(/"k":"curve","pts":\[\[0\.05,0\.9\]/) // its own marks, given back
  expect(ask.prompt).toMatch(/Use up to 240 marks/)
  const svg = files.get('/home/t/zilo/spark-paintings/01-the-fox-closer-refined.svg')!
  expect((svg.match(/<circle/g) || []).length).toBe(150) // more marks than the pane allows: kept
  expect(await say($, 'convert interpretive 256')).toMatch(/interpretive, 256 wide/)
  expect(asks.at(-1)!.system).toMatch(/revisit it freely: a new work derived from the original/)
  expect(await say($, 'state')).toMatch(/painter · 1 painting · \d+(\.\d+)?k tokens/) // the two calls count in the session's total
  await cmd($, 'paint off')
})

test('all converts every painting of the session faithfully, in order; a size word is checked; without python3 the SVG still comes and it says so', async ($, on) => {
  const { files, spawns, logs } = engine(on, { python: false })
  await cmd($, 'paint'); await say($, 'paint'); await settle()
  expect(await say($, 'convert sideways')).toMatch(/^convert takes: truest \| faithful/)
  expect(await say($, 'convert faithful huge')).toMatch(/^convert size: hd/)
  expect(await say($, 'convert all faithful 256')).toMatch(/^converting all 2 paintings, faithful, 256 wide, into .*: no tokens\. It goes on beside the work/) // more than one picture: beside the work, so the command never runs past its time
  await until(() => logs.length >= 1)
  const out = logs.at(-1)!.replace(/^Spark: /, '')
  expect(out).toMatch(/^converted \(all, faithful, 256 wide\)/)
  expect(out).toMatch(/01-a-fox-under-three-moons-faithful\.svg, 02-a-fox-under-three-moons-faithful\.svg, index\.html\. no PNG: python3 was not found/)
  expect([...files.keys()].filter((f) => f.endsWith('.svg'))).toHaveLength(2)
  expect(spawns).toHaveLength(2)
  const page = files.get('/home/t/zilo/spark-paintings/index.html')!
  expect(page).toContain('<img src="01-a-fox-under-three-moons-faithful.svg"') // the SVG stands in for the PNG
  await cmd($, 'paint off')
})

test('the convert folder setting is honoured, relative to the project or absolute', { options: { convertFolder: '/home/t/Pictures/spark' } }, async ($, on) => {
  const { files } = engine(on)
  await cmd($, 'paint'); await settle()
  expect(await say($, 'convert faithful 256')).toMatch(/into \/home\/t\/Pictures\/spark:/)
  expect([...files.keys()].every((f) => f.startsWith('/home/t/Pictures/spark/'))).toBe(true)
  await cmd($, 'paint off')
})

test('the pieces: slugs, canvases, the flattened bytes, and an SVG that stands on its own', () => {
  expect(slug('Long climb, nothing lost — all held still!', 7)).toBe('07-long-climb-nothing-lost-all-held-still')
  expect(slug('', 12)).toBe('12-untitled')
  expect(canvasFor('wide', 1920)).toEqual([1920, 960])
  expect(canvasFor('square', 1920)).toEqual([1920, 1920])
  expect(canvasFor('tall', 1920)).toEqual([1920, 3840])
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 0]) // one red pixel, one fully transparent
  expect([...flattenRGBA(rgba, 2, 1, [0.5, 0.5, 0.5])]).toEqual([255, 0, 0, 128, 128, 128])
  const p = parsePainting(PAINTING)!
  const svg = sceneSVG(paintingScene(p, 200, 100), 200, 100, { theme: 'light', title: 'a < b & c' })
  expect(svg).toContain('<title>a &lt; b &amp; c</title>')
  expect(svg).not.toContain('mix-blend-mode') // over on a light ground
  expect(svg).toMatch(/<rect width="200" height="100" fill="#f6f2ec"\/>/)
  // on a dark ground every mark adds its light to what is under it, as the terminal draws: plus-lighter where the
  // viewer has it, screen elsewhere, each mark on its own (not the group once)
  const dark = sceneSVG(paintingScene(p, 200, 100), 200, 100, { theme: 'dark', floor: 3 })
  expect(dark).toContain('<style>.add>*{mix-blend-mode:screen;mix-blend-mode:plus-lighter}</style>')
  expect(dark).toContain('<g class="add">')
  expect(dark).toMatch(/<circle [^>]*r="3"/) // a speck is no thinner than the floor
  // the PNG's bytes are the terminal's own shade: light added to light, clipped at white, then the ground under what is left
  const r = createRaster(8, 4)
  r.draw([{ k: 'dot', x: 0, y: 0, r: 1, c: [1, 1, 1], a: 0.7 }, { k: 'dot', x: 0, y: 0, r: 1, c: [1, 1, 1], a: 0.7 }], 'dark')
  const flat = toRGB8(r, [0.07, 0.07, 0.08])
  expect(flat[(2 * 8 + 4) * 3]).toBe(255) // the centre: two seven-tenths of white add past white
  expect(flat[0]).toBe(18) // a corner: the ground alone
  // HD cells: a cell is 2 x 4 pixels; one lit quarter is that quarter's glyph, lit in full, over the terminal's background
  const q = createRaster(2, 4)
  q.px.fill(0); q.px.set([1, 1, 1, 1], (0 * 2 + 1) * 4); q.px.set([1, 1, 1, 1], (1 * 2 + 1) * 4) // the top-right quarter
  expect([...toQuadrants(q, [0, 0, 0])]).toEqual([0x259d, 0xffffff, 0x01000000])
  q.px.fill(0); for (let y = 0; y < 4; y++) q.px.set([1, 0, 0, 1], (y * 2) * 4) // the left half
  expect([...toQuadrants(q, [0, 0, 0])]).toEqual([0x258c, 0xff0000, 0x01000000])
  q.px.fill(0)
  expect([...toQuadrants(q, [0, 0, 0])]).toEqual([0x20, 0x01000000, 0x01000000]) // nothing: the terminal's own
  // faint everywhere (each side under a third of cover): a space, never a glyph in the terminal's text colour
  q.px.fill(0); for (let i = 0; i < 8; i++) q.px.set([0.1, 0.1, 0.12, 0.12], i * 4)
  expect([...toQuadrants(q, [0, 0, 0])]).toEqual([0x20, 0x01000000, 0x01000000])
  // a whole Spark, any frame: no cell draws its glyph in the default foreground
  for (let t = 0; t < 40; t++) {
    const r = createRaster(88, 88)
    const pts = Array.from({ length: 8 }, (_, k) => ({ k: 'path', pts: [[0, 0], [Math.cos(k + t) * 1.1, Math.sin(k * 1.3 + t) * 1.1]], w: 0.01 + (t % 5) * 0.004, c0: [1, 0.9, 0.85], c1: [0.6, 0.5, 0.7], a: 0.3 + (t % 7) / 10 }))
    r.draw([{ k: 'glow', x: 0, y: 0, r: 0.4, c: [1, 0.8, 0.9], a: 0.6 }, ...pts], 'dark', { res: 2 })
    const w = toQuadrants(r, [0.07, 0.07, 0.08])
    for (let i = 0; i < w.length; i += 3) if (w[i] !== 0x20) expect(w[i + 1]).not.toBe(0x01000000)
  }
  expect(galleryHTML([{ file: 'x.png', title: 'a "quoted" one', when: '21:01', mode: 'faithful' }])).toContain('alt="a &quot;quoted&quot; one"')
  const rq = revisitRequest({ painting: p, mode: 'interpretive' })
  expect(rq.prompt).not.toContain('seed') // the painter sees its marks, not the renderer's bookkeeping
})

test('a bare /spark convert asks what, then which way, in Claude Code\'s own dialog, each with its cost, and does what you click; dismissed, it does nothing', async ($, on) => {
  const { files, asks } = engine(on)
  const answers: string[] = []
  const asked: Array<{ question: string; labels: string[] }> = []
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    const q = (e as { questions: Array<{ question: string; options: Array<{ label: string }> }> }).questions
    asked.push({ question: q[0]!.question, labels: q[0]!.options.map((o) => o.label) })
    const a = answers.shift()
    if (a === undefined) return loose({ result: 'dismissed', isError: true })
    const label = q[0]!.options.map((o) => o.label).find((l) => l.startsWith(a)) ?? a
    return loose({ result: { questions: q, answers: { [q[0]!.question]: label } } })
  })
  expect(await say($, 'convert')).toMatch(/^no paintings yet this session/) // nothing to ask about yet
  expect(asked).toHaveLength(0)
  await cmd($, 'paint'); await settle()
  const n0 = asks.length
  answers.push('This painting', 'Refined')
  const out = await say($, 'convert')
  expect(asked[0]!.question).toBe('What shall Spark make large?')
  expect(asked[0]!.labels[0]).toBe('This painting…')
  expect(asked[0]!.labels[1]).toMatch(/^Every way, this painting · about \d+(\.\d)?k tokens$/)
  expect(asked[0]!.labels.slice(2)).toEqual(['All 1 painting…', 'The roll: all 1 as a clip…'])
  expect(asked[1]!.question).toBe('Which way, this painting?')
  expect(asked[1]!.labels[0]).toBe('Truest · no tokens')
  expect(asked[1]!.labels[1]).toBe('Faithful · no tokens')
  expect(asked[1]!.labels[2]).toMatch(/^Refined · about \d+(\.\d)?k tokens$/)
  expect(asked[1]!.labels[3]).toMatch(/^Interpretive · about \d+(\.\d)?k tokens$/)
  expect(out).toMatch(/^converted \(refined, 1920 wide\)/)
  expect(asks.length).toBe(n0 + 1) // the refined way: the painter asked once
  expect([...files.keys()].some((f) => f.endsWith('-refined.svg'))).toBe(true)
  expect(await say($, 'convert')).toBe('convert: nothing chosen') // dismissed: nothing
  answers.push('This painting') // the second dismissed: nothing either
  expect(await say($, 'convert')).toBe('convert: nothing chosen')
  await cmd($, 'paint off')
})

test('the caption is drawn on the picture itself: the title bright, the line under it dim, in a small bitmap font scaled to the width; off by the setting', async ($, on) => {
  const lines = captionLines('Long climb, nothing lost', 'refined', '14 Oct 2026')
  expect(lines).toEqual([{ text: 'Long climb, nothing lost', dim: false }, { text: 'Spark · 14 Oct 2026 · refined', dim: true }])
  expect(captionHeight(1920)).toBe(4 * 4 + 2 * (11 * 4 + 12) + 12) // scale 4 at 1920 wide
  expect(captionHeight(480)).toBeLessThan(captionHeight(1920))
  const W = 480, ground = [0.07, 0.07, 0.08]
  const strip = captionStrip(W, lines, ground)
  expect(strip.length).toBe(W * captionHeight(W) * 3)
  let bright = 0, dim = 0
  for (let i = 0; i < strip.length; i += 3) { if (strip[i] === 236) bright++; else if (strip[i] === 150) dim++ }
  expect(bright).toBeGreaterThan(200) // the title's pixels
  expect(dim).toBeGreaterThan(200)    // the dim line's
  const { rgb, H } = withCaption(new Uint8Array(W * 10 * 3), W, 10, lines, ground)
  expect(H).toBe(10 + captionHeight(W))
  expect(rgb.length).toBe(W * H * 3)
  // accents fall back to their plain letter, the unknown to '?', and nothing throws
  expect(() => captionStrip(W, [{ text: 'café — ✎ ñ', dim: false }], ground)).not.toThrow()
  // the SVG without a caption keeps its bare height
  const p = parsePainting(PAINTING)!
  expect(sceneSVG(paintingScene(p, 200, 100), 200, 100)).toMatch(/height="100"/)
  expect(sceneSVG(paintingScene(p, 200, 100), 200, 100, { caption: lines })).toMatch(/height="1\d\d"/)
})

test('the caption setting off: the picture alone', { options: { convertCaption: false } }, async ($, on) => {
  const { files, spawns } = engine(on)
  await cmd($, 'paint'); await settle()
  await say($, 'convert faithful 320')
  expect(spawns[0]!.slice(4)).toEqual(['320', '160', '1'])
  expect(files.get('/home/t/zilo/spark-paintings/01-a-fox-under-three-moons-faithful.svg')!).not.toContain('<text')
  await cmd($, 'paint off')
})

test('a big picture goes to the helper in parts, each under what one write may carry, numbered in order', async ($, on) => {
  const { files, spawns } = engine(on)
  await cmd($, 'paint'); await settle()
  expect(await say($, 'convert faithful 1600')).toMatch(/^converted \(faithful, 1600 wide\)/)
  const [, , b64Path, , w, h, parts] = spawns[0]!
  expect(b64Path).toBe('/home/t/zilo/spark-paintings/01-a-fox-under-three-moons-faithful.rgb.b64')
  const total = Math.ceil((Number(w) * Number(h) * 3) / 3) * 4
  expect(total).toBeGreaterThan(4 * 1024 * 1024) // the whole would not fit one write
  expect(Number(parts)).toBe(Math.ceil(total / 3_000_000))
  let joined = 0
  for (let k = 0; k < Number(parts); k++) {
    const part = files.get(`${b64Path}.${k}`)!
    expect(part.length).toBeLessThanOrEqual(3_000_000)
    expect(part.length).toBeGreaterThan(0)
    joined += part.length
  }
  expect(joined).toBe(total)
  expect(files.has(`${b64Path}.${parts}`)).toBe(false)
  await cmd($, 'paint off')
})

test('all paintings, every way, and the costs: what then which way; anything with more than one picture goes on beside the work and Spark says when done', async ($, on) => {
  const { files, asks, logs, toasts } = engine(on)
  const answers: string[] = []
  const asked: Array<{ question: string; labels: string[] }> = []
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    const q = (e as { questions: Array<{ question: string; options: Array<{ label: string }> }> }).questions
    asked.push({ question: q[0]!.question, labels: q[0]!.options.map((o) => o.label) })
    const a = answers.shift()
    if (a === undefined) return loose({ result: 'dismissed', isError: true })
    const label = q[0]!.options.map((o) => o.label).find((l) => l.startsWith(a)) ?? a
    return loose({ result: { questions: q, answers: { [q[0]!.question]: label } } })
  })
  await cmd($, 'paint'); await say($, 'paint'); await say($, 'paint'); await settle()
  // all, faithfully: three pictures, beside the work
  answers.push('All 3 paintings', 'Faithful')
  expect(await say($, 'convert 256')).toMatch(/^converting all 3 paintings, faithful, 256 wide, into .*: no tokens/)
  expect(asked[1]!.question).toBe('All 3 paintings: which way?')
  expect(asked[1]!.labels[2]).toMatch(/^Refined · about \d+(\.\d)?k tokens$/)
  await until(() => logs.length >= 1)
  expect(logs.at(-1)).toMatch(/^Spark: converted \(all, faithful, 256 wide\)/)
  // this painting every way: four pictures, two of them painter calls
  let n0 = asks.length
  answers.push('Every way')
  expect(await say($, 'convert 256')).toMatch(/^converting this painting every way, 256 wide, into \/home\/t\/zilo\/spark-paintings: 2 painter calls, about \d+(\.\d)?k tokens/)
  await until(() => logs.length >= 2)
  expect(asks.length).toBe(n0 + 2)
  for (const w of ['truest', 'faithful', 'refined', 'interpretive']) expect([...files.keys()].some((f) => f.endsWith(`-${w}.svg`))).toBe(true)
  expect(logs.at(-1)).toMatch(/^Spark: converted \(every way, 256 wide\)/)
  expect(toasts.at(-1)).toBe('Spark: converted this painting every way')
  // now the costs are from what those calls really used: 900 + 700 tokens each, as the mock answers
  answers.push('This painting', 'Refined')
  expect(await say($, 'convert 256')).toMatch(/^converted \(refined, 256 wide\)/)
  expect(asked.at(-1)!.labels[2]).toBe('Refined · about 1.6k tokens')
  answers.push('All 3 paintings')
  expect(await say($, 'convert')).toBe('convert: nothing chosen')
  expect(asked.at(-2)!.labels[1]).toBe('Every way, this painting · about 3.2k tokens')
  expect(asked.at(-1)!.labels[3]).toBe('Interpretive · about 4.8k tokens')
  // typed: all with its way and size; the old word three is every
  n0 = asks.length
  expect(await say($, 'convert all refined 256')).toMatch(/^converting all 3 paintings, refined, 256 wide, into .*: 3 painter calls, about 4\.8k tokens/)
  await until(() => logs.length >= 3)
  expect(asks.length).toBe(n0 + 3)
  expect(toasts.at(-1)).toBe('Spark: converted all 3 paintings, refined')
  answers.push('Interpretive')
  expect(await say($, 'convert all 256')).toMatch(/^converting all 3 paintings, interpretive/) // all alone asks which way
  await until(() => logs.length >= 4)
  expect(await say($, 'convert three 256')).toMatch(/^converting this painting every way/)
  await until(() => logs.length >= 5)
  expect(await say($, 'convert sideways')).toMatch(/^convert takes: truest \| faithful/)
  await cmd($, 'paint off')
})

test('truest: the painting as you see it in the terminal: each mark the weight of a terminal cell, drawn flat, its light in the terminal\'s colour depth (16 levels a channel, the bands you see); nothing added; no tokens, beside the work', async ($, on) => {
  const { files, spawns, logs, asks } = engine(on)
  await cmd($, 'paint'); await settle()
  const n0 = asks.length
  expect(await say($, 'convert truest 320')).toMatch(/^converting this painting, truest, 320 wide, into .*: no tokens\. It goes on beside the work/)
  await until(() => logs.length >= 1)
  expect(asks.length).toBe(n0)
  expect(logs.at(-1)).toMatch(/^Spark: converted \(truest, 320 wide\) into .*01-a-fox-under-three-moons-truest\.svg, 01-a-fox-under-three-moons-truest\.png, index\.html$/)
  const svg = files.get('/home/t/zilo/spark-paintings/01-a-fox-under-three-moons-truest.svg')!
  expect(svg).toContain('<filter id="levels"') // the colour depth, in the SVG too
  expect(svg).toMatch(/<feFuncR type="discrete" tableValues="0 0\.0667 0\.0667 0\.1333/) // rounding to sixteen levels
  for (const added of ['<filter id="shadow"', '<filter id="bloom"', '<filter id="soft0"']) expect(svg).not.toContain(added) // no shadows, bloom or softening: the renderer's, not the painting's
  expect(spawns.at(-1)!.slice(4, 6)).toEqual(['320', String(160 + captionHeight(320))])
  // the PNG's bytes: the picture (above its caption) wholly on the sixteen levels
  const b64 = files.get('/home/t/zilo/spark-paintings/01-a-fox-under-three-moons-truest.rgb.b64.0')!
  const bin = atob(b64), bytes = Array.from({ length: 320 * 160 * 3 }, (_, i) => bin.charCodeAt(i))
  expect(bytes.every((v) => v % 17 === 0)).toBe(true)
  await cmd($, 'paint off')
})

test('layered, the depth pass truest grew out of, is kept as a word to compare: its layers, the far ones softened, shadows, the bloom', async ($, on) => {
  const { files, logs } = engine(on)
  await cmd($, 'paint'); await settle()
  expect(await say($, 'convert layered 320')).toMatch(/^converting this painting, layered, 320 wide/)
  await until(() => logs.length >= 1)
  const svg = files.get('/home/t/zilo/spark-paintings/01-a-fox-under-three-moons-layered.svg')!
  expect(svg).toContain('<filter id="shadow"')
  expect(svg).toContain('<filter id="soft0"') // the farthest layer softened
  expect(svg).toContain('<filter id="bloom"')
  expect((svg.match(/<g id="layer\d"/g) || []).length).toBeGreaterThanOrEqual(2)
  expect(svg).not.toContain('<filter id="levels"')
  await cmd($, 'paint off')
})

test('the layers: the marks in their order, back to front; laid down a little at a time, the last frame is the whole picture', async () => {
  const p = parsePainting(PAINTING)!
  const layers = layersOf(p)
  expect(layers.map((l) => l.marks.length).reduce((a, b) => a + b, 0)).toBe(p.marks.length)
  expect(layers[0]!.marks[0]).toEqual(p.marks[0]) // the first mark laid is the farthest
  const W = 64, H = 32
  const st = layeredStepper(p, W, H)
  const empty = await st.frame(0)
  expect(Math.max(...empty)).toBe(0) // nothing laid yet
  await st.frame(p.marks.length / 2)
  const end = await st.frame(p.marks.length)
  const whole = (await layeredRaster(p, W, H)).px
  let diff = 0
  for (let i = 0; i < whole.length; i++) diff = Math.max(diff, Math.abs(whole[i]! - end[i]!))
  expect(diff).toBeLessThan(1e-5) // laid down step by step or at once: the same picture
  // softening keeps the light: a blurred point spreads, its total stays
  const px = new Float32Array(9 * 9 * 4); px[(4 * 9 + 4) * 4] = 1; px[(4 * 9 + 4) * 4 + 3] = 1
  blur(px, 9, 9, 4)
  let sum = 0
  for (let i = 0; i < px.length; i += 4) sum += px[i]!
  expect(sum).toBeGreaterThan(0.6); expect(px[(4 * 9 + 4) * 4]!).toBeLessThan(0.5)
})

test('one picture larger than HD goes beside the work too (a command has ten seconds of its own); the fill is exact by scanlines', async ($, on) => {
  const { logs, toasts, spawns } = engine(on)
  await cmd($, 'paint'); await settle()
  expect(await say($, 'convert faithful 2400')).toMatch(/^converting this painting, faithful, 2400 wide, into .*: no tokens\. It goes on beside the work/)
  await until(() => logs.length >= 1)
  expect(logs.at(-1)).toMatch(/^Spark: converted \(faithful, 2400 wide\)/)
  expect(toasts.at(-1)).toBe('Spark: converted this painting, faithful')
  expect(spawns[0]!.slice(4, 6)).toEqual(['2400', String(1200 + captionHeight(2400))])
  // a rectangle with edges on pixel edges and through pixel middles: whole pixels inside, halves on the half edges
  const r = createRaster(8, 8) // scale 8/2.4: a unit of the scene is 3.333 px, the centre at (4, 4)
  const u = 1 / (8 / 2.4)
  r.draw([{ k: 'poly', pts: [[-2 * u, -2 * u], [2.5 * u, -2 * u], [2.5 * u, 1 * u], [-2 * u, 1 * u]], c0: [1, 1, 1], a: 1 }], 'dark') // x 2..6.5, y 2..5
  const cov = (x: number, y: number) => r.px[(y * 8 + x) * 4 + 3]!
  expect(cov(3, 3)).toBe(1); expect(cov(6, 3)).toBe(0.5); expect(cov(7, 3)).toBe(0); expect(cov(3, 5)).toBe(0); expect(cov(1, 3)).toBe(0)
  await cmd($, 'paint off')
})

test('/spark convert roll: every painting laid down, held and crossfaded into a clip; frames by Spark, the MP4 by ffmpeg, beside the work; no tokens', async ($, on) => {
  const { files, spawns, logs, toasts, asks } = engine(on)
  expect(await say($, 'convert roll faithful')).toMatch(/^no paintings yet this session/)
  await cmd($, 'paint'); await say($, 'paint'); await settle()
  expect(await say($, 'convert roll huge')).toMatch(/^roll size: hd/)
  const n0 = asks.length
  const started = await say($, 'convert roll faithful 320')
  const holds = rollHolds([parsePainting(PAINTING)!, parsePainting(PAINTING)!]) // each painting's own hold, set by the music
  expect(holds[1]!).toBeGreaterThan(holds[0]!) // the last held longest
  expect(started).toMatch(new RegExp(`^rolling all 2 paintings into a clip, faithful, 320x180 MP4, about ${Math.round(3.5 - 0.6 + 4 + holds[0]! + holds[1]! - 0.6)} s long, into /home/t/zilo/spark-paintings: opening with a title card, “zilo”, then each laid down, held with its title for a bar or two of its own \\(the last longest\\), then crossfaded into the next, to music of its own, read from the paintings\\. No tokens\\.`)) // the title: the project's folder
  expect(await say($, 'convert roll faithful 320')).toMatch(/^Spark is still converting: \d of 2 \(the roll, faithful\)/)
  await until(() => logs.length >= 1)
  expect(asks.length).toBe(n0) // nothing asked of any model
  expect(spawns[0]).toEqual(['ffmpeg', '-hide_banner', '-version'])
  const helper = spawns.filter((a) => a[0] === 'python3')
  expect(helper.map((a) => a[2])).toEqual(['segment', 'segment', 'segment', 'music', 'join']) // one painting at a time, the title card, its music, then the whole
  const work = helper[0]![3]!
  expect(work).toMatch(/^\/home\/t\/zilo\/spark-paintings\/\.spark-roll-\d{4}-\d\d-\d\d-\d{4}$/)
  expect(helper[0]!.slice(4)).toEqual(['1', '24', '320', '180', '1', '12', String(holds[0])]) // 24 frames laid down at 12 a second, then held for its own time; the first painting second in the clip
  expect(helper[2]!.slice(4)).toEqual(['0', '12', '320', '180', '1', '12', '2.5']) // the title card: up over 12 frames, then held, first in the clip
  // the music: a score read from the paintings, played into a WAV, laid under the clip
  const score = JSON.parse(files.get(`${work}/score.json`)!)
  expect(score.key).toMatch(/^[A-G][b#]? (major|dorian|aeolian)$/)
  expect(Math.abs(score.total - (3.5 - 0.6 + (2 + holds[0]!) + (2 + holds[1]!) - 0.6))).toBeLessThan(1e-6) // the title's 3.5 s, then the paintings, each for its own time
  expect(score.events.filter((e: { v: string }) => e.v === 'pad')).toHaveLength(3) // the opening's home chord, then a chord for each painting
  expect(Math.abs(score.chords[0].t - 2.9)).toBeLessThan(1e-6) // the first painting's chord as it comes in
  expect(helper[3]!.slice(3)).toEqual([`${work}/score.json`, `${work}/music.wav`])
  expect(helper[4]!.slice(4)).toEqual(['3', helper[4]![5]!, [3.5, 2 + holds[0]!, 2 + holds[1]!].join(','), '0.6', `${work}/music.wav`]) // a length for each part
  expect(helper[4]![5]).toMatch(/\/spark-paintings\/spark-roll-\d{4}-\d\d-\d\d-\d{4}-faithful\.mp4$/)
  // the frames: 24 a painting, the whole frame as base64 text
  const frames = [...files.keys()].filter((f) => f.startsWith(work + '/') && f.includes('.b64.'))
  expect(frames).toHaveLength(48 + 12)
  // the title card's last frame: the eye and the title, bright on the ground
  const card = Uint8Array.from(atob(files.get(`${work}/f000-011.b64.0`)!), (c) => c.charCodeAt(0))
  let bright = 0, blue = 0
  for (let i = 0; i < card.length; i += 3) { if (card[i]! + card[i + 1]! + card[i + 2]! > 600) bright++; if (card[i + 2]! > 200 && card[i]! < 120) blue++ }
  expect(bright).toBeGreaterThan(100) // the title's letters and the white of the eye
  expect(blue).toBeGreaterThan(50) // its lids
  const last = files.get(`${work}/f001-023.b64.0`)!
  expect(last.length).toBe(Math.ceil((320 * 180 * 3) / 3) * 4)
  const rgb = Uint8Array.from(atob(last), (c) => c.charCodeAt(0))
  const at = (x: number, y: number) => [rgb[(y * 320 + x) * 3]!, rgb[(y * 320 + x) * 3 + 1]!, rgb[(y * 320 + x) * 3 + 2]!]
  expect(at(0, 0)).toEqual([18, 18, 20]) // the ground beside a wide painting... or the painting itself: either way a real colour
  const lit = (y0: number, y1: number) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < 320; x++) { const [r, g, b] = at(x, y); if (r + g + b > 200) n++ } return n }
  expect(lit(0, 120)).toBeGreaterThan(50) // the painting, laid down whole by the last frame
  expect(lit(150, 180)).toBeGreaterThan(20) // its title under it
  const first = Uint8Array.from(atob(files.get(`${work}/f001-000.b64.0`)!), (c) => c.charCodeAt(0))
  let differ = 0
  for (let i = 0; i < first.length; i++) if (first[i] !== rgb[i]) differ++
  expect(differ).toBeGreaterThan(1000) // laid down mark by mark: the first frame is not the last
  expect(logs.at(-1)).toMatch(/^Spark: rolled 2 paintings \(faithful\), opening with “zilo”, into \/home\/t\/zilo\/spark-paintings\/spark-roll-.*-faithful\.mp4 \(320x180 MP4, with its own music in [A-G][b#]? (major|dorian|aeolian), 9 s\), and the gallery page$/)
  expect(toasts.at(-1)).toBe('Spark: the roll is ready (2 paintings, faithful)')
  expect(files.get('/home/t/zilo/spark-paintings/index.html')).toMatch(/<video src="spark-roll-.*-faithful\.mp4" controls loop muted playsinline><\/video>/)
  await cmd($, 'paint off')
})

test('the roll in any way: asked which (each with its cost), truest laid down in depth, refined with the painter revisiting each first', { timeoutMs: 30000 }, async ($, on) => {
  const { files, spawns, logs, asks } = engine(on)
  const answers: string[] = []
  const asked: Array<{ question: string; labels: string[] }> = []
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    const q = (e as { questions: Array<{ question: string; options: Array<{ label: string }> }> }).questions
    asked.push({ question: q[0]!.question, labels: q[0]!.options.map((o) => o.label) })
    const a = answers.shift()
    if (a === undefined) return loose({ result: 'dismissed', isError: true })
    const label = q[0]!.options.map((o) => o.label).find((l) => l.startsWith(a)) ?? a
    return loose({ result: { questions: q, answers: { [q[0]!.question]: label } } })
  })
  await cmd($, 'paint'); await say($, 'paint'); await settle()
  // from the menus: the roll, then truest
  answers.push('The roll', 'Truest')
  expect(await say($, 'convert 320')).toMatch(/^rolling all 2 paintings into a clip, truest, 320x180 MP4/)
  expect(asked[1]!.question).toBe('The roll of all 2 paintings: which way?')
  expect(asked[1]!.labels[3]).toMatch(/^Interpretive · about \d+(\.\d)?k tokens$/)
  await until(() => logs.length >= 1)
  let helper = spawns.filter((a) => a[0] === 'python3')
  expect(helper[0]!.slice(4, 10)).toEqual(['1', '24', '320', '180', '1', '12']) // truest: drawn flat, so the full 12 a second
  expect(logs.at(-1)).toMatch(/^Spark: rolled 2 paintings \(truest\), opening with “zilo”, into .*-truest\.mp4/)
  // typed: refined, the painter revisiting each painting first
  const n0 = asks.length
  expect(await say($, 'convert roll refined 320')).toMatch(/^rolling all 2 paintings into a clip, refined, .*2 painter calls, about \d+(\.\d)?k tokens/)
  await until(() => logs.length >= 2)
  expect(asks.length).toBe(n0 + 2)
  expect(logs.at(-1)).toMatch(/^Spark: rolled 2 paintings \(refined\)/)
  // and the roll alone asks which way
  answers.push('Faithful')
  expect(await say($, 'convert roll 320')).toMatch(/^rolling all 2 paintings into a clip, faithful/)
  await until(() => logs.length >= 3)
  helper = spawns.filter((a) => a[0] === 'python3')
  expect(helper.filter((a) => a[2] === 'join')).toHaveLength(3)
  expect(helper.filter((a) => a[2] === 'music')).toHaveLength(3) // music for every roll
  expect([...files.keys()].filter((f) => f.includes('.spark-roll-')).length).toBeGreaterThan(0)
  await cmd($, 'paint off')
})

test('without ffmpeg the roll is a smaller animated PNG, and Spark says how to get the MP4', { timeoutMs: 20000 }, async ($, on) => {
  const { spawns, logs } = engine(on, { ffmpeg: false })
  await cmd($, 'paint'); await settle()
  expect(await say($, 'convert roll faithful')).toMatch(/^rolling all 1 painting into a clip, faithful, 640x360 animated PNG \(ffmpeg was not found: sudo apt install ffmpeg for an MP4\)/)
  await until(() => logs.length >= 1)
  const helper = spawns.filter((a) => a[0] === 'python3')
  expect(helper.map((a) => a[2])).toEqual(['apng'])
  expect(helper[0]!.slice(4, 12)).toEqual(['2', '8', '640', '360', '1', '250', '2600', '3']) // the title card and the painting
  expect(logs.at(-1)).toMatch(/^Spark: rolled 1 painting \(faithful\), opening with “zilo”, into .*spark-roll-.*\.png \(640x360 animated PNG: ffmpeg was not found, so a smaller one that plays in any browser \(sudo apt install ffmpeg for the MP4\), 9 s\)/)
  await cmd($, 'paint off')
})

test('the roll without music: the setting off makes a silent clip', { options: { rollMusic: false, rollTitle: false } }, async ($, on) => {
  const { spawns, logs } = engine(on)
  await cmd($, 'paint'); await settle()
  expect(await say($, 'convert roll faithful 320')).not.toMatch(/music/)
  await until(() => logs.length >= 1)
  const helper = spawns.filter((a) => a[0] === 'python3')
  expect(helper.map((a) => a[2])).toEqual(['segment', 'join'])
  expect(helper[1]).toHaveLength(8) // python3, the helper, join and its five: no music to lay under it
  expect(logs.at(-1)).not.toMatch(/music/)
  await cmd($, 'paint off')
})

test('the music is read from the paintings: colour picks the key and mode, each painting a chord, each mark laid a note in time, every instrument in its range', () => {
  const warm = parsePainting(JSON.stringify({ title: 'warm', marks: [
    { k: 'fill', pts: [[0, 0], [1, 0], [1, 1], [0, 1]], c: '#ffb070', c2: '#ffd090', grad: 0.25, a: 1 },
    { k: 'glow', x: 0.5, y: 0.5, r: 0.3, c: '#ff9050', a: 0.8 },
    ...Array.from({ length: 30 }, (_, i) => ({ k: 'dot', x: i / 30, y: (i % 7) / 7, r: 0.01, c: '#fff0d0', a: 1 })),
    { k: 'line', pts: [[0.1, 0.9], [0.9, 0.9]], w: 0.01, c: '#ffe0a0', a: 1 },
  ] }))!
  const cool = parsePainting(JSON.stringify({ title: 'cool', marks: [
    { k: 'fill', pts: [[0, 0], [1, 0], [1, 1], [0, 1]], c: '#0a1430', c2: '#102050', grad: 0.25, a: 1 },
    { k: 'spray', x: 0.5, y: 0.3, r: 0.4, n: 40, s: 0.004, c: '#4060a0', a: 0.8 },
    { k: 'ring', x: 0.3, y: 0.2, r: 0.1, w: 0.01, c: '#3050a0', a: 0.8 },
  ] }))!
  expect(colourOf(warm).warm).toBeGreaterThan(0.5)
  expect(colourOf(cool).warm).toBeLessThan(-0.3)
  expect(rollScore([warm, warm]).mode).toBe('major')
  expect(rollScore([cool, cool]).mode).toBe('aeolian')
  const s = rollScore([warm, cool, warm], { reveal: 2, hold: 3, fade: 0.6, maxNotes: 14 })
  expect(Math.abs(s.total - (3 * 5 - 2 * 0.6))).toBeLessThan(1e-6)
  expect(s.chords.map((c) => c.t)).toEqual([0, 4.4, 8.8])
  expect(s.chords[0]!.degree).not.toBe(s.chords[1]!.degree) // a new painting, a new chord
  const notes = s.events.filter((e) => !['pad', 'bass'].includes(e.v))
  const first = notes.filter((e) => e.t < 4.4)
  expect(first.filter((e) => e.v !== 'sparkle').length).toBeLessThanOrEqual(14)
  for (const e of first) { expect(e.t).toBeGreaterThan(0); expect(e.t).toBeLessThanOrEqual(2.3) } // as the marks are laid, in the first two seconds
  const range: Record<string, [number, number]> = { bell: [64, 88], pluck: [52, 76], sparkle: [76, 96], swell: [55, 72], pad: [36, 72], bass: [24, 48] }
  for (const e of s.events) for (const m of e.midi) { expect(m).toBeGreaterThanOrEqual(range[e.v]![0]); expect(m).toBeLessThanOrEqual(range[e.v]![1]) }
  expect(new Set(notes.map((e) => e.v))).toEqual(new Set(['bell', 'pluck', 'swell', 'sparkle']))
  for (const e of notes) { expect(e.pan).toBeGreaterThanOrEqual(-1); expect(e.pan).toBeLessThanOrEqual(1) }
  // the notes are of the key: every one in its scale
  const steps = { major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10] }[s.mode]!
  for (const e of s.events) for (const m of e.midi) expect(steps).toContain((((m - s.root) % 12) + 12) % 12)
})

test('the roll\'s title: what you call it, else the name you gave the conversation (/rename), else the project; the setting off: no card', async ($, on) => {
  const { files, spawns, logs } = engine(on)
  on('command.run', { command: 'rename' }, async () => ({ text: 'renamed' }))
  await cmd($, 'paint'); await settle()
  const cardText = async (args: string) => {
    expect(await say($, args)).toMatch(/opening with a title card/)
    await until(() => logs.length >= spawns.filter((a) => a[2] === 'join').length + 1)
    return logs.at(-1)!
  }
  expect(await cardText('convert roll faithful 320 called Night Build')).toMatch(/opening with “Night Build”/) // as you wrote it
  await $.command.run(loose({ command: 'rename', args: 'Zilo world engine', origin: { kind: 'person' }, presentation: {} }))
  expect(await cardText('convert roll faithful 320')).toMatch(/opening with “Zilo world engine”/)
  expect(files.size).toBeGreaterThan(0)
  await cmd($, 'paint off')
})

test('without a title card the roll starts with its first painting', { options: { rollTitle: false } }, async ($, on) => {
  const { spawns, logs } = engine(on)
  await cmd($, 'paint'); await settle()
  expect(await say($, 'convert roll faithful 320')).not.toMatch(/title card/)
  await until(() => logs.length >= 1)
  const helper = spawns.filter((a) => a[0] === 'python3')
  expect(helper.map((a) => a[2])).toEqual(['segment', 'music', 'join'])
  expect(helper[0]!.slice(4, 5)).toEqual(['0'])
  expect(helper[2]!.slice(4)).toEqual(['1', helper[2]![5]!, String(2 + rollHolds([parsePainting(PAINTING)!])[0]!), '0.6', helper[2]![8]!]) // one painting: a bar, and the last bar longer
  await cmd($, 'paint off')
})

// Spark's hooks share one worker with the engine, which replaces it (and unloads the plugin, /spark with it, until it
// reloads) when a heartbeat goes unanswered: a stretch of work that never hands over. Every large picture is made a
// stretch at a time, handing over (awaiting `pause`) every few milliseconds
test('a large picture never holds the worker: layered, faithful, the flattening, the text and the title card all hand over often', { timeoutMs: 60000 }, async () => {
  const marks: Array<Record<string, unknown>> = [{ k: 'fill', pts: [[0, 0], [1, 0], [1, 1], [0, 1]], c: '#0b0a1e', c2: '#2a1850', grad: 0.25, a: 1 }]
  for (let i = 0; i < 60; i++) marks.push({ k: ['glow', 'curve', 'dot', 'ring', 'spray', 'line', 'arc', 'fill'][i % 8], x: (i * 37 % 100) / 100, y: (i * 53 % 100) / 100, r: 0.3, w: 0.01, n: 12, s: 0.006, a0: 0, a1: 2, pts: [[0.1, 0.2], [0.8, 0.3], [0.5, 0.9], [0.2, 0.7]], c: '#ffbc75', c2: '#9ef2b8', a: 0.8 })
  const p = parsePainting(JSON.stringify({ title: 'a long held breath', marks }))!
  const W = 1920, H = 960
  let last = Date.now(), worst = 0, pauses = 0
  const pause = async () => { worst = Math.max(worst, Date.now() - last); pauses++; await Promise.resolve(); last = Date.now() }
  const begin = () => { last = Date.now(); worst = 0; pauses = 0 }
  begin()
  const px = await layeredRaster(p, W, H, { theme: 'dark', pause })
  worst = Math.max(worst, Date.now() - last)
  expect(pauses).toBeGreaterThan(50)
  expect(worst).toBeLessThan(400) // it was over a second at this size, with nothing handed over inside a blur
  begin()
  const r = createRaster(W, H)
  await r.drawAsync(paintingScene(p, W, H, { reveal: 1, theme: 'dark' }), 'dark', { floor: 3 }, pause)
  worst = Math.max(worst, Date.now() - last)
  expect(worst).toBeLessThan(400) // a mark as large as the canvas hands over inside itself, row by row
  // the stretch-at-a-time versions make exactly what the whole ones do
  const g = [0.04, 0.04, 0.06]
  const flat = await toRGB8Async(px as never, g, pause)
  expect(flat).toEqual(toRGB8(px as never, g))
  const odd = flat.subarray(0, 3 * 262144 * 2 + 7) // a tail that is no whole slice, nor a whole group of three
  expect(await base64Async(odd, pause, 3 * 262144)).toBe(base64(odd))
  const card = { W: 640, H: 360, title: 'musical-understanding-bridge-design', sub: 'Spark · 16 Oct 2026 · 3 paintings', ground: g, glow: [0.6, 0.5, 0.8] }
  begin()
  expect(await titleCardAsync(card, pause)).toEqual(titleCard(card))
  expect(pauses).toBeGreaterThan(0)
})

test('a layered roll keeps its buffers: frame after frame asks no new picture-sized memory, and the last frame is the whole picture', { timeoutMs: 30000 }, async () => {
  const p = parsePainting(PAINTING)!
  const st = layeredStepper(p, 320, 160, { theme: 'dark' })
  const frames: Float32Array[] = []
  for (let f = 1; f <= 8; f++) frames.push(await st.frame((f / 8) * p.marks.length - (f < 8 ? 0.5 : 0)))
  expect(new Set(frames.slice(0, -1)).size).toBe(1) // one frame buffer, reused
  const whole = await layeredRaster(p, 320, 160, { theme: 'dark' })
  expect(Array.from(frames.at(-1)!)).toEqual(Array.from(whole.px))
  expect(await st.frame(p.marks.length)).toBe(frames.at(-1)!) // asked again, the same picture, not composed twice
})

// Colour depth: what keeps a painting's colours as they meet and as it shrinks into cells
test('light past full keeps its hue: under full nothing changes, a hot core still goes white, a halo stays amber, pink over violet stays pink', () => {
  const o = [0, 0, 0]
  expect(spill(0.4, 0.2, 0.9, o)).toEqual([0.4, 0.2, 0.9]) // at or under full: untouched
  const core = spill(3, 2.1, 0.9, [0, 0, 0])
  expect(Math.min(...core)).toBeGreaterThan(0.99) // far past full: white
  const halo = spill(1.3, 0.91, 0.39, [0, 0, 0])
  expect(halo[0]!).toBe(1); expect(halo[0]! - halo[2]!).toBeGreaterThan(0.4) // a little past: still amber, not yellow-white
  const pink = spill(1.0 + 0.3, 0.69 + 0.2, 0.75 + 0.3, [0, 0, 0]) // a pink line added over a violet ground
  expect(pink[0]! - pink[1]!).toBeGreaterThan(0.2) // still pink (cut off at full it was 1, 0.89, 1: nearly white)
})

test('HD cells keep the colours that stand out: a pink and a mint trail over violet stay two colours, where the first encoder washed both pale; the first encoder is kept to measure against', () => {
  const W = 40, H = 40
  const r = createRaster(W, H)
  const trails = parsePainting(JSON.stringify({ title: 'two trails', marks: [
    { k: 'fill', pts: [[0, 0], [1, 0], [1, 1], [0, 1]], c: '#4d3352', a: 1 },
    { k: 'line', pts: [[0.25, 0], [0.25, 1]], w: 0.03, c: '#ffb0c0', a: 0.9 },
    { k: 'line', pts: [[0.75, 0], [0.75, 1]], w: 0.03, c: '#a8e0c0', a: 0.9 },
  ] }))!
  r.draw(paintingScene(trails, W, H, { reveal: 1, theme: 'dark' }), 'dark', { res: 2 })
  const g = [0.12, 0.13, 0.15]
  const cellAt = (words: Uint32Array, cx: number, cy: number) => { const i = (cy * (W / 2) + cx) * 3; return { fg: words[i + 1]!, bg: words[i + 2]! } }
  const rgb = (v: number) => [(v >> 16) & 255, (v >> 8) & 255, v & 255]
  const brightest = (c: { fg: number; bg: number }) => [rgb(c.fg), rgb(c.bg)].sort((a, b) => b[0]! + b[1]! + b[2]! - a[0]! - a[1]! - a[2]!)[0]!
  const now = toQuadrants(r, g), before = toQuadrantsClassic(r, g)
  const pinkNow = brightest(cellAt(now, 5, 5)), mintNow = brightest(cellAt(now, 15, 5))
  const pinkBefore = brightest(cellAt(before, 5, 5))
  expect(pinkNow[0]! - pinkNow[1]!).toBeGreaterThan(pinkBefore[0]! - pinkBefore[1]!) // pinker than before
  expect(pinkNow[0]!).toBeGreaterThan(pinkNow[1]!) // pink: red over green
  expect(mintNow[1]!).toBeGreaterThan(mintNow[0]!) // mint: green over red
  // and still never a glyph in the terminal's text colour
  for (let i = 0; i < now.length; i += 3) if (now[i] !== 0x20) expect(now[i + 1]).not.toBe(0x01000000)
})

test('truest gives each mark the weight a terminal cell gives it: a speck large as the cell it fills beside the conversation', async () => {
  const p = parsePainting(JSON.stringify({ title: 'one speck', marks: [{ k: 'dot', x: 0.5, y: 0.5, r: 0.004, c: '#ffffff', a: 1 }, { k: 'dot', x: 0.2, y: 0.2, r: 0.004, c: '#ffffff', a: 1 }, { k: 'dot', x: 0.8, y: 0.8, r: 0.004, c: '#ffffff', a: 1 }, { k: 'dot', x: 0.2, y: 0.8, r: 0.004, c: '#ffffff', a: 1 }, { k: 'dot', x: 0.8, y: 0.2, r: 0.004, c: '#ffffff', a: 1 }, { k: 'dot', x: 0.5, y: 0.2, r: 0.004, c: '#ffffff', a: 1 }] }))!
  const lit = (px: Float32Array) => { let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i]! > 0.5) n++; return n }
  const fine = lit((await layeredRaster(p, 400, 400)).px)
  const truest = lit((await layeredRaster(p, 400, 400, { res: 400 / 40 })).px) // drawn 40 columns wide in the terminal
  expect(truest).toBeGreaterThan(fine * 4)
})

test('the roll breathes: each painting held a bar or two by the music (a busier one, or one that turns the colour, longer), the last a bar longer, settling home', () => {
  const quiet = parsePainting(JSON.stringify({ title: 'quiet', marks: Array.from({ length: 6 }, (_, i) => ({ k: 'dot', x: 0.1 + i * 0.1, y: 0.5, r: 0.02, c: '#9ef2b8', a: 0.6 })) }))!
  const busy = parsePainting(JSON.stringify({ title: 'busy', marks: Array.from({ length: 60 }, (_, i) => ({ k: 'dot', x: (i % 10) / 10, y: Math.floor(i / 10) / 6, r: 0.02, c: '#ff4060', a: 0.9 })) }))!
  const holds = rollHolds([quiet, quiet, busy, quiet])
  for (const h of holds) expect(Math.abs(h / BEAT - Math.round(h / BEAT))).toBeLessThan(0.01) // whole beats of its pulse
  expect(holds[1]!).toBeLessThan(holds[2]!) // the same again: a bar; busy and a new colour: longer
  expect(Math.round(holds[1]! / BEAT)).toBe(4)
  expect(holds[3]!).toBeGreaterThan(holds[1]!) // the last, a bar longer
  const score = rollScore([quiet, quiet, busy, quiet], { reveal: 2, fade: 0.6, holds })
  expect(score.chords.map((c) => Math.round(c.t * 1000) / 1000)).toEqual([0, 2 + holds[0]! - 0.6, 2 * 2 + holds[0]! + holds[1]! - 1.2, 3 * 2 + holds[0]! + holds[1]! + holds[2]! - 1.8].map((t) => Math.round(t * 1000) / 1000)) // each chord as its painting comes in
  expect(score.chords.at(-1)!.degree).toBe(0) // home under the last
})


test('while a roll is made, a bar under her tools says how far she has got and what she is doing; gone when it is done', async ($, on) => {
  const { logs } = engine(on)
  let redraws = 0
  on('ui.invalidate', async () => { redraws++; return loose({ value: undefined }) })
  await cmd($, 'paint'); await say($, 'paint'); await settle()
  const look = async () => {
    const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(60, 70) })
    const bar = await term.find({ key: 'spark-progress' })
    const words = JSON.stringify(bar ?? null)
    await term.unmount()
    return { bar, words }
  }
  expect((await look()).bar).toBeUndefined() // nothing being made: the tools alone
  expect(await say($, 'convert roll faithful 320')).toMatch(/^rolling all 2 paintings/)
  const seen: string[] = []
  for (let i = 0; i < 400 && !logs.length; i++) { const l = await look(); if (l.bar) seen.push(l.words); await settle() }
  expect(seen.length).toBeGreaterThan(0)
  expect(seen.some((w) => /laying down “a fox under three…” · [12]\/2/.test(w))).toBe(true) // what she is doing, in her own words
  expect(seen.some((w) => /▕[█▏▎▍▌▋▊▉ ]+▏/.test(w))).toBe(true) // the bar
  const pcts = seen.map((w) => Number(/(\d+)%/.exec(w)?.[1] ?? -1)).filter((n) => n >= 0)
  expect(pcts.every((n, i) => i === 0 || n >= pcts[i - 1]!)).toBe(true) // it only moves on
  await until(() => logs.length >= 1)
  expect(redraws).toBeGreaterThanOrEqual(3) // a still Spark is asked to draw as the bar appears, as it moves, and as it ends (no stale bar left behind)
  expect((await look()).bar).toBeUndefined() // done: gone
  await cmd($, 'paint off')
})

test('a Short: /spark convert roll short makes it upright, 1080 x 1920, the painting large with its caption right under it, a little above the middle', { timeoutMs: 90000 }, async ($, on) => {
  expect(rollSize('short')).toEqual([1080, 1920])
  expect(rollSize('shorts')).toEqual([1080, 1920])
  for (const shape of ['wide', 'square', 'tall']) {
    const L = rollLayout(shape, 1080, 1920, 2)
    expect(L.big).toBe(true)
    expect(L.capY).toBe(L.oy + L.ph) // the caption under the painting, not at the foot of the frame
    expect(L.pw).toBeLessThanOrEqual(1080)
    expect(L.oy + L.ph / 2).toBeLessThan(1920 / 2) // above the middle
    expect(L.capY + L.strip).toBeLessThanOrEqual(1920)
  }
  expect(rollLayout('wide', 1080, 1920, 2).strip).toBeGreaterThan(captionHeight(1080, 2)) // read on a phone: larger
  const wide = rollLayout('wide', 1280, 720, 2)
  expect(wide.capY).toBe(wide.areaH) // a widescreen roll as before
  const { spawns, logs, files } = engine(on)
  await cmd($, 'paint'); await settle()
  expect(await say($, 'convert roll faithful short')).toMatch(/^rolling all 1 painting into a clip, faithful, 1080x1920 MP4 upright, for Shorts, about \d+ s long/)
  await until(() => logs.length >= 1)
  expect(logs.at(-1)).toMatch(/-faithful-short\.mp4/)
  const seg = spawns.find((a) => a[2] === 'segment' && a[4] === '1')!
  expect(seg.slice(6, 8)).toEqual(['1080', '1920'])
  const card = [...files.keys()].find((f) => /\/f000-\d{3}\.b64\.0$/.test(f))
  expect(card).toBeDefined() // the title card, upright too
  await cmd($, 'paint off')
})

// Painting with Prism: her paintings (JSON files of the same marks, colours 0..1 RGB) in prism-paintings beside the work
const PRISM = (title: string, at: number) => JSON.stringify({ title, thought: 'for you <3', mood: 'aurora', mirror: null, tokens: 0, model: 'prism-muse', at,
  marks: [{ k: 'fill', pts: [[0, 0], [1, 0], [1, 1], [0, 1]], c: [0.02, 0.03, 0.09], c2: [0.09, 0.05, 0.18], grad: 0.25, a: 1 }, { k: 'glow', x: 0.5, y: 0.4, r: 0.3, c: [0, 0.95, 1], a: 0.5 }, { k: 'ring', x: 0.5, y: 0.4, r: 0.12, w: 0.02, c: [1, 0.3, 0.8], a: 0.9 }, { k: 'dot', x: 0.5, y: 0.4, r: 0.03, c: [1, 1, 1], a: 1 }, { k: 'spray', x: 0.5, y: 0.2, r: 0.4, n: 20, s: 0.006, c: [0.9, 0.9, 1], a: 0.7 }, { k: 'line', pts: [[0.1, 0.8], [0.9, 0.8]], w: 0.01, c: [0, 0.8, 0.8], c2: [0.9, 0.4, 0.7], a: 0.8 }] })
function prismFolder(on: On, files: Map<string, string>, startedAt: number) {
  const dir = '/home/t/zilo/prism-paintings'
  on('session.usage', async () => loose({ value: { startedAt, context: {}, rateLimits: {}, cost: {} } }))
  on('fs.exists', async (_$, e) => loose({ value: (e as { path: string }).path === dir || files.has((e as { path: string }).path) }))
  on('fs.list', async (_$, e) => {
    const d = (e as { path: string }).path.replace(/\/+$/, '')
    if (d !== dir) throw new Error('ENOENT')
    return loose({ value: [...files.keys()].filter((f) => f.startsWith(dir + '/')).map((f) => ({ name: f.slice(dir.length + 1), kind: 'file', size: files.get(f)!.length, mtimeMs: 0, isLink: false })) })
  })
  on('fs.read', async (_$, e) => { const f = files.get((e as { path: string }).path); if (f === undefined) throw new Error('ENOENT'); return loose({ value: f }) })
  return dir
}

test('painting with Prism: her paintings of this session join the story in order, credited to her; converts and the roll carry her name; her files are only read', { timeoutMs: 30000 }, async ($, on) => {
  const startedAt = Date.now() - 60_000
  const prism = new Map<string, string>()
  const dir = prismFolder(on, prism, startedAt)
  prism.set(`${dir}/00-from-yesterday.json`, PRISM('from yesterday', (startedAt - 86_400_000) / 1000)) // before this session: left out
  prism.set(`${dir}/01-midnight-aurora.json`, PRISM('Midnight Aurora & Crystal Heart', (startedAt + 10_000) / 1000))
  prism.set(`${dir}/02-broken.json`, '{ not a painting') // unreadable: left alone
  const { files, logs } = engine(on)
  await cmd($, 'paint'); await settle() // Spark paints after Prism's
  expect(await say($, 'prism')).toMatch(/^prism: reading \/home\/t\/zilo\/prism-paintings: 1 of her paintings from this session in the story/)
  expect(await say($, 'story')).toMatch(/^story: 2 paintings/)
  const term = await $.ui.mount({ plugin: 'cyclops-spark', surface: 'terminal', ...pane(60, 70) })
  expect(await term.find({ type: 'Text', text: /^story · 1 of 2 · \d\d:\d\d · Prism’s/ })).toBeDefined() // hers first: she painted first
  expect(await term.find({ type: 'Text', text: /Midnight Aurora/ })).toBeDefined()
  await term.unmount()
  await cmd($, 'story end')
  // all of them made large: hers captioned with her name
  expect(await say($, 'convert all faithful 320')).toMatch(/^converting all 2 paintings/)
  await until(() => logs.length >= 1)
  const hers = [...files.keys()].find((f) => /01-midnight-aurora-crystal-heart-faithful\.svg$/.test(f))!
  expect(files.get(hers)).toMatch(/Prism · \d{1,2} \w{3} \d{4} · faithful/)
  // the roll: the two of them, "Spark & Prism" on the title card's line
  expect(await say($, 'convert roll faithful 320')).toMatch(/^rolling all 2 paintings/)
  await until(() => logs.length >= 2)
  expect(logs.at(-1)).toMatch(/^Spark: rolled 2 paintings/)
  expect([...prism.keys()].length).toBe(3) // nothing of hers written or changed
  // off: not read any more, the story keeps what it has
  expect(await say($, 'prism off')).toMatch(/^prism: off/)
  await cmd($, 'paint off')
})

test('and Spark shares hers: while Prism paints in the project, each of Spark\'s paintings is also written for her, in the same form, into Spark\'s folder', async ($, on) => {
  const prism = new Map<string, string>()
  prismFolder(on, prism, Date.now() - 1000)
  const { files } = engine(on)
  await cmd($, 'paint'); await settle()
  await until(() => [...files.keys()].some((f) => f.endsWith('.json')))
  const shared = [...files.keys()].filter((f) => /^\/home\/t\/zilo\/spark-paintings\/\d\d-[a-z0-9-]+\.json$/.test(f))
  expect(shared).toHaveLength(1)
  const d = JSON.parse(files.get(shared[0]!)!)
  expect(d.by).toBe('spark')
  expect(d.title).toBe('a fox under three moons')
  expect(Array.isArray(d.marks[0].c)).toBe(true) // colours as 0..1 RGB, as hers are
  expect(typeof d.at).toBe('number')
  expect(JSON.stringify(d)).not.toMatch(/secret|notes\.md|npm/) // only the painting, never the work
  await cmd($, 'paint off')
})

test('with no folder of Prism\'s, Spark writes nothing for her', async ($, on) => {
  const { files } = engine(on)
  await cmd($, 'paint'); await settle()
  for (let i = 0; i < 20; i++) { await settle(); await new Promise((r) => setTimeout(r, 0)) }
  expect([...files.keys()].some((f) => f.endsWith('.json'))).toBe(false)
  await cmd($, 'paint off')
})
