# Spike · Tài khoản thứ hai của Claude Code trong một thư mục cấu hình riêng (docs/plan-sibling-tribes)

Ngày: 2026-11-17 · Máy: Windows 11 Pro (10.0.26200), Node 24.22.1 · CLI: Claude Code 2.1.325 (bản đi kèm extension VS Code, `claude.exe`) · Tài khoản: thư mục mặc định đăng nhập claude.ai gói `team`; thư mục thứ hai do chủ nhân tự đăng nhập bằng một tài khoản claude.ai khác, gói `pro`.

Spike trả lời các câu của ý (5) trong dòng §11 "tài khoản thứ hai của cùng một CLI" ([§11, 2026-11-17](../implementation-plan/11-2026-11-17.md)), để lập [kế hoạch chi của tộc](../plans/sibling-tribes.md) (PS-27, PS-27b). Mẫu: spike [Claude](claude-2026-11.md) và spike [đọc ảnh](vision-2026-11-17.md). Điều đã có ở spike Claude (P1-02) thì ở đây chỉ nhắc lại khi đo lại trên 2.1.325.

Nguồn của từng dòng: **[máy]** đã chạy trên máy này ngày 2026-11-17; **[P1-02]** spike Claude, đo trên 2.1.318; **[code]** code của Elvaria ở `main` `fc4a2a1`; **[suy]** suy luận, chưa đo.

**Chi phí.** Một phiên thật: một lượt `haiku` một câu, không tool, trong thư mục thứ hai, `total_cost_usd` 0,00063 (2 token vào, 3 125 token ghi cache, 649 token đọc cache, 4 token ra). Mọi lệnh khác không gọi model (`num_turns: 0`, `total_cost_usd: 0`): `--version` một lần, `auth status --json` mười hai lần, `-p /usage` tám lần, `-p /context` hai lần, `purge --dry-run` bảy lần và `purge --yes` hai lần. Chủ nhân đã cho phép cả loạt lệnh này trước khi chạy.

---

## 0. Cách đo

- Thư mục spike nằm ngoài repo và ngoài `~/.claude`: `elvaria-worktrees/sibling-spike/`, gồm `config-b/` (thư mục cấu hình thứ hai), `plot/` (thư mục rỗng làm cwd của mọi lệnh) và một script Node. Đường dẫn có dấu cách ("Kingdom of Agents"), như một vương quốc thật trên máy này. Chủ nhân xóa thư mục này sau khi kế hoạch được chốt.
- Script gọi CLI đúng như adapter `claude_code` gọi **[code]**: `spawn` không shell, stdin đóng ngay, env chỉ gồm 14 tên của `MINIMAL_ENV_NAMES` (`packages/runner-core/src/treasury/minimal-env.ts`), cộng `CLAUDE_CONFIG_DIR` khi đo thư mục thứ hai. Các lệnh `-p` mang đúng các cờ của adapter: `--output-format stream-json --verbose --setting-sources project,local --strict-mcp-config`.
- Chủ nhân tự đăng nhập vào `config-b/` trong một cửa sổ PowerShell riêng: đặt `$env:CLAUDE_CONFIG_DIR` rồi chạy `claude auth login`. Phiên đo không chạm credential.
- Script không mở file nào trong hai thư mục cấu hình. Nó chỉ liệt kê tên và kích thước trong `config-b/`. Mọi thứ in ra đã che email, mã dạng UUID và thư mục nhà. Với `auth status --json`, script in tên trường, in giá trị của các trường không nêu danh ai (`loggedIn`, `authMethod`, `apiProvider`, `subscriptionType`, `loginExpiresAt`), và với các trường còn lại chỉ in độ dài cùng kết quả so sánh giữa hai thư mục.
- Thư mục mặc định bị gọi bằng ba lệnh: `auth status --json`, `-p /usage` và `purge --dry-run`. Hai lệnh đầu và cuối không đổi gì. Riêng `-p /usage` **có để lại dấu**: mỗi lần chạy ghi một transcript nhỏ vào `~/.claude/projects/<cwd đã mã hóa>/` (mục 3.5). Bốn lần chạy của spike để lại thư mục `…-sibling-spike-plot` ở đó; chủ nhân cho phép dọn, và `claude purge --yes <plot>` với thư mục mặc định đã xóa đúng một thư mục đó (`Purged 1 item(s)`); `purge --dry-run` sau đó lại trả "No Claude Code project state found".

## 1. Tóm tắt

