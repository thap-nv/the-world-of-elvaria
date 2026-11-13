# Kế hoạch triển khai Elvaria · §1 Cấu trúc repo và ranh giới module

Một phần của [kế hoạch triển khai](../implementation-plan.md), tách ra ở P1-52: chỉ chuyển chỗ, nội dung giữ nguyên. Số mục giữ làm định danh; mục lục và luật ghi ở file chính.

---

## 1. Cấu trúc repo và ranh giới module

### 1.1 Monorepo pnpm, ESM, một app composition root

Monorepo pnpm workspaces, giống dc1-se-team nên tooling đã quen. Mỗi package là một ranh giới kiến trúc thật (package.json riêng, chỉ import được cái đã khai trong `dependencies`), không chỉ là thư mục. ESM thuần (`"type": "module"`), Node ≥ 24, package nội bộ không có build step khi dev (chạy bằng `tsx`), build `tsc` khi đóng gói CLI. (ADR 0001) (P0-08: không `tsx`, Node 24 chạy thẳng `.ts`; build chỉ cho `apps/cli` và đường nóng của hook, §7.)

```
elvaria/
  package.json                 # scripts gốc (P0-01): check, check:fast, lint, format, format:check, typecheck, test,
                               #   boundaries, schemas, docs:gen, docs:check, i18n:check, elvaria
  pnpm-workspace.yaml
  CLAUDE.md                    # luật repo (§5.1)
  .claude/                     # settings.json + hooks/ (guard-bash, guard-edit, typecheck-touched, stop-checks) + rules/ (domain, runner, hooks) — P0-11
  docs/                        # implementation-plan, reference/, adr/, glossary, schemas/ (sinh ra từ P0-03), guides/, spikes/
  scripts/                     # gen-schemas.mjs, gen-icons.mjs, icon-names.json, docs-gen.mjs, docs-check.mjs (+ các phần docs-*.mjs),
                               #   i18n-check.mjs, not-yet.mjs, docs-note.mjs
  packages/
    config/                    # @elvaria/config — tsconfig/eslint/prettier preset, boundaries.mjs (bảng phụ thuộc)
    domain/                    # @elvaria/domain — lõi thuần, KHÔNG IO
    eventlog/                  # @elvaria/eventlog — JSONL append/tail/redact (tầng sự kiện)
    store/                     # @elvaria/store — đọc/ghi thư mục kingdom, lock, atomic write, migrate
    registry-default/          # @elvaria/registry-default — kinds/classes/rituals/scripts/tags.json mặc định + scripts/*.mjs + prompts/*.md
    runner-core/               # @elvaria/runner-core — interface AgentRunner, prompt builder, plot, checks, treasury, chuẩn hóa sự kiện
    runner-claude/             # @elvaria/runner-claude — adapter Claude Code CLI
    runner-antigravity/        # @elvaria/runner-antigravity — adapter Antigravity CLI (agy), mặc định cho tộc Gemini
    runner-gemini/             # @elvaria/runner-gemini — adapter Gemini CLI + API key (đường lui)
    runner-codex/              # @elvaria/runner-codex — adapter Codex CLI (tùy chọn, P1-12d, khi người dùng có tài khoản)
    hooks/                     # @elvaria/hooks — một script hook nhỏ, nhanh, các CLI gọi vào
    steward/                   # @elvaria/steward — Nhiếp chính: dispatcher, cầu dao, mana, lịch, bậc script
    chancellor/                # @elvaria/chancellor — Tể tướng: câu lệnh → quest draft
    sandbox/                   # @elvaria/sandbox — sinh ngày giả, replay
    herald/                    # @elvaria/herald — Sứ giả: HTTP + WebSocket, world state, ghi inbox
    i18n/                      # @elvaria/i18n — chuỗi VI/EN cho CLI và UI, glossary.json
    ui-kit/                    # @elvaria/ui-kit — elvaria.css, icons.ts, tokens.ts, fonts/ — nhập một lần từ design/, sau đó là nguồn; KHÔNG framework
    ui/                        # @elvaria/ui — thành phần Preact dựng từ Components.dc.html, dùng chung cho world + lite
  apps/
    cli/                       # elvaria — composition root: init/territory/quest/character/say/seal/return/run/sandbox/doctor/migrate
    world/                     # @elvaria/world — Three.js + Vite (giai đoạn 3)
    lite/                      # @elvaria/lite — khách nhẹ 2D cho điện thoại (giai đoạn 2)
  themes/
    fantasy/                   # dữ liệu theme: kind/class/ritual → icon id, danh hiệu, tòa nhà, hoạt hình; assets; LICENSES.md
  design/                      # bàn giao thiết kế v0.2 — bản gốc đầu tiên, giữ nguyên làm lịch sử, không build
```

