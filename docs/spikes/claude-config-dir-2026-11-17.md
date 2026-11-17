# Spike · Tài khoản thứ hai của Claude Code trong một thư mục cấu hình riêng (docs/plan-sibling-tribes)

Ngày: 2026-11-17 · Máy: Windows 11 Pro (10.0.26200), Node 24.22.1 · CLI: Claude Code 2.1.325 (bản đi kèm extension VS Code, `claude.exe`) · Tài khoản: thư mục mặc định đăng nhập claude.ai gói `team`; thư mục thứ hai do chủ nhân tự đăng nhập bằng một tài khoản Claude khác.

Spike trả lời các câu của ý (5) trong dòng §11 "tài khoản thứ hai của cùng một CLI" ([§11, 2026-11-17](../implementation-plan/11-2026-11-17.md)), để lập [kế hoạch chi của tộc](../plans/sibling-tribes.md) (PS-27, PS-27b). Mẫu: spike [Claude](claude-2026-11.md) và spike [đọc ảnh](vision-2026-11-17.md). Điều đã có ở spike Claude (P1-02) thì ở đây chỉ nhắc lại khi đo lại trên 2.1.325.

Nguồn của từng dòng: **[máy]** đã chạy trên máy này ngày 2026-11-17; **[P1-02]** spike Claude, đo trên 2.1.318; **[code]** code của Elvaria ở `main` `fc4a2a1`; **[suy]** suy luận, chưa đo.

**Chi phí.** Không lệnh nào ở bản này gọi model: mọi lệnh `-p` trả `num_turns: 0` và `total_cost_usd: 0`. Đã chạy `--version` một lần, `auth status --json` tám lần (bốn lượt, mỗi lượt hai thư mục), `-p /usage` hai lần, `-p /context` hai lần và `purge --dry-run` hai lần. Chủ nhân đã cho phép cả loạt lệnh này và một phiên haiku một câu cho mục 3.

---

## 0. Cách đo

- Thư mục spike nằm ngoài repo và ngoài `~/.claude`: `elvaria-worktrees/sibling-spike/`, gồm `config-b/` (thư mục cấu hình thứ hai), `plot/` (thư mục rỗng làm cwd của mọi lệnh) và một script Node. Đường dẫn có dấu cách ("Kingdom of Agents"), như một vương quốc thật trên máy này. Chủ nhân xóa thư mục này sau khi kế hoạch được chốt.
- Script gọi CLI đúng như adapter `claude_code` gọi **[code]**: `spawn` không shell, stdin đóng ngay, env chỉ gồm 14 tên của `MINIMAL_ENV_NAMES` (`packages/runner-core/src/treasury/minimal-env.ts`), cộng `CLAUDE_CONFIG_DIR` khi đo thư mục thứ hai. Các lệnh `-p` mang đúng các cờ của adapter: `--output-format stream-json --verbose --setting-sources project,local --strict-mcp-config`.
- Chủ nhân tự đăng nhập vào `config-b/` trong một cửa sổ PowerShell riêng: đặt `$env:CLAUDE_CONFIG_DIR` rồi chạy `claude auth login`. Phiên đo không chạm credential.
- Script không mở file nào trong hai thư mục cấu hình. Nó chỉ liệt kê tên và kích thước trong `config-b/`. Mọi thứ in ra đã che email, mã dạng UUID và thư mục nhà. Với `auth status --json`, script in tên trường, in giá trị của các trường không nêu danh ai (`loggedIn`, `authMethod`, `apiProvider`, `subscriptionType`, `loginExpiresAt`), và với các trường còn lại chỉ in độ dài cùng kết quả so sánh giữa hai thư mục.
- Thư mục mặc định chỉ bị gọi bằng ba lệnh không đổi gì: `auth status --json`, `-p /usage` và `purge --dry-run`.

## 1. Tóm tắt

