export const SIZES: Record<string, number>
export const HD_MARKS: number
export function markFloor(W: number): number
export function slug(title: string, n: number): string
export function canvasFor(shape: string, width: number): [number, number]
export function revisitRequest(o: { painting: { title: string; marks: Array<Record<string, any>>; mirror?: string | null }; mode: 'refined' | 'interpretive'; palette?: string; theme?: string; reflection?: string }): { system: string; prompt: string }
export type CaptionLine = { text: string; dim: boolean }
export function captionLines(title: string, mode: string, when: string, by?: string): CaptionLine[]
export function captionHeight(W: number, lines?: number, big?: boolean): number
export function captionStrip(W: number, lines: CaptionLine[], ground: number[], o?: { light?: boolean; big?: boolean }): Uint8Array
export function withCaption(rgb: Uint8Array, W: number, H: number, lines: CaptionLine[], ground: number[], o?: { light?: boolean }): { rgb: Uint8Array; H: number }
export function sceneSVG(scene: any[], W: number, H: number, o?: { theme?: string; ground?: string | null; title?: string; caption?: CaptionLine[] | null; floor?: number; layers?: Array<[any[], number]> | null; levels?: number }): string
export function flattenRGBA(rgba: Uint8Array, W: number, H: number, ground: number[]): Uint8Array
export function rollLayout(shape: string, W: number, H: number, lines: number): { pw: number; ph: number; ox: number; oy: number; areaH: number; strip: number; capY: number; big: boolean }
export const ROLL_SIZES: Record<string, [number, number]>
export function rollSize(word: string): [number, number] | null
export function galleryHTML(items: Array<{ file: string; title: string; when: string; mode: string }>): string
export function drawText(rgb: Uint8Array, W: number, H: number, text: string, x0: number, y0: number, s: number, ink: number[], alpha?: number): number
export function textWidth(text: string): number
export function titleCard(o: { W: number; H: number; title: string; sub: string; ground: number[]; light?: boolean; glow?: number[]; alpha?: number }): Uint8Array
export function titleCardAsync(o: { W: number; H: number; title: string; sub: string; ground: number[]; light?: boolean; glow?: number[]; alpha?: number }, pause: () => Promise<unknown>): Promise<Uint8Array>
export const SHORT_MAX_S: number
export function sideLayout(shape: string, width: number): { W: number; H: number; gap: number; pw: number; ph: number; lx: number; rx: number; y: number }
export function cellsSVG(words: Uint32Array, cols: number, rows: number, x: number, y: number, cw: number, ch: number, ground: number[], levels?: number): string
export function sideSVG(o: { layout: ReturnType<typeof sideLayout>; cells: Uint32Array; cols: number; rows: number; cw: number; ch: number; truest: string; theme?: string; title?: string; caption?: unknown; ground: number[]; levels?: number }): string
