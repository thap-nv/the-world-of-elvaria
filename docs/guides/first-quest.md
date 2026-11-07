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

Chưa thành check, vì một check là một lệnh không qua shell: `pnpm api:openapi` và `pnpm content:build` kèm `git diff --exit-code` (CI kiểm drift bằng `&&`), và e2e (`pnpm e2e:docker` cần `infra/secrets/*` do `sh infra/scripts/init-secrets.sh` sinh, vùng cấm của nhân vật). Repo Elvaria (lãnh thổ #2) có bộ check theo bảng Change impact của [CLAUDE.md](../../CLAUDE.md): lint, format, typecheck, test, boundaries, `schemas --check`, `docs:gen --check`, `docs:check`, `i18n:check`; luật cấm sửa file sinh, `design/**`, kế hoạch sản phẩm, rebase, `git stash` trần.

Repo có `.claude/settings.json` của riêng nó (dc1 và Elvaria đều có) thì hook của repo cũng chạy trong phiên của nhân vật, vì runner nạp `--setting-sources project,local`: nhân vật chịu cả luật của repo lẫn luật của Elvaria.

Worktree của quest nằm trong repo (`<repo>/.elvaria/worktrees/<quest>`), git không thấy nhờ `.git/info/exclude`, nhưng `eslint .` và `prettier --check .` chạy ở checkout chính thì quét cả nó, trừ khi repo bỏ qua `.elvaria/**` (repo Elvaria đã bỏ qua từ P1-11; dc1 chưa).

## 5. Nhân vật

```bash
elvaria character add thorn --class knight     # tộc claude, claude-sonnet-5-5
elvaria character add vesper --class judge     # tộc claude, claude-opus-5-5
elvaria character list
```

Người nghiệm thu phải khác người làm, và cùng tộc thì khác model (`dispatch.verifier_same_family: different_model`). Prompt riêng của từng nghề có từ P1-15; tới lúc đó `doctor` cảnh báo 11 file `registry/prompts/*.md` còn thiếu, và nhân vật chạy với prompt chung của runner-core.

## 6. Ra nhiệm vụ

```bash
elvaria quest add --territory dc1-se-team --kind build --rank E --class knight --tag infra --tag docs \
  --title "Thêm script pnpm check gom lint, typecheck, test, i18n:check" \
  --description "…"
elvaria quest list
```

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
| câu hỏi của nhân vật | chuông trên terminal của `elvaria run` |

Dừng bằng Ctrl+C. Nếu Quản sự chết khi còn phiên chạy, `elvaria doctor` liệt kê các pid đó (khi không có Quản sự nào giữ khóa) và lần `elvaria run` kế tiếp giết chúng.

## 8. Dấu vua

Elvaria không push, không merge. Đọc nhánh trong repo của lãnh thổ (`git log main..quest/<quest>`, `git diff main...quest/<quest>`), thư bàn giao và phán quyết (`elvaria quest show`), rồi:

```bash
elvaria seal <quest> --note "…"                   # xong
elvaria return <quest> --note "…" --fail-kind …   # trả về người làm, ít nhất 20 ký tự
```

Merge nhánh là việc của bạn, như mọi PR.

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