| Câu của ý (5) | Kết quả | Hệ quả cho PS-27 |
|---|---|---|
| Đăng nhập vào một thư mục cấu hình riêng rồi chạy `-p` | Thư mục rỗng là chưa đăng nhập, độc lập với thư mục mặc định. Transcript, `.claude.json` và `backups/` nằm trong thư mục riêng **[máy]**. Chạy `-p` sau khi đăng nhập: **chưa đo** (mục 3) | Mỗi dòng `tribes[]` một thư mục là đủ để tách tài khoản |
| `rate_limit_event` và `/usage` có đọc đúng tài khoản của thư mục đó không | **Chưa đo** (mục 3). `/usage` ở thư mục chưa đăng nhập thoát 0 và không có dòng cửa sổ nào **[máy]** | PS-27 giả định là có; phép đo ở mục 3 phải xong trước khi chủ nhân giao việc cho chi |
| `auth status --json` có đủ để `doctor` nhận ra hai dòng trỏ cùng một tài khoản không | **Đủ**: có `email` và `orgId` khi đã đăng nhập, và `configDirectory` ở mọi trạng thái **[máy]** | `ToolInfo.account` là chuỗi băm của `email` và `orgId`; `ToolInfo.config_dir` là `configDirectory` |
| Phiên chạy với thư mục mới có nạp settings và `CLAUDE.md` cấp người dùng không | **Không nạp gì** từ `~/.claude`, có hay không có `--setting-sources project,local` **[máy]**. Phiên của Elvaria vốn luôn có cờ đó **[code]** | Hai dòng chạy giống nhau; không cần chép gì sang thư mục mới |
| Tên mục Keychain trên macOS | **Chưa đo** (máy đo là Windows; mục 5) | Luật "hai dòng không chung tài khoản" của `doctor` là lưới an toàn |
| `purge` với thư mục riêng (câu hỏi của phiên kế hoạch) | `purge --dry-run` theo đúng thư mục; câu "không có gì để xóa" khớp chuỗi trong `forget.ts` **[máy]** | `createClaudeForget` chỉ cần env có biến; mỗi dòng Claude một `forget` |

## 2. Thư mục cấu hình mới, trước khi đăng nhập

Mọi dòng của mục này là **[máy]**.

- `claude --version` in `2.1.325 (Claude Code)`, cùng phiên bản mà [cli-facts 2026-11-16](../reference/cli-facts-2026-11-16.md) ghi.
- `CLAUDE_CONFIG_DIR=<thư mục rỗng> claude auth status --json` thoát 1 và trả `loggedIn: false`, `authMethod: "none"`, `apiProvider: "firstParty"`, `loginExpiresAt: null`, cùng `configDirectory`, `projectsDirectory`, `analyticsDisabled` và `consoleProfileSignInOffered`. Kết quả khớp P1-02 (2.1.318). CLI tạo `.claude.json` và `backups/` trong thư mục đó.
- Cùng lệnh với thư mục mặc định thoát 0 và có thêm sáu trường: `email`, `orgId`, `orgName`, `subscriptionType`, `storedClaudeAiLogin`, `planTier`. Spike P1-02 chưa ghi các trường này.
- `-p /usage` trong thư mục chưa đăng nhập vẫn thoát 0, `num_turns: 0`, chi phí 0. Văn bản trả về là bảng chi phí của phiên ("Total cost: $0.0000", "Usage: 0 input, …"), **không** có dòng "Current session" hay "Current week" nào. Hệ quả **[code]**: `probeClaude` với `ping: false` trả `ok` mà không có số đo, vì nó chỉ coi là lỗi khi không có văn bản. Điều này cũng đúng với thư mục mặc định khi đăng nhập hết hạn, nên không phải lỗi riêng của chi; `doctor` là nơi bắt đăng nhập hỏng.
- `-p /context` trong `config-b/`, có và không có `--setting-sources project,local`: cả hai lần đều `num_turns: 0`, chi phí 0, **không có mục file nhớ nào** và chỉ có 13 skill dựng sẵn. `CLAUDE.md` và skill cấp người dùng của thư mục mặc định không xuất hiện. Như vậy một phiên chạy trong thư mục riêng không nạp gì từ `~/.claude`.
- Hai lần `/context` để lại hai transcript trong `config-b/projects/E--Works-Kingdom-of-Agents-elvaria-worktrees-sibling-spike-plot/` (tên thư mục là cwd đã mã hóa), cùng `memory/`, `plugins/`, `sessions/`. Transcript đi theo thư mục cấu hình, không vào `~/.claude/projects/`.
- `claude purge --dry-run <plot>` với `config-b/` thoát 0 và liệt kê đúng một thư mục, là thư mục transcript vừa nêu. Cùng lệnh với thư mục mặc định thoát 1 và in `No Claude Code project state found for <plot> under <thư mục nhà>\.claude.` Câu này bắt đầu bằng đúng chuỗi mà `purgeWorktree` coi là "không có gì để xóa" **[code]**.

## 3. Sau khi đăng nhập tài khoản thứ hai

**Chưa đo ở bản này.** Lúc viết, chủ nhân chưa đăng nhập vào `config-b/`. Script đã có sẵn ba bước, chạy theo thứ tự này khi thư mục đã đăng nhập:

1. `auth status --json` của hai thư mục, so từng trường. Điều cần thấy: thư mục thứ hai thoát 0, `configDirectory` là đúng thư mục đó, và `email` hay `orgId` khác thư mục mặc định.
2. `-p /usage` của hai thư mục (không gọi model). Điều cần thấy: ba dòng "Current session", "Current week (all models)" và dòng theo model của thư mục thứ hai mang số khác thư mục mặc định. Lúc đo thư mục mặc định đang ở 7 %, 39 % và 20 %.
3. Một phiên haiku một câu, không tool, trong thư mục thứ hai, với đúng các cờ của `pingArgv` **[code]**. Điều cần thấy: dòng `rate_limit_event` có `utilization` khớp `/usage` của thư mục thứ hai chứ không khớp thư mục mặc định, và transcript nằm trong `config-b/projects/`. Sau đó `purge --yes <plot>` trong thư mục thứ hai phải thoát 0 và in "Purged 1 item(s)".

Nếu bước 2 hay bước 3 cho thấy số đo là của thư mục mặc định thì cách làm của PS-27 không dùng được, và kế hoạch phải viết lại phần mana.

## 4. Đề xuất cho adapter (PS-27)

- Adapter đặt `CLAUDE_CONFIG_DIR` cho mọi tiến trình của tộc và không cần gì khác: không cờ dòng lệnh nào đổi thư mục cấu hình, và các cờ của phiên giữ nguyên.
- `doctor()` đọc `configDirectory` để chắc CLI đã nghe biến, và băm `email` cùng `orgId` thành dấu tài khoản. Hai trường đó không được in hay ghi ra đâu.
- CLI tự tạo `.claude.json`, `backups/`, `projects/`, `plugins/` và `sessions/` trong thư mục. Elvaria không tạo, không dọn và không đọc chúng; `purge` là lệnh của CLI.
- Thư mục cấu hình không được nằm trong vương quốc hay lãnh thổ, vì nó chứa đăng nhập và transcript. Chỗ theo quy ước là cạnh kho bảo vật, `~/.elvaria/accounts/<id tộc>/` (chủ nhân chốt mục CT15 của kế hoạch). Thư mục `config-b/` của spike chỉ là chỗ nháp.

## 5. Chưa đo

- **Mục 3 ở trên**: `/usage`, `rate_limit_event` và `purge --yes` với tài khoản thứ hai.
- **Nơi Windows giữ credential của một thư mục riêng.** Trước đăng nhập thư mục chỉ có `.claude.json` và `backups/`. Sau đăng nhập, liệt kê tên file (không mở) để biết credential là một file trong thư mục hay nằm ở kho của hệ điều hành.
- **macOS: tên mục Keychain.** Ghi chú của chủ nhân nêu rằng mã của Orca đặt tên mục theo hash của chuỗi đường dẫn; chưa kiểm trên Claude Code. Cách đo khi có máy macOS, không lệnh nào in mật khẩu:
  1. `security dump-keychain` (không có `-d`) lọc các dòng có chữ "claude", trước và sau khi đăng nhập vào một thư mục riêng, để ghi tên dịch vụ và tên tài khoản của mục mới.
  2. Đăng nhập hai thư mục bằng hai tài khoản rồi chạy `auth status --json` cho từng thư mục: mỗi thư mục phải trả tài khoản của mình.
  3. Đổi tên thư mục rồi chạy lại `auth status --json`: nếu tên mục theo hash của đường dẫn thì đăng nhập mất, và `doctor` sẽ báo chưa đăng nhập.
  4. Viết cùng một thư mục theo hai cách (có `/` ở cuối, qua một symlink) và xem hai cách có dùng chung một mục không.
- **Đăng nhập hết hạn giữa chừng** ở một dòng: chưa thấy. `loginExpiresAt` của `auth status` đã được `doctor` cảnh báo trước bảy ngày **[code]**, và điều đó áp cho từng dòng.
- **Hai phiên của hai thư mục chạy cùng lúc**: chưa đo riêng. Mỗi thư mục có `.claude.json` của mình nên không có file chung nào được biết tới **[suy]**.

## 6. Script

Script đo không nằm trong repo. Nó có tám bước: `version`, `auth`, `usage`, `ping`, `context`, `purge-dry`, `purge`, `ls`. Mỗi bước là một hay hai lời gọi `claude.exe` như mục 0 mô tả, và in kết quả đã che. Phiên làm PS-27 không cần script này: CLI giả của `runner-claude` nhận các nút mới ghi ở kế hoạch, và phép kiểm với CLI thật là `elvaria tribe check` của chi.
