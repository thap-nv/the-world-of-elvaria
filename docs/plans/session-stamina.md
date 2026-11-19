# Thể lực của phiên — PS-28, PS-28b, PS-28c và PS-28d: kế hoạch chi tiết

Ngày: 2026-11-19 · Trạng thái: **chủ nhân đã chốt** sáng 2026-11-19 các mục TL1–TL10 ở cuối file: TL1–TL5 và TL7–TL10 theo khuyến nghị, riêng TL6 chủ nhân đổi thành "chạy canary ngay", nên có thêm task PS-28d ([§11, 2026-11-18](../implementation-plan/11-2026-11-18.md): dòng **docs/plan-stamina** nêu các mục, dòng "Người dùng chốt (trong phiên kế hoạch `plan-stamina` …)" ghi lời chốt). Nguồn là dòng "Người dùng chốt (trong phiên hỏi đáp `the-world-of-elvaria-d4` …) ý **Thể lực của phiên**" ở [§11, 2026-11-18](../implementation-plan/11-2026-11-18.md). Năm ý (a)–(e) của dòng đó là bất biến của kế hoạch này. Ý (f) là câu hỏi, và mục "Câu (f)" dưới đây trả lời nó bằng dấu vết của một lần chạy thật. Phần "Ai đọc" và "Mẫu dùng lại" ở đầu [phase-1.5.md](phase-1.5.md) áp dụng nguyên. Tên hàm, tên trường và các con số dưới đây là đề xuất khớp với code hiện có. Phiên làm task được đổi cho hợp, miễn giữ hợp đồng, và ghi chỗ đổi vào §11. Chưa task nào dưới đây được mở. Phiên điều phối quyết thứ tự và lúc mở.

## Năm ý đã chốt

- **(a) Thanh.** Mỗi phiên của nhân vật có một thanh **Thể lực** (id `stamina`), khác `mana`. Thể lực cạn thì nhân vật sa lầy vì phiên bị cắt, còn mana cạn thì nhân vật ngủ. Thanh đi theo thước đang gần cạn nhất. Thanh cạn đúng lúc phiên bị cắt (`hard_pct`), không cạn ở 100 % ngân sách. Mốc `soft_pct` được đánh dấu trên thanh. Phiên mới bắt đầu với thanh đầy. Người chấm có thanh riêng. Chữ đi kèm nói rõ thanh đo quãng còn lại tới lúc bị cắt, không đo việc còn lại.
- **(b) Dữ liệu.** Nhiếp chính ghi một event mới mỗi khi phiên qua một nấc 10 %, không ghi mỗi nhịp.
- **(c) Chuông.** Chủ nhân nghe chuông ở mốc `soft_pct`.
- **(d) Tiếp sức.** Nâng trần khi phiên đang chạy là lệnh `edit_quest` chỉ sửa ngân sách, đã có từ P1-54. CLI hay UI phải cho thấy trần đang áp, vì nâng tới một số thấp hơn trần đó thì không có tác dụng.
- **(e) Thứ tự.** Thanh dạng chữ trong CLI làm trước. Thanh trong thế giới 3D chờ các gói UI.

## Điều code cho thấy (2026-11-19)

Khảo sát ở `cf738a9` (`main`). Phiên làm task kiểm lại điều mình dựa vào trước khi viết code.

