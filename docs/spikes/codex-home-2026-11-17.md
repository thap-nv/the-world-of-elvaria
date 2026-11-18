# Spike · Tài khoản thứ hai của Codex trong một `CODEX_HOME` riêng (docs/plan-sibling-tribes)

Ngày: 2026-11-17 · Máy: Windows 11 Pro (10.0.26200), Node 24.22.1 · CLI: Codex 0.169.0-alpha.11.1 (bản đi kèm extension VS Code `openai.chatgpt` 26.1111.21308, `codex.exe`) · Tài khoản: thư mục mặc định đăng nhập ChatGPT gói `plus`; thư mục thứ hai đăng nhập một tài khoản ChatGPT thứ hai của chủ nhân, cũng gói `plus`.

Chủ nhân hỏi chi cho Codex có làm được không, để làm cùng chi cho Claude (mục CT10 của [kế hoạch chi của tộc](../plans/sibling-tribes.md)). Spike này đo điều [spike Codex](codex-2026-11-12.md) mới chỉ suy từ tài liệu: Codex chạy thế nào khi `CODEX_HOME` trỏ sang một thư mục khác. Phép đo cùng loại cho Claude Code ở [spike thư mục cấu hình](claude-config-dir-2026-11-17.md).

Nguồn của từng dòng: **[máy]** đã chạy trên máy này ngày 2026-11-17; **[spike Codex]** spike 2026-11-12; **[code]** code của Elvaria ở `main` `fc4a2a1`; **[suy]** suy luận, chưa đo.

**Chi phí.** Hai lượt một câu trên `gpt-6-luna` mức `low` (mục 3.3): lượt đầu 10 125 token vào và 5 token ra, lượt sau 30 513 token vào (19 968 từ cache) và 58 token ra. Số đo của tài khoản thứ hai vẫn là 0 % sau hai lượt đó. Các lệnh còn lại không gọi model: `codex --version` một lần, `codex login status` mười bốn lần (bảy lượt, mỗi lượt hai thư mục) và `codex app-server` tám lần (một lần chỉ `initialize`, sáu lần `account/rateLimits/read` chia đều cho hai thư mục, một lần `hooks/list`). Chủ nhân đã cho phép cả loạt lệnh này trước khi chạy.

---

## 0. Cách đo

- Thư mục thứ hai là `elvaria-worktrees/sibling-spike/codex-b/`, ngoài repo và ngoài `~/.codex`; cwd của mọi lệnh là thư mục rỗng `plot/` cạnh đó. Chủ nhân xóa cả thư mục spike khi không cần nữa.
- Script gọi `codex.exe` như adapter `codex_cli` gọi **[code]**: `spawn` không shell, env chỉ gồm 14 tên của `MINIMAL_ENV_NAMES`, cộng `CODEX_HOME` khi đo thư mục thứ hai. `codex app-server` được hỏi qua JSON-RPC trên stdio, từng lời gọi một, như `packages/runner-codex/src/app-server.ts`.
- Chủ nhân tự đăng nhập: đặt `$env:CODEX_HOME` trong một cửa sổ PowerShell riêng rồi chạy `codex login`. Phiên đo không chạm credential.
- Script không mở file nào trong hai thư mục nhà; nó chỉ liệt kê tên và kích thước trong `codex-b/`. Mọi thứ in ra đã che email, mã dạng UUID và thư mục nhà; các trường có tên kết thúc bằng `id` chỉ in độ dài và kết quả so sánh giữa hai thư mục.
- Thư mục mặc định chỉ bị gọi bằng `codex login status` và `account/rateLimits/read`, là hai lệnh adapter vốn chạy khi `doctor` và khi thăm dò **[code]**. Mọi phiên của spike chạy trong thư mục thứ hai.

## 1. Tóm tắt

| Câu hỏi | Kết quả | Hệ quả cho PS-27c |
|---|---|---|
| `CODEX_HOME` có tách đăng nhập không | **Có.** Thư mục rỗng là `Not logged in`, thoát 1, trong khi thư mục mặc định vẫn đăng nhập **[máy]** | Mỗi dòng `tribes[]` một thư mục nhà là đủ để tách tài khoản |
| Adapter có biết CLI đang dùng thư mục nào không | **Có.** `initialize` của `codex app-server` trả `codexHome` **[máy]** | `ToolInfo.config_dir` là `codexHome`; khác thư mục đã cho thì `doctor` báo lỗi |
| Thăm dò ở thư mục chưa đăng nhập | Lỗi rõ: "codex account authentication required to read rate limits" **[máy]** | `probe()` trả `error`, không cần sửa |
| Hạn mức của tài khoản thứ hai có tách riêng không | **Có.** Thư mục thứ hai đọc 0 % và 0 %, thư mục mặc định đọc 11 % và 39 %, và `resetsAt` của hai bên khác nhau **[máy]** | Mỗi dòng là một bể mana thật; lần thăm dò của adapter không cần sửa |
| Mã tài khoản lấy từ đâu | `accountId` ở gốc kết quả `account/rateLimits/read`, 36 ký tự, khác nhau giữa hai thư mục **[máy]** | Dấu tài khoản là chuỗi băm của `accountId` (mục CT17 của kế hoạch); không cần lời gọi nào khác |
| Phiên, `exec resume` và sandbox `mxc` trong thư mục mới | **Chạy được.** Rollout nằm trong `sessions/` của thư mục thứ hai, `exec resume` tìm lại đúng phiên, và một lệnh `echo` chạy qua sandbox **[máy]** | Adapter không đổi cờ nào của phiên |
| Hook của chủ nhân trong thư mục mới | Không có: `hooks/list` trả danh sách rỗng **[máy]** | Phép kiểm hook trước phiên cho qua |

