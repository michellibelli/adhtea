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
# Read status + Render's routing header rather than dumping the body. A sleeping
# or broken instance returns an HTML error page (or a Cloudflare challenge), and
# echoing that buried the actual signal in a screenful of markup.
HDRS=$(curl -s -m 60 -D - -o /dev/null -w '%{http_code}'        -H 'Accept: application/json' "$BACKEND/health")
CODE=$(printf '%s' "$HDRS" | tail -1)
ROUTING=$(printf '%s' "$HDRS" | sed -n 's/^[Xx]-[Rr]ender-[Rr]outing: *//p' | tr -d '[:cntrl:]')
SERVER=$(printf '%s' "$HDRS" | sed -n 's/^[Ss]erver: *//p' | tr -d '[:cntrl:]')

echo "  /health status: ${CODE:-no-response}"
[[ -n "${ROUTING:-}" ]] && echo "  x-render-routing: $ROUTING"

if [[ "$CODE" == "200" ]]; then
  BODY=$(curl -s -m 60 "$BACKEND/health" | head -c 200)
  echo "  body: $BODY"
  echo "  → backend UP"
else
  case "${ROUTING:-}" in
    hibernate-wake-error)
      echo "  → Render CANNOT WAKE the hibernated instance."
      echo "    This is a Render-side fault, not your code and not Supabase."
      echo "    Free-tier wakes go through Render's build/deploy path, so a"
      echo "    deploy incident takes the live app down. In the UI this shows"
      echo "    up as 'Failed to fetch' on login (the CORS preflight 503s)."
      echo "    Check: https://status.render.com/api/v2/status.json"
      ;;
    hibernate*)
      echo "  → instance hibernating; a wake is in progress. Retry in ~60s." ;;
    *)
      if [[ "$CODE" == "429" ]]; then
        echo "  → rate-limited (429) by Cloudflare, not a backend fault."
        echo "    Repeated scripted probes trip this. Wait a few minutes."
      elif [[ "${SERVER:-}" == "cloudflare" && "$CODE" == "403" ]]; then
        echo "  → Cloudflare managed challenge (bot check) — script traffic is"
        echo "    being challenged. Browser traffic passes transparently, so the"
        echo "    app is almost certainly fine; retry in a minute."
        echo "    Nothing to configure: that Cloudflare is RENDER's, in front of"
        echo "    every custom domain (api.adh-tea.fun -> onrender.com ->"
        echo "    cdn.cloudflare.net). Our DNS is at whois.com, so there is no"
        echo "    Cloudflare dashboard of ours to add a bypass rule to."
      else
        echo "  → backend DOWN or unreachable (server: ${SERVER:-unknown})"
      fi
      ;;
  esac
fi

echo
echo "=== Local vs remote commit ==="
LOCAL=$(git rev-parse --short HEAD)
echo "  local HEAD:    $LOCAL"
echo "  (compare with Vercel deployment commit in dashboard)"
