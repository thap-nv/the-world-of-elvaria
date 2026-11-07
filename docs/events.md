# Danh mục event (v1)

> Sinh từ `packages/domain` (`EVENT_TYPES`, `EventSchema`, `EVENT_DATA_SCHEMAS`) bằng `pnpm docs:gen`, CI kiểm drift: sửa nguồn rồi chạy lại lệnh, không sửa file này.

Mỗi dòng của `events/YYYY-MM-DD.jsonl` và `quests/<id>/journal.jsonl` là một event; log chỉ ghi thêm, không bao giờ viết lại. `type` là `nhóm.hành_động`; reader giữ nguyên type lạ, renderer bỏ qua nó. Hợp đồng đầy đủ: [schemas/event.schema.json](schemas/event.schema.json); nghĩa từng nhóm và các tiền tố dành sẵn: [glossary.md](glossary.md) mục 12.

56 type trong danh mục v1, 43 type có schema cho `data`; type khác ghi `data` là object mở (`{}` khi không có gì).

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

## `quest` · 19 type

| Type | `data` |
|---|---|
| `quest.drafted` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.created` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.claimed` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.released` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.started` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.submitted` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.returned` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.verdict` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.done` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.sealed` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.archived` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.blocked` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.unblocked` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.paused` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.resumed` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.infirmary` | `reason`: string (không rỗng) — e.g. breaker:time, breaker:tokens, max_attempts, script_error.<br>`quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.delivered` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.edited` | `quest`: object { id, title, kind, rank, territory, status, tier, class_required, tags, assignee, verifier, attempts, max_attempts, seal_required, sealed_at, question, party_id, party_role, campaign_id, parent_id, depends_on, delivered_at, created_at, updated_at } — The quest after this event (questViewOf). Its id is the envelope `quest`.<br>`characters` (tùy chọn): array of object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own. |
| `quest.unclaimable` | `reason`: một trong `no_class`, `level_too_low` — no_class: no character of the class outside the suspended ones and the disabled tribes; level_too_low: even the highest level among them cannot take the rank, not even when nobody else could (canTake); null: the reason is gone.<br>`rank`: một trong `F`, `E`, `D`, `C`, `B`, `A`, `S`<br>`class`: string (khớp `^[a-z][a-z0-9_]*$`) — The quest's class_required.<br>`best_character` (tùy chọn): string (khớp `^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$`, khác `user`, `machine`, `temple`) — level_too_low: the highest-level character of the class.<br>`best_level` (tùy chọn): integer ≥ 1 |

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
| `mana.exhausted` | `tribe`: string (khớp `^[a-z][a-z0-9_]*$`)<br>`pool`: string (khớp `^[a-z][a-z0-9_]*$`) |
| `mana.restored` | `tribe`: string (khớp `^[a-z][a-z0-9_]*$`)<br>`pool`: string (khớp `^[a-z][a-z0-9_]*$`) |
| `mana.probe` | object mở, chưa có schema |
| `mana.signal` | `error`: string (khớp `^[a-z][a-z0-9_]*$`)<br>`source`: string (khớp `^[a-z][a-z0-9_]*$`) |

## `character` · 9 type

| Type | `data` |
|---|---|
| `character.created` | `character`: object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — The character after this event (characterViewOf). |
| `character.sleep` | `character`: object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — The character after this event (characterViewOf). |
| `character.wake` | `character`: object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — The character after this event (characterViewOf). |
| `character.meditate` | `character`: object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — The character after this event (characterViewOf). |
| `character.suspend` | `character`: object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — The character after this event (characterViewOf). |
| `character.release` | `character`: object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — The character after this event (characterViewOf). |
| `character.swamp` | `character`: object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — The character after this event (characterViewOf). |
| `character.level_up` | `character`: object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — The character after this event (characterViewOf). |
| `character.level_down` | `character`: object { id, name, class, tribe, model, level, status, status_since, current, reputation, title } — The character after this event (characterViewOf). |

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
| `territory.attached` | `territory`: object { id, name, kind, health, surveyed_at } — The territory after this event (territoryViewOf). |
| `territory.surveyed` | `territory`: object { id, name, kind, health, surveyed_at } — The territory after this event (territoryViewOf). |
| `territory.health` | `territory`: object { id, name, kind, health, surveyed_at } — The territory after this event (territoryViewOf). |

## `sandbox` · 2 type

| Type | `data` |
|---|---|
| `sandbox.replay.start` | object mở, chưa có schema |
| `sandbox.replay.end` | object mở, chưa có schema |
