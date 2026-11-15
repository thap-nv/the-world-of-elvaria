# Báo cáo dò: Hook của Claude Code, Codex, agy có đưa được một lời nhắc tới model giữa phiên không

## Bối cảnh và yêu cầu thăm dò

Trích nguyên văn từ mục Shared decisions của `plans/phase-2.md`:

> Tín hiệu trần mềm: Nhiếp chính ghi một lần mỗi phiên file `<run_dir>/wrap-up.json` (`{"version": 1, "measure": "tokens" | "minutes" | "turns", "used": n, "limit": n, "pct": n}`) và một event mới `agent.session.wrap_up`; hook của Elvaria đọc file đó và đưa lời "dừng, commit, viết thư bàn giao" vào phiên ở lượt tool kế tiếp, chỉ qua sự kiện và trường mà file dò `plans/phase-2-probes/hook-reminder.md` (d3) kết luận `có` cho tộc đó.

Theo quy tắc dò của quest:

- `có`: Chỉ khi repo đã đo bằng CLI thật, hoặc tài liệu chính thức hay mã nguồn nói rõ chữ tới model.
- `chưa rõ`: Mọi trường hợp khác (chưa đo hoặc tài liệu không khẳng định chữ tới model).
- `không`: Khi tài liệu/mã nguồn khẳng định hoàn toàn không hỗ trợ hoặc phủ nhận.

---

## 1. Tộc Claude Code

- **Phiên bản:** Claude Code 2.1.322 (phiên bản ghim trong repo: `.claude/rules/runner.md:10`, `docs/reference/cli-facts-2026-11-12.md:10,65`) và tài liệu chính thức Claude Code.
- **Sự kiện (Hook event):** `PostToolUse` (hoặc `PreToolUse`).
- **Trường đầu ra (Output field):** `hookSpecificOutput.additionalContext`.
- **Ví dụ JSON (stdout của hook khi exit 0):**

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Wrap-up signal: Soft limit reached (measure: tokens, used: 410000, limit: 400000, pct: 102%). Dừng việc, commit mã nguồn, viết thư bàn giao và kết thúc phiên."
  }
}
```

- **Kết luận:** `có`
- **Nguồn và trích dẫn nguyên văn:**
  - Tài liệu chính thức Claude Code, trang _Hooks reference_ tại `https://code.claude.com/docs/en/hooks` (mục _Passing context to Claude_ và _Hook-specific output schemas_):
    > "The `additionalContext` field passes a string from your hook into Claude's context window. Claude Code wraps the string in a system reminder and inserts it into the conversation at the point where the hook fired. Claude reads the reminder on the next model request, but it doesn't appear as a chat message in the interface."
    > "`additionalContext` | String added to Claude's context alongside the tool result. Ignored when `permissionDecision` is `"defer"`."
  - Tài liệu repo Elvaria: `docs/reference/cli-facts-2026-11-06.md`, dòng 93 (ghi nhận theo tài liệu `[docs]`, bản đo hiện hành `docs/reference/cli-facts-2026-11-12.md` chưa đo riêng `additionalContext` trên CLI thật):
    > "JSON stdout: `hookSpecificOutput.permissionDecision` (PreToolUse), `decision: "block"` (Stop, tối đa **8 lần liên tiếp**), `additionalContext`. [docs]"

---

## 2. Tộc Codex