## 2. `CODEX_HOME` mới, trước khi đăng nhập

Mọi dòng của mục này là **[máy]**.

- `codex --version` in `codex-cli 0.169.0-alpha.11.1`, đúng phiên bản `.claude/rules/runner.md` ghi.
- `CODEX_HOME=<thư mục rỗng> codex login status` thoát 1 và in `Not logged in` ra stderr. Cùng lệnh với thư mục mặc định thoát 0 và in `Logged in using ChatGPT`, cũng ra stderr. `doctorCodex` đọc cả stdout lẫn stderr nên không bị ảnh hưởng **[code]**.
- `codex app-server`, lời gọi `initialize`, trả `userAgent`, `codexHome`, `platformFamily` và `platformOs`. `codexHome` là đúng thư mục đã cho trong `CODEX_HOME`. Đây là chỗ adapter biết CLI có nghe biến không.
- `account/rateLimits/read` ở thư mục chưa đăng nhập trả lỗi JSON-RPC `-32600`, "codex account authentication required to read rate limits". Lần thăm dò của adapter vì thế trả `error` **[code]**, không im lặng.
- Cùng lời gọi với thư mục mặc định trả `rateLimits.primary` (300 phút, `usedPercent` 11) và `rateLimits.secondary` (10080 phút, `usedPercent` 39), `planType: "plus"`, cùng `rateLimitsByLimitId.codex` và `rateLimitResetCredits`.
- Ngay ở lời gọi đầu tiên, CLI tự dựng thư mục nhà mới: `.sandbox/`, `.tmp/`, `tmp/`, `skills/`, `installation_id` và năm cơ sở dữ liệu SQLite (`goals_1`, `logs_2`, `memories_1`, `queue_1`, `state_5`). Chưa có `auth.json`, `config.toml` hay `sessions/`.

## 3. Sau khi đăng nhập tài khoản thứ hai

Chủ nhân đăng nhập một tài khoản ChatGPT thứ hai vào `codex-b/` bằng `codex login`. Mọi dòng của mục này là **[máy]**, trừ chỗ ghi khác.

### 3.1 Đăng nhập, hạn mức và mã tài khoản

- `codex login status` của thư mục thứ hai thoát 0 và in `Logged in using ChatGPT` ra stderr, giống hệt thư mục mặc định. Lệnh này không nêu tài khoản nào, nên `doctor` không phân biệt được hai tài khoản bằng nó.
- `account/rateLimits/read` trả hai bộ số khác nhau cho hai thư mục:

| Trường | Thư mục thứ hai | Thư mục mặc định |
|---|---|---|
| `rateLimits.primary.usedPercent` (cửa sổ 300 phút) | 0 | 11 |
| `rateLimits.secondary.usedPercent` (cửa sổ 10080 phút) | 0 | 39 |
| `primary.resetsAt` và `secondary.resetsAt` | khác bên kia | khác bên kia |
| `rateLimits.planType` | `plus` | `plus` |
| `accountId` (ở gốc kết quả) | 36 ký tự | 36 ký tự, khác bên kia |
| `rateLimitResetCredits.credits[0]`: `id`, `grantedAt`, `expiresAt` | khác bên kia | khác bên kia |

- Các trường còn lại giống nhau ở hai bên: `limitId`, `windowDurationMins`, `credits`, `ordinaryUsageAllowed`, `spendControlReached`. Hai tài khoản cùng gói nên `planType` không phân biệt được chúng.
- `accountId` nằm ở gốc kết quả, cạnh `rateLimits`. Script chỉ in độ dài của nó và kết quả so sánh, không in giá trị. Đây là lời gọi adapter đã dùng để thăm dò **[code]**, nên dấu tài khoản không cần lời gọi mới nào. Spike không gọi `account/read`.
- Sau hai lượt ở mục 3.3, thư mục thứ hai vẫn đọc 0 % và 0 %, thư mục mặc định vẫn đọc 11 % và 39 %. Hai lượt đó quá nhỏ để đổi số phần trăm của bên nào, nên spike không cho thấy trực tiếp phiên trừ vào bể nào (mục 5).

### 3.2 Hook

- `hooks/list` cho `plot/` với thư mục thứ hai trả một mục cho cwd đó, với `hooks`, `warnings` và `errors` đều rỗng. Phép kiểm hook trước phiên của adapter vì thế cho qua **[code]**.

