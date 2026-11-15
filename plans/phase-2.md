# Giai đoạn 2 của Elvaria chạy được: (F) trần mềm và phiên tiếp tự động, (G) ước lượng và trần token, rồi P2-01…P2-11

## Summary

**Mục tiêu.** Trước mọi việc của giai đoạn 2, Nhiếp chính có hai cơ chế mới mà báo cáo PS-07 (`docs/guides/phase-1.5-report.md` mục 15 và 22) đòi: **(F)** trần mềm và phiên tiếp tự động (khoảng 85 % trần token, phút hay lượt thì bảo phiên dừng, commit, viết thư; cắt cứng khoảng 150 %; phiên bị cắt mà có tiến triển thì tự mở phiên tiếp từ thư; trạm quân y chỉ sau hai lần cắt liền không tiến triển; luật này chỉ cho ba trip trần `time`, `tokens`, `turns`, còn `commit`, `secrets`, `forbidden_paths`, `no_session` vẫn vào trạm quân y để chủ nhân xem trước như hôm nay; trần lượt theo tộc) và **(G)** ước lượng và trần token (lượt đầu thật bằng 182 % ước lượng; đếm token theo cách của từng tộc, hệ số khởi đầu 1,82, tự hiệu chỉnh theo tộc khi đủ khoảng 10 phiên mẫu). Sau đó là các việc `P2-…` theo thứ tự đợt của `docs/plans/phase-2.md` §4, tới mốc P2-11.

**Cách chia: 12 quest con** (trần của danh sách là 12, nên việc của đợt xa được giao cho pháp sư lập kế hoạch khi tới lượt, lúc code đã có Sứ giả và ui):

1. d1 · (F) domain: trần mềm, cắt cứng, trần lượt theo tộc — hiệp sĩ, C.
2. d2 · (F) domain: phiên tiếp sau lần cắt có tiến triển, máy trạng thái — hiệp sĩ, B.
3. d3 · (F) dò: hook của từng tộc có đưa được lời nhắc tới model giữa phiên không (tài liệu chính thức, mã nguồn, điều repo đã đo) — trinh sát, D.
4. d4 · (F) hooks: lời nhắc "dừng, commit, viết thư" tới model, chỉ qua đường d3 kết luận `có` — người lùn, C.
5. d5 · (F) Nhiếp chính: ghi tín hiệu trần mềm, đo tiến triển, tự mở phiên tiếp — hiệp sĩ, B.
6. d6 · (G) domain: hệ số token và trần lượt hiệu chỉnh theo tộc — hiệp sĩ, C.
7. d7 · (G) Nhiếp chính và `elvaria metrics --plan` dùng hệ số đó — hiệp sĩ, C.
8. d8 · Cổng đợt 0: xác nhận PS-08d và PS-09 đã xong — trinh sát, E.
9. d9 · Kế hoạch đợt 1: P2-01, P2-03, P2-04, P2-06 — pháp sư, B.
10. d10 · Cổng giao diện: xác nhận PS-11 (và PS-11b) đã xong — trinh sát, E.
11. d11 · Kế hoạch P2-02 (đội ui-kit và ui) — pháp sư, B.
12. d12 · Kế hoạch đợt 3, 4 và mốc: P2-07, P2-08, P2-09, P2-11 — pháp sư, B.

**Thứ tự.** d1 → d2 → d3 → d4 → d5 → d6 → d7 nối đuôi nhau, một quest một lúc, nên chúng không cần hàng đợi merge: mỗi quest dựng đất trên nhánh của quest trước (`plotBaseOf`). Phần hook d4 chờ kết quả dò d3. Sau d7 là cổng d8; mọi việc có thể chạy song song đứng sau d8. Sau d8: d9 và d10 chạy cùng lúc; d11 sau d10 và d9; d12 sau d9 và d11. P2-10 chỉ giữ chỗ ở cuối kế hoạch này.

