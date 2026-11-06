# ADR 0015 · Node-only scripts for Windows and macOS; no bash or PowerShell in the repo

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §6; [cli-facts-2026-11-06.md](../reference/cli-facts-2026-11-06.md)

## Context

Windows is the main OS and macOS the second. On Windows, Claude Code runs string hooks with Git Bash or PowerShell, Antigravity and Gemini CLI use PowerShell, and exec-form hooks cannot spawn `.cmd` shims. The product plan (§8) already says: everything is Node, no bash, no PowerShell.

## Decision

- Every script is Node (`scripts/*.mjs`, `tsx` for TypeScript). No `.sh`, `.ps1` or `.cmd` files in the repo; `pnpm docs:check` rejects them. Husky hooks call `node` or `pnpm`.
- Hooks are configured as `node` plus an absolute script path (Claude exec form `{"command": "node", "args": [...]}`); hook code normalizes backslashes in paths.
- `child_process.spawn` always with `shell: false`. `elvaria doctor` resolves absolute executables; an npm `.cmd` shim is read and run as `node <js>`.
- Kill tree in `runner-core/src/process/kill-tree.ts`: `taskkill /PID <pid> /T /F` on Windows, SIGTERM then SIGKILL on macOS.
- Paths: `node:path` everywhere, `/` inside data files, case-insensitive comparison on Windows; `.gitattributes` sets `* text=auto eol=lf`.
- Atomic write = temp file + `rename`, retried up to 5 times on EPERM (antivirus, indexer); file locks with `proper-lockfile`.
- The event log is tailed by polling `fs.stat` size every 500 ms with a cursor; no `fs.watch`, no chokidar.
- Notifications go through `Bell`; `node-notifier` covers Windows toasts and macOS Notification Center.
- CI matrix: `windows-latest`, `macos-latest`, `ubuntu-latest`.

## Consequences

- One runtime and one toolchain for hooks, CLI, Steward and herald.
- Territory check commands must be `pnpm`, `node` or `git` invocations without shell syntax, because the two tribes run them in different shells.
