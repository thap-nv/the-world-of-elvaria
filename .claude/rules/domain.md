---
paths:
  - 'packages/domain/**'
---

# Luật · packages/domain / Rules · packages/domain

Áp dụng khi sửa `packages/domain/**`; cộng thêm vào [CLAUDE.md](../../CLAUDE.md), không thay nó.

## Không IO (ADR 0002)

- Mã chạy (mọi file trừ `*.spec.ts`, `src/**/__fixtures__/`, `*.config.*`) không import built-in Node nào và không dùng `process`, `Buffer`, `fetch`, `crypto`, `performance`, `setTimeout`/`setInterval`, `Date.now()`, `new Date()` không đối số, `Math.random()`. ESLint chặn (`packages/config/eslint-boundaries.mjs`); `tsconfig/base.json` đặt `types: []` nên `process` không type-check.
- Thời gian và ngẫu nhiên đi vào qua `Clock`, `RandomSource`, `IdSource` (`src/core/`); hàm quyết định nhận `now: Instant`. Giờ ghi file và ngày địa phương qua `zonedTime(tz)`.
- Không throw: trả `Result<T, E>` (`ok`, `err`), `E` là union có `code`.

## Viết code

- Quyết định là hàm thuần trên snapshot (`transition`, `planTick`, `canTake`…); steward, sandbox, CLI chỉ thực thi kết quả.
- Không `switch` theo kind, class, ritual, script, tag hay tộc: đó là dữ liệu registry và `kingdom.tribes[]` (ADR 0016, 0021). Lõi chỉ thấy `capabilities`; phần thiếu năng lực đi qua `tribeLimitsOf`.
- Số dùng để quyết định có tên trong `src/constants.ts` hoặc `constants.ts` của thư mục (`no-magic-numbers`, bỏ qua 0, 1, -1, 100, `0n`, `1n`).
- Không enum, class, namespace (`erasableSyntaxOnly`): union chuỗi từ mảng `as const` (`QUEST_STATUSES`…), branded id (`QuestId`, `TribeId`…).
- Import tương đối viết đuôi `.ts`. Package khác chỉ dùng được thứ `src/index.ts` export: thêm export ở đó.
- Mỗi thay đổi quest, nhân vật, lãnh thổ là một dòng event mang view sau thay đổi (`questViewOf`, `characterViewOf`, `territoryViewOf`; tên dòng quest từ `questLogTypeOf`), để `reduce(events)` bằng `worldStateOf(files)` (P0-09).

## Schema và bảng sinh ra (ADR 0003)

- Zod trong `src/schema/**` là nguồn. Đổi schema hay `examples/**` → `pnpm schemas`, commit `docs/schemas/**` cùng lúc, rồi `pnpm test`. Đổi không tương thích → tăng `version`, thêm `packages/store/src/migrations/<contract>/v<n>-to-v<n+1>.ts` và fixture `v<n+1>.json` cạnh các fixture cũ; event thì tăng `v` và migrate trong `packages/eventlog/src/migrations/`.
- Đổi `EVENT_TYPES` hay schema `data` của event → `pnpm docs:gen` (`docs/events.md`); bảng `events` của `packages/i18n/src/glossary.json` phải chứa type mới (`pnpm docs:check`).
- Đổi `QUEST_TRANSITIONS` → `pnpm docs:gen` (bảng §2.5 của implementation-plan). Trước khi sửa máy trạng thái, đọc `src/quest/transitions.ts`, `transition.ts`, `effects.ts`, spec của chúng và §2.5.

## Bẫy đã gặp

