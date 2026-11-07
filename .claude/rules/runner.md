---
paths:
  - 'packages/runner-*/**'
---

# Luật · runner-core và adapter / Rules · runner-\*

Áp dụng khi sửa `packages/runner-core/**` và các adapter `packages/runner-*/**`; cộng thêm vào [CLAUDE.md](../../CLAUDE.md).

Dữ kiện về CLI đã có, đừng tra lại: [cli-facts](../../docs/reference/cli-facts-2026-11-06.md), spike [Claude](../../docs/spikes/claude-2026-11.md) và [Antigravity](../../docs/spikes/antigravity-2026-11.md) (spike thắng cli-facts khi khác), implementation-plan §3.3, §3.5–§3.7, §3.9, §3.10, §3.12, §3.14.

## Ranh giới (ADR 0006, 0021)

- `runner-core` ← `domain`, `store`, `eventlog`. Adapter ← chỉ `runner-core`. Steward chỉ thấy `AgentRunner` và `capabilities`; chỉ `apps/cli` import adapter cụ thể, nạp theo `kingdom.tribes[].adapter`.
- Adapter chỉ dịch `SpawnRequest` → argv, env, settings và output của CLI → signal, event; phần chung (prompt, `ToolPolicy`, plot, checks, kho bảo vật, kill tree, chuẩn hóa) ở `runner-core`. Mỗi file của adapter dưới 300 dòng, phần không theo CLI ở `runner-core` (ADR 0006, sửa sau P1-09); class chỉ được dùng trong adapter.
- Adapter không import `@elvaria/hooks` (DAG): lệnh hook do `hookCommand()` dựng (dạng exec `node` + `args` cho Claude), `apps/cli` truyền vào runner. Antigravity dùng chuỗi `node --conditions=elvaria-dist elvaria-hook.mjs <Event>` + shim sinh trong `.agents/` (§3.6, §3.7).

## Tiến trình con (ADR 0013, 0015)

- `spawn` với `shell: false`, executable tuyệt đối từ `kingdom.tribes[].tool.path`; shim `.cmd` của npm thì chạy `node <js>`.
- Env dựng tường minh, tối thiểu: không bao giờ `process.env` nguyên khối, không biến `GIT_*`. Secret của kho bảo vật chỉ vào env của lần chạy; không vào prompt, journal, log hay event (che bằng `redact` của eventlog trước khi ghi).
- Cấu hình theo lần chạy (settings, `policy.json`, `GEMINI_CLI_HOME`) nằm trong `<kingdom>/.runs/<quest>-<n>/`; code không đọc, không ghi `~/.claude/`, `~/.gemini/`, `~/.codex/`.
- Kill tree ở `src/process/kill-tree.ts`: `taskkill /PID <pid> /T /F` trên Windows, SIGTERM rồi SIGKILL trên macOS; test cả hai OS.

## CLI

- Cấm `--dangerously-skip-permissions`, `--bare`, `--worktree`, và `--resume` trừ khi `dispatch.resume_after_mana = true`. Không parse transcript: quan sát bằng hook Elvaria + stream-json.
- Claude (ADR 0007, §3.7): `-p --output-format stream-json`, `--settings <run_dir>/settings.json` (dontAsk, allow/deny từ `ToolPolicy`, `Read(./**)`/`Edit(./**)`/`Write(./**)`, `autoMemoryEnabled: false`, tắt attribution), `--tools`, `--strict-mcp-config`, `--setting-sources project,local`. Kiểm settings sinh ra bằng schema; phiên hỏng khi hook `SessionStart` của Elvaria không ghi nhận nó.
- Antigravity (ADR 0018, spike P1-12a): hook `PreToolUse` bắt buộc, trả `deny_unless_prior_grant` hoặc `deny`, không bao giờ `allow`/`auto_approve`; đặt `AGY_CLI_DISABLE_AUTO_UPDATE=true`; `agy.log` là dữ liệu riêng.

## Test

- `FakeRunner` và bộ test hợp đồng (conformance) chạy với mọi adapter. Adapter test bằng CLI giả phát lại fixture thật đã che trong `packages/runner-*/fixtures/`, giữ theo phiên bản CLI.
- Test dựng repo git tạm lọc `GIT_*` khỏi env (`envWithoutGit` của `apps/cli/test/cli.ts`): hook pre-push của husky export `GIT_DIR`, một `git init` kế thừa nó sẽ ghi vào repo đang push (§6).
- Thư mục tạm có dấu cách trong tên; ca riêng một OS dùng `it.runIf(process.platform === 'win32')`.
- `ELVARIA_LIVE=1 pnpm --filter <package> test` gọi CLI thật và tốn mana: chỉ khi đổi argv, settings hay cách parse.