**Rủi ro.** (1) (F) đổi luật "cầu dao ⇒ trạm quân y" của §3.4 và máy trạng thái (vùng "Đọc trước khi sửa"): d2 cần một ADR mới. (2) Chưa ai đo được một CLI có chuyển lời của hook tới model giữa phiên hay không, với Codex và agy: d3 dò bằng tài liệu chính thức và mã nguồn; tộc d3 không kết luận `có` thì chỉ có cắt cứng cho tới khi chủ nhân đo ở lần chạy thật (xem Unknowns). (3) Danh sách tag của vương quốc hôm nay chưa có `visual` (vương quốc chưa nâng qua PS-11), nên các quest giao diện chỉ được tạo khi d11 và d12 chạy, sau khi vương quốc có tag đó. (4) Ba pháp sư d9, d11, d12 cùng ghi `subquests.json` ở gốc, nên chạy lần lượt.

**Ước lượng tổng** (đếm như cầu dao đếm, trước hệ số của (G)): khoảng 5,4 triệu token, khoảng 13 giờ phiên, ngữ cảnh đỉnh mỗi quest dưới 100 nghìn token (trần vương quốc 120 nghìn). Ba kế hoạch con sẽ thêm việc của chính chúng; P2-01 … P2-11 ước khoảng 25–30 quest nữa.

**Chủ nhân cần biết trước khi đóng dấu.** (a) Dấu trên kế hoạch này duyệt luôn bảy dependency mới ở Shared decisions, một lần cho cả giai đoạn. (b) Cổng d8 và d10 là quest đọc §8: nếu PS-08d, PS-09 hay PS-11 chưa xong, trinh sát hỏi chủ nhân và quest chờ. (c) Sau d7, nâng `my-kingdom` lên bản có (F) và (G) trước khi các quest sau chạy, để chúng hưởng trần mới. (d) Trước d11, nâng vương quốc lên bản có PS-11 và PS-11b (tag `visual`). (e) Check chụp ảnh của lãnh thổ là cấu hình lãnh thổ ngoài repo: d11 viết lệnh, chủ nhân khai check.

## Survey

