export type LinkPeer = { presence: string; instance: string; state: string; tools: number; branches: number; bearing: number }
export type LinkView = { peers: LinkPeer[]; threads: { from: string; to: string }[] }
export type MarkSheet = { presence: string; cols: number; rows: number; frames: Record<string, [string, number[] | null, number[] | null][][]>; statesMap: Record<string, string>; core: number[] | null }
export function linkFacts(f: any): { state: string; tools: number; branches: number; reaching: string[] }
export function parseSheet(text: string, presence: string): MarkSheet | null
export function frameFor(sheet: MarkSheet, state: string): string
export function linkLine(view: LinkView | null): string
export function overlay(words: Uint32Array, W: number, rows: number, view: LinkView | null, sheets: Record<string, MarkSheet | null>, opts?: { now?: number; reduced?: boolean }): Uint32Array
