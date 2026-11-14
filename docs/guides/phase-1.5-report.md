# Báo cáo giai đoạn 1.5 (PS-07)

Lần chạy mốc của chặng tự cường, ngày 2026-11-14, trên Windows 11, với vương quốc thật của chủ nhân (`my-kingdom`, 15 nhân vật, ba tộc: Claude Code 2.1.322, Antigravity CLI 1.5.8, Codex 0.169.0-alpha.11.1) và lãnh thổ Elvaria (`code_graph` tắt). Chủ nhân giao một việc bằng một câu `say`; Elvaria tấu trình, lập kế hoạch thành một đội sáu phần, làm, nghiệm thu, ghép, và việc vào `main` qua PR #160 (merge `534b105`, 18:37). Nhiếp chính chạy bằng bản ghim: `c3f267e` cho kế hoạch và phần d1, `db832d6` từ 13:41, `6a142ec` từ 13:57 (hai lần nâng do phiên điều phối giao, sau fix/codex-output-schema và fix/review-no-session). Số đo lấy từ `elvaria metrics --since 2026-11-14` và `elvaria metrics --plan q_20261114_mggach`; bảng sinh lại: [metrics-report.md](../metrics-report.md), [tier-report.md](../tier-report.md). Cách vận hành: [operating-a-kingdom.md](operating-a-kingdom.md).

Câu giao việc (chủ nhân duyệt nguyên văn): lý do trạm quân y và các dòng chi tiết của `elvaria doctor` thành mã cộng tham số, chuỗi VI/EN qua i18n; lý do `breaker:commit` giữ vài dòng lỗi đầu và số lỗi, bản đầy đủ vào một file trong thư mục của lượt chạy; dòng event cũ vẫn đọc được, đổi payload thì có migrate theo `v`.

## 1. Kết quả theo điều kiện xong

| Điều kiện (dòng PS-07 ở §8) | Kết quả |
|---|---|
| Elvaria tấu trình, lập kế hoạch, duyệt, chờ một dấu, rồi làm tới giao hàng | Đạt phần lớn. Tấu trình một lần (4 câu hỏi, chủ nhân "chốt khuyến nghị"); pháp sư morwen viết kế hoạch, hợp đồng `docs/contracts/infirmary-reason-codes.md` và sáu phần; 6/6 phần qua nghiệm thu; Nhiếp chính tự ghép sáu nhánh không conflict, 10 check xanh, người chấm cho đạt. Phần giao hàng không tự đi: nhánh của đội tách từ `c3f267e`, `main` đã có fix/review-no-session, nên phiên PS-07 gỡ 5 conflict và thêm 2 mã lý do bằng tay (§6.5) |
| Chủ nhân chỉ gặp: câu hỏi của tấu trình (một lần), một dấu trên kế hoạch, bản tấu, dấu vua | **Không đạt.** 18 lần chủ nhân phải quyết: 4 điểm chạm dự kiến, 14 ngoài dự kiến (§5). Bản tấu không tới tay trong lần chạy: bản của ngày ghi lúc 11:29 với 0 việc, bản kế là 08:00 hôm sau (lỗ hổng 14) |
| Báo cáo có tỉ lệ đạt lượt đầu, số lần cần chủ nhân, token, file ngoài vùng, số thư `proposal`, so với cách phiên điều phối làm | §3 và §7 |
| Mỗi lỗ hổng là một thư `proposal` hoặc một dòng §11 | 3 thư `proposal` của nhân vật (2 của morwen, 1 của dorian); 27 lỗ hổng ở §6 và trong dòng §11 "PS-07 (…), chỗ thực tế khác kế hoạch, chờ người dùng chốt" ở [11-2026-11-14.md](../implementation-plan/11-2026-11-14.md) |

