#!/usr/bin/env bash
# Install (or refresh) Cyclops Spark for Claude Code from this folder.
# It only runs Claude Code's own plugin commands; nothing in your settings is edited by hand.
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
plugin="cyclops-spark@cyclops-spark"
need="2.1.288"

say() { printf '%s\n' "$*"; }
fail() { printf 'Cyclops Spark: %s\n' "$*" >&2; exit 1; }

command -v claude >/dev/null 2>&1 || fail "Claude Code (the 'claude' command) is not installed or not on your PATH."

have="$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true)"
[ -n "$have" ] || fail "could not read the Claude Code version."
if [ "$(printf '%s\n%s\n' "$need" "$have" | sort -V | head -n1)" != "$need" ]; then
  fail "Claude Code $need or later is needed (you have $have). Update Claude Code, then run this again."
fi

say "Cyclops Spark: installing from $here (Claude Code $have)"
if claude plugin marketplace list 2>/dev/null | grep -q 'cyclops-spark'; then
  claude plugin marketplace update cyclops-spark >/dev/null
  say "  marketplace: already added, refreshed"
else
  claude plugin marketplace add "$here" >/dev/null
  say "  marketplace: added"
fi

if claude plugin list 2>/dev/null | grep -q "$plugin"; then
  claude plugin enable "$plugin" >/dev/null 2>&1 || true
  say "  plugin: already installed (it reads this folder directly), enabled"
else
  claude plugin install "$plugin" >/dev/null
  say "  plugin: installed"
fi

say ""
say "Done. Start Claude Code and type /spark (or /spark help for every command)."
say "Settings such as sound and palette: claude plugin configure $plugin"