- Lượt máy của quest ghép (không có `assignee`) mở lượt `n` mà không tăng `attempts` (`machineRun`, `quest/effects.ts`), và chỉ chạy khi quest chưa từng có lượt nào (`machineMergeDue`: `attempts = 0` **và** `attempt_log` rỗng). `attempts = 0` một mình không đủ: `retry` từ trạm xá đặt nó về 0 mà giữ `attempt_log`, và trước P1-55 điều đó cho máy chạy lại trên commit vừa trượt, lại tính vào `max_attempts` (quest ghép Q1 của P1-50 vào trạm xá sau hai phiên hiệp sĩ). Sửa `startAttempt`, `machineMergeDue` hay luật quest ở `review` (`quest-rules.ts`: đã có lượt chạy = `attempts ≥ 1` hoặc một mục vai assignee) thì xét cả ba, kèm test cho chuỗi trượt → trạm xá → retry ([báo cáo P1-50](../../docs/guides/phase-1-rerun.md) §8 (e)).
- Luật người chấm khác model so với **mọi người từng làm** quest (`workedOn`, `VerifierPolicy.doers`), không chỉ `quest.assignee`: ở lượt của máy `assignee` là null (P1-50: người chấm Sonnet chấm quest ghép mà hiệp sĩ Sonnet đã làm hai lượt trước). "Khác họ" là họ không trùng họ của người làm nào.
- Một lần mở phiên thất bại phải để lại dấu trong `attempt_log` hay đưa quest đi đâu đó, nếu không `planTick` lên đúng nước cũ ở nhịp sau, mãi mãi. Đo trên Windows, agy 1.5.8 (PS-07, 2026-11-14): prompt của người chấm khoảng 39 636 ký tự, CLI nhận prompt trên dòng lệnh mà Windows dừng ở 32 767, spawn lỗi; trước fix/review-no-session Nhiếp chính chỉ ghi `warn` rồi chọn lại đúng người đó mỗi nhịp 5 s suốt 16 phút, không chuông, bản tấu không nêu. Nay người chấm đi `review.no_session` (outcome `no_session`, đếm như `crash`), người làm đi `breaker` trip `no_session`. Luật chọn lại trong lượt chấm (`leftVerifiersOf`) phải tính **mọi** cách rời đi không ra verdict, không chỉ cầu dao: người chấm Codex mà CLI từ chối schema sau 1 s, 0 token, đã lấy cả hai lượt của `REVIEW_BREAKS_MAX`.
- `runDirOf(quest, n, 'verifier')` là thư mục của phiên chấm **sắp mở** (`verify`, `verify-2`, …), tính từ `attempt_log` trước khi mục mới được thêm: Nhiếp chính dựng request trước nước `assign_verifier`, nên hai chỗ gọi cùng thấy một số. Đừng gọi nó sau khi mục đã thêm.
- Một `BreakerTrip` mới, hay một chỗ mới ghi lý do trạm quân y, cần cùng lúc ba thứ: mã (và tham số) trong `INFIRMARY_REASONS` / `INFIRMARY_REASON_PARAMS` của `src/infirmary/reasons.ts`, một hàng trong [hợp đồng mã lý do](../../docs/contracts/infirmary-reason-codes.md), và chuỗi VI/EN `cli.quest.infirmary.reason.<nhóm>.<mã>`. `apps/cli/src/quest/infirmary-reason.spec.ts` chỉ bắt chuỗi thiếu của mã đã có; mã thiếu và hàng hợp đồng thiếu thì không gì bắt chắc (`steward/src/sessions/breaker.ts` ép trip về `SessionTrip` trước khi ghép `breaker:${trip}`). Người ghi mới không dùng `legacy` (câu tiếng Anh của dòng cũ). PS-07: fix/review-no-session thêm trip `no_session` song song với đội mã lý do, lúc gộp (1afef56) phải thêm `breaker:no_session` và `judge:no_session` ([báo cáo PS-07](../../docs/guides/phase-1.5-report.md) §8).

## Test

- Coverage 100 % (statements, branches, functions, lines) là gate (`vitest.config.mjs`). Fixture và builder của spec nằm ở `src/**/__fixtures__/`, ngoài coverage.
- Spec không đọc được file (program không có type Node). Cần dữ liệu trên đĩa thì `vitest.config.mjs` đọc rồi `provide`, spec `inject` (mẫu `designCss`).
- Config vitest là `.mjs` ngoài tsconfig (`NO_NODE_TYPES` trong `boundaries.mjs`); đừng đổi thành `.ts`.
- Spec của domain chỉ tốn CPU, nên trần thời gian chỉ đo độ bận của máy: `testTimeout` 60 s ở `vitest.config.mjs`. Trước đó trần mặc định 5 s làm `quest/transition-property.spec.ts` (340 000 nước mỗi lượt, 2,5 s với coverage lúc máy rảnh) đỏ khi nhiều `pnpm check` chạy cùng lúc (fix/busy-machine). Đừng đặt lại trần ngắn cho từng spec.
- Đụng domain → `pnpm -r test` và `pnpm typecheck`: mọi package dùng domain.
