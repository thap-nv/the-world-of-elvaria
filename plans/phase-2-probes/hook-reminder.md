# Báo cáo dò: Hook của Claude Code, Codex, agy có đưa được một lời nhắc tới model giữa phiên không

## Bối cảnh và yêu cầu thăm dò

Trích nguyên văn từ mục Shared decisions của `plans/phase-2.md`:

> Tín hiệu trần mềm: Nhiếp chính ghi một lần mỗi phiên file `<run_dir>/wrap-up.json` (`{"version": 1, "measure": "tokens" | "minutes" | "turns", "used": n, "limit": n, "pct": n}`) và một event mới `agent.session.wrap_up`; hook của Elvaria đọc file đó và đưa lời "dừng, commit, viết thư bàn giao" vào phiên ở lượt tool kế tiếp, chỉ qua sự kiện và trường mà file dò `plans/phase-2-probes/hook-reminder.md` (d3) kết luận `có` cho tộc đó.

Theo quy tắc dò:

- `có`: Chỉ khi repo đã đo bằng CLI thật, hoặc tài liệu chính thức hay mã nguồn nói rõ chữ tới model.
- `chưa rõ`: Mọi trường hợp khác (chưa đo hoặc tài liệu không khẳng định chữ tới model).
- `không`: Khi tài liệu/mã nguồn khẳng định hoàn toàn không hỗ trợ hoặc phủ nhận.

---

## 1. Tộc Claude Code

- **Phiên bản:** Claude Code 2.1.322 (đo trong repo: `.claude/rules/runner.md:10`, `docs/reference/cli-facts-2026-11-12.md:10,65`) và tài liệu chính thức Claude Code.
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
  - Tài liệu chính thức Claude Code, trang _Hooks reference_ tại `https://code.claude.com/docs/en/hooks`:
    > "Claude Code wraps the string provided in additionalContext inside a system reminder and inserts it into the conversation where the hook fired. Claude reads the reminder on its next model request, but it does not appear as an explicit chat message in the user interface."
    > "It must always be nested inside hookSpecificOutput alongside the matching hookEventName. Placing it at the top level of your JSON output will cause Claude Code to silently ignore it."
    > "Supported events include SessionStart, UserPromptSubmit, UserPromptExpansion, PreToolUse, PostToolUse, PostToolUseFailure, PostToolBatch, Stop, SubagentStop, and PostModelSwitch."
  - Tài liệu repo Elvaria: `docs/reference/cli-facts-2026-11-06.md`, dòng 93:
    > "JSON stdout: `hookSpecificOutput.permissionDecision` (PreToolUse), `decision: "block"` (Stop, tối đa **8 lần liên tiếp**), `additionalContext`. [docs]"

---

## 2. Tộc Codex

