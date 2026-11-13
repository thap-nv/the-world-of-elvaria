# CLAUDE.md · Elvaria

Hướng dẫn cho AI agent (và người) làm việc trong repo này. Đọc hết trước khi sửa code.
Guide for AI agents (and people) working in this repo. Read it all before changing code.

## Dự án là gì / What this is

Elvaria là một thế giới fantasy low-poly chạy trên máy cá nhân (Windows và macOS); mỗi AI agent là một nhân vật có nghề, nhận việc thật (code, tài liệu, nghiên cứu) trên những repo người dùng gắn vào, làm trong worktree riêng, và được một nhân vật khác nghiệm thu trong một phiên mới. Lõi là một tiến trình Node (Nhiếp chính) điều phối CLI của các tộc (Claude Code, Antigravity, Codex) ở chế độ headless; trạng thái là file trong một thư mục kingdom ngoài repo; thế giới 3D chỉ nghe event log. Kế hoạch sản phẩm: [docs/ke-hoach-dung-elvaria-0.8.md](docs/ke-hoach-dung-elvaria-0.8.md) (mục 2 — 17 nguyên tắc — là bất biến; mục 14 là chặng tự cường). Kế hoạch triển khai: mục lục cùng §8 và §10 ở [docs/implementation-plan.md](docs/implementation-plan.md); các mục khác, dòng §8 của task đã xong và nhật ký §11 (mỗi ngày một file) ở [docs/implementation-plan/](docs/implementation-plan/). Chạy một vương quốc thật (chủ nhân, hay phiên cần thử việc thật): [docs/guides/operating-a-kingdom.md](docs/guides/operating-a-kingdom.md).

**Trạng thái: cột Trạng thái của bảng task ở §8**; task của giai đoạn 1.5 (`PS-…`, chặng tự cường, cơ chế ở §3.16, ADR 0023–0028) có mục chi tiết ở [docs/plans/phase-1.5.md](docs/plans/phase-1.5.md), đọc mục của task trước khi làm. Mỗi task một nhánh `feat/<id>` (id viết thường) trong một worktree riêng (§8 "Chạy song song"); task của phiên là task ghi trong tên nhánh, nhánh không nói thì lấy dòng `chưa làm` đầu tiên mà mọi task cần trước đã xong. Cách làm một task:

