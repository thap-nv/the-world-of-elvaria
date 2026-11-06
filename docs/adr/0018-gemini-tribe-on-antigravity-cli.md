# ADR 0018 · Gemini tribe runs on Antigravity CLI behind an explicit terms acknowledgement; Gemini CLI with an API key is the one-setting fallback

- Status: accepted · 2026-11-06 · revisited 2026-11-06 after spike P1-12a
- Related: [implementation-plan.md](../implementation-plan.md) §3.0, §3.5, §3.7, §3.8, §9.1 item 12; [cli-facts-2026-11-06.md](../reference/cli-facts-2026-11-06.md); [spike P1-12a](../spikes/antigravity-2026-11.md)

## Context

- Since 2026-06-18 Gemini CLI no longer serves Google AI Pro/Ultra or individual Code Assist; it still serves Code Assist Standard/Enterprise and paid Gemini API keys.
- The user has Google AI Pro and chose Antigravity CLI on 2026-11-06. `agy` 1.5.1 was installed by the VS Code extension at `~/.gemini/bin/agy.exe` (replaced by 1.5.2 the same afternoon), is already signed in, and has headless `-p`, stream-json, `--json-schema`, per-run `--settings`, hooks and `/usage`.
- The Antigravity FAQ says headless `agy -p` is for scripting and CI; wrapping `agy` inside third-party coding agents or applications "is not supported under consumer plans"; using third-party software to access Antigravity "is a violation of our Terms of Service" and can lead to suspension or termination.

## Decision

- In stage 1 the Gemini tribe runs on Antigravity CLI through `@elvaria/runner-antigravity`. This is the user's informed choice for their own account.
- It is enabled only by a tribe entry `{ id: "gemini", adapter: "antigravity", tool: { path, version, terms_acknowledged_at } }` in `kingdom.tribes`; `elvaria doctor` refuses to run it without `terms_acknowledged_at`. Elvaria never rotates, hides or shares accounts.
- Fallback behind the same `AgentRunner`: `adapter: "gemini_cli"` → `@elvaria/runner-gemini` (Gemini CLI 0.67.x + an AI Studio API key from the treasury; `tool.auth = api_key`, so `budget.usd_week` is required). Switching is one setting.
- Antigravity also serves Claude and GPT models, so separation of duties compares model family first (ADR 0008), and pool `claude_gpt_models` is off by default.
- The extension auto-updates `agy`: `doctor` pins the version and warns when it changes.
- The product plan's "Gemini CLI" (§8) and "load CLAUDE.md into GEMINI.md" (§13) read as Antigravity CLI; the generated `GEMINI.md` embeds `CLAUDE.md` and `.claude/rules/*.md` with `@[label](path)`.

## After spike P1-12a (`agy` 1.5.2, Windows, 2026-11-06)

The decision stands. How the adapter drives `agy` follows the spike:

- Per-run `--settings` loads `permissions.allow/deny/ask` and never saves them; `deny` blocks and beats a hook `allow`. Allow rules are prefix rules (`command(pnpm test)`, `write_file(src/)`); compound commands never match; `command(regex:…)` must match the whole command, so it is not used.
- A soft-deny in `-p` ends the whole run with an empty response and `denied_actions` (exit 0). The PreToolUse hook therefore answers `deny` for forbidden actions and for sub-agents, and `deny_unless_prior_grant` for everything else, so anything outside the allow list is a hard deny the model can work around. It never answers `allow` (does not pass review) or `auto_approve` (bypasses `permissions.deny`).
- Hooks run through `cmd /c` with quotes mangled; `.agents/hooks.json` calls `node elvaria-hook.mjs <Event>` and a generated shim imports the real hook (ADR 0015, amended).
- Sub-agents run under `-p` and hooks see them, but nothing caps or stops them and their tokens are missing from `result.usage`; they stay denied (ADR 0017).
- Mana: `agy -p /usage --output-format json` returns structured buckets for 0 tokens. Exit codes: 0 done, 1 configuration, 2 usage, 3 model or agent error and print timeout with an `AGY_ERROR` JSON line.
- Pinning: the extension replaces `agy.exe` in place, even while it runs, and `agy` checks for updates itself every 15 minutes unless `AGY_CLI_DISABLE_AUTO_UPDATE=true` (the value `1` is ignored). The runner sets that variable, `doctor` pins `agy --version` (~130 ms, no network), and the runner records the version on every attempt.

## Consequences

- If Google restricts the account, the only remedy is the API-key fallback; principle 6 is unchanged.
- The hook is mandatory for this tribe, not a second fence only: without it every unlisted tool ends the session.
