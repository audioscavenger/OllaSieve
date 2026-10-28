# AGENTS.md

## Agent skills

### Issue tracker

Local markdown issue tracker. Issues live as files under `.scratch/<feature>/issue.md` in this repo. See `docs/agents/issue-tracker.md` for the full conventions.

### Triage labels

The skills speak in terms of five canonical triage roles. See `docs/agents/triage-labels.md` for the label vocabulary.

### Domain docs

Single-context layout: one `GLOSSARY.md` and one `docs/adr/` at the repo root. See `docs/agents/domain.md` for consumer rules.

### Ticket update rule

After implementing any ticket (checking all checkbox items, committing code, passing tests), the agent MUST update `.scratch/core/issues/<NN>-*.md`: tick every checkbox item (`- [x]`) and mark Status `done`. The agent must also update `CHANGELOG.md`. A sub-agent reviewing the work must check the ticket file was updated; if not, treat the ticket as incomplete even if code is present.

### Dev ports

OllaSieve runs OllaSurf on :11400 and OllaClass on :11401. To kill a specific instance, find its PID first (`netstat -ano | findstr :11400`) — never kill all node.exe (OpenChamber runs as node.exe).