Đọc nhanh: phần việc thật làm đúng hợp đồng. Mọi phán quyết là đạt, không có lỗi lọt, không lần làm lại nào do đầu ra sai. Chỗ hỏng là hạ tầng quanh phiên: trần token và trần lượt cắt phiên sắp xong (5 lần), luồng thư phản biện đề bài bỏ mất một thư, người chấm của hai tộc không ra được phán quyết, phần của đội đòi dấu từng cái, và nhánh của đội không biết `main` đã đi tiếp. Mỗi chỗ cần chủ nhân một lần.

## 2. Diễn biến

| Giờ | Việc |
|---|---|
| 11:29–11:33 | `say` → Tể tướng aurel tấu trình (4 câu hỏi); chủ nhân chốt khuyến nghị; quest kế hoạch `q_20261114_mggach` (plan, hạng B) |
| 11:33–11:47 | morwen lập kế hoạch (14 phút, 98 lời gọi tool); cầu dao token cắt phiên ở 909 370/900 000, 6 giây sau khi kế hoạch đã commit và thư bàn giao đã viết |
| 11:49–12:27 | Chủ nhân `retry`; phiên phụ 37 giây nộp. Người chấm cassia (Codex) lỗi hai lần trong 1 giây (`--output-schema` từ chối schema phán quyết); chủ nhân đình chỉ cassia, `retry`; người chấm ilse (agy) không mở được phiên (prompt 39 636 ký tự > 32 767 của Windows), Nhiếp chính thử lại mỗi nhịp; chủ nhân đình chỉ ilse; maren chấm đạt |
| 12:28 | Dấu trên kế hoạch: 7 quest (6 phần d1–d6 hạng C/D, quest ghép `q_20261114_42nr8g`) |
| 12:28–12:47 | d1 (refactor, dorian/Codex) đạt lượt đầu |
| 12:48–14:44 | Đội đứng chờ: mọi phần lấy `seal_default` của dạng (`build`, `refactor`) nên d1 chờ dấu vua; chủ nhân đóng dấu d1 và `quest edit --no-seal` d2–d6 |
| 14:45–15:44 | d2 (dorian): cầu dao lượt (200) cắt lúc 14:59; chủ nhân nâng `breakers.max_turns` lên 500, `retry`; phiên 2 thấy phải sửa hai file ngoài vùng, viết thư `amendment` rồi dừng, nhưng hook pre-commit từ chối commit (spec 309 dòng > 300) nên quest vào trạm quân y lần 2 và thư không được lập; chủ nhân nhận đề nghị thay người viết đề, mở vùng |
| 15:44–16:11 | d2 phiên 3 xong, check xanh, vesper chấm đạt |
| 16:11–16:59 | d3 (dorian): thư `amendment` lập đúng luồng, morwen nhận, nhưng `delegation.max_rank` D nên thư lên chủ nhân; chủ nhân nhận, mở vùng; phiên tiếp bị cầu dao token cắt (998 168/840 000) khi đã xong việc và sắp hỏi một câu; chủ nhân trả lời, `retry`; maren chấm đạt |
| 16:59–17:55 | d4 (dorian) đạt lượt đầu; d6 (thorn, Sonnet) bị cắt ở 808 198/800 000, chủ nhân nâng trần lên 1,2M, `retry`, đạt; d5 (brann, Opus) bị cắt ở 525 768/520 000, chủ nhân nâng trần d5 và quest ghép lên 1,2M, `retry`, đạt |
| 17:55–18:03 | Quest ghép: Nhiếp chính ghép sáu nhánh bằng máy (0 phiên), 10 check xanh, vesper chấm đạt |
| 18:11–18:37 | Dấu vua; phiên PS-07 merge `origin/main` vào nhánh quest, gỡ 5 conflict, `pnpm check` xanh, push, PR #160, chủ nhân duyệt merge |

Ba lần dừng Nhiếp chính để hỏi theo mốc (38): trạm quân y lần 2 của kế hoạch (11:50) và của d2 (15:38); mốc Codex 18 % được chủ nhân nâng lên 25 % trước khi chạm (17:3x).

