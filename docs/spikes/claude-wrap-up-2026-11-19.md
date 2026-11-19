# Spike lời nhắc trần mềm của Claude Code — 2026-11-19 (PS-28d)

Spike này trả lời câu (f) của [kế hoạch Thể lực](../plans/session-stamina.md): lời nhắc ở trần mềm có tới được một phiên Claude Code không. Phép đo có hai bước. Bước 1 hỏi chuỗi mà hook `PostToolUse` trả trong `hookSpecificOutput.additionalContext` có tới model không. Bước 2 hỏi lời nhắc thật của hook Elvaria có làm phiên thu dọn và kết thúc không. Kế hoạch của spike là mục "PS-28d" của file kế hoạch đó.

Dữ kiện ở đây đúng với **Claude Code 2.1.327**. Bản cli-facts đi kèm là [cli-facts 2026-11-19](../reference/cli-facts-2026-11-19.md) §1.4. Khi phiên bản đổi, chạy lại các mục có dấu ⚑ trước khi tin.

## Điều kiện chạy

| Thứ | Giá trị |
|---|---|
| Ngày | 2026-11-19, 10:30–10:33 (giờ máy, UTC+7) |
| CLI | Claude Code **2.1.327**, `~/.vscode/extensions/anthropic.claude-code-2.1.327-win32-x64/resources/native-binary/claude.exe`; `--version` in `2.1.327 (Claude Code)`, dòng `system/init` của stream ghi `claude_code_version: "2.1.327"` |
| Tài khoản | claude.ai, như tộc `claude` của vương quốc (`auth: login`, không khai `config_dir`), nên không đặt `CLAUDE_CONFIG_DIR` |
| Máy | Windows 11 (máy thứ hai), Node v24.22.1, git 2.56.0.windows.4 |
| Nơi thử | `%TEMP%\elvaria ps-28d canary`, ngoài repo và ngoài mọi vương quốc, nên CLAUDE.md và `.claude/` của repo không nạp vào phiên. Không có Nhiếp chính, không chạm `my-kingdom` |
| Cách spawn | Như runner: Node `spawn(claude.exe, argv, { shell: false })`, prompt qua stdin, cwd là plot. Env là `minimalEnv` của `runner-core` cộng `CLAUDE_ENV` và hai biến timeout Bash của `runner-claude/src/run-files.ts`; bước 2 thêm `ELVARIA_*`. Không truyền `process.env` nguyên khối. Chỉ đọc stdout stream-json của lần chạy, không đọc transcript, không đọc hay ghi `~/.claude/` |
| Model | Bước 1: `claude-sonnet-5-5`, model rẻ nhất vương quốc chạy cho tộc claude và là model `tribe check` chọn. Bước 2: `claude-opus-5-5`, model mà nhân vật tộc claude dùng nhiều nhất (112 lần `agent.session.start` của opus, 74 của sonnet) |
| Token | Ba lần `claude -p`, tổng **14 356** token theo `countedTokens` (trần 30 000, mốc dừng 25 000); `total_cost_usd` cộng lại 0,104 USD (giá list) |

Argv của bước 1, dựng theo `sessionArgv` của `runner-claude/src/argv.ts` (request không có `--max-budget-usd`, `--json-schema` hay `--agents`):

```text
-p --output-format stream-json --verbose --include-hook-events --permission-mode dontAsk
--settings <run>\settings.json --model claude-sonnet-5-5 --max-turns 3 --session-id <uuid>
--append-system-prompt-file <run>\system.md --tools Read --setting-sources project,local --strict-mcp-config
```

Bước 2 dùng cùng argv, chỉ khác ba chỗ: `--model claude-opus-5-5`, `--max-turns 6` và `--tools Read,Edit,Write,Bash`.

## Tóm tắt

| Câu hỏi | Kết quả | Hệ quả |
|---|---|---|
| Bước 1: chuỗi `additionalContext` của `PostToolUse` có tới model không? | ⚑ **`có`**, hai lần trên hai. Model chép lại nguyên văn chuỗi ngẫu nhiên mà hook sinh ra lúc chạy | Dòng `claude` của `ROUTES` (`packages/hooks/src/wrap-up.ts`) đúng; không cần chuyển sang đường từ chối `PreToolUse` như agy và Codex |
| Bước 2: lời nhắc thật có làm phiên thu dọn và kết thúc không? | ⚑ **`có`** cho phần ngừng việc mới, viết `handover.md` và kết thúc: phiên opus làm vậy trong hai lượt sau lời nhắc. Phần commit **chưa đo**, vì lúc đó phiên chưa có gì để commit | Theo kế hoạch, `có` ở cả hai bước thì không đổi gì. Phần commit chờ dấu vết tự nhiên (bảng "Sau lời nhắc" của PS-28c) |
| Stream có cho runner thấy lời nhắc đã tới model không? | Không. Chuỗi chỉ nằm trong dòng `hook_response`, tức là phần CLI nhận từ hook | Muốn biết lời nhắc đã được trao thì đọc biên nhận `hook/wrap-up-reminded/<session>.json`, như mục (f) đã nói |

