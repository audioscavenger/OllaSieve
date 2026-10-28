# AGENTS.md

## Agent skills

### Issue tracker

Issues and specs for this repo are hosted on Gitea and managed with the `tea` CLI. See `docs/agents/issue-tracker.md` for the full conventions.

### Triage labels

This repo uses five canonical triage roles. This file maps those roles to the actual label strings used in this repo's Gitea issue tracker. See `docs/agents/triage-labels.md` for the label vocabulary and close reasons.

### Domain docs

Single-context layout: one `GLOSSARY.md` and one `docs/adr/` at the repo root. See `docs/agents/domain.md` for consumer rules.

### Ticket update rule

After implementing any ticket (checking all checkbox items, committing code, passing tests), the agent MUST post the close reason first via `tea comments <number>`: `Reason: completed` when the work is done, or `Reason: not planned` for rejections. Then close the ticket with `tea issues close <number>`. The agent must also update `CHANGELOG.md`. A sub-agent reviewing the work must check the ticket was closed with the right reason; if not, treat the ticket as incomplete even if the code is present.

### Dev ports

OllaSieve runs OllaSurf on :11400 and OllaClass on :11401. To kill a specific instance, find its PID first (`netstat -ano | findstr :11400`) - never kill all node.exe (OpenChamber runs as node.exe).

### File-edit rules

- Files under 100 lines: prefer `write` (full rewrite) over piecemeal edits.
- No `sed`. Only `sd` (literal replace) is permitted, and only if necessary. Otherwise use `write`.
- Thread-safe: when editing, verify the file after writing (read back or run tests) before proceeding.

### Comments & documentation (must be done during implementation, never after)

- Comments MUST BE ADDED while implementing, not retrofitted when the user notices they are missing.
- JSDocs (`/** ... */`) required on all public functions/classes; always include `@param` / `@returns` when meaning needs more than one line.
- When more than 2 consecutive lines of `//` are needed to carry meaning, replace them with a block comment `/* ... */` (or `/** ... */` for JSDoc).
- Module-level explanation must describe interaction with other modules (dependency graph / architecture, not just what the file does alone).

## House style

- No em dashes in any prose in this repo. Use a hyphen, colon, period, parentheses, or a conjunction instead.
- Machine-wide file, encoding, and line-ending rules live in the global `~/.config/opencode/AGENTS.md`, not here.
