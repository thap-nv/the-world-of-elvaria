# CLAUDE.md · Elvaria

Hướng dẫn cho AI agent (và người) làm việc trong repo này. Đọc hết trước khi sửa code.
Guide for AI agents (and people) working in this repo. Read it all before changing code.

## Dự án là gì / What this is

Elvaria là một thế giới fantasy low-poly chạy trên máy cá nhân (Windows và macOS); mỗi AI agent là một nhân vật có nghề, nhận việc thật (code, tài liệu, nghiên cứu) trên những repo người dùng gắn vào, làm trong worktree riêng, và được một nhân vật khác nghiệm thu trong một phiên mới. Lõi là một tiến trình Node (Quản sự) điều phối Claude Code và Antigravity CLI ở chế độ headless; trạng thái là file trong một thư mục kingdom ngoài repo; thế giới 3D chỉ nghe event log. Kế hoạch sản phẩm: [docs/ke-hoach-dung-elvaria-0.6.md](docs/ke-hoach-dung-elvaria-0.6.md) (mục 2 — 13 nguyên tắc — là bất biến). Kế hoạch triển khai: [docs/implementation-plan.md](docs/implementation-plan.md).

**Trạng thái hiện tại: xem cột Trạng thái ở §8; task tiếp theo là dòng `chưa làm` đầu tiên.** P0-01 (2026-11-06) dựng khung monorepo: `pnpm check` chạy được, `packages/config` có bảng phụ thuộc; chưa có package lõi nào. Cách làm một task:

1. Mở bảng task ở [docs/implementation-plan.md](docs/implementation-plan.md) §8, đọc đúng một dòng: task, file chạm, điều kiện xong.
2. Đọc các mục kế hoạch và ADR mà dòng đó (và phần code bạn sắp sửa) trỏ tới. Dữ kiện về CLI nằm ở [docs/reference/cli-facts-2026-11-06.md](docs/reference/cli-facts-2026-11-06.md); đừng tra lại điều đã có ở đó, trừ khi phiên bản CLI đã đổi.
3. Một phiên làm một task. Xong thì đổi cột Trạng thái của task trong §8. Nếu thực tế khác kế hoạch, sửa kế hoạch trong cùng commit.

## Bản đồ repo / Repo map

Cây đầy đủ và luật phụ thuộc: [docs/implementation-plan.md](docs/implementation-plan.md) §1. Package nào chưa có thì task tạo nó ghi ở §8.

| Path | Nội dung |
|---|---|
| `packages/config` | Preset tsconfig/ESLint/Prettier; **`boundaries.mjs`** — bảng phụ thuộc giữa package, nguồn duy nhất cho lint và dependency-cruiser |
| `packages/domain` | Lõi thuần, **không IO**: schema zod, máy trạng thái quest/nhân vật, chọn người, tách vai, cầu dao, mana, reducer world state, protocol |
| `packages/eventlog` | Event log JSONL: append, tail, migrate theo `v`, `redact` |
| `packages/store` | Thư mục kingdom: atomic write, lock, migration, inbox |
| `packages/registry-default` | Dữ liệu mặc định: kinds, classes, rituals, scripts (+ `scripts/*.mjs`, `prompts/*.md`) |
| `packages/runner-core` | Interface `AgentRunner`, `FakeRunner`, prompt, tool policy, plot (worktree), checks, kho bảo vật, kill tree, chuẩn hóa sự kiện |
| `packages/runner-claude`, `runner-antigravity`, `runner-gemini` (+ `runner-codex` tùy chọn) | Adapter có sẵn cho Claude Code, Antigravity CLI (mặc định tộc Gemini), Gemini CLI + API key (đường lui), Codex CLI. Tộc khác: file `adapters/<name>.mjs` trong kingdom theo hợp đồng tộc (ADR 0021) |
| `packages/hooks` | `elvaria-hook.mjs`: hook mà các CLI gọi; chỉ phụ thuộc `eventlog`, chạy < 100 ms |
| `packages/steward` | Quản sự: vòng tick, inbox, nhận việc, nghiệm thu, cầu dao, mana, bậc script, giao hàng — **người duy nhất ghi quest** |
| `packages/chancellor` | Tể tướng: câu lệnh tự nhiên → quest draft |
| `packages/sandbox` | Sinh ngày giả, replay |
| `packages/herald` | Sứ giả: HTTP + WebSocket trên localhost, ghi lệnh vào inbox (giai đoạn 2) |
| `packages/i18n` | Chuỗi VI/EN, `glossary.json` |
| `packages/ui-kit`, `packages/ui` | Design system (nhập một lần từ `design/`, sau đó là nguồn); thành phần Preact (giai đoạn 2+) |
| `apps/cli` | Lệnh `elvaria` — composition root duy nhất |
| `apps/world`, `apps/lite` | Thế giới Three.js (giai đoạn 3); khách nhẹ 2D cho điện thoại (giai đoạn 2) |
| `themes/fantasy` | Dữ liệu theme: icon, danh hiệu, tòa nhà; `LICENSES.md` |
| `design/` | Bàn giao thiết kế v0.2 — bản gốc đầu tiên, giữ nguyên làm lịch sử, không build ([design/DESIGN-HANDOFF.md](design/DESIGN-HANDOFF.md)). Từ giai đoạn 2, sửa thiết kế trong `packages/ui-kit` / `packages/ui` |
| `docs/` | Kế hoạch, [ADR](docs/adr/), [schema JSON](docs/schemas/), [glossary](docs/glossary.md), [tra cứu CLI](docs/reference/cli-facts-2026-11-06.md), brief thiết kế |