17 package + 3 app (thêm `runner-codex` khi làm P1-12d). Adapter tộc còn có thể là **một file của người dùng** trong kingdom (`adapters/<name>.mjs`, §3.14), không cần package. Thư mục **kingdom** (trạng thái của người dùng) **không** nằm trong repo: người dùng chọn khi `elvaria init --kingdom <dir>`, ví dụ `D:\Dummy\Tool - Personal\Kingdom of Agents\kingdom`.

### 1.2 Ba tầng ↔ package

| Tầng (nguyên tắc 1) | Package | Được biết gì |
|---|---|---|
| Tầng việc (work engine) | domain, store, registry-default, runner-core, runner-claude, runner-antigravity, runner-gemini, steward, chancellor | Quest, nhân vật, worktree, CLI. Không biết renderer tồn tại. |
| Tầng sự kiện (event bus) | eventlog, hooks | Chỉ biết schema Event. Không biết máy trạng thái quest, không biết renderer. |
| Tầng thế giới (renderer) | herald, world, lite, ui, ui-kit, themes | Chỉ đọc event log + snapshot; muốn tác động thì **ghi lệnh vào inbox** (file), không gọi tầng việc. |

### 1.3 Luật phụ thuộc (DAG)

```
config              ← (dev-only, mọi package)
domain              ← ∅                                  (chỉ zod; không node:*; clock/random tiêm vào)
eventlog            ← domain
store               ← domain, eventlog
registry-default    ← domain                             (dữ liệu + validate bằng schema của domain)
runner-core         ← domain, store, eventlog
runner-claude       ← runner-core
runner-antigravity  ← runner-core
runner-gemini       ← runner-core
runner-codex        ← runner-core                        (tùy chọn)
hooks               ← eventlog                           (KHÔNG store, KHÔNG runner — phải khởi động < 100 ms)
steward             ← domain, store, eventlog, runner-core (chỉ interface AgentRunner; runner cụ thể tiêm từ cli)
chancellor          ← domain, runner-core
sandbox             ← domain, eventlog, store
herald              ← domain, store, eventlog, sandbox    (KHÔNG steward, KHÔNG runner-*)
i18n                ← ∅
ui-kit              ← ∅                                  (CSS + icon + token; nhập từ design/ một lần, không import gì)
ui                  ← domain (types), i18n, ui-kit       (Preact; không store/eventlog/IO)
cli                 ← tất cả trừ ui-kit, ui, world, lite  (composition root duy nhất)
world               ← domain (types + protocol), i18n, ui-kit, ui   (KHÔNG store/eventlog: chỉ nói chuyện qua WebSocket)
lite                ← domain (types + protocol), i18n, ui-kit, ui
```

Vì sao từng cạnh:

- `domain` không có IO nên test bằng vitest thuần và chạy được trong trình duyệt (world import types từ đây). Clock và random tiêm vào (`Clock`, `IdSource`) để máy trạng thái và việc chọn người là hàm thuần, test deterministic. (ADR 0002)
- `eventlog` tách khỏi `store` để tầng sự kiện là một package nhỏ, không kéo theo logic quest; `hooks` chỉ phụ thuộc nó nên mỗi lần CLI gọi hook, Node chỉ nạp vài file.
- `steward` không import adapter nào: nó chỉ thấy `AgentRunner` và `capabilities` của từng tộc. Thêm tộc = một adapter (package trong repo hoặc file `adapters/<name>.mjs` trong kingdom) + một mục theme + tài khoản người dùng tự đăng nhập; `apps/cli` nạp adapter theo `kingdom.tribes[].adapter`. Lõi không đổi. (ADR 0006, 0021)
- `herald` không import `steward`: Sứ giả chỉ đọc file và ghi lệnh vào `inbox/`; Nhiếp chính là người duy nhất đổi trạng thái quest (single writer, §3.1). Khác sơ đồ mục 3 của kế hoạch sản phẩm (SG → QB), lý do ở §9.1. (ADR 0005)
- `world`/`lite` không chạm hệ thống file; chúng chỉ nghe WebSocket, nên "thay toàn bộ hình ảnh mà không đụng logic" là thật: xóa `apps/world`, không có gì vỡ.
- Thêm **dạng nhiệm vụ** = thêm một mục trong `registry/kinds.json` + `rituals.json` (dữ liệu, có schema) + theme; `domain` xử lý `KindId` là chuỗi đã validate qua registry, không có `switch` theo kind trong lõi. Thêm **theme** = thêm thư mục `themes/<name>/`. (ADR 0016)

