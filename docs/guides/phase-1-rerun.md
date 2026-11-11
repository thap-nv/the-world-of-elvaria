# Chạy lại mốc giai đoạn 1 (P1-50) — bản nháp

> **Nháp, tạm dừng 2026-11-10 22:30.** Bước 1 (đề xuất 10 quest, 0 mana) đã đưa chủ nhân; chủ nhân tạm dừng P1-50 để sửa hạ tầng của Elvaria trước, nên chưa chốt gì, chưa tốn mana, chưa sửa gì trong vương quốc. 2026-11-11 chủ nhân thêm việc (8) của dc1, CI chỉ chạy tay (quest Q11, chạy đầu tiên). File này giữ những gì phiên đầu đã đo và đề xuất, để phiên sau làm tiếp; báo cáo thật của lần chạy (bảng mốc như [báo cáo giai đoạn 1](phase-1-report.md) §1) sẽ thay nó.

Dòng việc: [implementation-plan](../implementation-plan.md) §8 P1-50. Cách chạy một quest: [first-quest.md](first-quest.md).

## 1. Khi làm tiếp

Hạ tầng sẽ đổi, nên mọi thứ dưới đây cần kiểm lại trước khi tốn mana:

1. Nhánh: `git merge origin/main` (không rebase), build lại `dist` của hooks và cli trong worktree `p1-50`, `doctor` từ Git Bash. Phiên đầu chạy trên `d5d68ad` (main có P1-49) + commit mở `923d231`.
2. Đọc lại các dòng §11 mới (thay đổi hạ tầng có thể đổi luật chọn người, mana, prompt Tể tướng, schema).
3. Đo lại mana: `doctor` (đọc log) và `MSYS_NO_PATHCONV=1 agy -p /usage --output-format json` (0 token; thiếu biến này thì Git Bash đổi `/usage` thành đường dẫn và tốn token). Số ở §3 đã cũ; quyết định hết mana (§6) phụ thuộc vào chúng.
4. Vương quốc: so với bản mốc `<kingdom>/.backup/20261110T220805-p1-50-start/` (kingdom.json, territories, characters, temple, registry); nếu hạ tầng đổi schema, chạy `elvaria migrate` và `doctor` trước.
5. dc1: phạm vi 8 việc (§4) đọc trên `origin/main` `4a20d91`; nếu main của dc1 đã đổi, đọc lại các file nêu ở đó.
6. Hỏi lại chủ nhân các quyết định ở §8, rồi mới tới đợt 0.

## 2. Vương quốc lúc tạm dừng

- `D:\Dummy\Tool - Personal\Kingdom of Agents\my-kingdom`: 11 nhân vật (ember đình chỉ), không quest nào mở; tộc claude (Claude Code 2.1.319, `max_concurrent` 2) và gemini (agy 1.5.4, `max_concurrent` 1, pool `claude_gpt_models` tắt); dc1 và elvaria đều `max_concurrent` 1; `max_background` mặc định 2; `context_budget_tokens` 120 000, `mana_multiplier` 2.
- `doctor` xanh: Execution Policy RemoteSigned, chương trình của mọi lệnh lãnh thổ có trên PATH (cần `sh` của Git Bash), kho bảo vật chưa có file.
- Chưa có nhân vật nghề `chancellor` (cần cho `elvaria say`).

## 3. Mana đo lúc 2026-11-10 22:10

| Pool | 5 giờ đã dùng | Tuần đã dùng | Reset tuần (UTC) | Phần một phiên đã đo |
|---|---|---|---|---|
| claude | (log cũ) | 35 % | 2026-11-15 12:59 | tuần 3 % |
| gemini `gemini_models` | 0,4 % | 4,5 % | 2026-11-14 01:52 | tuần 1,97 % |
| gemini `claude_gpt_models` (Opus/Sonnet qua agy) | 0 % | 58,1 % | 2026-11-15 01:01 | tuần 23,35 %, 5 giờ 10,89 % |
| trần riêng Argon | — | 59,3 % | 2026-11-14 01:51 | chưa đo (Quản sự tính 7 %) |
| trần riêng Fable (claude) | — | 0 % | 2026-11-15 13:00 | chưa đo |