Thư mục kingdom (trạng thái của người dùng) **không** nằm trong repo; worktree của quest nằm trong repo của lãnh thổ: `<repo>/.elvaria/worktrees/<quest-id>`.

## Lệnh / Commands

Script gốc có từ P0-01. Script nào chưa có công cụ thật thì in ra task sẽ hiện thực nó và thoát 0 — đọc output, đừng coi đó là "xanh".

```bash
pnpm install
pnpm check               # mọi thứ CI chạy: lint, format:check, typecheck, test, boundaries, schemas drift, docs:check
pnpm check:fast          # typecheck + test + boundaries (pre-push)
pnpm lint && pnpm typecheck
pnpm test                # vitest, mọi package; pnpm --filter <package> test cho một package
pnpm boundaries          # dependency-cruiser theo packages/config/boundaries.mjs
pnpm schemas             # sinh docs/schemas/*.schema.json từ zod (công cụ từ P0-03)
pnpm docs:gen            # sinh glossary.md, events.md, dependency-graph.md, bảng §2.5 (từ P0-07)
pnpm docs:check          # README 4 mục, từ cấm, id lint, link sống, cấm .sh/.ps1/.cmd (từ P0-07)
pnpm i18n:check          # khóa VI/EN đồng bộ (từ P0-07)
pnpm format

pnpm elvaria <lệnh>      # CLI: init, territory, quest, character, say, seal, return, doctor, migrate (từ P0-08)
pnpm elvaria sandbox generate --day busy --seed 42 --kingdom <tmp>   # ngày giả (từ P0-10)
pnpm elvaria sandbox replay <file> --speed 20                        # dòng thời gian ra terminal
ELVARIA_LIVE=1 pnpm --filter @elvaria/runner-claude test             # smoke với CLI thật — tốn mana, chỉ khi cần
```

## Convention bắt buộc / Required conventions

