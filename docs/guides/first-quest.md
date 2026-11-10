# Quest thật đầu tiên

Hướng dẫn chạy một quest thật từ đầu tới lúc chờ dấu vua, viết từ lần chạy của P1-11 ngày 2026-11-07 trên Windows 11 với Claude Code 2.1.319: vương quốc mới, lãnh thổ dc1-se-team, quest #5 của [kế hoạch sản phẩm](../ke-hoach-dung-elvaria-0.7.md) §13 ("Kiến tạo `pnpm check`"), hiệp sĩ Claude và người nghiệm thu Claude khác model. Mọi lệnh và tùy chọn: [docs/cli.md](../cli.md). Kết quả của lần chạy và những gì nó làm lộ ra: mục cuối.

## 1. Máy và bản build

Cần Node 24, pnpm 10, git, Claude Code đã đăng nhập (gói claude.ai). Quản sự chạy từ `dist` của **checkout chính** của repo Elvaria, không từ một nhánh đang sửa: khi repo Elvaria là một lãnh thổ, nhân vật sửa code trên nhánh `quest/<id>` trong worktree riêng, và tiến trình đang chạy không đổi theo.

```bash
cd <checkout chính>          # đang ở main
pnpm install --frozen-lockfile
pnpm --filter @elvaria/hooks build   # dist/ của hook (và của eventlog): mọi phiên gọi hook này
pnpm --filter @elvaria/cli build     # apps/cli/dist/cli.js
```

Từ đây `elvaria` là `node <checkout chính>/apps/cli/dist/cli.js`. Package của workspace vẫn chạy thẳng `src/` (Node 24, type stripping), nên build lại sau mỗi lần `git pull` có đổi hook hoặc `apps/cli`.

## 2. Đăng nhập còn hạn

Trước khi chạy quest (0 mana):

```bash
claude auth status --json     # loginExpiresAt
```

`elvaria doctor` cảnh báo khi còn dưới 7 ngày tới `loginExpiresAt`; hạn thật có thể sớm hơn tới 3 ngày (phiên `-p` cảnh báo cả một khoảng). Gần hạn thì `claude auth login`, hoặc `claude setup-token` khi muốn Quản sự chạy không người trông. Lần chạy này: hạn `2026-11-15T15:23Z`, còn 8 ngày.

## 3. Lập vương quốc

```bash
elvaria init --kingdom "<thư mục vương quốc>" --name Elvaria
elvaria doctor --kingdom "<thư mục vương quốc>"
```

Thư mục vương quốc nằm ngoài mọi repo. `doctor` tìm CLI của từng tộc (Claude Code trong thư mục extension VS Code khi PATH không có), ghim đường dẫn và phiên bản vào `kingdom.json`, kiểm các lãnh thổ, file kho bảo vật (`paths.treasury`: có không, mode 0600 trên macOS, dạng `{ "tên": "giá trị" }`, đủ các tên mà `secrets_allowed` của lãnh thổ nêu; không bao giờ in giá trị) và các phiên do một Quản sự đã dừng để lại. Tộc chưa dùng thì tắt (`"enabled": false` trong `kingdom.json`): lần này tộc `gemini` tắt vì chưa có nhân vật Gemini, và điều khoản của Antigravity (ADR 0018) là việc của người dùng.

Biến `ELVARIA_KINGDOM` thay được `--kingdom` ở mọi lệnh.

## 4. Gắn lãnh thổ và viết luật cho nó

```bash
elvaria territory add "D:/Dummy/Tool - DC1/dc1-se-team" --branch main
elvaria territory add "<checkout chính của Elvaria>" --id elvaria --name Elvaria --branch main
elvaria territory list
```

`territory add` chỉ ghi phần nhận ra được từ git. `commands.setup`, `checks` và `laws` thì người dùng điền trong `territories/<id>/territory.json` (schema: [territory.schema.json](../schemas/territory.schema.json)), đọc từ CLAUDE.md, bảng Change impact và CI của repo; `elvaria territory list` và `doctor` báo ngay nếu file sai schema.

Lãnh thổ dc1-se-team, tóm tắt:

