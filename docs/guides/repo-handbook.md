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
| `docs/` | — | Kế hoạch triển khai và [kế hoạch từng giai đoạn](../plans/), [ADR](../adr/), tra cứu CLI ([2026-11-12](../reference/cli-facts-2026-11-12.md) và phần đổi ở [2026-11-16](../reference/cli-facts-2026-11-16.md), [2026-11-19](../reference/cli-facts-2026-11-19.md)), [spike](../spikes/), [hướng dẫn và báo cáo các lần chạy thật](../guides/) (vận hành vương quốc, thêm một tộc, quest đầu tiên…), báo cáo do quest viết ([docs/reports/](../reports/)), brief thiết kế; file sinh ra (danh sách ở mục Cấm của CLAUDE.md), trong đó [cli](../cli.md) là mọi lệnh `elvaria` |

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
                         #   schemas --check, docs:gen --check, docs:check, i18n:check; xanh trên cây sạch thì đóng dấu HEAD
pnpm check:fast          # typecheck + test + boundaries (husky pre-push, trừ khi push đúng commit có dấu)
pnpm check:changed       # giữa chừng: chỉ các check mà bảng "Change impact" đòi cho file đổi so với merge-base với origin/main (commit, chưa commit, file mới); KHÔNG thay `pnpm check`, cổng trước merge vẫn là `pnpm check` đầy đủ (không lint, không format, không package ngoài diff)
pnpm check:changed --dry-run          # chỉ in đường dẫn đổi, các lệnh sẽ chạy và đường dẫn không có luật
pnpm check:changed --base <ref>       # nhánh gốc khác origin/main; dừng ở lệnh đỏ đầu tiên; phải gọi qua pnpm (Windows, không shell)
pnpm lint && pnpm typecheck  # lint tự cho eslint heap 8 GB, không cần NODE_OPTIONS
pnpm exec eslint --prune-suppressions <file>   # sau khi sửa một chỗ có trong eslint-suppressions.json (.claude/rules/tests.md)
pnpm test                # vitest của scripts/ và .claude/hooks/, rồi từng package; một package: pnpm --filter @elvaria/<key> test
pnpm boundaries          # dependency-cruiser theo packages/config/boundaries.mjs
pnpm schemas             # sinh docs/schemas/*.schema.json từ zod; --check: so, không ghi, exit 1 khi lệch
pnpm docs:gen            # sinh docs/glossary.md, events.md, dependency-graph.md, cli.md, bảng §2.5 và mục lục của kế hoạch triển khai; --check như trên
pnpm docs:gen --kingdom <dir>   # thêm docs/tier-report.md (§3.12) và docs/metrics-report.md (§3.16.1) từ vương quốc đó; --check không kèm --kingdom (như trong pnpm check) không so hai file này
pnpm docs:check          # README 4 mục, ADR có dòng Status, từ cấm trong identifier, id dữ liệu, link sống, glossary ↔ domain, cấm .sh/.ps1/.cmd/.bat, file .md trong docs/ ≤ 150 KB, CLAUDE.md ≤ 17 KB
pnpm i18n:check          # khóa và placeholder VI/EN khớp nhau, hình dạng glossary.json
pnpm audit:prod          # pnpm audit --prod --audit-level high: cần mạng nên KHÔNG nằm trong `pnpm check`; phiên điều phối chạy trước mỗi lần merge có đổi pnpm-lock.yaml
pnpm plan:split          # chuyển dòng §8 đã xong của kế hoạch triển khai sang file lưu, so tập dòng trước và sau; --check như trên
pnpm format

pnpm --filter @elvaria/hooks build   # dist/ của hook và của eventlog; test của hooks tự build
pnpm --filter @elvaria/cli build     # apps/cli/dist/cli.js; test của cli tự build