Tỉ lệ đo được: với Gemini, bucket 5 giờ và bucket tuần tăng gần 1:1 (log 14:35 → 14:54: +1,84 và +1,97); với Claude/GPT qua agy, cạn trọn 5 giờ tốn khoảng 50 % tuần (P1-16); với Claude Max, bucket 5 giờ lên khoảng 5 điểm mỗi giờ khi chạy đội trên dc1.

Token lịch sử (cách đếm P1-23) để ước lượng: quest lẻ dc1 hạng D/E, người làm Sonnet 75–230k, người chấm Flash 100–275k; phần hạng C 150–320k; hợp đồng của pháp sư Opus 220–380k; đội hạng B của P1-37 khoảng 2,8M.

## 4. Phạm vi 8 việc trên dc1 (đọc code, `origin/main` 4a20d91; việc 8 thêm 2026-11-11)

| # | Việc | Lớp | File chính | Migration | Vùng "đọc trước khi sửa" | Cỡ |
|---|---|---|---|---|---|---|
| 1 | Ô "Việc đã làm" có định dạng | shared, API, web, i18n | `features/journal/JournalEntryDialog.tsx` (input một dòng, `JOURNAL_MAX_LEN` 200), hiện lại ở `JournalList.tsx`, `members/MemberDetail.tsx`, `members/ConfirmDialog.tsx` | có (CHECK 1..200 của `outside_work_entries.text`) | `constants.ts`, `infra/db/**`, `openapi.json` | lớn |
| 2 | Điểm đã xác nhận là điểm cuối | shared, API, web | `scoring/effective-level.ts` (`isPendingConfirmation`: self ≥ 3 và confirmed < self), `confirmations.service.ts` (`pending()`), `results/dto.ts`, `dashboard-model.ts`, `AreaCard.tsx:268` | không (so `assessment_events.at` với `confirmations.created_at`) | `scoring/**` (coverage 100 %), `openapi.json` | vừa |
| 3 | Hover tiêu đề hiện nội dung | web | khoảng 15 chỗ chỉ hiện mã + tên mảng (AssessPage, ReviewRow, charts, ResultsAside, WhatsNewPage, MemberDetail, Heatmap, DashSheet, TeamPage…); nội dung ở `lib/content.ts` (`items`, `note`, `ask`) | không | không | nhỏ–vừa |
| 4 | Leader không cần tự chấm | shared, API, web, i18n | không có gì chặn theo vai hôm nay: redirect `routes/_app/index.tsx`, `AppShell.tsx`, `NoticeBanner.tsx`, `notifications/mentions.ts`, `nudge.ts`, `scoring/period-stats.ts` | không | `permissions.ts` nếu đổi quyền (hạng sàn B) | vừa |
| 5 | Làm tiếp 2 → 5 | shared, API, web, i18n, docs | `FOCUS_MAX` (`constants.ts:28`), trigger `enforce_focus_limit` (`0001_limits_and_grants.sql`, cần migration mới), `focus.controller.ts` (`maxItems` 4 → 7), `whats-new.module.css:274`, chuỗi có số 2 (`vi.json`/`en.json` :115, :636), e2e `member-journey.spec.ts:53-58`; `ban-do-nang-luc-se.md` :14, :152, :154 | có | `constants.ts`, `infra/db/**`, `openapi.json` | nhỏ |
| 6 | "Lịch sử xác nhận" gọn | web | `MemberDetail.tsx:303-369`, `members.module.css:610-684`; e2e `confirmations.spec.ts:274-360` | không | không | nhỏ–vừa |
| 7 | /team: Leader/Sub-leader thấy tên L4+ | web (API tùy chọn), i18n | `team/TeamPage.tsx`, `team-model.ts` (`askWho`), `team-coverage.service.ts`; Leader/Sub-leader đã đọc được mọi mức qua `GET /dashboard` (`team.view`) | không | không (dùng lại `team.view`) | nhỏ–vừa |
| 8 | CI chỉ chạy tay | infra, docs | `.github/workflows/ci.yml` (hôm nay `on: push` vào `main` và `pull_request`; 4 job `checks` có `audit`, `integration`, `e2e`, `docker`); README "Kiểm tra trước khi push" (câu "CI chạy đủ…") và "Deploy"; `docs/runbook.md` "Deploy an update"; `docs/deploy-ubuntu.md` §9; `CLAUDE.md` (convention test, Definition of done); ADR 0003 ("coverage … is a CI gate") và 0004 ("fail CI") | không | không | nhỏ |