| Câu của ý (5) | Kết quả | Hệ quả cho PS-27 |
|---|---|---|
| Đăng nhập vào một thư mục cấu hình riêng rồi chạy `-p` | **Chạy được.** Thư mục rỗng là chưa đăng nhập, độc lập với thư mục mặc định. Sau khi chủ nhân đăng nhập, một phiên `-p` với đúng các cờ của adapter trả lời bình thường. Đăng nhập (`.credentials.json`), transcript, `.claude.json` và `backups/` đều nằm trong thư mục riêng **[máy]** | Mỗi dòng `tribes[]` một thư mục là đủ để tách tài khoản |
| `rate_limit_event` và `/usage` có đọc đúng tài khoản của thư mục đó không | **Có.** `/usage` của thư mục thứ hai báo 0 % và 6 %, của thư mục mặc định báo 12 %, 40 % và 21 %. `rate_limit_event` của phiên trong thư mục thứ hai mang `seven_day.utilization: 0.06` **[máy]** | Phần mana không đổi: số đo của một dòng là của tài khoản dòng đó |
| `auth status --json` có đủ để `doctor` nhận ra hai dòng trỏ cùng một tài khoản không | **Đủ.** Khi đã đăng nhập, lệnh trả `email`, `orgId`, `orgName`, `subscriptionType`, `planTier`; `configDirectory` có ở mọi trạng thái. Hai thư mục khác nhau ở cả `email` lẫn `orgId` **[máy]** | `ToolInfo.account` là chuỗi băm của `email` và `orgId`; `ToolInfo.config_dir` là `configDirectory` |
| Phiên chạy với thư mục mới có nạp settings và `CLAUDE.md` cấp người dùng không | **Không nạp gì** từ `~/.claude`, có hay không có `--setting-sources project,local` **[máy]**. Phiên của Elvaria vốn luôn có cờ đó **[code]** | Hai dòng chạy giống nhau; không cần chép gì sang thư mục mới |
| Tên mục Keychain trên macOS | **Chưa đo** (máy đo là Windows; mục 5). Trên Windows đăng nhập là file `.credentials.json` trong thư mục cấu hình **[máy]** | Luật "hai dòng không chung tài khoản" của `doctor` là lưới an toàn cho macOS |
| `purge` với thư mục riêng (câu hỏi của phiên kế hoạch) | `purge --yes` trong thư mục thứ hai xóa đúng thư mục transcript của nó. Câu "không có gì để xóa" khớp chuỗi trong `forget.ts` **[máy]** | `createClaudeForget` chỉ cần env có biến; mỗi dòng Claude một `forget` |

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

Mọi dòng của mục này là **[máy]**, trừ chỗ ghi khác.

### 3.1 `auth status --json`

- Thư mục thứ hai thoát 0: `loggedIn: true`, `authMethod: "claude.ai"`, `subscriptionType: "pro"`, `loginExpiresAt` là 2026-12-17, và `configDirectory` là đúng thư mục đã cho trong `CLAUDE_CONFIG_DIR`.
- So từng trường với thư mục mặc định: `email`, `orgId`, `orgName`, `subscriptionType`, `planTier`, `loginExpiresAt`, `configDirectory` và `projectsDirectory` khác nhau; các trường còn lại giống nhau.
- Thư mục mặc định không đổi gì sau lần đăng nhập thứ hai: vẫn `loggedIn: true`, cùng `loginExpiresAt` (2026-11-29) như trước đó.
- Trên Windows, đăng nhập của thư mục riêng là file `.credentials.json` (584 byte) nằm ngay trong thư mục đó. Spike chỉ ghi tên và kích thước, không mở file.

### 3.2 `-p /usage`

| Thư mục | Current session | Current week (all models) | Dòng theo model |
|---|---|---|---|
| thứ hai (`pro`) | 0 % used, không có phần "resets" | 6 % used · resets Nov 23, 2:59am | không có |
| mặc định (`team`) | 12 % used · resets Nov 17, 10:19pm | 40 % used · resets Nov 22, 7:59pm | Current week (Fable): 21 % |

- Cả hai lần đều `num_turns: 0` và chi phí 0. Hai thư mục cho hai bộ số và hai giờ reset khác nhau, nên `/usage` đọc tài khoản của thư mục đang dùng.
- Tài khoản `pro` không có dòng theo model, và cửa sổ phiên chưa bắt đầu thì không có phần "resets". `usageWindowsOf` đã xử lý dòng không có giờ reset **[code]** (`usage.spec.ts` có ca `0% used`).

### 3.3 Một phiên và `rate_limit_event`

- Lệnh: `-p "Reply with the single word ok." --output-format stream-json --verbose --model haiku --max-turns 1 --tools "" --setting-sources project,local --strict-mcp-config`, tức đúng `pingArgv` của adapter **[code]**, với `CLAUDE_CONFIG_DIR` là thư mục thứ hai. Phiên thoát 0 sau 2,9 giây và trả `ok`.
- Stream có bốn dòng: `system/init`, `assistant`, `rate_limit_event`, `result/success`. Dòng `init` ghi `apiKeySource: "none"` và `model: "claude-haiku-5-5"`.
- `rate_limit_event`: `status: "allowed"`, `rateLimitType: "five_hour"`, `unifiedWindows.five_hour.utilization: 0`, `unifiedWindows.seven_day.utilization: 0.06`, mỗi cửa sổ có `resetsAt` riêng; `overageStatus: "rejected"` với `overageDisabledReason: "org_level_disabled"`. Con số 0,06 khớp 6 % của `/usage` ở thư mục thứ hai, không khớp 40 % của thư mục mặc định.
- `/usage` của thư mục thứ hai ngay sau phiên vẫn báo 0 % và 6 %: một lượt `haiku` không làm số đo nhích.