1. Mở bảng task ở [docs/implementation-plan.md](docs/implementation-plan.md) §8, đọc đúng một dòng: task, file chạm, điều kiện xong. Task được mở bằng một commit `docs: start <id>` trên `main`, đặt ô Trạng thái `đang làm (nhánh feat/<id>)`; nếu ô chưa đổi, đổi nó trong commit đầu của nhánh.
2. Đọc các mục kế hoạch và ADR mà dòng đó (và phần code bạn sắp sửa) trỏ tới (mục lục ở đầu file kế hoạch chỉ file của từng mục, ví dụ §3.4), cùng các dòng §11 nhắc tới task (tìm id task trong `docs/implementation-plan/11-*.md`). Luật riêng của từng vùng code nằm ở [.claude/rules/](.claude/rules/) (domain, runner, hooks) và tự nạp khi bạn chạm file của vùng đó. Dữ kiện về CLI nằm ở [docs/reference/cli-facts-2026-11-12.md](docs/reference/cli-facts-2026-11-12.md) (Claude Code 2.1.322, agy 1.5.5–1.5.7, Codex 0.167.0-alpha.4.1; bản 2026-11-06 giữ làm lịch sử) và ba spike ([Claude](docs/spikes/claude-2026-11.md), [Antigravity](docs/spikes/antigravity-2026-11.md), [Codex](docs/spikes/codex-2026-11-12.md); spike thắng khi hai bên khác nhau); đừng tra lại điều đã có ở đó, trừ khi phiên bản CLI đã đổi.
3. Một phiên làm một task, trên nhánh `feat/<id>` tách từ `main`. Commit triển khai mang code, test, README và tài liệu đổi theo. Nếu thực tế khác kế hoạch, sửa kế hoạch trong cùng commit và thêm một dòng §11 "<id> (…), chỗ thực tế khác kế hoạch, chờ người dùng chốt" (cuối file `docs/implementation-plan/11-<ngày>.md` của ngày ghi trên dòng; ngày chưa có file thì tạo rồi `pnpm docs:gen`, như mục lục của kế hoạch dặn) liệt kê từng chỗ khác và các đề xuất ngoài phạm vi; người dùng chốt sau đó bằng một dòng §11 mới. Dòng §11 chỉ thêm, không sửa dòng cũ: file §11 theo ngày gộp bằng `union` (`.gitattributes`), nên một dòng mà nhánh này sửa và nhánh khác cũng chạm (sửa nó, hay nối dòng ngay sau nó) còn cả bản cũ lẫn bản mới sau merge, git không báo. Kế hoạch không nói tới một chi tiết trong phạm vi task (hình dạng một kiểu, tên một trường, chỗ đặt một file, cách test) thì chọn cách đơn giản nhất khớp ADR, làm tiếp và ghi lựa chọn vào dòng §11 đó; chỉ dừng lại hỏi khi lựa chọn đổi một ADR, đổi hợp đồng dữ liệu ngoài phạm vi task, hay tốn mana. Xem cả §10 (câu hỏi còn mở).
4. Xong thì một commit riêng `docs: mark <id> done in the implementation plan` đổi ô Trạng thái thành `xong (<ngày>, <hash commit triển khai>)`.
5. Trước khi merge: cập nhật nhánh bằng `git merge origin/main`, **không rebase** (hash ở ô Trạng thái phải còn đúng); file sinh ra bị conflict thì lấy một bên rồi chạy lại generator; `pnpm check` xanh ở máy rồi mới mở PR và merge (merge commit). CI trên GitHub chỉ chạy tay (Actions → CI → Run workflow trên nhánh cần kiểm, implementation-plan §7). Chi tiết: §8 "Chạy song song".

## Bản đồ repo / Repo map

Cây đầy đủ và luật phụ thuộc: [docs/implementation-plan.md](docs/implementation-plan.md) §1. Cột "Có từ" là task tạo ra (hoặc sẽ tạo) thư mục đó.

