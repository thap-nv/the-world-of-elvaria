# Kế hoạch triển khai Elvaria · §2 Dữ liệu và sự kiện

Một phần của [kế hoạch triển khai](../implementation-plan.md), tách ra ở P1-52: chỉ chuyển chỗ, nội dung giữ nguyên. Số mục giữ làm định danh; mục lục và luật ghi ở file chính.

---

## 2. Dữ liệu và sự kiện

### 2.1 Quy ước chung

- Mọi file JSON có `"version": <int>` ở cấp cao nhất, tăng khi schema đổi không tương thích. Mọi dòng event có `"v": <int>`.
- **Nguồn schema**: zod v4 trong `packages/domain/src/schema/*.ts` (kiểu TS + validate runtime từ một chỗ). `docs/schemas/*.schema.json` được **sinh** bằng `z.toJSONSchema()` qua `pnpm schemas`; CI chạy `pnpm schemas --check` rồi `git diff --exit-code docs/schemas` (giống kiểm tra OpenAPI drift của dc1). Bản v1 hiện có trong [schemas/](../schemas/) được viết tay ngày 2026-11-06 để duyệt; P0-03 biến chúng thành đầu ra sinh, mọi khác biệt phải có giải thích. (ADR 0003) Từ P0-03: danh sách hợp đồng là `CONTRACTS` (`domain/src/schema/contracts.ts`); mô tả, `$comment` và điều kiện if/then của hợp đồng nằm trong `.meta()` của zod; `examples` nằm ở `packages/domain/examples/<name>.json` (cũng là fixture hợp lệ của test); `contractOf` (`domain/src/schema/json-schema.ts`) chuẩn hóa đầu ra của zod cho dễ đọc (bỏ cận số nguyên an toàn, `type` cạnh `enum`/`const`, regex của `date-time`; `X | null` thành `type: [X, "null"]`); `scripts/gen-schemas.mjs` ghi file, `--check` chỉ so; ajv biên dịch từng file và kiểm `examples` (`scripts/gen-schemas.spec.ts`).
- JSON Schema 2020-12, `$id` = `https://elvaria.dev/schemas/<name>/v1`, `additionalProperties: false`, có `examples`.
- **ID**: `<prefix>_<yyyymmdd>_<6 ký tự base32 Crockford thường>` — đọc được trong event log và biên niên sử, sắp xếp theo ngày: `q_20261106_7k3m2a` (quest), `c_…` (campaign), `L_…` (bài học). Verdict id = `<quest>-<attempt>`. Nhân vật và lãnh thổ dùng slug do người dùng đặt (`thorn`, `dc1-se-team`). Event id và inbox command id là ULID (sắp theo thời gian, sinh trong `IdSource`).
- **Thời gian**: ISO 8601 có offset. Không có `Date.now()` trong domain. `kingdom.tz` (tên IANA) cố định múi giờ cho tên file event và replay. (P0-05) File ngày của một event là ngày viết trong chính `ts` của nó (`dayOfTs`): writer định dạng `ts` theo `kingdom.tz`, nên đó là ngày địa phương; append không cần dữ liệu múi giờ, và một dòng không bao giờ nằm lệch file của nó.
- **Đường dẫn trong file**: tương đối so với thư mục kingdom, phân cách `/`; chuyển sang `path.join` khi dùng. Ngoại lệ: `territory.path` và `kingdom.paths.treasury` là tuyệt đối (người dùng chỉ), vẫn viết bằng `/`.
- **Migrate**: `packages/store/src/migrations/<entity>/v<n>-to-v<n+1>.ts`, hàm thuần `(old: unknown) => unknown`, chuỗi hóa tự động theo `version`. Đọc file → migrate tới bản hiện tại → validate zod → dùng. Ghi lại file ở lần ghi kế tiếp; `elvaria migrate` ghi lại tất cả một lần và tạo backup `kingdom/.backup/<ts>/`. **Event log không bao giờ viết lại**: reader nâng cấp từng dòng theo `v` khi đọc; mỗi `v` cũ giữ một hàm migrate mãi mãi. Snapshot world state có `version` và bị bỏ (dựng lại từ log) nếu lệch. (P0-09) Snapshot là `{version: WORLD_STATE_VERSION, last_event: {id, ts} | null, state}` (`domain/src/world/snapshot.ts`); `readSnapshot` trả `stale_version` hoặc `invalid` thì bỏ, dựng lại bằng `worldStateOf` (file kingdom) rồi `reduce` phần log còn lại; `last_event` cho Sứ giả biết đọc tiếp từ dòng nào mà không phụ thuộc cách `eventlog` giữ cursor. Test: mỗi migration có fixture `v<n>.json` + kết quả mong đợi; test "mọi fixture cũ đọc được bằng store hiện tại". (P0-06) Fixture nằm cạnh migration: `packages/store/src/migrations/<contract>/v<n>.json`, kết quả mong đợi của bước `v<n>-to-v<n+1>` chính là `v<n+1>.json`; 12 contract được lưu (`kingdom, territory, quest, character, campaign, verdict, inbox-command, kind, class, ritual, script, tag`), chuỗi bước trong `src/migrations/index.ts`, phiên bản hiện tại = số bước + 1; `migrateKingdom(root, stamp)` của store là phần việc của `elvaria migrate`. (P0-05) Event log: chuỗi bước ở `packages/eventlog/src/migrations/` (`v<n>-to-v<n+1>.ts`, rỗng khi mọi dòng là v1), fixture `v<n>.jsonl` cạnh đó; reader đọc từng dòng: JSON → nâng theo `v` → `EventSchema`; spec kiểm mọi fixture đọc được, fixture v1 có mọi type có schema `data`, và chuỗi kết thúc đúng `v` mà `EventSchema` nhận (đổi schema mà quên bước thì đỏ). (P1-41, người dùng đã chốt, §11) Registry của chủ nhân không có migration theo nội dung: `elvaria migrate` chép file registry còn thiếu (P1-15) và thêm nguyên mục mặc định còn thiếu theo id, không sửa mục đã có (§3.14 "(P1-41)").

### 2.2 Bố cục thư mục kingdom

```
<kingdom>/
  kingdom.json
  decree.md                  # chiếu chỉ: luật chung của người dùng cho mọi nhân vật (tùy chọn, người dùng viết, Elvaria chỉ đọc; §3.7)
  registry/                  # kinds.json, classes.json, rituals.json, scripts.json, tags.json, scripts/*.mjs, prompts/<nghề>.md (P1-15) — chép từ registry-default khi init, người dùng sửa được
  territories/<id>/territory.json, gazetteer.md
  quests/<id>.json
  quests/<id>/handover.md    # thư bàn giao do nhân vật viết (§2.4)
  quests/<id>/journal.jsonl  # journal máy: event của quest, do hook ghi (không tin trí nhớ agent)
  quests/<id>/work/          # chỉ cho lãnh thổ không phải git
  characters/<id>/character.json, scripture.md
  campaigns/<id>.json
  verdicts/<quest>-<n>.json
  events/YYYY-MM-DD.jsonl
  events/sandbox/            # ngày giả của sa bàn
  chronicle/YYYY-MM-DD.md
  digest/YYYY-MM-DD.md       # bản tấu của Nhiếp chính, mỗi ngày một lần (PS-03, §3.16.3)
  temple/scripture.md
  temple/skills/<id>/SKILL.md # bí kíp (+ file kèm), nạp theo tag; giai đoạn 1 chưa có (§3.13)
  inbox/<ulid>.json          # lệnh của người dùng (CLI, Sứ giả, điện thoại) chờ Nhiếp chính xử lý; inbox/done/ sau khi áp dụng
  world/map.json             # giai đoạn 3
  .runs/<quest>-<n>/         # stdout/stderr thô của CLI (đã che secret), settings.json sinh ra, prompt đã dựng, checks/*.log
  adapters/<name>.mjs        # adapter tộc do người dùng viết (tùy chọn, §3.14)
  .state/                    # steward.lock, cursors, unclaimable.json, snapshot world state (pool mana ngủ: dựng lại từ event log, không có file riêng, chốt sau P1-05); build.json: bản ghim {current, previous} (PS-04b)
  .builds/<sha>/             # bản ghim và bản trước: worktree tách rời của repo Elvaria, đã cài; chỉ `elvaria upgrade` tạo và xóa (§3.16.4, PS-04b)
  .backup/
```

Worktree **không** nằm trong kingdom: ở `<repo>/.elvaria/worktrees/<quest-id>` của từng lãnh thổ (§3.3).

### 2.3 Schema từng loại

Hợp đồng chính xác (kiểu, mẫu id, mặc định, bất biến, ví dụ) nằm trong file schema; bảng dưới tóm tắt và ghi lý do.

| Schema | File dữ liệu |
|---|---|
| [kingdom](../schemas/kingdom.schema.json) | `kingdom.json` |
| [territory](../schemas/territory.schema.json) | `territories/<id>/territory.json` |
| [quest](../schemas/quest.schema.json) | `quests/<id>.json` |
| [character](../schemas/character.schema.json) | `characters/<id>/character.json` |
| [campaign](../schemas/campaign.schema.json) | `campaigns/<id>.json` |
| [verdict](../schemas/verdict.schema.json) | `verdicts/<quest>-<n>.json` |
| [lesson](../schemas/lesson.schema.json) | một dòng kinh đã parse |
| [event](../schemas/event.schema.json) | một dòng `events/*.jsonl`, `journal.jsonl` |
| [inbox-command](../schemas/inbox-command.schema.json) | `inbox/<ulid>.json` |
| [kind](../schemas/kind.schema.json), [class](../schemas/class.schema.json), [ritual](../schemas/ritual.schema.json), [script](../schemas/script.schema.json), [tag](../schemas/tag.schema.json) | `registry/{kinds,classes,rituals,scripts,tags}.json` |
| [skill](../schemas/skill.schema.json) | front matter của `temple/skills/<id>/SKILL.md` |
| [quest-draft](../schemas/quest-draft.schema.json) | structured output của Tể tướng (`--json-schema`) |
| [world-map](../schemas/world-map.schema.json) | `world/map.json` (giai đoạn 3) |