| # | Thực tế trong code | Hệ quả |
|---|---|---|
| 1 | `evaluateBreakers` dựng ba thước `time`, `tokens`, `turns` (`packages/domain/src/breaker/evaluate.ts:74-77`), nhưng thước `turns` chỉ có khi `usage.turns` có giá trị. Tín hiệu `usage` của runner chỉ mang `tokens` (`packages/runner-core/src/runner/types.ts:66`), và bảng phiên của Nhiếp chính đưa cho cầu dao đúng `{tokens}` (`packages/steward/src/sessions/running.ts:61-77`). Số lượt chỉ về cùng dòng kết thúc phiên. Tộc không có năng lực `usage` thì chỉ đo phút (`packages/domain/src/tribe/tribe-limits.ts:81`) | Trong lúc phiên chạy, thanh đi theo thước phút hoặc thước token. Thước lượt vẫn nằm trong kiểu dữ liệu, để dành cho runner nào báo lượt giữa phiên |
| 2 | `evaluateBreakers` không chọn thước gần cạn nhất. Hàm trả về thước **đầu tiên** đã qua ngưỡng theo thứ tự cố định phút, token, lượt (`evaluate.ts:79-87`) | Thanh cần một hàm thuần mới, tính trên cùng danh sách thước. Phần dựng danh sách thước tách ra dùng chung, để thanh và cầu dao không bao giờ lệch nhau |
| 3 | Trần token đang áp là `tokenCeilingOf` (`packages/domain/src/breaker/breakers.ts:67-85`). `calibrationOf` trả một dòng cho mọi tộc của vương quốc (`breaker/calibration.ts:70-92`) và `planTick` luôn truyền nó vào (`dispatch/plan-tick.ts:188-194`). Vì vậy trần là số lớn nhất trong ba số: phần của hạng nhân `mana_multiplier`, `estimate.tokens` nhân hệ số của tộc, và mức chủ nhân đã nâng. `budget.max_tokens` chỉ được tính khi nó cao hơn ngân sách lúc tạo. Người chấm nhân thêm `verifier_tokens_multiplier` (mặc định 2). Trần phút là `budget.max_minutes` cho cả hai vai | "Trần đang áp" thường khác `budget.max_tokens`. CLI phải tính bằng đúng các hàm này. Trần còn đổi được trong lúc phiên chạy: khi chủ nhân sửa ngân sách, và khi một quest khác xong lượt đầu làm hệ số của tộc đổi |
| 4 | Mốc mềm: `noteWrapUps` chạy mỗi nhịp (`packages/steward/src/sessions/wrap-up.ts:57-77`, gọi ở `tick.ts:172`). Với mỗi phiên **người làm** qua `soft_pct`, nó ghi `wrap-up.json` và một dòng `agent.session.wrap_up` mang `measure`, `used`, `limit`, `pct` (`packages/domain/src/schema/event/event-data.ts:96-101`), một lần mỗi phiên. Sổ "đã nhắc" là `state.wrapped`, chỉ nằm trong bộ nhớ. Không có chuông. Người chấm không nhận gì | Chuông ở mốc mềm gắn vào đúng bước này. Người chấm cần một nhánh riêng nếu chủ nhân muốn chuông cho cả hai vai (mục TL4) |
| 5 | Mốc cứng: `breakAssignee` (`packages/steward/src/sessions/breaker.ts:44-95`) ghi `character.swamp`, giết cây tiến trình, commit WIP rồi đo tiến độ. Theo [ADR 0030](../adr/0030-cut-session-with-progress-goes-on.md), phiên bị cắt mà có tiến độ thì đi tiếp ở một phiên mới của cùng lượt `n`: sổ ghi `agent.session.end` (`killed`), `quest.returned` do Nhiếp chính, rồi `quest.started` và `agent.session.start` với `session` mới. Lần cắt đi tiếp không rung chuông. Người chấm bị cắt thì lượt chấm sang người kế (`breakVerifier`, `breaker.ts:182-210`), không chuông cho tới người thứ `REVIEW_BREAKS_MAX` | Sổ sự kiện đã đủ để nói "phiên trước bị cắt rồi đi tiếp", không cần trường mới trên quest |
| 6 | Đồng hồ và số token của một phiên là của chính mục `attempt_log` của nó: phiên hồi sinh sau mana, sau câu trả lời hay sau một lần cắt đều là mục mới (`breakers.ts:1-3,36-37`) | "Phiên mới bắt đầu với thanh đầy" đúng sẵn với code, không cần luật riêng |
| 7 | Trong lúc phiên chạy, sổ có `agent.session.start` (data chỉ có `session`, `model`), các dòng `agent.tool`, tối đa một dòng `agent.session.wrap_up`, rồi `agent.session.end` (`outcome`, `usage`). Không dòng nào khác mang số đã dùng. `event-data.ts` dài 272 dòng | Cần event mới của ý (b). Schema mới vào file mới `schema/event/session-data.ts` |
| 8 | `reduce` chỉ giữ dòng của quest, nhân vật, lãnh thổ, mana và thư. Các dòng `agent.*` được bỏ qua có chủ ý: "the world animates them, it does not keep them" (`packages/domain/src/world/reduce.ts:87-130`). Phép thử P0-09 đòi `reduce(events)` bằng `worldStateOf(files)` sau **từng** dòng (`world/replay.spec.ts`). `QuestView` không có ngân sách và không có `attempt_log`. Trạng thái suy từ sổ bằng một hàm thuần đã có tiền lệ: `forgeOutcomesOf`, `baseHealthOf`, và `apps/cli/src/gauges.ts` gấp các dòng `mana.*` | Thanh là một hàm gấp riêng trên sổ sự kiện, không là trường của `WorldState`. Không file nào giữ số đã dùng của phiên đang chạy, nên đưa thanh vào `WorldState` sẽ làm gãy phép thử P0-09 |
| 9 | `record.note` có `quest` thì ghi dòng vào cả sổ ngày lẫn `journal.jsonl` của quest. Prompt của phiên nối tiếp đọc 20 dòng cuối của journal, không lọc (`packages/runner-core/src/prompt/memory.ts:10,38`). Journal đã chứa mọi dòng `agent.tool` của hook | Mỗi phiên thêm nhiều nhất khoảng mười dòng nấc vào journal, ít hơn nhiều so với dòng tool. Đuôi 20 dòng của prompt không xấu đi đáng kể. `quest show` đọc được thanh từ journal |
| 10 | Chuông là dữ liệu: union `Notice` (`packages/steward/src/notice.ts:37`), hàm `ring` (`steward/src/context.ts:56`), và `apps/cli/src/run/bell.ts:119-178` nói từng loại bằng một `switch` kín | Một loại `Notice` mới buộc thêm dòng chữ của nó trong cùng thay đổi, nếu không typecheck đỏ. Chuông vì vậy nằm trọn trong một task |
| 11 | `quest edit` nhận `--max-tokens` (`apps/cli/src/quest/edit.ts:33-51`), nhưng sau khi gửi lệnh nó chỉ nói về phút (`minuteLines`, `edit.ts:85-99,123-124`). Lệnh chỉ sửa ngân sách không bao giờ `stale` (`packages/domain/src/dispatch/new-quest.ts:252-268`) và được áp ở nhịp kế | Chủ nhân nâng token mà không biết số mới có tác dụng không. Đây là chỗ ý (d) phải sửa |
| 12 | `quest show` in `attempts/max_attempts` và không in gì khác về ngân sách hay phiên đang chạy (`apps/cli/src/quest/show.ts:32-78`). Lệnh đã đọc journal của quest (`journalOf`) và danh sách mọi quest | Đủ dữ liệu để in ngân sách, trần đang áp và thanh mà không thêm lần đọc nào |
| 13 | Glossary chưa có `stamina`. `mana` và `swamp` nằm ở bảng `verification`. `agent.session.wrap_up` nằm trong nhóm "Phiên agent" của bảng `events` mà không có lời giải thích. Hai file locale chưa có khóa nào nói về lời nhắc | PS-28 thêm thuật ngữ và dòng event. PS-28b thêm chuỗi hiển thị |
| 14 | Khi CLI tự dừng ở trần của nó, lý do trạm quân y lấy `quest.budget.max_tokens` hay `breakers.max_turns` của vương quốc làm giới hạn, không lấy trần đang áp (`steward/src/sessions/breaker.ts:142-145`) | Ngoài phạm vi. Ghi ở "Gợi ý cho task khác" |

## Lần (J) cho thấy gì

Dấu vết đọc từ vương quốc `my-kingdom` (chỉ đọc, 0 mana): 355 thư mục trong `.runs/`, sổ sự kiện từ 2026-11-07 tới 2026-11-18. Cả sổ có đúng ba dòng `agent.session.wrap_up`. Cả ba thuộc quest `q_20261117_m8d5t2`, lượt 1, nhân vật Quill (tộc `gemini`, CLI agy), ngày 2026-11-17. Trần đang áp là 300 060 token, nên ngưỡng cắt là 450 090.

| Phiên | Qua mốc mềm | Kết thúc | Từ mốc mềm tới lúc kết thúc |
|---|---|---|---|
| 1 | 17:40:59, 256 060 token (85,3 %) | 17:46:09, bị cắt ở 462 564 | 5 phút 10 giây, thêm 206 504 token |
| 2 | 18:00:29, 262 433 token (87,5 %) | 18:05:00, bị cắt ở 495 826 | 4 phút 31 giây, thêm 233 393 token |
| 3 | 18:16:58, 304 713 token (101,6 %) | 18:21:59, tự nộp bài ở 444 882 | 5 phút 1 giây, thêm 140 169 token |

Bốn điều rút ra cho kế hoạch:

- Từ mốc mềm tới lúc bị cắt chỉ có khoảng năm phút, với nhịp đốt khoảng 40 000 token mỗi phút. Chuông ở mốc mềm vì vậy phải mang sẵn câu lệnh tiếp sức và trần đang áp. Chủ nhân không kịp tra.
- Số đã dùng của agy về từng bước lớn. Lần đọc đầu tiên qua mốc của phiên 3 đã là 101,6 %. Một phiên có thể nhảy qua nhiều nấc trong một lần đọc, nên Nhiếp chính chỉ ghi một dòng cho nấc mới nhất.
- Phiên 3 nộp bài khi thanh còn khoảng 1 %. Thanh gần cạn không có nghĩa là việc còn nhiều. Câu "thanh không đo việc còn lại" là cần thật.
- Ba phiên của cùng một lượt, mỗi phiên bắt đầu lại từ 0 token. Thanh theo phiên, không theo lượt và không theo quest.

## Câu (f): đường nhắc của Claude đã tới được chưa

**Trả lời: chưa có chứng cứ nào, và dấu vết đã có không trả lời được.**

(Cập nhật 2026-11-19, PS-28d: phép đo trên CLI thật trả lời `có`. Chuỗi `additionalContext` tới model, và lời nhắc thật làm một phiên opus ngừng việc mới, viết thư rồi kết thúc; phần commit chưa đo. Xem kết quả ở mục PS-28d dưới. Phần còn lại của mục này là tình trạng trước phép đo.)