Chung: CSP `style-src 'self'` (`infra/docker/nginx/security-headers.conf`), không style inline trong HTML chèn vào; mọi lỗi console làm e2e đỏ; ngân sách JS 250 KB gzip; repo chưa có editor, markdown hay sanitizer. Việc 1, 2, 4, 5, 7 đổi một ADR đã ghi của dc1 (0011; 0013/0018; 0016/0017; 0005/0013; 0009).

## 5. Đề xuất 11 quest (Q11 đã chốt, các quest khác chưa)

| # | Lãnh thổ | Việc | Dạng | Hạng dự kiến | Tộc người làm | Mana ước lượng |
|---|---|---|---|---|---|---|
| Q11 | dc1 | (8) CI chỉ chạy tay (thêm 2026-11-11); **chạy đầu tiên**, trước mọi quest khác | build, tag `infra` + `docs` | E | claude hoặc gemini (kael) | 0,15–0,3M; chỉ check `format` (file `.yml`, `.md`) |
| Q1 | dc1 | (1) ô có định dạng | build (Tể tướng có thể tách) | C | claude | 1,5–2,5M; check integration |
| Q2 | dc1 | (2) điểm cuối — **đội**: hợp đồng, phần shared+API, phần web, ghép | plan + build | C (B ⇒ Khảo hạch mù) | morwen (claude) + phần thorn/kael | 1,5–2,5M |
| Q3 | dc1 | (3) hover | build | D | claude hoặc gemini | 0,3–0,5M |
| Q4 | dc1 | (4) Leader không bị nhắc chấm | build | C | claude | 0,5–0,9M |
| Q5 | dc1 | (5) làm tiếp 5 | build | D | claude | 0,3–0,6M; check integration |
| Q6 | dc1 | (6) lịch sử xác nhận | build | E | claude hoặc gemini | 0,25–0,45M |
| Q7 | dc1 | (7) tên L4+ trên /team | build | C | claude | 0,4–0,7M |
| Q8 | dc1 | **Tài liệu**: `docs/testing.md` mục "E2E: lỗi hay gặp" (CSP, WebKit và `<select>`, 320/390 px, `expectNoRawKeys`, chạy một file e2e) | document | E | **gemini** (quill) → người chấm claude | 0,2–0,35M |
| Q9 | elvaria | **Bậc script**: `todo-scan` trên `packages/*/src`, `apps/*/src`, `scripts` | analyze | F | — | 0 |
| Q10 | elvaria | **Nghiên cứu** (quest của lần hết mana): dữ kiện nào của [cli-facts](../reference/cli-facts-2026-11-06.md) đã lỗi thời so với hai spike, §3, §11; đầu vào cho P1-51 | research | D | **gemini**: ember (Opus high qua agy), `reassign --to ember`; người chấm ilse | 0,4–1M token agy |

Tổng: 6–10M token (Q11 thêm 0,15–0,3M); Claude tuần +10–25 điểm, Gemini tuần +20–35 điểm; dc1 tuần tự (`max_concurrent` 1) khoảng 6–8 giờ, mỗi quest code có e2e 10–12 phút. Không đặt quest tài liệu trên Elvaria vì `docs/**` thuộc P1-51.

Mặc định đề xuất cho lời nói với Tể tướng (một `say` mỗi việc; Tể tướng không có tool, chỉ thấy id lãnh thổ, nên lời nói mang sẵn quyết định của chủ nhân):

