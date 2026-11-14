# Sổ tay repo / Repo handbook

Phần tra cứu của [CLAUDE.md](../../CLAUDE.md): bản đồ repo, thêm một package, lệnh `pnpm`, hook của repo. Mọi phiên nạp cả CLAUDE.md trước bước đầu tiên, nên những gì chỉ cần lúc tra được dời ra đây (docs/slim-claude-md, 2026-11-14); quy trình một task, convention, điều cấm và bảng ảnh hưởng thay đổi vẫn ở CLAUDE.md, luật theo vùng code ở [.claude/rules/](../../.claude/rules/).

## Bản đồ repo / Repo map

Cây đầy đủ và luật phụ thuộc: [docs/implementation-plan.md](../implementation-plan.md) §1. Cột "Có từ" là task tạo ra (hoặc sẽ tạo) thư mục đó.

| Path | Có từ | Nội dung |
|---|---|---|
| `packages/config` | P0-01 | Preset tsconfig/ESLint/Prettier; **`boundaries.mjs`** — bảng phụ thuộc giữa package, nguồn duy nhất cho lint, dependency-cruiser và commitlint (scope) |
| `packages/domain` | P0-02 | Lõi thuần, **không IO**: schema zod của mọi hợp đồng, máy trạng thái quest/nhân vật, cấp và danh tiếng, mọi quyết định (`planTick`, chọn người làm và người chấm theo họ model, cầu dao, mana, đội, bậc script, lịch, phạm vi ủy quyền), sổ đo và thẻ điểm lãnh thổ, reducer world state, protocol; danh sách đủ ở README của package |
| `packages/eventlog` | P0-05 | Event log JSONL: append, đọc theo cursor, tail bằng polling, migrate theo `v`, `redact`, đóng dấu ULID/`ts` cho hook; có `build` (`dist/`) vì hook nạp bản JS |
| `packages/store` | P0-06 | Thư mục kingdom: `openKingdom(dir)` → `KingdomStore`, atomic write, lock, migration, inbox, `initKingdom` |
| `packages/registry-default` | P0-02 | Dữ liệu mặc định: kinds, classes, rituals, scripts, tags (+ `scripts/*.mjs`; `prompts/*.md` từ P1-15) |
| `packages/runner-core` | P1-01 | Interface `AgentRunner` và `AdapterTool` (CLI mà adapter khai, PS-23), `FakeRunner`, prompt, tool policy, plot (worktree; đất thử của `territory check`), checks, kho bảo vật, kill tree, chuẩn hóa sự kiện, bộ test hợp đồng, `kit` cho adapter file (P1-19) |
| `packages/runner-claude`, `runner-antigravity`, `runner-codex` | P1-09, P1-12b, P1-12d | Adapter cho Claude Code, Antigravity CLI (mặc định tộc Gemini) và Codex CLI (`codex_cli`); mỗi adapter khai model nó chạy, CLI giả ở `fixtures/`. `runner-gemini` (Gemini CLI, P1-12c) để dành: tên có trong `boundaries.mjs`, chưa có trên đĩa, tộc khai `gemini_cli` chưa có runner. Tộc khác: file `adapters/<name>.mjs` trong kingdom theo hợp đồng tộc (ADR 0021, [docs/guides/adding-a-tribe.md](adding-a-tribe.md)) |
| `packages/hooks` | P1-08 | Hook mà mọi CLI gọi: viết bằng TS, build ra `dist/elvaria-hook.js` (`pnpm --filter @elvaria/hooks build`); lệnh gọi do `hookCommand()` dựng; ngữ cảnh qua env `ELVARIA_*` + `--policy <run_dir>/policy.json`; nhánh riêng cho agy và Codex, kiểu hook trung tính (`dialect` trong `policy.json`, PS-23) cho CLI khác; chỉ phụ thuộc `eventlog`, khởi động < 100 ms |
| `packages/steward` | P1-03 | Nhiếp chính: vòng tick, inbox, nhận việc, nghiệm thu, cầu dao, mana, bậc script, giao hàng, việc theo lịch và bản tấu — **người duy nhất ghi quest** |
| `packages/chancellor` | P1-13 | Tể tướng: câu lệnh tự nhiên → quest draft; phân loại thư (`triageMemos`, `triageCommands`, PS-03b) |
| `packages/sandbox` | P0-10 | Ngày giả sinh bằng chính máy trạng thái của domain (`simulateDay`), lịch phát lại |
| `packages/herald` | giai đoạn 2 | Sứ giả: HTTP + WebSocket trên localhost, ghi lệnh vào inbox |
| `packages/i18n` | P0-07 | Chuỗi VI/EN (`src/locales/`), `src/glossary.json` (nguồn thuật ngữ) |
| `packages/ui-kit`, `packages/ui` | giai đoạn 2 | Design system (nhập một lần từ `design/`, sau đó là nguồn); thành phần Preact |
| `apps/cli` | P0-08 | Lệnh `elvaria` — composition root duy nhất. Bảng lệnh `src/commands.ts` sinh cả parse, `--help` và [docs/cli.md](../cli.md) |
| `apps/world`, `apps/lite` | giai đoạn 3, 2 | Thế giới Three.js; khách nhẹ 2D cho điện thoại |
| `themes/fantasy` | giai đoạn 4 | Dữ liệu theme: icon, danh hiệu, tòa nhà; `LICENSES.md` |
| `scripts/` | P0-01 | Công cụ của repo: `gen-schemas.mjs`, `docs-gen.mjs` + `docs-*.mjs`, `docs-check.mjs`, `i18n-check.mjs`, `docs-note.mjs` (commitlint), `not-yet.mjs`, `plan-split.mjs` + `plan-*.mjs` (tách kế hoạch triển khai, P1-52), `ritual-steps.mjs` (PS-06); mỗi file có spec, trừ `docs-markdown.mjs` và `docs-repo.mjs` (test qua spec của `docs-gen`, `docs-check`) |
| `.claude/` | P0-11 | `settings.json` bật bốn hook của repo trong `hooks/`; `rules/` là luật theo vùng code (frontmatter `paths`) |
| `design/` | — | Bàn giao thiết kế v0.2 — bản gốc đầu tiên, giữ nguyên làm lịch sử, không build ([design/DESIGN-HANDOFF.md](../../design/DESIGN-HANDOFF.md)). Từ giai đoạn 2, sửa thiết kế trong `packages/ui-kit` / `packages/ui` |
| `docs/` | — | Kế hoạch triển khai và [kế hoạch từng giai đoạn](../plans/), [ADR](../adr/), [tra cứu CLI](../reference/cli-facts-2026-11-12.md), [spike](../spikes/), [hướng dẫn và báo cáo các lần chạy thật](../guides/) (vận hành vương quốc, thêm một tộc, quest đầu tiên…), báo cáo do quest viết ([docs/reports/](../reports/)), brief thiết kế; file sinh ra (danh sách ở mục Cấm của CLAUDE.md), trong đó [cli](../cli.md) là mọi lệnh `elvaria` |