| Path | Có từ | Nội dung |
|---|---|---|
| `packages/config` | P0-01 | Preset tsconfig/ESLint/Prettier; **`boundaries.mjs`** — bảng phụ thuộc giữa package, nguồn duy nhất cho lint, dependency-cruiser và commitlint (scope) |
| `packages/domain` | P0-02 | Lõi thuần, **không IO**: schema zod của mọi hợp đồng, máy trạng thái quest/nhân vật, cấp và danh tiếng, mọi quyết định (`planTick`, chọn người làm và người chấm theo họ model, cầu dao, mana, đội, bậc script, lịch, phạm vi ủy quyền), sổ đo và thẻ điểm lãnh thổ, reducer world state, protocol; danh sách đủ ở README của package |
| `packages/eventlog` | P0-05 | Event log JSONL: append, đọc theo cursor, tail bằng polling, migrate theo `v`, `redact`, đóng dấu ULID/`ts` cho hook; có `build` (`dist/`) vì hook nạp bản JS |
| `packages/store` | P0-06 | Thư mục kingdom: `openKingdom(dir)` → `KingdomStore`, atomic write, lock, migration, inbox, `initKingdom` |
| `packages/registry-default` | P0-02 | Dữ liệu mặc định: kinds, classes, rituals, scripts, tags (+ `scripts/*.mjs`; `prompts/*.md` từ P1-15) |
| `packages/runner-core` | P1-01 | Interface `AgentRunner` và `AdapterTool` (CLI mà adapter khai, PS-23), `FakeRunner`, prompt, tool policy, plot (worktree; đất thử của `territory check`), checks, kho bảo vật, kill tree, chuẩn hóa sự kiện, bộ test hợp đồng, `kit` cho adapter file (P1-19) |
| `packages/runner-claude`, `runner-antigravity`, `runner-codex` | P1-09, P1-12b, P1-12d | Adapter cho Claude Code, Antigravity CLI (mặc định tộc Gemini) và Codex CLI (`codex_cli`); mỗi adapter khai model nó chạy, CLI giả ở `fixtures/`. `runner-gemini` (Gemini CLI, P1-12c) để dành: tên có trong `boundaries.mjs`, chưa có trên đĩa, tộc khai `gemini_cli` chưa có runner. Tộc khác: file `adapters/<name>.mjs` trong kingdom theo hợp đồng tộc (ADR 0021, [docs/guides/adding-a-tribe.md](docs/guides/adding-a-tribe.md)) |
| `packages/hooks` | P1-08 | Hook mà mọi CLI gọi: viết bằng TS, build ra `dist/elvaria-hook.js` (`pnpm --filter @elvaria/hooks build`); lệnh gọi do `hookCommand()` dựng; ngữ cảnh qua env `ELVARIA_*` + `--policy <run_dir>/policy.json`; nhánh riêng cho agy và Codex, kiểu hook trung tính (`dialect` trong `policy.json`, PS-23) cho CLI khác; chỉ phụ thuộc `eventlog`, khởi động < 100 ms |
| `packages/steward` | P1-03 | Nhiếp chính: vòng tick, inbox, nhận việc, nghiệm thu, cầu dao, mana, bậc script, giao hàng, việc theo lịch và bản tấu — **người duy nhất ghi quest** |
| `packages/chancellor` | P1-13 | Tể tướng: câu lệnh tự nhiên → quest draft; phân loại thư (`triageMemos`, `triageCommands`, PS-03b) |
| `packages/sandbox` | P0-10 | Ngày giả sinh bằng chính máy trạng thái của domain (`simulateDay`), lịch phát lại |
| `packages/herald` | giai đoạn 2 | Sứ giả: HTTP + WebSocket trên localhost, ghi lệnh vào inbox |
| `packages/i18n` | P0-07 | Chuỗi VI/EN (`src/locales/`), `src/glossary.json` (nguồn thuật ngữ) |
| `packages/ui-kit`, `packages/ui` | giai đoạn 2 | Design system (nhập một lần từ `design/`, sau đó là nguồn); thành phần Preact |
| `apps/cli` | P0-08 | Lệnh `elvaria` — composition root duy nhất. Bảng lệnh `src/commands.ts` sinh cả parse, `--help` và [docs/cli.md](docs/cli.md) |
| `apps/world`, `apps/lite` | giai đoạn 3, 2 | Thế giới Three.js; khách nhẹ 2D cho điện thoại |
| `themes/fantasy` | giai đoạn 4 | Dữ liệu theme: icon, danh hiệu, tòa nhà; `LICENSES.md` |
| `scripts/` | P0-01 | Công cụ của repo: `gen-schemas.mjs`, `docs-gen.mjs` + `docs-*.mjs`, `docs-check.mjs`, `i18n-check.mjs`, `docs-note.mjs` (commitlint), `not-yet.mjs`, `plan-split.mjs` + `plan-*.mjs` (tách kế hoạch triển khai, P1-52), `ritual-steps.mjs` (PS-06); mỗi file có spec, trừ `docs-markdown.mjs` và `docs-repo.mjs` (test qua spec của `docs-gen`, `docs-check`) |
| `.claude/` | P0-11 | `settings.json` bật bốn hook của repo trong `hooks/`; `rules/` là luật theo vùng code (frontmatter `paths`) |
| `design/` | — | Bàn giao thiết kế v0.2 — bản gốc đầu tiên, giữ nguyên làm lịch sử, không build ([design/DESIGN-HANDOFF.md](design/DESIGN-HANDOFF.md)). Từ giai đoạn 2, sửa thiết kế trong `packages/ui-kit` / `packages/ui` |
| `docs/` | — | Kế hoạch triển khai và [kế hoạch từng giai đoạn](docs/plans/), [ADR](docs/adr/), [tra cứu CLI](docs/reference/cli-facts-2026-11-12.md), [spike](docs/spikes/), [hướng dẫn và báo cáo các lần chạy thật](docs/guides/) (vận hành vương quốc, thêm một tộc, quest đầu tiên…), báo cáo do quest viết ([docs/reports/](docs/reports/)), brief thiết kế; file sinh ra (danh sách ở mục Cấm), trong đó [cli](docs/cli.md) là mọi lệnh `elvaria` |

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
pnpm docs:check          # README 4 mục, ADR có dòng Status, từ cấm trong identifier, id dữ liệu, link sống, glossary ↔ domain, cấm .sh/.ps1/.cmd/.bat, file .md trong docs/ ≤ 150 KB, CLAUDE.md ≤ 29 KB
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