**kingdom** (v1)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| version | 1 | |
| name | string ≤ 24 | tên vương quốc (`.elv-name` 24ch) |
| created_at | datetime | |
| tz | tên múi giờ IANA | tên file event theo ngày địa phương, replay nhất quán (§6) |
| owner | {profession: developer\|ba\|marketing\|researcher\|other, locale: vi\|en} | `locale` quyết định ngôn ngữ của mọi thứ người dùng đọc |
| paths | {treasury: abs path} | kho bảo vật **ngoài** kingdom |
| tribes | [{id, adapter, enabled, max_concurrent, tool?: {path, version, default_model?, auth: login\|api_key, terms_acknowledged_at?, checked_version?}, pools?: {<pool>: {enabled}}, budget?: {tokens_5h?, tokens_7d?, usd_week?}}] | mỗi tộc một tài khoản (hợp đồng tộc, §3.14); `init` ghi `claude` (adapter `claude_code`, max 2) và `gemini` (adapter `antigravity`, max 1, pools `gemini_models` bật / `claude_gpt_models` tắt); `doctor` điền `tool` và từ chối `antigravity` khi thiếu `terms_acknowledged_at` (ADR 0018); `tribe check` với CLI thật qua thì ghim lại `path`, `version` của riêng tộc đó và ghi `checked_version` (tùy chọn, thêm sau v1, không migration; Nhiếp chính giữ tộc có CLI khác bản đó, thiếu thì `version` đứng thay, §3.14); `auth = api_key` ⇒ bắt buộc `budget.usd_week`; `auth` phải là một kiểu adapter khai trong `capabilities.auth` (Gemini CLI: chỉ `api_key`), `doctor` và `tribe check` kiểm bằng `checkTribeAuth`, schema không nêu tên adapter nào (P1-19); `elvaria tribe add\|check\|disable` ghi `tribes[]` (P1-19) |
| mana | {cap_pct=98, king_reserve_pct=2, warn_margin_pct=10, probe_interval_minutes=15, reassign_after_hours=null} | ngưỡng nhận việc = min(cap, 100 − reserve), tính **theo pool** của từng tộc; `tribes[].budget` là mẫu số cho nguồn `estimate` (§3.5); `claude_gpt_models` của Antigravity tắt mặc định để tộc Gemini thật sự là họ Gemini |
| breakers | {attempt_minutes: {low=45, high=120}, high_rank_from='B', max_attempts=3, mana_multiplier=2, same_fail_suspend=3, patrol_weekly_pct=10, max_turns=200, context_budget_tokens=120000, subagent_max_minutes=5, subagent_max_turns=30} | `context_budget_tokens`: trần một quest để Tể tướng chia việc (§3.11); `subagent_max_turns` là cách enforce được, `subagent_max_minutes` chỉ đo (§3.12) |
| schedule | {chronicle: {enabled, at}, temple: {enabled, every_quests=10, weekly}, patrol: {enabled, every}} | mỗi cái tắt được |
| dispatch | {tick_seconds=5, fairness='round_robin_territory', verifier_same_family='different_model'\|'machine_only', resume_after_mana=false, resume_after_answer_minutes=55, max_background=2} | `resume_after_mana`: hồi sinh bằng `--resume` thay vì phiên mới (tắt mặc định theo nguyên tắc 13). `resume_after_answer_minutes` (chốt 2026-11-07, thêm vào schema ở P1-05): người dùng trả lời câu hỏi của nhân vật trong N phút kể từ `blocked.asked_at` và adapter có năng lực `resume` thì nối đúng phiên cũ bằng `--resume`; quá hạn, hoặc `null`, thì phiên mới từ handover (§2.4). `max_background` (P1-47, số nguyên ≥ 1, tùy chọn, `version` giữ 1): số việc nền (check, trial, script) Nhiếp chính chạy cùng lúc trong cả vương quốc; 2 là mặc định thận trọng khi chưa có số đo (§3.1 "(P1-47)") |
| bell | {desktop=true, web_push=false, messaging=null} | ba kênh như màn Cài đặt; `messaging` chọn ở giai đoạn 2 |
| tunnel | {enabled=false, kind?: tailscale\|cloudflare} | |
| theme | string = 'fantasy' | |
| ui | {mode: night\|day, eco: bool} | |

**territory** (v1)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| version, id (slug), name ≤ 24, path (abs), kind: code\|docs\|content\|data\|mixed | | |
| vcs | {type: git\|none, default_branch, remote?} | |
| worktree_dir | string, mặc định `.elvaria/worktrees` | tương đối so với `path`; mỗi quest một thư mục con `<quest-id>`; thêm vào `.git/info/exclude` khi attach; đổi sang `../<repo>.elvaria/worktrees` nếu spike P1-02 thấy CLAUDE.md của checkout chính bị nạp đôi. (P1-02) Không nạp đôi: worktree trong repo chỉ nạp CLAUDE.md, `.claude/rules/`, `.claude/settings.json` của chính nó; giữ mặc định. Riêng `CLAUDE.local.md` (không track) của checkout chính có lọt vào ([spike](../spikes/claude-2026-11.md)) |
| max_concurrent | int ≥ 1, mặc định 1 | số quest chạy song song trong lãnh thổ (§3.3, §9.1 mục 10) |
| context_files | string[] globs, mặc định `["CLAUDE.md","README.md",".claude/rules/*.md"]` | nạp cho tộc Gemini (§3.8) |
| commands | {setup?, test?, lint?, typecheck?, build?, reset?, coverage?, generate?: string[]} | `setup` chạy một lần khi dựng lều; (P1-20) `reset` (đưa DB/container về sạch trong đất nháp của người chấm) và `coverage` (để lại `coverage/coverage-summary.json`) là một lệnh hoặc danh sách lệnh, §3.15; (P1-24) `generate` là các lệnh sinh (`pnpm docs:gen`, `pnpm schemas`): phiên có Edit và shell được chạy chúng, người chấm thì không |
| checks | [{id, run, when: glob[], exclusive: bool, timeout_minutes, cleanup?}] | bảng "đụng vào gì thì chạy gì" dạng dữ liệu; (P1-20) `run` là một lệnh hoặc danh sách lệnh chạy lần lượt tới lệnh lỗi đầu tiên; `exclusive` = không chạy song song (Docker/e2e); `cleanup` dọn sau khi bị kill (§9.2) |
| laws | {forbidden_paths: glob[], read_only_paths: glob[], patch_paths: glob[], forbidden_commands: regex[], read_before_write: glob[], rank_floor: [{glob, min_rank}]} | chặn ở runner (deny list + hook), không chỉ prompt; (P1-24) `forbidden_paths` cấm cả đọc lẫn ghi (secret), `read_only_paths` chỉ cấm ghi (file sinh: đọc được, chỉ `commands.generate` ghi); thêm trường có mặc định `[]` nên vẫn `version: 1`; (P1-28) `patch_paths`: đường dẫn CLI của nhân vật tự khóa mà Nhiếp chính được áp bản vá của người làm vào (§3.3 "(P1-28)"), chỉ có tác dụng ở lãnh thổ git, zod từ chối glob có đoạn `.git` |
| blind_trial | {enabled: bool, mặc định false; min_rank: Rank, mặc định B} | (P1-21) Khảo hạch mù (§3.15): khi quest hợp đồng hay một phần của đội có hạng ≥ `min_rank`, Nhiếp chính thêm phần `acceptance` vào đội; trường mới, tương thích nên `version` giữ 1 |
| secrets_allowed | string[] tên trong kho bảo vật | |
| buildings | [{id, kind, source, label}] | giai đoạn 4 (khảo sát điền địa) |
| health | {ci: green\|red\|unknown, open_bugs, last_patrol_at?} | |
| surveyed_at | datetime? | |

Không có trường `map`: hình học vùng (anchor, bounds) chỉ nằm trong `world/map.json`, LOD do Sứ giả tính lúc chạy. Một nguồn, không lệch.

**quest** (v1)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| version, id, title, description | | |
| kind | KindId (validate theo registry) | 11 dạng mặc định |
| rank | F\|E\|D\|C\|B\|A\|S | |
| class_required | ClassId (registry) | nghề được nhận; phải thuộc `kinds[kind].classes_allowed`; bắt buộc khi `tier = session` (thay trường `skills_required` cũ) |
| tags | TagId[] (registry/tags.json), ≤ 6 | chuyên môn do Tể tướng gán; xếp hạng ứng viên theo `skill_affinity` và chọn bí kíp nạp vào prompt (§3.13) |
| party_id?, party_role?: contract\|part\|acceptance\|merge, contract? | | thuộc đội nào (`party_id` = id quest hợp đồng), vai trong đội, đường dẫn hợp đồng trong lãnh thổ (§3.13); (P1-21) `acceptance` là phần test chấp nhận của Khảo hạch mù (§3.15), chỉ Nhiếp chính tạo (quest-draft không có), giá trị mới tương thích nên `version` giữ 1 |
| territory | slug | |
| status | xem §2.5 | 12 trạng thái (có `draft`) |
| tier | script \| session | bậc chạy (nguyên tắc 13); mặc định `session`. Học đồ **không** là bậc của quest — nó xảy ra bên trong một phiên |
| script? | {id, params} | bắt buộc khi `tier = script`; `id` từ `registry/scripts.json`; không gọi model, mana 0 |
| assignee, verifier | character id \| null | `verifier ≠ assignee` (zod refine); `tier = session` ⇒ có `assignee` khi đang chạy; `tier = script` ⇒ `assignee = null`, actor là steward |
| campaign_id?, parent_id?, depends_on[] | | `depends_on` chưa xong → `blocked` |
| budget | {max_minutes, max_tokens, max_attempts} | suy từ `kingdom.breakers` + hạng, người dùng sửa được |
| estimate | {tokens, minutes} | Tể tướng ước lượng |
| attempts | int ≥ 0 | |
| attempt_log | [{n, character, role: assignee\|verifier, started_at, ended_at?, outcome?: submitted\|partial\|returned\|timeout\|breaker\|crash\|paused\|blocked\|cancelled, session_id?, tokens?, run_dir}] | `timeout` = cầu dao thời gian; `breaker` = cầu dao token/lượt; `partial` = người chấm nộp verdict `partial` (P1-42; trước đó `submitted`) |
| plot | {type: worktree\|folder\|none, path?, branch?} | đất riêng |
| deliverable | {type: branch\|file\|report\|draft\|subquests\|none, path?, branch?, delivered_at?} | theo quy ước của kind |
| seal_required | bool | |
| seal? | {at, note?} | |
| blocked? | {question, asked_at, answer?, answered_at?} | |
| secrets_required | string[] | phải ⊆ `territory.secrets_allowed` |
| checks_run | string[] (id) | tính sau khi làm, từ đường dẫn đã chạm |
| units? | [{id, label, outcome: pending\|done\|not_done\|needs_user\|debt, child_quest?}] | chỉ cho kind `batch` (Trận đánh); sinh bởi script `produces: units` |
| created_by | chancellor\|user\|council\|patrol\|battle\|campaign | |
| created_at, updated_at | | |

