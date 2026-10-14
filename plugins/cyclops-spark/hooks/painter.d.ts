export type TurnFacts = { tools: Record<string, number>; errors: number; denied: number; mends: number; interrupted: number; thinkChars: number; textChars: number; steps: number; effort: string | number | null; agentStreams: number }
export type Painting = { title: string; marks: Array<Record<string, any>>; react: string | null; mirror: string | null }
export const PAINT_KINDS: string[]
export const MAX_MARKS: number
export const MAX_PTS: number
export const MIRRORS: string[]
export const GIST_CHARS: number
export const REFLECTION_CHARS: number
export const SPOKEN_CHARS: number
export function reflectRequest(spoken: string): { system: string; prompt: string }
export function cleanReflection(text: string): string
export function newTurnFacts(): TurnFacts
export function recordTool(facts: TurnFacts | null, family: string): void
export function painterFacts(facts: TurnFacts | null, end: { reason: string; durationMs: number; mood: string; turn: number }): Record<string, unknown>
export function painterRequest(o: { facts: Record<string, unknown>; palette?: string; theme?: string; gist?: string; reflection?: string; live?: boolean; shape?: string; size?: [number, number] | null }): { system: string; prompt: string }
export const SHAPES: Record<string, number>
export function shapeFor(widthPx: number, heightPx: number): string
export function parsePainting(text: string, palette?: string): Painting | null
export function paintingScene(p: Painting | null, W: number, H: number, o?: { reveal?: number; theme?: string }): any[]
export const TALK_IN: number
export const TALK_OUT: number
export function talkRequest(o: { said: string; mood?: string; title?: string; reflection?: string; facts?: Record<string, unknown> | null; palette?: string }): { system: string; prompt: string }
export function parseTalk(text: string): { say: string; react: string | null } | null
