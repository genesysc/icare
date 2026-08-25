# Instructions for AI assistants

Before doing anything else, read `HANDOVER.md` in full, then `PROGRESS.md`
— `HANDOVER.md` is the curated entry point (non-negotiables, stack, what's
built/not built, gotchas, open questions); `PROGRESS.md` is the detailed
chronological session log for history `HANDOVER.md` doesn't cover. Don't
ask the user to re-explain project history; it's in those files.

Before ending a session (or after any meaningful change), update
`PROGRESS.md` to reflect the new state: what changed, what's still
pending, and any new blockers. Update `HANDOVER.md` too if something
changes that a fresh agent would need to know up front (a new
non-negotiable, a changed architecture decision, a new blocking
dependency) — not every session needs this, but don't let it go stale
either.