pnpm elvaria <lệnh>      # CLI, chạy thẳng apps/cli/src/cli.ts; mọi lệnh và tùy chọn: docs/cli.md
pnpm elvaria init --kingdom <tmp> --name Thu                          # vương quốc thử
pnpm elvaria sandbox generate --day busy --seed 42 --kingdom <tmp>    # ngày giả vào <tmp>/events/sandbox/<ngày>.jsonl
pnpm elvaria sandbox replay <tmp>/events/sandbox/<ngày>.jsonl --speed 20   # dòng thời gian ra terminal
pnpm --filter @elvaria/hooks build && ELVARIA_LIVE=1 pnpm --filter @elvaria/runner-claude exec vitest run src/live.spec.ts
                         # bộ live với CLI thật (từ P1-09) — tốn mana, chỉ khi cần; `… test` chạy thêm spec CLI giả và coverage
```

**Dấu check của pre-push** (`fix/pre-push-stamp`): `pnpm check` mở đầu bằng `node scripts/check-stamp.mjs start` và kết thúc bằng `… write`. Dấu là SHA của HEAD, ghi vào `git rev-parse --git-path elvaria-check-ok` (mỗi worktree một file), và chỉ được ghi khi cây làm việc sạch lúc check bắt đầu lẫn lúc xanh, HEAD không đổi giữa chừng. Hook pre-push (`.husky/pre-push`) chạy `node scripts/check-stamp.mjs verify || pnpm check:fast`: nó bỏ qua `check:fast` khi mọi commit được push là HEAD, dấu trỏ đúng HEAD và cây vẫn sạch, hay khi lần push không gửi commit nào (chỉ xóa nhánh); mọi trường hợp khác chạy `check:fast` như cũ. Commit thêm sau khi check xanh thì lần push chạy `check:fast`, hoặc chạy lại `pnpm check` trước khi push.

**Cổng quét secret trước commit** (SEC-04): `.husky/pre-commit` chạy thêm `node scripts/scan-staged-secrets.mjs` sau lint-staged. Script đọc bản đã stage (`git show :<file>`, không phải cây làm việc) của các file thêm, sửa, đổi tên (bỏ file xóa và file nhị phân) và áp các mẫu của `packages/eventlog/src/redact-patterns.json`, cùng file mẫu với cổng quét trước push của nhánh giao hàng. Trúng một dạng cụ thể (khóa riêng, khóa của nhà cung cấp model, token forge…) thì commit bị chặn, exit 1, mỗi dòng báo `<file>:<số dòng>: <id mẫu>`, ví dụ `src/key.ts:3: anthropic_api_key`; chuỗi khớp không bao giờ được in. Ba mẫu chung (`bearer_token`, `url_credentials`, `secret_assignment`), vốn trúng fixture và tài liệu khá thường, chỉ in `warning:` và vẫn cho commit, như cổng trước push. Bị chặn thì bỏ secret khỏi file, stage lại rồi commit; đừng `--no-verify`. Fixture token giả trong spec phải ghép lúc chạy (nối chuỗi, `repeat`) để file nguồn không khớp mẫu.

**Audit phụ thuộc ở lượt merge** (SEC-04): `pnpm audit:prod` chạy `pnpm audit --prod --audit-level high`, cần mạng nên không vào `pnpm check` (check phải chạy offline). Phiên điều phối chạy nó trước mỗi lần merge có đổi `pnpm-lock.yaml`; lỗ hổng mức high trở lên trong dependency chạy thật thì dừng merge và báo chủ nhân.

Mọi lệnh `elvaria` và tùy chọn: [docs/cli.md](../cli.md), sinh từ bảng lệnh. Chỉ `run`, `say`, `triage` và `tribe check` với CLI thật mở phiên tốn mana. Trên vương quốc đã ghim một bản (`elvaria upgrade`), `pnpm elvaria` chạy bằng bản ghim; thêm `--here` để chạy bằng mã của worktree đang sửa.

### Hook của repo / Repo hooks

[.claude/settings.json](../../.claude/settings.json) bật bốn hook Node (dạng exec, không shell; test trong `pnpm test`):

- `guard-bash.mjs` (trước Bash/PowerShell) chặn: force push, `--no-verify` / `git commit -n` / tắt husky, `git rebase` và `git pull --rebase`, `git stash` trần / `stash pop` / `drop` không ref / `clear`, `--dangerously-skip-permissions`, xóa đệ quy ngoài checkout và thư mục tạm. Luật khớp cả thân heredoc: ghi file bằng Edit/Write, đừng bằng heredoc.
- `guard-edit.mjs` (trước Edit/Write/MultiEdit) chặn sửa tay file sinh và vùng `<!-- docs:gen … -->` (danh sách ở mục Cấm của CLAUDE.md), `design/**` và `docs/ke-hoach-dung-elvaria-*.md`. Lệnh shell ghi vào các file đó thì nó không thấy: vẫn là điều cấm. Nó chỉ gác file của checkout chứa chính nó (`REPO` và `repoPath` của `hook-io.mjs`): một phiên mở ở checkout chính mà Edit/Write vào file của worktree khác (hay ngược lại) thì không bị gác, nhưng điều cấm vẫn áp (kế hoạch sản phẩm 0.8, do người dùng chốt, được viết theo đường đó ở docs/plan-0.8, 2026-11-10). Sửa file của một worktree thì mở phiên trong chính worktree đó.
- `typecheck-touched.mjs` (sau Edit/Write/MultiEdit) chạy `tsc -p` của workspace sở hữu file vừa sửa (file ở `scripts/`, `.claude/hooks/` và `*.mjs` ở gốc: tsconfig gốc) và trả lỗi về ngay.
- `stop-checks.mjs` (khi kết thúc lượt) chạy `pnpm boundaries` nếu import, `package.json` của một workspace hay `boundaries.mjs` đổi, và `pnpm i18n:check` nếu locale hay glossary đổi.

Bị chặn thì sửa nguyên nhân, đừng tìm đường vòng; cần làm điều bị chặn thì hỏi người dùng.

Cùng file đó tắt ba thứ không phiên nào trên repo dùng: connector claude.ai (`disableClaudeAiConnectors`), Artifact (`enableArtifact: false`) và Workflow (`disableWorkflows`), vì mô tả công cụ của chúng nằm trong phần đầu mọi request (§11 2026-11-14, mục (57), (58): request đầu từ 59–62k xuống 43,5k token). Sửa `.claude/settings.json` có hiệu lực ngay với phiên đang chạy, không chờ phiên sau: phiên docs/slim-claude-md mất công cụ Artifact ngay sau lần sửa đó. Nhân vật Claude chạy với `--setting-sources project,local`, nên quest trên lãnh thổ Elvaria cũng nhận ba khóa này.

### Đồ thị code cho phiên dev / Code graph for dev sessions

graphify 0.9.106 cài ở mức máy cho các phiên Claude Code dựng Elvaria, không ở repo: không skill, hook hay khối CLAUDE.md nào trong repo, và nhân vật nạp mã nguồn của dự án chứ không đọc đồ thị này (§11 2026-11-12; (292), (293) ở §11 2026-11-19). Cài một lần: `uv tool install --python 3.13 graphifyy==0.9.106` (lệnh nằm ở `~/.local/bin`, thêm vào PATH của người dùng; phiên mở trước lần khởi động lại VS Code kế tiếp cần `export PATH="$HOME/.local/bin:$PATH"`). Mỗi checkout hay worktree dựng đồ thị của nó bằng `graphify update .` (phần code, không model, 0 mana); đầu ra ở `graphify-out/` (gitignore), dựng lại sau mỗi lần pull hay merge nếu muốn dùng. Phiên dùng nó để tìm chỗ cần đọc (`graphify query`, `path`, `explain`), rồi đọc đúng dải dòng thay vì cả file: mỗi lần gọi tool gửi lại cả context, nên đọc ít là cách rẻ nhất để giữ context dưới ~150k. Đồ thị cho nhân vật trên lãnh thổ là việc khác (PS-21, cờ `code_graph`, ADR 0029); phép A/B của nó chạy sau PS-12e ((294)).