- Trong 355 thư mục chạy, không thư mục nào có `hook/wrap-up-reminded/`. Thư mục này là biên nhận của hook: nó được tạo lúc hook trao lời nhắc cho CLI (`packages/hooks/src/wrap-up.ts:131-134,169`).
- Ba dòng `agent.session.wrap_up` duy nhất đều là phiên agy, chạy trước khi #220 (`fix/wrap-up-agy-codex`) cho agy một đường nhắc. Từ đó tới hết ngày 2026-11-18 không phiên nào của tộc nào qua `soft_pct` nữa.
- Vì vậy chưa phiên Claude nào từng qua `soft_pct` kể từ khi có lời nhắc. Không có `stdout.jsonl` nào để xem phiên có đổi cách làm không.
- Không có chứng cứ gián tiếp. Hook của Elvaria chỉ dùng `additionalContext` ở đúng chỗ này. Hook `PostToolUse` của chính repo (`.claude/hooks/typecheck-touched.mjs`) nói với phiên bằng mã thoát 2 và stderr. Đó là một đường khác, nên các lần nó chạy thật không chứng minh gì cho `additionalContext`.

Kế hoạch xử lý câu hỏi còn mở này theo ba cách:

1. **Thanh không dựa vào (f).** Vùng vàng mang chữ "đã qua mốc nhắc", không mang chữ "nhân vật đang thu dọn". Nếu sau này biết lời nhắc không tới, thanh vẫn đúng.
2. **PS-28c trả lời bằng số, 0 mana.** Sổ đo thêm bảng "sau lời nhắc" theo tộc: bao nhiêu phiên đã được ghi lời nhắc, bao nhiêu phiên tự kết thúc và bao nhiêu phiên bị cắt, cùng số token và số phút từ lời nhắc tới lúc kết thúc. Phiên Claude đầu tiên qua mốc sẽ hiện ngay trong bảng. Lần (J) là mốc so sánh của một tộc lúc chưa có đường nhắc: hai trong ba phiên bị cắt, mỗi phiên đốt thêm 140 000 tới 233 000 token.
3. **Cách đọc tay một phiên.** Có file `hook/wrap-up-reminded/<session>.json` nghĩa là hook đã trao chữ cho CLI. Sau giờ ghi của file đó, xem trong `stdout.jsonl` phiên có viết `handover.md`, commit rồi kết thúc trong vài lượt không.

Cách thứ tư tốn mana: một phiên Claude nhỏ có trần thấp và một chuỗi canary, khoảng 20 000 tới 30 000 token theo ước lượng của [file dò](phase-2-probes/hook-reminder.md). Chủ nhân chốt ở mục TL6 là chạy canary ngay. Việc đó là task PS-28d dưới đây. Ba cách trên vẫn giữ: thanh vẫn không dựa vào (f), và PS-28c đo cả những lần sửa đường nhắc về sau.

## Tổng quan và cách chia

- **Mục tiêu**: chủ nhân nhìn một quest đang chạy thì biết phiên còn cách lúc bị cắt bao xa và vì thước nào. Chủ nhân nghe chuông khi phiên qua mốc nhắc, kèm câu lệnh tiếp sức đúng số. Sau một lần cắt, chủ nhân biết phiên mới là phiên khác và thanh đầy lại.
- **Đọc trước**: dòng §11 nguồn; [§3.4](../implementation-plan/3.4-breakers.md); [ADR 0030](../adr/0030-cut-session-with-progress-goes-on.md), [ADR 0009](../adr/0009-mana-model.md), [ADR 0003](../adr/0003-zod-schema-source-generated-json-schema.md); luật (F) ở [phase-2-plan.md](phase-2-plan.md); dòng **fix/stop-letter** và **fix/wrap-up-agy-codex** ở §11 ngày 2026-11-18; bảng 1–14 ở trên.
- **Định nghĩa thanh** (mục TL3). Với mỗi thước của phiên, `pct = used × 100 / limit` như dòng `wrap_up` hôm nay, trong đó `limit` là trần danh nghĩa đang áp.
  - Phần đã tiêu của thanh là `spent_pct = pct × 100 / hard_pct`. Thanh đi theo thước có `spent_pct` lớn nhất. Hai thước bằng nhau thì lấy theo thứ tự phút, token, lượt như cầu dao.
  - Phần còn lại là `left_pct = 100 − spent_pct`, chặn trong khoảng 0 tới 100. Thanh về 0 ở đúng ngưỡng cắt.
  - Mốc nhắc nằm ở `soft_pct × 100 / hard_pct` phần đã tiêu. Với mặc định 85 và 150, mốc ở 56,7 % đã tiêu, tức là thanh còn 43,3 %.
  - Nấc là `floor(spent_pct / 10)`, từ 0 tới 10.
  - Vùng: `ok` trước mốc nhắc, `wrap_up` (vàng) từ mốc nhắc, `critical` (đỏ) khi thanh còn từ 20 % trở xuống. Thanh của người chấm không có mốc nhắc và không có vùng vàng, vì người chấm không nhận lời nhắc.
- **Thanh không được lưu.** Không file nào và không trường nào của quest hay nhân vật giữ thể lực. Mọi nơi hiển thị tính lại từ sổ sự kiện bằng cùng một hàm thuần.
- **Luồng đích** sau các task dưới đây:
  1. Phiên mở. Thanh đầy, vì chưa có dòng nấc nào.
  2. Mỗi nhịp, Nhiếp chính tính nấc của từng phiên đang giữ. Nấc đổi thì ghi một dòng `agent.session.usage` (PS-28).
  3. Phiên người làm qua `soft_pct`: Nhiếp chính ghi `wrap-up.json` và `agent.session.wrap_up` như hôm nay, rồi rung chuông cho chủ nhân (PS-28b).
  4. Chủ nhân chạy `elvaria quest edit <id> --max-tokens <số>`. CLI nói ngay số đó có tác dụng không (PS-28b). Ở nhịp kế trần mới được áp, Nhiếp chính ghi một dòng nấc mới và thanh hồi lại.
  5. Phiên qua `hard_pct`: phiên bị cắt như hôm nay. Dòng `agent.session.end` đóng thanh. Nếu quest đi tiếp theo ADR 0030, phiên mới có thanh đầy và `quest show` nói phiên trước bị cắt ở thước nào.
  6. `elvaria metrics` in bảng "sau lời nhắc" theo tộc (PS-28c).
- **Chia** (mục TL1; không task nào sửa bảng chuyển trạng thái):

| Id | Việc | Số ý | Cần trước | File chạm chính |
|---|---|---|---|---|
| PS-28 | Thước thể lực, event `agent.session.usage`, hàm gấp từ sổ | 4 | — | `p/domain/src/{breaker,world,schema/event}/**`, `p/steward/src/{sessions,tick.ts,steward-state.ts}`, `p/i18n/src/glossary.json` |
| PS-28b | Thanh dạng chữ, trần đang áp, chuông ở mốc nhắc | 4 | PS-28 | `a/cli/src/{quest,run}/**`, `p/steward/src/{notice.ts,sessions/**}`, hai file locale, hướng dẫn vận hành |
| PS-28c | Sổ đo "sau lời nhắc" | 2 | — | `p/domain/src/metrics/**`, `a/cli/src/metrics/**`, `docs/metrics-report.md` |
| PS-28d | Canary lời nhắc của Claude (spike, tốn mana, trần 30 000 token) | 2 | — | `docs/spikes/`, `docs/reference/cli-facts-*.md` |

