#!/usr/bin/env bash
# Quick deploy-state check — no auth needed.
# Usage:  bash scripts/deploy-check.sh [marker-string]
#   marker-string: optional grep pattern to confirm a specific commit's code is live
#                  (e.g. "BUILD 0514-A")

set -u
FRONTEND="https://adh-tea.fun"
BACKEND="https://api.adh-tea.fun"
MARKER="${1:-}"

echo "=== Frontend (Vercel) ==="
HTML="$(curl -sL "$FRONTEND/")"
JS=$(echo "$HTML"   | grep -oE 'index-[A-Za-z0-9_-]+\.js'  | head -1)
CSS=$(echo "$HTML"  | grep -oE 'index-[A-Za-z0-9_-]+\.css' | head -1)
echo "  HTML loaded:   $(echo "$HTML" | wc -c) bytes"
echo "  JS asset:      $JS"
echo "  CSS asset:     $CSS"

if [[ -n "$MARKER" ]]; then
  echo
  echo "=== Marker check: \"$MARKER\" ==="
  JS_HITS=$(curl -sL  "$FRONTEND/assets/$JS"  | grep -c "$MARKER")
  CSS_HITS=$(curl -sL "$FRONTEND/assets/$CSS" | grep -c "$MARKER")
  echo "  in JS:  $JS_HITS occurrence(s)"
  echo "  in CSS: $CSS_HITS occurrence(s)"
  if [[ "$JS_HITS" -gt 0 || "$CSS_HITS" -gt 0 ]]; then
    echo "  → marker LIVE on production"
  else
    echo "  → marker NOT FOUND — deploy hasn't propagated, or wrong marker"
  fi
fi

echo
echo "=== Backend (Render) ==="
HEALTH=$(curl -s "$BACKEND/health")
echo "  /health: $HEALTH"

echo
echo "=== Local vs remote commit ==="
LOCAL=$(git rev-parse --short HEAD)
echo "  local HEAD:    $LOCAL"
echo "  (compare with Vercel deployment commit in dashboard)"
