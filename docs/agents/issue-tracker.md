# Issue tracker: Gitea

Issues and specs for this repo are hosted on Gitea and managed with the `tea` CLI.

## Conventions

- **Create an issue:** `tea issues create --title "..." --description "..."`. Use `--description-file -` to read a multi-line body from stdin (heredoc). Create a label first if it is missing: `tea labels create --name "..." --color "..." --description "..."`. A label must exist in the repo before it can be applied to an issue (`tea issues edit --add-labels` silently ignores unknown labels).
- **Read an issue:** `tea issues <number> --comments`. Machine-readable: `tea issues <number> --fields "index,title,state,author,labels,body" --output json`.
- **List issues:** `tea issues list --state open --labels "..."` with `--fields` and `--output json` filters, plus `--author`, `--assignee`, `--keyword` as needed.
- **Comment on an issue:** `tea comments <number> "..."` (or `tea comments add <number> --description "..."`).
- **Apply / remove labels:** `tea issues edit <number> --add-labels "..."` / `--remove-labels "..."`. Comma-separated lists or repeat the flag.
- **Close:** `tea issues close <number>`. It accepts no closing comment, so post the explanation first with `tea comments <number> "..."`, then close. Gitea reads the close comment as the close reason: use `Reason: completed` for work that is done, or `Reason: not planned` for rejections (see `triage-labels.md`).

Infer the repo from `git remote -v`; `tea` reads the logged-in Gitea instance from its config (`tea logins`) and resolves the repo from the remote.

## When to publish or fetch

- When asked to publish a spec or ticket, create a Gitea issue: `tea issues create --title "..." --description "..."`.
- When asked to fetch a relevant ticket, read it as in **Read an issue** above.

## Wayfinding operations

Used when working a chain of tickets that hangs off a map.

- **Map:** a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `tea issues create --label wayfinder:map`.
- **Child ticket:** an issue linked to the map with `Part of #<map>` at the top of its body and labels `wayfinder:<type>` (`research` / `prototype` / `grilling` / `task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking:** `tea` does not expose Gitea's issue dependencies, so use a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier:** list the map's open children (`tea issues list --state open`, scoped by the `Part of #<map>` lines or the `wayfinder:*` labels), drop any with an open blocker (an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim:** `tea issues edit <number> --add-assignees <username>`, the session's first write. `tea` does not accept `@me`; use the actual Gitea username.
- **Resolve:** `tea comments <number> "Reason: completed"`, then `tea issues close <number>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