## 3. Số đo

| Số đo | Giá trị |
|---|---|
| Đạt lượt đầu | **2/7 quest (29 %)**: d1 (refactor) và d4 (steward), cả hai của dorian/Codex. Quest ghép không tính (lượt của máy). Theo lượt: lượt 2 đạt 4/5, lượt 3 đạt 1/1 |
| Làm lại | 9 phiên: 8 hạ tầng (6 cầu dao cắt người làm, 2 người chấm Codex lỗi), 1 câu hỏi; **0 do đầu ra** |
| Phán quyết | 10 phiên người chấm có phán quyết, đều đạt; 0 lỗi lọt; dấu vua 3 (kế hoạch, d1, quest ghép) |
| Lần cần chủ nhân (`metrics`) | 18 lệnh trên 7/8 quest: `edit_quest` 11, `reassign` 5, `retry` 2. Ngoài bộ đếm: 2 `character suspend`, 3 dấu, 1 `memo decide`, 2 lần sửa `kingdom.json`/lãnh thổ. Theo quyết định: 18, xem §5 |
| Token (cách Elvaria đếm) | **8 286 607** cho 8 quest: kế hoạch 1 051 861, sáu phần 7 078 033, quest ghép 156 713. Claude đếm cả token đọc cache; Codex đếm token đọc cache một phần mười |
| Ước lượng của pháp sư | 2 750 000 token cho sáu phần; lượt đầu thật 5 015 622 (**182 %**), từng phần 96–345 % |
| Mana (đồng hồ, gồm mọi phiên trên tài khoản) | Claude tuần 34 → 39 %; Claude 5 giờ: cửa sổ 1 +7 %, cửa sổ 2 24 %, cửa sổ 3 5 % lúc 18:03. Codex tuần 3 → 19 %, 5 giờ lên 91 % (cảnh báo 17:36). agy 0,21 % (không phiên agy nào chạy) |
| File ngoài vùng | `metrics` đếm **0** (0 file), vì chủ nhân mở vùng trước khi nộp. So với vùng của kế hoạch: 9 file, đều qua thư `amendment` đã duyệt (d2: `packages/domain/examples/event.json`, `scripts/docs-tier-report.{mjs,spec.ts}`, `scripts/README.md`; d3: `packages/steward/src/sessions/commit{,.spec}.ts`, `packages/runner-core/src/plot/rescue.spec.ts`, `packages/steward/src/{breakers,review}.spec.ts`) |
| Thư | 3 `proposal` (chờ Tể tướng phân loại 07:30 ngày 15/11), 1 `amendment` lập (d3, chủ nhân nhận), 1 `amendment` mất (d2, lỗ hổng 16); 0 cảnh báo "follows no memo" |
| Thời gian | 7 giờ 08 từ `say` (11:29) tới merge (18:37); đội đứng chờ dấu d1 gần 2 giờ; trung vị "Đang làm" 9,9 phút, trạm quân y 11,0 phút |
| Phiên | 25 lượt (24 phiên nhân vật, 1 lượt máy); 13 phiên người làm, cả 13 có sửa file; trung vị 15 lời gọi tool trước lần sửa đầu (22 %); 1 lần học đồ (thorn, 4 giây); 0 lượt hỏi đồ thị (cờ tắt) |
| Cỡ prompt | Người làm: trung vị 20 918 ký tự, lớn nhất 51 134; người chấm: trung vị 36 878, lớn nhất 43 897, trên trần 32 767 mà agy nhận trên Windows |

## 4. Các quest

