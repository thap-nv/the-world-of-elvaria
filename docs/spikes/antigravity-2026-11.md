# Spike P1-12a — Antigravity CLI (`agy`) 1.5.2 trên Windows

Chạy ngày 2026-11-06, 21:40–22:35 (giờ máy, UTC+7), nhánh `feat/p1-12a`. Trả lời các câu hỏi ở [cli-facts](../reference/cli-facts-2026-11-06.md) §2.5 trước khi viết adapter (P1-12b). Với `agy` 1.5.2, tài liệu này thay cho các dòng "chưa xác minh" của cli-facts §2; phần còn lại của cli-facts §2 vẫn đúng (flag `--help` của 1.5.1 và 1.5.2 giống hệt).

Nguồn của mỗi dữ kiện: **[máy]** đã chạy trên máy này (mã lần chạy M…/E…/X…, xem §11); **[log]** log của agy qua `--log-file`; **[docs-gói]** tài liệu đi kèm bản 1.5.2 trong `~/.gemini/antigravity-cli/builtin/skills/agy-customizations/docs/` (đọc, không sửa); **[changelog]** `agy changelog`; **[nhị phân]** chuỗi trong `agy.exe`; **[suy]** suy luận.

## 0. Cách chạy

- Phiên bản thật: `agy --version` = **1.5.2**. cli-facts ghi 1.5.1 vì extension tự cập nhật lúc 16:52 cùng ngày (§2). Bản 1.5.1 còn trên đĩa (`agy.exe.old.2d90261b`); `--help` của hai bản chỉ khác tên chương trình.
- Mọi thử nghiệm trong thư mục tạm của phiên (dưới `%TEMP%`), đường dẫn có dấu cách: một repo git tạm `ws repo/` và worktree `ws repo/.elvaria/worktrees/q1` (bố cục của ADR 0012), `GEMINI.md`, `.agents/` và `.env` giả nằm trong `.git/info/exclude`. Không chạy trên repo Elvaria hay dc1-se-team.
- Không sửa `~/.gemini`: luật quyền theo lần chạy qua `--settings <file>`, hook qua `<worktree>/.agents/hooks.json`, quyết định của hook đọc từ một file cạnh script hook (vai trò của `policy.json`). Sau mọi lần chạy, `~/.gemini/config/` không đổi; những gì chính agy ghi vào `~/.gemini` ở §8.
- Spawn bằng Node, `shell: false`, stdin `ignore`, env tối thiểu của §3.9 (`PATH, USERPROFILE, HOME, APPDATA, LOCALAPPDATA, TEMP, TMP, SystemRoot, ComSpec, PATHEXT`) + một biến đánh dấu + `AGY_CLI_DISABLE_AUTO_UPDATE=1` (giá trị này hóa ra không có tác dụng, §2.1). Với env này agy vẫn tìm được credentials (đăng nhập "silent auth" trong log). [máy]
- Model `gemini-3.8-flash-low` cho mọi lần có lượt model, trừ hai lần lỡ ở đầu (model mặc định); khoảng 0,6 triệu token qua 22 lần chạy. Pool Gemini: 5 giờ còn 95,4 %, tuần còn 98,3 % (trước spike 100 %). [máy]
- Bẫy của bộ thử, không phải của agy: Git Bash đổi đối số `/usage` thành `C:/Program Files/Git/usage` trước khi tới Node (cần `MSYS_NO_PATHCONV=1`), nên hai lần đầu gửi nhầm một prompt cho model; runner spawn từ Node không bị.
- Bộ thử (driver Node, probe hook, script dựng fixture) không commit: nó là công cụ một lần, cách dựng mô tả ở đây và ở §4.

## 1. Được / không được

