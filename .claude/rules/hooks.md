---
paths:
  - 'packages/hooks/**'
  - 'packages/eventlog/**'
---

# Luật · hook và event log / Rules · hooks and eventlog

Áp dụng khi sửa `packages/hooks/**` và `packages/eventlog/**` (hook nạp eventlog mỗi lần CLI gọi); cộng thêm vào [CLAUDE.md](../../CLAUDE.md). Thiết kế và số đo: implementation-plan §3.6, mục "(P1-08)".

## Ngân sách < 100 ms

- `packages/hooks` chỉ nạp `node:fs`, `node:path`, `node:process` và `@elvaria/eventlog` (ESLint chặn). Không domain, không zod, không `node:crypto`, không `Intl`: `Intl.DateTimeFormat` đầu tiên tốn ~11 ms, nên tiến trình hook đặt `TZ` rồi đóng dấu bằng `localTs`.
- `@elvaria/eventlog` chỉ `import type` từ domain; reader nạp `EventSchema` bằng `import()` ở lần đọc đầu (`light-entry.spec.ts`).
- Hook chạy từ bản build: `node --conditions=elvaria-dist <abs>/packages/hooks/dist/elvaria-hook.js [--policy <file>]`, lệnh do `hookCommand()` dựng. Sửa `src/` của hooks hay eventlog thì build lại bằng `pnpm --filter @elvaria/hooks build` (build cả eventlog); `pnpm --filter @elvaria/hooks test` tự build.
- `hook-process.spec.ts` đo khởi động (trung vị của hiệu từng cặp hook − `node -e 0`, cổng 150 ms, tối đa ba vòng, đỏ khi cả ba vượt; `__fixtures__/startup-gate.ts`, P1-43; 100 ms là ngân sách thiết kế) và liệt kê mọi module bản build nạp: import mới phải qua được nó.

## Hành vi

- Ngữ cảnh: env `ELVARIA_KINGDOM, ELVARIA_QUEST, ELVARIA_ATTEMPT, ELVARIA_CHARACTER, ELVARIA_ROLE, ELVARIA_MODEL, ELVARIA_TZ` hoặc `policy.json` v1 qua `--policy`; env thắng. Policy được yêu cầu mà đọc không được thì chặn mọi tool có đường dẫn hoặc lệnh shell.
- Chặn bằng JSON trên stdout, exit 0: `PreToolUse` → `hookSpecificOutput.permissionDecision: "deny"`, `Stop` → `{"decision": "block", "reason": …}`. Không exit 2: lý do tới model kèm cả dòng lệnh hook, lộ `run_dir` (spike P1-02). Nhánh agy (`src/antigravity/translate.ts`): `PreToolUse` → `{"decision": "deny", "reason": …}` hoặc `{"decision": "deny_unless_prior_grant"}`, `Stop` → `{"decision": "continue", "reason": …}`. Nhánh Codex (`src/codex/`, argv `--dialect codex`) trả như Claude; payload cùng hình dạng với Claude nên chỉ cờ đó phân biệt.
- Thứ tự ghi: đóng dấu → `redactDeep` → cắt chuỗi dài (`…[truncated]`) tới khi dòng ≤ 64 KiB → append `events/<ngày>.jsonl` và `quests/<id>/journal.jsonl`. Lỗi ghi in ra stderr, exit 0: hook không bao giờ làm hỏng phiên.
- Không ghi env ra đâu cả (env có `CLAUDE_CODE_MESSAGING_TOKEN`); không đọc `kingdom.json`, transcript, `~/.claude/`.
- Dòng nào runner ghi từ stream thì hook không ghi (`agent.session.end`, `agent.subagent.*`): một việc, một dòng.

## Đọc stdin

- Đừng đọc fd 0 bằng `readFileSync(0)`: gặp `EAGAIN` giữa chừng (pipe non-blocking, bên ghi chưa đóng) nó bỏ phần đã đọc. Dùng `readStdin` của `src/stdin.ts`: vòng `readSync` giữ mọi phần, gặp `EAGAIN` thì chờ 1 ms rồi đọc tiếp (P1-36). Hook của repo (`.claude/hooks/hook-io.mjs`) và CLI giả, hook giả của `runner-claude` (`fixtures/read-stdin.mjs`) đọc cùng cách.
- Payload không đọc được (rỗng, cụt, không phải JSON object): `PreToolUse` chặn như một lệnh bị cấm (`agent.tool.blocked`, `tool: other`), không cho qua; sự kiện khác bỏ qua như cũ. Claude chỉ ghi tên sự kiện trong payload, nên runner thêm `--event PreToolUse` vào argv của handler đó (ADR 0007).
- Test đọc stdin thật: preload `--import data:text/javascript,process.stdin` làm fd 0 non-blocking trên POSIX, rồi ghi payload thành hai nửa cách nhau một quãng (`hook-process.spec.ts`).

## Event log

- Append-only, một `write()` mỗi dòng, không fsync, không bao giờ viết lại. Đổi tên hay payload của event type đã phát cần hàm migrate theo `v` trong `src/migrations/`.
- `src/redact*` thuộc danh sách "đọc trước khi sửa" (ADR 0013): mọi loại secret của `secrets.spec.ts` phải bị che.

## Bẫy đã gặp

- Câu từ chối của `protectedViolation` (`src/claude/tool-events.ts`: "is in a path your CLI refuses to write whatever its rules say") chỉ đúng khi CLI tự khóa đường dẫn đó. Từ P1-49 `.git` nằm trong `cli_protected_paths` của mọi `policy.json` dù agy không tự khóa `.git` (spike Antigravity §15); người chấm Argon của P1-50 chép câu sai đó vào ghi chú ([báo cáo](../../docs/guides/phase-1-rerun.md) §6). Từ P1-56 `policy.json` có thêm `elvaria_protected_paths` (phần của `cli_protected_paths` mà adapter không liệt kê, tức luật của riêng Elvaria; `policyFileOf` của runner-core tính) và hook nói "this is a rule of Elvaria, not of your CLI" cho glob nằm trong đó. File viết trước P1-56 không có trường này: mọi glob vẫn được coi là của CLI. Adapter nào thêm đường dẫn Elvaria tự khóa ngoài `.git` thì phải đi qua cùng trường, đừng sửa câu theo tên tộc.

## Test

- Payload stdin dựng theo tài liệu (`src/__fixtures__/claude-payloads.ts`, đủ 12 sự kiện) và payload thật của spike (`packages/runner-claude/fixtures/hook-payloads.jsonl`, `real-payloads.spec.ts`); mọi dòng ghi ra được đọc lại qua `EventSchema`.
- Nhánh Antigravity của hook có từ P1-12b (`src/antigravity/`), nhánh Codex từ P1-12d (`src/codex/`, payload thật ở `packages/runner-codex/fixtures/hook-payloads.jsonl`); nhánh Gemini CLI đến cùng adapter (P1-12c, để dành). Hook đọc tên event của agy từ argv: payload của agy trước 1.5.4 không có nó, và từ 1.5.4 có `hookEventName` mà hook không dùng.