Mọi lệnh `elvaria` và tùy chọn: [docs/cli.md](docs/cli.md), sinh từ bảng lệnh. Chỉ `run`, `say`, `triage` và `tribe check` với CLI thật mở phiên tốn mana. Trên vương quốc đã ghim một bản (`elvaria upgrade`), `pnpm elvaria` chạy bằng bản ghim; thêm `--here` để chạy bằng mã của worktree đang sửa.

### Hook của repo / Repo hooks

[.claude/settings.json](.claude/settings.json) bật bốn hook Node (dạng exec, không shell; test trong `pnpm test`):

- `guard-bash.mjs` (trước Bash/PowerShell) chặn: force push, `--no-verify` / `git commit -n` / tắt husky, `git rebase` và `git pull --rebase`, `git stash` trần / `stash pop` / `drop` không ref / `clear`, `--dangerously-skip-permissions`, xóa đệ quy ngoài checkout và thư mục tạm. Luật khớp cả thân heredoc: ghi file bằng Edit/Write, đừng bằng heredoc.
- `guard-edit.mjs` (trước Edit/Write/MultiEdit) chặn sửa tay file sinh và vùng `<!-- docs:gen … -->` (danh sách ở mục Cấm), `design/**` và `docs/ke-hoach-dung-elvaria-*.md`. Lệnh shell ghi vào các file đó thì nó không thấy: vẫn là điều cấm.
- `typecheck-touched.mjs` (sau Edit/Write/MultiEdit) chạy `tsc -p` của workspace sở hữu file vừa sửa (file ở `scripts/`, `.claude/hooks/` và `*.mjs` ở gốc: tsconfig gốc) và trả lỗi về ngay.
- `stop-checks.mjs` (khi kết thúc lượt) chạy `pnpm boundaries` nếu import, `package.json` của một workspace hay `boundaries.mjs` đổi, và `pnpm i18n:check` nếu locale hay glossary đổi.

Bị chặn thì sửa nguyên nhân, đừng tìm đường vòng; cần làm điều bị chặn thì hỏi người dùng.

## Convention bắt buộc / Required conventions

