# Lý do trạm quân y và dòng doctor là mã cộng tham số, nói bằng ngôn ngữ của chủ nhân

## Summary

**Mục tiêu.** Lý do của event `quest.infirmary` do Elvaria tự viết (cầu dao, người chấm, lần khởi động lại) và các dòng chi tiết `doctor()` của adapter trở thành mã cộng tham số, CLI dịch qua i18n như `packages/domain/src/scorecard/reasons.ts`; bản tiếng Việt không còn lẫn câu tiếng Anh do Elvaria viết. `breaker:commit` giữ tối đa 5 dòng lỗi đầu (không cắt giữa chữ), số dòng chứa `error`, tổng số dòng, và đường dẫn tới `pre-commit.log` (toàn bộ output của hook) trong thư mục lượt chạy. `v` của event lên 2; dòng v1 được nâng khi đọc (mã `legacy`, câu cũ in nguyên văn); event log trên đĩa không bị viết lại. Mọi câu trả lời đã khuyên trong brief được giữ.

**Hợp đồng** (đã commit cùng kế hoạch): [docs/contracts/infirmary-reason-codes.md](../docs/contracts/infirmary-reason-codes.md) — danh sách mã, tham số, hình dạng payload v2, bước migrate, `hookOutputHead`, `ToolInfo.notes`, khóa i18n.

**Cắt thành 6 phần** (mọi phần là `part` của đội, lớp `knight`):

- **d1** (refactor, D, chờ —): hằng `EVENT_VERSION` (còn 1); mọi người ghi event và fixture TS dùng nó; không đổi hành vi.
- **d2** (build, C, chờ d1): domain + eventlog: mã lý do, schema `quest.infirmary` v2, `EVENT_VERSION = 2`, migrate v1→v2, `Breaker.params`; người ghi hiện có tạm phát `legacy`.
- **d3** (build, C, chờ d2): runner-core: `hookOutputHead`, `pre-commit.log`, `CommitOutcome.head/log`; `DoctorNote`, `ToolInfo.notes`, kit nhận mã hoặc chuỗi.
- **d4** (build, C, chờ d3): steward + sandbox phát mã thật (cầu dao, người chấm, khởi động lại, secret, script).
- **d5** (build, D, chờ d3): CLI: `quest show`, chuông, dòng thời gian sandbox nói lý do qua `cli.quest.infirmary.reason.*`.
- **d6** (build, C, chờ d3): adapter claude, codex, antigravity trả `notes`; `elvaria doctor` in qua `cli.doctor.note.*`.

**Thứ tự.** d1 → d2 → d3 là chuỗi (mỗi phần tách nhánh từ nhánh của phần nó chờ, `plotBaseOf`); rồi d4, d5, d6 chạy song song (scope tách nhau). Steward tự thêm quest ghép.

**Rủi ro.** (1) Tăng `v` là lần migrate event đầu tiên của repo: chạm mọi người ghi event và hàng chục fixture; vì thế tách d1 (cơ học, không đổi hành vi) khỏi d2. (2) File locale, `packages/domain/src/index.ts` là đường dẫn chung: d5 và d6 cùng thêm khóa, quest ghép giữ cả hai bên. (3) Giữa d2 và d4, Nhiếp chính trên nhánh còn phát `legacy` — chỉ tồn tại trên nhánh đội, quest ghép gộp tất cả. (4) `pre-commit.log` có thể chứa secret: phải che như `wip.patch`.

**Ước lượng tổng:** khoảng 2,75 triệu token, 330 phút phiên.

**Chủ nhân cần biết trước khi ấn:** brief giả định không có doctor của antigravity ngoài kit; thực tế có (`packages/runner-antigravity/src/runner.ts:242`), nên d6 đổi cả nó (mục tiêu "từng adapter" giữ nguyên). Lý do `why` của bản vá bị từ chối và lời của script bậc script vẫn là chữ nguyên văn (ghi thành memo, ngoài phạm vi).

## Survey

**Event và schema.**

