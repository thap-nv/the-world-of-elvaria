# Spike · Tài khoản thứ hai của Codex trong một `CODEX_HOME` riêng (docs/plan-sibling-tribes)

Ngày: 2026-11-17 · Máy: Windows 11 Pro (10.0.26200), Node 24.22.1 · CLI: Codex 0.169.0-alpha.11.1 (bản đi kèm extension VS Code `openai.chatgpt` 26.1111.21308, `codex.exe`) · Tài khoản: thư mục mặc định đăng nhập ChatGPT gói `plus`; thư mục thứ hai do chủ nhân tự đăng nhập.

Chủ nhân hỏi chi cho Codex có làm được không, để làm cùng chi cho Claude (mục CT10 của [kế hoạch chi của tộc](../plans/sibling-tribes.md)). Spike này đo điều [spike Codex](codex-2026-11-12.md) mới chỉ suy từ tài liệu: Codex chạy thế nào khi `CODEX_HOME` trỏ sang một thư mục khác. Phép đo cùng loại cho Claude Code ở [spike thư mục cấu hình](claude-config-dir-2026-11-17.md).

Nguồn của từng dòng: **[máy]** đã chạy trên máy này ngày 2026-11-17; **[spike Codex]** spike 2026-11-12; **[code]** code của Elvaria ở `main` `fc4a2a1`; **[suy]** suy luận, chưa đo.

**Chi phí.** Không lệnh nào ở bản này gọi model. Đã chạy `codex --version` một lần, `codex login status` mười lần (năm lượt, mỗi lượt hai thư mục) và `codex app-server` ba lần (một lần chỉ `initialize`, hai lần `account/rateLimits/read`). Chủ nhân đã cho phép cả loạt lệnh này, cùng hai lượt một câu trên `gpt-6-luna` cho mục 3.

---

## 0. Cách đo

- Thư mục thứ hai là `elvaria-worktrees/sibling-spike/codex-b/`, ngoài repo và ngoài `~/.codex`; cwd của mọi lệnh là thư mục rỗng `plot/` cạnh đó. Chủ nhân xóa cả thư mục spike khi không cần nữa.
- Script gọi `codex.exe` như adapter `codex_cli` gọi **[code]**: `spawn` không shell, env chỉ gồm 14 tên của `MINIMAL_ENV_NAMES`, cộng `CODEX_HOME` khi đo thư mục thứ hai. `codex app-server` được hỏi qua JSON-RPC trên stdio, từng lời gọi một, như `packages/runner-codex/src/app-server.ts`.
- Chủ nhân tự đăng nhập: đặt `$env:CODEX_HOME` trong một cửa sổ PowerShell riêng rồi chạy `codex login`. Phiên đo không chạm credential.
- Script không mở file nào trong hai thư mục nhà; nó chỉ liệt kê tên và kích thước trong `codex-b/`. Mọi thứ in ra đã che email, mã dạng UUID và thư mục nhà; các trường có tên kết thúc bằng `id` chỉ in độ dài và kết quả so sánh giữa hai thư mục.
- Thư mục mặc định chỉ bị gọi bằng `codex login status` và `account/rateLimits/read`, là hai lệnh adapter vốn chạy khi `doctor` và khi thăm dò **[code]**.

## 1. Tóm tắt

| Câu hỏi | Kết quả | Hệ quả cho PS-27c |
|---|---|---|
| `CODEX_HOME` có tách đăng nhập không | **Có.** Thư mục rỗng là `Not logged in`, thoát 1, trong khi thư mục mặc định vẫn đăng nhập **[máy]** | Mỗi dòng `tribes[]` một thư mục nhà là đủ để tách tài khoản |
| Adapter có biết CLI đang dùng thư mục nào không | **Có.** `initialize` của `codex app-server` trả `codexHome` **[máy]** | `ToolInfo.config_dir` là `codexHome`; khác thư mục đã cho thì `doctor` báo lỗi |
| Thăm dò ở thư mục chưa đăng nhập | Lỗi rõ: "codex account authentication required to read rate limits" **[máy]** | `probe()` trả `error`, không cần sửa |
| Hạn mức của tài khoản thứ hai có tách riêng không; mã tài khoản lấy từ đâu | **Chưa đo** (mục 3) | PS-27c giả định là có; mục CT17 của kế hoạch chờ phép đo |
| Phiên, `exec resume` và sandbox `mxc` trong thư mục mới | **Chưa đo** (mục 3). CLI đã tự dựng `.sandbox/` trong thư mục mới **[máy]** | Lần `tribe check` thật của PS-27c kiểm lại bằng adapter thật |

## 2. `CODEX_HOME` mới, trước khi đăng nhập

Mọi dòng của mục này là **[máy]**.