- **Thứ tự theo phụ thuộc** (đề xuất; phiên điều phối quyết): PS-28, PS-28c và PS-28d không cần nhau và không cần task nào trước. PS-28b sau PS-28. PS-28d không chặn task nào, vì thanh không dựa vào câu (f).
- **Chồng nhau**: `packages/i18n/src/glossary.json`, hai file locale, `packages/domain/src/index.ts`, `docs/schemas/**`, `docs/events.md`. PS-28 và PS-28b cùng chạm `packages/steward/src/sessions/**`. PS-16 (trần cỡ diff) cũng chạm `packages/domain/src/breaker/**`. Nhánh merge sau giữ cả hai phía và sinh lại file sinh.
- **Mana**: PS-28, PS-28b và PS-28c dùng CLI giả và đồng hồ giả, 0 mana. Riêng PS-28d chạy CLI thật, trần 30 000 token, do một phiên của chủ nhân chạy.

## PS-28 — Thước thể lực và event `agent.session.usage`

- **Mục tiêu**: sổ sự kiện đủ để dựng thanh của mọi phiên đang chạy, cho cả người làm lẫn người chấm, mà không ai đọc file nào khác.
- **Đọc trước**: dòng 1–9 ở trên; `packages/domain/src/breaker/{evaluate,breakers}.ts` cùng spec; `packages/steward/src/sessions/{wrap-up,running}.ts`; mẫu "Event mới" ở [phase-1.5.md](phase-1.5.md); [domain.md](../../.claude/rules/domain.md) mục schema.
- **Trước tiên**: tách phần dựng danh sách thước của `evaluateBreakers` thành một hàm xuất ra (`gaugesOf`), không đổi hành vi, trong commit riêng. Schema mới nằm ở file mới `packages/domain/src/schema/event/session-data.ts`.
- **Dùng lại**: `evaluationsOf` và các tham số của nó (`tokenCeilingOf`, `turnCeilingOf`, `measureOf`, `calibrationOf`); `ctx.sessions.held()`; `ctx.record.note`; sổ `state.wrapped` làm mẫu cho sổ nấc.
- **Thêm**:
  - **Hàm thuần `staminaOf`** (`packages/domain/src/breaker/stamina.ts`): nhận đúng các đối số của `evaluateBreakers`, trả thước gần cạn nhất kèm `measure`, `used`, `limit`, `pct`, `left_pct`, `notch`, vị trí mốc nhắc và vùng, theo "Định nghĩa thanh". Hằng `STAMINA_STEP_PCT` (10) và `STAMINA_CRITICAL_LEFT_PCT` (20) nằm ở `constants.ts`. Một hàm bọc tính cho mọi phiên đang giữ, cạnh `breakersOf` và `wrapUpsOf`.
    - (Thực tế PS-28) `staminaOf` nhận thêm vai của phiên ở tham số thứ sáu (mặc định `assignee`), vì mốc nhắc và vùng vàng tùy vai. Kết quả mang `measure`, `used`, `limit`, `pct`, `soft_pct`, `hard_pct`, `role`, `left_pct`, `notch`, `mark_left_pct` (mốc nhắc tính bằng phần còn lại, `undefined` cho người chấm) và `zone`. Vùng vàng dùng đúng phép so của cầu dao: vượt `soft_pct`, không tính lúc bằng. `barOf(gauge)` tính thanh của một thước, dùng chung cho `staminaOf` và hàm gấp. Hàm bọc là `sessionReadingsOf`: mỗi phiên đang giữ một lần đọc, gồm kết luận của cầu dao và thanh; `breakersOf`, `wrapUpsOf` giữ tham số và kết quả, `wrapUpsIn(readings)` lọc lời nhắc từ một lần đọc. Luật ghi dòng nấc là hàm thuần `staminaMoved(last, now)` trong domain, Nhiếp chính chỉ thực thi.
  - **Event `agent.session.usage`** (mục TL2), do Nhiếp chính ghi, `actor` là `steward`. Phong bì mang `quest`, `attempt`, `territory`, `session` như dòng `wrap_up`. Data:
    - `role`: `assignee` hay `verifier`;
    - `measure`: `time`, `tokens` hay `turns`, là thước mà thanh đang theo;
    - `used`, `limit`, `pct`: cùng nghĩa và cùng đơn vị với dòng `wrap_up` (phút cho `time`; `limit` là trần danh nghĩa đang áp);
    - `soft_pct`, `hard_pct`: hai ngưỡng đang áp lúc ghi, để nơi đọc tính được thanh mà không cần `kingdom.json`.
    Dòng mang `v` hiện hành của sổ. Đây là type mới nên không cần migration. Phiên làm task kiểm lại rằng bản ghim cũ đọc sổ có type lạ thì bỏ qua (`isTypedEvent`, `world/reduce.ts:142`).
  - **Khác `agent.session.wrap_up` ở đâu**: `wrap_up` nói "lời nhắc đã được ghi cho phiên này", nhiều nhất một lần mỗi phiên, chỉ cho người làm, và đi cùng file `wrap-up.json`. `usage` là số đo, ghi nhiều lần, cho cả hai vai, không kèm file nào và không đổi hành vi của phiên. Hai type không thay nhau. Schema và nghĩa của `wrap_up` giữ nguyên.
  - **Nhiếp chính ghi theo nấc** (`packages/steward/src/sessions/usage.ts`, gọi trong nhịp ngay cạnh `noteWrapUps`, trước `planAndAct`): sổ nấc theo `session_id` nằm trong bộ nhớ, như `state.wrapped`. Nhiếp chính ghi một dòng khi nấc của phiên khác nấc đã ghi, lên hay xuống. Nó cũng ghi một dòng khi `limit` của cùng `measure` khác dòng trước, để lần tiếp sức hiện ra dù nấc không đổi. Phiên chưa tới nấc 1 thì chưa có dòng nào. Phiên nhảy qua nhiều nấc trong một lần đọc thì chỉ có một dòng. Thước đổi qua lại giữa phút và token trong cùng một nấc thì không ghi thêm. Phần tính thước dùng chung một lần tính với `noteWrapUps` trong mỗi nhịp.
  - **Hàm gấp `sessionStaminaOf(events)`** (`packages/domain/src/world/stamina-view.ts`, thuần): nhận các dòng của một journal hay của sổ ngày theo thứ tự, trả cho mỗi quest phiên đang mở của nó: `session`, `role`, nhân vật, lượt, thước, số đã dùng, trần, `left_pct`, vùng, giờ của dòng nấc mới nhất, cờ `reminded`, và `previous` khi phiên ngay trước của cùng lượt kết thúc bằng một lần cắt.
    - `agent.session.start` mở một thanh đầy. `agent.session.usage` đặt giá trị. `agent.session.wrap_up` bật `reminded`. `agent.session.end` đóng thanh.
    - "Bị cắt" đọc từ `outcome` của dòng kết thúc (`killed`, `max_turns`, `budget`). `previous` mang thước và phần trăm của dòng nấc cuối cùng của phiên đó.
    - Dòng thiếu `session`, dòng lặp và type lạ không làm hàm hỏng.
    - (Thực tế PS-28) Dòng `agent.session.start` không nói vai, và có thể tới trước hay sau dòng quest của Nhiếp chính. Vì vậy dòng quest mang `session` cũng mở thanh và nói ghế: quest `working` là người làm, `review` có người chấm là người chấm. Dòng quest nói ghế đã trống (§2.5: mục đang mở chỉ có khi quest `working`, hay `review` có người chấm) thì đóng thanh mà dòng kết thúc chưa tới. Dòng nấc hay dòng nhắc mở thanh khi người đọc không thấy dòng start (đuôi journal); dòng của phiên đã kết thúc thì bỏ qua, trừ khi một dòng mở phiên mở lại nó (phiên nối lại dưới cùng id).
    - (Thực tế PS-28) Chỉ `outcome` thì chưa đủ để nói "bị cắt": Nhiếp chính cũng giết phiên khi pool hết mana hay chủ nhân hủy quest, và các lần đó cũng ghi `killed`. `previous` vì vậy chỉ có khi phiên trước là của người làm, cùng lượt, kết thúc bằng `killed`, `max_turns` hay `budget`, và quest đã có dòng `quest.returned` sau đó, đúng chuỗi cắt rồi đi tiếp của ADR 0030. `previous` mang `session`, `outcome` và thanh của dòng nấc cuối (`undefined` khi phiên bị cắt trước nấc 1).
  - **Glossary**: thuật ngữ `stamina` (VI "Thể lực", EN "Stamina") ở bảng `verification`, cạnh `mana` và `swamp`. Định nghĩa nói rõ ba điều: thanh theo phiên, thanh là giá trị suy ra không lưu, và thanh đo quãng tới lúc bị cắt. Nhóm "Phiên agent" của bảng `events` thêm type mới và một câu giải thích cho cả `wrap_up`. Chạy `pnpm docs:gen` và `pnpm schemas`.
  - **Tài liệu**: [§3.4](../implementation-plan/3.4-breakers.md) thêm đoạn "Thể lực"; README của domain và steward.