- `packages/domain/src/schema/event/event.ts:36`: `v: z.literal(1)` cho mọi dòng; comment nói reader nâng dòng cũ trước schema.
- `packages/domain/src/schema/event/state-data.ts:138-155`: `QuestInfirmaryDataSchema` = `reason` (chuỗi tiếng Anh), `trip?`, `detail?` (`InfirmaryDetailSchema`, dòng 77-136: `message`, `patch`, `wip`, `paths`, `apprentice_left`, `script`, `follow_up`, `verifiers_stopped`, `partial_verdicts`).
- `packages/eventlog/src/migrations/index.ts`: `EVENT_MIGRATIONS = []` (chưa có bước nào), `run.ts` chạy chuỗi theo `v`; `migrations.spec.ts` đọc mọi fixture `v<n>.jsonl` và đòi chuỗi kết thúc ở `v` schema nhận. `.claude/rules/hooks.md`: migrate nằm ở `packages/eventlog/src/migrations/`; hook chỉ nạp eventlog (không domain lúc chạy), ngân sách khởi động 100 ms.
- Người ghi `v: 1` trong mã chạy: `packages/hooks/src/write.ts:24,48`, `packages/runner-core/src/runner/run-log.ts:65`, `packages/steward/src/record.ts:142`, `packages/sandbox/src/ledger.ts:124`, `apps/cli/src/events.ts` (3 chỗ); fixture TS: `packages/domain/src/world/__fixtures__/day-builder.ts:115`, `packages/domain/src/metrics/__fixtures__/ledger.ts:136`, `packages/eventlog/src/__fixtures__/events.ts:61`, khoảng 12 spec trong `packages/` và 12 file trong `apps/cli` (grep `\bv: 1\b`).

**Ai viết lý do bây giờ.**

- `packages/steward/src/infirmary.ts`: `infirmaryReason()` dựng một câu tiếng Anh từ `trip` + `detail` (`breaker:<trip>: …`, `review:…`, `script:…`); `infirmaryData()` ghi `reason`, `trip`, `detail`; `refusedPatchOf()` đọc lại bản vá bị từ chối (dòng trước P1-32 theo tiền tố).
- `detail.message` mang câu Elvaria tự viết ở: `packages/domain/src/breaker/evaluate.ts:61-67` (`ran N min, limit M min`…), `packages/steward/src/review/judge.ts:108,159,166`, `packages/steward/src/sessions/settle.ts:170,221`, `packages/steward/src/restart.ts:42-59` (`MESSAGE`), `packages/steward/src/sessions/secrets.ts:61-69` (ba câu của `secretsLacking`), và lời hook (ngoài) qua `packages/steward/src/sessions/breaker.ts:49,62`.
- `packages/runner-core/src/plot/worktree-ops.ts:61,145-147`: `DETAIL_CHARS = 2000`, `said.slice(-DETAIL_CHARS)` — lấy 2000 ký tự **cuối**, cắt giữa chữ. `rescue.dir` = `runDirOf(quest, n, 'assignee')` = `.runs/<quest>-<n>` (`packages/steward/src/sessions/commit.ts:76`, `packages/domain/src/quest/attempt-log.ts:26`).
- Người đọc `reason`: `apps/cli/src/quest/infirmary.ts:77-85` (trip → nhãn i18n, không trip → câu tiếng Anh), `apps/cli/src/run/bell.ts:38-46` (dùng `trip` + `detailLines`), `apps/cli/src/sandbox/timeline.ts:35`, `packages/sandbox/src/ledger.ts:105,154`, `packages/steward/src/notice.ts:67-70`, `notices.ts:19`, `sessions/continuation.ts:40`, `packages/domain/src/metrics/rework.ts` (dùng `trip`).

**Doctor.**

- `ToolInfo` (`packages/runner-core/src/runner/types.ts:139-144`): `detail?: string`.
- `packages/runner-claude/src/doctor.ts`, `packages/runner-codex/src/doctor.ts`, và `doctor()` của antigravity nằm trong `packages/runner-antigravity/src/runner.ts:232-260` (không có `doctor.ts`, khác giả định của brief). Câu chung: `hookMissing` (`packages/runner-core/src/runner/hook-built.ts:9`), `noAnswerWithin` (`packages/runner-core/src/process/child.ts:107`).
- Kit: `packages/runner-core/src/kit/adapter-module.ts:103-113` bọc `doctor()` của adapter file bằng `withHookProblem` (nối câu vào `detail`).
- CLI: `loginFindings` (`apps/cli/src/doctor/check-tribe.ts:203-213`) in `info.detail` nguyên văn trong `cli.doctor.adapter_detail`; `apps/cli/src/tribe/check.ts:232` dùng lại nó.

