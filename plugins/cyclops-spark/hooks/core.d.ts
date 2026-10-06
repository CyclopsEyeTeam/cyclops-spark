export function createPresence(entity?: string, seed?: number): { apply(ev: Record<string, unknown>): void; sample(t: number, opts?: Record<string, unknown>): any; readonly offer: { at: number; kind: string; chars: number } | null; readonly pendingCalls: number }
export function buildScene(frame: any, lod?: string): any[]
export function laneFor(tool: string, input?: Record<string, unknown>): { key: string; family: string; label: string; how: string }
export function glyph(mode: string): string
export const PALETTE_NAMES: string[]
export const MAPPING: string[][]