| Quest | Phần | Người làm (tộc) | Lượt | Đạt lượt đầu | Token | Lệnh chủ nhân | Ghi chú |
|---|---|---|---|---|---|---|---|
| `q_20261114_mggach` | kế hoạch | morwen (Claude Opus) | 5 | không | 1 051 861 | 2 | cầu dao token cắt phiên đã xong; hai người chấm Codex lỗi; ilse không mở được phiên; maren đạt |
| `q_20261114_rbwpcr` | d1 `EVENT_VERSION` | dorian (Codex) | 2 | có | 493 778 | 0 | chờ dấu ~2 giờ (lỗ hổng 9) |
| `q_20261114_b5n3tj` | d2 domain, eventlog v2 | dorian | 4 | không | 1 312 995 | 4 | trần lượt; thư `amendment` mất; trạm quân y lần 2 |
| `q_20261114_4g4vst` | d3 runner-core | dorian | 4 | không | 1 475 419 | 4 | `amendment` lên chủ nhân vì `max_rank`; cầu dao token cắt phiên sắp hỏi |
| `q_20261114_a6d8mm` | d4 steward, sandbox | dorian | 2 | có | 2 136 633 | 1 | một thư `proposal` về sandbox của Codex |
| `q_20261114_rrjpgx` | d5 CLI | brann (Claude Opus) | 3 | không | 708 416 | 3 | cầu dao token ở 101 % trần |
| `q_20261114_b6dxqw` | d6 adapter, doctor | thorn (Claude Sonnet) | 3 | không | 950 792 | 3 | cầu dao token ở 101 % trần |
| `q_20261114_42nr8g` | quest ghép | máy | 2 | — | 156 713 | 1 | ghép 6 nhánh không conflict; conflict với `main` lộ lúc giao hàng |

Người chấm: vesper (Claude Opus) 4 quest, maren (Claude Sonnet) 3. Hai phần của nhân vật Claude (d5, d6) do người chấm cùng họ chấm, vì cassia (Codex) là người chấm khác họ duy nhất còn lại và Codex 5 giờ đã gần cạn (lỗ hổng 26).

## 5. Lần chủ nhân phải quyết

Dự kiến (4): tấu trình (11:33), dấu trên kế hoạch (12:28), dấu vua (18:11), duyệt merge PR #160 (18:37, giao hàng còn là việc của phiên cho tới PS-08).

Ngoài dự kiến (14), theo nguyên nhân:

| Nguyên nhân | Lần | Chi tiết |
|---|---|---|
| Trần cắt phiên đang làm tốt | 6 | `retry` kế hoạch (11:49); `max_turns` 200 → 500 (15:30); `retry` d2 (15:34); trả lời và `retry` d3 (16:49); nâng trần và `retry` d6 (17:29); nâng trần d5 và quest ghép, `retry` d5 (17:43) |
| Người chấm của tộc khác không ra phán quyết | 3 | `suspend cassia` và `retry` kế hoạch (12:09, Codex `--output-schema`); `suspend ilse` (12:26, prompt quá dài cho agy) |
| Thư phản biện đề bài | 2 | nhận `amendment` của d2 thay người viết đề, mở vùng (15:43); quyết `amendment` của d3 lên vì `max_rank`, mở vùng (16:25) |
| Phần của đội đòi dấu | 1 | dấu d1 và `--no-seal` d2–d6 (14:44) |
| Điều khiển lần chạy | 2 | `max_concurrent` 1 → 2 (12:33, chủ nhân tự đề nghị); mốc Codex 18 → 25 % (17:3x) |

Ngoài ra phiên điều phối nâng vương quốc hai lần (13:41, 13:56) để nhận hai bản vá giữa lần chạy.

## 6. Lỗ hổng gặp phải

Mỗi mục có đề xuất ở dòng §11 của PS-07; ba mục là thư `proposal` của nhân vật.

### 6.1 Cầu dao và ước lượng

