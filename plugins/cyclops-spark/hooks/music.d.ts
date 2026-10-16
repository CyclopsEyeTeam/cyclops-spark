export type ScoreEvent = { v: 'pad' | 'bass' | 'bell' | 'pluck' | 'sparkle' | 'swell'; t: number; midi: number[]; len: number; vel: number; pan: number }
export function colourOf(p: { marks: Array<Record<string, any>> }): { hue: number; sat: number; light: number; warm: number }
export function rollScore(list: Array<{ marks: Array<Record<string, any>> }>, o?: { reveal?: number; hold?: number; fade?: number; maxNotes?: number; lead?: number; holds?: number[] | null }): { key: string; root: number; mode: string; total: number; chords: Array<{ t: number; degree: number; chord: number[] }>; events: ScoreEvent[] }
export function sessionColour(list: Array<{ marks: Array<Record<string, any>> }>): number[]
export const BEAT: number
export function rollHolds(list: Array<{ marks: Array<Record<string, any>> }>): number[]
