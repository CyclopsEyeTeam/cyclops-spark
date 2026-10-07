#!/usr/bin/env bash
# Install (or refresh) Cyclops Spark for Claude Code from this folder.
# It only runs Claude Code's own plugin commands; nothing in your settings is edited by hand.
#
# If an earlier Spark is already installed (from another folder, or an older version),
# it is uninstalled first, so the copy in this folder is the one Claude Code loads.
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
plugin="cyclops-spark@cyclops-spark"
market="cyclops-spark"
need="2.1.288"
config="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

say() { printf '%s\n' "$*"; }
fail() { printf 'Cyclops Spark: %s\n' "$*" >&2; exit 1; }

command -v claude >/dev/null 2>&1 || fail "Claude Code (the 'claude' command) is not installed or not on your PATH."

have="$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true)"
[ -n "$have" ] || fail "could not read the Claude Code version."
if [ "$(printf '%s\n%s\n' "$need" "$have" | sort -V | head -n1)" != "$need" ]; then
  fail "Claude Code $need or later is needed (you have $have). Update Claude Code, then run this again."
fi

# The version this folder carries.
want="$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' "$here/plugins/cyclops-spark/.claude-plugin/plugin.json" \
  | head -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+[^"]*' || true)"
[ -n "$want" ] || fail "could not read the version in plugins/cyclops-spark/.claude-plugin/plugin.json."

# Read what Claude Code already knows about Spark (read only). Prints:
#   line 1: the folder the cyclops-spark marketplace points at (empty if none)
#   line 2: the installed Spark version (empty if none)
#   line 3: the folder settings.json lists for the cyclops-spark marketplace (empty if none)
read_state() {
  local py='
import json, os, re, sys
cfg, market, plugin = sys.argv[1], sys.argv[2], sys.argv[3]
def load(name):
    try:
        with open(os.path.join(cfg, *name)) as f:
            return json.load(f)
    except Exception:
        return {}
def where(entry):
    if not isinstance(entry, dict):
        return ""
    src = entry.get("source") or {}
    return (src.get("path") if isinstance(src, dict) else "") or entry.get("installLocation") or ""
known = load(["plugins", "known_marketplaces.json"])
print(where(known.get(market)))
inst = load(["plugins", "installed_plugins.json"])
inst = inst.get("plugins", inst) if isinstance(inst, dict) else {}
ver = ""
for e in (inst.get(plugin) or []):
    if isinstance(e, dict):
        ver = e.get("version") or ""
        if not ver:
            m = re.search(r"(\d+\.\d+\.\d+[^/]*)/*$", e.get("installPath", ""))
            ver = m.group(1) if m else ""
        if ver:
            break
print(ver)
settings = load(["settings.json"])
print(where((settings.get("extraKnownMarketplaces") or {}).get(market)))
'
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "$py" "$config" "$market" "$plugin" 2>/dev/null || printf '\n\n\n'
  else
    printf '\n\n\n'
  fi
}

same_dir() {
  [ -n "$1" ] && [ -d "$1" ] && [ "$(cd -- "$1" && pwd -P)" = "$here" ]
}

say "Cyclops Spark $want: installing from $here (Claude Code $have)"

# grep reads the whole list (grep -q can stop early and trip pipefail).
has_plugin() { claude plugin list 2>/dev/null | grep -F "$plugin" >/dev/null; }
has_market() { claude plugin marketplace list 2>/dev/null | grep -F "$market" >/dev/null; }

{ read -r old_dir; read -r old_ver; read -r settings_dir; } < <(read_state)
removed=""

if [ -n "$old_dir" ] && ! same_dir "$old_dir"; then
  # An earlier Spark marketplace from another folder holds the name; take it out first.
  say "  found an earlier Spark (${old_ver:-unknown version}) from $old_dir"
  if has_plugin; then
    claude plugin uninstall "$plugin" >/dev/null
    say "  previous plugin: uninstalled"
  fi
  claude plugin marketplace remove "$market" >/dev/null
  say "  previous marketplace: removed (its folder was not touched)"
  removed=1
elif [ -n "$old_ver" ] && [ "$old_ver" != "$want" ]; then
  # Same folder, but Claude Code still holds an older cached copy.
  say "  found Spark $old_ver installed; replacing it with $want"
  claude plugin uninstall "$plugin" >/dev/null
  say "  previous plugin: uninstalled"
  removed=1
fi

if has_market; then
  claude plugin marketplace update "$market" >/dev/null
  say "  marketplace: already added, refreshed"
else
  claude plugin marketplace add "$here" >/dev/null
  say "  marketplace: added"
fi

if has_plugin; then
  claude plugin enable "$plugin" >/dev/null 2>&1 || true
  say "  plugin: already installed, enabled"
else
  claude plugin install "$plugin" >/dev/null
  say "  plugin: installed"
fi

# Check the result, and say so plainly if something still points elsewhere.
{ read -r new_dir; read -r new_ver; read -r settings_dir; } < <(read_state)
if [ -n "$new_dir" ] && ! same_dir "$new_dir"; then
  say ""
  say "  Note: Claude Code still reads Spark from $new_dir, not this folder."
  say "  Run ./uninstall.sh, then ./install.sh again."
elif [ -n "$new_ver" ] && [ "$new_ver" != "$want" ]; then
  say ""
  say "  Note: Claude Code reports Spark $new_ver, not $want. Run ./uninstall.sh, then ./install.sh again."
fi
if [ -n "$settings_dir" ] && ! same_dir "$settings_dir"; then
  say ""
  say "  Note: $config/settings.json still lists the cyclops-spark marketplace at"
  say "  $settings_dir"
  say "  Change that path to $here so an older copy does not come back."
fi

say ""
say "Done. Restart Claude Code (close every open session), then type /spark (or /spark help for every command)."
say "Settings such as sound and palette: claude plugin configure $plugin"
if [ -n "$removed" ]; then
  say "An earlier Spark was removed above, so you may need to set those settings again."
fi