**Quy ước ràng buộc.** CLAUDE.md: domain không IO, không throw, coverage 100 %; union chuỗi từ mảng `as const`; đổi payload event = tăng `v` + migrate, không viết lại log (ADR 0003); chuỗi cho người dùng qua `t()` có `vi` và `en`; `pnpm schemas` và `pnpm docs:gen` sau khi đổi schema (`docs/schemas/event.schema.json`, `docs/events.md`). `.claude/rules/domain.md`, `runner.md`, `hooks.md`. Mẫu: `packages/domain/src/scorecard/reasons.ts` và `apps/cli/src/territory/check-view.ts:13` (`reasonKeyOf`).

## Shared decisions

Mọi điều dưới đây được viết chi tiết trong [hợp đồng](../docs/contracts/infirmary-reason-codes.md); phần nào không tự quyết lại:

1. `quest.infirmary` v2: `reason: { code, params }`, `trip?` và `detail?` giữ nguyên khóa; `detail.message` chỉ còn chữ bên ngoài nguyên văn. Tập khóa `params` bằng đúng `INFIRMARY_REASON_PARAMS[code]`; không tham số tùy chọn (chi tiết lúc có lúc không là hai mã).
2. `EVENT_VERSION` của domain là nguồn của `v`; hooks dùng `CURRENT_EVENT_VERSION` của eventlog. Bước `v1ToV2` chỉ đổi `v`, trừ `quest.infirmary` có `reason` chuỗi → `legacy { text }`.
3. Mã lý do: bảng ở mục 2 của hợp đồng (`breaker:*`, `judge:*`, `restart:*`, `script:*`, `quest:max_attempts`, `legacy`). Khóa i18n `cli.quest.infirmary.reason.<nhóm>.<tên>`.
4. `hookOutputHead`: ≤ 5 dòng không rỗng đầu, mỗi dòng ≤ 200 ký tự cắt ở khoảng trắng (thêm `…`), bỏ mã ANSI; `errors` = số dòng khớp `/error/i`; `total_lines`. `errors = 0` → `breaker:commit`, ngược lại `breaker:commit_errors`. File `pre-commit.log` trong `rescue.dir`; tham số `log` = `.runs/<quest>-<n>/pre-commit.log`.
5. `ToolInfo.notes?: DoctorNote[]` (mã ở mục 4.2 của hợp đồng, khóa `cli.doctor.note.<tên>`), `detail?: string` vẫn là chữ ngoài in nguyên văn; adapter file trả gì cũng chạy, ghi chú sai thành `doctor:bad_note`.
6. Không người ghi nào phát `legacy` sau d4; giữa d2 và d4 người ghi hiện có bọc câu cũ thành `legacy` (chỉ trên nhánh đội).
7. Mỗi phần chạy các check của lãnh thổ trên nhánh của nó; chỉ quest ghép chạy mọi thứ trên nhánh đã gộp.

## Sub-quests

Kích thước file đọc lấy từ brief khi có (breaker.ts 9.1 KB, judge.ts 7.8 KB, restart.ts 4.1 KB, infirmary.ts 7.0 KB, claude doctor 3.8 KB, codex doctor 2.6 KB, kit 22.9 KB/5 file, worktree-ops.ts 8.8 KB), còn lại ước từ phần đã đọc. Lãnh thổ không có đồ thị code trong prompt này, nên "vùng ảnh hưởng" lấy bằng grep (kê dưới mỗi phần). Mọi phần lớp `knight`: cần sửa file và chạy `pnpm test`, `pnpm typecheck`, `pnpm lint` cùng các check (`pnpm schemas`, `pnpm docs:gen` khi đổi schema).

### d1 — `EVENT_VERSION` cho mọi người ghi (refactor, D)

- Đổi: thêm `EVENT_VERSION = 1` (`as const`) trong `packages/domain/src/schema/event/event.ts`, `v: z.literal(EVENT_VERSION)`, export; mọi `v: 1` trong mã chạy và fixture TS thành hằng (hooks: `CURRENT_EVENT_VERSION`). Không đổi hành vi.
- scope_paths: `packages/domain/src/**`, `packages/eventlog/src/**`, `packages/hooks/src/**`, `packages/runner-core/src/runner/run-log*.ts`, `packages/steward/src/**`, `packages/sandbox/src/**`, `apps/cli/src/**`, `apps/cli/test/**`.
- Vùng ảnh hưởng: chính các file có `v: 1` (khoảng 32 file, grep `\bv: 1\b`).
- Đọc: từng file chỉ quanh dòng có `v: 1` (khoảng 35 chỗ, < 3 KB mỗi chỗ).
- Lượt: khoảng 70; context đỉnh: khoảng 70 000; token: khoảng 450 000; 50 phút.

### d2 — Domain và eventlog: mã lý do, payload v2, migrate (build, C)

