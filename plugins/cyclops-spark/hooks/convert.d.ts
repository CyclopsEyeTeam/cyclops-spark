export const SIZES: Record<string, number>
export const HD_MARKS: number
export function slug(title: string, n: number): string
export function canvasFor(shape: string, width: number): [number, number]
export function revisitRequest(o: { painting: { title: string; marks: Array<Record<string, any>>; mirror?: string | null }; mode: 'refined' | 'interpretive'; palette?: string; theme?: string; reflection?: string }): { system: string; prompt: string }
export function sceneSVG(scene: any[], W: number, H: number, o?: { theme?: string; ground?: string | null; title?: string }): string
export function flattenRGBA(rgba: Uint8Array, W: number, H: number, ground: number[]): Uint8Array
export function galleryHTML(items: Array<{ file: string; title: string; when: string; mode: string }>): string