### 3.4 `purge`

- Trước khi dọn, thư mục thứ hai có bảy transcript của `plot/` (các lần `/context`, `/usage` và phiên `haiku`, phiên này 45 KB).
- `claude purge --yes <plot>` với thư mục thứ hai thoát 0 và in `Purged 1 item(s) for <plot>.` Sau đó `projects/` của thư mục thứ hai trống. Thư mục mặc định không bị chạm.

### 3.5 Lệnh thăm dò để lại transcript

- Trước lần `/usage` đầu tiên, `purge --dry-run <plot>` với thư mục mặc định trả "No Claude Code project state found". Sau các lần `/usage` chạy với thư mục mặc định, cùng lệnh thoát 0 và liệt kê `~/.claude/projects/…-sibling-spike-plot`. Vậy mỗi lần `-p /usage` ghi một transcript (khoảng 3 KB) vào thư mục cấu hình đang dùng, dưới tên của cwd.
- Hệ quả cho Elvaria **[code]**: lần thăm dò của adapter chạy với cwd là thư mục tạm của hệ thống (`claudeTool`: `workDir ?? tmpdir()`), mỗi 15 phút và sau mỗi phiên, nên transcript của thăm dò dồn lại trong `<thư mục cấu hình>/projects/<thư mục tạm đã mã hóa>/` của từng dòng. Điều này đã có từ trước với thư mục mặc định và không do chi gây ra. Kế hoạch ghi nó thành gợi ý cho một task sau.

## 4. Đề xuất cho adapter (PS-27)

- Adapter đặt `CLAUDE_CONFIG_DIR` cho mọi tiến trình của tộc và không cần gì khác: không cờ dòng lệnh nào đổi thư mục cấu hình, và các cờ của phiên giữ nguyên.
- `doctor()` đọc `configDirectory` để chắc CLI đã nghe biến, và băm `email` cùng `orgId` thành dấu tài khoản. Hai trường đó không được in hay ghi ra đâu.
- CLI tự tạo `.claude.json`, `backups/`, `projects/`, `plugins/` và `sessions/` trong thư mục. Elvaria không tạo, không dọn và không đọc chúng; `purge` là lệnh của CLI.
- Thư mục cấu hình không được nằm trong vương quốc hay lãnh thổ, vì nó chứa đăng nhập và transcript. Chỗ theo quy ước là cạnh kho bảo vật, `~/.elvaria/accounts/<id tộc>/` (chủ nhân chốt mục CT15 của kế hoạch). Thư mục `config-b/` của spike chỉ là chỗ nháp.

## 5. Chưa đo

- **macOS: tên mục Keychain.** Ghi chú của chủ nhân nêu rằng mã của Orca đặt tên mục theo hash của chuỗi đường dẫn; chưa kiểm trên Claude Code. Cách đo khi có máy macOS, không lệnh nào in mật khẩu:
  1. `security dump-keychain` (không có `-d`) lọc các dòng có chữ "claude", trước và sau khi đăng nhập vào một thư mục riêng, để ghi tên dịch vụ và tên tài khoản của mục mới.
  2. Đăng nhập hai thư mục bằng hai tài khoản rồi chạy `auth status --json` cho từng thư mục: mỗi thư mục phải trả tài khoản của mình.
  3. Đổi tên thư mục rồi chạy lại `auth status --json`: nếu tên mục theo hash của đường dẫn thì đăng nhập mất, và `doctor` sẽ báo chưa đăng nhập.
  4. Viết cùng một thư mục theo hai cách (có `/` ở cuối, qua một symlink) và xem hai cách có dùng chung một mục không.
- **Chép hay đổi tên thư mục trên Windows**: chưa thử. Vì đăng nhập là một file trong thư mục, suy ra thư mục đổi tên vẫn còn đăng nhập **[suy]**.
- **Đăng nhập hết hạn giữa chừng** ở một dòng: chưa thấy. `loginExpiresAt` của `auth status` đã được `doctor` cảnh báo trước bảy ngày **[code]**, và điều đó áp cho từng dòng.
- **Hai phiên của hai thư mục chạy cùng lúc**: chưa đo riêng. Mỗi thư mục có `.claude.json` của mình nên không có file chung nào được biết tới **[suy]**. Trong lúc đo, các phiên của chủ nhân vẫn chạy trên thư mục mặc định và không lỗi.
- **Dòng `rate_limit_event` bị từ chối** (`status` khác `allowed`) của tài khoản thứ hai: chưa thấy, như ở thư mục mặc định (ADR 0009).

## 6. Script

Script đo không nằm trong repo. Nó có tám bước: `version`, `auth`, `usage`, `ping`, `context`, `purge-dry`, `purge`, `ls`. Mỗi bước là một hay hai lời gọi `claude.exe` như mục 0 mô tả, và in kết quả đã che. Phiên làm PS-27 không cần script này: CLI giả của `runner-claude` nhận các nút mới ghi ở kế hoạch, và phép kiểm với CLI thật là `elvaria tribe check` của chi.