- Đổi: `packages/domain/src/infirmary/reasons.ts` (mới), `InfirmaryReasonSchema`, `QuestInfirmaryDataSchema.reason`, `EVENT_VERSION = 2`, `Breaker.params` trong `packages/domain/src/breaker/`; `packages/eventlog/src/migrations/v1-to-v2.ts` + `v2.jsonl`; người ghi lý do hiện có (`packages/steward/src/infirmary.ts`, `packages/sandbox/src/ledger.ts`) bọc câu cũ thành `legacy`; người đọc (`apps/cli/src/quest/infirmary.ts`, `apps/cli/src/sandbox/timeline.ts`, `packages/steward/src/notice.ts`, `sessions/continuation.ts`) đọc `legacy` để cây xanh; `pnpm schemas`, `pnpm docs:gen`.
- scope_paths: như d1 cộng `packages/domain/README.md`, `packages/eventlog/README.md`, `docs/implementation-plan/2-data-and-events.md`.
- Vùng ảnh hưởng: người đọc `data.reason` của `quest.infirmary` (khoảng 15 file: grep `quest.infirmary`) và mọi người dùng `Breaker` (`packages/steward/src/sessions/breaker.ts`).
- Đọc: `state-data.ts` (khoảng 9 KB, đọc dòng 70-160), `event.ts` (4 KB), `migrations/*` (5 KB), `evaluate.ts` (khoảng 3 KB), `steward/src/infirmary.ts` (7 KB), `apps/cli/src/quest/infirmary.ts` (4 KB), `sandbox/src/ledger.ts` (đoạn 100-160), khoảng 12 spec chỉ đoạn dính.
- Lượt: khoảng 85; context đỉnh: khoảng 95 000; token: khoảng 650 000; 75 phút.

### d3 — runner-core: đầu output hook, `pre-commit.log`, ghi chú doctor (build, C)

- Đổi: `packages/runner-core/src/plot/hook-output.ts` (mới), `worktree-ops.ts` (bỏ `DETAIL_CHARS`, thêm `head`, `log`, ghi file), `runner/doctor-notes.ts` (mới), `runner/types.ts` (`notes`), `runner/hook-built.ts` (`hookNote`), `kit/adapter-module.ts` (ghi chú hook vào `notes`, kiểm `notes` của adapter file), `index.ts`, README.
- scope_paths: `packages/runner-core/src/plot/worktree-ops*.ts`, `packages/runner-core/src/plot/hook-output*.ts`, `packages/runner-core/src/runner/**`, `packages/runner-core/src/kit/**`, `packages/runner-core/src/conformance/**`, `packages/runner-core/src/index.ts`, `packages/runner-core/README.md`.
- Vùng ảnh hưởng: `commitWorktree` được `packages/steward/src/sessions/commit.ts` gọi (d4 đọc `head`/`log`); `ToolInfo` được 3 adapter và `apps/cli/src/doctor/check-tribe.ts`, `apps/cli/src/run/tool-found.ts` dùng (d6). Thêm trường tùy chọn nên không ai gãy.
- Đọc: `worktree-ops.ts` 8.8 KB, kit 22.9 KB (chủ yếu `adapter-module.ts`, `kit.spec.ts`), `hook-built.ts` 1.5 KB, `types.ts` (đoạn 130-160), `rescue.ts` (cách `saveStaged` che secret).
- Lượt: khoảng 55; context đỉnh: khoảng 75 000; token: khoảng 420 000; 50 phút.

### d4 — Steward và sandbox phát mã (build, C)

- Đổi: `InfirmaryCause` mang `reason`; `breaker.ts` (time/tokens/turns từ `Breaker.params`, commit từ `head`/`log`, patch, `forbidden_paths`, các mã `judge:`), `judge.ts`, `sessions/settle.ts`, `restart.ts`, `sessions/secrets.ts`, script tier, `infirmary.ts` (bỏ câu tiếng Anh, `refusedPatchOf` đọc `legacy`), `packages/sandbox/src/ledger.ts`.
- scope_paths: `packages/steward/src/**`, `packages/steward/README.md`, `packages/sandbox/src/**`, `packages/sandbox/README.md`.
- Vùng ảnh hưởng: người đọc event (d5 hiển thị); không package nào import `infirmaryReason` ngoài steward (grep).
- Đọc: breaker.ts 9.1 KB, judge.ts 7.8 KB, restart.ts 4.1 KB, infirmary.ts 7.0 KB, secrets.ts (khoảng 4 KB), settle.ts (đoạn 160-225), commit.ts (khoảng 4 KB), script-quest.ts (đoạn quanh infirmary), sandbox ledger.ts; spec tương ứng chỉ đoạn dính.
- Lượt: khoảng 75; context đỉnh: khoảng 90 000; token: khoảng 570 000; 70 phút.