- **Ba tầng tách biệt.** Tầng việc (domain, store, runner-*, steward, chancellor) không biết renderer tồn tại. Tầng thế giới (herald, world, lite, ui) chỉ đọc event log + snapshot và **ghi lệnh vào `inbox/`**; không bao giờ gọi tầng việc. Luật phụ thuộc ở `packages/config/boundaries.mjs`; ESLint và `pnpm boundaries` chặn import sai.
- **Domain không IO.** Không `node:*`, `fs`, `process.env`, `Date.now`, `Math.random`, `setTimeout` trong `packages/domain`; clock và id tiêm vào (`Clock`, `IdSource`). Domain trả `Result<T, E>`, không throw. Quyết định (chọn người, chọn verifier, cầu dao, mana, `planTick`) là hàm thuần trong domain; steward chỉ thực thi.
- **Chỉ Quản sự ghi trạng thái quest** (`quests/*.json`, `characters/*.json`). CLI, Sứ giả, điện thoại và Tể tướng ghi lệnh vào `inbox/<ulid>.json` (ADR 0005).
- **Người làm không phán.** Verifier ≠ assignee và ≠ mọi người từng làm quest đó (với đội: mọi người từng làm bất kỳ quest nào của đội); phiên mới; ưu tiên khác họ model; kiểm tra máy chạy trước và là trọng tài chính (check fail ⇒ fail). Verifier không có Edit/Write (ADR 0008, 0020).
- **Một quest, một context.** Hồi sinh = phiên mới từ `handover.md` + `journal.jsonl` + git; không `--resume` trừ khi `dispatch.resume_after_mana = true`. Cái gì máy làm được thì dùng bậc script trong catalog, không gọi model (ADR 0017).
- **Thuật ngữ theo [docs/glossary.md](docs/glossary.md).** Identifier và mọi id dữ liệu là tiếng Anh: `snake_case` cho khóa/enum JSON, `kebab-case` cho id icon/asset/file, `camelCase`/`PascalCase` trong TS. Dùng đúng từ trong cột "id" (`steward`, không `dispatcher`; `seal`, không `approve`). Chất fantasy chỉ ở chuỗi hiển thị qua i18n (ADR 0014).
- **Ngôn ngữ.** Code, comment, commit, ADR, prompt nhân vật: tiếng Anh. Tài liệu trong `docs/` (trừ ADR): tiếng Việt. Chuỗi cho người dùng: qua `t()`, có cả `vi` và `en`.
- **Dữ liệu có schema.** Mỗi file JSON có `version`; mỗi dòng event có `v`. Schema nguồn là zod trong `packages/domain/src/schema`; `docs/schemas/` là đầu ra sinh (ADR 0003). Đổi không tương thích = tăng version + migration + fixture.
- **Dạng nhiệm vụ, nghề, nghi thức, script, tag là dữ liệu registry**, không phải code: không `switch` theo kind trong lõi (ADR 0016).
- **Tộc là dữ liệu** (`kingdom.tribes[]`), không phải hằng số: không `switch` theo tộc hay theo CLI trong lõi; lõi chỉ thấy `AgentRunner` và `capabilities`, phần thiếu năng lực đi qua `tribeLimitsOf` (ADR 0021). Identifier dùng `tribe`, không dùng `provider`.
- **Nghề, bí kíp, kinh là ba thứ khác nhau** (ADR 0020). Chuyên môn là danh tiếng theo tag (`skill_affinity`), không phải nghề con; bí kíp không gắn vào nhân vật mà được chọn theo tag của quest; danh hiệu và số đếm đều suy ra, không lưu. Việc chạm nhiều vùng là một đội (quest hợp đồng + các phần + quest ghép), không phải một phiên dài.
- **Chỉ Node.** Mọi script là `.mjs`/TS; spawn với `shell: false`; đường dẫn qua `node:path`, trong file dữ liệu luôn `/` (ADR 0015).
- **Kiểu và kích thước.** Union chuỗi thay enum; không class ngoài adapter; branded id; file ≤ 300 dòng, hàm ≤ 60 dòng, lồng ≤ 3; không default export; `import type` tách riêng. Comment nói **vì sao**, kèm số ADR khi có.
- **Mỗi thay đổi có test đi kèm**, cùng commit. Domain coverage 100% là gate; package khác ≥ 80%.
- **Commit**: Conventional Commits `type(scope): why`, scope = tên package; thân nói vì sao; đổi hành vi thì chạm `docs/` hoặc ghi `docs: none`.
- **ADR khi đổi một quyết định đã ghi** (`docs/adr/`, mẫu Status / Context / Decision / Consequences, ≤ 40 dòng); ADR cũ đánh `superseded by`.

## Đọc trước khi sửa / Read before you write

Trước khi sửa các file sau, đọc file đó, test của nó và ADR liên quan, rồi nói rõ trong commit vì sao phải đổi:

- `packages/domain/src/quest/transitions.ts` (máy trạng thái quest; implementation-plan §2.5)
- `packages/domain/src/verify/**` (luật tách vai; ADR 0008)
- `packages/domain/src/mana/**` (mô hình mana; ADR 0009)
- `packages/eventlog/src/redact*` (che secret; ADR 0013)
- `packages/runner-core/src/treasury/**` (kho bảo vật, env tối thiểu; ADR 0013)
- `packages/config/boundaries.mjs` (ranh giới kiến trúc; ADR 0001)
- `docs/schemas/**` và `packages/domain/src/schema/**` (hợp đồng dữ liệu; ADR 0003)

