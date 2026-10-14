// /spark convert: a painting made large, three ways (faithful, refined, interpretive), as SVG and PNG into the convert
// folder. The one time Spark writes files, and only when asked.
import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { parsePainting, paintingScene } from '../hooks/painter.js'
import { canvasFor, flattenRGBA, galleryHTML, revisitRequest, sceneSVG, slug } from '../hooks/convert.js'

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
  expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="320" height="160"/) // wide: 2:1, the painting's own shape
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
  expect(spawns[0]!.slice(2)).toEqual(['/home/t/zilo/spark-paintings/01-a-fox-under-three-moons-faithful.rgb.b64', '/home/t/zilo/spark-paintings/01-a-fox-under-three-moons-faithful.png', '320', '160'])
  const b64 = files.get('/home/t/zilo/spark-paintings/01-a-fox-under-three-moons-faithful.rgb.b64')!
  expect(b64.length).toBe(Math.ceil((320 * 160 * 3) / 3) * 4) // base64 of exactly W×H×3 bytes
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
  const out = await say($, 'convert all 256')
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
  expect(galleryHTML([{ file: 'x.png', title: 'a "quoted" one', when: '21:01', mode: 'faithful' }])).toContain('alt="a &quot;quoted&quot; one"')
  const rq = revisitRequest({ painting: p, mode: 'interpretive' })
  expect(rq.prompt).not.toContain('seed') // the painter sees its marks, not the renderer's bookkeeping
})