- **Ba tầng tách biệt.** Tầng việc (domain, store, runner-*, steward, chancellor) không biết renderer tồn tại. Tầng thế giới (herald, world, lite, ui) chỉ đọc event log + snapshot và **ghi lệnh vào `inbox/`**; không bao giờ gọi tầng việc. Luật phụ thuộc ở `packages/config/boundaries.mjs`; ESLint và `pnpm boundaries` chặn import sai.
- **Domain không IO.** Không built-in Node, `process`, `Date.now`, `new Date()`, `Math.random`, timer, `fetch` trong mã chạy của `packages/domain`; clock, ngẫu nhiên và id tiêm vào (`Clock`, `RandomSource`, `IdSource`). Domain trả `Result<T, E>`, không throw. Quyết định (chọn người, chọn verifier, cầu dao, mana, `planTick`) là hàm thuần trong domain; steward chỉ thực thi. Chi tiết: [.claude/rules/domain.md](.claude/rules/domain.md).
- **Chỉ Nhiếp chính ghi trạng thái quest** (`quests/<id>.json`, `characters/<id>/character.json`). CLI, Sứ giả, điện thoại và Tể tướng ghi lệnh vào `inbox/<ulid>.json` (ADR 0005). Ngoại lệ đã chốt, chỉ ở `apps/cli`: `init`, `doctor` và `tribe add|check|disable|look` ghi `kingdom.json`, `territory add` ghi file lãnh thổ, `character add` tạo file nhân vật mới (chỉ tạo, không ghi đè).
- **Người làm không phán.** Verifier ≠ assignee và ≠ mọi người từng làm quest đó (với đội: mọi người từng làm bất kỳ quest nào của đội); phiên mới; ưu tiên khác họ model; kiểm tra máy chạy trước và là trọng tài chính (check fail ⇒ fail). Verifier không có Edit/Write (ADR 0008, 0020), trừ trong đất nháp dùng một lần của nghi thức Thả quái thử thành: không commit, không push, xóa sau verdict, nhánh quest không đổi (ADR 0022).
- **Một quest, một context.** Hồi sinh = phiên mới từ `handover.md` + `journal.jsonl` + git; không `--resume` trừ khi `dispatch.resume_after_mana = true`, hoặc người dùng trả lời câu hỏi của nhân vật trong `dispatch.resume_after_answer_minutes` (mặc định 55). Cái gì máy làm được thì dùng bậc script trong catalog, không gọi model (ADR 0017).
- **Thuật ngữ theo [docs/glossary.md](docs/glossary.md)** (sinh từ `packages/i18n/src/glossary.json`: sửa thuật ngữ ở đó rồi `pnpm docs:gen`, không sửa file `.md`). Identifier và mọi id dữ liệu là tiếng Anh: `snake_case` cho khóa/enum JSON, `kebab-case` cho id icon/asset/file, `camelCase`/`PascalCase` trong TS. Dùng đúng từ trong cột "id" (`steward`, không `dispatcher`; `seal`, không `approve`; `tribe`, không `provider`; không `task`, `worker`, `project` trong identifier). Chất fantasy chỉ ở chuỗi hiển thị qua i18n (ADR 0014).
- **Ngôn ngữ.** Code, comment, commit, ADR, README package, prompt nhân vật: tiếng Anh. Tài liệu trong `docs/` (trừ ADR): tiếng Việt. Chuỗi cho người dùng: qua `t()`, có cả `vi` và `en` (`apps/cli` bị ESLint `i18next/no-literal-string` gác).
- **Dữ liệu có schema.** Mỗi file JSON có `version`; mỗi dòng event có `v`. Schema nguồn là zod trong `packages/domain/src/schema`; `docs/schemas/` là đầu ra sinh (ADR 0003). Đổi không tương thích = tăng version + migration + fixture.
- **Dạng nhiệm vụ, nghề, nghi thức, script, tag là dữ liệu registry**, không phải code: không `switch` theo kind trong lõi (ADR 0016).
- **Tộc là dữ liệu** (`kingdom.tribes[]`), không phải hằng số: không `switch` theo tộc hay theo CLI trong lõi; lõi chỉ thấy `AgentRunner` và `capabilities`, phần thiếu năng lực đi qua `tribeLimitsOf` (ADR 0021). Identifier dùng `tribe`, không dùng `provider`.
- **Nghề, bí kíp, kinh là ba thứ khác nhau** (ADR 0020). Chuyên môn là danh tiếng theo tag (`skill_affinity`), không phải nghề con; bí kíp không gắn vào nhân vật mà được chọn theo tag của quest; danh hiệu và số đếm đều suy ra, không lưu. Việc chạm nhiều vùng là một đội (quest hợp đồng + các phần + quest ghép), không phải một phiên dài.
- **Chỉ Node.** Mọi script là `.mjs`/TS; Node 24 chạy thẳng `.ts` (type stripping), không `tsx`, không build khi dev (trừ `dist/` của hook và CLI). Spawn với `shell: false`, env tường minh; đường dẫn qua `node:path`, trong file dữ liệu luôn `/` (ADR 0015).
- **Kiểu và kích thước.** Union chuỗi thay enum; không class ngoài adapter (`erasableSyntaxOnly` cấm enum, namespace); branded id; import tương đối viết đuôi `.ts`; package khác chỉ import qua `exports` (`src/index.ts`); file ≤ 300 dòng, hàm ≤ 60 dòng, lồng ≤ 3; không default export; `import type` tách riêng. Comment nói **vì sao**, kèm số ADR khi có.
- **Mỗi thay đổi có test đi kèm**, cùng commit. Domain coverage 100% là gate; package khác ≥ 80%. Test ghi đĩa dùng thư mục tạm có dấu cách trong tên; test dựng repo git lọc `GIT_*` khỏi env (§6).
- **Commit**: Conventional Commits `type(scope): why`; scope là tên workspace (`domain`, `runner-core`…) hoặc `repo`, `ci`, `deps`, `themes` (commitlint `scope-enum`), commit chỉ tài liệu dùng `docs:` không scope; thân nói vì sao; `feat`/`fix`/`perf` thì chạm `docs/` hoặc ghi `docs: none`.
- **ADR khi đổi một quyết định đã ghi** (`docs/adr/`, mẫu Status / Context / Decision / Consequences, ≤ 40 dòng); ADR cũ đánh `superseded by`. Sửa nhỏ cho khớp thực tế đã chốt thì sửa tại chỗ, ghi `(Amended <ngày>, <task>: …)`.