- **Phiên bản:** Codex CLI 0.167.0-alpha.4.1 và 0.169.0-alpha.11.1 (đo trong repo: `.claude/rules/runner.md:10`, `docs/reference/cli-facts-2026-11-12.md:10,293,307`).
- **Sự kiện (Hook event):** `PostToolUse` (hoặc `PreToolUse`).
- **Trường đầu ra (Output field):** Giả thuyết tương thích Claude wire format là `hookSpecificOutput.additionalContext` (được đề cập trong tài liệu hook tại `learn.chatgpt.com/docs/hooks` cùng thuộc tính `additionalContextLimit`). Tuy nhiên trong repo Elvaria chưa có dữ kiện đo thật bằng CLI chứng minh Codex đọc trường này và đưa chữ tới model ở `PostToolUse`.
- **Ví dụ JSON (giả thuyết cấu trúc trên stdout của hook khi exit 0):**

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Wrap-up signal: Soft limit reached (measure: tokens, used: 410000, limit: 400000, pct: 102%). Dừng việc, commit mã nguồn, viết thư bàn giao và kết thúc phiên."
  }
}
```

- **Kết luận:** `chưa rõ`
- **Nguồn và trích dẫn nguyên văn:**
  - Tài liệu repo Elvaria: `docs/spikes/codex-2026-11-12.md`, dòng 186–187 (chỉ đo `permissionDecision: deny` và cổng `Stop`; chưa đo `additionalContext`):
    > "Chặn tool: `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "…"}}`, exit 0 — đúng dạng của Claude Code. Model đọc lý do và đi tiếp (T3: "The push command was blocked by a pre-tool hook"). [máy]"
    > "Stop: `{"decision": "block", "reason": "…"}` mở một lượt tiếp với lý do làm prompt; lần Stop sau có `stop_hook_active: true` (T3: model viết `STOPPED.txt` rồi kết thúc). Cùng dạng với Claude ⇒ cổng thư bàn giao (ADR 0010) dùng nguyên. [máy], [docs]"
  - Fixture repo Elvaria: `packages/runner-codex/fixtures/hooks-list.json`, dòng 15, 35, 55 (cho thấy CLI có trường cấu hình `additionalContextLimit`, nhưng chưa đo kiểm việc truyền text tới model qua hook stdout):
    > `"additionalContextLimit": null,`
  - Đánh giá: Vì trong repo chưa đo thực tế bằng CLI đối với `additionalContext` trên `PostToolUse`, và các tài liệu/mã nguồn ngoài không thể kiểm chứng trực tiếp trong môi trường thẩm định khép kín, tuân thủ nguyên tắc dò ("mọi trường hợp khác là `chưa rõ`"), tộc Codex được xếp loại `chưa rõ` và chuyển vào mục 4 để Chủ nhân đo bằng canary token ở lần chạy thật kế tiếp.

---

## 3. Tộc Antigravity (`agy`)

- **Phiên bản:** Antigravity CLI (`agy`) 1.5.5–1.5.9 (1.5.5 đã ghim, 1.5.8/1.5.9 đã kiểm: `.claude/rules/runner.md:10`, `docs/reference/cli-facts-2026-11-12.md:10,168,274,276`).
- **Sự kiện (Hook event):** `PostToolUse` (hoặc `PreToolUse`).
- **Trường đầu ra (Output field):** Chưa xác định trường nào cho phép đưa text tới model mid-session mà không chặn tool. `PostToolUse` trong các phép đo repo chỉ có `error` (rỗng khi xong) và không có output; `PreToolUse` chỉ có các quyết định phân quyền (`allow`, `deny`, `deny_unless_prior_grant`, `auto_approve`), không có trường truyền message khi cho phép tool chạy; `Stop` có `decision: "continue"` kèm `reason`, nhưng `Stop` chỉ chạy ở cuối phiên.
- **Ví dụ JSON (giả thuyết cấu trúc thăm dò stdout của hook):**

_(Lưu ý: Đây là giả thuyết cấu trúc JSON cần thăm dò trong kịch bản đo canary. Hiện chưa có tài liệu chính thức hay phép đo nào trong repo xác nhận runtime của agy chấp nhận và đọc các trường này khi cho phép tool thực thi.)_

```json
{
  "decision": "deny_unless_prior_grant",
  "systemMessage": "Wrap-up signal: Soft limit reached. Dừng việc, commit mã nguồn, viết thư bàn giao."
}
```

hoặc:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Wrap-up signal: Soft limit reached."
  }
}
```

- **Kết luận:** `chưa rõ`
- **Nguồn và trích dẫn nguyên văn:**
  - Tài liệu repo Elvaria đã đo bằng CLI thật:
    1. `docs/spikes/antigravity-2026-11.md`, dòng 42:
       > "PostToolUse chỉ có `error` (`""` khi xong), không có output; tool bị chặn cứng không có PostToolUse. [máy M11]"
    2. `packages/hooks/src/antigravity/translate.ts`, dòng 61:
       > "/** agy's PostToolUse has no output and no exit code: those stay in the stream, which the runner reads. */"
    3. `docs/spikes/antigravity-2026-11.md`, dòng 126–134 (trả lời của PreToolUse):
       > "Trả lời của PreToolUse (`decision` thuộc `allow | deny | ask | force_ask | deny_unless_prior_grant` theo schema trong nhị phân, cộng `auto_approve` được chấp nhận) [máy, nhị phân]:"
       > "| `{"decision": "deny", "reason": …}` | chặn cứng, model thấy `tool call denied by pre-tool hook: <reason>`, phiên chạy tiếp; thắng allow của settings |"
       > "| `{"decision": "deny_unless_prior_grant"}` | allow của settings thì chạy; còn lại chặn cứng (không soft-deny); deny của settings vẫn chặn |"
       > "| `{"decision": "allow"}` | chỉ là "không phản đối": vẫn qua kiểm tra quyền; ngoài allow → soft-deny, phiên kết thúc |"
       > "| `{"decision": "auto_approve"}` | chạy luôn, **bỏ qua cả `permissions.deny`** |"
       > "| `{}` hoặc thiếu `decision` | chặn (`tool call denied by pre-tool hook:`) |"
    4. `docs/reference/cli-facts-2026-11-12.md`, dòng 197, 199:
       > "Runner khai bốn sự kiện: `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`."
       > "Trả lời của `PreToolUse`: Elvaria chỉ trả `deny` (chặn cứng, phiên chạy tiếp) hoặc `deny_unless_prior_grant` (theo allow của settings, còn lại chặn cứng). Không bao giờ `allow` (ngoài allow thành soft-deny), `auto_approve` (**vượt cả `permissions.deny`**) hay `{}`. `Stop` trả `{"decision": "continue", "reason": …}` cho cổng thư bàn giao."