- **Không làm**: chuông, chữ hiển thị và lệnh CLI (PS-28b); trường mới trên `WorldState`, `QuestView` hay `CharacterView`; mục bản tấu; lời nhắc cho người chấm; đổi `soft_pct`, `hard_pct` hay cách cầu dao cắt.
- **Test** (CLI giả, đồng hồ giả, 0 mana):
  - Domain: thanh theo thước có phần đã tiêu lớn nhất, và hai thước bằng nhau thì theo thứ tự của cầu dao. `left_pct` bằng 0 khi và chỉ khi `evaluateBreakers` cắt, trừ đúng điểm token bằng ngưỡng (cầu dao cắt khi vượt). Tộc `minutes_only` chỉ có thước phút. Người chấm dùng trần nhân `verifier_tokens_multiplier` và không có mốc nhắc. Trần nâng thì `left_pct` tăng. `soft_pct` và `hard_pct` khác mặc định cho mốc và nấc đúng. Ba phiên của lần (J) cho đúng các con số ở bảng trên. Coverage 100 %.
  - Hàm gấp: `start` cho thanh đầy; dòng nấc đổi giá trị; `wrap_up` bật cờ; `end` đóng. Chuỗi cắt rồi đi tiếp của ADR 0030 cho thanh đầy mới có `previous`. Phiên người chấm của cùng quest là thanh khác. Hai lần cắt liền không tiến độ rồi vào trạm quân y thì không còn thanh nào.
  - Steward: phiên đi từ 0 tới ngưỡng cắt ghi mỗi nấc đúng một dòng và không dòng nào sau `agent.session.end`. Một lần đọc nhảy ba nấc ghi một dòng. `edit_quest` nâng `max_tokens` giữa phiên thì nhịp kế có một dòng với `limit` mới và nấc thấp hơn. Phiên người chấm ghi `role: verifier`. Mọi dòng qua `EventSchema` và có mặt ở cả sổ ngày lẫn journal. Khởi động lại Nhiếp chính không ghi lặp.
  - `pnpm schemas` và `pnpm docs:gen` sạch; fixture `valid-data.ts` có type mới.
- **Xong khi**: `pnpm check` xanh; các ca trên; glossary và `docs/events.md` nói đúng.
- **Chỗ chừa**: PS-28b đọc `sessionStaminaOf` và `staminaOf`, không tính lại. Các gói UI (Sứ giả, khách nhẹ, thế giới) chạy `sessionStaminaOf` trên chính các dòng Sứ giả đã gửi. Lúc khởi động nguội, Sứ giả gấp journal của các quest đang `working` hay `review`. Thước `turns` sống khi một runner báo lượt trong tín hiệu `usage` (mục TL10).
- **Vương quốc đang chạy**: không migration. Sau `elvaria upgrade`, phiên mở từ đó trở đi có dòng nấc.

## PS-28b — Thanh dạng chữ, trần đang áp và chuông

- **Mục tiêu**: chủ nhân thấy thanh và trần đang áp trong `quest show`, biết ngay một lần `quest edit` có tác dụng không, và nghe chuông ở mốc nhắc kèm câu lệnh tiếp sức.
- **Đọc trước**: dòng 3, 4, 10–13 ở trên; mục "Lần (J) cho thấy gì"; `apps/cli/src/quest/{show,edit}.ts`, `apps/cli/src/run/bell.ts`, `apps/cli/src/gauges.ts`; [cli.md](../../.claude/rules/cli.md).
- **Dùng lại**: `sessionStaminaOf`, `staminaOf` (PS-28); `tokenCeilingOf`, `turnCeilingOf`, `calibrationOf`; `journalOf`; `minuteLines` làm mẫu cho dòng nói sau `quest edit`; `ring` và `noticeQuest`.
- **Thêm**:
  - **`quest show`: ngân sách và trần đang áp.** Lệnh in ngân sách đã lưu (`max_tokens`, `max_minutes`, `max_attempts`). Rồi nó in trần đang áp cho người làm và cho người chấm, tính bằng đúng hàm của cầu dao: trần danh nghĩa, số ở mốc nhắc và số ở ngưỡng cắt. Khi trần token đang áp khác `budget.max_tokens`, một dòng nói vì sao: do hệ số của tộc nào, hay do phần của hạng. Quest chưa có người giữ thì lệnh in theo ngân sách và nói trần còn tùy tộc của người nhận.
  - **`quest show`: thanh.** Khi quest có phiên đang mở, lệnh in một dòng `Thể lực`: thanh mười ô có dấu ở mốc nhắc, phần trăm còn lại, thước, số đã dùng trên trần, ngưỡng cắt và giờ của dòng nấc mới nhất. Dòng kế là câu chú giải cố định. Khi fold có `previous`, lệnh in thêm câu về lần cắt trước. Chuỗi đề xuất:
    - chú giải: "Thể lực đo quãng còn lại tới lúc phiên bị cắt, không đo việc còn lại." / "Stamina measures how far the session is from being cut, not how much work is left."
    - vùng vàng của người làm: "đã qua mốc nhắc" / "past the reminder mark";
    - sau lần cắt đi tiếp: "Phiên trước của lượt {run} bị cắt ở thước {measure}. Việc đã commit còn nguyên. Phiên này đọc lại thư bàn giao và git, nên thể lực đầy lại, còn trí nhớ của phiên trước thì mất."
  - **`quest edit`: nói tác dụng của số mới** (mục TL5). Sau khi gửi lệnh có `--max-tokens`, CLI tính trần đang áp trước và sau trên bản quest đã sửa, cho vai đang có phiên.
    - Trần không đổi: CLI nói số mới không có tác dụng, nêu trần đang áp và vì sao, và nêu số nhỏ nhất có tác dụng.
    - Trần tăng và có phiên đang chạy: CLI nói phiên đó có trần mới từ nhịp kế, và bị cắt ở số nào.
    - Trần giảm xuống dưới số phiên đã dùng: CLI cảnh báo phiên bị cắt ở nhịp kế, như `minutes_cut`.
  - **Chuông ở mốc nhắc** (mục TL4). Loại `Notice` mới `wrap_up` mang quest, vai, nhân vật, thước, số đã dùng, trần đang áp và ngưỡng cắt. Nhiếp chính rung nó ở đúng bước ghi `agent.session.wrap_up` của người làm, một lần mỗi phiên. Phiên người chấm qua `soft_pct` cũng rung một lần, dù không có file và không có dòng `wrap_up`. Dòng của `ConsoleBell` nêu ba điều: ai đang làm quest nào và đã dùng bao nhiêu trên trần nào; chuyện gì xảy ra nếu chủ nhân không làm gì; và câu lệnh tiếp sức có sẵn id của quest cùng số phải vượt.
    - Người làm: phiên đã được nhắc thu dọn. Nếu bị cắt mà có tiến độ thì một phiên mới đi tiếp và trí nhớ của phiên này mất.
    - Người chấm: không có lời nhắc. Nếu bị cắt thì lượt chấm mở lại từ đầu với người chấm khác.
    - Thước phút dùng `--max-minutes`. Thước lượt không có nút theo quest, nên dòng chuông chỉ báo.
  - **Hướng dẫn vận hành**: [operating-a-kingdom.md](../guides/operating-a-kingdom.md) thêm mục "Thể lực của phiên và tiếp sức": đọc thanh thế nào, khi nào nên tiếp sức và khi nào để phiên bị cắt rồi đi tiếp, vì sao số nâng phải vượt trần đang áp. `pnpm docs:gen` sinh lại `docs/cli.md` nếu chuỗi trợ giúp đổi.