- (1) ô "Việc đã làm (một dòng)" của nhật ký ngoài vùng quen, không phải ghi chú của Leader; màu, cỡ là tập class cố định (3 cỡ, 6 màu) vì CSP; lưu markdown rút gọn; hiện lại có định dạng ở ba chỗ; "Dùng làm ghi chú" chép chữ trơn; giới hạn 1000; mục cũ hiện như cũ; ADR sửa 0011. **Chờ chọn**: thanh công cụ tự làm, không thêm thư viện (khuyến nghị), hay editor WYSIWYG (thêm dependency).
- (2) "member sửa lại" = đổi mức hay N/A sau lần xác nhận cuối còn hiệu lực; tới khi xác nhận lại thì điểm cũ vẫn tính; áp cả L5 chờ và nhắc "pending" ở /team, cả xác nhận đã có; kỳ đã đóng giữ luật cũ; ADR sửa 0013/0018.
- (3) `title` gốc của trình duyệt, nội dung "Cần nắm", mọi chỗ chỉ hiện mã + tên mảng.
- (4) không bị nhắc: không redirect /intro, không banner, @mention, nudge "chưa chấm", không tính vào "x/N đã review"; vẫn mở và chấm được; mức đã có vẫn tính (ADR 0017/0018); không sửa `permissions.ts`; ADR mới.
- (5) mọi vai, áp ngay kỳ đang mở, migration mới cho trigger, ADR mới. **Chờ chọn**: có sửa `ban-do-nang-luc-se.md` không.
- (6) mỗi xác nhận một dòng, ghi chú cắt một dòng bấm để mở, 5 dòng mới nhất + "Xem tất cả", dòng đã hoàn tác thu gọn; cả trang và drawer.
- (7) tên người có mức **đã xác nhận** L4+, mọi mảng, không phụ thuộc opt-in, chỉ sao cho L5, member vẫn không nhận tên từ server; ADR sửa 0009.
- (8) lời chủ nhân (2026-11-11): "khi merge code chỉ cần chạy xanh ở local là được. CI chỉ cần chạy khi cần thiết để verify trước khi deploy. Testcase, e2e … vẫn cần update nếu logic hay UI thay đổi". Mặc định: `ci.yml` chỉ còn `workflow_dispatch`, giữ nguyên 4 job, không xóa workflow (chạy tay được trên nhánh bất kỳ); "xanh ở local" là `pnpm check`, thêm `pnpm test:integration`, `pnpm e2e` (hay `e2e:docker`) và lệnh drift openapi/content khi đụng vùng của chúng, theo bảng Change impact; trước mỗi lần deploy chạy CI tay trên `main` và chờ xanh (cả `audit` và build Docker image), ghi vào README "Deploy", runbook "Deploy an update", `deploy-ubuntu.md` §9; `CLAUDE.md` nói rõ CI không chạy ở PR không bớt test: logic hay UI đổi thì unit, integration, e2e đổi theo trong cùng PR; ADR 0003, 0004 sửa tại chỗ (gate chạy ở máy và ở lần CI tay), không ADR mới. **Chủ nhân chốt các mặc định này (2026-11-11).** Branch protection (kiểm 2026-11-11 qua REST API, bằng git credential của chủ nhân, chỉ đọc): repo dc1 private trên gói Free, `main` `protected: false`, `required_status_checks` rỗng; branch protection chi tiết và ruleset cần GitHub Pro cho repo private (API trả 403 "Upgrade to GitHub Pro"), nên không có check bắt buộc nào phải bỏ: CI ở PR xưa nay chỉ để xem, không chặn merge. Sau này, khi dc1 bật `delivery` `pr_merge` (PS-08), `required_checks` của dc1 phải rỗng vì CI không chạy ở PR.

## 6. Lần cố tình hết mana

Lúc đo (§3), không pool nào cạn rồi hồi sinh được trong ngày mà rẻ: Claude/GPT qua agy còn 41,9 % tuần nên đồng hồ tuần đóng sớm ở 88 % trước bucket 5 giờ (phần một phiên 23,35 % bị chặn ở `warn_margin_pct` 10), reset 2026-11-15 08:01 giờ Việt Nam; Gemini 5 giờ ≈ tuần; Claude Max 5 giờ lên chậm và chặn cả chủ nhân; Argon reset 2026-11-14. Ba phương án đưa chủ nhân:

- **(A, khuyến nghị lúc đó)** ngay: bật pool `claude_gpt_models`, `character release ember`, ember làm Q10 bằng 1–2 phiên; thấy đồng hồ tuần đóng sớm rồi lỗi quota, `paused_mana`; hồi sinh sau reset 2026-11-15. Tốn phần tuần còn lại (đằng nào cũng mất khi reset), nhưng chủ nhân mất Claude/GPT trong Antigravity tới hôm đó.
- **(B)** làm cả lần hết mana sau reset 2026-11-15: đồng hồ 5 giờ đóng sớm, hồi sinh sau khoảng 5 giờ (như P1-16); tốn khoảng 50 % tuần mới.
- **(C)** trần riêng Argon: thấy đóng sớm ngay, hồi sinh 2026-11-14; cần tạm đổi một nhân vật sang Argon.