## Bước 1: chuỗi canary

**Dựng.** Plot là thư mục `step1 plot` có một file `note.txt` hai câu. `settings.json` của lần chạy theo hình dạng `settingsOf` (`runner-claude/src/settings.ts`): `defaultMode: dontAsk`, allow `Read(./**)`, `autoMemoryEnabled: false`, tắt attribution, env của phiên. Settings chỉ khai một hook, `PostToolUse`, dạng exec (`command` là Node tuyệt đối, `args` là script và thư mục của lần chạy, `timeout: 5`). Script in đúng JSON của đường Claude:

```js
// canary-hook.mjs (rút gọn): rút chuỗi ở lời gọi PostToolUse đầu tiên và cất nó trong thư mục của lần chạy,
// ngoài plot, nên chuỗi không nằm trong prompt, file hay tên file nào mà phiên thấy được.
if (event === 'PostToolUse') {
  const canary = `ctx-${randomBytes(8).toString('hex')}`;
  writeFileSync(path.join(runDir, 'canary.txt'), `${canary}\n`, { flag: 'wx' }); // chỉ lần đầu
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: canary } })}\n`);
}
```

Phiên chỉ có tool `Read`, và luật allow chỉ mở `./**`, nên nó không đọc được `canary.txt`. System prompt (`--append-system-prompt-file`) là một câu: "You are a session in a test of a tool setup. Follow the user's instructions exactly." Prompt trên stdin:

> Use the Read tool once to read the file note.txt in the current directory. Then answer one question: after that Read call, did you receive any text that is neither this message nor the content of note.txt, such as a system reminder or context added by a hook? If yes, copy each such text verbatim and in full, and write nothing else. If no, reply with exactly NONE.

**Kết quả.** Luật kết luận của kế hoạch: `có` khi câu trả lời chứa chuỗi canary, `không` khi câu trả lời là `NONE`.

| Lần | Chuỗi hook sinh ra | Câu trả lời của model | Lượt | Token | Kết luận |
|---|---|---|---|---|---|
| 1 | `ctx-1ff6805d0a2fa3dc` | `PostToolUse:Read hook additional context: ctx-1ff6805d0a2fa3dc` | 2 | 2 798 | `có` |
| 2 | `ctx-a1327e318560a522` | `PostToolUse:Read hook additional context: ctx-a1327e318560a522` | 2 | 1 095 | `có` |

**Trích đoạn stream của lần 1** (định dạng lại, rút gọn):

```json
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"…\\step1 plot\\note.txt"}}]}}
{"type":"system","subtype":"hook_response","hook_name":"PostToolUse:Read","hook_event":"PostToolUse",
 "stdout":"{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"ctx-1ff6805d0a2fa3dc\"}}\n",
 "exit_code":0,"outcome":"success"}
{"type":"user","message":{"content":[{"type":"tool_result","content":"1\tThe old mill stands where the river bends north. …"}]}}
{"type":"assistant","message":{"content":[{"type":"text","text":"PostToolUse:Read hook additional context: ctx-1ff6805d0a2fa3dc"}]}}
{"type":"result","subtype":"success","num_turns":2,"result":"PostToolUse:Read hook additional context: ctx-1ff6805d0a2fa3dc"}
```

Chuỗi canary xuất hiện ở đúng hai chỗ: dòng `hook_response` và câu trả lời của model. `tool_result` của dòng `user` chỉ có nội dung file. Model gọi đoạn chữ đó là "PostToolUse:Read hook additional context", tức là CLI gắn nhãn theo tên hook rồi mới đưa vào ngữ cảnh.

## Bước 2: lời nhắc thật của hook Elvaria

**Dựng.** Bước này chạy vì bước 1 là `có`.

- Plot là repo git tí hon trên nhánh `main`, có năm ghi chú `a.txt` tới `e.txt` (mỗi file ba hay bốn câu) và `.gitattributes`, một commit `notes`. Repo có `user.name` và `user.email` riêng để phiên commit được.
- Thư mục `kingdom` là một vương quốc giả chỉ có những gì hook cần. Thư bàn giao `quests/q_20261119_wrap01/handover.md` là mẫu của `runner-core/prompts/handover.md`. Thư mục của lượt `.runs/q_20261119_wrap01-1/` có `policy.json` v1 (vai `assignee`, `kingdom`, `quest`, `attempt: 1`, nhân vật `tamsin`, model, `tz`, `tools`, luật lãnh thổ rỗng, `cli_protected_paths`), `settings.json`, `system.md` và `wrap-up.json`. Không có `kingdom.json` và không có Nhiếp chính. Id quest phải có dạng `QUEST_ID_SHAPE`; với id sai dạng hook bỏ `quest`, nên cổng Stop và journal tắt.
- `wrap-up.json` có sẵn trước khi phiên mở, như kế hoạch nói: `{"version": 1, "measure": "tokens", "used": 255000, "limit": 300000, "pct": 85}`.
- Hook là hook thật: `hookCommand(policyFile)` của `packages/hooks/src/index.ts` (`node --conditions=elvaria-dist <worktree>/packages/hooks/dist/elvaria-hook.js --policy <run>/policy.json`), trên bản build của worktree `feat/ps-28d` ở `01c474a` (code giống `f02e9a1`), dựng bằng `pnpm --filter @elvaria/hooks build`. Settings khai đủ 12 sự kiện như `settingsOf`; handler của `PreToolUse` có thêm `--event PreToolUse` và `onFailure: "block"`.
- Luật allow là luật của nghề `knight` bỏ học đồ và lệnh `pnpm` (lãnh thổ không có package): `Read(./**)`, `Edit(./**)`, `Write(./**)`, `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git add:*)`, `Bash(git commit:*)`, cộng ba luật của thư bàn giao (`letterRules`). Luật deny là `Bash(git push:*)` và `WebFetch`.
- System prompt là bản rút gọn của prompt người làm. Nó giữ luật 1 (chỉ làm trong plot, commit từng bước nhỏ) và luật 5 (giữ thư bàn giao đúng, viết trước khi xong) của `runner-core/prompts/assignee.md`, cùng mẫu thư. Prompt trên stdin:

> \# Quest q_20261119_wrap01 «Summaries of five notes»
>
> Read the five notes in your plot one at a time, in this order: a.txt, b.txt, c.txt, d.txt, e.txt. After you read a note, and before you read the next one, add a two-sentence summary of it to summaries.md, one section per note.
>
> Done when: summaries.md has a summary of each of the five notes, committed.

**Diễn biến** (giờ từ sổ sự kiện mà hook ghi vào vương quốc giả, và giờ sửa của file biên nhận):

| Giờ | Việc |
|---|---|
| 10:32:20 | `agent.session.start`, hook `SessionStart:startup` ghi `handover-start.json` |
| 10:32:24 | Lời gọi 1, Bash: `cd "<plot>" && ls -la && git log --oneline && cat "../kingdom/quests/q_20261119_wrap01/handover.md"`. Phiên xem plot và thư trước, chưa đọc ghi chú nào |
| 10:32:25 | Hook `PostToolUse:Bash` trả lời nhắc và ghi `hook/wrap-up-reminded/fa80ddb5-77b2-4115-9582-b9a5f3fc13ea.json` |
| — | Model viết: "The session's hook says the token budget is 85% used and no new work should start, so I'll write the handover letter now and stop." |
| 10:32:33 | Lời gọi 2, Write `handover.md` |
| — | Câu trả lời cuối; hook `Stop` trả rỗng (thư đã đổi), phiên kết thúc: `subtype: success`, `stop_reason: end_turn`, 3 lượt, 16,7 giây |

**Trích đoạn stream** (định dạng lại, rút gọn):

```json
{"type":"system","subtype":"hook_response","hook_name":"PostToolUse:Bash","hook_event":"PostToolUse","exit_code":0,
 "stdout":"{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"Elvaria: this session has used 85% of its tokens limit (255000 of 300000). Start no new work. Commit what you have, write the handover letter (Where I am / Done / Not done / Next step), then end the session.\"}}\n"}
{"type":"assistant","message":{"content":[{"type":"text","text":"The session's hook says the token budget is 85% used and no new work should start, so I'll write the handover letter now and stop."}]}}
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"…\\kingdom\\quests\\q_20261119_wrap01\\handover.md","content":"# Handover · q_20261119_wrap01\n\n## Where I am\n\nNo summaries written yet. The session stopped right after orientation because the Elvaria hook reported 85% of the token budget used (255000 of 300000) and said to start no new work. …"}}]}}
{"type":"system","subtype":"hook_response","hook_name":"Stop","exit_code":0,"stdout":""}
{"type":"result","subtype":"success","num_turns":3,"stop_reason":"end_turn","result":"I haven't done the quest yet: no summaries are written and nothing is committed. Right after my first command, the session's hook said 85% of the token budget was already used (255,000 of 300,000) and told me to start no new work, write the handover letter and stop. That reading looked wrong, since I had only run one command, but I followed it. …"}
```

**Sau phiên.** `git log` của plot chỉ có `a279b06 notes`, cây làm việc sạch, không có `summaries.md`. Thư bàn giao đủ các mục của mẫu. Mục "Next step" bảo phiên sau đọc `a.txt` và đi tiếp theo thứ tự. Mục "Decisions taken" ghi phiên dừng vì lời nhắc, dù con số 85 % trông lạ với một phiên mới gọi một lệnh.

**Kết luận.** `có` cho câu "phiên có ngừng nhận việc mới, viết `handover.md` rồi kết thúc trong vài lượt không". Phiên không đọc ghi chú nào sau lời nhắc, viết thư ở lượt kế tiếp và kết thúc ở lượt sau đó. Phần "commit" chưa đo được. Lúc nhận lời nhắc phiên chưa có thay đổi nào, và phiên đã tự kiểm `git log` cùng cây làm việc trước khi nói "nothing is committed".

## Token

Số đếm như Elvaria đếm (`countedTokens` của `packages/domain/src/breaker/tokens.ts`): input, output và cache write tính đủ, cache read tính một phần mười. Số lấy từ dòng `result` cuối của từng lần. `usage` và `modelUsage` cho cùng một số, vì mỗi phiên chỉ có một model.

| Lần | Model | Input | Output | Cache write | Cache read | Token đếm | `total_cost_usd` |
|---|---|---|---|---|---|---|---|
| Bước 1, lần 1 | `claude-sonnet-5-5` | 4 | 221 | 2 050 | 5 230 | 2 798 | 0,0109 |
| Bước 1, lần 2 | `claude-sonnet-5-5` | 4 | 208 | 172 | 7 102 | 1 095 | 0,0035 |
| Bước 2 | `claude-opus-5-5` | 6 | 1 182 | 7 933 | 13 412 | 10 463 | 0,0898 |
| **Tổng** | | | | | | **14 356** | 0,104 |

Ước lượng trước bước 2 là 18 000 tới 21 000 token với `--max-turns 6`, nếu phiên làm tiếp tới khi bị cắt. Phiên thu dọn sớm nên chỉ tốn 10 463. CLI ghi cache theo loại một giờ (`cache_creation.ephemeral_1h_input_tokens`), nên lần 2 của bước 1 đọc lại gần hết ngữ cảnh của lần 1.

## Giới hạn

- `wrap-up.json` có sẵn từ đầu, như kế hoạch dựng, nên lời nhắc tới sau lời gọi tool đầu tiên, lúc phiên chưa làm gì. Spike vì vậy không thấy được phiên có commit việc dở không. Nó cũng không thấy phiên làm gì khi lời nhắc tới giữa một việc dài, với ngữ cảnh hàng trăm nghìn token như các phiên thật bị cắt ở lần (J).
- Phiên thấy con số 85 % là lạ nhưng vẫn làm theo. Ở phiên thật, lời nhắc tới sau khi phiên đã tiêu đúng số đó, nên sự ngờ vực này không có [suy].
- Bước 2 chạy một lần, trên một model. Prompt là bản rút gọn: không có luật về memo, về check của lãnh thổ hay về câu hỏi cho chủ nhân. Nghề không có `Glob`, `Grep` hay học đồ.
- Chỉ đo trên Windows. Đường nhắc là cùng một JSON trên mọi hệ điều hành [suy].

## Quan sát thêm

Lệnh ghép chỉ đọc ở lời gọi 1 (`cd`, `ls -la`, `git log --oneline`, `cat` một file ngoài plot) chạy dưới `dontAsk` dù không có luật allow cho `ls`, `git log` hay `cat`, và dòng `result` không có `permission_denials`. [cli-facts 2026-11-16](../reference/cli-facts-2026-11-16.md) §1.1 nói từ 2.1.325 lệnh ghép bị từ chối (theo changelog). Một lần chạy chưa đủ để sửa câu đó, nên nó nằm ở mục "Chưa kiểm" của [cli-facts 2026-11-19](../reference/cli-facts-2026-11-19.md).

## Chạy lại

Hai script Node nằm ở thư mục tạm, không giữ trong repo. `canary-hook.mjs` là hook của bước 1 (phần chính ở trên). `run.mjs` dựng lại bằng tay argv của `sessionArgv`, settings của `settingsOf`, env của `minimalEnv`, `CLAUDE_ENV` và `bashTimeoutEnv`, cùng lệnh hook của `hookCommand()`. Script không import được các package đó từ ngoài workspace khi không build. Nó ghi `argv.json`, `prompt.md`, `stdout.jsonl` và `stderr.txt` vào thư mục của từng lần chạy, cộng token vào một sổ, và từ chối mở phiên mới khi sổ đã tới 25 000. Muốn chạy lại thì dựng lại hai script từ mô tả này.
