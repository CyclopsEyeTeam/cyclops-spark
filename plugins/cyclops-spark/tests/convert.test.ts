// /spark convert: a painting made large, three ways (faithful, refined, interpretive), as SVG and PNG into the convert
// folder. The one time Spark writes files, and only when asked.
import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { parsePainting, paintingScene } from '../hooks/painter.js'
import { canvasFor, captionHeight, captionLines, captionStrip, flattenRGBA, galleryHTML, revisitRequest, sceneSVG, slug, withCaption } from '../hooks/convert.js'
import { createRaster, toQuadrants, toRGB8 } from '../hooks/render-raster.js'

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

type Ask = { system: string; prompt: string }
function engine(on: On, { python = true, revisit = REFINED }: { python?: boolean; revisit?: string } = {}) {
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
    spawns.push([...(e as { argv: readonly string[] }).argv])
    if (!python) { yield { stream: 'stderr' as const, text: 'env: python3: No such file or directory\n' }; return loose({ value: { code: 127, signal: null } }) }
    yield { stream: 'stdout' as const, text: 'ok\n' }
    return loose({ value: { code: 0, signal: null } })
  })
  on('ui.open', async () => loose({ value: { isPlaced: true } }))
  on('ui.close', async () => loose({ value: undefined }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  return { asks, files, spawns }
}

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
  const { files, spawns } = engine(on, { python: false })
  await cmd($, 'paint'); await say($, 'paint'); await settle()
  expect(await say($, 'convert sideways')).toMatch(/^convert takes: faithful/)
  expect(await say($, 'convert faithful huge')).toMatch(/^convert size: hd/)
  const out = await say($, 'convert all faithful 256')
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
  expect(galleryHTML([{ file: 'x.png', title: 'a "quoted" one', when: '21:01', mode: 'faithful' }])).toContain('alt="a &quot;quoted&quot; one"')
  const rq = revisitRequest({ painting: p, mode: 'interpretive' })
  expect(rq.prompt).not.toContain('seed') // the painter sees its marks, not the renderer's bookkeeping
})

test('a bare /spark convert asks which way, in Claude Code\'s own dialog, and does what you click; dismissed, it does nothing', async ($, on) => {
  const { files, asks } = engine(on)
  let answer: string | null = 'Refined'
  const asked: unknown[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    const q = (e as { questions: Array<{ question: string; options: Array<{ label: string }> }> }).questions
    asked.push(q)
    if (answer === null) return loose({ result: 'dismissed', isError: true })
    return loose({ result: { questions: q, answers: { [q[0]!.question]: answer } } })
  })
  expect(await say($, 'convert')).toMatch(/^no paintings yet this session/) // nothing to ask about yet
  expect(asked).toHaveLength(0)
  await cmd($, 'paint'); await settle()
  const n0 = asks.length
  const out = await say($, 'convert')
  expect(asked).toHaveLength(1)
  const q = (asked[0] as Array<{ question: string; options: Array<{ label: string }> }>)[0]!
  expect(q.question).toBe('How shall Spark make the painting large?')
  expect(q.options.map((o) => o.label)).toEqual(['Faithful', 'Refined', 'Interpretive', 'All paintings…'])
  expect(out).toMatch(/^converted \(refined, 1920 wide\)/)
  expect(asks.length).toBe(n0 + 1) // the refined way: the painter asked once
  expect([...files.keys()].some((f) => f.endsWith('-refined.svg'))).toBe(true)
  answer = null
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

test('all paintings: a second menu asks which way, each with what it costs; a revisited set goes on beside the work and Spark says when it is done', async ($, on) => {
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
  const logs: string[] = [], toasts: string[] = []
  const until = async (done: () => boolean) => { for (let i = 0; i < 400 && !done(); i++) { await settle(); await new Promise((r) => setTimeout(r, 0)) } }
  on('ui.log', async (_$, e) => { logs.push(String((e as { text: string }).text)); return loose({ value: undefined }) })
  on('ui.toast', async (_$, e) => { toasts.push(String((e as { text: string }).text)); return loose({ value: undefined }) })
  await cmd($, 'paint'); await say($, 'paint'); await say($, 'paint'); await settle()
  // the first menu, then All: the second, with the cost beside each way
  answers.push('All', 'Faithful')
  expect(await say($, 'convert 256')).toMatch(/^converted \(all, faithful, 256 wide\)/)
  expect(asked[1]!.question).toBe('All 3 paintings of this session: which way?')
  expect(asked[1]!.labels[0]).toBe('Faithful · no tokens')
  expect(asked[1]!.labels[1]).toMatch(/^Refined · about \d+(\.\d)?k tokens$/)
  expect(asked[1]!.labels[2]).toMatch(/^Interpretive · about \d+(\.\d)?k tokens$/)
  // typed: all, then the way, then the size; refined: one painter call each, beside the work
  const n0 = asks.length
  const started = await say($, 'convert all refined 256')
  expect(started).toMatch(/^converting all 3 paintings, refined, 256 wide, into \/home\/t\/zilo\/spark-paintings: one painter call each, about \d+(\.\d)?k tokens/)
  await until(() => logs.length >= 1)
  expect(asks.length).toBe(n0 + 3)
  expect([...files.keys()].filter((f) => f.endsWith('-refined.svg'))).toHaveLength(3)
  expect(logs.at(-1)).toMatch(/^Spark: converted \(all, refined, 256 wide\)/)
  expect(toasts.at(-1)).toBe('Spark: all 3 paintings converted (refined)')
  // now the estimate is from what those calls really used: 900 + 700 tokens each, as the mock answers
  const tick = asked.length
  answers.push('All') // and the second menu dismissed: nothing is done
  expect(await say($, 'convert')).toBe('convert: nothing chosen')
  expect(asked[tick + 1]!.labels[2]).toBe('Interpretive · about 4.8k tokens') // 3 x 1,600
  // typed all on its own asks the way too
  answers.push('Interpretive')
  expect(await say($, 'convert all 256')).toMatch(/^converting all 3 paintings, interpretive/)
  expect(await say($, 'state')).toMatch(/converting \d of 3 \(interpretive\)|paint on/)
  await until(() => logs.length >= 2)
  expect(logs.at(-1)).toMatch(/^Spark: converted \(all, interpretive, 256 wide\)/)
  await cmd($, 'paint off')
})