Nếu lần làm tiếp rơi vào sau 2026-11-15, (B) thành lựa chọn tự nhiên.

## 7. Kiểm (c) của P1-49 trên agy thật

Vương quốc thật không có nhân vật Gemini nào được chạy `node`. Đề xuất như P1-46 ([spike Antigravity](../spikes/antigravity-2026-11.md) §15): vương quốc và repo tạm dưới `%TEMP%` (tên có dấu cách), một hiệp sĩ gemini `gemini-3.8-flash-low` có allow `node`, `forbidden_paths: ["infra/secrets/**"]`, quest bảo nó `write_file` `.git/x`, `write_file` file `.git` của worktree, chạy `node write-secret.mjs` (ghi `infra/secrets/key.txt`). Mong đợi: hai lần ghi `.git` bị hook từ chối, quest vào trạm quân y với trip `forbidden_paths`; rồi dọn file và `quest retry` một lần để xem nhân vật có biết đường dẫn nào không ((a) của P1-49) và đọc câu từ chối ghi `.git` thế nào ((b)). 1–2 phiên, khoảng 150k token mỗi phiên.

## 8. Quyết định chờ chủ nhân

1. Tể tướng: claude `claude-opus-5-5` cấp 5 (khuyến nghị), claude `claude-sonnet-5-5` (mặc định registry), hay gemini `gemini-3.8-flash-high`. Lệnh dự kiến: `elvaria character add aurel --class chancellor --tribe claude --model claude-opus-5-5`.
2. Các mặc định ở §5, nhất là editor của (1) và `ban-do-nang-luc-se.md` của (5).
3. Phương án hết mana (§6), và chủ nhân có dùng Claude/GPT trong Antigravity không.
4. Kiểm (c) của P1-49 trong vương quốc tạm (§7).
5. Tạm nâng `max_concurrent` của dc1 và tộc gemini lên 2 trong lần chạy (như P1-16; cho tải thật để đo `max_background`, (c)–(e) của P1-47; cái giá: nhánh song song cùng sửa locale), trả về 1 sau.
6. ~~Q11: các mặc định của (8) ở §5, và `main` của dc1 có bắt check CI trên GitHub không.~~ Đã chốt 2026-11-11: giữ các mặc định; `main` không có check bắt buộc (§5, (8)).

Thứ tự đợt đề xuất (mỗi đợt tốn mana hỏi trước): đợt 0 sửa vương quốc (backup, script, diff, `territory list`, `doctor`); đợt 1 chỉ Q11 (chủ nhân chốt 2026-11-11: quest đầu tiên của P1-50): `say`, chủ nhân đọc nháp rồi `quest confirm`, Quản sự chạy tới dấu vua, chủ nhân merge vào `main` của dc1, để PR của các quest dc1 sau không chạy CI và nhánh của chúng tách từ `main` đã có Q11; cần Tể tướng, nên quyết định 1 ở trên đến trước đợt này; đợt 2 mười lần `say` còn lại, chủ nhân đọc nháp rồi `quest confirm` (sửa nháp bằng `quest edit` ghi là can thiệp); đợt 3 Quản sự với Q3, Q5, Q6, Q8, Q9; đợt 4 Q1, Q2, Q4, Q7; đợt 5 hết mana (Q10); riêng: kiểm (c).

Đo trong lần chạy: tải việc nền và `max_background` ((c), (d), (e) của P1-47), phần một phiên của mỗi cửa sổ và `SESSION_SHARE_DEFAULT_PCT` ((d) của P1-48), token người chấm theo hạng ((a) của P1-48), một dòng `rateLimitType` thật nếu gặp; ghi lại nếu gặp chỗ cho (a), (b) của P1-49.

## 9. Nhật ký lần chạy (từ 2026-11-11)

Làm tiếp sau khi chủ nhân chốt Tể tướng theo khuyến nghị ("oke khuyến nghị, làm tiếp P1-50").

