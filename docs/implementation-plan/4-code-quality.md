# Kế hoạch triển khai Elvaria · §4 Chất lượng code — cho người và AI đọc

Một phần của [kế hoạch triển khai](../implementation-plan.md), tách ra ở P1-52: chỉ chuyển chỗ, nội dung giữ nguyên. Số mục giữ làm định danh; mục lục và luật ghi ở file chính.

---

## 4. Chất lượng code — cho người và AI đọc

### 4.1 Ngôn ngữ

(ADR 0014)

- **Identifier, comment, commit message, tên file, ADR, README package: tiếng Anh.** Hai CLI và mọi thư viện đều "nghĩ" bằng tiếng Anh; identifier có dấu không gõ được trong terminal; lint rule, lỗi TypeScript, stack trace đều tiếng Anh nên code tiếng Anh giảm chuyển ngữ trong đầu agent.
- **Mọi id trong dữ liệu cũng là tiếng Anh chuẩn**: `kind`, `class`, `status`, `ritual`, `script`, icon, asset, khóa JSON, tên theme — từ thông dụng mà kỹ sư ngoài dự án đọc hiểu ngay (`fix`, không `exorcise`; `kind-build`, không `kien-tao`). Quy tắc chữ hoa/thường ở §2.7. Lint: `pnpm docs:check` quét mọi `.json` dữ liệu trong `registry-default`, `themes`, `ui-kit` bắt giá trị của khóa `id`/`*_id` có ký tự ngoài `[a-z0-9_-]`; id "màu mè" (bảng `fancy` của glossary) bị chặn như từ cấm, trong mọi mã chạy và dữ liệu (P0-07: id trong `.ts` là chuỗi, không phân biệt được với chuỗi khác, nên luật ký tự chỉ áp cho JSON); `gen-icons` fail khi icon chưa có tên EN.
- **Thuật ngữ thế giới có bảng VI ↔ EN cố định**: [glossary.md](../glossary.md), nguồn máy đọc `packages/i18n/src/glossary.json`. Identifier dùng **đúng từ EN trong bảng** (`steward`, không `dispatcher`; `chancellor`, không `intake`; `seal`, không `approve`). `pnpm docs:check` quét identifier cấm (`dispatcher`, `intake`, `approve`, `reviewer`, `worker` …); danh sách từ cấm nằm cạnh glossary (bảng `banned` và `fancy` của `glossary.json`). Từ P0-07, phạm vi quét: identifier (parser TypeScript), khóa JSON và chuỗi dạng id (không khoảng trắng, chữ thường đầu, không phải URL) trong mã chạy và dữ liệu; bỏ comment, chuỗi văn xuôi, Markdown, test, fixture, file cấu hình công cụ; `budget` và `agent` (chỉ cấm theo một nghĩa) để review bắt; tên do bên thứ ba đặt (`projectService` của typescript-eslint, lãnh thổ `dc1-se-team`) nằm trong `ALLOWED` của `scripts/docs-identifiers.mjs`.
- **Chuỗi hiển thị (CLI và UI): song ngữ qua i18n**, VI mặc định (brief §7: "văn bản giao diện tiếng Việt; thuật ngữ thế giới giữ nguyên"). CLI dùng `packages/i18n` với `t(key)`; ESLint `i18next/no-literal-string` trong `apps/world`, `apps/lite`, và trong `apps/cli` cho phần xuất ra người dùng (tắt cho log debug). `pnpm i18n:check` so khóa VI/EN (mẫu dc1). (P0-08) Với `apps/cli` luật chạy ở mode `all` (không có JSX), trên mọi mã chạy của `apps/cli/src` (`packages/config/eslint-i18n.mjs`, `eslint-plugin-i18next` 6.1 như dc1): chuỗi dạng id (không khoảng trắng, không chữ hoa, không dấu: `git`, `--version`, `inbox/done`), chuỗi chỉ có ký hiệu, hằng UPPER_CASE, so sánh, chuỗi khớp union literal của TypeScript, `t()` và `new Error()` (log, tiếng Anh) được bỏ qua. Ngôn ngữ in ra: `--locale` > `kingdom.owner.locale` > `vi`; `init --locale` đặt `owner.locale`. `StoreIssue.code` và `RegistryIssue.code` dịch qua khóa `store.issue.*`, `registry.issue.*`; trạng thái quest, nhân vật qua `quest.status.*`, `character.status.*`; tên kind, nghề lấy `name_vi`/`name_en` của registry (theme có từ giai đoạn 4).
- **Tài liệu người dùng** (`docs/*.md`: kế hoạch, brief, implementation-plan, glossary, reference, guides): **tiếng Việt**. ADR: tiếng Anh (mẫu dc1; agent đọc nhiều hơn người). Prompt mẫu cho nhân vật: tiếng Anh (hiệu quả token). **Những gì người dùng đọc** — `handover.md`, notes của verdict, `blocked.question`, biên niên sử, thông báo chuông, UI — viết theo `kingdom.owner.locale` (mặc định `vi`). Prompt dặn: "Write handover and notes in Vietnamese; keep identifiers, commands, paths and error text verbatim." Verifier đọc tiếng Việt tốt với cả hai họ model; phần văn xuôi tốn khoảng 1,3× token, chấp nhận.