- **Không làm**: mục bản tấu cho phiên sắp cạn (mục TL4); cột thể lực trong `quest list` hay `character list` (mục TL8); thanh trong thế giới 3D và khách nhẹ (mục TL7); đổi lời nhắc gửi cho nhân vật.
- **Test** (CLI giả, 0 mana):
  - `quest show` trên quest đang `working` có ba dòng nấc: thanh đúng số ô, đúng phần trăm, có dấu mốc và có câu chú giải. Quest đang `review` in thanh của người chấm, không có vùng vàng. Quest không có phiên thì không có dòng `Thể lực` nhưng vẫn có ngân sách và trần đang áp. Chuỗi cắt rồi đi tiếp in câu về lần cắt trước.
  - Trần đang áp: quest có ước lượng nhân hệ số của tộc cao hơn ngân sách in đúng số của `tokenCeilingOf` và lý do. Số của người chấm gấp `verifier_tokens_multiplier` lần.
  - `quest edit --max-tokens`: số thấp hơn trần đang áp cho dòng "không có tác dụng" kèm số nhỏ nhất có tác dụng. Số cao hơn cho dòng trần mới. Số thấp hơn mức đã dùng cho cảnh báo. Quest không có phiên không in dòng nào về phiên.
  - Chuông: phiên người làm qua `soft_pct` rung đúng một lần, ở cùng nhịp với dòng `wrap_up`, và không rung lại ở nhịp sau. Phiên người chấm rung một lần với chữ của người chấm. Phiên mới của cùng lượt sau một lần cắt rung lại khi chính nó qua mốc. Dòng chuông chứa câu lệnh với đúng id và đúng trần.
  - `pnpm i18n:check` có đủ `vi` và `en` cho mọi khóa mới.
- **Xong khi**: `pnpm check` xanh; các ca trên; hướng dẫn vận hành và `docs/cli.md` nói đúng.
- **Chỗ chừa**: `DesktopBell` và `WebPushBell` (P2-03, P2-08) nói cùng loại `Notice` này. Nút "tiếp sức" trên UI gửi đúng lệnh `edit_quest` chỉ sửa ngân sách.

## PS-28c — Sổ đo "sau lời nhắc"

- **Mục tiêu**: biết bằng số, theo từng tộc, lời nhắc ở mốc mềm có làm phiên dừng sớm hơn không. Đây là câu trả lời 0 mana cho câu (f) và là thước đo cho mọi lần sửa đường nhắc về sau.
- **Đọc trước**: mục "Câu (f)" và "Lần (J) cho thấy gì"; `packages/domain/src/metrics/**`; mục PS-01 của [phase-1.5.md](phase-1.5.md).
- **Dùng lại**: các hàm đọc sổ của sổ đo (`metrics/session-counts.ts`, `metrics/ledger.ts`); cách `elvaria metrics` và `docs/metrics-report.md` in một bảng.
- **Thêm**:
  - Hàm thuần `afterWrapUpOf(events, characters)` (`packages/domain/src/metrics/`): ghép mỗi dòng `agent.session.wrap_up` với dòng `agent.session.end` của cùng `session`, lấy tộc từ nhân vật của phiên. Mỗi tộc một dòng: số phiên đã được ghi lời nhắc, số phiên tự kết thúc (`completed`), số phiên bị cắt, trung vị số token thêm và trung vị số phút từ lời nhắc tới lúc kết thúc. Số token thêm chỉ tính khi thước của lời nhắc là token và dòng kết thúc có `usage`.
  - `elvaria metrics` in bảng "Sau lời nhắc" và `docs/metrics-report.md` có bảng đó (`pnpm docs:gen --kingdom <dir>`).
  - (Sửa 2026-11-19, PS-28c, chờ người dùng chốt, §11) Thực tế: hàm nhận thêm cửa sổ ngày, `afterWrapUpOf(events, characters, window)`, như mọi số đo khác; phiên tính vào ngày của lời nhắc. Nhân vật vào sổ đo qua trường tùy chọn `characters` của `MetricsInput`, và `elvaria metrics` đọc thêm `characters/`. Dòng kết thúc không mang nhân vật nào đã đọc thì phiên vào dòng "không tộc". Phiên kết thúc vì `error` chỉ vào số được nhắc, không vào hai cột kia. Bảng nằm trước bảng cỡ prompt, kèm một dòng ở "Giới hạn đã biết".
  - (Sửa 2026-11-19, PS-28c) `docs/metrics-report.md` trong repo chưa sinh lại: bản đó sinh từ vương quốc thật, và phiên làm task không chạm vương quốc thật. Bảng có mặt từ lần `pnpm docs:gen --kingdom <dir>` kế tiếp.
- **Không làm**: đọc `stdout.jsonl` hay transcript của CLI; đổi hook; event mới.
- **Test**: ba phiên của lần (J) cho một dòng của tộc `gemini` với ba phiên được nhắc, một tự kết thúc, hai bị cắt, và trung vị 206 504 token. Dòng `wrap_up` không có dòng kết thúc (phiên còn chạy) không được tính. Lời nhắc theo thước phút không có số token thêm. Tộc không có phiên nào được nhắc không có dòng. Domain 100 %.
- **Xong khi**: `pnpm check` xanh; `elvaria metrics` trên một vương quốc thử in đúng bảng.
- **Chỗ chừa**: khi PS-28 đã có, bảng có thể thêm cột "tiếp sức" (số phiên có `limit` tăng giữa chừng).