- `docs/plans/phase-2.md`: §3 bảng P2-01…P2-11 và cột "Cần xong trước", §4 sáu đợt, §5 bài học, §6 bảy câu. Dòng chốt 2026-11-15 ở §3: P2-02 nhận điều kiện xong chuyển từ PS-11 ("một quest giao diện thật mang tag `visual` bị trả về khi ảnh lệch thiết kế"), và lãnh thổ cần một check chụp ảnh ghi ảnh vào `ELVARIA_SCREENS_DIR`.
- `docs/implementation-plan.md` dòng 148–162: Sứ giả chỉ bind `127.0.0.1`; mọi hành động chỉ ghi `inbox/`; protocol `snapshot | events | command` đã có trong `packages/domain/src/protocol` (`encodeMessage`, `decodeServerMessage`, `decodeClientMessage`, `reduce`, `worldStateOf`); "token Bearer trong header" không dùng được cho trình duyệt, P2-01 chọn cách khác; tộc là danh sách mở ở mọi lớp hiển thị (`kingdom.tribes[]`, `tribeLookOf`).
- Cầu dao hôm nay: `packages/domain/src/breaker/evaluate.ts` (`evaluateBreakers`: thời gian cắt đúng lúc hết, token và lượt cắt khi vượt; tộc `minutes_only` chỉ có thời gian), `breakers.ts` (`breakersOf`, `tokenCeilingOf`: người chấm nhân `verifier_tokens_multiplier`), `tokens.ts` (`countedTokens`: đọc cache tính một phần mười). Mặc định ở `packages/domain/src/constants.ts`: `mana_multiplier: 2`, `max_turns: 200`, `context_budget_tokens: 120_000`, `verifier_tokens_multiplier: 2`. Schema `breakers` ở `packages/domain/src/schema/kingdom.ts` (279 dòng, gần trần 300).
- Phía Nhiếp chính: `packages/steward/src/sessions/breaker.ts` (`breakAssignee`: đầm lầy, kết thúc phiên, commit WIP, thư tối thiểu, trạm quân y kèm chuông), `stop-letter.ts` (`writeStopLetter`, `cutLetterOf`: thư tối thiểu khi phiên bị cắt mà không viết thư), `continuation.ts` (`continuationOf`: `reason: 'revive'` cho phiên hồi sinh). Mục attempt (`AttemptSchema`, `packages/domain/src/schema/quest/quest-parts.ts`) có `tokens`, không có lượt hay tiến triển.
- Sổ đo kế hoạch: `packages/domain/src/metrics/plan-accuracy.ts` (`planAccuracyOf`: `estimate` so với `first_run` của mỗi phần) và `apps/cli/src/metrics/view-plan.ts`. Số đo PS-07: kế hoạch 2 750 000 token, lượt đầu thật 5 015 622 (182 %), từng phần 96–345 %; năm lần cắt ở 101 % trần khi phiên đang làm tốt; Codex đếm mỗi lệnh nhỏ là một lượt.
- Hooks: `packages/hooks/src/{claude,codex,antigravity}/translate.ts`, `handover.ts` (cổng thư ở `Stop`), `run-state.ts`; dữ kiện CLI ở `docs/reference/cli-facts-2026-11-12.md` §1.4 (Claude: 12 sự kiện hook; `Stop` với `decision: block` giữ phiên chạy tiếp) và dòng 197 (agy: `.agents/hooks.json`, bốn sự kiện).
- Ranh giới: `packages/config/boundaries.mjs` đã khai sẵn `herald`, `ui-kit`, `ui`, `world`, `lite` và `NO_NODE_TYPES`; các package đó chưa có thư mục. Chưa có `packages/herald`, `packages/ui-kit`, `packages/ui`, `apps/lite`.
- Chuông: `ConsoleBell` ở `apps/cli/src/run/bell.ts` (`lineOf` dịch mọi `Notice` qua `t()`); kiểu `Bell` ở `@elvaria/steward`.
- Danh mục script (`packages/registry-default/scripts.json`): `link-check`, `run-check`, `count-files`, `diff-stat`, `compare-numbers`, `todo-scan`; không script nào nhập được `design/`.
- Luật lãnh thổ: `design/**` là đường cấm với mọi phiên (hook từ chối cả đọc), nên chỉ script chạy bằng máy đọc được `design/`; mọi phiên sau đó đọc `packages/ui-kit`.
- Quyết định đã ghi phải giữ: ADR 0005 (chỉ Nhiếp chính ghi trạng thái; P2-09 sửa nó), ADR 0008 (người làm không phán), ADR 0013 (che secret), ADR 0017 (một quest một context, script khi máy làm được), §3.4 (cầu dao), PS-11 (P) và (R) (tag `visual`, người chấm không có `vision` bị loại), §11 ngày 2026-11-15 mục (114) ((F), (G) đứng đầu).

## Shared decisions

**Dependency mới của cả giai đoạn 2** (chủ nhân duyệt một lần cùng dấu trên kế hoạch này; quest thêm một dependency ghi lý do trong commit và khai `pnpm-lock.yaml` cùng `package.json` của nó trong vùng):

- `ws` — WebSocket của Sứ giả (P2-01).
- `node-notifier` — chuông máy tính (P2-03, câu §6.4).
- Vite — build của ui và khách nhẹ (P2-02, P2-07).
- Preact — thành phần giao diện (P2-02).
- `@preact/signals` — trạng thái của khách nhẹ (P2-02, P2-07).
- Playwright — chụp ảnh của check giao diện và e2e của mốc (P2-02, P2-11).
- `web-push` — chuông trên điện thoại qua PWA, không dịch vụ bên thứ ba (P2-08, câu §6.4).

**(F) trần mềm và phiên tiếp:**

