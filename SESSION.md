# Session bookmark
*Last wrap: 2026-05-15 — Claude-assisted session, post-home-session merge*

## State

Live commit: `55b2b07` (multi-day tournament bundling) — verified deployed via
`scripts/deploy-check.sh`. Plus a follow-up `[wrap]` commit will land with
this file.

Build chip on prod displays the active build timestamp. Render backend
healthy. Vercel CLI linked to project.

## What shipped this session

- **Triage tournament** (`4ea323f`) — `Tournament.jsx` with 3-card pairwise
  rank, tea-cup leaf-fill progress, 20% pun reward, finale screen. Backend
  `/tasks/tournament/state` + `/tasks/tournament/submit`. Reachable from
  Settings → Tasks and from Today's "🍵 Triage all" button.
- **Multi-day bundling** (`55b2b07`) — tournament now distributes ranked
  tasks 10/day across a 30-day horizon. Header shows "Filling Today /
  Tomorrow / Wednesday".
- **Tournament snooze/delete** (`c8e4d7d`) — 🌙 (1mo snooze) and ✕ (delete)
  on each card.
- **Today date-push bug fix** (`c8e4d7d`) — backend `update_task` now demotes
  status=today → inbox when `due_date` is pushed to a future date.
- **Project domains UX polish** — `.claude/settings.json` allowlist; nav
  animation-only-when-active; capture pill `flex-wrap` (`18f0384`, `d8f4c37`).
- **GitHub Issues #1–#8** filed from this session's known opens.
- **WORKFLOW.md** + this file (`SESSION.md`) — async-team workflow protocol.

## What was attempted but not done

- None this session. Tournament feature shipped clean.

## What's open

See `gh issue list --state open` (8 issues, #1–#8 filed this session). Top
candidates for the next session:

1. **#1** — verify tournament end-to-end with real inbox data.
2. **#6** — give tournament card snooze a date picker instead of 1-month
   default (low-effort UX improvement).
3. **#3** — TriageCard pencil edit parity with TaskCard.

## Where to resume

Open `gh issue list` and `git log --oneline -15` first. The tournament is
the most recent unfamiliar territory — exercise it on a real inbox before
adding more behavior.

If picking up a new feature: branch off master with `feature/<topic>` and
open a draft PR on first push.

## Notes for next session

- Auto-deploy on Vercel is reliable; `bash scripts/deploy-check.sh` confirms
  hash + BUILD timestamp in ~5 sec.
- `scripts/aria-api.sh /tasks/today` etc. for authenticated production checks.
  Token in `~/.aria-token` (30-day expiry).
- Backend cap behavior in tournament: `_find_target` walks today..+30,
  picks first day with <10 non-routine tasks. Edits to that logic affect
  both single-day and "Triage all" flows.
