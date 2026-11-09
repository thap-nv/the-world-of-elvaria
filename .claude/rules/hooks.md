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
- `hook-process.spec.ts` đo khởi động (trung vị, trừ `node -e 0`) và liệt kê mọi module bản build nạp: import mới phải qua được nó.

## Hành vi

- Ngữ cảnh: env `ELVARIA_KINGDOM, ELVARIA_QUEST, ELVARIA_ATTEMPT, ELVARIA_CHARACTER, ELVARIA_ROLE, ELVARIA_MODEL, ELVARIA_TZ` hoặc `policy.json` v1 qua `--policy`; env thắng. Policy được yêu cầu mà đọc không được thì chặn mọi tool có đường dẫn hoặc lệnh shell.
- Chặn bằng JSON trên stdout, exit 0: `PreToolUse` → `hookSpecificOutput.permissionDecision: "deny"`, `Stop` → `{"decision": "block", "reason": …}`. Không exit 2: lý do tới model kèm cả dòng lệnh hook, lộ `run_dir` (spike P1-02).
- Thứ tự ghi: đóng dấu → `redactDeep` → cắt chuỗi dài (`…[truncated]`) tới khi dòng ≤ 64 KiB → append `events/<ngày>.jsonl` và `quests/<id>/journal.jsonl`. Lỗi ghi in ra stderr, exit 0: hook không bao giờ làm hỏng phiên.
- Không ghi env ra đâu cả (env có `CLAUDE_CODE_MESSAGING_TOKEN`); không đọc `kingdom.json`, transcript, `~/.claude/`.
- Dòng nào runner ghi từ stream thì hook không ghi (`agent.session.end`, `agent.subagent.*`): một việc, một dòng.

## Đọc stdin

- `readFileSync(0)` gặp `EAGAIN` giữa chừng (pipe non-blocking, bên ghi chưa đóng) thì bỏ phần đã đọc; nhánh dự phòng phải giữ phần đó (P1-36). Payload không đọc được: `PreToolUse` chặn, không cho qua.

## Event log

- Append-only, một `write()` mỗi dòng, không fsync, không bao giờ viết lại. Đổi tên hay payload của event type đã phát cần hàm migrate theo `v` trong `src/migrations/`.
- `src/redact*` thuộc danh sách "đọc trước khi sửa" (ADR 0013): mọi loại secret của `secrets.spec.ts` phải bị che.

## Test

- Payload stdin dựng theo tài liệu (`src/__fixtures__/claude-payloads.ts`, đủ 12 sự kiện) và payload thật của spike (`packages/runner-claude/fixtures/hook-payloads.jsonl`, `real-payloads.spec.ts`); mọi dòng ghi ra được đọc lại qua `EventSchema`.
- Nhánh Antigravity, Gemini CLI, Codex của hook đến cùng adapter (P1-12b, P1-12c, P1-12d); payload của agy không có tên event, hook đọc nó từ argv.