- `codex --version` in `codex-cli 0.169.0-alpha.11.1`, đúng phiên bản `.claude/rules/runner.md` ghi.
- `CODEX_HOME=<thư mục rỗng> codex login status` thoát 1 và in `Not logged in` ra stderr. Cùng lệnh với thư mục mặc định thoát 0 và in `Logged in using ChatGPT`, cũng ra stderr. `doctorCodex` đọc cả stdout lẫn stderr nên không bị ảnh hưởng **[code]**.
- `codex app-server`, lời gọi `initialize`, trả `userAgent`, `codexHome`, `platformFamily` và `platformOs`. `codexHome` là đúng thư mục đã cho trong `CODEX_HOME`. Đây là chỗ adapter biết CLI có nghe biến không.
- `account/rateLimits/read` ở thư mục chưa đăng nhập trả lỗi JSON-RPC `-32600`, "codex account authentication required to read rate limits". Lần thăm dò của adapter vì thế trả `error` **[code]**, không im lặng.
- Cùng lời gọi với thư mục mặc định trả `rateLimits.primary` (300 phút, `usedPercent` 11) và `rateLimits.secondary` (10080 phút, `usedPercent` 39), `planType: "plus"`, cùng `rateLimitsByLimitId.codex` và `rateLimitResetCredits`.
- Ngay ở lời gọi đầu tiên, CLI tự dựng thư mục nhà mới: `.sandbox/`, `.tmp/`, `tmp/`, `skills/`, `installation_id` và năm cơ sở dữ liệu SQLite (`goals_1`, `logs_2`, `memories_1`, `queue_1`, `state_5`). Chưa có `auth.json`, `config.toml` hay `sessions/`.

## 3. Sau khi đăng nhập tài khoản thứ hai

**Chưa đo ở bản này.** Lúc viết, chủ nhân chưa đăng nhập vào `codex-b/`. Script đã có sẵn các bước, chạy theo thứ tự này:

1. `codex login status` của hai thư mục. Điều cần thấy: thư mục thứ hai thoát 0.
2. `account/rateLimits/read` của hai thư mục, so từng trường. Điều cần thấy: `usedPercent`, `resetsAt` hay `planType` khác nhau, và có một trường mã tài khoản khác nhau giữa hai thư mục để làm dấu tài khoản. Lúc đo thư mục mặc định ở 11 % và 39 %.
3. `hooks/list` cho `plot/` trong thư mục thứ hai. Điều cần thấy: không có hook nào của chủ nhân.
4. Một phiên `exec --json` một câu trên `gpt-6-luna` mức `low` với các cờ của adapter (`--ignore-user-config`, `--skip-git-repo-check`, sandbox `read-only`, `windows.sandbox="mxc"`). Điều cần thấy: phiên trả lời, và `sessions/` xuất hiện trong thư mục thứ hai.
5. `exec resume <id>` một câu, nhờ model chạy một lệnh `echo`. Điều cần thấy: cùng mã phiên, và lệnh chạy được trong sandbox `mxc` với thư mục nhà mới.

Nếu bước 2 cho thấy số đo là của thư mục mặc định thì PS-27c không làm được theo cách này.

## 4. Đề xuất cho adapter (PS-27c)

- Adapter đặt `CODEX_HOME` cho mọi tiến trình của tộc qua `codexEnv`, và gỡ biến đó khi dòng không khai thư mục. Cờ của phiên giữ nguyên.
- `doctor()` hỏi `codex app-server` một lần: `codexHome` của `initialize` cho biết CLI có nghe biến không.
- CLI tự dựng mọi thứ trong thư mục nhà (cơ sở dữ liệu SQLite, `.sandbox/`, `skills/`). Elvaria không tạo, không dọn và không đọc chúng.
- Thư mục nhà của chi theo cùng quy ước với Claude: cạnh kho bảo vật, `~/.elvaria/accounts/<id tộc>/`.

## 5. Chưa đo

- **Mục 3 ở trên.**
- **Hai lệnh so sánh có để lại gì trong `~/.codex` không.** Spike không liệt kê thư mục mặc định. Hai lệnh đó là đúng hai lệnh adapter chạy mỗi lần `doctor` và mỗi lần thăm dò **[code]**, nên chúng không thêm loại dấu nào mới.
- **macOS.** Theo spike Codex, đăng nhập là file `auth.json` trong thư mục nhà (kho lưu `file`), nên suy ra không có chuyện Keychain như Claude Code **[suy]**.
- **Hook của chủ nhân trong thư mục nhà thứ hai.** Thư mục mới không có `config.toml`; nếu sau này chủ nhân thêm hook vào đó thì phép kiểm trước phiên của adapter từ chối phiên, như với thư mục mặc định **[code]**.