Không có trường `journal`: đường dẫn là quy ước `quests/<id>/`, trường thừa sẽ lệch.

**character** (v1)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| version, id (slug), name ≤ 24 | | |
| class | ClassId (registry) | |
| tribe | TribeId (`kingdom.tribes[].id`) | tộc, **cố định suốt đời** như nghề (danh tiếng và kinh gắn với model của tộc đó); tên tộc hiển thị là theme |
| model | slug đầy đủ của CLI (`claude-sonnet-5-5`, `gemini-4-argon-medium`, `claude-opus-5-5-low`…) | `familyOf(model)` và `poolOf(tribe, model)` là hàm suy ra trong domain, **không lưu** |
| level | 1–10 | `gear_tier` **không lưu**: `gearTierOf(level)`; cấp ban đầu do người dùng đặt khi triệu hồi (`--level`; không có thì theo model, model lạ thì 1; P1-26, §2.6) |
| level_since? | datetime | lần đổi cấp gần nhất; `levelChange` chỉ đếm phán quyết sau mốc này (§2.6); không có = đếm cả cửa sổ (cấp đặt lúc triệu hồi). Thêm sau P0-04, tương thích với file v1 cũ |
| reputation | {window: [{verdict_id, result, by_human, at}] ≤ 20} | pass/fail/human_* là hàm suy ra |
| skill_affinity | {<tag>: {window: [...] ≤ 20}} | danh tiếng theo từng tag, mỗi phán quyết cộng vào cửa sổ của mọi tag của quest; pass/fail là hàm suy ra `affinityOf` |
| pinned_tag? | TagId \| null | người dùng ghim nhân vật vào một chuyên môn (lệnh `pin_tag`). Danh hiệu **không lưu**: `titleOf(character)` = tag ghim, nếu không thì tag có danh tiếng cao nhất; chuỗi hiển thị lấy từ theme |
| status | idle\|working\|reviewing\|sleeping_mana\|meditating\|suspended\|swamp | |
| status_since | datetime | |
| status_before_sleep? | idle\|working\|reviewing | trạng thái để trở về khi tộc tỉnh (§2.6) |
| current? | {quest, role: assignee\|verifier} | |
| vow_no_production | bool | true cho class judge và monk |
| tools | {allow?: string[], deny?: string[]} | ghi đè mặc định của class |
| consecutive_fail | {fail_kind?, count} | 3 lần cùng loại → suspended |
| stats | {quests_done, tokens_today, tokens_day, last_active_at?} | |
| created_at | | |

**campaign** (v1): version, id, name, mode: offense\|defense, fronts: [{id, name, goal, quest_ids[]}], victory_conditions: [{id, text, check: {type: all_quests_done\|command, run?}, met, checked_at?}], status: declared\|active\|won\|lost\|retro_pending\|closed, declared_at, deadline?, retro_path?, closed_at?. `morale` là hàm suy ra, không lưu.

**verdict** (v1): version, id = `<quest>-<n>`, quest_id, attempt, verifier_id (character id; `user` khi là dấu vua; `machine` khi verdict do Nhiếp chính lập từ kiểm tra máy), ritual (RitualId), checks: [{id, pass, duration_ms, log_path}], result: pass\|fail\|partial, fail_kind?: tests_fail\|scope_creep\|missing_i18n\|wrong_facts\|incomplete\|style\|unsafe\|other\|flaky (`flaky` từ P1-20; để đếm "cùng loại lỗi"; bắt buộc khi fail), notes (bắt buộc khi fail, cụ thể), progress?: {checked_until} (bắt buộc khi partial, để người nghiệm thu kế đọc tiếp), by_human, session_id?, created_at.

**lesson** (v1) — đối tượng sau khi parse một dòng kinh. Kinh là Markdown người dùng sửa trực tiếp, mỗi bài học một dòng theo văn phạm cố định:

```
- [L_20261106_a1b2c3] Run `pnpm i18n:check` before submitting any locale change. <!-- verdict=q_20261106_7k3m2a-2 hit=2026-11-06 -->
```

Trường: version, id, owner (character id \| `temple`), text, source: monk\|user, source_verdict (bắt buộc với bài học do Thầy tu viết; dòng người dùng tự thêm không có id/comment → parser gán id, `source: user`), created_at (ngày, lấy từ id), last_hit_at? (khóa `hit=` trong comment), retired_at? (khóa `retired=`). `elvaria scripture lint` báo dòng sai văn phạm. Lý do: giữ đúng "người dùng sửa Markdown trực tiếp" mà vẫn có trường máy đọc; parser chịu lỗi.

**event** (v1), một dòng JSONL:

```json
{"v":1,"id":"01JCF8X4Z6Q3W9N2M5R7T8V0YB","ts":"2026-11-06T09:12:03+07:00","type":"agent.tool","actor":{"kind":"character","id":"thorn"},"quest":"q_20261106_7k3m2a","attempt":1,"territory":"dc1-se-team","session":"…","data":{"tool":"write","path":"src/auth/login.ts"}}
```

`actor.kind`: character\|user\|steward\|chancellor\|herald\|system. `type` là chuỗi `nhóm.hành_động`; `data` có schema riêng theo type (discriminated union trong domain). Danh mục type v1:

- `quest.{drafted, created, claimed, released, started, submitted, returned, verdict, done, sealed, archived, blocked, unblocked, paused, resumed, infirmary, delivered, edited, unclaimable}` (P1-03 thêm `edited`: người dùng sửa trường của quest bằng `edit_quest`/`set_rank`, `data` mang view; `unclaimable`: Nhiếp chính báo quest không ai nhận được, §3.1)
- `agent.{session.start, session.end, tool, tool.blocked, subagent.start, subagent.end, subagent.overrun, compact, notification}`
- `verdict.{pass, fail, partial}`
- `mana.{level, warning, exhausted, restored, probe, signal}`
- `character.{created, sleep, wake, meditate, suspend, release, swamp, level_up, level_down}`
- `command.{received, applied, rejected}`
- `delivery.sent`, `chronicle.written`, `territory.{attached, surveyed, health}`, `sandbox.{replay.start, replay.end}`
- tiền tố dành sẵn: `campaign.*`, `battle.*`, `incident.*`, `patrol.*`

Type chưa biết → reader giữ nguyên, renderer bỏ qua (forward compatible).

(P0-09) Mọi type làm đổi thứ thế giới vẽ có schema `data` mang **view sau thay đổi** (`domain/src/schema/event/state-data.ts`), để world state dựng lại được từ log mà reducer không chép lại máy trạng thái, và lỡ một dòng chỉ lệch tới dòng kế của cùng thực thể: `quest.*` → `{quest, characters?}` (`quest.infirmary` thêm `reason`; `characters` là các nhân vật cùng bước bị đổi, vì claim, submit, verdict… của §2.6 không có type `character.*` riêng); `character.*` → `{character}`; `territory.*` → `{territory}`; `mana.exhausted`, `mana.restored` → `{tribe, pool}`. View là phép chiếu thuần trong `domain/src/world/` (`questViewOf`, `characterViewOf`, `territoryViewOf`): đủ mọi trường (`null` khi không có), không `default`, vì `EventSchema` kiểm `data` chứ không viết lại nó. Tên dòng của mỗi bước §2.5 lấy từ `questLogTypeOf(event, from, to)`: tên chỗ quest đến khi nó nói rõ nhất (`quest.infirmary`; `quest.verdict` khi chờ dấu vua), không thì tên bước; `assign_verifier` → `quest.started` (phiên người chấm mở), người chấm rời review sớm (`mana_out`, `breaker`, `suspend`) → `quest.verdict` (phán quyết `partial`), `retry` → `quest.released`, `confirm` → `quest.created`.

