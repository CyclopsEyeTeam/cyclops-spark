#!/usr/bin/env bash
# Remove Cyclops Spark from Claude Code. This folder and its files are left alone.
set -euo pipefail

plugin="cyclops-spark@cyclops-spark"
command -v claude >/dev/null 2>&1 || { printf 'Cyclops Spark: Claude Code is not installed; nothing to remove.\n' >&2; exit 0; }

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