### d5 — CLI nói lý do trạm quân y bằng i18n (build, D)

- Đổi: `apps/cli/src/quest/infirmary-reason.ts` (mới: mã → khóa → `t()`), `apps/cli/src/quest/infirmary.ts`, `apps/cli/src/run/bell.ts`, `apps/cli/src/sandbox/timeline.ts`; khóa `cli.quest.infirmary.reason.*` vi/en; spec giữ khóa và placeholder khớp `INFIRMARY_REASON_PARAMS`.
- scope_paths: `apps/cli/src/quest/**`, `apps/cli/src/run/bell*.ts`, `apps/cli/src/run/compose*.ts`, `apps/cli/src/sandbox/**`.
- Vùng ảnh hưởng: `detailLines`/`tripLabel` được `bell.ts` dùng (trong scope).
- Đọc: `infirmary.ts` 4 KB, `infirmary.spec.ts` (khoảng 6 KB), `bell.ts` (khoảng 4 KB), `timeline.ts` (khoảng 3 KB), locale (grep `cli.quest.infirmary`, không đọc cả file).
- Lượt: khoảng 45; context đỉnh: khoảng 60 000; token: khoảng 260 000; 35 phút.

### d6 — Adapter trả ghi chú có mã, `elvaria doctor` in tiếng Việt (build, C)

- Đổi: `packages/runner-claude/src/doctor.ts`, `packages/runner-codex/src/doctor.ts`, `doctor()` trong `packages/runner-antigravity/src/runner.ts` trả `notes`; `apps/cli/src/doctor/check-tribe.ts` (`loginFindings`) in qua `cli.doctor.note.*`; khóa vi/en.
- scope_paths: `packages/runner-claude/**`, `packages/runner-codex/**`, `packages/runner-antigravity/**`, `apps/cli/src/doctor/**`, `apps/cli/src/tribe/**`, `apps/cli/src/run/codex*.ts`, `apps/cli/src/run/antigravity*.ts`, `apps/cli/src/run/tool-found*.ts`.
- Vùng ảnh hưởng: `loginFindings` được `apps/cli/src/tribe/check.ts` dùng (trong scope); `NOT_FOUND`, `NOT_SIGNED_IN` chỉ dùng trong adapter và spec của nó.
- Đọc: claude doctor 3.8 KB, codex doctor 2.6 KB, antigravity `runner.ts` (đoạn 90-100, 225-270), spec doctor của từng adapter, `check-tribe.ts` (đoạn 195-215), locale (grep `cli.doctor`).
- Lượt: khoảng 60; context đỉnh: khoảng 75 000; token: khoảng 400 000; 50 phút.

## Done when

Trên nhánh quest ghép (mọi phần đã gộp):

- `pnpm check` xanh: check `lint`, `format`, `typecheck`, `test`, `boundaries`, `schemas`, `docs_gen`, `docs_check`, `i18n`.
- `pnpm --filter @elvaria/eventlog test` có ca: dòng `quest.infirmary` v1 (`reason` là câu tiếng Anh) đọc ra `v: 2`, `reason.code = legacy`, `params.text` đúng câu cũ.
- `pnpm --filter @elvaria/runner-core test` có ca: hook in 300 dòng rồi thất bại → `head.lines` ≤ 5, không dòng nào cắt giữa chữ, `errors` và `total_lines` đúng, `pre-commit.log` chứa toàn bộ output.
- `pnpm --filter @elvaria/steward test` có ca: quest vào trạm quân y với `reason.code` `breaker:commit_errors` và `params.log = .runs/<quest>-<n>/pre-commit.log`.
- `pnpm --filter @elvaria/cli test` có ca: `elvaria doctor` với locale vi in dòng chi tiết của adapter claude, codex và adapter file bằng tiếng Việt (chỉ version và chữ ngoài nguyên văn); `quest show` của một dòng v1 in câu cũ nguyên văn.

## Unknowns

None. Mọi điều phần cần đã đọc được trong code (chuỗi migrate rỗng, `plotBaseOf` tách nhánh phần từ nhánh phần nó chờ, `rescue.dir` là thư mục lượt chạy). Thời gian chạy của check không đổi đáng kể với các thay đổi này nên không cần probe.