## PS-28d — Canary lời nhắc của Claude (spike, tốn mana)

- **Mục tiêu**: trả lời câu (f) bằng một phép đo trên CLI thật. Phép đo có hai câu hỏi. Chuỗi mà hook `PostToolUse` trả trong `hookSpecificOutput.additionalContext` có tới model của Claude Code trong phiên headless không? Và khi chuỗi đó là lời nhắc thật của Elvaria, phiên có thu dọn và kết thúc không?
- **Ai chạy và tốn gì** (mục TL6): một phiên Claude Code của chủ nhân chạy, như spike PS-11a. Trần là 30 000 token cho cả spike. Phiên dừng và báo chủ nhân khi tổng đã dùng tới 25 000 token mà chưa xong. Spike chạy trong một thư mục tạm ngoài mọi vương quốc, không cần Nhiếp chính và không chạm `my-kingdom`.
- **Đọc trước**: [file dò](phase-2-probes/hook-reminder.md) mục 1 và mục 4 (mẫu canary đã viết cho Codex và agy); [cli-facts 2026-11-12](../reference/cli-facts-2026-11-12.md) §1.4 và [cli-facts 2026-11-16](../reference/cli-facts-2026-11-16.md) §1.4; [spike Claude](../spikes/claude-2026-11.md); `packages/hooks/src/wrap-up.ts`; `packages/runner-claude/src/settings.ts`; [runner.md](../../.claude/rules/runner.md) (phiên bản CLI đã đo).
- **Bước 1: chuỗi có tới model không.** Bước này dùng model rẻ nhất của tộc và tốn vài nghìn token.
  - Thư mục tạm có một file chữ ngắn. `settings.json` của lần chạy khai một hook `PostToolUse` là một script Node nhỏ. Script in ra đúng JSON của đường Claude, với `additionalContext` là một chuỗi canary ngẫu nhiên. Chuỗi đó không có trong prompt, trong file hay trong tên file nào.
  - Prompt bảo phiên đọc file, rồi chép lại nguyên văn mọi lời nhắc hệ thống nó nhận được sau lần đọc đó, và trả lời `NONE` nếu không có.
  - Phiên chạy bằng `claude -p` với `--settings`, `--output-format stream-json`, số lượt nhỏ và cùng bộ cờ quyền mà `runner-claude` dùng.
  - Kết luận là `có` khi câu trả lời chứa chuỗi canary, và là `không` khi câu trả lời là `NONE`. Phiên chạy hai lần để loại kết quả ngẫu nhiên.
- **Bước 2: lời nhắc thật có đổi cách làm không.** Bước này chỉ chạy khi bước 1 là `có`, và dùng model mà nhân vật tộc Claude hay làm việc nhất.
  - Thư mục tạm là một repo git tí hon có năm file chữ. Hook là hook thật của Elvaria (`hookCommand()` trên bản build), với `policy.json` vai `assignee` và một `run_dir` đã có sẵn `wrap-up.json` phiên bản 1.
  - Prompt giao một việc nhiều bước: đọc lần lượt năm file và viết tóm tắt từng file vào một file kết quả. Prompt kèm luật thư bàn giao rút gọn của prompt người làm.
  - Phiên quan sát hai điều. File `hook/wrap-up-reminded/<session>.json` có xuất hiện sau lời gọi tool đầu tiên không? Sau đó phiên có ngừng nhận việc mới, commit, viết `handover.md` rồi kết thúc trong vài lượt không, hay nó làm tiếp tới hết năm file?