- Trần 100 % của một phiên là số `tokenCeilingOf` trả (token), `quest.budget.max_minutes` (phút) và trần lượt theo tộc `turnCeilingOf` (lượt). (F) đặt mức trên trần đó; (G) đổi cách tính trần, không đổi các mức.
- Hai trường mới của `kingdom.breakers`: `soft_pct` mặc định 85 và `hard_pct` mặc định 150, có mặc định trong `BREAKER_DEFAULTS` nên `kingdom.json` cũ vẫn đọc được.
- `evaluateBreakers` trả thêm một kết quả `wrap_up` (vượt `soft_pct` ở một trong ba thước, chưa tới `hard_pct`); cắt cứng ở `hard_pct`. Tộc `minutes_only` vẫn chỉ có thước phút.
- Trần lượt theo tộc: trường tùy chọn `max_turns` trên mục tộc của `kingdom.tribes[]`; vắng thì lấy `breakers.max_turns` (lời chủ nhân đã nhận). (G) hiệu chỉnh giá trị này từ số đo.
- Tín hiệu trần mềm: Nhiếp chính ghi một lần mỗi phiên file `<run_dir>/wrap-up.json` (`{"version": 1, "measure": "tokens" | "minutes" | "turns", "used": n, "limit": n, "pct": n}`) và một event mới `agent.session.wrap_up`; hook của Elvaria đọc file đó và đưa lời "dừng, commit, viết thư bàn giao" vào phiên ở lượt tool kế tiếp, chỉ qua sự kiện và trường mà file dò `plans/phase-2-probes/hook-reminder.md` (d3) kết luận `có` cho tộc đó.
- Tiến triển của một phiên bị cắt: nhánh của quest có commit mới trong phiên, hoặc commit WIP của Nhiếp chính sau lần cắt có thay đổi (`commitPlot` trả `committed`). Mục attempt thêm trường tùy chọn `progress` (thêm sau v1, không tăng `version`, như `out_of_scope`).
- Phiên tiếp tự động chỉ dành cho ba trip trần `time`, `tokens`, `turns`. Các trip `commit`, `secrets`, `forbidden_paths`, `no_session` giữ nguyên đường hôm nay (trạm quân y, chủ nhân xem trước, `packages/domain/src/quest/events.ts` dòng 14–26): không đo tiến triển, không tự mở phiên tiếp, không đụng chuỗi đếm. Lý do: sau `forbidden_paths` Nhiếp chính không commit gì vì một chương trình đã sửa đường cấm; tự đi tiếp sẽ cho một phiên mới chạy trên đất đó trước khi chủ nhân xem. d2 và d5 mỗi quest có test cho thấy bốn trip này không mở phiên tiếp, kể cả khi nhánh có commit mới.
- Sau lần cắt có tiến triển (ở một trong ba trip trần): cùng lượt `n`, cùng người làm, một phiên mới đọc thư (`continuation.reason: 'revive'`), không tăng `attempts`. Trạm quân y chỉ khi hai lần cắt liền nhau trong cùng lượt đều không tiến triển; không có trần số lần đi tiếp, nên lần cắt có tiến triển luôn đi tiếp và xóa chuỗi đếm (đúng luật (F) của chủ nhân).
- Người chấm không có phiên tiếp: vượt `hard_pct` thì đi đường `review.breaker` như hôm nay.

**(G) ước lượng và trần token:**

- Mỗi tộc giữ cách đếm token của mình (lời chủ nhân); không chuẩn hóa giữa các tộc.
- Hệ số token theo tộc: trường mới `breakers.estimate_factor` mặc định 1,82; khi một tộc có từ `CALIBRATION_MIN_SAMPLES` (10) lượt đầu của người làm có `estimate.tokens > 0`, hệ số của tộc đó là trung vị của `tokens lượt đầu / estimate.tokens`. Hàm thuần trong domain đọc file quest và nhân vật, không đọc sổ sự kiện, để Nhiếp chính tính mỗi nhịp.
- Trần lượt theo tộc hiệu chỉnh cùng cách, từ trường tùy chọn mới `turns` của mục attempt; khi chưa đủ mẫu thì `max_turns` của tộc hay `breakers.max_turns`.
- `elvaria metrics --plan` in hệ số và số mẫu của mỗi tộc, từ đúng hàm đó.
- Ước lượng trong `subquests.json` (của kế hoạch này và ba kế hoạch con) là số pháp sư đếm theo cách của cầu dao, chưa nhân hệ số; hệ số do Nhiếp chính nhân lúc tính trần.

**Luật chung cho mọi quest con và mọi kế hoạch con:**

