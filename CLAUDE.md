# CLAUDE.md · Elvaria

Hướng dẫn cho AI agent (và người) làm việc trong repo này. Đọc hết trước khi sửa code.
Guide for AI agents (and people) working in this repo. Read it all before changing code.

## Dự án là gì / What this is

Elvaria là một thế giới fantasy low-poly chạy trên máy cá nhân (Windows và macOS); mỗi AI agent là một nhân vật có nghề, nhận việc thật (code, tài liệu, nghiên cứu) trên repo người dùng gắn vào, làm trong worktree riêng, được một nhân vật khác nghiệm thu trong phiên mới. Nhiếp chính (một tiến trình Node) điều phối CLI của các tộc (Claude Code, Antigravity, Codex) ở chế độ headless; trạng thái là file trong thư mục kingdom ngoài repo; thế giới 3D chỉ nghe event log. Kế hoạch sản phẩm: [docs/ke-hoach-dung-elvaria-0.8.md](docs/ke-hoach-dung-elvaria-0.8.md) (mục 2 — 17 nguyên tắc — là bất biến; mục 14 là chặng tự cường). Kế hoạch triển khai: mục lục cùng §8 và §10 ở [docs/implementation-plan.md](docs/implementation-plan.md); các mục khác, dòng §8 của task đã xong và nhật ký §11 (mỗi ngày một file) ở [docs/implementation-plan/](docs/implementation-plan/). Chạy một vương quốc thật (chủ nhân, hay phiên cần thử việc thật): [docs/guides/operating-a-kingdom.md](docs/guides/operating-a-kingdom.md).

**Trạng thái: cột Trạng thái của bảng task ở §8**; task của giai đoạn 1.5 (`PS-…`, chặng tự cường, cơ chế ở §3.16, ADR 0023–0028) có mục chi tiết ở [docs/plans/phase-1.5.md](docs/plans/phase-1.5.md), đọc mục của task trước khi làm. Mỗi task một nhánh `feat/<id>` (id viết thường) trong một worktree riêng (§8 "Chạy song song"); task của phiên là task ghi trong tên nhánh, nhánh không nói thì lấy dòng `chưa làm` đầu tiên mà mọi task cần trước đã xong. Cách làm một task:

1. Mở bảng task ở [docs/implementation-plan.md](docs/implementation-plan.md) §8, đọc đúng một dòng: task, file chạm, điều kiện xong. Task được mở bằng một commit `docs: start <id>` trên `main`, đặt ô Trạng thái `đang làm (nhánh feat/<id>)`; nếu ô chưa đổi, đổi nó trong commit đầu của nhánh.
2. Đọc các mục kế hoạch và ADR mà dòng đó (và phần code bạn sắp sửa) trỏ tới (mục lục ở đầu file kế hoạch chỉ file của từng mục, ví dụ §3.4), cùng các dòng §11 nhắc tới task (tìm id task trong `docs/implementation-plan/11-*.md`). Luật riêng của từng vùng code nằm ở [.claude/rules/](.claude/rules/) (domain, runner, hooks, cli) và tự nạp khi bạn chạm file của vùng đó. Dữ kiện về CLI nằm ở [docs/reference/cli-facts-2026-11-12.md](docs/reference/cli-facts-2026-11-12.md) (bản 2026-11-06 giữ làm lịch sử) và ba spike ở [docs/spikes/](docs/spikes/) (spike thắng khi hai bên khác nhau; phiên bản CLI đã đo: [.claude/rules/runner.md](.claude/rules/runner.md)); đừng tra lại điều đã có ở đó, trừ khi phiên bản CLI đã đổi.
3. Một phiên làm một task, trên nhánh `feat/<id>` tách từ `main`. Commit triển khai mang code, test, README và tài liệu đổi theo. Nếu thực tế khác kế hoạch, sửa kế hoạch trong cùng commit và thêm một dòng §11 "<id> (…), chỗ thực tế khác kế hoạch, chờ người dùng chốt" (cuối file `docs/implementation-plan/11-<ngày>.md` của ngày ghi trên dòng; ngày chưa có file thì tạo rồi `pnpm docs:gen`) liệt kê từng chỗ khác và các đề xuất ngoài phạm vi; người dùng chốt sau đó bằng một dòng §11 mới. Dòng §11 chỉ thêm, không sửa dòng cũ: file §11 theo ngày gộp bằng `union` (`.gitattributes`), nên một dòng mà nhánh này sửa và nhánh khác cũng chạm (sửa nó, hay nối dòng ngay sau nó) còn cả bản cũ lẫn bản mới sau merge, git không báo. Kế hoạch không nói tới một chi tiết trong phạm vi task (hình dạng một kiểu, tên một trường, chỗ đặt một file, cách test) thì chọn cách đơn giản nhất khớp ADR, làm tiếp và ghi lựa chọn vào dòng §11 đó; chỉ dừng lại hỏi khi lựa chọn đổi một ADR, đổi hợp đồng dữ liệu ngoài phạm vi task, hay tốn mana. Xem cả §10 (câu hỏi còn mở).
4. Xong thì một commit riêng `docs: mark <id> done in the implementation plan` đổi ô Trạng thái thành `xong (<ngày>, <hash commit triển khai>)`.
5. Trước khi merge: cập nhật nhánh bằng `git merge origin/main`, **không rebase** (hash ở ô Trạng thái phải còn đúng); file sinh ra bị conflict thì lấy một bên rồi chạy lại generator; `pnpm check` xanh ở máy rồi mới mở PR và merge (merge commit). CI trên GitHub chỉ chạy tay (Actions → CI → Run workflow trên nhánh cần kiểm, implementation-plan §7). Chi tiết: §8 "Chạy song song".