- **Ghi lại**: file `docs/spikes/claude-wrap-up-<ngày>.md` ghi lệnh đã chạy, phiên bản CLI, model, số token đã tốn, kết luận `có` hay `không` cho từng bước và trích đoạn stream làm chứng. Một bản cli-facts mới theo ngày thay câu "chưa đo bằng CLI thật" ở §1.4. Một dòng §11 ghi kết quả.
- **Không làm**: sửa hook, runner hay prompt; chạy trên vương quốc thật; đo lại Codex và agy (đã đo ở #220).
- **Xong khi**: file spike có kết luận cho bước 1, và cho bước 2 nếu bước đó chạy; cli-facts nói đúng; tổng token nằm trong trần; `pnpm docs:check` xanh.
- **Hệ quả của kết quả** (mỗi hệ quả là một đề xuất ở dòng §11 của spike, không làm trong spike):
  - `có` ở cả hai bước: không đổi gì.
  - `không` ở bước 1: đề xuất một task sửa đổi dòng `claude` của bảng `ROUTES` (`packages/hooks/src/wrap-up.ts:53-77`) sang đường từ chối một lời gọi `PreToolUse`, như agy và Codex. Task đó nên xong trước lần chạy thật dài kế tiếp.
  - `có` ở bước 1 nhưng phiên không thu dọn ở bước 2: đề xuất sửa chữ của lời nhắc, và dùng bảng của PS-28c để đo trước và sau.
- **Kết quả** (2026-11-19, [spike](../spikes/claude-wrap-up-2026-11-19.md), Claude Code 2.1.327, 14 356 token): bước 1 là `có` ở cả hai lần với `claude-sonnet-5-5`. Bước 2 là `có` với `claude-opus-5-5`: sau lời nhắc phiên không đọc ghi chú nào, viết `handover.md` ở lượt kế tiếp rồi kết thúc. Ba chỗ thực tế khác kế hoạch:
  - Bước 2 không đo được phần commit. `wrap-up.json` có sẵn nên lời nhắc tới ngay sau lời gọi tool đầu tiên, khi phiên chưa có gì để commit. Phần đó chờ dấu vết tự nhiên ở bảng "Sau lời nhắc" của PS-28c.
  - Bước 2 cần một vương quốc giả trong thư mục tạm: `quests/<id>/handover.md` và `.runs/<id>-1/`, với id quest đúng dạng `QUEST_ID_SHAPE`. Thiếu nó thì hook bỏ `quest`, nên cổng Stop và journal tắt và phiên không giống phiên thật.
  - Bản cli-facts mới kéo theo bốn chỗ trỏ tới nó: CLAUDE.md, `.claude/rules/runner.md`, `docs/guides/repo-handbook.md` và `docs/guides/operating-a-kingdom.md`, như lúc thêm bản 2026-11-16. Bốn file này nằm ngoài cột "File chạm chính" của PS-28d.

## Chỗ dòng §11 khác code

Dòng §11 nguồn đúng về hướng. Sáu chỗ sau cần đọc chính xác hơn khi làm:

1. **"Ba thước"**: trong lúc phiên chạy chỉ có hai thước sống là phút và token (bảng trên, dòng 1). Số lượt không tới được nhịp của Nhiếp chính. CLI tự giữ trần lượt của nó.
2. **"Như `evaluateBreakers`"**: hàm đó không chọn thước gần cạn nhất (dòng 2). Thanh dùng cùng danh sách thước nhưng cần phép chọn riêng.
3. **"Trong lúc phiên chạy chỉ có `agent.session.wrap_up` và `agent.session.end`"**: đúng với số đã dùng. Riêng `wrap_up` chỉ có cho người làm, nên hôm nay phiên người chấm không để lại dòng nào về số đã dùng cho tới khi kết thúc.
4. **"Số mới phải cao hơn trần đang áp (`tokenCeilingOf`)"**: đúng, và trần đang áp gần như luôn là số đã hiệu chỉnh theo tộc chứ không phải `budget.max_tokens` (dòng 3). Hôm nay `quest show` không in cả ngân sách lẫn trần.
5. **"Lời nhắc ở 85 %"**: với tộc báo số đã dùng theo bước lớn, lần đọc đầu tiên qua mốc có thể đã quá 100 % (phiên 3 của lần (J)). Thanh có thể đi thẳng từ vùng `ok` qua mốc nhắc trong một dòng.
6. **"Mốc vàng giả định lời nhắc tới được"**: kế hoạch bỏ giả định này. Vùng vàng chỉ nói phiên đã qua mốc nhắc.

## Sửa tài liệu khi làm

- [§3.4](../implementation-plan/3.4-breakers.md): đoạn "Thể lực" (PS-28) và câu về chuông ở mốc mềm (PS-28b).
- `packages/i18n/src/glossary.json`: thuật ngữ `stamina`, dòng event (PS-28). Hai file locale (PS-28b).
- [operating-a-kingdom.md](../guides/operating-a-kingdom.md): mục tiếp sức (PS-28b).
- Không ADR nào đổi. ADR 0030 giữ nguyên: thể lực chỉ hiển thị, không quyết định gì. ADR 0009 giữ nguyên: thể lực không phải mana và không đi vào ước lượng mana.

## Quyết định (chủ nhân chốt 2026-11-19, theo khuyến nghị; TL6 chủ nhân đổi)

Chủ nhân chốt trong phiên kế hoạch, qua hộp hỏi đáp: TL1–TL5 và TL7–TL10 theo khuyến nghị dưới đây. Riêng TL6 chủ nhân chọn phương án khác.

**Cần trước khi mở task** (ghi task liên quan):

- **TL1** (mọi task) Cách chia và id: PS-28, PS-28b, PS-28c như bảng ở "Tổng quan". Khuyến nghị: nhận. Lý do: mỗi task vừa một context và không task nào quá 4 ý. PS-28c đứng riêng vì nó ở vùng sổ đo và không cần hai task kia. (Sau lời chốt TL6, bảng có thêm PS-28d.)
- **TL2** (PS-28) Event mới tên `agent.session.usage`, do Nhiếp chính ghi cho cả hai vai, data gồm `role`, `measure`, `used`, `limit`, `pct`, `soft_pct`, `hard_pct`. Nấc là 10 % của **thanh**, tức là của quãng tới ngưỡng cắt. Nhiếp chính ghi thêm một dòng khi trần đổi. Khuyến nghị: nhận. Phương án khác: nấc là 10 % của trần danh nghĩa. Khi đó mỗi phiên có tới 15 dòng, và nấc không trùng với ô của thanh.
- **TL3** (PS-28) Thuật ngữ `stamina` (VI "Thể lực", EN "Stamina") và định nghĩa thanh ở "Tổng quan": thanh là giá trị suy từ sổ sự kiện, không lưu ở đâu và không là trường của `WorldState`. Vùng đỏ bắt đầu khi thanh còn 20 %. Thanh của người chấm không có mốc nhắc. Khuyến nghị: nhận. Lý do: giữ được phép thử P0-09, và một nguồn cho mọi nơi hiển thị.
- **TL4** (PS-28b) Chuông ở mốc `soft_pct` rung cho cả phiên người làm lẫn phiên người chấm, mỗi phiên một lần, với chữ riêng cho từng vai. Chỉ có chuông, không có mục bản tấu. Khuyến nghị: nhận. Lý do: người chấm bị cắt thì cả lượt chấm bỏ đi và mở lại từ đầu, không có "đi tiếp" như người làm, nên tiếp sức cho người chấm đáng giá hơn. Bản tấu là file của cả ngày, còn mốc này chỉ có nghĩa trong vài phút. Phương án khác: chỉ rung cho người làm, ít chuông hơn.
- **TL5** (PS-28b) Khi `quest edit --max-tokens` đặt một số không có tác dụng, CLI vẫn gửi lệnh rồi in cảnh báo kèm số nhỏ nhất có tác dụng, như cách `quest edit` nói về phút hôm nay. Khuyến nghị: nhận. Phương án khác: CLI từ chối gửi. Cách này chặt hơn, nhưng số đó vẫn là một ngân sách hợp lệ cho các phiên sau khi hệ số của tộc đổi.

**Chờ được**:

- **TL6** Câu (f). Khuyến nghị của phiên là chờ dấu vết tự nhiên và để PS-28c trả lời bằng số, vì thanh không dựa vào câu trả lời và PS-28c tốn 0 mana. **Chủ nhân chốt khác: chạy canary ngay**, tức là một phiên Claude nhỏ có trần thấp và một chuỗi canary, khoảng 20 000 tới 30 000 token, do một phiên của chủ nhân chạy. Hệ quả: thêm task PS-28d với trần 30 000 token. PS-28c vẫn giữ theo TL1.
- **TL7** Thanh trong thế giới 3D và khách nhẹ: chưa mở task. Kế hoạch chỉ ghi hợp đồng (`sessionStaminaOf`) vào "Gợi ý cho task khác" cho các việc P2-01, P2-04 và P2-07. Khuyến nghị: nhận, theo ý (e).
- **TL8** Cột thể lực trong `quest list` và `character list`: chưa làm. Khuyến nghị: xét sau khi chủ nhân đã dùng `quest show` vài ngày.
- **TL9** Hook ghi một dòng event lúc trao lời nhắc (biên nhận trong sổ, thay cho thư mục `wrap-up-reminded/`), và lời nhắc cho người chấm: chưa làm. Khuyến nghị: xét sau khi PS-28c có số.
- **TL10** Thước lượt sống trong lúc phiên chạy (runner báo lượt trong tín hiệu `usage`): chưa làm. Khuyến nghị: chỉ làm khi sổ đo cho thấy phiên bị cắt vì lượt mà thanh không báo trước.

## Gợi ý cho task khác (không sửa mục của chúng)

- **P2-01, P2-04, P2-07** ([phase-2.md](phase-2.md)): thanh thể lực trên HUD dựng bằng `sessionStaminaOf` trên các dòng Sứ giả đã gửi. `WorldState` không cần trường mới. UI muốn cho thấy trần đang áp của quest chưa có phiên thì cần thêm trường vào `QuestView`, và đó là đổi hợp đồng dữ liệu.
- **P2-03, P2-08**: chuông máy tính và chuông điện thoại nói loại `Notice` `wrap_up` của PS-28b. Dòng chuông cần chỗ cho một câu lệnh hay một nút.
- **P2-05, P2-10** (triệu hồi): §10 câu 1 hỏi thời gian chờ trong khung chat có tính vào trần phút không. Với thanh, câu hỏi đó thành "thanh có tụt trong lúc nhân vật chờ chủ nhân gõ không".
- **PS-16** (trần cỡ diff): cùng thư mục `packages/domain/src/breaker/**`. Trần cỡ diff không phải một thước của thanh, vì nó không cắt phiên.
- **Sửa nhỏ, chưa ai nhận**: lý do trạm quân y khi CLI tự dừng lấy `budget.max_tokens` thay cho trần đang áp (bảng trên, dòng 14).