1. Cầu dao token cắt phiên đã xong việc ở bước cuối (kế hoạch: 909 370/900 000, 6 giây trước khi phiên kết thúc).
15. Trần cắt phiên đang làm tốt: 5 lần cắt ở 101 % trần token (kế hoạch, d3 998 168/840 000, d5, d6) hay ở trần lượt (d2, Codex đếm mỗi lệnh nhỏ là một lượt). Chủ nhân chốt hướng (15:30): trần mềm (~85 % thì bảo phiên dừng, commit, viết thư bàn giao; cắt cứng ~150 %); phiên bị cắt mà có tiến triển thì tự mở phiên tiếp từ thư bàn giao, chỉ vào trạm quân y khi hai lần cắt liền không tiến triển; trần lượt theo tộc.
22. Trần token bằng 2× ước lượng của pháp sư, mà lượt đầu thật bằng 182 % ước lượng. Claude đếm đủ token đọc cache, Codex đếm một phần mười, nên một con số trần không cùng nghĩa giữa hai tộc.
23. Phiên Claude bị cắt giữa chừng không để lại thư bàn giao (d5, d6): Nhiếp chính chỉ viết thư tối thiểu khi commit WIP bị hook từ chối. Phiên sau làm tiếp từ git và journal.

### 6.2 Thư và đề bài

2. Thư trong thư bàn giao của phiên bị cầu dao cắt không được lập (kế hoạch: phiên sau giữ mục Memos nên không mất).
16. **Thư `amendment` mất khi commit bị từ chối** (d2): `submitWork` (`packages/steward/src/sessions/settle.ts`) commit trước rồi mới lập thư, nên một phiên dừng vì cần sửa ngoài vùng mà để lại file đỏ lint thì vào trạm quân y, thư không được lập, quest không chờ người viết đề.
17. Phiên Codex không tự commit được (`.git` chỉ đọc trong sandbox): lỗi lint-staged chỉ lộ ở commit của Nhiếp chính.
18. Kế hoạch thiếu hai chỗ đọc event ngoài eventlog (`packages/domain/examples/event.json`, `scripts/docs-tier-report.mjs`) khi nâng `EVENT_VERSION`; người chấm kế hoạch không thấy.
19. `delegation.max_rank` D, mà các phần hạng C: thư `amendment` người viết đề đã nhận vẫn lên chủ nhân (`above_rank`).
20. Nhận một `amendment` chỉ viết lại mô tả, không đổi `scope_paths`: chủ nhân phải `quest edit --scope` bằng tay (d2, d3), và sổ đo đếm file ngoài vùng là 0.
25. `docs/cli.md`, dòng `<decision>` của `memo decide` kể `shelved`, `rejected`, `handled`; code nhận cả `accepted`.

### 6.3 Người chấm và tộc