| Trường | Giá trị | Vì sao |
|---|---|---|
| `commands.setup` | `pnpm install --frozen-lockfile --prefer-offline` | worktree mới chưa có `node_modules`; chạy một lần cho mỗi plot |
| `checks[build]` | `pnpm --filter @dc1/shared build`, khi đụng `apps/**`, `packages/**`, mọi file mà `lint` xét, file pnpm gốc | lint (ESLint type-aware), typecheck và test của api, web đọc `dist` của `@dc1/shared`, như bước đầu của CI và pre-push hook; check chạy theo thứ tự trong mảng, nên `build` đứng đầu |
| `checks[lint]`, `[format]`, `[typecheck]`, `[test]`, `[i18n]` | đúng các bước của CI | "đụng gì chạy nấy": glob `when` theo bảng Change impact |
| `checks[repo_hooks]` | `node --test .claude/hooks/guard-bash.test.mjs` | CI chạy nó khi hook của repo đổi |
| `checks[check]` | `pnpm check`, khi đụng `package.json` | cổng trước khi push của repo khi script gốc đổi (quest #5 tạo ra nó) |
| `checks[integration]` | `pnpm test:integration`, `exclusive`, 30 phút | auth, guards, schema DB; cần Docker (Testcontainers) |
| `laws.forbidden_paths` | `.env`, `.env.*`, `infra/secrets/**` | kho bảo vật của repo |
| `laws.forbidden_commands` | push, `--no-verify`, `drizzle-kit drop/push`, `docker compose … down -v` | danh sách "cấm" của CLAUDE.md |
| `laws.read_before_write`, `rank_floor` | mục "Đọc trước khi sửa"; `permissions.ts` từ hạng B | |

**Check nhiều lệnh** (P1-20): `run` của một check là một lệnh hoặc một danh sách lệnh, chạy lần lượt trong cùng thư mục và cùng log, lệnh đầu tiên lỗi kết thúc check (như `&&` của CI, nhưng không qua shell). Nhờ đó các bước CI trước đây chưa thành check của dc1 viết được: drift của `pnpm api:openapi` và `pnpm content:build` (mỗi lệnh kèm `git diff --exit-code`), và e2e cần `infra/secrets/*` do một script `sh` sinh (vùng cấm của nhân vật, nhưng check do máy chạy, không qua hook). Chương trình đầu mỗi lệnh phải tìm được trên PATH của Quản sự. `sh` của Git for Windows nằm ở `C:\Program Files\Git\usr\bin`, mà PATH của Windows (PowerShell, cmd) chỉ có `Git\cmd`: chạy `elvaria run` từ Git Bash (PATH của nó có `usr\bin`), hoặc thêm thư mục đó vào PATH. `doctor` chưa kiểm điều này; thiếu thì check đỏ, log ghi `cannot run this command (not_found: sh)`. Check nhiều lệnh không vào bậc script `run-check` (một argv mỗi check); chúng chạy trước người chấm như mọi check. Bản dc1 dùng từ P1-35 (đã chạy thật, mục 10):

```json
"checks": [
  { "id": "content_drift", "run": ["pnpm content:build", "git diff --exit-code packages/shared/src/content"],
    "when": ["ban-do-nang-luc-se.md", "packages/shared/scripts/**", "packages/shared/src/content/**"], "timeout_minutes": 5 },
  { "id": "openapi_drift", "run": ["pnpm api:openapi", "git diff --exit-code apps/api/openapi.json packages/shared/src/api-types.ts"],
    "when": ["apps/api/**", "packages/shared/src/**"], "timeout_minutes": 10, "defer_to_merge": true },
  { "id": "e2e", "run": ["sh infra/scripts/init-secrets.sh", "pnpm e2e:docker"],
    "when": ["apps/web/**", "apps/api/src/**", "packages/shared/src/**", "infra/compose*.yml", "infra/docker/**", "infra/postgres/**"],
    "exclusive": true, "timeout_minutes": 30, "defer_to_merge": true, "cleanup": "pnpm e2e:down" }
]
```

`openapi_drift` có `defer_to_merge` (từ P1-37): quest hợp đồng của một đội viết `openapi.json` trước khi có code, nên drift luôn đỏ ở đó; quest hợp đồng và các phần bỏ qua nó, quest ghép chạy nó một lần trên nhánh đã ghép. `git diff --exit-code` nêu đúng các đường dẫn sinh ra, như CI, để file khác trong plot (đất nháp của người chấm có `infra/secrets/*`, `coverage/`) không làm check đỏ. Check drift đỏ khi nguồn đổi mà file sinh không đổi theo (diff in trong log), xanh khi không drift; `content:build` còn tự từ chối khi tên mảng lệch Phụ lục A, cũng đỏ nhưng vì lý do khác.

**Test là sản phẩm** (P1-20, ADR 0022): quest Kiến tạo/Gia cố có tag `e2e` hoặc `integration` được nghiệm thu bằng Thả quái thử thành trong một đất nháp `<quest-id>-verify`. Hai lệnh mới, tùy chọn, ở `commands`: `reset` (một lệnh hoặc danh sách: đưa DB, container về sạch; chạy sau `setup` và trước mỗi lần chạy check trong đất nháp, chỉ máy chạy) và `coverage` (đo coverage, để lại tóm tắt istanbul ở `coverage/coverage-summary.json` **ở gốc plot**; bước `coverage_not_lower` chạy nó trên nhánh và trên base). Không khai `coverage` thì coverage không được đo. Với dc1 (monorepo, gốc không có vitest):

```json
"commands": {
  "reset": ["sh infra/scripts/init-secrets.sh",
            "docker compose -p dc1-e2e --env-file infra/e2e.env -f infra/compose.yml -f infra/compose.e2e.yml -f infra/compose.test.yml down -v --remove-orphans"],
  "coverage": ["pnpm --filter @dc1/shared build",
               "pnpm --filter @dc1/api exec vitest run --coverage --coverage.reporter=json-summary --coverage.reportsDirectory=../../coverage"]
}
```

`reset` chạy `init-secrets.sh` trước vì đất nháp mới chưa có `infra/secrets/*` mà compose đọc; `down -v` cấm với nhân vật (`laws.forbidden_commands`) nhưng máy chạy được. Coverage là coverage unit của api: test Playwright không chạy qua vitest, nên quest e2e không bao giờ làm nó tăng hay giảm, `coverage_not_lower` ở đó chỉ giữ cho unit không tụt. Người chấm trong đất nháp chạy được mọi check của lãnh thổ, kể cả check `exclusive` như e2e: Quản sự giữ khóa exclusive của lãnh thổ suốt phiên người chấm (khóa đang bận thì người chấm mở ở tick sau, log báo một lần), nên trong lúc đó check exclusive của quest khác chờ (tới `breakers.attempt_minutes.high` + thời gian của check exclusive dài nhất + 1 phút) thay vì đỏ. Repo Elvaria (lãnh thổ #2) có bộ check theo bảng Change impact của [CLAUDE.md](../../CLAUDE.md): lint, format, typecheck, test, boundaries, `schemas --check`, `docs:gen --check`, `docs:check`, `i18n:check`; luật cấm sửa file sinh, `design/**`, kế hoạch sản phẩm, rebase, `git stash` trần.

**File sinh** (P1-24): đặt glob của file sinh vào `laws.read_only_paths`, không vào `forbidden_paths`, và lệnh sinh ra chúng vào `commands.generate`. Mọi phiên đọc được file sinh; không tool nào ghi tay được (deny rule `Edit(./…)` cộng hook, kể cả `>`/`tee`/`Set-Content` của shell); nhân vật có Edit và shell được chạy các lệnh sinh (`Bash(<lệnh>:*)`), và prompt liệt kê cả đường dẫn chỉ đọc lẫn lệnh sinh. Người chấm không được chạy lệnh sinh. Với Elvaria:

```json
"commands": { "generate": ["pnpm docs:gen", "pnpm schemas"] },
"laws": {
  "forbidden_paths": [".env", ".env.*", "design/**", "docs/ke-hoach-dung-elvaria-*.md"],
  "read_only_paths": ["docs/schemas/**", "docs/glossary.md", "docs/events.md", "docs/dependency-graph.md", "docs/cli.md", "docs/tier-report.md"]
}
```

Với dc1 (nếu muốn nhân vật tự sinh lại): `"generate": ["pnpm api:openapi", "pnpm content:build"]` và `read_only_paths` là `apps/api/openapi.json`, `packages/shared/src/api-types.ts` cùng đầu ra của `content:build`. Lệnh sinh chạy trong plot với quyền của tiến trình con: Elvaria không giới hạn nó ghi gì, nên chỉ khai lệnh sinh tin được.

**Thư mục Claude Code tự khóa** (P1-24, ca `.husky/pre-push` của P1-16): Claude Code 2.1.319 không cho Write/Edit bất kỳ đường dẫn nào chứa thư mục `.git`, `.vscode`, `.idea`, `.claude`, `.husky`, `.cargo`, `.devcontainer`, `.yarn`, `.mvn`, `.config/git`, hay kết thúc bằng một trong các file như `.gitmodules`, `.npmrc`, `.yarnrc.yml`, `.pnpmfile.cjs`, `.envrc`, `.mcp.json`, `lefthook.yml`, `.pre-commit-config.yaml` (danh sách đủ ở `CLAUDE_PROTECTED_PATHS` của runner-claude). Kiểm an toàn này chạy trước mọi allow rule của `--settings`, và `dontAsk` biến câu hỏi thành từ chối, nên không luật nào của lãnh thổ mở được ([spike Claude](../spikes/claude-2026-11.md), mục "đường dẫn Claude Code 2.1.319 tự khóa"). Hook của Elvaria nói trước điều đó; nhân vật làm phần còn lại, ghi đúng thay đổi vào mục Question của thư bàn giao, và chủ nhân sửa file trong plot rồi trả lời (`elvaria answer`), như P1-16 đã làm. Ở repo Elvaria, việc chạm `.claude/rules/**` hay `.claude/hooks/**` cũng rơi vào ca này.

**Cho Quản sự áp bản vá** (P1-28): lãnh thổ git muốn nhân vật tự đổi các đường dẫn đó thì khai chúng trong `laws.patch_paths` (glob tính từ gốc lãnh thổ, mặc định `[]`; không bao giờ gồm `.git`). Khi đó hook và prompt bảo nhân vật ghi thay đổi thành bản vá git (dạng `git diff` in ra) vào `elvaria.patch` ở gốc plot thay vì hỏi; khi phiên kết thúc `completed`, Quản sự kiểm bản vá chỉ chạm `patch_paths`, áp bằng `git apply --recount`, xóa file, ghi một dòng `plot.patched`, rồi mới commit `chore: submit`, nên người chấm thấy thay đổi trong diff như mọi thay đổi khác. Bản vá chạm đường dẫn khác hay không áp được thì không áp gì, file ở lại trong plot và quest vào trạm xá với lý do `breaker:commit: elvaria.patch was not applied: …`; chủ nhân đọc nó, sửa tay hoặc `quest retry`. Hook của git sẽ chạy trên máy của bạn sau khi merge, nên chỉ khai `patch_paths` cho lãnh thổ mà bạn đọc diff trước khi merge (giai đoạn 1 luôn merge tay). Ví dụ cho dc1:

```json
"laws": { "patch_paths": [".husky/**"] }
```

Với repo Elvaria, `".claude/rules/**"` cho phép nhân vật sửa luật theo vùng; `.claude/hooks/**` và `.claude/settings.json` chạy code trong phiên của bạn, nên cân nhắc trước khi thêm.

Repo có `.claude/settings.json` của riêng nó (dc1 và Elvaria đều có) thì hook của repo cũng chạy trong phiên của nhân vật, vì runner nạp `--setting-sources project,local`: nhân vật chịu cả luật của repo lẫn luật của Elvaria.

Worktree của quest nằm trong repo (`<repo>/.elvaria/worktrees/<quest>`), git không thấy nhờ `.git/info/exclude`, nhưng `eslint .` và `prettier --check .` chạy ở checkout chính thì quét cả nó, trừ khi repo bỏ qua `.elvaria/**` (repo Elvaria đã bỏ qua từ P1-11; dc1 chưa).

Phiên của tộc Gemini (agy) cần `.agents/hooks.json`, shim `.agents/elvaria-hook.mjs` và `GEMINI.md` trong worktree; runner gỡ chúng khi phiên kết thúc (từ P1-23), trước khi Quản sự chạy check. Check `format` vì vậy là đúng lệnh của CI (`pnpm format:check`), không cần loại `.agents/**` như lần chạy P1-16 (báo cáo giai đoạn 1 §5.3). Trong lúc chính một phiên agy chạy, các file đó vẫn có mặt: người chấm tộc Gemini tự chạy `pnpm format:check` thì thấy chúng; phán quyết dựa trên check máy đã chạy trước phiên.

## 5. Nhân vật

```bash
elvaria character add thorn --class knight     # tộc claude, claude-sonnet-5-5
elvaria character add vesper --class judge     # tộc claude, claude-opus-5-5
elvaria character list
```

Người nghiệm thu phải khác người làm, và cùng tộc thì khác model (`dispatch.verifier_same_family: different_model`). Mỗi nghề có prompt riêng `registry/prompts/<nghề>.md` (từ P1-15), nối vào sau luật của vai trong phần hệ thống của mọi phiên; chủ nhân sửa được. Vương quốc tạo trước P1-15 không có thư mục đó và không nạp được registry: `doctor` báo từng file thiếu, và `elvaria migrate` chép các file registry còn thiếu (không ghi đè file bạn đã có).

## 6. Ra nhiệm vụ

```bash
elvaria quest add --territory dc1-se-team --kind build --rank E --class knight --tag infra --tag docs \
  --title "Thêm script pnpm check gom lint, typecheck, test, i18n:check" \
  --description "…"
elvaria quest list
```

**Một đội** (P1-18): `quest add --contract` (kind `plan`, nghề `mage`) mở một đội; pháp sư viết hợp đồng rồi chia phần, Quản sự tự thêm quest ghép. Trên lãnh thổ bật `blind_trial`, đội có hạng từ `min_rank` trở lên có thêm phần test chấp nhận do Quản sự tự thêm, và các phần chờ nó (P1-37): đừng liệt kê nó trong chỉ dẫn cho pháp sư. Người viết test chấp nhận chỉ đọc hợp đồng và phần việc của mô tả. Viết phần việc trước, rồi một dòng chỉ có `---`, rồi chỉ dẫn cho trưởng đội (đường dẫn hợp đồng, cách chia phần, hạng mỗi phần): người viết test không đọc phần sau dòng đó. Không có dòng `---` thì người viết đọc cả mô tả, kèm lời dặn bỏ qua chỉ dẫn cho trưởng đội. Quest lẻ không bao giờ có Khảo hạch mù, dù hạng nào; muốn có thì ra nhiệm vụ bằng `--contract`.

Kind `build` mặc định cần dấu vua, nên quest dừng ở `awaiting_seal` sau khi qua nghiệm thu. Trong Windows PowerShell 5.1, dấu `"` nằm trong một đối số bị cắt khi truyền cho `node` (CLI báo "Thừa tham số"): dùng ngoặc kép kiểu chữ (“ ”) hoặc Git Bash.

## 7. Chạy Quản sự và theo dõi

```bash
elvaria run --kingdom "<thư mục vương quốc>"      # tới khi Ctrl+C
```

Một vương quốc chỉ có một Quản sự (`.state/steward.lock`). Mỗi nhịp 5 giây nó áp lệnh trong `inbox/`, giao quest, dựng plot (worktree trên nhánh `quest/<id>`, `commands.setup`), mở phiên người làm; phiên xong thì commit phần còn lại (`chore: submit <quest>`), chạy các check mà `when` khớp đường dẫn đã chạm, rồi mở phiên người chấm. Theo dõi, không tốn mana:

| Xem gì | Ở đâu |
|---|---|
| trạng thái | `elvaria quest list`, `elvaria quest show <quest>` |
| việc nhân vật làm (mỗi lần dùng tool) | `quests/<quest>/journal.jsonl` |
| thư bàn giao | `quests/<quest>/handover.md` |
| prompt, settings, stdout của phiên | `.runs/<quest>-<n>/` |
| log của setup và từng check | `.runs/<quest>-setup.log`, `.runs/<quest>-<n>/checks/<id>.log` |
| câu hỏi của nhân vật | chuông trên terminal của `elvaria run`, `elvaria quest show <quest>`; trả lời bằng `elvaria answer <quest> "<câu>"` |

Dừng bằng Ctrl+C. Nếu Quản sự chết khi còn phiên chạy, `elvaria doctor` liệt kê các pid đó (khi không có Quản sự nào giữ khóa) và lần `elvaria run` kế tiếp giết chúng.

Cầu dao token so token của phiên với `budget.max_tokens` (= `estimate.tokens × breakers.mana_multiplier`, mặc định 120 000 × 2 khi quest không có ước lượng). Từ P1-23 token đọc cache tính một phần mười, như giá của nó: Claude Code đọc lại cả ngữ cảnh đã cache ở mỗi lượt, và đếm đủ thì một phiên bình thường bị cắt (báo cáo giai đoạn 1 §5.2). `mana_multiplier: 2` là đủ; vương quốc nào đã nâng nó để tránh cắt oan thì trả về 2 sau khi dùng `dist` có P1-23, còn quest đã mở giữ trần cũ tới khi `elvaria quest edit <quest> --max-tokens <n>`. Người chấm bị cầu dao cắt thì người khác chấm tiếp; người thứ hai của cùng lượt cũng bị cắt thì quest vào trạm xá kèm chuông, không mở phiên người chấm thứ ba: nâng trần bằng `elvaria quest edit <quest> --max-tokens <n>` rồi `retry` (ghi lệnh vào `inbox/` như báo cáo giai đoạn 1 §5.7, tới khi CLI có `quest retry` của P1-26).

## 8. Dấu vua

Elvaria không push, không merge. Đọc nhánh trong repo của lãnh thổ (`git log main..quest/<quest>`, `git diff main...quest/<quest>`), thư bàn giao và phán quyết (`elvaria quest show`), rồi:

```bash
elvaria seal <quest> --note "…"                   # xong
elvaria return <quest> --note "…" --fail-kind …   # trả về người làm, ít nhất 20 ký tự
```

`seal` và `return` chỉ ghi một lệnh vào `inbox/`: Quản sự áp nó (và viết thư giao hàng) ở nhịp kế tiếp, nên khi không có Quản sự nào chạy, quest vẫn ở `awaiting_seal` tới lần `elvaria run` sau.

Merge nhánh là việc của bạn, như mọi PR. Quản sự viết thư giao hàng vào `.runs/<quest>-delivery.md`, dùng làm mô tả PR. Push từ trong worktree (`git -C <repo>/.elvaria/worktrees/<quest> push -u origin quest/<quest>`), để pre-push hook của repo kiểm đúng nhánh đó, không kiểm checkout chính.

Sau khi merge, trả worktree bằng lệnh lưu trữ (chỉ cho quest đã xong và đã giao hàng), rồi chạy Quản sự để nó áp lệnh:

```bash
elvaria quest archive <quest>
elvaria run                                          # một hai nhịp, rồi Ctrl+C
```

Quản sự gỡ worktree (cả khung thư mục chứa junction `node_modules` của pnpm mà `git worktree remove` để lại trên Windows) và cho Claude Code quên đường dẫn đó (`claude purge`). Nhánh ở lại; xóa nó khi đã merge: `git branch -d quest/<quest>` và, nếu đã push, `git push origin --delete quest/<quest>`. Một thư mục mà chương trình khác còn mở (VS Code mở worktree để xem PR: `EPERM`) thì ở lại, Quản sự in một dòng cảnh báo có đường dẫn: đóng chương trình đó rồi xóa tay. Quest đã hủy giữ worktree (như mọi lần hủy, kể cả thay đổi chưa commit); dọn tay bằng `git worktree remove --force`, `git branch -D` và `claude purge --yes "<repo>/.elvaria/worktrees/<quest>"`. Lần chạy 2026-11-07 dọn tay cả hai worktree, vì lệnh lưu trữ ra đời sau đó, từ chính lần dọn này.

## 9. Lần chạy ngày 2026-11-07

Trước khi tốn mana, `main` của dc1 (0c3c6dc) được chạy thử đủ các bước CI trên một bản clone: install 22 s khi store còn lạnh, 1 s khi đã ấm; build `@dc1/shared` 3 s, lint 29 s, format 5 s, typecheck 8 s, test 11 s, i18n 1 s, tất cả xanh. Chạy thử như vậy để một quest không trượt vì nhánh gốc đã đỏ.

**Lần 1** (Quản sự từ `dist` của `main` 5e5d5d6): hiệp sĩ làm đúng việc (thêm script `check` có build shared đứng trước, sửa README cả VI lẫn EN, viết thư bàn giao tiếng Việt; 9 lượt, ≈ 0,09 USD theo `total_cost_usd`). Để kiểm, nó gửi một lệnh ghép `… ; npx prettier --check … ; timeout 500 pnpm check | tail -15`; settings chỉ cho phép `pnpm check` đứng riêng, nên từ chối cả dòng, và thông báo từ chối của Claude Code bảo đừng tìm đường vòng. Nó không commit, đặt một câu hỏi cho chủ nhân, và quest sang `blocked`. CLI chưa có lệnh trả lời câu hỏi, nên quest bị hủy (`elvaria quest cancel`; worktree được giữ, như mọi lần hủy). Từ đó prompt của người làm và người chấm liệt kê đúng các lệnh shell được phép, mỗi lần gọi một lệnh, và nói rằng lệnh bị từ chối không phải câu hỏi cho chủ nhân; Quản sự tự commit phần còn lại rồi chạy check. Prompt người chấm cũng không còn ghi "The branch has no changes." khi Quản sự chưa truyền diff, mà chỉ cách đọc diff (`git diff origin/main...HEAD`).

**Lần 2** (Quản sự từ `dist` của nhánh `feat/p1-11`, có hai bản sửa trên): `open → claimed → working → review → awaiting_seal`, không cần can thiệp.

| Bước | Kết quả |
|---|---|
| plot | worktree tách từ `origin/main` 0c3c6dc, `pnpm install` 6 s |
| Thorn (claude-sonnet-5-5) | 15 lượt, 116 s, ≈ 0,15 USD; chạy `pnpm check` hai lần: lần đầu lint đỏ vì ESLint type-aware cũng đọc `dist` của shared, nên nó đưa build lên đầu script; không lệnh nào bị từ chối |
| commit | `chore: submit q_…` do Quản sự commit (hiệp sĩ để Quản sự làm việc này) |
| check máy | `build` 3,6 s, `format` 6,2 s, `check` 48 s, cả ba pass |
| Vesper (claude-opus-5-5) | 6 lượt, 65 s, ≈ 0,23 USD; đọc diff, chạy lại `pnpm check`, phán `pass`, ghi chú tiếng Việt; còn bắt được mục "Done" của thư bàn giao ghi thứ tự cũ |

Phát hiện của lần 2 về lãnh thổ: vì ESLint đọc `dist` của shared, check `build` phải đứng trước `lint` cả khi quest chỉ chạm file `.ts` ở gốc, nên `when` của `build` gồm luôn các glob của `lint`. Hiệp sĩ cũng ghi nhận rằng `.husky/pre-push` của dc1 không chạy lint, dù README nói pre-push hook "chạy phần đầu": việc này có thể thành một quest riêng trên dc1.

## 10. Thả quái thử thành trên dc1, ngày 2026-11-09 (P1-35)

Lần chạy thật đầu tiên của nghi thức `mutation_check` (§4 "Test là sản phẩm", ADR 0022), trên Windows 11, Claude Code 2.1.319, Antigravity CLI 1.5.3, Docker Desktop 29.9.2 (22 CPU, 16 GB). Token đếm theo cách của P1-23 (đọc cache tính một phần mười); mọi prompt đã có `temple/scripture.md` và `gazetteer.md` của dc1 (mỗi file 6 dòng).

**Chuẩn bị vương quốc** (bản sao ở `.backup/2026-11-09/`): lãnh thổ dc1 thêm `commands.reset`, `commands.coverage`, các check `content_drift`, `openapi_drift`, `e2e` như §4. Vương quốc tạo trước P1-20 không có `mutation_check`, `ritual_overrides` và tag `integration` trong registry: `elvaria migrate` chỉ chép file thiếu, không thêm mục mới vào file đã có, và `doctor` không báo. Thiếu chúng thì quest `e2e` được chấm bằng `build_review`, không lỗi gì. Thêm bằng tay theo `packages/registry-default` (`kinds.json`, `rituals.json`, `tags.json`).

**Chạy thử trước khi tốn mana** (bản clone của `main` dc1 c29d390, 0 token): install 12 s, build shared 5 s, `api:openapi` 7 s, `content:build` 1 s, lệnh coverage 3 s (lines 18,31 % của api). Hai check drift chạy qua `runChecks` thật: xanh khi không drift; đỏ vì diff khi commit nguồn mà không sinh lại. Check `e2e` lộ hai lỗi của Elvaria trên Windows, sửa trong commit `fix(runner-core)` của P1-35:

| Lỗi | Triệu chứng | Sửa |
|---|---|---|
| log của check mở bằng `'a'` | `sh infra/scripts/init-secrets.sh` thoát 1 sau 0 s, log trống: handle mở để append không có quyền ghi riêng, chương trình MSYS (`sh` của Git) không ghi được qua nó, `set -e` dừng script | `openLog` mở bằng `'w'`; cha và con vẫn ghi đúng thứ tự qua vị trí ghi chung |
| env tối thiểu thiếu `ProgramFiles` | `docker compose -p …` báo `unknown shorthand flag: 'p'`: Docker CLI tìm plugin compose, buildx ở `%ProgramFiles%\Docker\cli-plugins` | `ProgramFiles`, `ProgramData` vào `MINIMAL_ENV_NAMES` (ADR 0013 sửa tại chỗ, chủ nhân chọn) |

Sau hai bản sửa, `pnpm e2e:docker` chạy hết dưới Elvaria (705 s cả build image) nhưng `main` của dc1 **đỏ**: 11 test hỏng, 10 không chạy, 143 qua, mọi lỗi ở `/results`, từ thẻ lịch sử một mảng của đội P1-21 (PR #35, lúc đó lãnh thổ chưa có check e2e): `<select>` rộng 406 px làm trang cuộn ngang ở 320 và 390 px; câu "…over the periods." dính chữ "To develop" của khối sau thành `periods.To`, `expectNoRawKeys` bắt nhầm là khóa i18n thô; WebKit báo vi phạm CSP trên `/results`. Quest e2e không thể xanh trên nhánh gốc đỏ (máy chỉ chạy lại khi lượt đầu xanh), nên chủ nhân chọn một quest sửa trước, quest e2e `--depends-on` nó (nhánh tách từ nhánh quest sửa, P1-16 (f)).

**Quest sửa** `q_20261109_skffqk` (fix, hạng E, Quản sự từ `dist` của `8c7cb44`):

| Bước | Kết quả |
|---|---|
| thorn (claude-sonnet-5-5), lượt 1 | 38 lượt, 133 465 token; sửa tràn ngang (CSS) và câu chữ; không tìm ra nguồn CSP (đọc tĩnh, không chạy được webkit) |
| check máy lượt 1 | build 3 s, lint 80 s, format 6 s, typecheck 13 s, test 18 s, i18n 2 s, e2e 567 s đỏ (148 qua, còn 6 test mobile-webkit) |
| ilse (gemini-3.8-flash-high), người chấm 1 | 56 lượt tool tự đi tìm nguồn CSP dù check đã đỏ, bị cầu dao token cắt (496 608 / 480 000), không có phán quyết |
| check máy chạy lại | Quản sự chạy lại toàn bộ check cho người chấm kế tiếp dù commit không đổi: thêm 10 phút (e2e 546 s, cùng 6 test đỏ) |
| ilse, người chấm 2 | được chọn lại (người chấm bị cắt không bị loại); 6 lượt, 62 857 token, `fail tests_fail` trích log e2e |
| chẩn đoán của chủ nhân | spec tạm nghe `securitypolicyviolation` trên mobile-webkit, CSP thêm `'report-sample'`, compose project riêng, khoảng 3 phút, 0 token: vi phạm `style-src-attr`, mẫu `text-overflow:inherit`, đích là `<select>` của thẻ, lúc react-dom tạo nó; repo đã ghi đúng bẫy này ở `JournalEntryDialog.tsx` dòng 62; ghi vào mô tả quest (`quest edit --description`) |
| thorn, lượt 2 | 35 lượt, 154 986 token; thẻ lúc đóng là một `<button>`, chỉ dựng `<select>` khi đang chọn |
| check máy lượt 2 | mọi check xanh, e2e 679 s, 164/164 |
| ilse, người chấm | 22 lượt, 160 262 token, `pass`; chủ nhân đóng dấu |

Quest sửa: khoảng 1 008 000 token (thorn 288 451, ilse 719 727), 55 phút từ lúc nhận tới lúc chờ dấu, 3 lượt check (e2e 567 + 546 + 679 s, khoảng 30 phút, trong đó một lượt chỉ để người chấm thứ hai).

**Đổi bản giữa chừng**: trong lúc quest sửa chờ dấu, Quản sự dừng khi rảnh, nhánh merge `main` có P1-36 (7ce92a6), build lại hook và CLI, `doctor`, chạy lại từ `cfcd668`. Settings của mọi phiên mở sau đó có `--event PreToolUse` ở hook `PreToolUse`.

**Quest e2e** `q_20261109_k8ejj6` (build, hạng E, tag `e2e` ⇒ `mutation_check`; trần sửa trước khi giao: 60 phút, 400 000 token):

| Bước | Kết quả |
|---|---|
| thorn, lượt 1 | 23 lượt, 75 567 token, 2 phút: `apps/web/e2e/functional/results-csv.spec.ts` (105 dòng, en và vi: tên file, BOM, tiêu đề cột, một dòng mỗi mảng, `L3` ở mảng vừa chấm, mảng chưa chấm để trống) |
| trial trong đất nháp | 30 phút, 0 token, đất nháp `q_20261109_k8ejj6-verify` detached ở đầu nhánh, setup 11,8 s: `rerun_clean` ✓ (mọi lần reset 8 s), build 2 s, lint 37 s, format 5 s, typecheck 9 s, test 17 s, `e2e` ✓ 602 s (166/166, hai test mới khoảng 1 s mỗi test), `flake_check` ✓ 1 108 s (lượt 2, 3 đều 166/166), `coverage_not_lower` ✓ 9 s ("coverage did not drop": test Playwright không chạm coverage unit) |
| ilse trong đất nháp | 13 lượt, 101 271 token, 2,5 phút, `pass` mà **không đập thử**: mọi lệnh `pnpm` trong shell của agy đỏ ngay, `pnpm.ps1 cannot be loaded because running scripts is disabled on this system` |
| sau phán quyết | nhánh quest không đổi (`01d0fa9`), đất nháp đã xóa, khóa `.state/checks/dc1-se-team-exclusive` đã nhả |

**Shell của agy trên Windows chạy PowerShell.** `pnpm` ở đó là `C:\nvm4w\nodejs\pnpm.ps1`, và Execution Policy mặc định của Windows (`Restricted`, mọi scope `Undefined`) cấm script. Phiên agy chưa bao giờ chạy được `pnpm` trên máy này: 8 thư mục `.runs` của lần chạy P1-21 có đúng dòng lỗi đó, gồm cả hai phiên của kael ở phần test chấp nhận (chỉ đọc file rồi bị cầu dao cắt). Sửa trên máy: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` (cho chạy script cục bộ, script tải về phải có chữ ký). Chủ nhân sửa, rồi trả quest về (`--fail-kind other`, chưa có lệnh "chấm lại" nên lần trả về tính một lần trượt cho thorn); thorn nộp lại không đổi (4 lượt, 22 634 token), trial chạy lại.

| Bước | Kết quả |
|---|---|
| trial lần 2 | 27,6 phút, đất nháp mới, setup 6,8 s: `rerun_clean` ✓ 11 s, `e2e` ✓ 491 s, `flake_check` ✓ 1 084 s (ba lượt 166/166, 7,6–7,7 phút Playwright), `coverage_not_lower` ✓ 8 s |
| ilse trong đất nháp, lần 2 | 34 lượt, 275 110 token, 8,3 phút (khóa exclusive giữ suốt phiên): chạy `pnpm e2e:docker apps/web/e2e/functional/results-csv.spec.ts` (3 qua, 67 s); đập `results-csv.ts` hai chỗ (định dạng tên file, tiền tố `L` của mức), mỗi lần cả hai test en và vi đỏ (68 s); `git restore`, chạy lại 3 qua (44 s); `git status` sạch suốt phiên; `pass` |
| sau phán quyết | nhánh không đổi (`01d0fa9`), đất nháp đã xóa, khóa đã nhả; quest chờ dấu vua |

Mỗi lần chạy một file e2e trong đất nháp mất khoảng 1 phút (build lại image có cache), nên người chấm đập thử hai lần vừa trong trần 60 phút. Phán quyết của agy chỉ là `{"progress": …, "result": "pass"}` sau mấy dòng kể việc, không có `notes`: Quản sự nhận nó và lưu ghi chú rỗng, nên bằng chứng đập thử chỉ còn trong `.runs/<quest>-<n>/verify/stdout.jsonl`. Quest e2e: 474 582 token (thorn 98 201, ilse 376 381), 75 phút từ lúc nhận tới lần chờ dấu thứ hai, kể cả lúc chủ nhân sửa máy.

**Check drift** chạy thật qua `runChecks` trên bản clone (không drift: cả hai xanh; commit nguồn mà không sinh lại: cả hai đỏ vì diff), nhưng không quest nào của lần chạy chạm vùng `when` của chúng.

**Còn mở sau lần chạy** (đề xuất ở implementation-plan §11, dòng P1-35): `doctor` chưa kiểm chương trình của lệnh lãnh thổ và Execution Policy; registry của vương quốc cũ không tự nhận mục mới; người chấm thứ hai được chạy lại toàn bộ check dù commit không đổi; người chấm bị cầu dao cắt có thể được chọn lại ngay; người chấm agy không chạy được lệnh thì vẫn cho `pass`; phán quyết không có `notes` vẫn được nhận. Bài học vào kinh (`temple/scripture.md`) và gazetteer của dc1: người chấm thấy check đỏ thì trích log rồi dừng; trong đất nháp không đập thử được thì `partial`; WebKit và `<select>`; layout 320/390 px và `expectNoRawKeys`.
