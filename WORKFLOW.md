# Workflow

This repo is worked on across multiple machines / sessions (home + work, plus
Claude-assisted sessions). To prevent the two contexts from stepping on each
other, we use a standard async-team workflow: **issues for what's open,
branches + draft PRs for in-progress work, master for shippable code**.

---

## Session boundaries

### Start of every session

Run this in order before any new work:

```bash
git fetch origin
git log --oneline origin/master..HEAD          # local-only commits (none after a clean pull)
git log --oneline HEAD..origin/master          # commits the other session pushed
gh pr list                                       # in-progress branches you/other-you opened
gh issue list --state open                       # open work
bash scripts/deploy-check.sh                     # live JS/CSS hashes + build chip + backend health
cat SESSION.md                                   # narrative from the last session
```

That's a ~2-minute orient. After this you know:
- What changed since you last looked
- What was in-progress and where it stopped
- What's open and unassigned
- Whether prod is in a good state

### End of every session

Before walking away:

```bash
# 1. Make sure all work is in the repo
git status                                       # nothing uncommitted you care about
git push                                         # all branches up to remote

# 2. Sync the narrative
# Edit SESSION.md — what you did, what you tried, what's blocked,
# what you were about to do next. ~5 short lines.

# 3. File any discovered work as issues
gh issue create -t "..." -l "bug|enhancement|chore"

# 4. If a PR is in-progress, leave it as Draft with a status comment

git add SESSION.md
git commit -m "[wrap] session summary $(date +%F)"
git push
```

---

## Branches

Master stays shippable. WIP lives on feature branches.

| Prefix | Use |
|--------|-----|
| `feature/<topic>` | New functionality |
| `fix/<topic>` | Bug fix |
| `docs/<topic>` | Docs only |
| `chore/<topic>` | Tooling, deps, housekeeping |
| `refactor/<topic>` | Non-functional cleanup |

Don't commit WIP directly to master. Trivial single-commit fixes are OK on
master if they're tested and complete.

---

## Pull requests

**Draft early.** First push to a feature branch → open a draft PR. The other
session sees the description and diff before duplicating effort.

PR description template:

```
## What
One-line summary.

## Why
The reason — the bug, the user request, the design goal.

## Status
- [ ] in progress / blocked-on / ready for review
- [ ] tested locally
- [ ] tested on prod

## Notes
Anything that would not be obvious from the diff.
Open questions for other-session.
```

Merge via squash once the PR is green + you've re-read the diff yourself.

Even solo, **review your own diff before merging.** Catches "did I already do
this?" and stale-context regressions.

---

## Issues

Every bug + every deferred TODO = an issue. **No mental notes.**

Labels we use:

| Label | Meaning |
|-------|---------|
| `bug` | Something broken in shipped code |
| `enhancement` | New functionality / UX improvement |
| `wip` | Active investigation |
| `blocked` | Waiting on external thing |
| `chore` | Tooling, deps, docs, refactor |

Reference in commits: `fix tournament card overflow. closes #12` —
auto-closes the issue when merged to master.

---

## Commits

Imperative subject line, ~70 chars max.

Good:

```
fix tournament cap rollover at day boundary
add domain enforcement to AI breakdown
chore: bump phase to 3.8.2 after deploy
```

Body (optional) explains *why* + any non-obvious context. Diff explains *what*.

---

## Context management (Claude sessions)

Token budget is finite. The chat context is **ephemeral**; the repo is
**durable**. Build for that asymmetry:

1. **Every push, update `SESSION.md`** — even a 2-line delta. This is the
   bookmark in the book. If chat dies, next session reads SESSION.md + recent
   git log and is back to work in <5 min.

2. **Run `/cost` periodically** in long sessions. Cadence:
   - `<50%` — keep working
   - `50–70%` — keep working, but consider closing out the current sub-task
   - `70–85%` — finish the current task, then `/wrap` (write SESSION.md, commit, push)
   - `>85%` — stop accepting new work. `/wrap` immediately, then `/compact` or `/clear`
   - `>95%` — auto-compaction will fire if you don't. Better to `/wrap` first.

3. **`/compact`** keeps the conversation alive but compresses earlier turns.
   Use mid-session to reclaim space.

4. **`/clear`** wipes context entirely. Use after `/wrap` for a clean new
   session.

5. **Claude (the agent)** should proactively suggest `/wrap` around turn ~30
   of substantial work, even without a token reading — that's the rough point
   where session-end discipline pays off.

---

## Files at repo root

| File | Purpose |
|------|---------|
| `SESSION.md` | Narrative bookmark. Overwritten at each `/wrap`. Read at session start. |
| `WORKFLOW.md` | This file. The protocol. |
| `HANDOFF.md` | Living "where we are" doc. Updated less frequently than SESSION; reflects shipped phases. |
| `PROJECT.md` | Long-form project docs. Updated when architecture or major features change. |
| `BUILD` | Phase.build number. Hand-edited or scripted; surfaces in the build chip. |

---

## Quick reference

```bash
# Start of session
git fetch && git log --oneline HEAD..origin/master
gh pr list && gh issue list --state open
cat SESSION.md

# Mid-session new work
gh issue create -t "..." -l enhancement
git checkout -b feature/foo
# ... work ...
git push -u origin feature/foo
gh pr create --draft --title "..." --body-file pr-body.md

# Mid-session bug discovered
gh issue create -t "X breaks Y when Z" -l bug

# End of session
# edit SESSION.md
git add -A && git commit -m "[wrap] $(date +%F)" && git push
```