**inbox-command** (v1): version, id (ULID), ts, kind, source: cli\|herald\|lite, payload (theo kind). Kind: `confirm, seal, return, retry, cancel, archive, summon, wake, suspend, release, reassign, send_to_temple, declare_campaign, close_campaign, create_quest, answer, set_rank, attach_territory, edit_quest, pin_tag, set_level, set_model` (P1-29 thêm `set_level {character, level}` và trường tùy chọn `assignee` của `create_quest`, hai thay đổi tương thích, ADR 0003; P1-22 thêm `set_model {character, model}`, tương thích) — khớp bộ icon hành động `act-*` của thiết kế (seal, return, summon, suspend, reassign, archive, temple, declare). `confirm` (draft → open), `edit_quest` (`elvaria quest edit`, §9.2) và `pin_tag` (ghim chuyên môn, §3.13) cần có vì người dùng chỉ ghi được lệnh, không ghi được quest hay nhân vật (ADR 0005). Draft của Tể tướng cũng đi qua inbox dưới dạng `create_quest` với `draft: true`. Nhiếp chính xử lý theo thứ tự id, idempotent (đã có `command.applied` với id này → bỏ qua). (P0-08, người dùng chốt) `elvaria quest add/confirm/cancel/edit` ghi `create_quest` (`draft: false`; id quest do Nhiếp chính đặt), `confirm`, `cancel` (quest nháp thì `archive`, vì từ `draft` chỉ có hàng `discard`, §2.5), `edit_quest` (kèm `updated_at` vừa đọc); CLI kiểm trước bằng `findTransition` (hàng có U trong actor) và id trong registry, Nhiếp chính vẫn là người quyết. Không có kind nào tạo nhân vật (`summon` là mở terminal của phiên, glossary), nên `elvaria character add` **tạo** file `characters/<id>/character.json` mới (chỉ tạo, không bao giờ ghi đè; mọi thay đổi sau đó là của Nhiếp chính; ADR 0005 sửa cùng commit). `elvaria territory add` ghi `territories/<id>/territory.json` trực tiếp (lãnh thổ là cấu hình, không nằm trong ADR 0005); `attach_territory` dành cho Sứ giả và điện thoại, vốn không nhìn được đĩa.

**registry**: kind ({id, name_vi, name_en, deliverable_type, ritual, checks_default, seal_default, classes_allowed[]}), class ({id, name_vi, name_en, kinds[], is_verifier, is_monk, default_tribe (gợi ý khi triệu hồi), default_model, tools: {allow[], deny[]}, prompt_file}), ritual ({id, name_vi, name_en, steps[], pass_rule: all_checks_and_agent\|checks_only\|agent_only, max_seconds}), script ({id, name_vi, name_en, description, entry (`scripts/<id>.mjs` trong registry/), params_schema (JSON Schema con), kinds[], produces: report\|units\|check, timeout_minutes}), tag ({id, name_vi, name_en, description?}). Mỗi file registry là `{version, <kinds|classes|rituals|scripts|tags>: [...]}`. Tag là từ vựng đóng: Tể tướng chỉ gán tag có trong `tags.json`, để danh tiếng theo tag không vỡ vụn thành `front-end` / `frontend`.

Luật chéo giữa các file registry (P0-02, `parseRegistry` trong `domain/src/schema/registry.ts`, mỗi lỗi có `code` để CLI dịch qua i18n): id trùng; `kind.ritual` không có; `classes_allowed`/`class.kinds`/`script.kinds` trỏ id không có; class vừa `is_verifier` vừa `is_monk`; bước nghi thức ngoài `RITUAL_STEPS` (`domain/src/constants.ts` — bước là code trong prompt builder, nên danh sách sống trong domain, không trong dữ liệu). **Thêm so với v1** (P0-03 ghi vào giải thích khác biệt): class nghiệm thu không được nằm trong `classes_allowed` (người làm không phán); class không nghiệm thu và kind phải khớp hai chiều (`c ∈ k.classes_allowed ⇔ k ∈ c.kinds`); `script.entry = scripts/<id>.mjs`; `territory.checks[].id` không trùng (`run-check` tìm theo id); `laws.forbidden_commands` phải là regex hợp lệ; `kingdom.tz` phải là múi giờ IANA thật. Chưa kiểm `class.prompt_file` tồn tại (cần IO; prompt có từ P1-15, loader ở P0-06). (P0-06) `missingRegistryFiles` của store báo `class.prompt_file` và `script.entry` không có file, để `elvaria doctor` hiện; `loadRegistry` chưa coi đó là lỗi vì `registry-default` chưa có `prompts/`; P1-15 nâng thành lỗi khi prompt đã có (người dùng chốt sau P0-06). (P1-15) Đã làm: `registry-default` có 11 `prompts/<nghề>.md`; `loadRegistry` trả `not_found` cho mỗi `class.prompt_file` thiếu; `missingRegistryFiles` chỉ còn báo `script.entry` (cảnh báo của `doctor`, chỉ quest bậc script cần); vương quốc tạo trước P1-15 được `doctor` chỉ chỗ chép prompt mặc định; (chốt sau P1-15) `elvaria migrate` chép các file registry mà bản Elvaria đang chạy có và vương quốc còn thiếu (`addMissingRegistryFiles` của store, không bao giờ ghi đè), `doctor` gợi ý lệnh đó.

Registry mặc định (P0-02; id xem [glossary](../glossary.md)):

- 11 kind: `build, research, fix, refactor, document, publish, analyze, plan, integrate, negotiate, batch`. `campaign` là vật chứa (entity riêng), không phải kind; nó chỉ có icon `kind-campaign`.
- 11 class: `chancellor, mage, knight, dwarf, scout, scribe, bard, astrologer, envoy, judge, monk` (thiết kế có 12 icon nghề vì `judge` có hai icon theo kind, ADR 0011).
- 11 ritual, mỗi kind một: build → `build_review`, research → `source_check`, fix → `regression_check`, refactor → `stress_test`, document → `editorial_review`, publish → `audience_review`, analyze → `recompute`, plan → `council_review`, integrate → `stability_check`, negotiate → `sign_off`, batch → `unit_tally`.
- 6 script: `link-check`, `run-check` (chạy một `checks[].id` của lãnh thổ), `count-files`, `diff-stat`, `compare-numbers`, `todo-scan` (đếm dấu TODO/FIXME/HACK/XXX theo file).
- 7 tag: `frontend, backend, db, infra, i18n, e2e, docs` (danh sách của kế hoạch sản phẩm; người dùng thêm bằng cách sửa `tags.json`).

**skill** (v1) — front matter của `temple/skills/<id>/SKILL.md`: version, id (kebab-case, tên thư mục), title, description (một dòng, thành mô tả của skill theo định dạng CLI), tags[] (≥ 1), scope (`global` \| id lãnh thổ), source: monk\|user, derived_from? (id bài học; bắt buộc khi `source = monk`), max_tokens (mặc định 2000, giá trị khởi điểm), created_at, updated_at?. Đường dẫn là quy ước nên không có trường `path` (như `journal`). Nội dung viết bằng tiếng Anh như prompt nhân vật.

**quest-draft** (v1): {version, drafts: [{ref, title, description, kind, rank, territory, tier, script?, class_required (khi session), tags, party_role?: contract\|part, contract?, depends_on_refs[], parent_ref?, estimate, seal_required, secrets_required, question?}]}; tối đa một draft có `question` (Tể tướng hỏi lại tối đa một câu). Cùng schema này dùng cho output của trưởng đội khi chia phần (`party_role = part`).

**world-map** (v1, giai đoạn 3): {version, generated_at, regions: [{id, territory, anchor, bounds, roads_to[]}]}.

### 2.4 Journal: hai nửa, không tin trí nhớ

Agent tự ghi `journal.md` theo mốc (như kế hoạch sản phẩm mô tả) không tin được: quên ghi hoặc ghi sai là chuyện thường. Vì vậy (ADR 0010):

- `journal.jsonl` do **hook** ghi (event của quest, agent không phải làm gì) — nguồn sự thật của "đã làm gì".
- `handover.md` do **agent** viết theo mẫu bắt buộc (Đang ở đâu / Đã xong / Chưa xong / Đã thử mà không được / Quyết định đã chọn / Bước kế, và mục Câu hỏi khi cần hỏi người dùng) — nguồn sự thật của "ý định". (Chốt 2026-11-07, §10) Nhân vật hỏi người dùng bằng cách ghi vào mục Câu hỏi rồi kết thúc phiên; `runner-core` đọc mục đó thành `RunResult.question`, Nhiếp chính chuyển `ask` → `blocked`. Trả lời trong `dispatch.resume_after_answer_minutes` (mặc định 55) thì nối phiên cũ bằng `--resume`; quá hạn thì phiên mới từ handover có câu trả lời, mục "Đã thử mà không được" giữ cho phiên đó khỏi đi lại ngõ cụt. Prompt yêu cầu cập nhật trước khi nộp và mỗi khi sắp thiền; hook Stop chặn nộp nếu file chưa đổi kể từ lúc bắt đầu (mẫu `stop-checks.mjs` của dc1).
- Người nghiệm thu đọc diff + `handover.md`, **không** đọc transcript (luật tách vai).
- Hồi sinh đọc cả hai.

### 2.5 Máy trạng thái quest

Trạng thái: `draft, open, claimed, working, review, returned, awaiting_seal, done, blocked, paused_mana, infirmary, archived`. `draft` là bước xem trước và xác nhận mà brief yêu cầu.

Tác nhân: **U** người dùng (qua inbox), **S** Nhiếp chính, **R** runner/hook (thay mặt nhân vật), **V** người nghiệm thu (qua runner), **M** mana monitor (trong Nhiếp chính).

