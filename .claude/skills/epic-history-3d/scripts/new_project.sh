#!/bin/bash
# Start a film project from the skill's template.
#   bash new_project.sh <project-dir>
# Copies the template (without node_modules) and installs packages. Safe to re-run.
set -e
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
DST="${1:?usage: new_project.sh <project-dir>}"
mkdir -p "$DST"
tar -C "$SKILL/template" --exclude=node_modules --exclude=out -cf - . | tar -C "$DST" -xf -
cd "$DST"
[ -d node_modules/remotion ] || npm install --no-audit --no-fund --loglevel=error
echo "project ready: $DST"