- **Kiểm theo §1.** Nhánh đã có `origin/main` `605195d`; từ `d5d68ad` tới đó `packages/` và `apps/` không đổi (chỉ tài liệu: kế hoạch 0.8, CI tay, giai đoạn 1.5), nên không cần `migrate`; build lại `dist` của hooks và cli. Vương quốc trùng bản mốc `.backup/20261110T220805-p1-50-start/` (kingdom.json, territories, characters, temple, registry). PS-01 đang mở chỉ đọc vương quốc. `origin/main` của dc1 vẫn `4a20d91`.
- **Phiên bản CLI.** `doctor` đỏ một lỗi: extension VS Code tự cập nhật Claude Code 2.1.319 → 2.1.322, file đã ghim không còn; agy 1.5.4 → 1.5.5 (cảnh báo). Đối chiếu changelog: 2.1.321 sửa luật deny cho file mà `cp`/`mv` vào thư mục ghi ra, kiểm quyền Bash xét đúng thư mục khi ghi file, `-p` báo đúng hạn 10 phút của lệnh nền; trên Windows tìm chương trình trên PATH không qua tiến trình phụ và bỏ mục PATH tương đối, UNC; mods không nạp ở `dontAsk`. 2.1.322 chỉ thêm fast mode trên Vertex. agy 1.5.5: `agy -p` không còn treo sau khi in kết quả (tối đa 30 s), hook và `-p` không đổi. Không có gì đổi đường runner, nên `doctor --pin` ghim 2.1.322 và 1.5.5; `doctor` xanh. Luật Bash chặt hơn có thể sinh thêm `agent.tool.blocked`. Tra cứu CLI mới thuộc P1-51.
- **Mana lúc 09:10** (Quản sự đọc): claude tuần 52 % (2026-11-10 15:44 là 35 %), 5 giờ 2 %, trần Fable 14 %; gemini `gemini_models` tuần 4,5 %, 5 giờ 0 %; `claude_gpt_models` tuần 58,14 %, 5 giờ 0 %; Argon 59,32 %.
- **Tể tướng.** `character add aurel --class chancellor --tribe claude --model claude-opus-5-5` (cấp 5).
- **Q11.** `say` với lời nói theo §5 (8) → nháp `q_20261111_4xysc9` sau 13 giây: build, E, knight, tag infra + docs, ước lượng 60k token và 40 phút; mô tả đủ năm ý, thêm điều kiện "Xong khi". Confirm 09:10:00, Quản sự giao thorn (claude Sonnet) 09:10:08, phiên bắt đầu 09:10:19.
- **Phát hiện 1 (Tể tướng, dấu vua).** Nháp đặt `seal_required: false` dù kind `build` có `seal_default: true`: `chancellor.md` không nói gì về dấu vua, nên model tự chọn. Chủ nhân giữ không dấu, không can thiệp; Q11 vì thế không qua dấu vua. Đề xuất: lời nói không nhắc dấu thì nháp lấy `seal_default` của kind (prompt Tể tướng, hoặc `screenDrafts` đặt lại), chỉ tắt khi chủ nhân nói không cần dấu.
- **Q11 xong ở lượt 1, không can thiệp.** thorn 09:10:19–09:11:06 (47 giây, 21 lượt, 52 155 token), một commit `d5f58a0` trên nhánh tách từ `origin/main` `4a20d91`, đúng 7 file của mô tả; check máy chỉ có `format` (5,1 s), xanh. Người chấm ilse (gemini Flash, khác tộc) 09:11:22–09:15:22 (4 phút, 30 lượt, 219 610 token): ngoài đọc diff còn tự chạy `pnpm --filter @dc1/shared build`, `test`, `lint`, `typecheck`, `i18n:check`, test hook và hai lệnh drift, dù diff chỉ là tài liệu và workflow; `verdict.pass`, `quest.done`, `quest.delivered` 09:15:23. Số đo cho (a) của P1-48: ở hạng E, người chấm tốn gấp 4,2 lần người làm, phần lớn là chạy lại check mà máy không đòi.
- **Giao hàng Q11** (chủ nhân giao cho phiên: push, mở PR, merge). Push từ worktree, pre-push của dc1 (`pnpm check`) xanh; PR #38 mở qua REST API bằng git credential của chủ nhân, mô tả là thư giao hàng, `mergeable: clean`, merge commit `4356681` lúc 09:30. Không có lần chạy workflow nào cho PR #38 hay cho lần push vào `main` (lần chạy mới nhất vẫn là `4a20d91` ngày 2026-11-10): CI của dc1 đã thôi tự chạy. `quest archive` → `quest.archived` 09:31:11, worktree gỡ; nhánh giữ lại như các nhánh quest trước (12 trên remote). Đợt 1 xong lúc 09:31, tổng khoảng 270k token (Tể tướng không tính).
