export type ScoreEvent = { v: 'pad' | 'bass' | 'bell' | 'pluck' | 'sparkle' | 'swell'; t: number; midi: number[]; len: number; vel: number; pan: number }
export function colourOf(p: { marks: Array<Record<string, any>> }): { hue: number; sat: number; light: number; warm: number }
export function rollScore(list: Array<{ marks: Array<Record<string, any>> }>, o?: { reveal?: number; hold?: number; fade?: number; maxNotes?: number }): { key: string; root: number; mode: string; total: number; chords: Array<{ t: number; degree: number; chord: number[] }>; events: ScoreEvent[] }