<!-- docs:gen quest-transitions -->
| Từ | Sự kiện | Điều kiện | Ai | Đến | Ghi chú |
|---|---|---|---|---|---|
| draft | `confirm` |  | U | open | Tể tướng tạo draft; `elvaria quest add` tạo thẳng open |
| draft | `discard` |  | U | archived | lệnh `archive` |
| open | `claim` |  | S | claimed | có người rảnh đúng nghề, đủ cấp (`canTake`), tộc còn mana, `depends_on` xong; nhận vượt hạng trần của cấp ⇒ `seal_required`; bậc script: `assignee = null`, actor là Nhiếp chính |
| open | `block` |  | S | blocked | `depends_on` chưa xong hoặc câu hỏi của Tể tướng chưa trả lời; ghi `blocked.question` |
| open | `reassign` | `tier = session` | U | claimed | lệnh `reassign` có `character`: người dùng giao thẳng, không xét `canTake`; vượt hạng trần ⇒ `seal_required`; `depends_on` vẫn phải xong trước `start` |
| open | `cancel` |  | U | archived | lệnh `cancel`; mọi trạng thái chưa xong đều hủy được |
| claimed | `start` |  | S | working | đất riêng xong, phiên mở; `attempts` +1, mở lượt mới `n` trong `attempt_log`; lượt máy của quest ghép (không có `assignee`) mở lượt `n` mà `attempts` không tăng (P1-55) |
| claimed | `release` |  | S | open | spawn lỗi; `attempts` không tăng, bỏ `assignee` |
| claimed | `cancel` |  | U | archived |  |
| claimed | `breaker` |  | S | infirmary | trip `secrets`: kho bảo vật thiếu secret quest xin, hoặc lãnh thổ đã bỏ nó khỏi `secrets_allowed`; không mở phiên, `attempts` không đổi, chuông |
| working | `submit` | `tier = session`, có `assignee` | R | review | có handover.md; mọi thay đổi đã commit vào nhánh; lượt kết thúc `submitted` |
| working | `submit` | bậc script, hoặc lượt máy của quest ghép (không có `assignee`) | S | review | script chạy xong trong plot, output vào `.runs/` + journal.jsonl; hoặc Nhiếp chính đã gộp sạch mọi phần vào plot của quest ghép (P1-18) |
| working | `release` | bậc script, hoặc lượt máy của quest ghép (không có `assignee`) | S | open | Nhiếp chính dừng giữa lúc script chạy (lần chạy không để lại gì): lượt kết thúc `cancelled`, quest mở lại, tick sau chạy lại (P1-17); hoặc gộp các phần của quest ghép dừng ở xung đột: quest mở lại cho hiệp sĩ, merge dở để nguyên trong plot (P1-18) |
| working | `release` | `tier = session`, có `assignee` | S | returned | phiên của nhân vật kết thúc trong lúc không có Nhiếp chính nào chạy (Nhiếp chính dừng hay bị giết): lượt kết thúc `cancelled`, `attempts` trả lại một (lần `redispatch` ngay sau lấy lại nó), cùng nhân vật làm tiếp ở phiên mới từ handover (P1-44) |
| working | `ask` |  | R | blocked | ghi `blocked.question`; lượt kết thúc `blocked` |
| working | `mana_out` | `tier = session`, có `assignee` | M | paused_mana | giữ `assignee`; lượt kết thúc `paused` |
| working | `breaker` |  | S | infirmary | kill tree, event `quest.infirmary` kèm lý do; lượt `timeout` (thời gian) hoặc `breaker` (token, lượt, hook từ chối commit lúc nộp); nhân vật → swamp rồi idle |
| working | `crash` | `tier = session`, có `assignee`, `attempts < max_attempts` | S | returned | outcome `crash`, cùng nhân vật thử lại |
| working | `crash` | `tier = script` hoặc `attempts ≥ max_attempts` | S | infirmary | bậc script: lỗi script vào thẳng trạm quân y (lỗi của Elvaria hoặc dữ liệu) |
| working | `suspend` | `tier = session`, có `assignee` | U | returned | người dùng đình chỉ nhân vật (§2.6); lượt kết thúc `returned`; người dùng giao lại |
| working | `cancel` |  | U | archived | kill, giữ worktree; lượt kết thúc `cancelled` |
| paused_mana | `mana_restored` |  | M | working | cùng nhân vật, phiên mới từ handover, cùng lượt `n` (§3.5) |
| paused_mana | `reassign` |  | U/S | claimed | người dùng đổi người; hoặc Nhiếp chính, khi quest ngủ quá `mana.reassign_after_hours` và có người cùng nghề còn mana (`selectAssignee`, P1-22); mọi `reassign` vượt hạng trần của cấp người mới ⇒ `seal_required`; người cũ bỏ `current` |
| paused_mana | `suspend` |  | U | open | người dùng đình chỉ nhân vật đang ngủ trên quest (§2.6): quest thả người đó, bỏ `assignee`, mở lại cho Nhiếp chính giao như mọi quest open; `attempts` giữ, lượt đã kết thúc `paused` từ trước (P1-22) |
| paused_mana | `cancel` |  | U | archived |  |
| paused_mana | `breaker` |  | S | infirmary | trip `secrets`, như `claimed`; người làm đang ngủ bỏ `current` |
| blocked | `answer` | có `assignee` | U | working | câu trả lời ghi vào `blocked.answer` và handover.md; phiên mới, cùng lượt `n` |
| blocked | `answer` | không có `assignee` | U | open |  |
| blocked | `unblock` | không có `assignee` | S | open | `depends_on` xong |
| blocked | `cancel` |  | U | archived |  |
| review | `assign_verifier` | `tier = session`, chưa có `verifier` | S | review | `selectVerifier` (§3.2), mở lượt vai verifier; quest bậc script không bao giờ có verifier là nhân vật |
| review | `verdict_pass` | `!seal_required` | V/S | done | verdict của verifier, hoặc của máy (`machine`) khi không có verifier (ADR 0008) |
| review | `verdict_pass` | `seal_required` | V/S | awaiting_seal | chuông |
| review | `verdict_fail` | `tier = session`, có `assignee`, `attempts < max_attempts` | V/S | returned | notes bắt buộc, `fail_kind`; bỏ `verifier`, lần nộp sau chọn người chấm mới |
| review | `verdict_fail` | `tier = session`, không có `assignee` (lượt máy của quest ghép), `attempts < max_attempts` | V/S | open | lượt máy của quest ghép bị đánh trượt: không có người để trả về, quest mở lại cho hiệp sĩ, phiên của nó đọc verdict (P1-18) |
| review | `verdict_fail` | `tier = script` hoặc `attempts ≥ max_attempts` | V/S | infirmary | chuông; bậc script không có `returned` |
| review | `verdict_partial` | có `verifier` | V | review | người chấm nộp verdict `partial` (lưu `progress`) rồi rời đi; `verifier = null`, lượt kết thúc `partial` (P1-42; trước đó `submitted`), không đếm vào `reviewBreaksOf` mà vào `reviewPartialsOf`; người kế đọc tiếp (P1-33) |
| review | `verdict_partial` | `tier = session`, chưa có `verifier` | S | infirmary | ngay sau hàng trên, khi `REVIEW_PARTIALS_MAX` (3) người chấm của lượt đã nộp verdict `partial` (`partialsStalled`, P1-42): trip `partial_verdicts`, chuông; `retry` của người dùng đưa về review như với cầu dao; hoặc lúc Nhiếp chính khởi động, khi Nhiếp chính trước dừng giữa hàng trên và hàng này (P1-44) |
| review | `mana_out` | có `verifier` | M | review | `verifier = null`, verdict `partial` lưu `progress`; người kế đọc tiếp |
| review | `breaker` | có `verifier` | S | review | như trên; cả khi CLI của người chấm tự dừng ở trần lượt hay ngân sách (P1-23) |
| review | `breaker` | `tier = session`, chưa có `verifier` | S | infirmary | trip `secrets`, như `claimed`: người chấm cần cùng secret với người làm; hoặc ngay sau hàng trên, khi `REVIEW_BREAKS_MAX` (2) người chấm của lượt đã rời đi không ra verdict (`reviewStalled`, P1-23) và người cuối bị cầu dao cắt, chuông; hoặc lúc Nhiếp chính khởi động, khi Nhiếp chính trước dừng giữa hàng trên và hàng này (P1-44) |
| review | `crash` | có `verifier` | S | review | phiên người chấm kết thúc mà không có phán quyết (CLI lỗi, output không thành verdict): như trên, lượt kết thúc `crash`, đếm vào `reviewBreaksOf` (P1-33) |
| review | `crash` | `tier = session`, chưa có `verifier` | S | infirmary | ngay sau hàng trên, khi `REVIEW_BREAKS_MAX` (2) người chấm của lượt đã rời đi không ra verdict (`reviewStalled`, P1-33): trip `no_verdict`, chuông; `retry` của người dùng đưa về review như với cầu dao; hoặc lúc Nhiếp chính khởi động, khi Nhiếp chính trước dừng giữa hàng trên và hàng này (P1-44) |
| review | `release` | có `verifier` | S | review | phiên người chấm kết thúc trong lúc không có Nhiếp chính nào chạy: người chấm rời đi, lượt kết thúc `cancelled`, không đếm vào `reviewBreaksOf` (P1-44) |
| review | `suspend` | có `verifier` | U | review | như trên, khi người dùng đình chỉ người chấm |
| review | `cancel` |  | U | archived |  |
| returned | `redispatch` |  | S | working | `attempts` +1, lượt mới, cùng `assignee`, prompt kèm notes |
| returned | `reassign` |  | U | claimed |  |
| returned | `cancel` |  | U | archived |  |
| returned | `breaker` |  | S | infirmary | trip `secrets`, như `claimed` |
| awaiting_seal | `seal` |  | U | done | `seal`, verdict `by_human = true` (nặng ×3) |
| awaiting_seal | `return` | `tier = session`, có `assignee` | U | returned | lệnh `return` kèm ghi chú; bỏ `verifier` |
| awaiting_seal | `return` | `tier = session`, không có `assignee` (lượt máy của quest ghép) | U | open | lệnh `return` với lượt máy của quest ghép: không có người để trả về, quest mở lại cho hiệp sĩ, phiên của nó đọc verdict của vua (P1-18) |
| awaiting_seal | `reject` |  | U | archived | lệnh `archive` |
| done | `deliver` | chưa có `deliverable.delivered_at` | S | done | giao hàng theo kind, ghi `deliverable.delivered_at`; không là trạng thái riêng để không nhân đôi |
| done | `archive` |  | U/S | archived | Nhiếp chính sau N ngày; xóa worktree khi archive, không sớm hơn |
| infirmary | `retry` | không phải `reviewStalled` | U | open | `attempts = 0`, bỏ `assignee`, giữ `attempt_log`; quest ghép đã có lượt máy thì hiệp sĩ làm tiếp, máy không chạy lại (P1-55) |
| infirmary | `retry` | `REVIEW_BREAKS_MAX` người chấm của lượt đã rời đi không ra verdict (cầu dao cắt hoặc `crash`), hoặc `REVIEW_PARTIALS_MAX` người nộp verdict `partial` (`reviewStalled`) | U | review | việc đã xong, chỉ phần chấm bị cắt mãi: giữ `assignee`, `attempts`, lượt `n`; người chấm mới; `reviewBreaksOf` và `reviewPartialsOf` đếm lại từ lần `retry` này (P1-26, P1-42) |
| infirmary | `reassign` | `tier = session` | U | claimed | người mới có đủ `max_attempts` (`attempts = 0`) |
| infirmary | `archive` |  | U | archived | lệnh `archive` |
| archived | — |  |  |  | trạng thái cuối |
<!-- /docs:gen quest-transitions -->

