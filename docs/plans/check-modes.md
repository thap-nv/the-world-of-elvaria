# Chế độ kiểm theo lãnh thổ, lần trượt muộn và hàng vào `main`: kế hoạch chi tiết

Ngày: 2026-11-23 · Trạng thái: **chờ chủ nhân chốt** ([§11, 2026-11-23](../implementation-plan/11-2026-11-23.md), dòng "Kế hoạch (425)"); bốn điểm hợp đồng C1–C4 đã chốt trong phiên lập kế hoạch (dòng "Chủ nhân chốt C1–C4" cùng file). Nguồn: lượt chốt (425) ([§11, 2026-11-22](../implementation-plan/11-2026-11-22.md)) và (431) (§11, 2026-11-23). ADR nháp: [0032](../adr/0032-check-modes-of-a-territory.md), [0033](../adr/0033-late-machine-verdict.md). Kế hoạch này xây trên hàng đợi đã có của [phase-2-merge-queue.md](phase-2-merge-queue.md) (PS-09, PS-09b, PS-09c, PS-09d, PS-26, PS-08b, PS-08g đều đã xong theo §8), không thiết kế lại nó. Tên hàm, tên trường và con số là đề xuất khớp code ở `e44d9f31`: phiên làm task được đổi cho hợp, miễn giữ hợp đồng, và ghi chỗ đổi vào §11. Chưa task nào dưới đây có dòng ở §8; phiên điều phối quyết thứ tự và lúc mở.

## Hiện trạng (2026-11-23, `main` `e44d9f31`, vương quốc `my-kingdom`)

| # | Thực tế | Hệ quả |
|---|---|---|
| 1 | Số đo 22/11 của chủ nhân (event `check.start`, `check.end`): một lượt kiểm đủ của một quest trên lãnh thổ `elvaria` mất 9–17 phút, gần bằng phiên làm; 1 lượt đỏ trên 15. Hai lượt kiểm chồng nhau thì CPU 100 % | 14 trên 15 lượt chỉ để xác nhận điều đã đúng, với giá của cả repo |
| 2 | Lãnh thổ `elvaria` khai 12 check, đều `exclusive: false`, không cái nào `defer_to_merge`: `lint`, `format`, `typecheck`, `test` (trần 30 phút), `boundaries`, `layout`, `knip`, `dup`, `schemas`, `docs_gen`, `docs_check`, `i18n`. `when` của `test` là `packages/**`, `apps/**`, `scripts/**`: gần như quest nào cũng chạy `pnpm test` của cả repo | Chọn theo `when` không thu hẹp được gì trong một monorepo: cần lệnh hẹp theo diff |
| 3 | Check của một quest chạy lần lượt, không dừng ở cái đỏ đầu (`packages/runner-core/src/checks/run-checks.ts:217-231`). `selectChecks` chỉ biết vai đội và `when` (`select-checks.ts:25-40`); vai `merge` chạy mọi check | Chỗ chèn chế độ kiểm là `selectChecks` và lệnh của từng check, không phải bộ chạy |
| 4 | Hàng giao hàng chạy lại **mọi** check sau khi ghép nhánh gốc (`packages/steward/src/forge/update.ts:69-79`, K4), `check.start` mang `delivery: true`. Lãnh thổ `elvaria` còn `delivery.mode: manual` nên hàng chưa chạy ở đây | Bật `pr_merge` khi còn `full` thì mỗi quest tốn thêm một lượt 9–17 phút nữa |
| 5 | `dispatch.max_background` của `my-kingdom` là 1 (mặc định 2): mọi việc máy ngoài nhịp (kiểm, trận thử, script, giao hàng) của cả vương quốc đi một làn (`packages/domain/src/dispatch/background-room.ts:68`). Tộc: claude 2, gemini 1, codex 1 phiên; lãnh thổ `elvaria` 2 quest, `dc1-se-team` 1; không có trần phiên chung | Với một làn và 9–17 phút mỗi lượt, vương quốc chấm được 4–6 quest mỗi giờ dù có bao nhiêu nhân vật. Kiểm của Nhiếp chính chồng với kiểm nhân vật tự chạy trong phiên (đang được quest P3/P7/P8 thu hẹp) |
| 6 | Tuần tra chạy theo lịch (`P1D`), khi lãnh thổ đang đỏ mà đầu nhánh gốc đổi (`base_moved`), theo lệnh (`owner`) và khi hàng đợi hỏi (`queue`); **sau một `delivery.merged` trên lãnh thổ xanh thì không** (`packages/steward/src/forge/outcome.ts:57-64`, K16) | (425)(b) đảo K16: tuần tra sau mỗi merge là nơi duy nhất chạy đủ bộ |
| 7 | `done` chỉ có `deliver` và `archive` (`packages/domain/src/quest/transitions.ts:196-197`). PS-08f (chưa làm) hẹn hai hàng `done` + `return`. Danh tiếng lưu ở `character.json` (`reputation.window`, 20 mục gần nhất), chỉ `quest.assignee` được ghi (`packages/steward/src/review/verdicts.ts:78-90`, `withVerdict`); **người chấm chưa bao giờ bị ghi gì** | Lần trượt muộn cần hàng mới, và một đường ghi cho người chấm |
| 8 | Phán quyết máy đã có (`verifier_id: "machine"`, không cần `session_id`); file ở `verdicts/<id>.json`, `version` 1 | Lần trượt muộn là một phán quyết máy: không cần kiểu file mới |
| 9 | Quest đã chạy giữ vùng tới khi `archived` (`holdsScope`, `packages/domain/src/dispatch/scope.ts:92-101`); lưu trữ xảy ra khi nhánh đã vào nhánh gốc (`git merge-base --is-ancestor`, chạy cả ở `manual`) | Tàu càng chờ lâu thì quest cùng vùng càng chờ lâu |
| 10 | Không đường nào cho một nhánh không phải của quest vào hàng (`QUEST_BRANCH_PATTERN`, `forgeDue` chỉ nhận quest) | (425)(e) cần một mục hàng không có quest |
| 11 | Người chấm được chạy mọi lệnh `run` của check và `commands.test`, `lint`, `typecheck` (`packages/runner-core/src/policy/tool-policy.ts:122-133`); `prompts/verifier.md:13` dặn "Run the territory's checks again when you need to" | Ở `narrow` và `deferred`, quyền và lời dặn của người chấm phải theo chế độ, không thì CPU như cũ |
| 12 | `scripts/check-changed.mjs` (382): diff so với `merge-base` với `origin/main`, test của package chạm và package phụ thuộc, cổng toàn repo khi đường dẫn khớp; **không** chạy lint và format, đường dẫn không luật nào phủ chỉ được in ra, dừng ở lỗi đầu | Nó là lệnh hẹp của lãnh thổ Elvaria sau khi bổ sung (task CM-02) |