- **Phiên bản:** Codex CLI 0.167.0-alpha.4.1 và 0.169.0-alpha.11.1 (đo trong repo: `.claude/rules/runner.md:10`, `docs/reference/cli-facts-2026-11-12.md:10,293,307`) và kho mã nguồn mở `openai/codex` trên GitHub.
- **Sự kiện (Hook event):** `PostToolUse` (hoặc `PreToolUse`).
- **Trường đầu ra (Output field):** `hookSpecificOutput.additionalContext` (JSON wire format trên stdout của hook; engine của Codex đọc thành `additional_context` trong `PostToolUseOutcome` và đưa vào `additional_contexts`).
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
  - Kho mã nguồn mở `openai/codex` trên GitHub:
    1. File `codex-rs/core/src/hook_runtime.rs`:
       Hàm `additional_context_messages` xử lý kết quả của hook, chuyển đổi trực tiếp `additional_contexts` thành chỉ dẫn gửi model (`DeveloperInstructions` trong danh sách `ResponseItem`), chứng minh chữ được gửi tới model chứ không chỉ ghi log:
       ```rust
       fn additional_context_messages(
           additional_contexts: Vec<codex_hooks::HookContext>,
       ) -> Vec<ResponseItem> {
           additional_contexts
               .into_iter()
               .map(|additional_context| DeveloperInstructions::new(additional_context).into())
               .collect()
       }
       ```
    2. File `codex-rs/hooks/src/engine/output_parser.rs` và `codex-rs/hooks/src/events/post_tool_use.rs`:
       Parser ánh xạ `hookSpecificOutput.additionalContext` thành `additional_context`:
       ```rust
       pub(crate) struct PreToolUseOutput {
           pub universal: UniversalOutput,
           pub block_reason: Option<String>,
           pub additional_context: Option<String>,
           pub updated_input: Option<serde_json::Value>,
           pub invalid_reason: Option<String>,
       }
       ```
    3. File `codex-rs/context-fragments/src/additional_context.rs`:
       Quản lý việc đưa các đoạn context bổ sung vào prompt của model (`DeveloperInstructions`), kiểm soát ngưỡng token `MAX_ADDITIONAL_CONTEXT_VALUE_TOKENS`.
  - Tài liệu repo Elvaria: `docs/spikes/codex-2026-11-12.md`, dòng 186–187 (Codex dùng chung định dạng trả lời hook của Claude Code):
    > "Chặn tool: `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "…"}}, exit 0` — đúng dạng của Claude Code. Model đọc lý do và đi tiếp (T3: "The push command was blocked by a pre-tool hook"). [máy]"
    > "Stop: `{"decision": "block", "reason": "…"}` mở một lượt tiếp với lý do làm prompt; lần Stop sau có `stop_hook_active: true` (T3: model viết `STOPPED.txt` rồi kết thúc). Cùng dạng với Claude ⇒ cổng thư bàn giao (ADR 0010) dùng nguyên. [máy], [docs]"

---

## 3. Tộc Antigravity (`agy`)

- **Phiên bản:** Antigravity CLI (`agy`) 1.5.5–1.5.9 (1.5.5 đã ghim, 1.5.8/1.5.9 đã kiểm, `.claude/rules/runner.md:10`, `docs/reference/cli-facts-2026-11-12.md:10,168,274,276`) và tài liệu chính thức `.agents/hooks.json`.
- **Sự kiện (Hook event):** `PostToolUse` (hoặc `PreToolUse`).
- **Trường đầu ra (Output field):** Không có trường chính thức nào được tài liệu hóa hay đo được trong mã nhị phân cho phép đưa một chuỗi văn bản/ngữ cảnh tới model mid-session mà không chặn tool (ở `PreToolUse` chỉ có `decision: "deny"` kèm `reason` khi chặn tool; khi cho qua bằng `allow` hay `deny_unless_prior_grant` thì không truyền message; ở `Stop` có `decision: "continue"` kèm `reason`, nhưng `Stop` chỉ chạy khi kết thúc phiên).
- **Ví dụ JSON (nếu thử nghiệm gửi chuỗi thông điệp qua stdout của hook):**

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
       > "PostToolUse chỉ có error ("" khi xong), không có output; tool bị chặn cứng không có PostToolUse. [máy M11]"
    2. `packages/hooks/src/antigravity/translate.ts`, dòng 61:
       > "/** agy's PostToolUse has no output and no exit code: those stay in the stream, which the runner reads. */"
    3. `docs/spikes/antigravity-2026-11.md`, dòng 126–136 (các quyết định của PreToolUse):
       > "Trả lời của PreToolUse (decision thuộc allow | deny | ask | force_ask | deny_unless_prior_grant theo schema trong nhị phân, cộng auto_approve được chấp nhận) [máy, nhị phân]:"
       > "{"decision": "deny", "reason": …} | chặn cứng, model thấy tool call denied by pre-tool hook: <reason>, phiên chạy tiếp; thắng allow của settings"
       > "{"decision": "deny_unless_prior_grant"} | allow của settings thì chạy; còn lại chặn cứng (không soft-deny); deny của settings vẫn chặn"
       > "{"decision": "allow"} | chỉ là "không phản đối": vẫn qua kiểm tra quyền; ngoài allow → soft-deny, phiên kết thúc"
       > "{"decision": "auto_approve"} | chạy luôn, bỏ qua cả permissions.deny"
  - Tài liệu chính thức Antigravity (`https://antigravity.google`):
    Tài liệu về hook interface (`PreToolUse`, `PostToolUse`):
    > "For security-gating events (such as pre_tool_execution or PreToolUse), the decision field controls whether the tool call is permitted: allow, auto_approve, deny."
    > "PostToolUse receives the tool call parameters and any error state, but does not parse or transmit the heavy tool output payload back into the model context by default, keeping token consumption optimized."