Đường đi của quest **bậc script**: `open → claimed (S, assignee null) → working (S chạy registry/scripts/<id>.mjs trong plot, output vào .runs/ + journal.jsonl) → review → done | awaiting_seal`, verdict `verifier_id: "machine"` lập từ exit code + `produces`. Không có `returned`/`paused_mana` (không có model để hết mana); lỗi script → `infirmary` ngay (lỗi của Elvaria hoặc dữ liệu, không phải của nhân vật). Script `produces: units` sinh `units[]` cho quest Trận đánh; mỗi unit cần phán đoán → Nhiếp chính mở quest con bậc session (model rẻ), không phải học đồ. (P1-17, người dùng đã chốt) Quest con đó là **một** quest cho mọi unit còn mở (gom việc tí hon), dạng và nghề theo `follow_up` của mục script trong catalog (`link-check` → `document`/`scribe`; `run-check` fail → `fix`/`knight`, quest Trừ tà), `created_by: battle`, `parent_id` là quest script, unit còn mở trỏ tới nó (`child_quest`); quest script vẫn vào trạm xá với verdict fail, lý do nêu id quest con. Nhiếp chính dừng giữa lúc script chạy → `working.release.by_machine`: lượt `cancelled`, quest `open`, tick sau chạy lại.

Bất biến (zod refine + test; phần biểu diễn được đã có trong schema): `verifier ≠ assignee`; `tier = session` và `status ∈ {claimed, working, review, returned, awaiting_seal, paused_mana}` ⇒ có `assignee`; `tier = script` ⇒ `assignee = null` và có `script`; `status = review` ⇒ `attempts ≥ 1`; có `seal` ⇒ `status ∈ {done, archived}`; `status = blocked` ⇒ có `blocked`. Hai chỗ schema v1 để hở do máy trạng thái giữ (chốt sau P0-03; `questTierIssues` trong `domain/src/quest/invariants.ts`): `tier = script` ⇒ `verifier = null` (máy chấm, không bao giờ là nhân vật) và `tier = session` ⇒ không có `script`; `transition()` từ chối quest phạm một trong hai, và không hàng nào sinh ra quest như vậy (`assign_verifier` chỉ cho bậc session, không hàng nào thêm `script`).

Bảng chuyển là **dữ liệu** trong `domain/src/quest/transitions.ts` (`QUEST_TRANSITIONS`; điều kiện là hàm thuần có tên trong `QUEST_GUARDS`). `transition(quest, event, actor)` trả `Result<Quest, QuestTransitionError>`: tìm đúng một hàng theo trạng thái, sự kiện và điều kiện; kiểm actor có trong hàng, R chỉ nói thay khi có `assignee`, V chỉ khi có `verifier`, S chỉ lập verdict máy khi không có verifier (ADR 0008); áp hiệu ứng của sự kiện (`effects.ts`: người giữ quest, `attempts`, `attempt_log`, `blocked`, `seal`, `delivered_at`); rồi validate kết quả bằng schema quest. Sự kiện mang thời gian của nó (`at`), nên hàm vẫn thuần. Mã lỗi: `invalid_quest`, `no_transition`, `guard_failed`, `actor_not_allowed`, `actor_not_holding`, `invalid_event` (`assignee_for_tier`, `verifier_worked`), `invalid_result`.

`attempts` và lượt chạy `n`: `attempts` là số lần thử tính vào `budget.max_attempts` (`start`, `redispatch` +1; `retry` và `reassign` từ trạm quân y đưa về 0). (P1-55) Lượt máy của quest ghép (không có `assignee`, `machineRun`) mở lượt `n` mà không tăng `attempts`: nó không phải một lần thử của nhân vật nào, nên các hiệp sĩ sau nó giữ đủ `max_attempts`; quest ở `review` thì đã có lượt chạy (`attempts ≥ 1` hoặc một mục vai assignee trong `attempt_log`). Lượt máy chỉ chạy khi quest chưa từng có lượt nào (`machineMergeDue`: `attempts = 0` **và** `attempt_log` rỗng): `retry` đưa `attempts` về 0 mà giữ `attempt_log`, nên quest ghép từ trạm xá về luôn đến hiệp sĩ, không chạy lại máy trên commit vừa trượt. `n` trong `attempt_log` là số thứ tự lượt chạy suốt đời quest và không bao giờ lùi, vì verdict id (`<quest>-<n>`) và thư mục `.runs/<quest>-<n>` phải duy nhất cả khi `retry` đưa `attempts` về 0. Phiên mới của cùng một lần thử (hồi mana, trả lời câu hỏi) thêm một mục cùng `n`; người chấm có mục vai verifier cùng `n` với lần thử nó chấm (`.runs/<quest>-<n>/verify`; (P1-55) mỗi phiên chấm của cùng lượt có thư mục riêng: phiên đầu `verify`, các phiên sau `verify-2`, `verify-3`, để phiên chấm sau không ghi đè log của phiên `crash` trước nó). Một mục đang mở (chưa có `ended_at`) đúng khi quest `working` (vai assignee) hoặc `review` có verifier (vai verifier).

Bất biến của đội cần nhiều file quest nên nằm ngoài `transition()`: `partyIssues(quests)` trong `domain/src/quest/party.ts` báo thiếu quest hợp đồng; thành viên khác lãnh thổ với hợp đồng (phần và quest ghép tách worktree từ nhánh hợp đồng, §3.3); phần không `depends_on` quest hợp đồng; nhiều hơn một quest ghép, hoặc quest ghép không chờ mọi phần (§3.13); và người từng làm với người từng chấm của đội không rời nhau, bất kể ai đến trước (ADR 0020). Nhiếp chính kiểm sau mỗi thay đổi trên quest của đội; sa bàn kiểm mọi ngày giả.

Test: property test duyệt mọi quest mà máy đạt được từ draft trong 10 sự kiện (8 biến thể bậc × dấu vua × ngân sách lượt; mọi sự kiện × mọi actor) và 60 random walk có seed: không chuyển nào ngoài bảng, mọi hàng đều đi được, điều kiện của các hàng chung (trạng thái, sự kiện) không bao giờ cùng đúng, `attempt_log` khớp trạng thái. Bảng trong mục này được sinh từ code bằng `renderQuestTransitionTable` (`domain/src/quest/transition-table.ts`, ghi chú tiếng Việt nằm cạnh hàm đó); `pnpm docs:gen` ghi nó vào giữa hai marker `docs:gen quest-transitions`, và `pnpm docs:gen --check` (trong `pnpm check`, CI) báo khi bảng lệch code: sửa `transitions.ts` hoặc ghi chú, rồi chạy lại lệnh, không sửa bảng bằng tay.

### 2.6 Máy trạng thái nhân vật

Bảng là dữ liệu `CHARACTER_TRANSITIONS` trong `domain/src/character/transitions.ts`; `transitionCharacter(character, event)` tìm hàng, đổi `status`, `status_since` (giữ nguyên khi trạng thái không đổi), `current` và `status_before_sleep` (chỉ tồn tại khi đang ngủ), rồi validate bằng schema nhân vật. Nhiếp chính áp sự kiện nhân vật cùng lúc với sự kiện quest tương ứng (§2.5).

| Từ | Sự kiện | Đến |
|---|---|---|
| idle | claim | working (`current` = quest, vai assignee) |
| idle | assign_verify | reviewing (`current` vai verifier) |
| working | submit / ask | idle |
| working / meditating | cancel / crash / unassign | idle |
| working | compact_start | meditating |
| meditating | compact_end | working |
| working / meditating | breaker (thời gian, token, lượt) | swamp (giữ `current`) |
| swamp | quest_infirmary | idle |
| reviewing | verdict / breaker / cancel / unassign | idle (người chấm gặp cầu dao để lại verdict `partial`, không vào trạm quân y) |
| idle | mana_out (cả pool) | sleeping_mana (`status_before_sleep = idle`) |
| working / meditating | mana_out | sleeping_mana (`status_before_sleep = working`, giữ `current`) |
| reviewing | mana_out | sleeping_mana (`status_before_sleep = idle`, bỏ `current`: quest đã bỏ verifier, §2.5) |
| sleeping_mana | unassign | sleeping_mana (`status_before_sleep = idle`, bỏ `current`) |
| sleeping_mana | mana_restored | `status_before_sleep` |
| idle | fail_streak (`same_fail_suspend` lần cùng `fail_kind`) / send_to_temple | suspended |
| suspended | temple_done / release | idle |
| mọi trạng thái trừ suspended | suspend (người dùng) | suspended (quest → returned nếu là người làm, về review không verifier nếu là người chấm, mở lại nếu nhân vật ngủ trên nó vì mana, P1-22) |