- Ngữ cảnh đỉnh dưới 120 nghìn token (trần vương quốc, chặt hơn mốc khoảng 200 nghìn của §5); việc giao diện chia theo màn và theo thành phần, không theo package.
- Việc máy làm được là script: nhập `design/`, sinh icon, chụp ảnh do script chạy, phiên chỉ viết và test script.
- File nóng khai trước: `packages/i18n/src/glossary.json`, hai file locale, `apps/cli/src/commands.ts`, `packages/domain/src/index.ts` và file sinh là đường chung của lãnh thổ (không ghi vào vùng); `packages/domain/src/schema/event/event-types.ts`, `packages/config/boundaries.mjs`, `pnpm-lock.yaml` thì quest chạm phải khai trong vùng của mình, để Nhiếp chính không chạy hai quest đó cùng lúc.
- `packages/config/boundaries.mjs` đã khai sẵn năm package của giai đoạn 2; quest nào cần sửa nó (thêm tsconfig, đổi deps) thì một quest duy nhất của mỗi kế hoạch con làm, các quest khác chờ nó.
- Check không dùng tài nguyên chung: test của Sứ giả và e2e mở cổng ngẫu nhiên và một vương quốc tạm cho mỗi lần chạy; không check nào cần khóa `exclusive`.
- Người chấm khác họ model với mọi người làm (ADR 0008, luật của vương quốc). Mọi quest giao diện mang tag `visual` (PS-11 (P)) để chỉ người chấm có `vision` chấm nó (PS-11 (R)).
- Câu §6 đã trả lời: 4 — chuông điện thoại qua PWA, chuông máy bàn qua thư viện ở trên, không dịch vụ bên thứ ba; 5 — Sứ giả chỉ nghe `127.0.0.1`, không nghe LAN, đường hầm là cấu hình ngoài chủ nhân dựng bằng Tailscale, P2-11 viết một trang hướng dẫn; 6 — có, lệnh từ điện thoại là một kind inbox mới, Nhiếp chính chạy Tể tướng qua một cổng tiêm vào, sửa ADR 0005, bản nháp vẫn chờ chủ nhân xác nhận; 7 — triệu hồi là chat trong phiên đang chạy, P2-10 chỉ giữ chỗ.

## Sub-quests

Cỡ file đọc tính theo byte (bốn ký tự một token). Đồ thị code: lãnh thổ này không có mục đồ thị trong prompt, nên vùng ảnh hưởng đếm bằng tìm kiếm.

**d1 · (F) domain: trần mềm, cắt cứng, trần lượt theo tộc.** Đổi `evaluateBreakers` và `breakersOf` (kết quả `wrap_up`, cắt ở `hard_pct`), thêm `soft_pct`, `hard_pct` (không thêm `estimate_factor`: đó là của d5), `tribes[].max_turns` (trường tùy chọn của `TribeSchema`, `strictObject` ở `packages/domain/src/schema/tribe.ts` dòng 44, mà `kingdom.ts` dòng 237 dùng cho `kingdom.tribes[]`), `turnCeilingOf`, event `agent.session.wrap_up`. Vùng: `packages/domain/src/breaker/**`, `packages/domain/src/schema/kingdom*.ts`, `packages/domain/src/schema/tribe.ts`, `packages/domain/src/schema/tribe.spec.ts`, `packages/domain/src/schema/event/**`, `packages/domain/src/constants.ts`, `packages/domain/examples/**`, `packages/domain/README.md`, `docs/implementation-plan/3.4-breakers.md`. Vùng ảnh hưởng: `packages/steward/src/sessions/breaker.ts`, `packages/steward/src/tick.ts` (gọi `breakersOf`), spec của steward về cầu dao (khoảng 5 file). Đọc: `evaluate.ts` (4 KB), `breakers.ts` (4 KB), `kingdom.ts` (12 KB), `tribe.ts` (6 KB), spec của chúng (khoảng 33 KB), `event-types.ts`. Khoảng 58 lượt, ngữ cảnh đỉnh 90 nghìn, 490 nghìn token. Hiệp sĩ: cần `pnpm test`, `pnpm typecheck` và `pnpm schemas`, `pnpm docs:gen`.

