# Thêm một tộc

Ngày: 2026-11-13 (PS-23). Cho chủ nhân và cho phiên viết adapter của một CLI mới (Grok, Cursor, Kiro, hay CLI nào có sau này). Một tộc là **một adapter** (file `adapters/<tên>.mjs` trong vương quốc, hoặc một package có sẵn), **một ngoại hình** (tự sinh, hoặc chủ nhân chọn) và **tài khoản của chủ nhân** đã đăng nhập trên máy ([ADR 0021](../adr/0021-tribe-contract.md), [implementation-plan §3.14](../implementation-plan/3.14-tribe-contract.md)). Lõi, hook và CLI của Elvaria không sửa: từ PS-23 mọi điều Elvaria cần biết về một CLI là thứ adapter khai.

Mẫu chạy được: [apps/cli/fixtures/flint-adapter.mjs](../../apps/cli/fixtures/flint-adapter.mjs) (adapter file) và [apps/cli/fixtures/fake-flint.mjs](../../apps/cli/fixtures/fake-flint.mjs) (CLI giả "flint", có hook riêng, chạy model của nhiều hãng dưới tên riêng). [apps/cli/src/tribe/flint.spec.ts](../../apps/cli/src/tribe/flint.spec.ts) đi hết các bước dưới với nó: qua đủ bộ test hợp đồng, rồi làm xong một quest hạng C.

## 1. Spike: bộ câu hỏi

Trước khi viết adapter, trả lời đủ mười sáu câu dưới, câu rẻ trước, ghi vào `docs/spikes/<cli>-<ngày>.md` như [spike Codex](../spikes/codex-2026-11-12.md) (§0 của nó là bản gốc của bảng này, §1–§4 là câu trả lời mẫu). Cột "Năng lực" chỉ trường của `capabilities` mà câu trả lời quyết.

| # | Câu hỏi | Năng lực, chỗ dùng | 0 mana |
|---|---|---|---|
| Q1 | Phiên bản, chỗ cài, có trên PATH không, tự cập nhật thế nào (tắt được không) | `doctor()`; CLI tự cập nhật đổi hành vi dưới bản ghim (mục 6) | có |
| Q2 | Kiểu đăng nhập; lệnh nào hỏi đăng nhập mà không gọi model | `auth`, `doctor().auth_ok` | có |
| Q3 | Credentials và cấu hình người dùng nằm đâu; đặt cấu hình theo lần chạy (trong `<run_dir>`) mà không đọc, không ghi thư mục nhà của CLI | luật "không chạm `~/.<cli>`" | có |
| Q4 | Chạy không tương tác: lệnh, prompt qua đâu (argv, stdin, file), mã thoát | `headless` (bắt buộc); 32 767 ký tự của dòng lệnh Windows | không |
| Q5 | Luồng sự kiện có cấu trúc: dạng, id phiên, chữ, tool, usage, lỗi | `events`, `usage`, `RunResult` | không |
| Q6 | File chỉ dẫn tự nạp: tên, thứ tự, cách chèn chỉ dẫn của Elvaria mà không sửa file của lãnh thổ | `context_file` | có, nếu CLI dựng prompt mà không gọi model |
| Q7 | Hook: có không, khai ở đâu, sự kiện nào, payload, cách chặn, cách CLI chạy lệnh hook trên từng hệ điều hành, tin cậy hook | `tool_gate`, `events`, cổng thư bàn giao (ADR 0010); `dialect` (mục 3) | một phần |
| Q8 | Tool của model: tên, tool đọc, ghi, tìm, shell, web, sub-agent, hỏi người | `read`, `search`, `subagent`; bảng `tools` của `dialect` | có, nếu CLI dựng prompt |
| Q9 | Sandbox hay quyền: ghi ngoài thư mục làm việc, `.git`, mạng, thư mục thêm; **tiến trình con của một lệnh** | hàng rào ghi; phép `spawn_child` | không |
| Q10 | Shell của tool lệnh theo hệ điều hành; env của lệnh (secret có tới không) | `shell`; kho bảo vật (ADR 0013) | không |
| Q11 | Output theo JSON Schema | `structured_output` | không |
| Q12 | Nối phiên | `resume` | không |
| Q13 | Hạn mức: đọc được mà không gọi model không; phiên hết hạn mức báo gì | `usage`, `probe()`, đồng hồ mana (ADR 0009) | có (đọc) / không (báo) |
| Q14 | Kill giữa lệnh dài: mã thoát, luồng, tiến trình con còn sót | phép `hang`, kill tree | không |
| Q15 | Hỏi người giữa phiên khi chạy không tương tác | luật "câu hỏi vào thư bàn giao" | không |
| Q16 | Model của tài khoản, họ (hãng làm ra) của từng model, model rẻ nhất, cách chọn mức suy luận | `models` (mục 2.2) | có |