(P1-26) Nhiếp chính áp lệnh `suspend`/`release` của người dùng (`steward/src/inbox/character-commands.ts`; dòng `character.suspend`/`character.release` có actor là người dùng). Nhân vật đang làm quest `working` (cả khi đang thiền): Nhiếp chính kill phiên, che secret thứ phiên để lại, commit WIP `chore: wip <quest> (suspend)`, rồi hàng `working.suspend` (lượt `returned`); quest giữ người làm cũ và chờ: Nhiếp chính không tự giao cho người khác, `release` thì người đó làm tiếp, `elvaria quest reassign` thì người khác nhận. Người chấm: kill phiên, hàng `review.suspend`, người chấm kế nhận ngay trong nhịp đó. Quest `claimed` dành cho nhân vật mà chưa bắt đầu (lệnh `reassign` chờ phụ thuộc): §2.5 không có hàng đưa nó cho người khác, nên Nhiếp chính áp `claimed.release` (S), quest mở lại. Quest `paused_mana` mà nhân vật đang ngủ trên đó: không có hàng `suspend`, quest giữ nguyên, chờ người dùng `reassign` (hay P1-22 giao lại quest dừng lâu). (P1-22) Nay có hàng `paused_mana.suspend` (U) → `open`: quest thả người bị đình chỉ (bỏ `assignee`; `attempts` và lượt đã kết thúc `paused` giữ nguyên; dòng `quest.released` của người dùng) và Nhiếp chính giao lại như mọi quest open; Nhiếp chính đi đúng đường `suspend` có sẵn (`heldQuest` thấy hàng mới). Đình chỉ nhân vật đã đình chỉ bị từ chối `character_suspended`; `release` nhân vật không bị đình chỉ bị từ chối `not_suspended`. (Chốt sau P1-26) Lệnh của chủ nhân: `elvaria character suspend <id> [--reason <lý do>]` và `elvaria character release <id>` (`apps/cli/src/character/suspend.ts`) ghi hai lệnh đó vào inbox; CLI từ chối trước nhân vật không có, đình chỉ lần hai, thả nhân vật không bị đình chỉ, và `suspend` nói quest nhân vật đang giữ sẽ ra sao (người chấm kế nhận việc chấm; quest khác đi tiếp không có nó, `quest reassign` giao cho người khác).

`unassign` là khi Nhiếp chính lấy quest khỏi nhân vật: spawn lỗi (quest `release`) hoặc người dùng giao quest cho người khác. `status_before_sleep = reviewing` vẫn hợp lệ trong schema (file cũ) và vẫn được đánh thức đúng, nhưng máy trạng thái không ghi nó nữa: người chấm hết mana thức dậy ở `idle` (người dùng chốt).

**Sa lầy** (`swamp`, người dùng chốt sau P0-04): là trạng thái, không phải nơi chốn; nhân vật không đi đâu cả. Nó kẹt tại chỗ đang làm: giữ `current`, nên thế giới vẽ nhân vật ở tòa nhà của quest với hiệu ứng lún bùn. Trạng thái chỉ kéo dài lúc Nhiếp chính kill tiến trình và commit WIP (vài giây), rồi `quest_infirmary` → idle và nhân vật nhận việc khác được ngay; tín hiệu kéo dài thuộc về quest (trạm quân y, chuông, hàng chờ Ngai vàng), vì cầu dao thường ngắt do quest quá lớn chứ không do nhân vật. Chuỗi hiển thị: "Sa lầy trong nhiệm vụ {quest}" (thay "Lạc đầm lầy"); dòng Ngai vàng của mockup ("Wren lạc đầm lầy · q_0147 hết 3 lần thử") khi port thành "q_0147 vào trạm quân y (Wren quá 45 phút)".

Danh tiếng là hàm thuần (`domain/src/character/reputation.ts`): `reputationOf(window)` trả `{verdicts, pct}`, `pct` là tỉ lệ đạt có trọng số 0–100 (dấu vua ×3, `null` khi chưa có phán quyết; đúng là `--rep` của vòng avatar), `verdicts` đếm mỗi phán quyết một lần. Chuyên môn cũng vậy: `affinityOf(skill_affinity, tags)` gộp cửa sổ của các tag của quest rồi tính như trên, và `titleOf(character)` = tag ghim, nếu không thì tag đủ ngưỡng có tỉ lệ cao nhất (hòa thì nhiều phán quyết hơn, rồi id tag), nếu không thì không có danh hiệu. Ngưỡng danh hiệu là ngưỡng lên cấp áp trên riêng tag đó: ≥ 10 phán quyết và ≥ 85% (`TITLE_MIN_*`, `domain/src/character/constants.ts`). Cấp vẫn tính trên `reputation` chung; danh tiếng theo tag chỉ dùng để xếp hạng và đặt danh hiệu.

Cấp (`domain/src/character/level.ts`, người dùng chốt sau P0-04):

| Cấp | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Hạng cao nhất nhận thường xuyên (`rankCeilingOf`) | F | E | D | C | C | B | B | A | A | S |

- `canTake(level, rank, nobodyElse)`: nhận tới hạng trần; cao hơn trần một bậc chỉ khi không còn ai đúng nghề rảnh; hai bậc trở lên thì không. Ví dụ cấp 5: F–C được, B khi không còn ai, A/S không. Cấp chỉ giới hạn việc Nhiếp chính **tự chọn** người: lệnh `reassign` có `character` (kể cả với quest `open`, hàng `open → reassign` ở §2.5) là người dùng chỉ định, không xét `canTake` (người dùng chốt sau P0-04, để vương quốc mới không kẹt vì cấp thấp). (P1-29) `create_quest` có `assignee` (`elvaria quest add --to <nhân vật>`) cũng vậy: Nhiếp chính tạo quest `open` rồi áp hàng `open → reassign` của người dùng cho nhân vật đó, nên chỉ nó nhận quest. Người được chỉ định (cả hai lệnh) phải có thật, đúng nghề, không bị đình chỉ, thuộc tộc đang bật (`namedAssignee`, `domain/src/dispatch/select-assignee.ts`); không thì lệnh bị từ chối với `unknown_character`, `class_mismatch`, `character_suspended`, `tribe_disabled`, và `create_quest` không tạo quest nào. `assignee` chỉ có ở quest bậc session tạo thẳng `open` (`draft: false`): schema từ chối nó ở draft (mở ở `confirm`, quest không có chỗ giữ người nhận) và ở bậc script (không ai làm).
- Nhận vượt hạng trần, dù do luật "không còn ai" hay do người dùng chỉ định, thì quest tự thành `seal_required` (`aboveCeiling(level, rank)`): dấu vua thay cho phần tin tưởng nhân vật chưa kiếm được. Sự kiện `claim` và `reassign` mang `level` của nhân vật lúc nhận, `transition()` tự đặt cờ; máy không bao giờ hạ cờ này (người dùng hạ được bằng `edit_quest`).
- `levelChange(character)` chỉ đếm phán quyết sau `level_since` (lần đổi cấp gần nhất): ≥ 10 phán quyết và ≥ 85% thì lên một cấp; ≥ 5 phán quyết và < 60% thì xuống một cấp; dấu vua ×3 trong tỉ lệ nhưng đếm là một phán quyết; cấp trong 1–10. Không đếm từ mốc thì điều kiện "≥ 10 và ≥ 85%" vẫn đúng ở phán quyết kế tiếp và nhân vật lên cấp sau mỗi lần đạt. Khi cấp đổi, Nhiếp chính ghi `level` mới, `level_since` = thời điểm của phán quyết đó, và event `character.level_up`/`level_down`. Cửa sổ 20 phán quyết giữ nguyên cho danh tiếng (vòng avatar).
- Xuống cấp cần ít phán quyết hơn lên cấp (5 so với 10) để cấp ban đầu đặt quá cao được sửa nhanh, mà không rớt ngay ở lần trượt đầu tiên sau khi đổi cấp.
- Cấp ban đầu: `elvaria character add --level <1–10>` (mặc định 1), người dùng đặt theo độ mạnh của model (P0-08). (P1-26) Không có `--level` thì CLI đặt theo model (từ PS-23: `starting_level` mà adapter của tộc khai cho model đó, không có thì `startingLevelOf` của domain, trước PS-23 ở `apps/cli/src/character/starting-level.ts`; bảng từ trong slug, hậu tố độ nghĩ `-low`/`-high` không tính): `opus` 5 (trần C, B khi không còn ai), `sonnet`/`pro` 4 (C), `argon` 3 (D, C khi không còn ai; P1-16 thấy Argon đoán nội dung chưa đọc), `haiku`/`flash` 2 (E); model không có trong bảng thì 1 và CLI in một dòng nhắc `--level`. CLI in cấp và hạng trần đã chọn, để dàn nhân vật mới tự nhận quest D/C mà không biến mọi quest trên F thành "vượt trần" chờ dấu vua (báo cáo giai đoạn 1 §5.1). (P1-43, (b) của P1-38) `--level` cao hơn cấp của model trong bảng thì CLI in một dòng nói Nhiếp chính coi cấp là sức của model, hạng trần mà cấp đó mở, và lệnh `elvaria character level <id> <cấp của model>` để hạ; bằng hay thấp hơn, hay model không có trong bảng, thì không in gì thêm. `character level` (lệnh `set_level`) không nhắc như vậy.
- (P1-29) Người dùng đổi cấp của nhân vật đã có bằng lệnh `set_level {character, level}` (`elvaria character level <id> <cấp>`), lên hay xuống bao nhiêu cấp cũng được, cho dàn nhân vật triệu hồi trước P1-26 vẫn cấp 1. Nhiếp chính ghi `level` mới, `level_since` = lúc áp (`levelChange` chỉ đếm phán quyết sau mốc đó, như sau một lần đổi cấp do phán quyết) và event `character.level_up`/`level_down` với actor người dùng (`setLevelLine`, `withLevel` ở `domain/src/character/level.ts`; `steward/src/inbox/character-settings.ts`). Lần nhận việc sau theo hạng trần của cấp mới; quest nhân vật đang giữ không đổi. Cấp ngoài 1–10 bị schema từ chối; cấp đang có bị từ chối `same_level`.
- (P1-22) Người dùng đổi model của nhân vật bằng lệnh `set_model {character, model}` (`elvaria character model <id> <model>`), ví dụ đưa nhân vật Argon sang Flash khi trần tuần Argon sắp cạn; nghề, tộc, cấp và danh tiếng không đổi. Model phải thuộc tộc của nhân vật (`modelOfTribe`: tộc có `pools` nhận model mà một pool có tên nhận theo tiền tố, kể cả pool đang tắt; tộc một pool nhận model cùng họ với model đang chạy); model đang chạy bị từ chối `same_model`, model của tộc khác `model_not_of_tribe`. Nhiếp chính ghi `model` và event mới `character.model_changed` với actor người dùng (`setModelLine`, `withModel` ở `domain/src/character/model.ts`; `setModel` ở `steward/src/inbox/character-settings.ts`). Phiên đang chạy giữ model cũ (`Running.model`, hết mana thì tính cho model đó); lần nhận việc sau theo đồng hồ của model mới.