---

## 4. Chủ nhân đo ở lần chạy thật kế tiếp

Dành cho hai tộc có kết luận `chưa rõ`: **Codex** và **Antigravity (`agy`)**.

### 4.1 Tộc Codex

- **Mục đích:** Xác định xem Codex có đọc `hookSpecificOutput.additionalContext` từ `stdout` của hook `PostToolUse` (hoặc `PreToolUse`) và đưa vào ngữ cảnh của model ở lượt kế tiếp hay không.
- **Kịch bản đo đề xuất (không chạy trong phiên này):**
  1. **Cấu hình hook thăm dò:** Chạy phiên với cờ cấu hình hook cho `PostToolUse`:
     `-c hooks.PostToolUse=[{matcher="*", hooks=[{type="command", command_windows="node probe-codex.mjs"}]}]`
  2. **Script hook trả canary token:** Trong `probe-codex.mjs`, in ra stdout:
     ```javascript
     const payload = {
       hookSpecificOutput: {
         hookEventName: 'PostToolUse',
         additionalContext: 'ELVARIA_CANARY_CODEX_83719',
       },
     };
     process.stdout.write(JSON.stringify(payload) + '\n');
     process.exit(0);
     ```
  3. **Chạy CLI và kiểm tra model:**
     Chạy phiên Codex headless:
     ```powershell
     codex exec "Hãy chạy lệnh kiểm tra git status. Sau khi chạy xong, hãy cho biết bạn có nhận được thông điệp hệ thống hoặc lời nhắc ngữ cảnh nào chứa chuỗi ELVARIA_CANARY_CODEX_... không? Nếu có hãy in chính xác chuỗi đó, nếu không hãy in chính xác 'KHONG_THAY'."
     ```
  4. **Đánh giá kết quả:**
     - Nếu model in ra `ELVARIA_CANARY_CODEX_83719` hoặc stream JSON ghi nhận chuỗi trong ngữ cảnh turn kế tiếp: Chuyển kết luận thành `có`.
     - Nếu model trả về `KHONG_THAY`: Chuyển kết luận thành `không` (khi đó Codex dùng cắt cứng khi chạm trần mềm).

### 4.2 Tộc Antigravity (`agy`)

- **Mục đích:** Xác định xem `agy` có hỗ trợ trường đầu ra nào trên `stdout` của hook `PostToolUse` hoặc `PreToolUse` (như `additionalContext`, `systemMessage`, hay `message`) mà runtime đọc và đưa vào ngữ cảnh của model ở lượt kế tiếp hay không.
- **Kịch bản đo đề xuất (không chạy trong phiên này):**
  1. **Cấu hình hook thăm dò:** Trong `.agents/hooks.json` ở gốc worktree, gắn hook vào `PostToolUse` (hoặc `PreToolUse` với matcher `*`):
     ```json
     {
       "probe": {
         "PostToolUse": [
           {
             "matcher": "*",
             "hooks": [
               {
                 "type": "command",
                 "command": "node probe-agy.mjs"
               }
             ]
           }
         ]
       }
     }
     ```
  2. **Script hook trả canary token:** Trong `probe-agy.mjs`, đọc stdin rồi in ra stdout:
     ```javascript
     const payload = {
       decision: 'deny_unless_prior_grant',
       systemMessage: 'ELVARIA_CANARY_AGY_98234',
       additionalContext: 'ELVARIA_CANARY_AGY_98234',
       hookSpecificOutput: {
         hookEventName: 'PostToolUse',
         additionalContext: 'ELVARIA_CANARY_AGY_98234',
       },
     };
     process.stdout.write(JSON.stringify(payload) + '\n');
     process.exit(0);
     ```
  3. **Chạy CLI và kiểm tra model:**
     Chạy phiên agy headless:
     ```powershell
     agy -p "Hãy gọi tool read_file trên file README.md. Sau khi đọc xong, hãy cho biết bạn có nhận được thông điệp hệ thống hoặc lời nhắc nào chứa chuỗi ELVARIA_CANARY_AGY_... không? Nếu có hãy in chính xác chuỗi đó, nếu không hãy in chính xác 'KHONG_THAY'." --model gemini-3.8-flash-high --settings .runs/settings.json
     ```
  4. **Đánh giá kết quả:**
     - Nếu model in ra `ELVARIA_CANARY_AGY_98234` hoặc transcript ghi nhận chuỗi này trong ngữ cảnh turn kế tiếp: Chuyển kết luận thành `có` (kèm sự kiện và trường chính xác).
     - Nếu model trả về `KHONG_THAY`: Chuyển kết luận thành `không` (khi đó Antigravity dùng cắt cứng khi chạm trần mềm).