## 2. Adapter file

`<vương quốc>/adapters/<tên>.mjs` export `createAdapter(kit)` trả một `AgentRunner`: `tribe`, `adapter`, `capabilities`, `spawn(req)`, `probe()`, `doctor()`. File không import gì: spawn và kill tree, env tối thiểu, ngữ cảnh lần chạy, `policy.json`, file của lần chạy, run log, output đã che, mục Question của thư, hàng rào tool đều ở trong `kit` ([§3.14](../implementation-plan/3.14-tribe-contract.md) đoạn "Adapter file"). Prompt, `ToolPolicy` và đất riêng đến trong từng `SpawnRequest`. Chỉ `apps/cli` nạp file này; `elvaria tribe check` là đường duy nhất bật nó.

### 2.1 Năng lực

| Trường | Kiểu | Thiếu, hay `false`, thì Elvaria làm gì |
|---|---|---|
| `headless` | bắt buộc `true` | không bật được tộc |
| `context_file` | boolean | địa chí và `territory.context_files` vào thẳng prompt |
| `events` | boolean | chỉ "đang làm / xong" (adapter ghi `agent.session.start` và `.end`); không học đồ |
| `tool_gate` | boolean | chỉ quest hạng F–D, không lãnh thổ có `read_before_write` hay `rank_floor`; thư bàn giao kiểm sau phiên |
| `usage` | boolean | mana ước lượng theo phút; cầu dao chỉ theo phút |
| `structured_output` | boolean | schema trong prompt, cắt JSON từ văn bản, thử lại một lần; không làm Tể tướng khi tộc khác có năng lực này |
| `resume`, `compact` | boolean | hồi sinh và ngồi thiền là phiên mới từ thư bàn giao |
| `subagent` | boolean | không học đồ |
| `auth` | `['login']`, `['api_key']` hay cả hai | `tool.auth` của tộc phải nằm trong đó (`doctor`, `tribe check`) |
| `shell` | `{win32?, darwin?, linux?}` tên shell | prompt không nói phiên chạy lệnh trong shell nào |
| `search` | boolean, mặc định `true` | `false`: nghề có Glob/Grep tìm bằng `git grep`, `git ls-files` trong tool lệnh; hook chặn cờ nguy hiểm |
| `read` | boolean, mặc định `true` (PS-23) | `false`: prompt bảo nghề có shell đọc, liệt kê, tìm bằng lệnh chỉ đọc của shell, nghề không có shell đọc file đã theo dõi bằng `git grep -h -n -e '^' -- '<path>'`; adapter phải để các lệnh đó chạy |
| `models` | danh sách (mục 2.2), PS-23 | mọi slug được nhận; họ đọc từ chữ đầu của slug; cấp khởi đầu theo chữ của slug |

Khai đúng điều đã đo trong spike. Bộ test hợp đồng kiểm hình dạng của mọi trường, và kiểm hành vi của `tool_gate` (lệnh `git push` phải bị chặn thật), `usage` (phiên phải báo token), `headless`.

### 2.2 Model và họ của model

Luật tách vai (ADR 0008) cần biết hãng làm ra model của người làm và của người chấm. Một CLI chạy model của nhiều hãng dưới tên riêng (flint gọi một model của Anthropic là `swift`) sẽ bị đọc sai họ nếu Elvaria đoán từ chữ đầu của slug. Adapter khai:

```js
models: [
  { id: 'swift', family: 'claude', starting_level: 4 },
  { id: 'swift-max', family: 'claude', starting_level: 5 },
  { id: 'breeze', family: 'gemini', starting_level: 3 },
  { id: 'auto' },
],
```

- Một slug ứng với `id` dài nhất mà nó bằng, hoặc bắt đầu bằng `id` theo sau là `-`: `swift-high` (mức suy luận) là `swift`, không cần mục riêng. Một mục chung (`{ id: 'gpt', family: 'gpt' }`) nhận mọi model sau này của cùng hãng.
- `family`: họ của hãng, chữ thường (`claude`, `gemini`, `gpt`, hay họ mới). Thiếu `family` (bộ chọn tự động như `auto`) là họ **không rõ**: không bao giờ được tính là khác họ với ai, kể cả khi người kia cũng không rõ họ. Người chấm ở họ không rõ chỉ chấm được như "cùng họ, khác model" (`dispatch.verifier_same_family`).
- `starting_level`: cấp của nhân vật triệu hồi trên model đó khi chủ nhân không cho `--level`; thiếu thì theo chữ của slug như trước (`opus` 5, `sonnet` 4…), không có chữ nào thì cấp 1.
- Khai danh sách thì `elvaria character add` và `elvaria character model` (lệnh `set_model`) chỉ nhận model trong đó.

### 2.3 Hook qua kiểu trung tính

CLI có hook riêng thì adapter không cần sửa `packages/hooks`: nó tả payload của CLI cho hook của Elvaria bằng dữ liệu, trường `dialect` của `policy.json`, ghi bằng `kit.session.writePolicyFile(req.run_dir, kit.session.runContextOf(req), req.permissions, { dialect })`. Lệnh hook là `kit.hookCommand(policyFile)` (dạng exec: `command`, `args`); thêm `--event <tên sự kiện trước tool>` vào lệnh của sự kiện đó để một payload không đọc được vẫn bị chặn. Hook không nạp code của chủ nhân; nó đọc bản đồ này ([packages/hooks/src/neutral/dialect.ts](../../packages/hooks/src/neutral/dialect.ts) là hợp đồng, kiểm bằng tay).

| Trường | Nghĩa |
|---|---|
| `version` | `1` |
| `event` | đường dẫn chấm tới tên sự kiện trong payload (`kind`), hoặc `argv` khi CLI đưa tên sự kiện làm đối số đầu (như agy) |
| `events` | tên của CLI cho `session_start`, `pre_tool` (bắt buộc), `post_tool`, `stop` |
| `session`, `model`, `cwd`, `exit` | đường dẫn chấm tới id phiên, model, thư mục của phiên, mã thoát của lệnh (sau tool) |
| `tool_name`, `tool_input` | đường dẫn chấm tới tên tool và input của nó (`action.name`, `action.params`) |
| `tools` | mỗi tool của CLI: `kind` (`read`, `write`, `bash`, `web`, `search`, `other`), `grants` (tool của nghề theo tên Claude Code, một trong số đó cho phép dùng: `Bash`, `Edit`…), khóa của input chứa `command`, `paths`, `url`, hay `patch` (patch dạng `*** Update File:`); `refuse`: `subagent`, `ask`, `tool` để Elvaria từ chối bất kể nghề. Tên kết thúc bằng `*` là mọi tool bắt đầu bằng phần trước nó |
| `unknown_tools` | `deny` (mặc định: tool không khai thì bị chặn, vì hook không kiểm được đường dẫn và lệnh của nó) hoặc `allow` |
| `answers` | JSON mà CLI đọc: `deny` (chặn một tool), `stop` (bắt thêm một lượt, cổng thư bàn giao), `pass` (khi không gì chặn, nếu CLI cần một câu trả lời); chuỗi `{reason}` được thay bằng lý do |

Luật hook áp như với ba CLI có sẵn: luật lãnh thổ (`forbidden_paths`, `read_only_paths`, `forbidden_commands`), đường dẫn CLI tự khóa và `.git`, tool của nghề, cờ nguy hiểm của `git grep`, lệnh graphify, và cổng thư bàn giao. Hook ghi `agent.session.start`, `agent.tool.blocked`, `agent.tool`; adapter ghi `agent.session.end` từ luồng của CLI.

