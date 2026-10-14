#!/usr/bin/env bash
# Remove Cyclops Spark from Claude Code. This folder and its files are left alone.
set -euo pipefail

plugin="cyclops-spark@cyclops-spark"
# Claude Code is often installed somewhere a fresh shell's PATH does not reach yet (the native installer's ~/.local/bin,
# an older ~/.claude/local, npm's global folder, a Node version manager). Look there before giving up, and say so.
find_claude() {
  command -v claude >/dev/null 2>&1 && return 0
  local c
  for c in "$HOME/.local/bin/claude" "$HOME/.claude/local/claude" "$HOME/.npm-global/bin/claude" \
           "$HOME/.bun/bin/claude" /usr/local/bin/claude /opt/homebrew/bin/claude \
           "$HOME"/.nvm/versions/node/*/bin/claude "$HOME"/.volta/bin/claude; do
    if [ -x "$c" ]; then
      PATH="$(dirname -- "$c"):$PATH"; export PATH
      printf 'Cyclops Spark: found Claude Code at %s (it is not on this shell'"'"'s PATH: add its folder to PATH in ~/.bashrc so the claude command works everywhere)\n' "$c"
      return 0
    fi
  done
  return 1
}
find_claude || { printf 'Cyclops Spark: Claude Code was not found on your PATH or in the usual places; nothing to remove.\n' >&2; exit 0; }

if claude plugin list 2>/dev/null | grep -q "$plugin"; then
  claude plugin uninstall "$plugin" >/dev/null
  printf '  plugin: removed\n'
else
  printf '  plugin: not installed\n'
fi
if claude plugin marketplace list 2>/dev/null | grep -q 'cyclops-spark'; then
  claude plugin marketplace remove cyclops-spark >/dev/null
  printf '  marketplace: removed\n'
fi
printf 'Cyclops Spark is uninstalled. This folder was not touched; delete it yourself if you like.\n'
