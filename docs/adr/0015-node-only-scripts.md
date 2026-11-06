# ADR 0015 · Node-only scripts for Windows and macOS; no bash or PowerShell in the repo

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §6; [cli-facts-2026-11-06.md](../reference/cli-facts-2026-11-06.md)

## Context

Windows is the main OS and macOS the second. On Windows, Claude Code runs string hooks with Git Bash or PowerShell, Gemini CLI uses PowerShell, Antigravity runs hooks with `cmd /c` and agent commands with PowerShell (spike P1-12a), and exec-form hooks cannot spawn `.cmd` shims. The product plan (§8) already says: everything is Node, no bash, no PowerShell.

## Decision

- Every script is Node (`scripts/*.mjs`, `tsx` for TypeScript). No `.sh`, `.ps1` or `.cmd` files in the repo; `pnpm docs:check` rejects them. Husky hooks call `node` or `pnpm`.
- Hooks are configured as `node` plus an absolute script path (Claude exec form `{"command": "node", "args": [...]}`); hook code normalizes backslashes in paths. (Amended 2026-11-06, P1-12a: Antigravity runs a hook's `command` string with `cmd /c` on Windows and turns `"` into `\"`, so a quoted absolute path never reaches node. Its generated `.agents/hooks.json` says `node elvaria-hook.mjs <Event>`, and a generated shim of that name in `.agents/`, the hook's working directory, imports the absolute hook; see [the spike](../spikes/antigravity-2026-11.md).)
- `child_process.spawn` always with `shell: false`. `elvaria doctor` resolves absolute executables; an npm `.cmd` shim is read and run as `node <js>`.
- Kill tree in `runner-core/src/process/kill-tree.ts`: `taskkill /PID <pid> /T /F` on Windows, SIGTERM then SIGKILL on macOS.
- Paths: `node:path` everywhere, `/` inside data files, case-insensitive comparison on Windows; `.gitattributes` sets `* text=auto eol=lf`.
- Atomic write = temp file + `rename`, retried on EPERM, EACCES or EBUSY (antivirus, indexer, a reader holding the file) within a 10 s time budget; file locks with `proper-lockfile`. (Amended 2026-11-06, P0-06: the first number, 5 retries, lost about one write in 200 on Windows while another process kept reading the file.)
- The event log is tailed by polling `fs.stat` size every 500 ms with a cursor; no `fs.watch`, no chokidar.
- Notifications go through `Bell`; `node-notifier` covers Windows toasts and macOS Notification Center.
- CI matrix: `windows-latest`, `macos-latest`, `ubuntu-latest`.

## Consequences

- One runtime and one toolchain for hooks, CLI, Steward and herald.
- Territory check commands must be `pnpm`, `node` or `git` invocations without shell syntax, because the two tribes run them in different shells.