## Thiết kế

### Ba chế độ, bốn lượt kiểm

Chế độ là dữ liệu của lãnh thổ (`territory.check_policy.mode`), mặc định `full` để không vương quốc nào đổi hành vi khi nâng cấp. Một **lượt kiểm** là một lần Nhiếp chính chạy một nhóm check trên một cây.

| Lượt | `full` (như nay) | `narrow` ((425)(a)) | `deferred` ((431)) |
|---|---|---|---|
| Sau phiên làm (trước người chấm) | check có `when` khớp, lệnh `run` | check có `when` khớp, lệnh `narrow` nếu check khai, không thì `run` | như `narrow`, bỏ check `defer_to_merge` |
| Hàng giao hàng, sau khi ghép nhánh gốc | mọi check, `run` | như lượt sau phiên, tính lại trên diff so với đầu nhánh gốc mới | không có lượt riêng: quest lên tàu |
| Tàu | không có | không có | mọi check, `run`, một lần cho cả tàu |
| Tuần tra nhánh gốc | theo lịch | theo lịch **và sau mỗi lần đầu nhánh gốc đổi** | như `narrow`; bỏ qua khi cây của đầu nhánh gốc đúng là cây tàu vừa kiểm xanh |

- **Lệnh hẹp là dữ liệu.** `checks[].narrow` là lệnh của lãnh thổ; Nhiếp chính đưa commit gốc của diff qua biến môi trường `ELVARIA_CHECK_BASE` (env tường minh, không ghép chuỗi vào lệnh). Check không khai `narrow` (các cổng rẻ `boundaries`, `knip`, `dup`, `layout`) chạy `run` như cũ. Lõi không biết `pnpm` hay monorepo.
- **Gốc của diff** là `PlotRecord.base` của đất (điểm tách nhánh, dời khi ghép nhánh gốc). PS-09d không cho quest mới tách từ nhánh gốc đỏ, nên gốc đó là một `main` xanh; phần quest không chạm giống hệt nó.
- **(425)(c) chạy đủ:** `check_policy.full_when` là danh sách glob; quest chạm một đường dẫn khớp thì mọi lượt của nó chạy như `full`. Với Elvaria: `tsconfig*.json`, `eslint.config.*`, `packages/config/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `scripts/**`, `.claude/hooks/**`. "Đường dẫn không luật nào phủ" có hai tầng: ở lãnh thổ, đường dẫn không khớp `when` của check nào cũng buộc `full`; ở lệnh hẹp của Elvaria, `check-changed.mjs` thoát mã riêng khi gặp đường dẫn không luật nào phủ và Nhiếp chính coi đó là đỏ (CM-02).
- **Đỏ sau phiên vẫn là trượt** ở mọi chế độ (ADR 0008 giữ nguyên câu "any failing check ⇒ fail"); chế độ chỉ đổi check nào chạy lúc nào.
- **Người chấm:** quyền Bash dựng từ đúng các lệnh của lượt sau phiên (lệnh `narrow` thay `run`; ở `deferred` bỏ check `defer_to_merge` và `commands.test`), và câu 13 của `verifier.md` thành một khối theo chế độ. Quest có nghi thức `scratch_plot` (Thả quái thử thành) cần chạy test để phá: check của nó chạy như `full` ở mọi chế độ.
- **Việc nặng** (tuần tra, tàu) mỗi lúc một việc trong cả vương quốc (hằng số, không trường mới), và vẫn tính vào `max_background`. Tuần tra sau merge **gộp**: lãnh thổ có một lần đang chạy thì lần kế chạy trên đầu mới nhất, các đầu ở giữa bỏ qua.
- **Thực tế của CM-01** (2026-11-23, dòng §11 "CM-01"): `selectChecks` giữ nguyên; quyết định chế độ là hàm thuần `checkModeOf(territory, touched, { pass, role, scratch })` ở `runner-core/src/checks/check-mode.ts` (cùng `checkLinesOf`), steward gọi nó qua `checkModeFor` (`steward/src/review/check-mode.ts`, chỉ hỏi đất khi chế độ khác `full`; đất không đọc được thì chạy `full`) rồi đưa `mode` cho `Plots.check`; `ChecksRequest.base` lấy từ `PlotManager.checkBase` (`PlotRecord.base`). `ELVARIA_CHECK_BASE` đi tới mọi lệnh (`narrow` lẫn `run`) của một lượt hẹp trên đất git; lượt chạy như `full` không nhận nó, vì `check-changed.mjs` (CM-02) bật chế độ hẹp khi thấy biến này; phiên người chấm, trận thử trong đất nháp, tuần tra và `territory check` cũng không. Trước CM-08, `deferred` chạy lượt sau phiên như `narrow` (chưa bỏ check `defer_to_merge`) và hàng đợi chạy mọi check như `full`, vì chưa có tàu nào chạy phần bị bỏ. Người chấm của lượt hẹp được đúng lệnh của các check đã chạy trong lượt (`narrow` nếu có), vẫn giữ `commands.test`, `lint`, `typecheck` như dòng trên; danh sách allow của nghề (registry) không đổi. "Câu 13 của `verifier.md`" nay là luật 3, thành `{{rerun_rule}}` với hai mục `full`, `narrow` của `prompts/rerun-rules.md`. `mode` của `check.start`, `check.end` chỉ có giá trị `narrow`, ghi cả ở lượt hàng đợi. Lệnh `elvaria territory checks <id> [--mode]` in chính sách và lệnh của từng check, chỉ ghi `mode`; `full_when` và `narrow` sửa tay trong file lãnh thổ.

### Tuần tra sau mỗi merge và phép dò ((425)(b), (431))

- `patrol.ran.trigger` thêm `merged`: sau `delivery.merged`, sau merge của một mục khách, và khi lần fetch 10 phút của PS-08d thấy đầu nhánh gốc đổi (merge tay ngoài Elvaria). Chỉ ở lãnh thổ `narrow` hay `deferred` đã bật tuần tra. Hàng đợi **không chờ** tuần tra: quest kế vẫn đi, vì lượt hẹp của nó đã so với đầu mới.
- Tuần tra đỏ thì lãnh thổ đỏ như PS-09d (dừng nhận việc, hàng đứng), rồi Nhiếp chính **dò**, 0 mana, chỉ chạy các check đang đỏ:
  1. Các bước là commit theo `--first-parent` từ đầu xanh gần nhất tới đầu đỏ. Tìm nhị phân bước đầu tiên đỏ (tối đa `PROBE_RUNS_MAX` = 8 lần chạy; quá thì kết luận `unknown`).
  2. Check đỏ rồi xanh khi chạy lại đúng commit đó ⇒ `flaky`: không ai trượt, đi đường quest trừ tà của ADR 0022.
  3. Bước đỏ đầu không phải merge của quest nào (`delivery.merged.merge_sha`, hay đầu nhánh quest là cha thứ hai) ⇒ `outside`: mục bản tấu và quest nháp `patrol.follow_up` như PS-26.
  4. Là merge của một quest ⇒ chạy các check đỏ trên **đầu nhánh quest lúc có phán quyết** (trước khi hàng đợi ghép nhánh gốc). Đỏ ⇒ `own_change`; xanh ⇒ `combination` (từng bên xanh, ghép mới đỏ).
- Kết quả là một event `check.attributed` (bảng ở dưới). Cùng phép dò dùng cho hàng đợi và cho tàu: chỉ khác danh sách bước.
- Ở hàng đợi (`narrow` và `full`): lượt sau khi ghép đỏ, nhánh gốc xanh (phép thử của PS-09d giữ nguyên) ⇒ thêm bước 4 trước khi mở quest Hợp nhất. `own_change` ⇒ trượt muộn; `combination` ⇒ quest Hợp nhất của PS-09b, như nay. Check đã chạy xanh ở lượt sau phiên với cùng lệnh thì khỏi chạy lại: chắc chắn là `combination`.

### Lần trượt muộn ((425)(d), C1, C2; ADR 0033)

- Một lần trượt muộn là **một phán quyết máy**: file `verdicts/<quest>-<n>-late.json`, `verifier_id: "machine"`, `result: fail`, `fail_kind: tests_fail`, `late: true`, `checks` là các check đỏ kèm dòng lỗi đầu. Nguyên tắc 14 giữ: nó được đo như mọi phán quyết.
- **Quest còn `done`, chưa vào nhánh gốc** (hàng đợi, tàu) (C1): ba hàng mới, actor Nhiếp chính, soi đúng ba hàng của `review`:

  | from | event | guard | to |
  |---|---|---|---|
  | `done` | `verdict_fail` | `can_retry` | `returned` |
  | `done` | `verdict_fail` | `machine_retry` | `open` |
  | `done` | `verdict_fail` | `out_of_retries` | `infirmary` |

  Hiệu ứng: bỏ người chấm và `deliverable.delivered_at` (như PS-08f đã ghi), giữ nhánh và đất; phiên làm lại nhận tên check đỏ và đuôi log như sau một phán quyết trượt thường. Đạt lại thì qua dấu lần nữa nếu quest cần dấu, rồi vào hàng lại; PR cũ được cập nhật. Quest bậc script không khớp hàng nào (lỗi của script là việc của chủ nhân: `delivery.failed` như nay). Quest phụ thuộc đã tách từ nhánh này không bị kéo lùi: nó nhận phần sửa qua merge khi tới lượt giao.
- **Quest đã vào nhánh gốc** (tuần tra sau merge) (C2): quest giữ `archived`, không hàng nào rời `archived`. Nhiếp chính ghi phán quyết muộn và **tự mở một quest sửa**: dạng `fix`, `parent_id` là quest gây đỏ, `created_by: 'patrol'`, `assignee` là người làm cũ (đang ngủ, bị đình chỉ hay hết mana thì bỏ `assignee`, ai nhận cũng được), vùng và tag của quest cũ, hạng của quest cũ, mô tả nêu check đỏ, đuôi log và commit; nó được miễn lệnh giữ của PS-09d (`isPatrolFix` đã đúng) và có người chấm như mọi quest (người chấm cũ không bị loại: nó chưa từng làm quest này). Id ổn định theo quest cũ và commit đỏ đầu, nên chạy lại nhịp không mở cái thứ hai. Kết luận `combination` cũng mở quest sửa đó nhưng không `assignee` và không phán quyết muộn.
- **Danh tiếng:** người làm nhận `withVerdict` với phán quyết muộn (trọng số 1, tính chuỗi trượt). **Người chấm đã cho đạt** nhận một mục `fail` trọng số 1 vào `reputation.window` và cửa sổ tag của quest, không tính chuỗi trượt, không đổi cấp ngay trong nước đó; máy chấm (`machine`) và chủ nhân thì không ai bị ghi. `combination`, `flaky`, `outside`, `unknown` không trừ ai. Phiên làm CM-05 soát mọi nơi đọc danh tiếng của nhân vật nghề chấm (cấp, `STRONG_JUDGE_MIN_RANK`) trước khi ghi.
- **Sổ đo:** lần trượt muộn là một lỗi lọt của lượt chấm đó (cạnh "chủ nhân trả một lượt đã đạt"). Quest không qua dấu bị trượt muộn là một tín hiệu cầu dao của PS-08g (thay tín hiệu thứ ba đang chờ PS-08f).
- **PS-08f** (chưa làm) về sau dùng lại ba hàng này thay cho hai hàng `return` nó đã hẹn; dòng §8 của nó được sửa khi CM-05 xong.

### Tàu giao hàng của `deferred` ((431), C3; ADR 0032)

- **Lên tàu:** quest `done`, đã qua dấu hay trong ủy quyền dấu (`mergeDue` như nay). **Rời ga** khi một trong các điều sau đúng: đủ `train.max_quests` (5); quest chờ lâu nhất đã chờ `train.max_wait_minutes` (30); có quest `open` của lãnh thổ đang bị vùng của một quest trên sân ga giữ; lãnh thổ không còn quest nào đang làm hay đang chấm; chủ nhân ra lệnh. Điều thứ ba và thứ tư là cách xử lý việc giữ vùng: tàu không bao giờ để một quest cùng vùng chờ nó quá một lượt kiểm.
- **Dựng:** trong đất riêng `train-<lãnh thổ>` tách từ đầu nhánh gốc (đang xanh), theo `queueOrder` có sẵn, mỗi quest một `git merge --no-ff quest/<id>` với luật `shared_paths` của PS-09. Quest có conflict ngoài luật rời tàu sang quest Hợp nhất (PS-09b), tàu đi tiếp. Rồi `commands.setup`, `commands.generate` (file sinh đổi thì một commit của Nhiếp chính), và mọi check với lệnh `run`.
- **Xanh:** push nhánh `train/<lãnh thổ>/<id>`, một PR (thân liệt kê quest và thư giao hàng), chờ `required_checks`, merge bằng merge commit, xóa nhánh từ xa. Mỗi quest một dòng `delivery.merged` mang thêm `train`, nên lưu trữ (nhánh quest đã là tổ tiên của nhánh gốc), thư `advisory`, cầu dao ủy quyền và sổ đo chạy như cũ. `deferred` đòi `delivery.mode: pr_merge` và `merge_method: merge` (schema từ chối tổ hợp khác).
- **Đỏ:** dò như trên, các bước là các merge commit của tàu. Quest ở bước đỏ đầu: `own_change` ⇒ trượt muộn về người làm (ba hàng mới); `combination` ⇒ quest Hợp nhất, không trừ ai. Các quest trước bước đó đi thành một tàu mới ngay (chỉ chạy lại các check từng đỏ; tuần tra sau merge là lưới chạy đủ). Các quest sau bước đó ở lại sân ga cho tàu kế; nhiều quest cùng gây đỏ thì mỗi tàu kế tìm ra một quest. Một quest lên tàu quá `TRAIN_RIDES_MAX` (3) lần mà chưa vào thì thành `delivery.failed` cho chủ nhân.
- **Người chấm ở `deferred`** không chạy được bộ test (quyền Bash không có nó, prompt nói rõ bộ test chạy ở tàu). ADR 0008 được sửa: check `defer_to_merge` của lãnh thổ `deferred` chạy **sau** phán quyết; câu "check đỏ ⇒ trượt" thành phán quyết máy muộn. ADR 0022 được sửa: `defer_to_merge` từ "chờ quest ghép của đội" thành "chờ lượt ghép: quest ghép của đội, hay tàu của lãnh thổ `deferred`".

### Elvaria sang `pr_merge` và mục khách ((425)(e), C4)

- **Điều kiện bật** `delivery.mode: pr_merge` cho lãnh thổ `elvaria`: CM-01 tới CM-03 đã ở bản ghim và `check_policy.mode` là `narrow` (không thì hàng đợi chạy đủ bộ cho từng quest, mục 4 của bảng hiện trạng); tuần tra đã bật (đã bật); `delegation.seal` đã có (hạng tới D). Chủ nhân bật bằng `elvaria territory delivery elvaria --mode pr_merge`.
- **Mục khách** cho phiên task của người: phiên push nhánh, mở PR, rồi `elvaria territory enqueue <lãnh thổ> --pr <số>` (lệnh hộp thư mới `enqueue_branch`; chỉ chủ nhân, như `seal`). Nhiếp chính xếp mục đó vào **cùng làn** của lãnh thổ (`busyOf`), sau các quest đang tới hạn lúc nó vào:
  1. fetch; thử khan ghép nhánh với đầu nhánh gốc (`git merge-tree --write-tree`). Conflict ⇒ `delivery.guest_refused` (`conflict`, kèm file): phiên của người tự `git merge origin/main` rồi xếp lại. Nhiếp chính không bao giờ viết vào nhánh của người.
  2. dựng cây ghép trong đất tách rời `guest-<lãnh thổ>`, chạy lượt hẹp của chế độ hiện tại trên diff so với đầu nhánh gốc (chạm `full_when` thì chạy đủ);
  3. xanh ⇒ merge PR qua forge, `delivery.guest_merged`, tuần tra `merged`. Đỏ ⇒ `delivery.guest_refused` (`checks_red`, kèm check và đuôi log). Không quest, không phán quyết, không danh tiếng.
- Mục khách bị dò ra là bước đỏ đầu sau merge thì kết luận là `outside` kèm số PR: mục bản tấu, quest nháp `patrol.follow_up`.
- Ở `deferred`, mục khách đi một mình như một tàu một toa (chạy đủ bộ): phiên của người vốn đã chạy `pnpm check` trước PR.
- CLAUDE.md bước 5 và §8 "Chạy song song" đổi theo khi CM-07 xong: phiên task chạy `pnpm check:changed`, mở PR, xếp hàng bằng `enqueue`, không tự merge; `pnpm check` đủ chỉ còn bắt buộc khi chạm `full_when`.

## Hợp đồng dữ liệu đổi

Mọi đổi dưới đây là thêm trường tùy chọn hay giá trị mới: `version` của file giữ 1, `v` của event giữ 2, **không migration**; mỗi schema thêm một ví dụ ở `packages/domain/examples/**`, event mới thêm dòng mẫu ở `packages/eventlog/src/migrations/v1.jsonl` và mục glossary.

| Chỗ | Đổi | Task |
|---|---|---|
| `territory.json` | `check_policy` tùy chọn: `mode` (`full` \| `narrow` \| `deferred`, mặc định `full`), `full_when` (glob, mặc định rỗng), `train` (`max_quests` 5, `max_wait_minutes` 30); `checks[].narrow` (lệnh, tùy chọn). Từ chối: `deferred` mà `delivery.mode` khác `pr_merge` hay `merge_method` khác `merge` | CM-01, CM-08 |
| Lệnh check | biến môi trường `ELVARIA_CHECK_BASE` (commit gốc của diff) cho mọi lệnh check | CM-01 |
| `verdicts/<id>.json` | `late: true` tùy chọn, chỉ hợp lệ với `verifier_id: machine` và `result: fail` | CM-05 |
| Máy trạng thái quest | ba hàng `done` + `verdict_fail` (bảng trên); bảng §2.5 sinh lại | CM-05 |
| `character.json` | không đổi schema; người chấm nhận mục `fail` trong cửa sổ có sẵn | CM-05 |
| `check.start`, `check.end` | `mode` tùy chọn (`narrow`; vắng là đủ bộ theo `when`), `guest` và `train` tùy chọn | CM-01, CM-07, CM-08 |
| `patrol.ran` | `trigger` thêm `merged` | CM-03 |
| `check.attributed` (mới) | `territory`, `source` (`queue` \| `train` \| `patrol`), `checks`, `runs` (`commit`, `quest` tùy chọn, `pass`, `duration_ms`), `culprit` (quest hay PR khách, tùy chọn), `cause` (`own_change` \| `combination` \| `outside` \| `flaky` \| `unknown`) | CM-04 |
| `delivery.enqueued`, `delivery.guest_merged`, `delivery.guest_refused` (mới) | `territory`, `branch`, `pr`, `head`; `merge_sha`; `reason` (`conflict` \| `checks_red` \| `forge_error`), `paths`, `checks` | CM-07 |
| `train.ran` (mới) | `territory`, `train`, `base`, `head`, `steps` (`quest`, `commit`), `left` (`quest`, `reason`), `setup`, `checks`, `outcome` (`green` \| `red` \| `stopped`) | CM-08 |
| `delivery.merged`, `delivery.failed` | `train` tùy chọn; `stage` thêm `train` | CM-08 |
| Hộp thư | lệnh mới `enqueue_branch`; lệnh `deliver` nhận lãnh thổ để cho tàu rời ga | CM-07, CM-08 |

Trạng thái "mục khách đang chờ" và "sân ga" suy từ event (như `sealSuspendedOf`), không file nào mới.

## Ca biên

- **Tàu nhiều quest cùng gây đỏ:** mỗi tàu tìm bước đỏ đầu; tàu kế gồm các quest còn lại tìm quest kế. Giả định "đã đỏ thì các bước sau vẫn đỏ" sai (quest sau sửa hộ) thì tìm nhị phân vẫn trả một bước đỏ thật: kết luận vẫn đúng cho quest đó.
- **Quest đã lưu trữ:** không đổi trạng thái; phán quyết muộn ghi theo id quest, quest sửa mang `parent_id` (C2). Quest đã bị chủ nhân `git revert` trước khi dò xong: bước đỏ đầu không còn trên nhánh gốc xanh, phép dò vẫn ghi `own_change` nhưng không mở quest sửa (nhánh gốc đã xanh ở đầu mới).
- **Dò khi nhánh gốc cũng đỏ:** hàng đợi và tàu chỉ chạy khi lãnh thổ không đỏ. Tàu đỏ mà check đó cũng đỏ ở đầu nhánh gốc tàu tách ra (phép thử `queue` của PS-09d) ⇒ không dò, lãnh thổ đỏ, tàu giải tán, quest ở lại sân ga. Tuần tra đỏ ngay lần đầu (chưa có đầu xanh nào) ⇒ `unknown`, như PS-26.
- **Check bị gạt vì môi trường** không tính là đỏ ở mọi lượt, như nay. Check quá giờ trong lúc dò ⇒ `unknown`, không ai trượt.
- **Nhiếp chính dừng giữa lúc dò hay giữa tàu:** kill tree, đất `train-…`, `guest-…`, `probe-…` bị xóa trong `finally`; không event nào ghi thì lần khởi động sau làm lại từ đầu. Nhánh tàu chỉ được push sau khi xanh, nên không có nhánh tàu dở trên forge.
- **Quest chạm `full_when`** ở `deferred`: chạy đủ bộ ngay sau phiên và vẫn lên tàu.
- **Quest ghép của đội** và quest Hợp nhất: luôn chạy mọi check (`party_role: merge`), ở mọi chế độ; trượt muộn của chúng đi hàng `machine_retry` hay `can_retry` tùy lượt cuối.
- **Người chấm cũ đang chấm quest khác** lúc nhận mục trượt: chỉ ghi file nhân vật, không cắt phiên.
- **Phản đối:** người làm phản đối phán quyết máy muộn theo đường `objection` có sẵn; máy không trả lời phản đối, người chấm khác họ đọc (ADR 0008 luật 1).
- **`merge_method: squash`**, lãnh thổ không git, chế độ `manual`: `narrow` chạy được (chỉ lượt sau phiên đổi); `deferred` bị schema từ chối.
- **Windows và macOS:** lệnh hẹp là tiến trình con với env tường minh (`ELVARIA_CHECK_BASE`), `shell: false`; đường dẫn đất có dấu cách; danh sách file đổi lấy bằng `git diff --name-only -z`; kill tree cho tàu và phép dò; tên nhánh tàu chỉ dùng `/` và ký tự của ulid. CM-03, CM-04, CM-07, CM-08 chạm `runner-core/src/plot` và spawn: nêu trong báo cáo để chủ nhân quyết chạy CI.

## Đo thành công

Sổ đo (`elvaria metrics`, `docs/metrics-report.md`) thêm một mục đọc `check.start`, `check.end`, `check.attributed`, `patrol.ran`, `train.ran` (task CM-09):

- thời gian một lượt kiểm theo chế độ: trung vị và p90. Đích của `narrow`: trung vị ≤ 3 phút, p90 ≤ 6 phút (nay 9–17 phút);
- số lượt đủ bộ mỗi ngày (tuần tra, tàu, quest chạm `full_when`) và tổng phút máy cho kiểm mỗi quest vào được `main`;
- lỗi lọt qua lượt hẹp: số `own_change` và `combination` trên số merge. Ngưỡng báo: quá 1 trên 10 merge trong 20 merge gần nhất thì bản tấu đề nghị về `full`;
- thời gian nhánh gốc đỏ, và thời gian từ nộp bài tới vào `main`;
- số quest cùng lúc đang làm và đang chấm (đích: trần tộc là giới hạn, không phải làn kiểm).

Thứ tự theo (431): `narrow` lên `main` và chạy ít nhất 20 merge ⇒ đọc số ⇒ mới mở CM-08 (`deferred`) ⇒ sau `deferred` 20 merge thì xét lại `max_concurrent` của lãnh thổ và `max_background`.

## Chia task

Cỡ theo một context. "Đọc trước" là vùng "đọc trước khi sửa" của CLAUDE.md: task có dấu đó chạy Opus xhigh.

| Id | Việc | Cỡ | Cần trước | File chạm chính | Đọc trước | Xong khi |
|---|---|---|---|---|---|---|
| CM-01 | Schema `check_policy`, `checks[].narrow`; `selectChecks` nhận lượt và chế độ (thuần, trong domain hay runner-core như nay); `ELVARIA_CHECK_BASE`; lượt sau phiên và lượt hàng đợi theo chế độ; `full_when`; quyền Bash và khối prompt của người chấm theo chế độ; `mode` trên `check.start`, `check.end`; `elvaria territory checks <id> --mode` | M | — | `p/domain/src/schema/territory*.ts`, `p/runner-core/src/{checks,policy,prompt}/**`, `p/steward/src/{review,forge}/**`, `a/cli/src/territory` | schema (Opus xhigh) | lãnh thổ `narrow`: lượt sau phiên chạy lệnh `narrow` với env đúng, quest chạm `full_when` chạy `run`, hàng đợi không chạy mọi check; lãnh thổ không khai gì chạy đúng như trước (snapshot); người chấm không có quyền chạy lệnh ngoài lượt |
| CM-02 | `scripts/check-changed.mjs` thành lệnh hẹp của Elvaria: đọc `ELVARIA_CHECK_BASE`, thêm lint và format của file đổi, `--only <nhóm>` để mỗi check gọi một nhóm, mã thoát riêng cho đường dẫn không luật nào phủ; hướng dẫn [elvaria-territory.md](../guides/elvaria-territory.md) có khối `checks` và `check_policy` mẫu | S | — | `scripts/check-changed.mjs` và spec, hướng dẫn | — | spec cho từng nhóm và cho mã thoát; `pnpm check:changed` của người dùng không đổi hành vi mặc định |
| CM-03 | Tuần tra `merged`: sau `delivery.merged` và khi đầu nhánh gốc đổi, gộp về đầu mới nhất, một việc nặng mỗi lúc; đảo K16 | M | CM-01 | `p/domain/src/patrol/**`, `p/steward/src/{patrol,forge,tick}/**`, schema `patrol-data` | schema event | hai merge sát nhau ⇒ một lần tuần tra trên đầu sau; lãnh thổ `full` không tuần tra thêm; hàng đợi không chờ tuần tra |
| CM-04 | Phép dò: kế hoạch dò thuần (`probeStepsOf`, tìm nhị phân, trần lần chạy), cổng `Plots.probe(territory, commit, checks)` trên `tryTerritory`, event `check.attributed`, mục bản tấu `base_red` nêu thủ phạm; chưa đổi trạng thái quest | M | CM-03 | `p/domain/src/patrol/**`, `p/runner-core/src/plot/territory-trial.ts`, `p/steward/src/patrol/**`, schema event mới | schema event | git thật: ba merge, cái thứ hai gây đỏ ⇒ `own_change` đúng quest; đỏ chỉ khi ghép ⇒ `combination`; commit tay ⇒ `outside`; chập chờn ⇒ `flaky`; domain 100 % |
| CM-05 | Phán quyết máy muộn: `late` trên verdict, ba hàng `done` + `verdict_fail`, hiệu ứng, danh tiếng người làm và người chấm, sổ đo lỗi lọt; ADR 0033 thành accepted, sửa dòng PS-08f | M | — (domain thuần) | `p/domain/src/quest/{transitions,effects}.ts`, `p/domain/src/{verify,character,metrics}/**`, schema verdict | máy trạng thái, `verify/**`, schema (Opus xhigh) | test tính chất của bảng; chuỗi đạt → trượt muộn → làm lại → đạt → dấu lần nữa; hết lượt ⇒ trạm quân y; quest script không khớp; người chấm nhận một mục, máy thì không; domain 100 % |
| CM-06 | Nối dây trượt muộn: hàng đợi chạy bước 4 của phép dò trước khi mở quest Hợp nhất; tuần tra `own_change` ⇒ phán quyết muộn và quest sửa giao người cũ (`lateFixOf`), `combination` ⇒ quest sửa không người; tín hiệu cầu dao PS-08g | M | CM-04, CM-05 | `p/domain/src/{patrol,party}/**`, `p/steward/src/{forge,patrol,review}/**` | — | git thật và forge giả: bốn kết luận của phép dò đi đúng bốn đường; chạy lại nhịp không mở quest sửa thứ hai; quest phụ thuộc không bị kéo lùi |
| CM-07 | Mục khách: `enqueue_branch`, `elvaria territory enqueue`, ba event `delivery.*` của khách, đất `guest-…`, cùng làn với quest; CLAUDE.md bước 5 và §8 "Chạy song song" | M | CM-01, CM-03 | schema lệnh và event, `p/domain/src/dispatch/**`, `p/steward/src/{inbox,forge}/**`, `a/cli/src/territory`, `.claude/rules/cli.md` | schema | forge giả: khách xanh được merge sau quest đang tới hạn, khách conflict và khách đỏ bị từ chối kèm lý do, nhánh của người không bị ghi; hai mục cùng lãnh thổ không chạy chồng |
| CM-08 | `deferred`, phần a: tàu (rời ga, dựng, kiểm, `train.ran`, nhánh `train/…`, một PR, `delivery.merged` từng quest), quyền người chấm ở `deferred`; phần b: tàu đỏ ⇒ dò ⇒ trượt muộn hay quest Hợp nhất, tàu kế. ADR 0032 thành accepted, ghi các đoạn Amended vào ADR 0008, 0022, 0023 | L (hai nhánh a, b) | CM-06, số đo của `narrow` | schema territory và event, `p/domain/src/dispatch/**`, `p/runner-core/src/plot/**`, `p/steward/src/forge/**` | schema; `verify/**` nếu chạm luật chọn check của nghi thức (Opus xhigh) | forge giả: tàu ba quest xanh ⇒ một PR, ba quest lưu trữ; quest giữa gây đỏ ⇒ nó `returned` với phán quyết muộn, hai quest kia vào ở tàu kế; quest `open` cùng vùng làm tàu rời ga ngay; dừng giữa tàu không để lại nhánh |
| CM-09 | Sổ đo của mục "Đo thành công" và ngưỡng báo trong bản tấu | S | CM-01 | `p/domain/src/metrics/**`, `a/cli/src/metrics` | — | báo cáo in năm số trên từ một log mẫu |

- **Thứ tự đề xuất** (phiên điều phối quyết): CM-01, CM-02, CM-05, CM-09 không cần nhau và mở được ngay (CM-01 và CM-05 cùng chạm `schema/**`: nhánh merge sau sinh lại `docs/schemas`). Rồi CM-03 → CM-04 → CM-06. Sau CM-03: chủ nhân bật `narrow` cho `elvaria` (việc vận hành, 0 mana). CM-07 rồi bật `pr_merge`. CM-08 chỉ mở sau khi đọc số của `narrow`.
- **Việc vận hành, không phải task** (phiên điều phối làm với chủ nhân): sửa `territory.json` của `elvaria` (`check_policy`, `narrow` cho `lint`, `format`, `typecheck`, `test`, `docs_gen`), nâng bản ghim, bật `pr_merge`, đặt `max_background` 2 khi `narrow` đã chạy.
- **Chồng nhau:** `packages/domain/src/schema/**` và `docs/schemas/**` (CM-01, CM-03, CM-04, CM-05, CM-07, CM-08), `packages/steward/src/forge/**` (CM-01, CM-06, CM-07, CM-08: không mở hai task trong nhóm này cùng lúc), `packages/i18n/src/glossary.json` và hai locale (mọi task có event hay lệnh mới).

## Câu hỏi cho chủ nhân

**Đã chốt trong phiên (C1–C4, đều theo khuyến nghị):** C1 lần trượt muộn rời `done` bằng ba hàng `verdict_fail` với một phán quyết máy; C2 quest đã vào `main` giữ `archived`, Nhiếp chính tự mở quest sửa giao người cũ; C3 tàu là một nhánh `train/…` do Nhiếp chính push, một PR; C4 phiên task của người xếp hàng bằng `elvaria territory enqueue` (mục khách).

**Phải chốt trước khi code:**

- **C5** (CM-01) Tên và dạng trường: `territory.check_policy {mode, full_when, train}` và `checks[].narrow`, gốc diff qua biến môi trường `ELVARIA_CHECK_BASE`. Khuyến nghị: nhận. Phương án khác: chỗ điền `{base}` trong chuỗi lệnh (dễ viết hơn cho lãnh thổ lạ, nhưng là phép ghép chuỗi vào lệnh đầu tiên của lõi).
- **C6** (CM-05) Người chấm đã cho đạt nhận một mục `fail` trọng số 1, không chuỗi trượt, ở mọi chế độ kể cả `deferred` (nơi nó không được chạy bộ test). Khuyến nghị: nhận như (425)(d), đọc lại sau 20 merge của `deferred`. Phương án khác: ở `deferred` chỉ ghi người làm, vì người chấm không có cách nào thấy test đỏ ngoài đọc diff.
- **C7** (CM-06) Quest sửa tự mở tốn mana mà chủ nhân chưa duyệt từng cái (khác quest nháp của PS-26). Khuyến nghị: nhận, trong trần `delegation.max_rank`; hạng cao hơn thì quest sửa là bản nháp chờ `confirm`.
- **C8** (CM-03) Đảo K16: tuần tra đủ bộ sau mỗi lần đầu nhánh gốc đổi, gộp về đầu mới nhất, chỉ ở lãnh thổ `narrow` hay `deferred`. Khuyến nghị: nhận ((425)(b) đã nói hướng; đây là xác nhận phạm vi và luật gộp).

**Chờ được:**

- **C9** Cho quest cùng vùng **xếp chồng** lên nhánh của quest `done` đang chờ (phụ thuộc ngầm, như `baseChainOf`) thay vì chờ tàu. Khuyến nghị: chưa; đo số lần "vùng ép tàu rời ga" sau CM-08 rồi xét.
- **C10** Con số: `train.max_quests` 5, `train.max_wait_minutes` 30, `PROBE_RUNS_MAX` 8, `TRAIN_RIDES_MAX` 3, ngưỡng báo 1 trên 10 merge. Khuyến nghị: nhận làm mặc định, chỉnh theo số đo.
- **C11** Lãnh thổ `dc1-se-team` ở lại `full`. Khuyến nghị: nhận; xét khi nó có lệnh hẹp của riêng nó.
- **C12** PS-08f gộp vào CM-05 (ba hàng dùng chung), phần còn lại của nó chỉ là "check của forge đỏ gọi phán quyết muộn". Khuyến nghị: nhận, sửa dòng §8 của PS-08f khi CM-05 xong.
- **C13** Sau `deferred`: xét lại `max_concurrent` của `elvaria` (nay 2) và trần tộc. Khuyến nghị: đọc số của CM-09 rồi chốt, như (431).