**d2 · (F) domain: phiên tiếp sau lần cắt có tiến triển.** Máy trạng thái: lần cắt `time`, `tokens` hay `turns` có `progress` của người làm đưa quest về phiên tiếp cùng lượt; chỉ hai lần cắt liền nhau không tiến triển mới vào trạm quân y, với mã lý do mới; không trần số lần đi tiếp; `commit`, `secrets`, `forbidden_paths`, `no_session` giữ nước hôm nay, có test; trường `progress` của attempt; ADR mới cho luật cầu dao (§3.4 cũ "cầu dao ⇒ trạm quân y"). Vùng: `packages/domain/src/quest/**`, `packages/domain/src/breaker/**`, `packages/domain/src/infirmary/**`, `packages/domain/src/schema/quest/**`, `packages/domain/README.md`, `docs/contracts/infirmary-reason-codes.md`, `docs/adr/**`, `docs/implementation-plan/2-data-and-events.md`, `docs/implementation-plan/3.4-breakers.md`, `packages/steward/src/sessions/reason-codes.spec.ts`. Vùng ảnh hưởng: mọi chỗ dựng `Quest` (fixture của steward, spec của apps/cli `quest/` và `metrics/`, khoảng 10 file) chỉ khi trường thành bắt buộc, nên trường để tùy chọn. Đọc: `transitions.ts`, `transition.ts`, `effects.ts` và spec (khoảng 60 KB, đọc theo đoạn), `reasons.ts`. Khoảng 70 lượt, ngữ cảnh đỉnh 100 nghìn, 660 nghìn token. Hiệp sĩ, như d1.

**d3 · (F) dò đường lời nhắc của hook.** Quest `research`: trinh sát đọc điều repo đã đo (`docs/reference/cli-facts-2026-11-12.md`, `docs/spikes/`, phiên bản ở `.claude/rules/runner.md`), rồi tài liệu chính thức về hook của Claude Code và Antigravity và mã nguồn mở của Codex (kho `openai/codex`) trên web, và ghi `plans/phase-2-probes/hook-reminder.md`: mỗi tộc một kết luận `có` / `không` / `chưa rõ`, kèm sự kiện, trường đầu ra, phiên bản và nguồn trích nguyên văn; `có` chỉ khi repo đã đo hay tài liệu chính thức hoặc mã nguồn nói rõ chữ tới model. Mục cuối ghi cách chủ nhân đo các tộc `chưa rõ` ở lần chạy thật kế tiếp. Đây là cách dò hợp lệ trong luật lãnh thổ: nhân vật không chạy CLI thật (`docs/plans/phase-2.md` §2), trinh sát có web và không có shell. Vùng: `plans/phase-2-probes/hook-reminder.md`. Đọc: các đoạn cli-facts và spike tìm theo từ khóa (khoảng 30 KB), năm tới mười trang web. Khoảng 25 lượt, ngữ cảnh đỉnh 60 nghìn, 220 nghìn token. Trinh sát: đọc, ghi một file, có web.

**d4 · (F) hooks: lời nhắc trần mềm tới model.** Chờ d3. Hook đọc `<run_dir>/wrap-up.json` một lần và đưa lời nhắc vào phiên chỉ qua sự kiện và trường mà d3 kết luận `có`; tộc `không` hay `chưa rõ` thì hook im và cắt cứng làm việc. Vùng: `packages/hooks/**`, `packages/runner-claude/src/settings.ts`, `packages/runner-codex/src/**`, `packages/runner-antigravity/src/**`, `docs/reference/**`, `elvaria.patch` cho `.claude/rules/**` nếu cần. Vùng ảnh hưởng: không package nào import hook ngoài runner (bản `dist/`). Đọc: file dò của d3, `handover.ts`, `run-state.ts`, ba `translate.ts` (khoảng 40 KB). Khoảng 50 lượt, ngữ cảnh đỉnh 80 nghìn, 390 nghìn token. Người lùn: cần `pnpm build` cho `dist/` của hook.