3. Codex `--output-schema` từ chối schema có khóa tùy chọn: người chấm Codex không bao giờ ra phán quyết (đã sửa ở fix/codex-output-schema, PR #158).
4. Chọn lại đúng người chấm vừa lỗi 0 token (đã sửa ở fix/review-no-session, PR #159).
5. Chọn người chấm không xét trần độ dài prompt của agy trên Windows (prompt người chấm trung vị 36 878 ký tự > 32 767). Mục (44) của phiên điều phối chờ báo cáo này; ilse còn đình chỉ.
6. Người chấm `spawn_failed` được thử lại mãi, không chuông (đã sửa ở PR #159).
21. Sandbox của Codex trên Windows làm hỏng test symlink (`EPERM`), test git với remote là thư mục, test dừng cây tiến trình, và `sh` (mã thoát 3221225794); người làm không phân biệt được lỗi môi trường với lỗi thật và tốn lượt chạy lại (d2, d3). Thư `proposal` `m_20261114_q4c27a` của dorian.
26. Hai phần của nhân vật Claude do người chấm Claude chấm khi Codex 5 giờ gần cạn (luật "ưu tiên khác họ" là ưu tiên, không phải bắt buộc).

### 6.4 Đội

8. `plot/merge.ts` (2000 ký tự cuối khi git merge bị từ chối) không nằm trong phần nào của kế hoạch.
9. **Phần của đội lấy `seal_default` của dạng** (`build`, `refactor`): đội đứng gần 2 giờ chờ dấu d1. Phần nên `seal_required: false`, chỉ quest ghép giữ dấu.
11. Lý do trạm quân y của d2 là 30+ dòng tiến trình của lint-staged, lỗi thật ở 3 dòng cuối: đúng ví dụ việc mà d3 sửa.

### 6.5 Giao hàng

10, 24. **Nhánh của đội tách từ `c3f267e` và không bao giờ ghép `main`**: quest ghép chỉ ghép các phần với nhau, nên conflict với `main` (fix/review-no-session thêm trip `no_session` và gộp `secretsBreaker` thành `cannotOpen`) chỉ lộ lúc giao hàng. Phiên PS-07 gỡ 5 conflict (`docs/events.md` sinh lại, `packages/steward/README.md`, `src/restart.ts`, `src/sessions.spec.ts`, `src/sessions/breaker.ts`) và theo lựa chọn của chủ nhân thêm hai mã vào hợp đồng, để không người ghi mới nào phát `legacy`: `breaker:no_session` (`error`) và `judge:no_session` (`stopped`, `run`, `error`), có chuỗi VI/EN, test và schema sinh lại (commit merge `1afef56`). Đây là code ngoài Elvaria.

### 6.6 Tể tướng, kế hoạch, bản tấu

12. Tấu trình: một file mà câu `say` nêu không tồn tại (`runner-antigravity/src/doctor.ts`, lỗi của câu `say`), Tể tướng đoán chứ không hỏi; morwen sửa lại trong kế hoạch.
13. Người chấm kế hoạch (maren, 6 lượt, 84k token) thấy diff bị cắt trong prompt và không đọc nửa sau hợp đồng.
14. Nhiếp chính khởi động sau 08:00 ghi ngay bản tấu ngày với 0 việc; bản kế là 08:00 hôm sau, nên chủ nhân không thấy bản tấu nào trong lần chạy.
7. `elvaria digest` không thấy quest chờ người chấm (đã sửa ở PR #159).
27. Hai thư `proposal` của morwen (chuỗi `detail` của `probe()`, lời từ chối `elvaria.patch` vẫn tiếng Anh) chờ phân loại: phần việc mà kế hoạch thấy nhưng để ngoài.

## 7. So với cách phiên điều phối làm

Ở giai đoạn 1 và 1.5, mỗi task là một phiên Claude Code (Opus) trong worktree riêng, do phiên điều phối mở bằng commit `docs: start`; chủ nhân cùng phiên điều phối viết phạm vi và điều kiện xong (dòng §8), xếp đợt và chồng lấn, chốt chỗ khác kế hoạch (§11), merge. Ví dụ cùng tuần: PS-24 từ `docs: start` tới merge 3 giờ (08:26 → 11:26), PS-06b 1 giờ 20 (14:40 → 16:00).

| Việc | Phiên điều phối (giai đoạn 1–1.5) | Elvaria (PS-07) |
|---|---|---|
| Viết phạm vi, điều kiện xong | Chủ nhân và phiên điều phối viết dòng §8 và prompt | Tể tướng tấu trình (1 câu hỏi), pháp sư viết hợp đồng và 6 phần; thiếu 2 chỗ (lỗ hổng 18), ước lượng thấp 1,8 lần |
| Chia việc, chồng lấn | Phiên điều phối xếp đợt, dặn "nhánh merge sau giữ cả hai phía" | Đội theo phụ thuộc; ghép sáu nhánh bằng máy, 0 conflict giữa các phần; không thấy `main` (lỗ hổng 24) |
| Làm | 1 phiên Opus một task, 1–3 giờ | 13 phiên người làm (dorian/Codex ở d1–d4; morwen, brann/Claude Opus; thorn/Claude Sonnet), 7 giờ 08 kể cả lúc chờ |
| Nghiệm thu | Chủ nhân đọc báo cáo của phiên, `pnpm check`, CI chạy tay | 10 check máy và 10 phiên người chấm; 0 lỗi lọt, nhưng 2/7 phần do người chấm cùng họ |
| Khi vướng | Phiên hỏi chủ nhân trong phiên; lỗi môi trường tự xử | 14 lần chủ nhân quyết ngoài dự kiến, 6 trong đó do trần |
| Chỗ khác kế hoạch | Dòng §11 "chờ người dùng chốt", chủ nhân chốt một lần cho nhiều dòng | 2 thư `amendment`, 3 thư `proposal`, dòng §11 của phiên PS-07 |
| Merge vào `main` | Phiên task `git merge origin/main`, PR, merge | Quest ghép, rồi phiên PS-07 gỡ conflict với `main` và push |
| Token | Không đo theo task (Claude Code ngoài event log; panel gộp mọi phiên) | 8,29M theo cách Elvaria đếm; Claude tuần +5 %, Codex tuần +16 % |

Đọc kết quả:

- Phần Elvaria làm tốt hơn cách cũ: chia một việc 131 file (+2 622/−666) thành hợp đồng và sáu phần ghép được bằng máy, mỗi phần có người chấm và check riêng, không ai phải xét chồng lấn bằng tay. Mọi phán quyết là đạt, không có lỗi lọt, không lần làm lại nào do đầu ra.
- Phần chưa bằng: số lần chủ nhân phải quyết. Theo các dòng §11 tuần này, một task theo cách cũ cần chủ nhân ở lúc mở và lúc chốt dòng "chờ người dùng chốt", thường gộp nhiều task trong một lần "chốt"; phiên tự xử phần lớn lỗi hạ tầng. Ở đây 14 lần ngoài dự kiến đều do cơ chế quanh phiên, không do việc khó: 3 đã có bản vá (PR #158, #159), 6 do trần (trần mềm và phiên tiếp tự động bỏ được), 3 do luồng thư và dấu của phần, 2 là điều khiển lần chạy.
- Token không so được tuyệt đối: Elvaria đếm theo tộc, còn phiên điều phối không có số theo task. Mana thì có: lần chạy này dùng Codex là chính (dorian làm 4/6 phần), nên Claude tuần chỉ tăng 5 %, gồm cả phiên điều phối và phiên PS-07.

## 8. Bài học đề xuất (chờ chủ nhân duyệt, phiên điều phối đặt)

- **Địa chí lãnh thổ Elvaria** (`territories/elvaria/gazetteer.md`): (a) nâng `EVENT_VERSION` thì đổi cả `packages/domain/examples/event.json` và bộ đọc `scripts/docs-tier-report.mjs`; (b) thêm một trường bắt buộc vào một kiểu thì grep mọi chỗ dựng nó, kể cả fixture của steward (`breakers.spec.ts`, `review.spec.ts`); (c) `max-lines` 300 áp cả file spec: tách trước khi kết thúc phiên; (d) trong sandbox của Codex trên Windows, các spec symlink, git với remote là thư mục, dừng cây tiến trình và `sh` của `logged-run` hỏng vì môi trường: check của Nhiếp chính là trọng tài.
- **Kinh của hiệp sĩ** (scripture): trước khi kết thúc phiên có file đã stage, chạy `pnpm lint` và `pnpm format:check`; commit của Nhiếp chính đi qua lint-staged, một file đỏ là trạm quân y.
- **Prompt pháp sư** (`mage.md`): đặt `seal_required: false` cho phần của đội; ước lượng token tính cả token đọc cache (Claude) và số lượt của Codex; liệt kê mọi chỗ đọc hay dựng một kiểu mà hợp đồng đổi.
- **`.claude/rules/domain.md`**: một `BreakerTrip` hay một người ghi lý do trạm quân y mới cần một mã trong `packages/domain/src/infirmary/reasons.ts`, một hàng của hợp đồng và chuỗi VI/EN.