---

## 4. Chủ nhân đo ở lần chạy thật kế tiếp

Dành cho tộc có kết luận `chưa rõ`: **Antigravity (`agy`)**.

- **Mục đích:** Xác định xem `agy` có hỗ trợ trường đầu ra nào trên `stdout` của hook `PostToolUse` hoặc `PreToolUse` (như `additionalContext`, `systemMessage`, hay `message`) mà runtime đọc và đưa vào ngữ cảnh của model ở lượt kế tiếp hay không.
- **Kịch bản đo đề xuất (không chạy trong phiên này để tránh tốn mana):**
  1. **Cấu hình hook thăm dò:** Trong thư mục làm việc của một phiên thử nghiệm, tạo file `.agents/hooks.json` gắn hook lệnh vào sự kiện `PostToolUse` (hoặc `PreToolUse` với matcher `*`):
     ```json
     {
       "probe": {
         "PostToolUse": [
           {
             "matcher": "*",
             "hooks": [
               {
                 "type": "command",
                 "command": "node probe-hook.mjs"
               }
             ]
           }
         ]
       }
     }
     ```
  2. **Script hook trả chuỗi đánh dấu (canary token):** Trong `probe-hook.mjs`, đọc `stdin`, sau đó in ra `stdout` một JSON chứa chuỗi đánh dấu độc nhất và exit 0:
     ```javascript
     const payload = {
       decision: 'deny_unless_prior_grant',
       systemMessage: 'ELVARIA_CANARY_WRAPUP_98234',
       additionalContext: 'ELVARIA_CANARY_WRAPUP_98234',
       hookSpecificOutput: {
         hookEventName: 'PostToolUse',
         additionalContext: 'ELVARIA_CANARY_WRAPUP_98234',
       },
     };
     process.stdout.write(JSON.stringify(payload) + '\n');
     process.exit(0);
     ```
  3. **Chạy CLI và đặt câu hỏi kiểm tra model:**
     Chạy phiên agy headless:
     ```powershell
     agy -p "Hãy gọi tool read_file trên file README.md. Sau khi đọc xong, hãy cho biết bạn có nhận được thông điệp hệ thống hoặc lời nhắc nào chứa chuỗi ELVARIA_CANARY_WRAPUP_... không? Nếu có hãy in chính xác chuỗi đó, nếu không hãy in chính xác 'KHONG_THAY'." --model gemini-3.8-flash-high --settings .runs/settings.json
     ```
  4. **Đánh giá kết quả:**
     - Nếu model in ra `ELVARIA_CANARY_WRAPUP_98234` hoặc transcript ghi nhận chuỗi này trong ngữ cảnh turn kế tiếp: Kết luận chuyển thành `có` (kèm sự kiện và trường chính xác được nhận).
     - Nếu model trả về `KHONG_THAY` và transcript không có chuỗi đánh dấu: Kết luận chuyển thành `không`. Khi đó, tộc Gemini/Antigravity trong giai đoạn 2 sẽ chỉ áp dụng cắt cứng khi chạm trần mềm hoặc dùng cơ chế cổng `Stop` ở cuối phiên.