CLI không có hook: bỏ `dialect`, khai `tool_gate: false` và `events: false`; tộc vẫn chạy, bị thu hẹp như bảng 2.1 (mẫu: [lantern-adapter.mjs](../../apps/cli/fixtures/lantern-adapter.mjs)).

## 3. Các bước trong vương quốc

1. Chủ nhân cài CLI và tự đăng nhập. Đặt adapter file vào `<vương quốc>/adapters/<tên>.mjs`.
2. `elvaria tribe add <tộc> --adapter adapters/<tên>.mjs`: tộc **tắt**, in ngoại hình tự sinh của nó.
3. `elvaria doctor --tool <tộc>=<đường dẫn CLI>`: hỏi `doctor()` của adapter, ghim đường dẫn và phiên bản.
4. `elvaria tribe check <tộc>`: bộ test hợp đồng với CLI thật, chỉ các phép không tốn hay tốn rất ít mana (`capabilities`, `doctor`, `probe`, `submit`, `hang`, `forbidden_command`, `spawn_child`, `structured`); qua thì bật tộc. Với một CLI giả của chính bạn, `--scenarios` chạy đủ mọi phép; CLI giả của một tộc khai `structured_output` phải diễn cả kịch bản `structured` (trả `FAKE_STRUCTURED_ANSWER` của runner-core theo schema của request). Không qua thì tộc giữ nguyên trạng thái; đọc từng dòng ✗.
5. `elvaria tribe look <tộc>` in ngoại hình và nguồn của nó; `--palette`, `--crest`, `--figure`, `--aura`, `--frame`, `--name` đặt ngoại hình của chủ nhân (PS-24).
6. `elvaria character add <id> --class judge --tribe <tộc> --model <model>` rồi một hiệp sĩ: tộc mới bắt đầu bằng một người chấm và một hiệp sĩ, quest nhỏ đầu tiên (chủ nhân chốt 2026-11-12).

Nhân vật cũ không đổi: tộc của một nhân vật cố định suốt đời.

## 4. Thiếu năng lực thì tộc bị thu hẹp thế nào

Hàm thuần `tribeLimitsOf(capabilities)` của domain, mỗi năng lực một hàng (`TRIBE_NARROWING`), `planTick` áp:

| Thiếu | Giới hạn |
|---|---|
| `headless` | `enabled: false`: không nhận gì |
| `context_file` | `context: prompt` |
| `events` | `activity: start_end`, `apprentice: false` |
| `tool_gate` | `max_rank: D`, `guarded_zones: false`, `handover_check: after_session` |
| `usage` | `mana_source: elapsed_time`, `breakers: minutes_only` |
| `structured_output` | `structured_output: prompt_and_parse` |
| `resume` | `resume: false` |
| `compact` | `compact: false` |
| `subagent` | `apprentice: false` |

`search`, `read`, `shell` và `models` không thu hẹp tộc: chúng đổi prompt, tool của nghề, luật tách vai và cấp khởi đầu (bảng 2.1).

## 5. Agent Client Protocol