## Tra khi cần / Look it up

- Bản đồ repo, thêm một package, mọi lệnh `pnpm`, hook của repo: [docs/guides/repo-handbook.md](docs/guides/repo-handbook.md). Mọi lệnh `elvaria`: [docs/cli.md](docs/cli.md).
- Tốn mana chỉ có `ELVARIA_LIVE=1` (test của runner với CLI thật) và `elvaria run`, `say`, `triage`, `tribe check` với CLI thật. Vương quốc đã ghim một bản (`elvaria upgrade`): `pnpm elvaria` chạy bản ghim, `--here` chạy mã của worktree đang sửa.
- Hook của repo chặn trước một phần điều cấm ở dưới và typecheck file vừa sửa. Bị chặn thì sửa nguyên nhân, đừng tìm đường vòng; cần làm điều bị chặn thì hỏi người dùng. `guard-bash` khớp cả thân heredoc: ghi file bằng Edit/Write.

## Convention bắt buộc / Required conventions

- **Ba tầng tách biệt.** Tầng việc (domain, store, runner-*, steward, chancellor) không biết renderer tồn tại. Tầng thế giới (herald, world, lite, ui) chỉ đọc event log + snapshot và **ghi lệnh vào `inbox/`**; không bao giờ gọi tầng việc. Luật phụ thuộc ở `packages/config/boundaries.mjs`; ESLint và `pnpm boundaries` chặn import sai.
- **Domain không IO, không throw.** Mã chạy của `packages/domain` không IO, không đồng hồ, không ngẫu nhiên: clock, ngẫu nhiên và id tiêm vào (`Clock`, `RandomSource`, `IdSource`); trả `Result<T, E>`. Quyết định (chọn người, chọn verifier, cầu dao, mana, `planTick`) là hàm thuần trong domain; steward chỉ thực thi. Danh sách cấm đủ: [.claude/rules/domain.md](.claude/rules/domain.md).
- **Chỉ Nhiếp chính ghi trạng thái quest** (`quests/<id>.json`, `characters/<id>/character.json`). CLI, Sứ giả, điện thoại và Tể tướng ghi lệnh vào `inbox/<ulid>.json` (ADR 0005). Ngoại lệ đã chốt, chỉ ở `apps/cli`: [.claude/rules/cli.md](.claude/rules/cli.md).
- **Người làm không phán.** Verifier ≠ assignee và ≠ mọi người từng làm quest đó (với đội: mọi người từng làm bất kỳ quest nào của đội); phiên mới; ưu tiên khác họ model; kiểm tra máy chạy trước và là trọng tài chính (check fail ⇒ fail). Verifier không có Edit/Write (ADR 0008, 0020), trừ trong đất nháp dùng một lần của nghi thức Thả quái thử thành: không commit, không push, xóa sau verdict, nhánh quest không đổi (ADR 0022).
- **Một quest, một context.** Hồi sinh = phiên mới từ `handover.md` + `journal.jsonl` + git; không `--resume` trừ khi `dispatch.resume_after_mana = true`, hoặc người dùng trả lời câu hỏi của nhân vật trong `dispatch.resume_after_answer_minutes` (mặc định 55). Cái gì máy làm được thì dùng bậc script trong catalog, không gọi model (ADR 0017).
- **Thuật ngữ theo [docs/glossary.md](docs/glossary.md)** (nguồn: `packages/i18n/src/glossary.json`, rồi `pnpm docs:gen`). Identifier và mọi id dữ liệu là tiếng Anh: `snake_case` cho khóa/enum JSON, `kebab-case` cho id icon/asset/file, `camelCase`/`PascalCase` trong TS. Dùng đúng từ trong cột "id" (`steward`, không `dispatcher`; `seal`, không `approve`; `tribe`, không `provider`; không `task`, `worker`, `project` trong identifier). Chất fantasy chỉ ở chuỗi hiển thị qua i18n (ADR 0014).
- **Ngôn ngữ.** Code, comment, commit, ADR, README package, prompt nhân vật: tiếng Anh. Tài liệu trong `docs/` (trừ ADR): tiếng Việt. Chuỗi cho người dùng: qua `t()`, có cả `vi` và `en` (`apps/cli` bị ESLint `i18next/no-literal-string` gác).
- **Dữ liệu có schema.** Mỗi file JSON có `version`; mỗi dòng event có `v`. Schema nguồn là zod trong `packages/domain/src/schema`; `docs/schemas/` là đầu ra sinh (ADR 0003). Đổi không tương thích = tăng version + migration + fixture.
- **Dạng nhiệm vụ, nghề, nghi thức, script, tag là dữ liệu registry; tộc là dữ liệu** (`kingdom.tribes[]`), không phải code hay hằng số: không `switch` theo kind, tộc hay CLI trong lõi (ADR 0016, 0021); lõi chỉ thấy `AgentRunner` và `capabilities`, phần thiếu năng lực đi qua `tribeLimitsOf`.
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
| `packages/domain/**` | `pnpm -r test`, `pnpm typecheck` (mọi package dùng domain) |
| Package khác | `pnpm --filter @elvaria/<key> test`; domain, runner-\*, hooks, eventlog, `apps/cli`: bước thêm (schema, event, CLI thật, bản build của hook, `docs/cli.md`…) ở `.claude/rules/` của vùng, tự nạp |
| Package mới, `boundaries.mjs`, `dependencies`, import giữa package | `pnpm install`, `pnpm boundaries`, `pnpm lint`, `pnpm docs:gen` |
| `packages/i18n/**` | `pnpm docs:gen`, `pnpm docs:check`, `pnpm i18n:check` |
| `scripts/**`, `.claude/hooks/**` | `pnpm test`, `pnpm typecheck` (tsconfig gốc, `checkJs`) |
| `docs/**`, `CLAUDE.md`, `.claude/rules/**`, README của package | `pnpm docs:check` |
| Bất kỳ thứ gì, trước khi báo xong | `pnpm check` |

## Definition of done

- Test cho thay đổi; `pnpm check` xanh (lint, format, typecheck, unit, boundaries, drift của schemas và docs:gen, docs:check, i18n:check).
- Chạy được trên Windows **và** macOS: ca riêng của một OS có test riêng. CI chạy tay (bước 5), không là cổng của PR; task chạm vùng nhạy hệ điều hành (`runner-*`, `hooks`, plot, kill tree, `store`) thì nêu trong báo cáo để chủ nhân quyết có chạy CI không.
- README của package chạm vào vẫn đủ 4 mục *Does* / *Does not* / *Depends on* / *How to test* và nói đúng code.
- ADR mới hoặc cập nhật nếu đổi một quyết định đã ghi; `glossary.json` cập nhật (rồi `pnpm docs:gen`) nếu thêm thuật ngữ.
- Cột Trạng thái của task trong [docs/implementation-plan.md](docs/implementation-plan.md) §8 đã đổi; kế hoạch đã sửa và §11 có dòng "chờ người dùng chốt" nếu thực tế khác.
- Diff không có thay đổi ngoài phạm vi task.