Thư mục kingdom (trạng thái của người dùng) **không** nằm trong repo; worktree của quest nằm trong repo của lãnh thổ: `<repo>/.elvaria/worktrees/<quest-id>`.

### Thêm một package / Adding a package

Mọi package đã có tên và danh sách phụ thuộc được phép trong `WORKSPACES` của `packages/config/boundaries.mjs`. Package mới (ví dụ `runner-gemini` ở P1-12c) theo mẫu `packages/sandbox`:

- `package.json`: `"name": "@elvaria/<key>"`, `"private": true`, `"type": "module"`, `"exports": { ".": "./src/index.ts" }` (không build: Node 24 chạy thẳng `.ts`); scripts `"typecheck": "tsc -p tsconfig.json"`, `"test": "vitest run --coverage"`; `dependencies` chỉ các `@elvaria/<dep>: "workspace:*"` mà bảng cho phép; `devDependencies` `@elvaria/config`, `@types/node`, `@vitest/coverage-v8`, `typescript`, `vitest` cùng phiên bản với package khác.
- `tsconfig.json` extends `@elvaria/config/tsconfig/node.json`, `include: ["src", "vitest.config.ts"]`. Package trong `NO_NODE_TYPES` (domain, phía trình duyệt) extends `tsconfig/base.json` và dùng `vitest.config.mjs` ngoài tsconfig.
- `vitest.config.ts`: coverage v8 trên `src/**/*.ts` trừ `*.spec.ts` và `src/**/__fixtures__/**`, ngưỡng 80 (domain 100).
- `README.md` đủ 4 mục `## Does`, `## Does not`, `## Depends on`, `## How to test` (`pnpm docs:check` kiểm).
- Rồi `pnpm install`, `pnpm boundaries`, `pnpm docs:gen` (`docs/dependency-graph.md` đổi theo), `pnpm check`.

## Lệnh / Commands