### 2.7 Hợp đồng dữ liệu ↔ design system v0.2

`design/` v0.2 là **bản gốc đầu tiên** của lớp 2D: nhập một lần vào `packages/ui-kit` ở giai đoạn 2, sau đó `ui-kit` + `ui` là nguồn và thiết kế được sửa ngay trong code, không sửa `design/` (ADR 0019). Domain không đổi tên theo thiết kế; nó có hàm và dữ liệu ánh xạ, test được, để hai bên tiến hóa độc lập:

| Thiết kế (`elvaria.css`, `Icons.dc.html`) | Domain / dữ liệu | Cách ánh xạ |
|---|---|---|
| `data-status` 8 tông: `open, working, review, done, returned, sleep, infirmary, seal` | 12 trạng thái quest (§2.5) | `statusToneOf(status)` thuần trong `domain/src/quest/status-tone.ts`: draft/open/blocked/archived → `open`; claimed/working → `working`; review → `review`; returned → `returned`; awaiting_seal → `seal`; done → `done`; paused_mana → `sleep`; infirmary → `infirmary`. Test: mọi trạng thái có tông; mọi tông có ít nhất một trạng thái; danh sách tông đọc từ CSS (spec của domain không đọc được file, nên `packages/domain/vitest.config.mjs` đọc CSS nguồn hiện hành và đưa vào spec qua `provide`/`inject` của vitest) |
| icon nhân vật `c-working, c-reviewing, c-sleeping, c-meditating, c-suspended, c-swamp` (6, không có idle) | 7 trạng thái nhân vật | `characterToneOf(status)` trong `domain/src/character/character-tone.ts`: idle → `null` (không icon) |
| icon dạng trong nguồn thiết kế: `kien-tao, tham-hiem, tru-ta, gia-co, soan-thao, rao-truyen, chiem-nghiem, nghi-hoi, chinh-phuc, ngoai-giao, tran-danh, chien-tranh` (slug VI) | id kind EN: `build, research, fix, refactor, document, publish, analyze, plan, integrate, negotiate, batch` + entity `campaign` | `scripts/gen-icons.mjs` **đổi tên khi sinh** theo bảng cố định `scripts/icon-names.json` (`kien-tao → kind-build`, `tru-ta → kind-fix`, `chien-tranh → kind-campaign`…); icon thiết kế chưa có trong bảng ⇒ lệnh fail. Code chỉ thấy id EN; `themes/fantasy/kinds.json`: `{ id: "fix", icon: "kind-fix", building: "hunting-ground", … }`; chuỗi hiển thị ("Trừ tà" / "Exorcism") nằm trong i18n |
| icon nghề `te-tuong, phap-su, hiep-si, nguoi-lun, elf-trinh-sat, thu-ky, nha-tho, chiem-tinh-gia, su-than, tho-ca, thu-thu-truong, thay-tu` | class EN: `chancellor, mage, knight, dwarf, scout, scribe, bard, astrologer, envoy, judge, monk` | sinh thành `class-chancellor … class-monk`; hai icon nghiệm thu thành `class-judge-build` (tho-ca) và `class-judge-document` (thu-thu-truong). `themes/fantasy/classes.json`: `judge` có `icon_by_kind` (build/fix/refactor/integrate/batch → `class-judge-build`; document/research/publish/negotiate → `class-judge-document`; analyze → `class-astrologer`; plan → `class-mage`) và `title_by_kind` (khóa i18n: Thợ cả, Thủ thư trưởng, Chiêm tinh gia thứ hai, Trọng tài, Hiền giả) |
| huy hiệu tộc `fac-silver` / `fac-fire`, màu `--elv-fac-silver` / `--elv-fac-fire` | `character.tribe` (id mở), `kingdom.tribes[].look` (tùy chọn) | (PS-24) Ngoại hình là bộ phần ghép (bảng màu, huy hiệu, dáng người, hào quang, khung chân dung) cùng tên, mỗi phần là một id trong **kho ngoại hình** của theme (`tribe-looks.schema.json`; kho của theme `fantasy`: `packages/domain/src/tribe/fantasy-looks.json`, `lookPoolOf(kingdom.theme)`). `tribeLookOf(pool, kingdom.tribes, tribe)` thuần trong `domain/src/tribe/look.ts` trả ngoại hình theo thứ tự: lựa chọn của chủ nhân (`elvaria tribe look`, cả bộ), mục ghim của theme (`claude`: bảng màu `silver` + huy hiệu `star` = Sao Bạc; `gemini`: `red` + `fire` = Lửa Đỏ; hai bảng màu đó chính là `--elv-fac-silver`, `--elv-fac-fire`), rồi ngoại hình tự sinh: mỗi danh sách đi từ chỗ băm FNV-1a của id chỉ tới, theo thứ tự `kingdom.tribes[]`, bỏ qua bảng màu và huy hiệu tộc khác đang giữ (mục ghim và lựa chọn của chủ nhân giữ chỗ từ đầu), nên hai tộc khác nhau ở cả hai trong khi kho còn, hết kho thì ghép bảng màu với huy hiệu khác. Không còn ngoại hình trung tính. Icon sinh thành `crest-<id>` (`fac-silver` → `crest-star`, `fac-fire` → `crest-fire`); token màu sinh từ `night`/`day` của bảng màu. Tên hiển thị: tên chủ nhân đặt (≤ 24), không thì `tribe_look.name` ghép tên huy hiệu và bảng màu (i18n `tribe_look.<phần>.<id>`). Kho `fantasy` có 10 bảng màu (tương phản ≥ 4,5 trên nền và mặt bảng, ngày và đêm; CIEDE2000 ≥ 8 với bảy màu trạng thái quest và màu nhấn, ≥ 12 giữa hai bảng màu; spec của domain đo bằng token của CSS), 10 huy hiệu, 4 dáng người, 4 hào quang, 4 khung |
| badge hạng `data-rank="F…S"`, ba mức hình (biển gỗ / cờ hiệu / cờ lớn) | `rank` | trực tiếp; `rankTierOf(rank)` cho lớp 3D dùng cùng ba mức |
| avatar `data-tier="1..4"`, vòng `--rep` | `gearTierOf(level)`, `reputationOf(window)` | hàm thuần |
| `.elv-mana__cap` (trần), `.elv-mana__warn` (cảnh báo) | `mana.cap_pct`, `warn_margin_pct`, `king_reserve_pct` | HUD vẽ từ `ManaReading[]`; thanh theo tộc dùng **pool chính** (`gemini_models`), pool phụ hiện trong tooltip/Cài đặt — thiết kế cần hai thanh (§9.1 mục 19) |
| `.elv-name` 24ch | `kingdom.name`, `territory.name`, `character.name` ≤ 24 | zod `max(24)` |
| màn Cài đặt: mana_cap, king_reserve, 4 cầu dao, 3 kênh chuông, đường hầm, tiết kiệm, theme, 3 lịch, ngày/đêm | `kingdom.json` | đều đã có trường; **thiết kế còn thiếu**: `owner.locale`, `tools.gemini.kind` + `terms_acknowledged_at`, `territory.worktree_dir`, `subagent_max_*`, `resume_after_mana` → nhóm "Công cụ & nâng cao" (§9.1 mục 19) |
| `scene` của HUD: default, cả tộc ngủ, CLI chưa đăng nhập, sa bàn, phòng thủ | `WorldState.banner` suy từ mana × tools × cờ sandbox × incident | selector thuần `bannerOf(state)` trong `domain/src/world/banner.ts`, dùng cho cả world và lite. HUD chỉ có chỗ cho một dải, nên trả một dải hoặc `null`, theo thứ tự: `sandbox` (dữ liệu giả không bao giờ được trông như thật) > `defense` (chiến dịch `mode = defense` đang `declared`/`active`) > `tool_unavailable` (CLI của tộc đang bật `missing` hoặc `logged_out`, cần người dùng) > `asleep` (pool hết mana của tộc đang bật, tự hồi). Đầu vào `BannerSource = {sandbox, tribes[{id, enabled, tool}], pools[{tribe, pool, asleep}], campaigns[{id, mode, status}]}`; `WorldState` của P0-09 mang các trường này |
| icon hành động `act-seal, act-return, act-summon, act-suspend, act-reassign, act-archive, act-temple, act-declare`; trạng thái `q-*`, `c-*` | kind của inbox command; tông trạng thái | sinh thành `action-seal …`, `quest-open …`, `character-working …`; 1:1 với §2.3 và `statusToneOf` |

**Quy tắc đặt id** (áp dụng cho mọi dữ liệu và code): id là **tiếng Anh chuẩn**, động từ/danh từ thông dụng; `snake_case` cho khóa và giá trị enum trong JSON, `kebab-case` cho id icon/asset/file (kể cả id script vì nó là tên file), `camelCase`/`PascalCase` trong TS. Không slug tiếng Việt, không từ "màu mè" (`exorcise`, `fortify`, `proclaim`, `divine`, `conquer`). Chất fantasy chỉ nằm ở chuỗi hiển thị (i18n, `title_key` của theme). Tên nghề (`knight`, `scout`, `judge`, `monk`…) và tên vai hệ thống (`chancellor`, `steward`, `herald`) giữ nguyên vì đó là ngôn ngữ chung của sản phẩm (như `pod`, `helm` của Kubernetes); câu hỏi đổi tên nghề sang vai kỹ thuật vẫn mở ở §10. (ADR 0014)

Chuỗi hiển thị trong mockup là tiếng Việt → khi port, mọi chuỗi vào `packages/i18n` (`vi.json` lấy nguyên văn từ mockup, `en.json` dịch), lint `no-literal-string` như dc1.