### 4.2 Quy ước duy nhất

| Thứ | Quy ước | Enforce |
|---|---|---|
| Tên file | `kebab-case.ts`; test cạnh file `x.spec.ts`; fixture `__fixtures__/`; một export chính mỗi file, tên file = tên export (`select-verifier.ts` → `selectVerifier`) | `eslint-plugin-unicorn/filename-case` |
| Hàm | `camelCase`, động từ đầu (`planTick`, `selectVerifier`, `redact`); hàm thuần không tiền tố; hàm IO trả `Promise` và nhận deps tường minh | review + `max-lines-per-function: 60` |
| Kiểu | `PascalCase`; union chuỗi thay enum (`type QuestStatus = 'open' \| …`); branded id (`QuestId`) | `@typescript-eslint/naming-convention` |
| Hằng | `UPPER_SNAKE` trong `constants.ts` của package; không magic number | `no-magic-numbers` bật trong `domain`, `steward` (bỏ qua 0, 1, -1, 100) |
| Kích thước | file ≤ 300 dòng, hàm ≤ 60 dòng, độ sâu lồng ≤ 3 | `max-lines`, `max-lines-per-function`, `max-depth` |
| Kiểu động | `any` cấm; `unknown` + narrow; `as` chỉ ở ranh giới IO kèm comment vì sao | `strictTypeChecked` + `no-explicit-any` + `consistent-type-assertions` |
| Lỗi | `Result<T, E>` trong domain (không throw); throw `ElvariaError(code)` ở tầng IO với mã từ `ERROR_CODES`. (P0-11, rà theo code) Không có `ElvariaError`/`ERROR_CODES` chung: mỗi package có giá trị mang `code` riêng mà CLI dịch theo `code` (`StoreIssue`, `RegistryIssue`, `ArgsError` trả về; `EventLogError` throw); lỗi IO không ai xử lý được thì throw nguyên (ADR 0002) | `@typescript-eslint/only-throw-error` |
| Comment | giải thích **vì sao** (ràng buộc, quyết định, bẫy đã gặp); không mô tả cái gì; link ADR khi có | review; comment trong hook của dc1 là chuẩn |
| Commit | Conventional Commits `type(scope): why`, scope = tên package; thân nói vì sao | commitlint trong husky `commit-msg` |
| README mỗi package | 4 mục cố định: *Does* / *Does not* / *Depends on* / *How to test*. (Chốt sau P0-11) Không có trần số dòng: bốn mục là đủ, package làm nhiều việc thì README dài theo (trước ghi ≤ 40 dòng) | `pnpm docs:check` kiểm tồn tại + 4 heading |
| Test | vitest; mỗi thay đổi có test cùng commit; domain coverage 100% (gate), package khác ≥ 80% | `vitest --coverage` thresholds theo package |
| Import | `import type` tách riêng; không import file sâu của package khác; không default export | `consistent-type-imports`, `import-x/no-default-export`, boundaries |

TypeScript: `packages/config/tsconfig/base.json` = bản dc1 (strict, noUncheckedIndexedAccess, noImplicitOverride, noImplicitReturns, noFallthroughCasesInSwitch, useUnknownInCatchVariables, isolatedModules) + `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `module: NodeNext`, `target: ES2023`, `types: []` (P0-01; `tsconfig/node.json` thêm `types: ["node"]`). TypeScript `~5.9.3` như dc1: `typescript-eslint` 8.72 chỉ nhận TypeScript < 6.1. (P0-02) Import tương đối viết đuôi `.ts` (`./result.ts`) như dc1: `allowImportingTsExtensions` + `erasableSyntaxOnly` trong `base.json`, nên Node 24 chạy thẳng được file `.ts` và trình biên dịch cũng chặn enum/namespace; khi đóng gói CLI bằng `tsc -b` thì bật `rewriteRelativeImportExtensions`. Package không được thấy Node (`NO_NODE_TYPES` trong `boundaries.mjs`: domain và phía trình duyệt) viết `vitest.config.mjs` ngoài tsconfig, vì type của Vite kéo `@types/node` vào cả chương trình (boundaries spec kiểm). `no-magic-numbers` bỏ qua thêm `0n`, `1n`. `Instant` là mili giây epoch có brand; file lưu ISO 8601 có offset qua `zonedTime(tz).format`. Prettier: bản dc1 (110 cột, single quote, trailing comma, LF).

### 4.3 Chỗ khác kế hoạch sản phẩm về công nghệ

- Không dùng Python ở đâu cả (kế hoạch sản phẩm mục 3 còn ghi "Node.js hoặc Python"): một ngôn ngữ, một toolchain, hook và CLI cùng runtime.
- Không dùng SQLite ở giai đoạn 0–2 (kế hoạch ghi "SQLite khi cần truy vấn"): file JSON + event log + snapshot đủ cho một người dùng; điều kiện bật SQLite ghi trong ADR 0004.
- Không dùng enum TypeScript; không dùng class ngoài adapter (hàm + kiểu dữ liệu dễ test và dễ cho agent sửa).
