#!/usr/bin/env bash
# Hit the production API with stored auth token.
# Usage:  bash scripts/aria-api.sh <path> [curl-args...]
# Example: bash scripts/aria-api.sh /tasks/today
#          bash scripts/aria-api.sh /tasks/123 -X PATCH -d '{"title":"x"}'
#
# Reads token from ~/.aria-token (outside this repo).
# Token: localStorage.getItem('aria_token') in browser DevTools on adh-tea.fun

set -u
TOKEN_FILE="${HOME}/.aria-token"
if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "Missing $TOKEN_FILE" >&2
  echo "Get token: on adh-tea.fun open DevTools Console, run:" >&2
  echo "  localStorage.getItem('aria_token')" >&2
  echo "Copy the value (no quotes) into $TOKEN_FILE" >&2
  exit 1
fi
TOKEN="$(tr -d '[:space:]"' < "$TOKEN_FILE")"
PATH_ARG="${1:?path required, e.g. /tasks/today}"
shift || true

BASE="https://api.adh-tea.fun"
curl -sS -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$BASE$PATH_ARG" "$@"
