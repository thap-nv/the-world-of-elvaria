# Danh mục event (v1)

> Sinh từ `packages/domain` (`EVENT_TYPES`, `EventSchema`, `EVENT_DATA_SCHEMAS`) bằng `pnpm docs:gen`, CI kiểm drift: sửa nguồn rồi chạy lại lệnh, không sửa file này.

Mỗi dòng của `events/YYYY-MM-DD.jsonl` và `quests/<id>/journal.jsonl` là một event; log chỉ ghi thêm, không bao giờ viết lại. `type` là `nhóm.hành_động`; reader giữ nguyên type lạ, renderer bỏ qua nó. Hợp đồng đầy đủ: [schemas/event.schema.json](schemas/event.schema.json); nghĩa từng nhóm và các tiền tố dành sẵn: [glossary.md](glossary.md) mục 12.

54 type trong danh mục v1, 11 type có schema cho `data`; type khác ghi `data` là object mở (`{}` khi không có gì).

## Khung một dòng

| Trường | Bắt buộc | Kiểu | Mô tả |
|---|---|---|---|
| `v` | có | `1` | |
| `id` | có | string (khớp `^[0-9A-HJKMNP-TV-Z]{26}$`) | ULID from IdSource; sortable by time. |
| `ts` | có | string (date-time) | |
| `type` | có | string (khớp `^[a-z_]+(\.[a-z_]+)+$`) | |
| `actor` | có | object { kind, id? } | |
| `quest` | | string (khớp `^q_[0-9]{8}_[0-9a-hjkmnp-tv-z]{6}$`) | |
| `attempt` | | integer ≥ 1 | |
| `territory` | | string (khớp `^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$`, khác `global`) | |
| `session` | | string (không rỗng) | |
| `data` | có | object | |

## `quest` · 17 type

| Type | `data` |
|---|---|
| `quest.drafted` | object mở, chưa có schema |
| `quest.created` | object mở, chưa có schema |
| `quest.claimed` | object mở, chưa có schema |
| `quest.released` | object mở, chưa có schema |
| `quest.started` | object mở, chưa có schema |
| `quest.submitted` | object mở, chưa có schema |
| `quest.returned` | object mở, chưa có schema |
| `quest.verdict` | object mở, chưa có schema |
| `quest.done` | object mở, chưa có schema |
| `quest.sealed` | object mở, chưa có schema |
| `quest.archived` | object mở, chưa có schema |
| `quest.blocked` | object mở, chưa có schema |
| `quest.unblocked` | object mở, chưa có schema |
| `quest.paused` | object mở, chưa có schema |
| `quest.resumed` | object mở, chưa có schema |
| `quest.infirmary` | `reason`: string (không rỗng) — e.g. breaker:time, breaker:tokens, max_attempts, script_error. |
| `quest.delivered` | object mở, chưa có schema |

## `agent` · 9 type

| Type | `data` |
|---|---|
| `agent.session.start` | `session`: string (không rỗng)<br>`model`: string (khớp `^[a-z0-9][a-z0-9.-]*$`) |
| `agent.session.end` | `outcome`: một trong `completed`, `max_turns`, `budget`, `killed`, `error` — RunResult.outcome (implementation-plan §3.7).<br>`usage` (tùy chọn): object { tokens, turns? } |
| `agent.tool` | `tool`: một trong `read`, `write`, `bash`, `web`, `search`, `other` — Normalised tool kind (implementation-plan §3.10): Read/Glob/Grep and read_file map to read, Edit/Write and write_file/replace to write, Bash and run_shell_command to bash, WebFetch/WebSearch to web.<br>`path` (tùy chọn): string (không rỗng) — Relative to the plot, '/' separators.<br>`command` (tùy chọn): string — Redacted.<br>`url` (tùy chọn): string<br>`exit` (tùy chọn): integer<br>`duration_ms` (tùy chọn): integer ≥ 0 |
| `agent.tool.blocked` | `tool`: một trong `read`, `write`, `bash`, `web`, `search`, `other` — Normalised tool kind (implementation-plan §3.10): Read/Glob/Grep and read_file map to read, Edit/Write and write_file/replace to write, Bash and run_shell_command to bash, WebFetch/WebSearch to web.<br>`reason`: string (không rỗng) |
| `agent.subagent.start` | object mở, chưa có schema |
| `agent.subagent.end` | `agent_type`: string (không rỗng)<br>`duration_ms`: integer ≥ 0 |
| `agent.subagent.overrun` | `agent_type`: string (không rỗng)<br>`duration_ms`: integer ≥ 0<br>`limit_minutes`: integer ≥ 1 |
| `agent.compact` | object mở, chưa có schema |
| `agent.notification` | object mở, chưa có schema |

## `verdict` · 3 type

| Type | `data` |
|---|---|
| `verdict.pass` | object mở, chưa có schema |
| `verdict.fail` | object mở, chưa có schema |
| `verdict.partial` | object mở, chưa có schema |

## `mana` · 6 type

| Type | `data` |
|---|---|
| `mana.level` | `tribe`: string (khớp `^[a-z][a-z0-9_]*$`) — TribeId from kingdom.tribes[].<br>`pool`: string (khớp `^[a-z][a-z0-9_]*$`) — PoolId from poolOf(tribe, model): the tribe id for a single-pool account (claude), or the adapter's pool (antigravity: gemini_models, claude_gpt_models).<br>`window`: một trong `five_hour`, `weekly`<br>`used_pct`: number 0–100<br>`resets_at` (tùy chọn): string (date-time)<br>`source`: một trong `rate_limits`, `estimate`, `signal` |
| `mana.warning` | object mở, chưa có schema |
| `mana.exhausted` | object mở, chưa có schema |
| `mana.restored` | object mở, chưa có schema |
| `mana.probe` | object mở, chưa có schema |
| `mana.signal` | `error`: string (khớp `^[a-z][a-z0-9_]*$`)<br>`source`: string (khớp `^[a-z][a-z0-9_]*$`) |

## `character` · 9 type

| Type | `data` |
|---|---|
| `character.created` | object mở, chưa có schema |
| `character.sleep` | object mở, chưa có schema |
| `character.wake` | object mở, chưa có schema |
| `character.meditate` | object mở, chưa có schema |
| `character.suspend` | object mở, chưa có schema |
| `character.release` | object mở, chưa có schema |
| `character.swamp` | object mở, chưa có schema |
| `character.level_up` | object mở, chưa có schema |
| `character.level_down` | object mở, chưa có schema |

## `command` · 3 type

| Type | `data` |
|---|---|
| `command.received` | object mở, chưa có schema |
| `command.applied` | `command_id`: string (khớp `^[0-9A-HJKMNP-TV-Z]{26}$`)<br>`reason` (tùy chọn): string |
| `command.rejected` | `command_id`: string (khớp `^[0-9A-HJKMNP-TV-Z]{26}$`)<br>`reason` (tùy chọn): string |

## `delivery` · 1 type

| Type | `data` |
|---|---|
| `delivery.sent` | object mở, chưa có schema |

## `chronicle` · 1 type

| Type | `data` |
|---|---|
| `chronicle.written` | object mở, chưa có schema |

## `territory` · 3 type

| Type | `data` |
|---|---|
| `territory.attached` | object mở, chưa có schema |
| `territory.surveyed` | object mở, chưa có schema |
| `territory.health` | object mở, chưa có schema |

## `sandbox` · 2 type

| Type | `data` |
|---|---|
| `sandbox.replay.start` | object mở, chưa có schema |
| `sandbox.replay.end` | object mở, chưa có schema |
