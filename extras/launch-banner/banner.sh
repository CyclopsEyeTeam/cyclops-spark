#!/usr/bin/env bash
# Cyclops launch banner: optional, off unless you ask for it.
#
#   banner.sh install   copy banner.txt to ~/.cyclops/ and add a marked block to your shell's rc file
#   banner.sh remove    take that block out again (the rest of the rc file is left alone)
#   banner.sh status    say whether it is on
#
# The block wraps the `claude` command in a small shell function that prints the banner and then runs the real
# `claude`. It only prints in an interactive terminal at least as wide as the banner, never for `claude -p`,
# `--version`, `--help` or subcommands such as `claude plugin ...`, and `CYCLOPS_BANNER=0` silences it.
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
dest_dir="${CYCLOPS_HOME:-$HOME/.cyclops}"
dest="$dest_dir/banner.txt"
begin="# >>> cyclops launch banner >>>"
end="# <<< cyclops launch banner <<<"

rc_files() {
  # Every rc file that exists, plus the one for the login shell even if it does not exist yet.
  local f shell_rc=""
  case "$(basename -- "${SHELL:-bash}")" in
    zsh) shell_rc="$HOME/.zshrc" ;;
    *)   shell_rc="$HOME/.bashrc" ;;
  esac
  for f in "$HOME/.bashrc" "$HOME/.zshrc"; do
    if [ -f "$f" ] || [ "$f" = "$shell_rc" ]; then printf '%s\n' "$f"; fi
  done
}

strip_block() {
  # Remove our block from one file, if present. Writes a .bak beside it first.
  local f="$1"
  [ -f "$f" ] && grep -qF "$begin" "$f" || return 0
  local work="$f.cyclops-banner.tmp"
  cp -p -- "$f" "$work"
  # Blank lines are held back one step so the blank line the installer put before the block goes with it.
  awk -v b="$begin" -v e="$end" '
    $0 == b { skip = 1; held = 0; next }
    $0 == e { skip = 0; next }
    skip { next }
    $0 == "" { held++; next }
    { while (held > 0) { print ""; held-- } print }
    END { while (held > 0) { print ""; held-- } }
  ' "$work" > "$f"
  rm -f -- "$work"
}

block() {
  cat <<EOF
$begin
# Added by Cyclops Spark's installer (optional launch banner). Remove with: ./uninstall.sh or banner.sh remove
# If claude is an alias (a local Claude Code install adds one), keep what it points at and call that.
__cyclops_claude_cmd=""
if alias claude >/dev/null 2>&1; then
  __cyclops_claude_cmd="\$(alias claude | sed -E "s/^(alias )?claude=//; s/^'(.*)'\\\$/\\1/")"
  unalias claude
fi
function claude {
  if [ "\${CYCLOPS_BANNER:-1}" != 0 ] && [ -t 1 ] && [ -r "$dest" ] \\
     && [ "\$(tput cols 2>/dev/null || echo 80)" -ge 64 ]; then
    local a show=1
    case "\${1:-}" in plugin|plugins|mcp|config|update|doctor|install|setup-token|migrate-installer) show=0 ;; esac
    for a in "\$@"; do case "\$a" in -p|--print|-v|--version|-h|--help) show=0 ;; esac; done
    [ "\$show" = 1 ] && cat -- "$dest"
  fi
  if [ -n "\$__cyclops_claude_cmd" ]; then eval "\$__cyclops_claude_cmd"' "\$@"'; else command claude "\$@"; fi
}
$end
EOF
}

case "${1:-status}" in
  install)
    mkdir -p -- "$dest_dir"
    cp -- "$here/banner.txt" "$dest"
    while read -r f; do
      # the file as it was before the banner, kept beside it (once: a refresh keeps the first copy)
      if [ -f "$f" ] && ! grep -qF "$begin" "$f" && [ ! -e "$f.cyclops-banner.bak" ]; then cp -p -- "$f" "$f.cyclops-banner.bak"; fi
      strip_block "$f"            # refresh rather than stack a second copy
      { [ -s "$f" ] && printf '\n'; block; } >> "$f"
      printf '  launch banner: added to %s\n' "$f"
    done < <(rc_files)
    printf '  launch banner: open a new terminal to see it (CYCLOPS_BANNER=0 hides it for a session)\n'
    ;;
  remove)
    found=""
    for f in "$HOME/.bashrc" "$HOME/.zshrc"; do
      if [ -f "$f" ] && grep -qF "$begin" "$f"; then strip_block "$f"; found=1
        printf '  launch banner: removed from %s\n' "$f"; fi
    done
    [ -n "$found" ] || printf '  launch banner: not installed\n'
    # Only delete the copy we put there; a banner you edited yourself stays.
    if [ -f "$dest" ] && cmp -s -- "$dest" "$here/banner.txt"; then
      rm -f -- "$dest"; rmdir -- "$dest_dir" 2>/dev/null || true
    fi
    ;;
  status)
    on=""
    for f in "$HOME/.bashrc" "$HOME/.zshrc"; do
      [ -f "$f" ] && grep -qF "$begin" "$f" && { printf '  launch banner: on (%s)\n' "$f"; on=1; }
    done
    [ -n "$on" ] || printf '  launch banner: off\n'
    ;;
  *) printf 'usage: %s install | remove | status\n' "$0" >&2; exit 2 ;;
esac
