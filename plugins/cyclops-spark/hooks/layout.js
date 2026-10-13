// Layout helpers for the pane: plain functions, no host, so they are tested on their own.

// How many rows a line of text takes when it wraps at `width` columns, word by word, as the terminal wraps it. Every
// line is laid out whole (wrapped, never cut off with an ellipsis), so its rows are counted before anything is drawn.
export function wrapRows(text, width) {
  const w = Math.max(1, Math.floor(width))
  let rows = 1, col = 0
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    let n = [...word].length
    if (col > 0 && col + 1 + n <= w) { col += 1 + n; continue }
    if (col > 0) { rows++; col = 0 }
    while (n > w) { rows++; n -= w } // a word longer than the line breaks across rows
    col = n
  }
  return rows
}
