export const SIZES: Record<string, number>
export const HD_MARKS: number
export function markFloor(W: number): number
export function slug(title: string, n: number): string
export function canvasFor(shape: string, width: number): [number, number]
export function revisitRequest(o: { painting: { title: string; marks: Array<Record<string, any>>; mirror?: string | null }; mode: 'refined' | 'interpretive'; palette?: string; theme?: string; reflection?: string }): { system: string; prompt: string }
export type CaptionLine = { text: string; dim: boolean }
export function captionLines(title: string, mode: string, when: string): CaptionLine[]
export function captionHeight(W: number, lines?: number): number
export function captionStrip(W: number, lines: CaptionLine[], ground: number[], o?: { light?: boolean }): Uint8Array
export function withCaption(rgb: Uint8Array, W: number, H: number, lines: CaptionLine[], ground: number[], o?: { light?: boolean }): { rgb: Uint8Array; H: number }
export function sceneSVG(scene: any[], W: number, H: number, o?: { theme?: string; ground?: string | null; title?: string; caption?: CaptionLine[] | null; floor?: number }): string
export function flattenRGBA(rgba: Uint8Array, W: number, H: number, ground: number[]): Uint8Array
export function rollLayout(shape: string, W: number, H: number, lines: number): { pw: number; ph: number; ox: number; oy: number; areaH: number; strip: number }
export const ROLL_SIZES: Record<string, [number, number]>
export function rollSize(word: string): [number, number] | null
export function galleryHTML(items: Array<{ file: string; title: string; when: string; mode: string }>): string