### 1.4 Enforce bằng lint (một nguồn, ba lớp)

1. **Nguồn duy nhất**: `packages/config/boundaries.mjs` xuất bảng `{ package: [allowed deps] }` đúng như DAG trên.
2. **ESLint** (`packages/config/eslint.mjs`, theo mẫu dc1): từ bảng đó sinh `no-restricted-imports` cho từng package. Import một `@elvaria/*` không có trong danh sách là lỗi, kèm thông điệp "X may not import Y; see docs/implementation-plan.md §1.3". Thêm cho `domain`: cấm `node:*`, `fs`, `path`, `child_process`, `process.env`, `Date.now`, `Math.random`, `setTimeout` (`no-restricted-imports` + `no-restricted-globals` + `no-restricted-syntax`). Thêm cho `hooks`: cấm mọi import ngoài `node:fs`, `node:path`, `node:process`, `@elvaria/eventlog`. (P0-01) Hai luật thêm này áp cho **mã chạy** của package — mọi file trừ `*.spec.ts`, `__fixtures__/`, `*.config.*` — để test của domain đọc được fixture (P0-04 đọc `elvaria.css`) và test của hooks nạp được vitest; domain cấm **mọi** built-in Node (cả `path`, `crypto`…) và thêm global `fetch`, `crypto`, `performance`, `Buffer`, `new Date()` không đối số. `@elvaria/config` là dev-only: file cấu hình dùng được, mã chạy thì không.
3. **dependency-cruiser** chạy trong `pnpm boundaries` (CI + pre-push): đọc cùng `boundaries.mjs`, kiểm thêm (a) không có vòng, (b) `package.json.dependencies` khớp import thật, (c) không import file sâu `@elvaria/x/src/...` (chỉ qua `exports`). ESLint cho phản hồi tức thì trong editor; depcruise là cổng cuối vì nhìn cả đồ thị.
4. `tsconfig` project references theo cùng bảng: TypeScript không resolve được package chưa khai báo, thêm một lớp miễn phí. (P0-01) `tsconfig/base.json` đặt `types: []`, nên domain và phía trình duyệt không thấy `process`, `node:fs`; package Node extend `tsconfig/node.json`. (P0-11, rà theo code) Không workspace nào có project references (không cần: không build khi dev, §7); lớp thứ ba thật là pnpm chỉ link các workspace đã khai, nên TypeScript không resolve được phần lớn package chưa khai, trừ ba package là devDependency của gốc (`config`, `domain`, `i18n` nằm trong `node_modules/` gốc, mọi workspace thấy): dependency-cruiser vẫn là cổng. `boundaries.spec.ts` vẫn cấm reference ra ngoài bảng nếu có.

Test cho luật: `packages/config/boundaries.spec.ts` khẳng định bảng là DAG (không vòng), `domain`, `i18n` và `ui-kit` có 0 phụ thuộc, `herald` không chứa `steward`/`runner-*`; (P0-01) thêm: phía trình duyệt chỉ chạm `domain`/`i18n`/`ui-kit`/`ui`, chỉ `cli` import runner cụ thể, và mỗi workspace trên đĩa có tên `@elvaria/<key>`, `package.json` và `tsconfig` references chỉ khai cái bảng cho phép. `eslint-boundaries.spec.ts` chạy luật ESLint trên code mẫu; `depcruise.spec.ts` chạy luật depcruise trên `packages/config/__fixtures__/repo` (một vi phạm cài sẵn cho mỗi luật).