**d5 · (F) Nhiếp chính.** Kết quả `wrap_up` thì ghi file tín hiệu và event một lần; lần cắt cứng ở `time`, `tokens`, `turns` đo tiến triển (bốn trip khác giữ đường hôm nay, có test), truyền `progress` cho domain và mở phiên tiếp khi domain bảo; thư tối thiểu như cũ; chuông chỉ khi vào trạm quân y. Vùng: `packages/steward/**`, `packages/runner-core/prompts/**`, `packages/runner-core/src/prompt/**`, `docs/implementation-plan/3.1-steward.md`, `docs/guides/operating-a-kingdom.md`. Vùng ảnh hưởng: `apps/cli/src/run/**` (dựng Nhiếp chính), snapshot prompt của runner-core. Đọc: `sessions/breaker.ts` (10 KB), `stop-letter.ts` (9 KB), `continuation.ts` (6 KB), `tick.ts`, spec cầu dao của steward (khoảng 40 KB, đọc theo đoạn). Khoảng 70 lượt, ngữ cảnh đỉnh 100 nghìn, 660 nghìn token. Hiệp sĩ.

**d6 · (G) domain: hiệu chỉnh theo tộc.** `breakers.estimate_factor` (1,82), `CALIBRATION_MIN_SAMPLES` (10), hàm `calibrationOf(quests, characters, kingdom)` trả hệ số token và trần lượt mỗi tộc; `tokenCeilingOf` và `turnCeilingOf` đọc nó; trường `turns` của attempt; cách tính `budget.max_tokens` lúc tạo quest đổi theo (giữ được lệnh nâng trần `edit_quest`). Vùng: `packages/domain/src/breaker/**`, `packages/domain/src/metrics/**`, `packages/domain/src/schema/quest/**`, `packages/domain/src/schema/kingdom*.ts`, `packages/domain/src/quest/budget*.ts`, `packages/domain/src/constants.ts`, `packages/domain/examples/**`, `packages/domain/README.md`, `docs/implementation-plan/3.4-breakers.md`. Vùng ảnh hưởng: `apps/cli/src/quest/**` (tạo quest), `packages/chancellor/**` (bản nháp mang `estimate`), khoảng 6 file. Đọc: `plan-accuracy.ts` (9 KB), `breakers.ts`, nơi tính `budget` (tìm `mana_multiplier`). Khoảng 55 lượt, ngữ cảnh đỉnh 85 nghìn, 460 nghìn token. Hiệp sĩ.

**d7 · (G) Nhiếp chính và sổ đo.** Nhiếp chính ghi `turns` vào mục attempt khi phiên kết thúc, tính `calibrationOf` mỗi nhịp và truyền cho `breakersOf`; `elvaria metrics --plan` in hệ số, số mẫu và nguồn (mặc định hay đo). Vùng: `packages/steward/src/**`, `packages/steward/README.md`, `apps/cli/src/metrics/**`, `apps/cli/README.md`, `docs/guides/operating-a-kingdom.md`. Đọc: `view-plan.ts`, `metrics.ts`, `sessions/settle.ts`, `tick.ts`. Khoảng 50 lượt, ngữ cảnh đỉnh 80 nghìn, 400 nghìn token. Hiệp sĩ.

**d8 · Cổng đợt 0.** Trinh sát tìm dòng PS-08d và PS-09 ở bảng §8 (`docs/implementation-plan.md`, tìm theo mã, không đọc cả file), chép nguyên ô Trạng thái vào `plans/phase-2-gates/wave-0.md`; chưa `xong` thì hỏi chủ nhân và dừng. Vùng: `plans/phase-2-gates/wave-0.md`. Khoảng 8 lượt, ngữ cảnh đỉnh 30 nghìn, 40 nghìn token. Trinh sát: chỉ đọc và ghi một file.

**d9 · Kế hoạch đợt 1.** Pháp sư chia P2-01 (Sứ giả lõi, đường găng), P2-03 (chuông máy tính: `DesktopBell` cạnh `ConsoleBell`, cùng `lineOf`, `node-notifier` qua cổng tiêm vào, test với notifier giả; một quest người lùn hạng D), P2-04 (trạng thái thế giới cho điện thoại) và P2-06 (Nhà thơ, biên niên sử) thành quest con, viết `plans/phase-2-wave-1.md` và `subquests.json`. Vùng: hai file đó. Đọc: `docs/plans/phase-2.md` (14 KB), kế hoạch này, `packages/domain/src/protocol/**`, `world/**`, `schedule/**`, `apps/cli/src/triage/job.ts`. Khoảng 70 lượt, ngữ cảnh đỉnh 100 nghìn, 700 nghìn token. Pháp sư.

