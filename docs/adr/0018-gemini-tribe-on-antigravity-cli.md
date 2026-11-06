# ADR 0018 · Gemini tribe runs on Antigravity CLI behind an explicit terms acknowledgement; Gemini CLI with an API key is the one-setting fallback

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §3.0, §3.7, §3.8, §9.1 item 12; [cli-facts-2026-11-06.md](../reference/cli-facts-2026-11-06.md)

## Context

- Since 2026-06-18 Gemini CLI no longer serves Google AI Pro/Ultra or individual Code Assist; it still serves Code Assist Standard/Enterprise and paid Gemini API keys.
- The user has Google AI Pro and chose Antigravity CLI on 2026-11-06. `agy` 1.5.1 was installed by the VS Code extension at `~/.gemini/bin/agy.exe`, is already signed in, and has headless `-p`, stream-json, `--json-schema`, per-run `--settings`, hooks and `/usage`.
- The Antigravity FAQ says headless `agy -p` is for scripting and CI; wrapping `agy` inside third-party coding agents or applications "is not supported under consumer plans"; using third-party software to access Antigravity "is a violation of our Terms of Service" and can lead to suspension or termination.

## Decision

- In stage 1 the Gemini tribe runs on Antigravity CLI through `@elvaria/runner-antigravity`. This is the user's informed choice for their own account.
- It is enabled only by a tribe entry `{ id: "gemini", adapter: "antigravity", tool: { path, version, terms_acknowledged_at } }` in `kingdom.tribes`; `elvaria doctor` refuses to run it without `terms_acknowledged_at`. Elvaria never rotates, hides or shares accounts.
- Fallback behind the same `AgentRunner`: `adapter: "gemini_cli"` → `@elvaria/runner-gemini` (Gemini CLI 0.67.x + an AI Studio API key from the treasury; `tool.auth = api_key`, so `budget.usd_week` is required). Switching is one setting.
- Antigravity also serves Claude and GPT models, so separation of duties compares model family first (ADR 0008), and pool `claude_gpt_models` is off by default.
- The extension auto-updates `agy`: `doctor` pins the version and warns when it changes.
- The product plan's "Gemini CLI" (§8) and "load CLAUDE.md into GEMINI.md" (§13) read as Antigravity CLI; the generated `GEMINI.md` embeds `CLAUDE.md` and `.claude/rules/*.md` with `@[label](path)`.

## Consequences

- If Google restricts the account, the only remedy is the API-key fallback; principle 6 is unchanged.
- Revisit after spike P1-12a: `permissions.deny` in `--settings` under `-p`, hook env and shell on Windows, exit codes, sub-agents, `/usage` format.