### 3.3 Phiên, `exec resume` và sandbox

Cả hai lượt dùng đúng cờ của adapter **[code]**: `--json --ignore-user-config --skip-git-repo-check`, tắt `plugins`, `apps` và `image_generation`, `approval_policy="never"`, `sandbox_mode="read-only"`, `windows.sandbox="mxc"`, `history.persistence="none"`, `web_search="disabled"`, prompt qua stdin.

- **`exec`, một câu.** Tiến trình thoát 0 sau khoảng 8 giây. Dòng event gồm `thread.started`, `turn.started`, `item.completed` (`agent_message`, nội dung "ok") và `turn.completed`.
- **`exec resume <mã phiên>`, nhờ model chạy `echo elvaria-sibling`.** Tiến trình thoát 0 sau khoảng 15 giây, và `thread.started` mang đúng mã phiên của lượt trước. Item `command_execution` chạy `powershell.exe -NoProfile -Command 'echo elvaria-sibling'`, `exit_code` 0, in đúng chuỗi đó. Gần 20 000 token vào đến từ cache, tức lượt sau nối tiếp đúng phiên trước.
- **Rollout nằm trong thư mục thứ hai**: `codex-b/sessions/2026/11/17/rollout-<ngày giờ>-<mã phiên>.jsonl`, khoảng 94 KB sau hai lượt. `exec resume` tìm phiên ở đó, nên một phiên chỉ nối lại được dưới đúng thư mục nhà đã sinh ra nó.
- Sandbox `mxc` chạy được lệnh khi thư mục nhà là thư mục mới. CLI tự dựng `.sandbox/` trong thư mục đó; adapter không phải chuẩn bị gì.

### 3.4 Thư mục nhà sau khi đăng nhập và hai lượt

So với mục 2, thư mục thứ hai có thêm `auth.json` (4378 B), `auth.json.lock`, `auth.lock`, `.sandbox_migration`, `models_cache.json` (khoảng 465 KB), `thread_history_1.sqlite`, `log/`, `sessions/` và `thread-writer-locks/`. Đăng nhập là file `auth.json` trong thư mục nhà, đúng như spike Codex ghi **[spike Codex]**. Thư mục vẫn không có `config.toml`: mọi cấu hình của phiên đi qua `-c`.

## 4. Đề xuất cho adapter (PS-27c)

- Adapter đặt `CODEX_HOME` cho mọi tiến trình của tộc qua `codexEnv`, và gỡ biến đó khi dòng không khai thư mục. Cờ của phiên giữ nguyên.
- `doctor()` hỏi `codex app-server` một lần, hai lời gọi: `codexHome` của `initialize` cho biết CLI có nghe biến không, và `accountId` của `account/rateLimits/read` là nguồn của dấu tài khoản. Thư mục chưa đăng nhập thì lời gọi sau trả lỗi và dòng đó không có dấu.
- CLI tự dựng mọi thứ trong thư mục nhà (cơ sở dữ liệu SQLite, `.sandbox/`, `skills/`, `sessions/`). Elvaria không tạo, không dọn và không đọc chúng.
- Thư mục nhà của chi theo cùng quy ước với Claude: cạnh kho bảo vật, `~/.elvaria/accounts/<id tộc>/`.

## 5. Chưa đo

- **Phiên trừ vào bể của tài khoản nào.** Hai lượt một câu không đổi số phần trăm của bên nào. Điều đã đo là hai thư mục mang hai `accountId` và hai bộ số đo, và phiên chạy với đăng nhập của thư mục nó được trỏ vào **[suy]**. Lần `tribe check` thật của PS-27c dùng nhiều hơn và đọc lại số đo của cả hai dòng.
- **Hai lệnh so sánh có để lại gì trong `~/.codex` không.** Spike không liệt kê thư mục mặc định. Hai lệnh đó là đúng hai lệnh adapter chạy mỗi lần `doctor` và mỗi lần thăm dò **[code]**, nên chúng không thêm loại dấu nào mới.
- **macOS.** Đăng nhập là file `auth.json` trong thư mục nhà (kho lưu `file`), nên suy ra không có chuyện Keychain như Claude Code **[suy]**.
- **Hook của chủ nhân trong thư mục nhà thứ hai.** Thư mục mới không có `config.toml`; nếu sau này chủ nhân thêm hook vào đó thì phép kiểm trước phiên của adapter từ chối phiên, như với thư mục mặc định **[code]**.

## 6. Script

Script đo không nằm trong repo. Nó có tám bước: `version`, `login`, `init`, `limits`, `hooks`, `exec`, `resume` và `ls`. Mỗi bước là một hay hai lời gọi `codex.exe` như mục 0 mô tả, và in kết quả đã che. Phiên làm PS-27c không cần script này: CLI giả của `runner-codex` nhận các nút mới ghi ở kế hoạch, và phép kiểm với CLI thật là `elvaria tribe check` của chi.