## Cấm khi chưa có chỉ thị rõ / Forbidden without an explicit instruction

- Dùng `any`; tắt lint rule; dùng `--no-verify`.
- Import `node:*` (hay bất kỳ IO nào) vào `packages/domain`.
- Đổi tên hoặc payload của một event type đã phát mà không có hàm migrate theo `v`; viết lại event log.
- Đổi id EN trong glossary; thêm id tiếng Việt hoặc id "màu mè" vào dữ liệu.
- Sửa `docs/schemas/*.schema.json` bằng tay từ P0-03 trở đi (sửa zod rồi `pnpm schemas`). Trước P0-03, bản v1 viết tay là hợp đồng đã duyệt: đổi nó thì cập nhật cùng lúc implementation-plan §2.3 và glossary.
- Thêm dependency mà không nêu lý do trong commit.
- Đọc hoặc ghi `~/.claude/`, `~/.gemini/`, `~/.codex/` của người dùng từ code (cấu hình theo lần chạy đi qua `--settings` / `GEMINI_CLI_HOME` / tương đương, trong `.runs/`).
- Thêm script `.sh`, `.ps1`, `.cmd`; dùng `shell: true`.
- Truyền `process.env` nguyên khối vào tiến trình con; đưa secret vào prompt, journal, log hay event.
- Cho Elvaria quyền `git push` hoặc merge tự động (giai đoạn 1); dùng `--dangerously-skip-permissions`, `--bare` hay `--worktree` của CLI; parse transcript của CLI.
- Sửa `design/**` (bản gốc v0.2, giữ nguyên; thiết kế đổi trong `ui-kit`/`ui`, bản bàn giao mới vào thư mục mới) hoặc `docs/ke-hoach-dung-elvaria-0.6.md` (kế hoạch sản phẩm; người dùng sửa).
- Sửa file ngoài phạm vi task. Nếu thấy cần, ghi thành đề xuất trong commit hoặc vào implementation-plan.

## Change impact / Ảnh hưởng thay đổi

| Bạn đụng vào | Phải chạy |
|---|---|
| `packages/domain/**` | `pnpm -r test` và `pnpm typecheck` (mọi package dùng domain; coverage domain 100%) |
| `packages/domain/src/schema/**` | `pnpm schemas`, commit `docs/schemas/**` cùng lúc; migration mới + fixture `v<n>.json` trong `packages/store`; `pnpm test` |
| `packages/runner-*/**` | `pnpm --filter <package> test` (CLI giả); đổi argv/settings/parse thì thêm `ELVARIA_LIVE=1 pnpm --filter <package> test` |
| `packages/hooks/**` | `pnpm --filter @elvaria/hooks test` (gồm benchmark khởi động < 100 ms) |
| `packages/eventlog/**` | `pnpm --filter @elvaria/eventlog test` (fixture 12 loại secret phải bị che) |
| `packages/config/boundaries.mjs`, `dependencies` trong `package.json`, import giữa package | `pnpm boundaries` và `pnpm lint` |
| `docs/glossary.md`, `packages/i18n/**` | `pnpm docs:check` và `pnpm i18n:check` |
| `docs/**`, `CLAUDE.md`, README của package | `pnpm docs:check` |
| Bất kỳ thứ gì, trước khi báo xong | `pnpm check` |

## Definition of done

- Test cho thay đổi, chạy xanh: lint, typecheck, unit, boundaries, schemas drift, docs:check (`pnpm check`).
- Chạy được trên Windows **và** macOS (CI matrix xanh); ca riêng của một OS có test riêng.
- README của package chạm vào vẫn đủ 4 mục *Does* / *Does not* / *Depends on* / *How to test*.
- ADR mới hoặc cập nhật nếu đổi một quyết định đã ghi; glossary cập nhật nếu thêm thuật ngữ.
- Cột Trạng thái của task trong [docs/implementation-plan.md](docs/implementation-plan.md) §8 đã đổi; kế hoạch đã sửa nếu thực tế khác.
- Diff không có thay đổi ngoài phạm vi task.