## Đọc trước khi sửa / Read before you write

Trước khi sửa các file sau, đọc file đó, test của nó và ADR liên quan, rồi nói rõ trong commit vì sao phải đổi:

- `packages/domain/src/quest/transitions.ts`, `transition.ts`, `effects.ts` (máy trạng thái quest: bảng, hàm, hiệu ứng; implementation-plan §2.5)
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
- Sửa file sinh ra bằng tay: `docs/schemas/*.schema.json` (sửa zod rồi `pnpm schemas`), `docs/glossary.md`, `docs/events.md`, `docs/dependency-graph.md`, `docs/cli.md`, `docs/tier-report.md`, `docs/metrics-report.md` và vùng `<!-- docs:gen … -->` của kế hoạch triển khai (mục lục ở `docs/implementation-plan.md`, bảng §2.5 ở `docs/implementation-plan/2-data-and-events.md`) (sửa nguồn rồi `pnpm docs:gen`; báo cáo bậc và sổ đo thì `pnpm docs:gen --kingdom <dir>`).
- Thêm dependency mà không nêu lý do trong commit.
- Đọc hoặc ghi `~/.claude/`, `~/.gemini/`, `~/.codex/` của người dùng từ code (cấu hình theo lần chạy đi qua `--settings` / `GEMINI_CLI_HOME` / tương đương, trong `.runs/`).
- Thêm script `.sh`, `.ps1`, `.cmd`, `.bat`; dùng `shell: true`.
- Truyền `process.env` nguyên khối vào tiến trình con; đưa secret vào prompt, journal, log hay event.
- Cho Elvaria quyền `git push` hoặc merge tự động (giai đoạn 1; từ PS-08 chỉ Nhiếp chính, theo đường giao hàng của ADR 0023, nhân vật thì không bao giờ); dùng `--dangerously-skip-permissions`, `--bare` hay `--worktree` của CLI; parse transcript của CLI.
- Rebase một nhánh task; dùng `git stash` trần hay `git stash pop` (stash dùng chung giữa mọi worktree: dùng commit WIP, hoặc `git stash push -m <tag>` rồi `git stash apply <sha>`).
- Sửa `design/**` (bản gốc v0.2, giữ nguyên; thiết kế đổi trong `ui-kit`/`ui`, bản bàn giao mới vào thư mục mới) hoặc `docs/ke-hoach-dung-elvaria-*.md` (kế hoạch sản phẩm, mọi phiên bản; người dùng sửa).
- Sửa file ngoài phạm vi task. Nếu thấy cần, ghi thành đề xuất trong commit hoặc vào implementation-plan.

