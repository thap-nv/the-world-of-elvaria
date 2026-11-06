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

- Zod trong `src/schema/**` là nguồn. Đổi schema → `pnpm schemas`, commit `docs/schemas/**` cùng lúc. Đổi không tương thích → tăng `version`, thêm `packages/store/src/migrations/<contract>/v<n>-to-v<n+1>.ts` và fixture `v<n>.json`; event thì tăng `v` và migrate trong `packages/eventlog/src/migrations/`.
- Đổi `EVENT_TYPES` hay schema `data` của event → `pnpm docs:gen` (`docs/events.md`); bảng `events` của `packages/i18n/src/glossary.json` phải chứa type mới (`pnpm docs:check`).
- Đổi `QUEST_TRANSITIONS` → `pnpm docs:gen` (bảng §2.5 của implementation-plan). Trước khi sửa máy trạng thái, đọc `src/quest/transitions.ts`, `transition.ts`, `effects.ts`, spec của chúng và §2.5.

## Test

- Coverage 100 % (statements, branches, functions, lines) là gate (`vitest.config.mjs`). Fixture và builder của spec nằm ở `src/**/__fixtures__/`, ngoài coverage.
- Spec không đọc được file (program không có type Node). Cần dữ liệu trên đĩa thì `vitest.config.mjs` đọc rồi `provide`, spec `inject` (mẫu `designCss`).
- Config vitest là `.mjs` ngoài tsconfig (`NO_NODE_TYPES` trong `boundaries.mjs`); đừng đổi thành `.ts`.
- Đụng domain → `pnpm -r test` và `pnpm typecheck`: mọi package dùng domain.