Agent Client Protocol (ACP) là giao thức JSON-RPC qua stdio giữa một chương trình chủ (trình soạn thảo) và một CLI agent; Claude Code, Codex và Gemini CLI có bản nói nó, agy 1.5.6 có lệnh con `acp` (cli-facts 2026-11-12 §2). Một adapter nói ACP có thể dùng cho nhiều CLI. Đọc đặc tả ở [agentclientprotocol.com](https://agentclientprotocol.com/protocol/prompt-turn) ngày 2026-11-13; chưa đo trên CLI nào, chưa viết adapter (chủ nhân chốt 2026-11-13: chỉ trả lời ba câu).

1. **`tool_gate` và `events` không cần bộ dịch hook theo từng CLI?** `events`: có. Mọi tool call tới chương trình chủ thành `session/update` (`tool_call`, rồi `tool_call_update` đổi `status`), mang `kind` (`read`, `edit`, `delete`, `move`, `search`, `execute`, `fetch`, `think`, `switch_mode`, `other`), `locations` (đường dẫn) và `rawInput`: adapter tự ghi `agent.tool` từ đó, không qua hook. `tool_gate`: chưa chắc. `session/request_permission` cho chương trình chủ cho phép hay từ chối một tool call (`outcome: selected` với một lựa chọn `allow_once`, `reject_once`…), nhưng đặc tả viết agent **MAY** hỏi: hỏi tool nào là do agent và chế độ của nó, và `locations` chỉ là dữ liệu hiển thị. Adapter ACP phải đặt agent vào chế độ hỏi mọi tool ghi và mọi lệnh, rồi tự áp luật lãnh thổ (cùng luật hook áp, nhưng ở adapter); khai `tool_gate` chỉ khi phép `forbidden_command` của bộ test hợp đồng qua với CLI đó.
2. **Một lượt không người được không?** Được: `initialize`, `session/new` (thư mục của phiên), một `session/prompt`; lời đáp tới khi lượt xong, kèm `stopReason` (`end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, `cancelled`). Mọi `session/request_permission` phải được adapter trả lời tự động. Đặc tả không có yêu cầu hỏi người một câu tự do: câu hỏi vẫn vào thư bàn giao.
3. **Hủy phiên và hết mana báo thế nào?** Hủy: chương trình chủ gửi `session/cancel`, trả `cancelled` cho mọi `session/request_permission` đang chờ; agent dừng và đáp `session/prompt` với `stopReason: cancelled`. Kill tree vẫn cần khi agent không dừng. Mana: `usage_update` (tùy chọn) báo token của ngữ cảnh (`used`, `size`) và chi phí; đặc tả không nói gì về lỗi hạn mức, nên tín hiệu hết mana là lỗi riêng của từng agent, adapter phải nhận ra như hôm nay (P1-22).

## 6. Bẫy đã gặp

- **CLI tự cập nhật dưới bản ghim** (bài học 2026-11-13): agy thay `agy.exe` tại chỗ từ 1.5.6 lên 1.5.7 và `tribe check` với agy thật còn 3/7. Tắt tự cập nhật nếu CLI cho (Q1). Từ fix/tribe-version-hold, Nhiếp chính tự giữ tộc có CLI không còn hay khác bản đã kiểm (`tool.checked_version`); `elvaria tribe check <tộc>` với CLI thật qua thì ghim bản mới cho riêng tộc đó, không cần `doctor --pin`.
- **Lệnh của `doctor()` hết giờ trên máy bận** (fix/busy-machine): `codex login status` không trả lời kịp và doctor báo "chưa đăng nhập", bảo chủ nhân đăng nhập lại. `kit.process.runToEnd` trả `timed_out` và `problem` (hết giờ: lệnh có bao lâu; không khởi động được: vì sao); đưa `problem` vào `detail` kèm tên lệnh, giữ `auth_ok: false`, đừng đọc mỗi mã thoát.
- **Hook của Elvaria chưa build** (fix/held-tribe-sessions): mọi phiên hỏng ở lần gọi hook đầu tiên. `doctor()` của adapter file không cần kiểm: `adapterOfModule` bọc nó và trả `auth_ok: false` kèm câu `hookMissing` khi script mà `kit.hookCommand()` nêu không có trên đĩa, như ba adapter có sẵn.
- **Sandbox chặn tiến trình con** (P1-12e): lệnh chạy được mà Vitest, esbuild không mở được tiến trình con; phép `spawn_child` bắt ca này cho mọi tộc.
- **Lệnh của lãnh thổ không chạy trong sandbox của một tộc** (SWC trong sandbox Codex, P1-12e): hôm nay chỉ chủ nhân chọn tộc khác cho quest như vậy; check của Nhiếp chính (ngoài sandbox) là lưới an toàn.
- File sinh theo lần chạy ở gốc đất riêng bị `prettier --check .` của lãnh thổ thấy: để file của CLI trong `<run_dir>` khi CLI cho.