## Change impact / Ảnh hưởng thay đổi

| Bạn đụng vào | Phải chạy |
|---|---|
| `packages/domain/**` | `pnpm -r test` và `pnpm typecheck` (mọi package dùng domain; coverage domain 100%) |
| `packages/domain/src/schema/**`, `packages/domain/examples/**` | `pnpm schemas`, commit `docs/schemas/**` cùng lúc; đổi không tương thích thì migration `v<n>-to-v<n+1>.ts` + fixture `v<n+1>.json` trong `packages/store/src/migrations/<contract>/`; `pnpm test` |
| `packages/domain/src/quest/transitions.ts`, `EVENT_TYPES` hay schema event | `pnpm docs:gen` (bảng §2.5, `docs/events.md`); type event mới vào bảng `events` của `glossary.json` |
| `packages/runner-*/**` | `pnpm --filter <package> test` (CLI giả); đổi argv/settings/parse thì thêm `ELVARIA_LIVE=1 pnpm --filter <package> test` |
| `packages/hooks/**` | `pnpm --filter @elvaria/hooks test` (tự build; gồm cổng khởi động, [.claude/rules/hooks.md](.claude/rules/hooks.md)) |
| `packages/eventlog/**` | `pnpm --filter @elvaria/eventlog test` (fixture 13 loại secret phải bị che) và `pnpm --filter @elvaria/hooks test` (hook chạy bản build của eventlog) |
| `apps/cli/src/commands.ts`, `CommandSpec` của một lệnh, chuỗi `cli.*` | `pnpm --filter @elvaria/cli test` và `pnpm docs:gen` (`docs/cli.md`) |
| Package mới, `packages/config/boundaries.mjs`, `dependencies` trong `package.json`, import giữa package | `pnpm install`, `pnpm boundaries`, `pnpm lint` và `pnpm docs:gen` (`docs/dependency-graph.md`) |
| `packages/i18n/**` (thuật ngữ ở `src/glossary.json`; `docs/glossary.md` là file sinh, không sửa tay) | `pnpm docs:gen`, `pnpm docs:check` và `pnpm i18n:check` |
| `scripts/**`, `.claude/hooks/**` | `pnpm test` (vitest gốc) và `pnpm typecheck` (tsconfig gốc, `checkJs`) |
| `docs/**`, `CLAUDE.md`, `.claude/rules/**`, README của package | `pnpm docs:check` |
| Bất kỳ thứ gì, trước khi báo xong | `pnpm check` |

## Definition of done

- Test cho thay đổi, chạy xanh: lint, format, typecheck, unit, boundaries, schemas drift, docs:gen drift, docs:check, i18n:check (`pnpm check`).
- Chạy được trên Windows **và** macOS: ca riêng của một OS có test riêng. CI chạy tay (bước 5), không là cổng của PR; task chạm vùng nhạy hệ điều hành (`runner-*`, `hooks`, plot, kill tree, `store`) thì nêu trong báo cáo để chủ nhân quyết có chạy CI không.
- README của package chạm vào vẫn đủ 4 mục *Does* / *Does not* / *Depends on* / *How to test* và nói đúng code.
- ADR mới hoặc cập nhật nếu đổi một quyết định đã ghi; `glossary.json` cập nhật (rồi `pnpm docs:gen`) nếu thêm thuật ngữ.
- Cột Trạng thái của task trong [docs/implementation-plan.md](docs/implementation-plan.md) §8 đã đổi; kế hoạch đã sửa và §11 có dòng "chờ người dùng chốt" nếu thực tế khác.
- Diff không có thay đổi ngoài phạm vi task.
