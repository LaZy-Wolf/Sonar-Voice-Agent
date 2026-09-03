# Decisions log

Adaptations made during the build, and why. Newest first.

## Stage 1 — repo skeleton

**One root `.env` instead of three per-package env files.**
The original plan gave `agent/`, `mcp-server/` and `web/` their own `.env`. The LiveKit
credentials appear in all three, so that design stores the same secret three times and
invites them to drift. There is now a single root `.env`; `make web-env` mirrors just the
three LiveKit values into `web/.env.local`, because Next.js does not read a parent
directory's env file.

**No `docs/architecture.md` yet.**
The design spec at `docs/superpowers/specs/2026-09-03-sonar-voice-agent-design.md` already
carries the diagram and the per-component prose. A second copy would be a second thing to
keep in sync. The README gets its own condensed version at stage 9.

**Plugins declared explicitly rather than via `livekit-agents[extras]`.**
Extra names are not guaranteed to match plugin package names across versions. The exact
package names were verified against PyPI (all at 1.7.1), so they are pinned directly.

**CI's `web` job is guarded by `hashFiles('web/package.json')`.**
`web/` does not exist until stage 6; the guard keeps CI green until then without a
placeholder package.

**Windows, not WSL2.**
The plan required WSL2 solely to run Kokoro in Docker. Kokoro is gone, and `uv` supplies
Python 3.12 on Windows directly, so the WSL2 requirement went with it. The Makefile uses
`.venv/Scripts/python.exe` accordingly.
