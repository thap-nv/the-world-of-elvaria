# ADR 0013 · Treasury: secrets never enter prompts, journals or logs; minimal env; redaction is data

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §3.9; [territory.schema.json](../schemas/territory.schema.json)

## Context

The product plan (§7, "Kho bảo vật"): secrets, `.env` and tokens never enter a prompt or a journal. Claude Code and Antigravity read files and run shell commands; Gemini CLI also auto-loads `.env` files walking up from the working directory.

## Decision

- The treasury is the file `paths.treasury` (default `~/.elvaria/treasury.json`, outside the kingdom; mode 0600 on macOS) holding `{ "name": "value" }`. A keychain adapter can follow behind `interface Treasury { names(); resolve(names) }`.
- CLIs are spawned with a minimal env allowlist (PATH, HOME/USERPROFILE, APPDATA, LOCALAPPDATA, TEMP/TMP, SystemRoot, ComSpec, PATHEXT, LANG, plus what the CLI needs to find its credentials), `ELVARIA_*`, and exactly the names in `quest.secrets_required`. Never `process.env` wholesale. (Amended 2026-11-07, P1-10: TMPDIR joins the list as macOS's TEMP; a treasury name becomes its upper-case env variable, `npm_token` → `NPM_TOKEN`, and one that would replace another variable is refused.) (Amended 2026-11-09, P1-35, chosen by the owner: ProgramFiles and ProgramData join the list, the folders where Docker's CLI finds its plugins on Windows; without them `docker compose` is an unknown command in a territory's check and in a judge's shell.)
- `quest.secrets_required ⊆ territory.secrets_allowed`; the Chancellor cannot add names, and `transition(claim)` rejects a quest that asks for more. (Amended 2026-11-07, P1-10: the Steward refuses such a `create_quest` with `secret_not_allowed`, and opens no session when the territory has dropped a name since or the treasury lacks one; `transition` does not see territories.)
- (Added 2026-11-07, P1-10) The hook learns which values to mask from `policy.json`: `secrets` lists the env names, never values; the hook reads the values from its own env, which the CLI inherited. The runner masks the same values in `.runs/` and its own lines; the Steward masks them in the handover letter, the question and the verifier's output when a session ends.
- Deny rules cover `./.env`, `./.env.*` and `laws.forbidden_paths` for Read and Edit; the PreToolUse hook also blocks shell reads (`cat .env`, `type .env`, `Get-Content .env`).
- `redact(text, known, patterns)` masks known values exactly plus patterns (`sk-ant-`, `AIza`, `ghp_`, `github_pat_`, `xox?-`, `AKIA`, JWTs, private key blocks, `token|secret|password|api_key = …`). Patterns are data in `eventlog/src/redact-patterns.json`.
- Redaction runs in the hook before append, in the runner for `.runs/`, in the store for `handover.md` and verdict notes, and in the herald before WebSocket.
- Gemini CLI fallback: `--ignore-env`, `advanced.ignoreLocalEnv`, its own `GEMINI_CLI_HOME`; a worktree with `.gemini/.env` is refused.

## Consequences

- A fixture with 12 kinds of secret shows 0 occurrences in events, journals and `.runs/`.
- A leak is bounded: a secret is not in the env unless the quest asked for it.