```bash
pnpm install
pnpm check               # mọi thứ CI chạy (trừ audit): lint, format:check, typecheck, test, boundaries,
                         #   schemas --check, docs:gen --check, docs:check, i18n:check
pnpm check:fast          # typecheck + test + boundaries (husky pre-push)
pnpm lint && pnpm typecheck  # lint tự cho eslint heap 8 GB, không cần NODE_OPTIONS
pnpm test                # vitest của scripts/ và .claude/hooks/, rồi từng package; một package: pnpm --filter @elvaria/<key> test
pnpm boundaries          # dependency-cruiser theo packages/config/boundaries.mjs
pnpm schemas             # sinh docs/schemas/*.schema.json từ zod; --check: so, không ghi, exit 1 khi lệch
pnpm docs:gen            # sinh docs/glossary.md, events.md, dependency-graph.md, cli.md, bảng §2.5 và mục lục của kế hoạch triển khai; --check như trên
pnpm docs:gen --kingdom <dir>   # thêm docs/tier-report.md (§3.12) và docs/metrics-report.md (§3.16.1) từ vương quốc đó; --check không kèm --kingdom (như trong pnpm check) không so hai file này
pnpm docs:check          # README 4 mục, ADR có dòng Status, từ cấm trong identifier, id dữ liệu, link sống, glossary ↔ domain, cấm .sh/.ps1/.cmd/.bat, file .md trong docs/ ≤ 150 KB, CLAUDE.md ≤ 17 KB
pnpm i18n:check          # khóa và placeholder VI/EN khớp nhau, hình dạng glossary.json
pnpm plan:split          # chuyển dòng §8 đã xong của kế hoạch triển khai sang file lưu, so tập dòng trước và sau; --check như trên
pnpm format

pnpm --filter @elvaria/hooks build   # dist/ của hook và của eventlog; test của hooks tự build
pnpm --filter @elvaria/cli build     # apps/cli/dist/cli.js; test của cli tự build

pnpm elvaria <lệnh>      # CLI, chạy thẳng apps/cli/src/cli.ts; mọi lệnh và tùy chọn: docs/cli.md
pnpm elvaria init --kingdom <tmp> --name Thu                          # vương quốc thử
pnpm elvaria sandbox generate --day busy --seed 42 --kingdom <tmp>    # ngày giả vào <tmp>/events/sandbox/<ngày>.jsonl
pnpm elvaria sandbox replay <tmp>/events/sandbox/<ngày>.jsonl --speed 20   # dòng thời gian ra terminal
ELVARIA_LIVE=1 pnpm --filter @elvaria/runner-claude test              # smoke với CLI thật và hook đã build (từ P1-09) — tốn mana, chỉ khi cần
```

Mọi lệnh `elvaria` và tùy chọn: [docs/cli.md](../cli.md), sinh từ bảng lệnh. Chỉ `run`, `say`, `triage` và `tribe check` với CLI thật mở phiên tốn mana. Trên vương quốc đã ghim một bản (`elvaria upgrade`), `pnpm elvaria` chạy bằng bản ghim; thêm `--here` để chạy bằng mã của worktree đang sửa.

### Hook của repo / Repo hooks

[.claude/settings.json](../../.claude/settings.json) bật bốn hook Node (dạng exec, không shell; test trong `pnpm test`):

- `guard-bash.mjs` (trước Bash/PowerShell) chặn: force push, `--no-verify` / `git commit -n` / tắt husky, `git rebase` và `git pull --rebase`, `git stash` trần / `stash pop` / `drop` không ref / `clear`, `--dangerously-skip-permissions`, xóa đệ quy ngoài checkout và thư mục tạm. Luật khớp cả thân heredoc: ghi file bằng Edit/Write, đừng bằng heredoc.
- `guard-edit.mjs` (trước Edit/Write/MultiEdit) chặn sửa tay file sinh và vùng `<!-- docs:gen … -->` (danh sách ở mục Cấm của CLAUDE.md), `design/**` và `docs/ke-hoach-dung-elvaria-*.md`. Lệnh shell ghi vào các file đó thì nó không thấy: vẫn là điều cấm.
- `typecheck-touched.mjs` (sau Edit/Write/MultiEdit) chạy `tsc -p` của workspace sở hữu file vừa sửa (file ở `scripts/`, `.claude/hooks/` và `*.mjs` ở gốc: tsconfig gốc) và trả lỗi về ngay.
- `stop-checks.mjs` (khi kết thúc lượt) chạy `pnpm boundaries` nếu import, `package.json` của một workspace hay `boundaries.mjs` đổi, và `pnpm i18n:check` nếu locale hay glossary đổi.

Bị chặn thì sửa nguyên nhân, đừng tìm đường vòng; cần làm điều bị chặn thì hỏi người dùng.

Cùng file đó tắt ba thứ không phiên nào trên repo dùng: connector claude.ai (`disableClaudeAiConnectors`), Artifact (`enableArtifact: false`) và Workflow (`disableWorkflows`), vì mô tả công cụ của chúng nằm trong phần đầu mọi request (§11 2026-11-14, mục (57), (58): request đầu từ 59–62k xuống 43,5k token). Nhân vật Claude chạy với `--setting-sources project,local`, nên quest trên lãnh thổ Elvaria cũng nhận ba khóa này.