**d10 · Cổng giao diện.** Như d8, cho PS-11 và PS-11b; ghi `plans/phase-2-gates/ui.md`. Khoảng 8 lượt, 30 nghìn, 40 nghìn token. Trinh sát.

**d11 · Kế hoạch P2-02.** Pháp sư chia đội ui-kit và ui: phần nhập (script do máy chạy), phần nền, phần thành phần theo màn, check chụp ảnh; ghi `plans/phase-2-ui.md` và `subquests.json`. Đọc: `docs/plans/phase-2.md`, `docs/plans/phase-2-wave-0.md` theo mục PS-11 (54 KB, tìm theo mã), `packages/domain/src/tribe/**`, `docs/guides/repo-handbook.md`. Khoảng 70 lượt, 100 nghìn, 700 nghìn token. Pháp sư.

**d12 · Kế hoạch đợt 3, 4 và mốc.** Pháp sư chia P2-07 (khách nhẹ: bản đồ, ngai vàng), P2-08 (chuông điện thoại, `MBell` có ba nút `answer`, `retry`, nâng trần), P2-09 (khung Tể tướng, sửa ADR 0005) và P2-11 (mốc: `Flow6`, hướng dẫn đường hầm Tailscale, cờ tắt đường hầm, lần chạy thật, báo cáo với số đo can thiệp); bước đầu kiểm việc của d9 và d11 đã có trong code. Ghi `plans/phase-2-phone.md` và `subquests.json`. Khoảng 70 lượt, 100 nghìn, 700 nghìn token. Pháp sư.

**P2-10 · Khung chat triệu hồi (giữ chỗ).** Chưa chia quest con. Chờ spike P2-05 của chủ nhân, chờ chủ nhân chốt §10 câu 1, và chờ P2-07. Khi đủ, chủ nhân mở một quest kế hoạch riêng.

## Done when

- `pnpm check` xanh trên `main` sau khi mọi quest con (và quest con của d9, d11, d12) đã ghép.
- d1, d2, d4–d7: `pnpm --filter @elvaria/domain test` (coverage 100 %), `pnpm --filter @elvaria/steward test`, `pnpm --filter @elvaria/hooks test`, `pnpm --filter @elvaria/cli test` xanh; một spec của steward cho thấy phiên bị cắt có tiến triển được mở lại tự động (cả sau nhiều lần cắt liền có tiến triển), và hai lần cắt liền không tiến triển vào trạm quân y; spec của domain và của steward cho thấy trip `commit`, `secrets`, `forbidden_paths`, `no_session` không tự mở phiên tiếp.
- d3: `plans/phase-2-probes/hook-reminder.md` có kết luận và nguồn cho ba tộc; check `format` xanh.
- d8, d10: file cổng chép ô Trạng thái `xong (…)` của từng task.
- d9, d11, d12: check `format` xanh và máy kiểm danh sách quest con của từng quest chấp nhận.
- Mốc của giai đoạn (P2-11): e2e `Flow6` xanh, một lần chạy thật từ ngoài nhà, báo cáo giai đoạn 2 có số lần chủ nhân can thiệp ngoài dấu vua trên mỗi quest, so với 26 lần trên 24 quest của P1-50.

## Unknowns

- Claude, Codex và agy có đưa lời của hook tới model giữa phiên không, qua sự kiện và trường nào: quest dò d3 (`research`, trinh sát) trả lời bằng điều repo đã đo, tài liệu chính thức và mã nguồn của CLI, ghi `plans/phase-2-probes/hook-reminder.md`; d4 phụ thuộc d3 và chỉ dựng đường d3 kết luận `có`. Tộc d3 để `chưa rõ` chỉ một lần chạy CLI thật trả lời được, mà nhân vật không được chạy CLI (`docs/plans/phase-2.md` §2): file dò ghi cách đo, chủ nhân đo ở lần chạy thật kế tiếp, và tới lúc đó tộc ấy chỉ có cắt cứng.
- `pnpm build` có chạy được script nhập của `packages/ui-kit` trong phiên của người lùn không: d11 quyết khi chia, vì danh mục script chưa có script nhập.