| # | Câu hỏi | Kết quả trên 1.5.2 | | Hệ quả cho Elvaria |
|---|---|---|---|---|
| 1 | `--settings` trong `-p` có nhận `permissions.allow` **và** `deny`; deny có hiệu lực? | Nhận cả `allow`, `deny`, `ask` (`-p /permissions` liệt kê ở scope `global`). Deny chặn cứng `command`, `read_file`, `write_file`, **thắng cả hook `allow`**; đường dẫn tương đối tính từ workspace. [máy M2, M3] | được | `permissions.deny` là hàng rào deny thật, hook không phải hàng rào duy nhất; nhưng hook vẫn bắt buộc vì lý do khác (#12) |
| 2 | Hook có nhận env của tiến trình cha? | Có: env cha + `ANTIGRAVITY_CONVERSATION_ID` + biến danh tính Windows (`HOMEDRIVE, HOMEPATH, USERNAME, USERDOMAIN, LOGONSERVER, SYSTEMDRIVE, WINDIR`) + `PROMPT`. [máy M1b] | được | ngữ cảnh lần chạy đi được bằng `ELVARIA_*`; đường dẫn policy vẫn nên nằm trong shim (§4) |
| 3 | Hook chạy bằng shell nào trên Windows? | `cmd.exe /c` (tiến trình cha của hook là `cmd.exe`, `%CD%` được mở rộng), cwd = thư mục chứa `hooks.json`. [máy M1b] **Lệnh có dấu nháy kép không chạy được**: agy chuyển `"` thành `\"`, node nhận `"C:\…` làm tên script và chết, kể cả đường dẫn không dấu cách. [máy M1] | được, có điều kiện | khai `node elvaria-hook.mjs <Event>` không nháy, không đường dẫn tuyệt đối, cộng một shim sinh ra trong `.agents/` (§4) |
| 4 | `decision` của PreToolUse có vượt `request-review`? | `deny` chặn cứng; `deny_unless_prior_grant` = theo allow của settings, còn lại chặn cứng; `allow` **không** vượt request-review; `auto_approve` vượt request-review **và vượt cả `permissions.deny`**; thiếu `decision` = chặn. Bảng đủ ở §4. [máy M2–M7] | được | hook trả `deny` hoặc `deny_unless_prior_grant`, không bao giờ `allow`/`auto_approve`/`ask`/`{}` |
| 5 | `--json-schema` có chạy cùng hooks? | Có, cả với stream-json: `result.structured_output` + `result.json_schema`. Câu trả lời đi qua tool `finish`, PreToolUse/PostToolUse thấy nó (args = output). Schema có gốc khác `object` hoặc thiếu file → exit 1 trước khi tốn mana. [máy M8, M11, X] | được | Tể tướng/verifier tộc Gemini dùng `--json-schema`; hook không được chặn tool lạ một cách mù quáng |
| 6 | Subagent trong `-p`: có không, giới hạn thế nào? | Có: `invoke_subagent` (`TypeName: self`, `Model: inherit`); hook của worktree chạy cả trong phiên con (conversationId riêng, `lastUserInput` rỗng); luật của `--settings` áp cho phiên con. Không có trần lượt; `terminate` từ PreInvocation của phiên con không giết được nó. Token của phiên con **không** có trong `result.usage` của phiên cha. Không ổn định: 1/4 lần phiên con không khởi động và `send_message` lỗi `cross-project messaging is not allowed`. Hook `deny` cho `invoke_subagent`/`define_subagent` chặn sạch, model tự làm tiếp. [máy M9–M11] | có, không giới hạn được | giai đoạn 1 vẫn cấm học trò (ADR 0017), bằng hook |
| 7 | `/usage` có dạng máy đọc; ổn định khi quota < 100 %? | `-p /usage --output-format json`: `command.data.groups[].buckets[]` với `id, window (weekly\|5h), remaining_fraction (số thực), reset_time (UTC)`, thêm `description` khi đã dùng. Đã thấy ở 0,9776 / 0,9538 / 0,9834. 3 s, 0 token, exit 0. [máy] | được | nguồn `rate_limits` cho tộc Gemini đọc JSON, không parse bảng text |
| 8 | Mã thoát | 0 xong (kể cả tool bị chặn và kể cả soft-deny kết thúc phiên); 1 lỗi khởi động/cấu hình; 2 sai dòng lệnh; 3 lỗi model/agent hoặc `--print-timeout`, kèm dòng `AGY_ERROR: {json}` trên stderr. Bảng ở §5. [máy] | được | outcome lấy từ `status` + `finished_reason` + `denied_actions` + mã thoát |
| 9 | Vị trí transcript | `~/.gemini/antigravity-cli/brain/<conversationId>/.system_generated/logs/transcript_full.jsonl` (+ `transcript.jsonl`, `steps/<n>/output.txt`); hook nhận `transcriptPath`, bước subagent có `log_uri`. [máy] | biết | không parse (ADR 0006); xem §8 về dữ liệu nằm lại |
| 10 | Pin phiên bản khi extension tự cập nhật | Extension thay `~/.gemini/bin/agy.exe` tại chỗ, kể cả khi đang chạy; chính CLI cũng tự cập nhật nền mỗi 15 phút. Chi tiết và cách pin ở §2. [máy, log] | pin bằng đường dẫn: không; bằng phiên bản: được | `doctor` so `agy --version`; runner ghi phiên bản mỗi attempt và tắt updater của CLI bằng `AGY_CLI_DISABLE_AUTO_UPDATE=true` |
| 11 | `agy models` làm `probe()` khi tộc ngủ? | `agy models`: 2,5 s, 0 token, in `slug<TAB>tên`; `agy --output-format json models` (flag **trước** subcommand; đặt sau thì exit 1 "flags provided but not defined") → `command.data.models[]{id, label}`. Chứng minh đăng nhập + mạng, không nói gì về mana. [máy] | được nhưng yếu | `probe()` = `-p /usage --output-format json` (cùng giá, có mana); `doctor` kiểm slug của nhân vật bằng `models` JSON; khi pool cạn: chưa thử (§10) |

Phát hiện ngoài danh sách, ảnh hưởng adapter:

| # | Dữ kiện | Hệ quả |
|---|---|---|
| 12 | **Soft-deny kết thúc cả phiên.** Một tool cần duyệt trong `-p` → log `Print mode: soft-denying tool confirmation`, agy tắt ngay; `result.status = SUCCESS`, `response: ""`, `denied_actions: [{action, display_name}]`, stderr `jetski: no output produced — …`, exit 0. [máy M2, M4] | `denied_actions` khác rỗng hoặc `response` rỗng là lần chạy hỏng, không phải xong. Hook trả `deny_unless_prior_grant` để mọi thứ ngoài allow thành chặn cứng (model thấy lỗi, làm tiếp) thay vì soft-deny |
| 13 | Cú pháp luật: `command(<tiền tố>)` khớp tiền tố (`command(node -p)` khớp `node -p "6*7"`); lệnh ghép `;`/`&&` không khớp, kể cả với regex `.*` (agy xét từng phần). `command(regex:<re>)` hợp lệ nhưng regex phải khớp **cả chuỗi** (`git log.*` được, `^git log\b` không). `regex:command(…)` không hợp lệ, bị bỏ qua với một cảnh báo chỉ có trong log. Loại luật: `command, read_file, write_file, read_url, execute_url, mcp`. Đọc file trong workspace mặc định được; ghi cần allow. [máy M3, M12, nhị phân] | `ToolPolicy` sinh luật tiền tố (`command(pnpm test)`…); `command(regex:^pnpm (test\|lint)\b)` của §3.7 sẽ không bao giờ khớp |
| 14 | `--model` + `--effort`: slug đầy đủ (`gemini-3.8-flash-low`) đi một mình, hoặc tên gốc (`gemini-3.8-flash`) + `--effort low`; slug đầy đủ + `--effort` khác → exit 1 `conflicts with --effort`. [máy E1–E3] | argv chỉ truyền slug từ `agy models`, bỏ `--effort` |
| 15 | `GEMINI.md` ở gốc worktree với `@[Territory law](./LAW.md)` nhúng nội dung tới model (codeword chỉ có trong `LAW.md` hiện ra dù `read_file` bị chặn). `AGENTS.md` chưa commit và `.agents/hooks.json` của checkout chính **không** được nạp khi cwd là worktree lồng trong nó. [máy M1] | cách nạp CLAUDE.md của §3.8 dùng được; `worktree_dir` mặc định trong repo dùng được cho tộc Gemini |
| 16 | Tiến trình con của `run_command` (chạy bằng `powershell.exe`) nhận env tối thiểu Elvaria truyền + `ANTIGRAVITY_*` (gồm `ANTIGRAVITY_CSRF_TOKEN` của language server cục bộ) + `GIT_EDITOR, HGEDITOR, JJ_EDITOR, PSMODULEPATH, PYTHONUTF8` + biến danh tính Windows; không có env nào khác của người dùng. [máy M8] | env tối thiểu (ADR 0013) giữ được qua agy |
| 17 | Hook nhận nguyên văn args: `write_file` có `Content` đầy đủ; `lastUserInput` là cả prompt ở mọi event của phiên gốc. PostToolUse chỉ có `error` (`""` khi xong), không có output; tool bị chặn cứng không có PostToolUse. [máy M11] | hook không ghi args nguyên văn vào event (che, cắt); kết quả tool lấy từ stream `tool_info.output`/`error` |
| 18 | `hooks.json` không parse được → bỏ cả file, chỉ có một dòng `failed to parse hooks.json` trong log; khóa lạ (`args`) bị bỏ qua. `-p /hooks --output-format json` (0 token) liệt kê hook đã nạp kèm `source`. [máy, log] | runner kiểm `hooks.json` sinh ra bằng `-p /hooks` (trong `doctor` hoặc trước attempt đầu) |
| 19 | Stop `{"decision": "continue", "reason": …}` → thêm một lượt, `reason` thành system message. [máy M1b] PreInvocation `{"terminationBehavior": "terminate"}` ở phiên **gốc** → phiên dừng, exit 0, stderr `warning: run ended with no output and no recorded error` (gặp một lần, ngoài ý muốn, khi thử kill). [máy] | Stop hook kiểm `handover.md` như §3.7 làm được; agy không có `--max-turns`, cầu dao `max_turns` có thể đếm PreInvocation trong hook rồi `terminate` (cần thử có chủ đích ở P1-12b) |
| 20 | `num_turns` luôn 1 (một lượt người dùng); `result.usage` = tổng `usage` của các bước `agent_response` của phiên gốc. [máy] | ước lượng mana từ `result.usage`; số lượt model đếm bằng bước `agent_response` |

## 2. Phiên bản và cách pin (dữ kiện: lần cập nhật 1.5.1 → 1.5.2)

Từ `~/.gemini/logs/install.log` (log của extension `google.google-antigravity-1.11.0`), `~/.gemini/bin/` và log của CLI [máy, log]:

1. 10:01 extension tải `agy` 1.5.1 từ `storage.googleapis.com/antigravity-public/antigravity-cli/1.5.1-<build>/windows-x64/cli_windows_x64.exe` (219 588 760 byte), kiểm SHA512, đặt ở `~/.gemini/bin/agy.exe`.
2. Mỗi lần một cửa sổ VS Code mở, extension kiểm bản mới qua `releaseBaseUrl` (ngân sách 3 s) rồi spawn `agy.exe --hub … --add-dir=<workspace>`.
3. Chiều cùng ngày nó thấy 1.5.2 (`1.5.2-<build>`, 222 561 944 byte). Hai cửa sổ cùng tải vào `agy.tmp.<uuid>` (một bản tải dở 64 MB còn nằm lại); các cửa sổ khác "continuing with existing valid binary v1.5.1". Tải xong, kiểm SHA512, **đổi tên bản đang chạy** thành `agy.exe.old.2d90261b` (Windows cho đổi tên exe đang chạy) và ghi bản mới vào đúng `~/.gemini/bin/agy.exe` lúc 16:52–16:53. Xóa bản cũ thất bại `EPERM` vì hub còn giữ, và thử lại mỗi lần mở cửa sổ.
4. `~/.gemini/bin/agy.version.json` (`schemaVersion: 1`): `version, size, mtimeMs, ino, installedAt, sha512, releaseBaseUrl`.
5. `agy changelog` của 1.5.2 dừng ở mục 1.5.1: bản vá không có ghi chú. `--help` không đổi.
6. Ngoài extension, **chính CLI cũng tự cập nhật**: mỗi lần chạy, nếu lần kiểm cuối quá 15 phút, agy spawn một tiến trình cập nhật nền (`auto_updater.go: Spawned background update process`, `antigravity-cli/last_check.timestamp`, `updater/update_status.json`). Nhị phân có biến `AGY_CLI_DISABLE_AUTO_UPDATE`. Kết quả thử biến này: xem §2.1.

Hệ quả:

- Không pin được bằng đường dẫn: file ở `tool.path` đổi nội dung mà đường dẫn giữ nguyên. Tiến trình đang chạy giữ bản cũ; lần spawn sau nhận bản mới ⇒ hai attempt của cùng một quest có thể chạy hai phiên bản. [suy]
- Cách pin của Elvaria: `tribes[gemini].tool.version` là bản đã duyệt. `agy --version` mất ~130 ms, không mạng, không mana ⇒ `doctor` so phiên bản (như P0-08 đã làm) **và** runner đọc lại mỗi lần spawn, ghi vào attempt. Lệch thì cảnh báo (`doctor`) như hiện nay; lệch phiên bản là tín hiệu để chạy lại fixture/smoke `ELVARIA_LIVE=1` và viết file cli-facts mới. Đọc `agy.version.json` thay cho spawn được nhưng là định dạng nội bộ của extension. [suy]
- Runner đặt `AGY_CLI_DISABLE_AUTO_UPDATE=true` (không phải `1`, §2.1) trong env spawn để CLI không tự tải bản mới giữa một quest. Không tắt được việc extension cập nhật khi người dùng mở cửa sổ VS Code; Elvaria không đụng cài đặt của extension.
- Không chép binary ra chỗ riêng để "đóng băng": 222 MB mỗi bản, và bản chép vẫn có updater riêng (không thử).

### 2.1 `AGY_CLI_DISABLE_AUTO_UPDATE`

Thử khi lần kiểm cuối đã quá 15 phút, mỗi lần một lệnh `-p /usage` (0 token) với `--log-file` [máy, log]:

| Giá trị | Log | `last_check.timestamp` | Updater nền |
|---|---|---|---|
| không đặt (22:03) | `auto_updater.go:334] Spawned background update process` | đổi | chạy, `update_status.json`: "Already on the latest version." |
| `1` (22:18) | `Spawned background update process` | đổi | chạy như trên ⇒ `1` **không** có tác dụng |
| `true` (22:33) | `auto_updater.go:247] Auto-update disabled via environment variable AGY_CLI_DISABLE_AUTO_UPDATE` | không đổi | không chạy |

⇒ Runner đặt `AGY_CLI_DISABLE_AUTO_UPDATE=true`. Các lần chạy M… của spike dùng `1`, nên giữa chúng updater của CLI vẫn chạy (không có bản mới nên không đổi gì).

## 3. Quyền qua `--settings`

`--settings <file>` (hoặc JSON inline) nạp các khóa của `settings.json` cho riêng lần chạy, "never saved" — sau các lần chạy `~/.gemini/config/` không đổi [máy]. Log in ra luật đã nạp: `CLI settings initialized: permissions=&{Allow:[…] Deny:[…] Ask:[…]}, toolPermission=request-review` [log]. `toolPermission` chỉ có `request-review` (mặc định), `always-proceed`, `agent-decides` [nhị phân]; không có chế độ "từ chối mọi thứ ngoài allow" ⇒ vai đó do hook làm (§4).

Thứ tự đã thấy (mỗi dòng một lần chạy thật):

| Lệnh / file | Luật trong `--settings` | Hook trả | Kết quả |
|---|---|---|---|
| `node --version` | allow `command(node --version)` | `deny_unless_prior_grant` | chạy [M2] |
| `git status` | deny `command(git status)` | `allow` | chặn cứng: `Matches user-configured deny rule` [M2] |
| `git log --oneline -1` | không có | `allow` | soft-deny, **phiên kết thúc** [M2] |
| `git log --oneline -1` | không có | `allow` + `permissionOverrides: ["command(git log)"]` | soft-deny, phiên kết thúc [M4] |
| `git branch` | không có | `auto_approve` | chạy [M5] |
| `git status` | deny `command(git status)` | `auto_approve` | **chạy** — vượt deny [M6] |
| `git branch` | không có | `deny_unless_prior_grant` | chặn cứng, phiên chạy tiếp [M7] |
| `node -v` | allow `command(node -v)` | `deny` | chặn cứng: `tool call denied by pre-tool hook: <reason>` [M3] |
| ghi `secret/b.txt` | deny `write_file(secret/)` | `allow` | chặn cứng [M3] |
| đọc `.env` | deny `read_file(.env)` | `deny_unless_prior_grant` | chặn cứng [M3] |
| đọc `LAW.md` | không có | `deny_unless_prior_grant` | chạy (đọc trong workspace mặc định được) [M3] |
| ghi `notes/a.txt` | allow `write_file(notes/)` | `deny_unless_prior_grant` | chạy [M3] |
| `node -p 1; git status`, `node -p 2 && git status` | allow `command(node -p)` | `deny_unless_prior_grant` | chặn cứng [M12] |
| `node -p 3; git status` | allow `command(regex:node -p.*)` | `deny_unless_prior_grant` | chặn cứng [M12c] |

Thông báo lỗi model nhận: `permission check failed for unsandboxed "git status": Permission denied for unsandboxed(git status). Matches user-configured deny rule.` — lệnh hiện dưới tên `unsandboxed(...)` khi sandbox terminal tắt, luật `command(...)` vẫn khớp.

## 4. Hook

Khai báo [docs-gói, máy]: `.agents/hooks.json` ở gốc worktree; mỗi khóa cấp một là một hook có tên, `enabled` tùy chọn; `SessionStart`, `PreInvocation`, `PostInvocation`, `Stop` là danh sách handler phẳng; `PreToolUse`, `PostToolUse` bọc trong `{matcher, hooks}` (`"*"` khớp mọi tool). Handler: `type: "command"`, `command` (chuỗi), `timeout` tính bằng **giây** (mặc định 30). Hook chạy đồng bộ, chặn vòng lặp agent. Worktree chỉ nạp `.agents/hooks.json` của chính nó (không leo lên checkout chính) [máy].

Dạng làm được trên Windows (đã chạy, đường dẫn script có dấu cách):

```json
{ "elvaria": {
    "SessionStart": [{ "type": "command", "command": "node elvaria-hook.mjs SessionStart", "timeout": 10 }],
    "PreToolUse":  [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node elvaria-hook.mjs PreToolUse", "timeout": 10 }] }],
    "PostToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node elvaria-hook.mjs PostToolUse", "timeout": 10 }] }],
    "Stop": [{ "type": "command", "command": "node elvaria-hook.mjs Stop", "timeout": 10 }] } }
```

```js
// <worktree>/.agents/elvaria-hook.mjs — generated per run, excluded; no quotes ever reach cmd.exe
process.argv.push('--policy', "C:\\…\\.runs\\<attempt>\\policy.json");
await import("file:///C:/…/packages/hooks/elvaria-hook.mjs");
```

Dạng `node "<abs>/elvaria-hook.mjs" --policy "<run_dir>/policy.json"` của kế hoạch **không chạy**: lỗi `Cannot find module '<worktree>\.agents\"C:\…'` [máy M1]. Trên macOS agy dùng `sh -c` [docs-gói]; dạng tương đối ở trên dùng chung cho cả hai OS (macOS chưa thử).

Payload stdin (camelCase) [máy M11, fixture `hook-stdin-full-run.jsonl`]: chung `conversationId, workspacePaths[], transcriptPath, artifactDirectoryPath, modelName, lastUserInput`; PreToolUse/PostToolUse thêm `stepIdx, toolCall{name, args}` (PostToolUse thêm `error`); Pre/PostInvocation thêm `invocationNum, initialNumSteps`; Stop thêm `executionNum, terminationReason, error, fullyIdle`. Tên tool đã thấy: `run_command` (`CommandLine, WaitMsBeforeAsync, toolSummary`), `read_file`/`write_file` (`Path`, `Content`), `invoke_subagent` (`TypeName, Role, Prompt, Model`), `manage_subagents`, `send_message`, `schedule`, `finish`. Đường dẫn trong args có backslash; trong `workspacePaths`/`transcriptPath` là `/`.

Trả lời của PreToolUse (`decision` thuộc `allow | deny | ask | force_ask | deny_unless_prior_grant` theo schema trong nhị phân, cộng `auto_approve` được chấp nhận) [máy, nhị phân]:

| Trả về | Hiệu lực |
|---|---|
| `{"decision": "deny", "reason": …}` | chặn cứng, model thấy `tool call denied by pre-tool hook: <reason>`, phiên chạy tiếp; thắng allow của settings |
| `{"decision": "deny_unless_prior_grant"}` | allow của settings thì chạy; còn lại chặn cứng (không soft-deny); deny của settings vẫn chặn |
| `{"decision": "allow"}` | chỉ là "không phản đối": vẫn qua kiểm tra quyền; ngoài allow → soft-deny, phiên kết thúc |
| `{"decision": "auto_approve"}` | chạy luôn, **bỏ qua cả `permissions.deny`** |
| `{}` hoặc thiếu `decision` | chặn (`tool call denied by pre-tool hook:`) |
| hook lỗi (exit ≠ 0, không tìm thấy script, JSON hỏng) | tool lỗi `TOOL_ERROR` (đóng) |

SessionStart, PreInvocation, PostInvocation, PostToolUse, Stop lỗi → ghi log, phiên chạy tiếp (mở) [máy M1, log]. Probe có gọi `tasklist` mất 250–400 ms mỗi lần; mỗi tool call có hai lần gọi hook, mỗi lượt model thêm hai lần ⇒ hook thật phải nhẹ (< 100 ms của ADR 0006 vẫn là mục tiêu; hook tối thiểu chưa đo riêng).

## 5. Output và mã thoát

stream-json [máy, fixture]: `init{model?, cwd, tools[], permission_mode: "request-review"}` (`model` chỉ có khi truyền `--model`); `step_update{conversation_id, step_index, state: ACTIVE|DONE|ERROR, step_type}` với `step_type` thuộc `user_input`, `agent_response` (`text_delta`, `usage` ở bước DONE), `tool` (`tool_name`, `tool_info{name, parameters, output | error{type, message}}`; `write_file` không mang nội dung), `subagent` (`subagent_info.subagents[]{type_name, role, initial_prompt, conversation_id, log_uri, workspace_uris}`), `system_message`, `finish`; cuối cùng `result{conversation_id, status, response, duration_seconds, num_turns, usage{input_tokens, output_tokens, thinking_tokens, cache_read_tokens, total_tokens}, structured_output?, json_schema?, denied_actions?, finished_reason?, error?}`. Lệnh slash phát `command_result` rồi `result`.

| Tình huống | Mã thoát | `status` / dấu hiệu |
|---|---|---|
| xong, kể cả tool bị chặn cứng | 0 | `SUCCESS` |
| soft-deny (tool cần duyệt) | 0 | `SUCCESS`, `response: ""`, `denied_actions[]`, stderr `jetski: no output produced` |
| `--print-timeout` hết | 3 | `ERROR`, `finished_reason: print_timeout`, stderr `AGY_ERROR: {"short_error", "status": "DEADLINE_EXCEEDED", "retryable": false, "reason": "print_timeout", "tasks": […]}` |
| `--model` lạ, `--agent` lạ, `--model`/`--effort` mâu thuẫn | 1 | `ERROR`, `error` có danh sách model; `finished_reason: error` |
| `--json-schema` sai/thiếu, `--settings` hỏng/thiếu | 1 | chỉ stderr `Error: …`, không có stdout |
| flag lạ, `-p` cùng `-i` | 2 | stderr usage |
| bị kill (TerminateProcess) | — | Node thấy `signal: SIGTERM`; cả cây (`conhost`, `powershell`, `node`) chết trong 3 s; Stop không chạy |

Theo changelog: lỗi model/API giữa chừng → exit 3 + `AGY_ERROR` có mã HTTP/gRPC và `retryable`; hết quota cá nhân báo ngay, không thử lại; chờ retry quá 30 s hoặc hạn ngày/billing thì dừng ngay [changelog]. Chưa thấy trên máy (§10).

## 6. Subagent

[máy M9–M11] Model gọi `invoke_subagent` → bước `subagent` trong stream; phiên con chạy nền, phiên cha đợi bằng `schedule`/`manage_subagents`, stderr `root agent idle; waiting up to <print-timeout> for 1 background task(s)`. Hook của worktree chạy trong phiên con (SessionStart, Pre/PostInvocation, PreToolUse/PostToolUse, Stop) với `conversationId` của phiên con; payload không có id phiên cha, chỉ phân biệt được bằng `lastUserInput` rỗng hoặc bằng id phiên gốc từ `init`. Luật của `--settings` áp cho phiên con. `terminate` ở PreInvocation của phiên con: phiên con dừng lượt đó (Stop với `TERMINAL_CUSTOM_HOOK`) rồi bị đánh thức lại khoảng 10 lần, cha thấy nó vẫn `running` và tự kill. Hook `deny` cho `invoke_subagent` → model thấy lý do và tự làm. Token phiên con không có trong `result.usage` của cha. Một trong bốn lần (M11 lần chạy lại, fixture `stream-subagent-failed.jsonl`), phiên con không bao giờ chạy (không có SessionStart của nó), `send_message` lỗi `cross-project messaging is not allowed: sender project "default-cli-project" does not match recipient project ""`, phiên cha thử đọc transcript của phiên con trong `~/.gemini` (bị chặn: ngoài workspace) rồi tự kill nó.

## 7. Mana

`-p /usage --output-format json` (fixture `usage-json.jsonl`):

```
gemini-weekly            weekly 0.9834 2026-11-13T14:51:08Z  "You have used some of your weekly limit…"
gemini-5h                5h     0.9538 2026-11-06T19:51:08Z
3p-weekly / 3p-5h        …      1      (now + cửa sổ)
gemini-argon-wtu-weekly  weekly 0.9776 2026-11-13T14:47:50Z
```

- Bucket chưa dùng có `reset_time` = bây giờ + cửa sổ (trượt); đã dùng thì cố định (lần dùng đầu + cửa sổ). `resets_at` chỉ có nghĩa khi `remaining_fraction < 1`. [máy]
- Ánh xạ pool của §3.5: `gemini-*` → `gemini_models`, `3p-*` → `claude_gpt_models`; `gemini-argon-wtu-weekly` là trần tuần riêng của Argon. `window`: `5h` → `five_hour`, `weekly` → `weekly`; `used_pct = 100 × (1 − remaining_fraction)`.
- Một điểm hiệu chỉnh: ~0,6 triệu token `gemini-3.8-flash-low` ≈ 4,6 % cửa sổ 5 giờ, 1,7 % tuần của pool Gemini (một lần đo, thô). [máy]
- `text` vẫn là bảng tab, phần trăm làm tròn; dùng JSON.

## 8. agy ghi gì vào `~/.gemini`

So danh sách file trước và sau các lần chạy [máy]: `config/` không đổi. agy tự ghi `antigravity-cli/brain/<conv>/` (transcript, `steps/<n>/output.txt` = output của tool), `conversations/<conv>`, `implicit/*.pb`, `presence/<conv>.lock`, `log/cli-<ts>.log` (không ghi khi có `--log-file`; log đi vào file chỉ định), `last_check.timestamp`. Hệ quả: prompt của quest và output của tool (kể cả file mà nhân vật đọc) nằm lại trong hồ sơ người dùng ⇒ luật deny `.env`/`forbidden_paths` (ADR 0013) quan trọng như với Claude; Elvaria không đọc các file này. Log của `--log-file` có **email của tài khoản** đã đăng nhập (dòng `applyAuthResult: email=…`) ⇒ `<run_dir>/agy.log` là dữ liệu riêng: không đưa vào event, journal hay Sứ giả, và không dùng làm fixture. Có cờ ẩn `--app_data_dir`/`--cli_dir_name` [nhị phân] nhưng không có tài liệu và dùng chung credentials chưa rõ ⇒ không dùng.

## 9. Ghi chú cho P1-12b

- argv: `<abs>/agy.exe -p <prompt> --output-format stream-json [--json-schema <file>] --model <slug đầy đủ> --settings <run_dir>/settings.json --print-timeout <n>m --log-file <run_dir>/agy.log`; env tối thiểu + `AGY_CLI_DISABLE_AUTO_UPDATE=true`; stdin `ignore`; ghi `agy --version` vào attempt.
- `settings.json`: `permissions.allow` luật tiền tố sinh từ class (`command(pnpm test)`, `write_file(src/)`), `permissions.deny` từ luật lãnh thổ (`read_file(.env)`, `command(git push)`), `ask: []`. Không dùng `regex:` trừ khi regex khớp cả chuỗi.
- Hook: dạng tương đối + shim (§4). PreToolUse: `deny` + reason cho mọi thứ trong `forbidden_*` và cho `invoke_subagent`/`define_subagent`; mọi thứ khác `deny_unless_prior_grant`; không chặn `finish`. Không ghi `toolCall.args` nguyên văn.
- Kết quả: `status = SUCCESS` và `denied_actions` rỗng và `response` khác rỗng → xong; `denied_actions` khác rỗng → lần chạy hỏng vì thiếu quyền (lỗi của policy, không phải của quest); exit 3 → đọc `AGY_ERROR` (`retryable`, `reason`, mã lỗi) để phân biệt quota/timeout/lỗi khác.
- `.git/info/exclude`: thêm `.agents/elvaria-hook.mjs` cạnh `.agents/hooks.json` (ADR 0012). Lãnh thổ đã commit `.agents/hooks.json` của riêng nó: chưa thử (§10).

## 10. Chưa kiểm / còn mở

- Hết quota thật: dạng lỗi, `AGY_ERROR.status`, `/usage` khi pool về 0 — không đốt quota để thử. Fixture `rate_limit` của adapter dựng từ changelog cho tới khi gặp thật.
- macOS (hook qua `sh -c`), `decision: ask`/`force_ask`, `--conversation` (resume), `--input-format stream-json`, `--sandbox`, số lần Stop `continue` tối đa, độ trễ của một hook tối thiểu, `terminationBehavior: terminate` có chủ đích để làm cầu dao `max_turns`.
- Lãnh thổ có `.agents/hooks.json` đã commit: hook của Elvaria không có chỗ riêng nếu không sửa file của lãnh thổ.

## 11. Các lần chạy và fixture

Fixture ở [packages/runner-antigravity/fixtures/](../../packages/runner-antigravity/fixtures/), đường dẫn đã đổi sang `C:\Users\elvaria\AppData\Local\Temp\elvaria-spike\…`, mỗi dòng JSON qua `redactDeep` của `@elvaria/eventlog` (không dòng nào có secret để che).

| Mã | Thử gì | Fixture |
|---|---|---|
| E1–E3 | `--model` / `--effort` | `stream-minimal.jsonl` (E3) |
| X | mã thoát khi khởi động, `--print-timeout 20s` | `json-error-bad-model.jsonl`, `stream-print-timeout.jsonl` + `.stderr.txt` |
| M1 | hook dạng `node "<abs>"`: chết vì dấu nháy | — |
| M1b | hook qua shim, PreToolUse trả `{}`, Stop `continue` | `stream-hook-no-decision.jsonl` |
| M2 | deny thắng hook allow; soft-deny kết thúc phiên | `stream-soft-deny-ends-run.jsonl` + `.stderr.txt` |
| M3 | hook deny, deny theo file, allow theo thư mục tương đối | `stream-denials.jsonl` |
| M4–M7 | `allow`+`permissionOverrides`, `auto_approve` (hai lần), `deny_unless_prior_grant` | — |
| M8 | `--json-schema` + hook, env của `run_command` | — |
| M9, M10a, M10b | subagent; hook chặn subagent; `terminate` phiên con | `stream-subagent-denied.jsonl` (M10a) |
| M11 | lần chạy đủ: command, đọc, ghi, chặn cứng, subagent, `--json-schema`; chạy ba lần (lần đầu mất log hook, lần hai subagent hỏng, lần ba giữ) | `stream-full-run.jsonl` + `hook-stdin-full-run.jsonl` (lần ba, hook thấy cả phiên con); `stream-subagent-failed.jsonl` + `hook-stdin-subagent-failed.jsonl` (lần hai) |
| M12, M12b, M12c | cú pháp regex, lệnh ghép | — |
| — | `/usage` ba định dạng, `agy models` hai định dạng | `usage-json.jsonl`, `usage-stream.jsonl`, `usage-text.txt`, `models-text.txt`, `models-json.jsonl` |
