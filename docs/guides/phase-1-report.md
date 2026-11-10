# Báo cáo giai đoạn 1 (P1-16)

Lần chạy kiểm chứng mốc giai đoạn 1, ngày 2026-11-08, trên Windows 11, với vương quốc thật của chủ nhân (8 nhân vật, hai tộc), Quản sự chạy từ `dist` của `main` (checkout chính ở `dc643d6`, code giống `0c3c7a8`), Claude Code 2.1.319 và Antigravity CLI 1.5.3. Mười quest của [kế hoạch sản phẩm](../ke-hoach-dung-elvaria-0.8.md) §13 chạy trên lãnh thổ dc1-se-team, thêm hai quest dogfood trên lãnh thổ Elvaria, một quest thêm trên dc1 và lần cố tình hết mana tộc Gemini. Cách chạy một quest từ đầu: [first-quest.md](first-quest.md). Bảng ba bậc sinh từ event log: [tier-report.md](../tier-report.md).

## 1. Kết quả theo mốc

| Điều kiện của mốc | Kết quả |
|---|---|
| 10/10 (+2) quest đi hết vòng, chỉ cần dấu vua | Đi hết vòng: 10 quest của kế hoạch (#5 thay bằng #5′), 2 quest dogfood, quest thêm trên dc1, 2 quest con thêm của #8 và quest của nhân vật thử đều tới dấu vua và vào `main` (§3). "Chỉ cần dấu vua" thì không đạt (§5) |
| Một lần cố tình hết mana tộc Gemini rồi hồi sinh, quest tiếp đúng chỗ | Đạt: cạn lúc 08:07:42, quest của nhân vật thử vào `paused_mana` và giữ người, nhân vật Argon vẫn nhận việc; Quản sự đánh thức pool lúc 13:09:18, phiên mới làm tiếp đúng chỗ từ thư bàn giao, người chấm khác họ cho pass lúc 13:13 (§4) |
| ≥ 2 quest hoàn toàn bậc script (mana 0) | Đạt: #4 `link-check` và #10 `run-check`, cả hai `done`, 0 token |

"Chỉ cần dấu vua" **không** đạt theo nghĩa chặt: lần chạy cần chủ nhân can thiệp ở các chỗ ghi trong §5 (hạ hạng quest, nâng trần token, sửa lệnh check `format`, sinh lại một file sinh thay hiệp sĩ, gán lại một quest, trả lời hai câu hỏi). Mỗi chỗ là một lỗ hổng có đề xuất sửa (§6); sau khi vá trên dữ liệu vương quốc, các quest còn lại tự đi hết vòng.

## 2. Chuẩn bị

- Build `dist` của hook và CLI ở checkout chính; `elvaria doctor` xanh; đăng nhập Claude còn hạn tới 2026-11-15.
- `registry/scripts.json` của vương quốc (tạo trước P1-17) thêm `follow_up` từ registry mặc định.
- `main` của dc1 chạy thử đủ các bước CI trên một bản sao (0 mana): install 16 s, build `@dc1/shared` 4 s, lint 44 s, format 6 s, typecheck 11 s, test 14 s, i18n 2 s, đều xanh. Không có `dist` của shared thì `lint`, `typecheck`, `test` đều đỏ, vì `@dc1/shared` chỉ xuất `dist/`; vì vậy quest #10 chạy check `check` (`pnpm check`, build trước) thay cho ba check rời.
- Quest #5 của P1-11 (`q_20261107_tbz2mb`) đã được dấu vua và merge vào dc1 (`805747e`), nên #5 thay bằng một quest Kiến tạo nhỏ khác: `pnpm test:hooks`.
- Người dùng cho phép: chạy cả 12 quest; lần hết mana sớm, song song; `max_concurrent` của dc1 và của tộc gemini tạm nâng từ 1 lên 2 (bản cũ ở `.backup/` của vương quốc).

## 3. Các quest

Thời gian là từ phiên đầu tới phiên cuối của quest. Thước đo chi phí là token và % hạn mức gói, vì chủ nhân dùng gói Claude Max (hạn mức 5 giờ và tuần) và gói Antigravity (nhóm 5 giờ và tuần, trần tuần Argon), không trả theo USD. Token là tổng `attempt_log[].tokens`: với Claude gồm cả token đọc cache (cách Claude Code tính hạn mức, §5.2), với agy là `total_tokens` (không gồm cache).

| # | Quest | Bậc | Người làm → người chấm | Lượt | Thời gian | Token | Phán quyết | Kết quả |
|---|---|---|---|---|---|---|---|---|
| 4 | link-check `README.md`, `CLAUDE.md`, `docs/**/*.md` (`q_20261108_8818y5`) | script | — | 1 | 3 s (plot 12 s) | 0 | máy: 11/11 link sống | done |
| 10 | Trừ tà: `pnpm check` trên `main` (`q_20261108_n7a6be`) | script | — | 1 | 73,5 s | 0 | máy: pass, lãnh thổ sạch | done |
| 5′ | `pnpm test:hooks`, vào `pnpm check` và CI (`q_20261108_g9h28z`) | phiên | thorn (Sonnet) → ilse (Argon high) | 1 | 4,9 phút | 172k | pass | dấu vua |
| 1 | `docs/testing.md` (`q_20261108_1de08e`) | phiên | quill (Argon) → ilse, vesper (Opus) | 2 | 18,5 phút | 521k | fail (style, check `format` đỏ vì `.agents/`) → pass | dấu vua |
| 2 | 18 ADR: còn hiệu lực, bị thay, mâu thuẫn (`q_20261108_f9smyt`) | phiên | sylva (Argon) → ilse, vesper | 3 | 46,7 phút | 2,61M | fail (wrong_facts) ×2 → pass | dấu vua |
| 3 | Bản đồ test theo module (`q_20261108_82cbcx`) | phiên | orrin (Sonnet) → ilse | 2 | 12,9 phút | 511k | cầu dao token → pass | dấu vua |
| 6 | Chuỗi UI chưa qua `t()` (`q_20261108_3px4ac`) | phiên | thorn → vesper ×3 | 1 | 5,1 phút | 877k | pass (2 phiên người chấm bị cầu dao token cắt) | dấu vua, không đổi file |
| 7 | "What's new" VI/EN (`q_20261108_jhzape`) | phiên | lyra (Sonnet) → vesper | 3 | 24,5 phút | 707k | câu hỏi → fail (style) → pass | dấu vua |
| 8 | Chia việc cập nhật `architecture.md` (`q_20261108_zwvedg`) | phiên | morwen (Opus) → ilse | 2 | 12,5 phút | 598k | cầu dao token → pass | dấu vua, 3 quest con |
| 9 | Quest con d1 của #8 (`q_20261108_agexz8`) | phiên | quill → vesper | 1 | 7,8 phút | 437k | pass | dấu vua |
| — | Quest con d2 của #8 (`q_20261108_czqqp6`) | phiên | quill → vesper | 1 | 6,6 phút | 324k | pass | dấu vua |
| — | Quest con d3 của #8 (`q_20261108_2yhyv1`) | — | — | 0 | — | 0 | — | hủy (giữ Argon, §4) |
| D1 | `scripts/README.md` của Elvaria (`q_20261108_41fbnb`) | phiên | quill → vesper | 2 | 37,5 phút | 932k | fail (check `format` đỏ vì `.agents/`) → pass | dấu vua |
| D2 | Script `todo-scan` vào catalog (`q_20261108_zpvebk`) | phiên | thorn → vesper | 3 | 17,6 phút | 1,77M | fail (tests_fail: `docs/glossary.md` chưa sinh lại) → câu hỏi → pass | dấu vua |
| +dc1 | `.elvaria/**` vào ESLint, `.prettierignore`; pre-push chạy `pnpm check` (`q_20261108_3js8ey`) | phiên | thorn → vesper | 2 | 24 phút | 601k | câu hỏi (không sửa được `.husky/pre-push`) → pass | dấu vua |
| thử | Đối chiếu ADR và README với code (`q_20261108_g9w4r4`) | phiên | ember (Opus high qua agy) → ilse | 2 (cạn mana, hồi sinh) | 6,3 + 1,1 phút (ngủ 5 giờ) | 426k | pass | dấu vua |

**Hạn mức gói.** Claude (tài khoản dùng chung với các phiên phát triển chạy cùng lúc, nên đây là trần trên cho phần của P1-16, theo các dòng `mana.level` Quản sự ghi): phiên 5 giờ 5 % → 22 % từ 07:13 tới lần reset 11:30, tuần 89 % → 92 % từ 07:13 tới 13:06. Antigravity: trần tuần Argon 98,9 % → 39,8 % (khoảng 6–7 % mỗi phiên Argon), nhóm Claude/GPT 5 giờ cạn một lần và tuần mất 58,1 % (lần hết mana 50,6 %, phiên hồi sinh phần còn lại, §4). Tham khảo theo USD: `total_cost_usd` của các phiên Claude còn lưu cộng lại khoảng 8 USD (một phiên người làm Sonnet 0,10–0,15, một phiên người chấm Opus 0,25–0,35, tức người chấm tốn gấp 2–2,5 lần người làm).

**Người chấm khác họ.** 19 phiên người chấm: 10 khác họ, 9 cùng họ khác model. Trong 11 phán quyết pass cuối cùng của quest phiên, 8 khác họ, 3 cùng họ (vesper chấm hiệp sĩ và nhà thơ Claude khi ilse bận). Rủi ro §9.2 "khác tộc hiếm khi khả thi" được đo: khả thi phần lớn thời gian khi tộc Gemini có 2 chỗ, nhưng trần tuần Argon (§4) mới là giới hạn thật.

**Trả bài có ích.** Năm lần fail đều có căn cứ ở đầu ra: trinh sát Argon đoán nội dung 9/18 ADR rồi bịa 5 đường dẫn file (người chấm mở file ra và bắt được); nhà thơ dùng "level" thay cho "mức" trái `docs/i18n-style.md`; hiệp sĩ quên sinh lại `docs/glossary.md`. Một lần người chấm Argon đoán sai nguyên nhân (đổ cho CRLF trong khi log `format` chỉ nêu `.agents/elvaria-hook.mjs`): phán quyết vẫn đúng luật vì check máy đỏ, nhưng lời khuyên cho người làm sai.

**Giao hàng.** Người dùng giao việc merge cho phiên điều khiển: mỗi nhánh đã seal được push từ worktree của quest (pre-push của repo kiểm đúng nhánh đó), mở PR với thư giao hàng của Quản sự làm mô tả, chờ CI xanh (dc1: lint/unit, integration Postgres, e2e, build image; Elvaria: ba OS), rồi merge commit: dc1 #26–#33, Elvaria #47–#49. Hai quest con d1, d2 cùng sửa `docs/architecture.md` từ cùng một gốc nên d2 xung đột ở bảng Modules sau khi d1 vào `main`, gỡ tay (§5.8). Sau merge, `elvaria quest archive` trả worktree: 14 lần, 4–8 s mỗi lần trong nhịp, không còn khung junction (bản sửa của P1-11c chạy đúng). Quest đã hủy giữ worktree như thiết kế; `git worktree remove` để lại khung junction, dọn bằng chính `clearLeftover` của runner-core.

## 4. Lần cố tình hết mana (tộc Gemini, pool `claude_gpt_models`)

| Giờ | Việc |
|---|---|
| 07:05 | `/usage` trước: mọi bucket 100 %, trừ Argon tuần 98,9 %, Gemini tuần 99,8 % (fixture `usage-json-mana-out-before.jsonl`) |
| 07:25 | Triệu hồi `ember` (scout, tộc gemini, `claude-opus-5-5-high`) và tạo quest dài hạng E. Quest bị `sylva` (cùng nghề scout, cấp 1) nhận lúc 07:55; hủy sau 5 s, tạo lại hạng D (không scout cấp 1 nào tự nhận) và `reassign` cho ember (§5.6) |
| 07:36 | Bật `tribes[gemini].pools.claude_gpt_models` |
| 08:01:26 | Ember bắt đầu (cửa sổ 5 giờ mở) |
| 08:02:36 | 70 s: bucket 5 giờ còn 72,8 %, bucket tuần còn 86,3 % |
| 08:07:42 | Lỗi quota thật; Quản sự ghi `mana.exhausted {tribe: gemini, pool: claude_gpt_models}`, quest `paused_mana` giữ ember, ember `sleeping_mana`, commit `chore: wip … (mana)` trước khi dừng |
| 08:10 | `/usage` lúc cạn: `3p-5h` 0 %, reset `06:01:26Z`; `3p-weekly` còn 49,4 % (fixture `usage-json-mana-out-drained.jsonl`) |
| 08:11:03 | Nhân vật Argon (quill) nhận quest con d2 trong lúc pool của ember ngủ |
| 08:22:50 | Quản sự thăm dò pool ngủ sau `probe_interval_minutes`, đọc được giờ reset; lần thăm dò kế ở 13:02:26 |
| 13:01:26 | Giờ reset của cửa sổ 5 giờ |
| 13:09:18 | Quản sự thăm dò, đọc `3p-5h` 0 %: `mana.restored {gemini, claude_gpt_models}`. Trễ 7 phút so với giờ reset; các lần thăm dò không đánh thức được pool không ghi event, nên không biết lần nào đã trượt |
| 13:09:24 | Quest `resumed`, phiên mới của ember (không `--resume`, `resume_after_mana: false`) đọc `handover.md` và journal |
| 13:10:28 | Nộp sau 64 s: giữ nguyên 7 tài liệu đã xong, thêm tóm tắt (2 chỗ lệch thật: ADR 0001 kể 17 package trong khi `boundaries.mjs` có 18 với `runner-codex`; ADR 0002 chưa kể `familyOf`, `poolOf`) và mục Giới hạn (19 ADR, 10 README chưa đối chiếu) |
| 13:13:14 | ilse (Argon high, khác họ) đối chiếu từng trích dẫn với code: pass; dấu vua, PR #49 |
| 13:17 | `/usage` cuối: `3p-weekly` còn 41,9 %, Argon tuần 39,8 % (fixture `usage-json-mana-out-after-reset.jsonl` chụp lúc 13:09:57) |

### 4.1 Số đo

- **Tốc độ cạn.** Một phiên Opus high qua agy làm cạn bucket 5 giờ "Claude and GPT models" trong 6 phút 18 giây (365 s, 130 bước, input 231 644, output 29 627, cache_read 4 115 142; `total_tokens` của agy là 261 271, không gồm cache). Làm cạn trọn bucket 5 giờ tốn khoảng **50 % bucket tuần** của cùng nhóm (tỉ lệ tuần/5 giờ ≈ 0,5 suốt 70 s đầu).
- **Lỗi quota thật** của agy 1.5.3 khác bản tự dựng của P1-12b: stderr `error: Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 4h53m54s.` và `AGY_ERROR: {"short_error": "RESOURCE_EXHAUSTED (code 429): …", "status": "RESOURCE_EXHAUSTED", "error_code": 429, "code_kind": "http", "retryable": true, "error_id": …}`; `result.status: ERROR`, `finished_reason: error`. Parser của P1-12b nhận ra nhờ `status`, quy đúng pool theo model của phiên. Fixture `stream-quota-exhausted.jsonl` + `.stderr.txt` (đầu và cuối của stream thật, đường dẫn máy đã thay).
- **Giờ reset** có trong câu lỗi ("Resets in 4h53m54s") nhưng runner không đọc, nên signal `rate_limit` không mang `resets_at`; Quản sự chờ `probe_interval_minutes` rồi mới biết giờ reset từ `/usage`. Đúng, chỉ chậm một lần thăm dò.
- **Argon tuần** (`gemini-argon-wtu-weekly`) tụt từ 98,9 % lúc 07:05 xuống 46,4 % lúc 08:02, sau khoảng 8 phiên Argon (quill, sylva, ilse), tức 6–7 % mỗi phiên. Pool `gemini_models` tắt tạm lúc 08:02 để giữ phần còn lại (Antigravity trong VS Code của chủ nhân dùng chung tài khoản), mở lại một quest (d2) lúc 08:11, rồi tắt; d3 hủy. Lúc 08:10 Argon tuần còn 44,3 %.

### 4.2 Điều mốc cần thấy

Chỉ quest của nhân vật thử vào `paused_mana` và giữ người; nhân vật Argon (pool `gemini_models`) vẫn nhận việc (quill nhận d2 lúc 08:11:03); lỗi quota quy đúng pool. Sau reset, Quản sự tự đánh thức pool và giao lại quest cho chính ember; phiên mới làm tiếp đúng chỗ thư bàn giao ghi, không làm lại tài liệu nào. Cuối lần thử, pool `claude_gpt_models` tắt lại; Quản sự chưa áp lệnh `suspend`, nên tắt pool là cách duy nhất để ember không nhận việc.

### 4.3 Thu hẹp sau reset

Thư bàn giao của ember ghi đúng đã làm ADR 0001–0003 và README của config, domain, eventlog, store (7/36 tài liệu trong 6 phút). Làm hết phạm vi cần thêm nhiều lần cạn nữa và vét sạch bucket tuần, nên người dùng chọn thu hẹp: trước reset, mô tả quest đổi thành "không đối chiếu thêm, chốt phần đã làm" (`quest edit` trên quest `paused_mana`).

## 5. Lỗi gặp và cách đã vá

### 5.1 Cổng hạng chặn quest của kế hoạch

Dàn nhân vật P1-15 đều cấp 1, nhận tới hạng F (E khi không còn ai cùng nghề). Bảy quest đặt hạng D/C nằm `unclaimable`; hạ về E bằng `quest edit --rank E` (cầu dao dưới B vẫn 45 phút). Hệ quả phụ: hạng E là "vượt trần" của cấp 1, nên mọi quest đó chờ dấu vua, kể cả dạng `analyze` và `plan` vốn `seal_default: false`.

### 5.2 Cầu dao token đếm cả token đọc cache

`usageTokens` của runner-claude cộng `input + output + cache_creation + cache_read`. Mỗi lượt Claude Code đọc lại cả ngữ cảnh đã cache, nên 85–90 % số đếm là `cache_read`, và trần mặc định `context_budget_tokens × mana_multiplier` = 120 000 × 2 = 240 000 cắt một phiên bình thường sau khoảng 10 lần gọi model. Hậu quả: #3 và #8 vào trạm xá; người chấm của #6 bị cắt hai lần liền (mỗi lần cầu dao cắt người chấm, Quản sự mở phiên người chấm mới: một vòng lặp tốn khoảng 0,3 USD mỗi vòng), lần ba kịp phán. P1-11 qua được (163k) chỉ vì phiên ngắn. Vá: nâng trần của các quest đang mở lên 2M, đổi `breakers.mana_multiplier` của vương quốc từ 2 lên 20 (Quản sự đọc lại `kingdom.json` mỗi nhịp, nên áp cả cho quest Quản sự tự mở), rồi `retry` #3 và #8 (ghi tay vào `inbox/`, §5.7). Người dùng chốt giữ 20 cho tới khi sửa cách đếm.

### 5.3 Check `format` đỏ với mọi quest của tộc Gemini

Runner Antigravity sinh `.agents/elvaria-hook.mjs` và `.agents/hooks.json` trong worktree (git bỏ qua nhờ `.git/info/exclude`), nhưng `prettier --check .` chỉ đọc `.gitignore` và `.prettierignore`, nên quét cả file hook đó. D1 và #1 bị trả về chỉ vì vậy (nội dung đạt). Vá: lệnh check `format` của cả hai lãnh thổ thành `pnpm exec prettier --check . !.agents/**`. Người chấm không chạy lại được dạng khác của lệnh đó (danh sách lệnh được phép chỉ có đúng dòng check).

### 5.4 Hiệp sĩ không sinh lại được file sinh

D2 đổi `packages/i18n/src/glossary.json`; hiệp sĩ chỉ được chạy `pnpm docs:gen --check` (từ danh sách check), không được `pnpm docs:gen`, và luật lãnh thổ Elvaria (`forbidden_paths` gồm `docs/glossary.md`) chặn cả lệnh đó khi nó định ghi. Hiệp sĩ hỏi chủ nhân; chủ nhân chạy `pnpm docs:gen` trong plot, commit `3c2f9ea`, trả lời. Cùng luật đó chặn cả **đọc**: ember không đọc được `docs/dependency-graph.md`.

### 5.5 Check và script chạy trong nhịp

| Việc | Thời gian giữ nhịp |
|---|---|
| `link-check` (#4) | 0,1 s script, 12 s dựng plot |
| `run-check` `check` (#10) | 73,5 s |
| check của quest tài liệu trên dc1 (`format`) | 4–8 s |
| check của #5′ trên dc1 (`build`, `format`, `check`) | 90,5 s |
| check của D1 trên Elvaria (`scripts/README.md` khớp `scripts/**`: `typecheck`, `test`) | 130–150 s |
| check của D2 trên Elvaria (đủ 8 check, `test` 108 s, `boundaries` 122 s) | 188 s, 329 s |

Trong lúc đó Quản sự không áp lệnh hộp thư, không nhận phiên kết thúc, không giao việc (lệnh sửa trần của ember chờ hơn 60 s). Một nhịp 5,5 phút là quá lâu cho một vương quốc có hai lãnh thổ chạy song song. Đề xuất §6 (c).

### 5.6 Không giao được quest cho một nhân vật cụ thể

Quest dài dành cho ember bị sylva nhận vì cùng nghề và cùng cấp. `create_quest` không có trường người nhận; `suspend`/`release` còn nằm trong danh sách lệnh Quản sự chưa áp; CLI chưa có `reassign`. Cách đã dùng: quest hạng D (không ai cấp 1 tự nhận), rồi ghi tay lệnh `reassign {quest, character: ember}` vào `inbox/`.

### 5.7 Lệnh của chủ nhân CLI chưa có

`retry` (trạm xá → mở) và `reassign` phải ghi tay thành file `inbox/<ulid>.json`.

### 5.8 Quest con nối tiếp tách nhánh từ `main`

d2 phụ thuộc d1 (`depends_on`) và chờ d1 `done`, nhưng plot của d2 vẫn tách từ `origin/main`, không chứa thay đổi của d1 (chưa merge). Hai nhánh cùng sửa `docs/architecture.md`, nên chủ nhân có thể phải gộp tay khi merge.

### 5.9 Phiên Claude không sửa được hook của git

Quest thêm trên dc1: Claude Code từ chối cả Write lẫn Edit trên `.husky/pre-push` dưới `--permission-mode dontAsk`, dù settings của nhân vật có `Edit(./**)` và `Write(./**)`; mọi file khác của quest sửa được. Hiệp sĩ làm phần còn lại rồi hỏi chủ nhân; chủ nhân sửa file trong plot (`7eac3f2`) và trả lời.

### 5.10 Nhầm của người chạy

`agy -p /usage` gọi từ Git Bash bị đổi thành `C:/Program Files/Git/usage` (bẫy đã ghi ở spike P1-12a): model nhận một prompt lạ, tốn khoảng 10,7k token của pool Gemini một lần. Gọi với `MSYS_NO_PATHCONV=1` thì 0 token.

## 6. Đề xuất (chờ người dùng chốt, §11 của kế hoạch)

Trong 49 phiên của ngày, 19 phiên là làm lại (vượt mức một người làm và một người chấm mỗi quest, không tính lần hồi sinh của nhân vật thử): 12 do hạ tầng, 6 do đầu ra của người làm sai (trinh sát Argon 4, nhà thơ 2), 1 là phiên tiếp sau một câu hỏi chính đáng. Bốn chỗ lãng phí do hạ tầng, xếp trước:

- **(a) File hook `.agents/` trong worktree** (4 phiên làm lại, §5.3): sửa ở sản phẩm, không chỉ vá dữ liệu vương quốc. Runner Antigravity đặt hook ngoài worktree, hoặc gỡ `.agents/` trước khi Quản sự chạy check; nếu agy bắt buộc hook nằm trong worktree, `territory add` ghi `.agents/` vào ignore của lãnh thổ, hay Quản sự loại các file Elvaria sinh ra khỏi check.
- **(b) Cầu dao token** (4 phiên, §5.2): trần mặc định khớp cách Claude Code đếm, ví dụ trần riêng cho `cache_read` hoặc tính `cache_read` theo trọng số, rồi trả `mana_multiplier` về 2; người chấm bị cầu dao cắt không được tự mở lại vô hạn (sau một lần thì vào trạm xá, hoặc để máy chấm).
- **(c) Check và script ra ngoài nhịp** (§5.5, tới 329 s một nhịp): một bước "đang kiểm" chạy nền, nhịp vẫn áp hộp thư và nhận phiên kết thúc.
- **(d) Quyền** (4 phiên, §5.4, §5.9): người làm chạy được máy sinh của lãnh thổ (ví dụ một mục `commands.generate` như `pnpm docs:gen`, `pnpm schemas`, được ghi đúng các file sinh); `forbidden_paths` tách cấm đọc với cấm ghi, để file sinh đọc được; tìm vì sao Claude Code từ chối Write/Edit trên `.husky/pre-push` dưới `dontAsk` và cho phép tường minh nếu lãnh thổ cần.

Các đề xuất khác:

- **(e)** Lệnh của chủ nhân còn thiếu ở CLI: `elvaria quest retry`, `elvaria quest reassign <quest> [--to <nhân vật>]`; Quản sự áp `suspend`/`release` (cần để đình chỉ nhân vật thử); `create_quest` nêu được người nhận (§5.6, §5.7).
- **(f)** Quest có phụ thuộc đã `done` nhưng chưa merge: plot tách từ nhánh của quest phụ thuộc, hoặc chờ merge (§5.8).
- **(g)** Cấp ban đầu theo độ mạnh của model khi triệu hồi (`--level`), hoặc kế hoạch đặt quest hạng E, để dàn nhân vật cấp 1 không chặn quest D/C và không biến mọi quest E thành "vượt trần" chờ dấu vua (§5.1).
- **(h)** Runner Antigravity đọc "Resets in XhYmZs" trong lỗi quota thành `resets_at` của signal, để lần thăm dò đầu đúng giờ reset (§4.1).
- **(i)** Mẫu prompt người chấm: trước khi nêu nguyên nhân một check đỏ, trích đúng dòng lỗi của log check (người chấm Argon đổ cho CRLF trong khi log nêu `.agents/elvaria-hook.mjs`).
- **(j)** Trần tuần Argon khoảng 6–7 % mỗi phiên: P1-22 chia mana theo bucket (trần riêng của Argon) và cảnh báo trước khi chạm; cân nhắc Flash cho thư ký.
- **(k)** Việc sót của D2 (đã merge): mô tả zod của `scripts.json` (`packages/domain/src/schema/registry-entries.ts:152`, sinh ra `docs/schemas/script.schema.json`) và mục "Defaults" của ADR 0016 vẫn kể 5 script mặc định; thêm `todo-scan` (sửa zod rồi `pnpm schemas`; ADR sửa tại chỗ có ghi ngày). Thuộc vùng "đọc trước khi sửa", ngoài phạm vi P1-16 (§8).
- **(l)** Chọn người chấm theo hạng, để chủ nhân quyết sau P1-16: hạng thấp chỉ cần máy kiểm cộng một người chấm rẻ, Opus chỉ từ hạng B, vì một phiên người chấm Opus tốn gấp 2–2,5 lần một phiên người làm Sonnet.

## 7. Ba bậc

Từ [tier-report.md](../tier-report.md) (event log từ lần chạy P1-11 ngày 2026-11-07 tới hết P1-16; 19 quest):

- **Script**: 2 quest (11 %), 2 lần chạy, 0 token, cả hai `done`.
- **Học đồ**: 0 lần gọi. Không nhân vật Claude nào dùng `Agent(apprentice)`, kể cả trên quest đọc nhiều như #2 hay #3; tộc Gemini bị chặn `invoke_subagent`/`define_subagent` như thiết kế (3 lần).
- **Phiên**: 17 quest, 46 lần chạy, 50 phiên, 10,8M token, 638 lượt, 1 504 lời gọi tool.

Tỉ lệ bậc script thấp vì kế hoạch chỉ có hai việc máy làm trọn (#4, #10); hai quest có thể dùng script làm bước đầu (đếm file cho #3, `todo-scan` từ D2 cho một lần khảo sát) vẫn chạy ở bậc phiên vì Tể tướng chưa được dùng để soạn quest trong P1-16.

## 8. Đối chứng: Claude Code làm thẳng

Người dùng cho thêm (chốt trong P1-16): ba quest đã chạy được làm lại bằng một phiên Claude Code thường (`claude -p`, Sonnet 5.5, `--permission-mode acceptEdits`, được chạy `pnpm`, `node`, `git status/diff/log`, `ls`, không được commit hay push), không có prompt, hook hay luật nào của Elvaria (vẫn có `CLAUDE.md` và hook của chính repo, như khi một người dùng Claude Code trong repo đó). Mỗi phiên chạy trong một worktree tạm tách từ đúng commit mà quest đã tách (dc1 `805747e`, Elvaria `dc643d6`), nhận đúng tiêu đề và mô tả của quest. Sau đó check máy của lãnh thổ chạy trên bản làm thẳng, rồi một phiên Opus mới chấm độc lập theo đúng các bước nghi thức của dạng quest (chỉ đọc, kèm kết quả check máy) và liệt kê mọi lỗi. Worktree tạm đã xóa; không commit, không push gì.

| Quest | Bản | Người làm | Thời gian | Token | Lỗi | Chủ nhân can thiệp |
|---|---|---|---|---|---|---|
| #2: 18 ADR | Elvaria | sylva (Argon medium) ×3, người chấm ilse ×1, vesper ×2 | 46,7 phút | 2,61M | người chấm Elvaria bắt: lượt 1 đoán nội dung 9/18 ADR và trích sai; lượt 2 bịa 5 đường dẫn file; lượt 3 pass | 0 |
| #2: 18 ADR | làm thẳng | Sonnet 5.5 | 2,3 phút | 912k (cache_read 822k) | check máy xanh; người chấm độc lập: fail, 8 lỗi (3 sai sự thật, 2 trích sai, 2 thiếu, 1 tiêu chí không nhất quán) | — |
| D1: `scripts/README.md` | Elvaria | quill (Argon medium) ×2, vesper ×2 | 37,5 phút | 932k | người chấm Elvaria: nội dung đạt ngay lượt 1; lượt 2 chỉ vì check `format` đỏ do `.agents/` | khoảng 10 phút (vá check `format`, dùng chung cho mọi quest Gemini) |
| D1: `scripts/README.md` | làm thẳng | Sonnet 5.5 | 1,2 phút | 658k | check máy xanh; người chấm độc lập: fail, 7 lỗi (3 sai sự thật, 1 trích sai, 2 thiếu, 1 tự mâu thuẫn) | — |
| D2: `todo-scan` | Elvaria | thorn (Sonnet 5.5) ×3, vesper ×2 | 17,6 phút | 1,77M | người chấm Elvaria bắt: quên sinh lại `docs/glossary.md`; **bỏ sót**: mô tả zod của `scripts.json` (`registry-entries.ts:152`) vẫn kể 5 script mặc định, còn trong bản đã merge | khoảng 3 phút (chạy `pnpm docs:gen`, commit, trả lời) |
| D2: `todo-scan` | làm thẳng | Sonnet 5.5 | 6,7 phút | 601k | check máy xanh (phiên tự sinh lại `docs/glossary.md`, vì được chạy `pnpm`); người chấm độc lập: fail, 1 lỗi, đúng chỗ mô tả zod mà bản Elvaria cũng bỏ sót | — |

Ba phiên chấm đối chứng (Opus): 2,3–3,3 phút, tổng 3,08M token. Ba phiên làm thẳng: tổng 2,17M token. Hạn mức Claude cho cả phép đối chứng: phiên 5 giờ 3 % → 7 % (gồm cả phiên điều khiển), tuần giữ 92 %. Mọi số token ở đây gồm cả cache, như cách Claude Code tính hạn mức.

**Đọc kết quả.**

- Làm thẳng nhanh hơn 2,6–31 lần về thời gian (thời gian của Elvaria tính từ phiên đầu tới phiên cuối, gồm cả lúc chờ chỗ, chạy check và làm lại) và ít token hơn 1,4–2,9 lần, nhưng cả ba bản đều có lỗi mà check máy không thấy (sai sự thật, trích sai, bỏ sót chỗ phải cập nhật). Không có người chấm thì các lỗi đó vào repo.
- Làm thẳng cộng một phiên chấm Opus (5,25M token cho ba quest) tốn gần bằng ba quest Elvaria (5,31M). Phần tốn thêm của Elvaria chủ yếu là làm lại: do hạ tầng (D1, D2) và do người làm Argon yếu ở việc trích nguồn (#2); bỏ được lãng phí hạ tầng (§6 a–d) thì Elvaria rẻ hơn đúng chừng đó.
- Người chấm của Elvaria không bắt hết lỗi: D2 cho thấy cùng một chỗ sót ở cả hai bản. Phép đối chứng không chấm lại bản cuối của Elvaria bằng người chấm độc lập, nên chỉ cho biết làm thẳng để lọt những gì, không chứng minh bản Elvaria sạch lỗi.
- Hai quest #2 và D1 không cùng model (Elvaria: Argon medium; làm thẳng: Sonnet 5.5), và người chấm đối chứng là một phiên Opus khác với người chấm Elvaria (vesper cũng Opus, ilse là Argon high), nên con số lỗi so được về loại lỗi, không so được tuyệt đối.
