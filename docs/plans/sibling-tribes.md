# Chi của tộc — PS-27 và PS-27b: kế hoạch chi tiết

Ngày: 2026-11-17 · Trạng thái: **đề xuất, chờ chủ nhân chốt** các mục CT1–CT15 ở cuối file ([§11, 2026-11-17](../implementation-plan/11-2026-11-17.md), dòng "docs/plan-sibling-tribes"). Kế hoạch này mở đường cho **chi** của một tộc: tài khoản thứ hai của cùng một CLI, khai thành một dòng `kingdom.tribes[]` nữa và có bể mana riêng. Nguồn đã chốt là dòng §11 cùng ngày "Người dùng chốt (trong phiên hỏi đáp -a9 …) cách thêm tài khoản thứ hai của cùng một CLI" (#200, `2ee9eec`); năm ý của dòng đó là bất biến ở đây và được nhắc lại ngay dưới. Phép đo đi trước nằm ở [spike thư mục cấu hình của Claude Code](../spikes/claude-config-dir-2026-11-17.md). Phần "Ai đọc" và "Mẫu dùng lại" ở đầu [phase-1.5.md](phase-1.5.md) áp dụng nguyên. Tên hàm, tên trường và các con số dưới đây là đề xuất khớp với code hiện có: phiên làm task được đổi cho hợp, miễn giữ hợp đồng, và ghi chỗ đổi vào §11. Chưa task nào dưới đây được mở; phiên điều phối quyết thứ tự và lúc mở.

## Năm ý đã chốt

Kế hoạch không bàn lại năm ý này. Mỗi mục phía dưới chỉ nói cách làm cho đúng chúng.

1. **Nguyên tắc 6.** Hai tài khoản của cùng một CLI là hai bể mana riêng và vẫn đúng tinh thần "mỗi tộc một tài khoản". Hệ thống không bao giờ tự xoay tài khoản.
2. **Dữ liệu.** Mỗi tài khoản là một dòng `kingdom.tribes[]` như ADR 0021. Có hai trường tùy chọn mới, nên `version` giữ 1. Trường `tool.config_dir` là thư mục cấu hình của CLI mà chủ nhân tự chọn và tự đăng nhập một lần. Adapter đặt nó vào `CLAUDE_CONFIG_DIR` cho mọi tiến trình của tộc đó. Mã Elvaria chỉ truyền đường dẫn, không đọc và không ghi bên trong. Trường `sibling_of` trỏ tới dòng gốc cùng adapter và chỉ phần hiển thị đọc nó. Không suy "cùng adapter thì cùng tộc".
3. **Tầng việc.** Mỗi chi được coi như một tộc khác: bể mana, ngủ và thức, `budget`, `max_concurrent` và nhân vật đều riêng. Chuyển việc giữa hai chi theo đúng luật giữa hai tộc. Không chuyển nhân vật giữa hai chi. Luật tách vai đọc họ model, nên người chấm ở chi kia không được tính là "khác họ".
4. **Hiển thị.** Các chi của một tộc dùng chung huy hiệu, bảng màu, dáng người và khung chân dung của dòng gốc. Mỗi chi có hào quang riêng, lấy theo thứ tự của kho kể từ hào quang của dòng gốc. Số thứ tự của chi suy từ thứ tự trong `kingdom.tribes[]` và không lưu. Dấu của chi gồm số La Mã trong tên mặc định, vài chấm dưới huy hiệu và các thanh mana xếp thành một nhóm. Tên chi là một trường riêng.
5. **Thứ tự.** Spike đi trước, rồi tầng việc, rồi hiển thị.

Trong file này, **dòng gốc** là dòng mà `sibling_of` trỏ tới, và **chi** là dòng có `sibling_of`. Ví dụ dùng xuyên suốt: dòng gốc `claude` và chi `claude_2`, cùng adapter `claude_code`.

## Điều code cho thấy (2026-11-17)

Đọc ở `main` `fc4a2a1`. Số dòng nối tiếp bảng của [phase-2-merge-queue.md](phase-2-merge-queue.md) (43–64).

| # | Thực tế trong code | Hệ quả |
|---|---|---|
| 65 | `poolOf` (`p/domain/src/mana/pool.ts`) trả `tribe.id` cho tài khoản một bể. `PoolKey` là `{tribe, pool, model?}`, `binds` so `gauge.tribe` với `character.tribe`, và dòng `mana.level` mang cả hai. | Một dòng `tribes[]` nữa là một bể nữa. Phần mana không đổi, đúng ý (3). |
| 66 | `TribeIdSchema` dùng `REGISTRY_ID_PATTERN` (`^[a-z][a-z0-9_]*$`). | Id của chi viết `claude_2`, không viết `claude-2`. Tài liệu và ví dụ dùng dạng đó. |
| 67 | Env của một phiên do Nhiếp chính dựng từ **một** `deps.env` chung cho mọi tộc (`sessionEnvOf` ở `p/steward/src/sessions/secrets.ts`, rồi `sessionEnv` của runner-core). Adapter Claude đặt biến của riêng nó đè lên `req.env` lúc spawn (`launchChild` ở `p/runner-claude/src/session.ts`: `{...base, ...env}`). | `CLAUDE_CONFIG_DIR` của phiên được đặt trong adapter, ở đúng chỗ đó. Nhiếp chính, `sessionEnv` và lõi không biết tên biến (ADR 0021). |
| 68 | Mọi lời gọi ngoài phiên của adapter Claude (`/usage`, ping, `auth status --json`, `purge`) lấy env từ `claudeTool(options).env` (`p/runner-claude/src/tool.ts`). `apps/cli` dựng `options` cho từng tộc ở `toolOptionsOf(tribe, io)` (`a/cli/src/run/crew.ts`). | Thêm thư mục cấu hình vào `ClaudeToolOptions` là đủ cho thăm dò, `doctor`, `tribe check` và `purge`. Chỉ có hai chỗ đặt biến: `claudeTool` và `launchChild`. |
| 69 | Check của lãnh thổ chạy với env của host (`sessionEnv({ base: host.env, … })` ở `p/runner-core/src/checks/run-checks.ts`), không qua adapter. | Check không bao giờ thấy `CLAUDE_CONFIG_DIR`. Đây là điều mong muốn: check không phải tiến trình của tộc. |
| 70 | Không chỗ nào trong code đặt hay gỡ `CLAUDE_CONFIG_DIR`. Một secret tên `claude_config_dir` thành biến `CLAUDE_CONFIG_DIR` (`secretEnvName`), và `RESERVED` của `session-env.ts` chỉ chặn `ELVARIA_` và `GIT_`. | Hôm nay một secret đặt tên như vậy đưa phiên sang thư mục cấu hình khác mà đồng hồ mana không biết. PS-27 để adapter làm chủ biến này: có `config_dir` thì đặt, không có thì gỡ khỏi env của phiên. Chuyện rộng hơn (`ANTHROPIC_API_KEY`…) là mục CT11. |
| 71 | `crewOf` gom một `ForgetWorktree` cho mỗi tộc Claude đang bật, và `PlotManager.release` gọi hết. `purgeWorktree` (`forget.ts`) coi thoát 1 kèm "No Claude Code project state found" là xong. | Hai dòng Claude cho hai lần `claude purge --yes <worktree>`, mỗi lần trong thư mục của mình. Chi nào chưa từng chạy trong worktree đó nhận câu "không có gì để xóa" và coi như xong. Runner-core không đổi. Spike đã đo câu đó với thư mục riêng. |
| 72 | `runDoctor` chạy `checkTribe` cho từng tộc độc lập (`Promise.all`), không có phép kiểm nào giữa hai tộc. `ToolInfo` của `runner.doctor()` chỉ có `path`, `version`, `auth_ok`, `notes`, `detail`. | Luật "hai dòng không chung thư mục, không chung tài khoản" là phép kiểm mới sau khi mọi tộc đã trả `ToolInfo`. `ToolInfo` thêm hai trường tùy chọn. |
| 73 | `tool` chỉ do `doctor` ghi (`nextTool` ở `a/cli/src/doctor/check-tribe.ts`: `{...pinned, path, version, auth, …}`). `TribeToolSchema` buộc có `path` và `version`. `checkedToolOf` cũng giữ `...pinned`. | `tribe add` không ghi được `tool.config_dir` vì lúc đó chưa có `tool`. Thư mục phải đi qua `doctor` (mục CT5). Đã ghim rồi thì `--pin` và `tribe check` giữ nguyên trường này. |
| 74 | `a/cli/src/doctor/check-tribe.ts` dài 292 dòng, trần là 300. | PS-27 tách file này trước khi thêm (mục "Trước tiên" của PS-27). |
| 75 | `tribe check` dựng runner bằng `handOf(tribe, …)` như `elvaria run`. | Bộ test hợp đồng với CLI thật tự chạy trong thư mục của chi, không cần đường riêng. |
| 76 | `checked_version` và lệnh giữ tộc khi CLI đổi phiên bản tính theo từng dòng. | Hai dòng dùng chung một file chạy. CLI tự cập nhật thì mỗi dòng cần một lần `tribe check` thật. Kế hoạch giữ như vậy (mục "Gợi ý cho task khác"). |
| 77 | `byPreference` của `p/domain/src/verify/select-verifier.ts` xếp "tộc khác trước (tài khoản khác, bể khác)" rồi mới tới các khóa sau. Họ model lấy từ `capabilities.models` của adapter (`familyOfCharacter`). | Người chấm ở chi kia không là "khác họ", đúng ý (3). Nhưng khi hai người chấm ngang nhau về họ, người ở chi kia được chọn trước vì là tộc khác. Điều này đúng với lý do ghi trong code và không cần sửa. Ghi chú #200 chưa nói tới. |
| 78 | `tribeLookOf` và `tribeLooksOf` chỉ có `apps/cli` gọi (`tribe add`, `tribe list`, `tribe look`). Repo chưa có `herald`, `world`, `lite`, `ui`, `ui-kit`. `TribeViewSchema` của ảnh chụp thế giới chỉ có `{id, enabled, tool}`. | PS-27b làm hàm thuần và CLI. Chấm dưới huy hiệu và nhóm thanh mana chưa có chỗ để vẽ: PS-27b trả dữ liệu, task `ui-kit` của giai đoạn 2 vẽ (mục CT12). |
| 79 | `TribeLookChoiceSchema` là object chặt, buộc đủ năm phần ghép, `name` tùy chọn. `tribe look` ghi cả object. | Đúng như ý (4): tên chi không thể nằm trong `look`, vì khai `look` là tách ngoại hình của chi khỏi dòng gốc. |
| 80 | Kho `fantasy` (`p/domain/src/tribe/fantasy-looks.json`) có bốn hào quang theo thứ tự `glow`, `sparks`, `mist`, `rings`. Mục ghim `claude` dùng `glow`, `gemini` dùng `sparks`. | Chi thứ hai của `claude` nhận `sparks`, thứ ba `mist`, thứ tư `rings`, thứ năm quay lại `glow`. |
| 81 | `hold()` của `look.ts` giữ cả năm phần của mỗi tộc đứng trước. Tộc tự sinh tránh phần đã có người giữ khi kho còn phần trống. | Hào quang của chi cũng được giữ như của mọi tộc. `tribe add` thêm vào cuối danh sách, nên thêm một chi không đổi ngoại hình của tộc nào đã có. |
| 82 | Bộ kit của adapter file mang nguyên `tribe: Tribe` (`p/runner-core/src/kit/kit.ts`). | Adapter của chủ nhân đọc được `kit.tribe.tool.config_dir` mà không cần đổi kit. PS-27 thêm một trường tiện dụng ở dạng đường dẫn của máy, bên cạnh `tool_path`. |
| 83 | Adapter Codex không bao giờ đổi `CODEX_HOME` (đăng nhập nằm ở đó). agy không có thư mục nhà nào được ghi trong tài liệu, chỉ có cờ ẩn `--app_data_dir` và `--cli_dir_name`. `GEMINI_CLI_HOME` được dành cho settings theo lần chạy của `runner-gemini`, một tộc dùng `api_key`. | Kế hoạch này chỉ làm Claude Code. Chi cho Codex và agy là mục CT10. |

## Spike đã đo gì

Chi tiết ở [spike](../spikes/claude-config-dir-2026-11-17.md). Tóm tắt những điều kế hoạch dựa vào, trên Claude Code 2.1.325, Windows:

- **Đăng nhập, transcript và trạng thái đi theo thư mục cấu hình.** Một thư mục mới rỗng là chưa đăng nhập, trong khi thư mục mặc định vẫn đăng nhập. Transcript của phiên nằm trong `<thư mục>/projects/`, không vào `~/.claude/projects/`.
- **`claude auth status --json` đủ cho `doctor`.** Lệnh trả `configDirectory` ở mọi trạng thái, và khi đã đăng nhập thì có thêm `email`, `orgId`, `orgName`, `subscriptionType`, `planTier`. PS-27 dùng `configDirectory` để biết CLI có nghe biến không, và dùng `email` cùng `orgId` làm dấu tài khoản.
- **Phiên trong thư mục riêng không nạp gì từ `~/.claude`.** `/context` không liệt kê file nhớ hay skill cấp người dùng nào, có hay không có `--setting-sources project,local`.
- **`purge` theo thư mục.** `purge --dry-run` trong thư mục riêng chỉ liệt kê transcript của thư mục đó. Cùng lệnh với thư mục mặc định trả đúng câu mà `purgeWorktree` coi là "không có gì để xóa".
- **`/usage` và `rate_limit_event` đọc tài khoản của thư mục đang dùng.** Tài khoản thứ hai (gói `pro`) báo 0 % và 6 %, trong khi thư mục mặc định (gói `team`) báo 12 %, 40 % và 21 %. `rate_limit_event` của một phiên trong thư mục thứ hai mang đúng 6 % đó. Vì vậy phần mana không cần đổi gì.
- **Trên Windows, đăng nhập là file `.credentials.json` trong thư mục cấu hình.** Tên mục Keychain trên macOS chưa đo (mục 5 của spike, mục CT9).
- **Mỗi lần `-p /usage` để lại một transcript** trong thư mục cấu hình đang dùng. Lần thăm dò của adapter vì thế dồn transcript lại ở từng dòng. Điều này có từ trước và không do chi gây ra (mục "Gợi ý cho task khác").

## Tổng quan và cách chia

- **Mục tiêu**: chủ nhân thêm được tài khoản Claude thứ hai thành một tộc nữa bằng ba lệnh, không sửa tay `kingdom.json`, và nhìn vào là biết hai dòng cùng một tộc.
- **Đọc trước**: dòng §11 #200 ngày 2026-11-17; ADR [0021](../adr/0021-tribe-contract.md), [0009](../adr/0009-mana-model.md), [0013](../adr/0013-treasury-and-redaction.md), [0025](../adr/0025-persona-is-display-only.md); implementation-plan §3.5, §3.7, §3.9, §3.14; spike ở trên; `.claude/rules/` của domain, runner và cli.
- **Luồng đích** (sau PS-27 và PS-27b):
  1. Chủ nhân tạo một thư mục trống cạnh kho bảo vật (`~/.elvaria/accounts/claude_2/`, mục CT15), rồi tự đăng nhập tài khoản thứ hai vào đó bằng chính CLI: đặt `CLAUDE_CONFIG_DIR` trong một cửa sổ dòng lệnh và chạy `claude auth login`.
  2. `elvaria tribe add claude_2 --sibling-of claude` thêm dòng mới, đang tắt, cùng adapter với dòng gốc, và in ngoại hình của chi.
  3. `elvaria doctor --config-dir claude_2=<thư mục>` ghim CLI và thư mục cho dòng đó. `doctor` kiểm đăng nhập trong thư mục ấy và từ chối nếu thư mục hay tài khoản trùng với một dòng khác.
  4. `elvaria tribe check claude_2` chạy bộ test hợp đồng với CLI thật trong thư mục ấy (gần như 0 mana) rồi bật dòng.
  5. `elvaria character add --tribe claude_2 …` triệu hồi nhân vật của chi. Từ đây Nhiếp chính coi `claude_2` như mọi tộc khác.
- **Chia**:

| Id | Việc | Số ý | Cần trước | File chạm chính |
|---|---|---|---|---|
| PS-27 | **Thư mục cấu hình của tộc** (tầng việc): `tool.config_dir`, năng lực `config_dir`, adapter Claude đặt `CLAUDE_CONFIG_DIR`, `doctor --config-dir` và luật giữa các dòng | 5 | không (PS-23, PS-24 đã xong) | `p/domain/src/schema/tribe.ts`, `p/domain/src/tribe/**`, `p/runner-core/src/{runner,kit}/**`, `p/runner-claude/src/**` và `fixtures/`, `a/cli/src/{doctor,run,tribe}/**`, i18n, `docs/schemas/**`, `docs/cli.md`, ADR 0021 và 0009, §3.5, §3.9, §3.14, hướng dẫn |
| PS-27b | **Ngoại hình của chi** (hiển thị): `sibling_of`, `sibling_name`, `tribeLookOf`, `tribe add --sibling-of`, `tribe look`, `tribe list`, thuật ngữ | 4 | PS-27 | `p/domain/src/schema/tribe.ts`, `p/domain/src/tribe/**`, `a/cli/src/tribe/**`, `a/cli/src/doctor/**`, i18n và `glossary.json`, `docs/schemas/**`, `docs/cli.md`, `docs/glossary.md`, ADR 0021, §3.14, hướng dẫn |

- **Spike không thành task riêng.** Phiên kế hoạch đã đo phần Windows. Phần macOS (tên mục Keychain) chưa đo và không chặn PS-27, vì luật của `doctor` bắt được hậu quả xấu nhất (mục CT9).
- **Thứ tự theo phụ thuộc** (đề xuất; phiên điều phối quyết): PS-27 rồi PS-27b. PS-27b đứng sau vì hai task cùng sửa `schema/tribe.ts`, `a/cli/src/tribe/**`, file chuỗi i18n và §3.14, và vì `tribe add --sibling-of` chỉ có ích khi dòng mới có tài khoản riêng.
- **Chồng nhau**: PS-27 chạm `a/cli/src/doctor/**` và `a/cli/src/run/crew.ts`. Task nào đang mở cũng chạm hai vùng đó thì không chạy cùng lúc. Cả hai task chạm file chuỗi `vi.json` và `en.json` như mọi task có CLI.
- **Điều kiện mở PS-27**: CT1–CT5 đã chốt. **Điều kiện mở PS-27b**: PS-27 đã merge và CT6–CT8 đã chốt.

## PS-27 — Thư mục cấu hình của tộc

- **Mục tiêu**: một dòng `kingdom.tribes[]` chạy CLI của nó trong thư mục cấu hình mà chủ nhân chọn. Nhờ đó hai dòng cùng adapter `claude_code` là hai tài khoản và hai bể mana, còn mọi luật của tầng việc giữ nguyên.
- **Đọc trước**: bảng "Điều code cho thấy" dòng 65–77 và 82–83; spike; ADR 0021 (đoạn `capabilities.auth`, mẫu cho năng lực mới); ADR 0013; `.claude/rules/runner.md` mục "Tiến trình con". `p/domain/src/schema/**` thuộc danh sách "Đọc trước khi sửa": commit nói rõ vì sao thêm trường.
- **Phạm vi**: chỉ adapter `claude_code`. Lõi (`domain`, `steward`, `runner-core`) không biết tên biến môi trường của CLI nào.
- **Không làm**: không đọc, không ghi, không liệt kê bên trong thư mục cấu hình; không tự đăng nhập, không chép credential; không chuyển nhân vật hay phiên đang chạy sang dòng khác; không luật điều phối nào riêng cho hai dòng cùng adapter; không `sibling_of` (PS-27b); không Codex, không agy.
- **Trước tiên**: tách `a/cli/src/doctor/check-tribe.ts` (292 dòng). Phần ghim tool (`nextTool`, `changedTool`, `uncheckedFindings`, `checkedToolOf`) sang một file riêng, không đổi hành vi, test cũ còn xanh.
- **Thêm**:
  - **Schema** (`p/domain/src/schema/tribe.ts`): `tool.config_dir`, `AbsPathSchema`, tùy chọn, thêm sau v1 nên `kingdom.json` giữ `version` 1. Mô tả nói rõ ba điều: chủ nhân chọn thư mục và tự đăng nhập một lần; vắng thì CLI dùng thư mục mặc định của nó; Elvaria chỉ truyền đường dẫn cho adapter. Chạy `pnpm schemas`; thêm một ví dụ `kingdom` có hai dòng Claude vào `examples/`.
  - **Năng lực** (`p/domain/src/tribe/capabilities.ts`): `capabilities.config_dir`, boolean tùy chọn, vắng nghĩa là không. Adapter khai `true` khi nó chạy **mọi** tiến trình của tộc trong `tool.config_dir`. Hàm thuần `checkTribeConfigDir(caps, tribe)` đặt cạnh `checkTribeAuth`: dòng có `tool.config_dir` mà adapter không khai thì trả lỗi `config_dir_not_declared`. Nếu thiếu phép kiểm này, một dòng agy có `config_dir` sẽ lặng lẽ chạy trên tài khoản mặc định.
  - **Luật giữa các dòng** (domain, hàm thuần `accountClashesOf(rows)`): mỗi phần tử của `rows` là `{id, adapter, auth, config_dir?, account?}`, trong đó `config_dir` là thư mục CLI báo đang dùng (thiếu thì lấy thư mục khai trong dữ liệu) và `account` là dấu tài khoản. Hàm trả các cặp trùng trong số dòng `auth = login` cùng adapter: `same_config_dir` khi hai thư mục bằng nhau, kể cả khi cả hai cùng vắng; `same_account` khi hai dấu tài khoản bằng nhau. Người gọi chuẩn hóa đường dẫn trước (dấu `/`, bỏ `/` cuối, chữ thường trên Windows và macOS). Dòng `api_key` không bị xét, vì đăng nhập của nó không nằm trong thư mục.
  - **Runner-core** (`p/runner-core/src/runner/**`, `kit/**`): `ToolInfo` thêm `config_dir?` (thư mục CLI báo đang dùng, dạng đường dẫn của máy) và `account?` (một chuỗi băm, xem dưới). `DOCTOR_NOTES` thêm `doctor:config_dir_ignored` với tham số `given` và `used`. Bộ kit thêm `config_dir` ở dạng đường dẫn của máy, `undefined` khi dòng không khai. Adapter file viết trước đó vẫn qua `tribe check`.
  - **Adapter Claude** (`p/runner-claude/src/**`):
    1. `ClaudeToolOptions.configDir?`. Một hàm nhỏ `accountEnv(env, configDir)` trả env có `CLAUDE_CONFIG_DIR` bằng thư mục đã cho, hoặc **không có** biến đó khi không khai. `claudeTool` dùng nó cho env của thăm dò, `doctor` và `purge`. `launchChild` dùng nó sau cùng, đè lên cả `req.env`, nên một secret trùng tên không đổi được tài khoản của phiên.
    2. `CLAUDE_CAPABILITIES.config_dir = true`.
    3. `doctorClaude` đọc thêm ba trường của `claude auth status --json`: `configDirectory`, `email`, `orgId`. Khi có `configDir` mà `configDirectory` khác nó thì `auth_ok: false` kèm ghi chú `doctor:config_dir_ignored`: CLI đã không nghe biến, và mọi phiên sẽ chạy nhầm tài khoản. `ToolInfo.config_dir` là `configDirectory`. `ToolInfo.account` là SHA-256 dạng hex của `email`, một dấu xuống dòng và `orgId`; vắng khi CLI không trả `email`. Email và mã tổ chức không rời hàm này: không vào ghi chú, log, event hay `kingdom.json`.
    4. CLI giả (`fixtures/fake-claude-commands.mjs`, `fake-claude.mjs`): `auth status --json` trả `configDirectory` là `CLAUDE_CONFIG_DIR` nó nhận (vắng thì một thư mục mặc định giả), `email` và `orgId` suy từ tên thư mục, và một nút `FAKE_CLAUDE_SAME_ACCOUNT=1` để mọi thư mục trả cùng một tài khoản. Nút `FAKE_CLAUDE_IGNORES_CONFIG_DIR=1` làm nó trả thư mục mặc định dù có biến. Nếu thư mục cấu hình giả có file `fake-usage.jsonl` thì `/usage` phát file đó, để hai dòng có số đo khác nhau trong một test. Phiên giả ghi `CLAUDE_CONFIG_DIR` nó thấy vào một dòng của stream để spec so được.
  - **`apps/cli`**:
    1. `toolOptionsOf` truyền `configDir: fromPortable(tribe.tool.config_dir, io.platform)` khi dòng có khai. Adapter file nhận qua kit.
    2. `elvaria doctor --config-dir <tộc>=<đường dẫn>` (lặp được, như `--tool`): ghi `tool.config_dir` cùng lúc ghim. Giá trị rỗng sau dấu `=` bỏ trường. Lệnh từ chối trước khi kiểm gì (exit 2) khi tộc không có trong `kingdom.json`, khi đường dẫn không tuyệt đối, khi thư mục không tồn tại, và khi thư mục nằm trong vương quốc hay trong repo, thư mục worktree của một lãnh thổ. Lý do của điều cuối: thư mục cấu hình chứa đăng nhập và mọi transcript của tài khoản. Kho bảo vật, nơi duy nhất khác chứa bí mật, vốn luôn nằm ngoài vương quốc (`paths.treasury`, mặc định `~/.elvaria/treasury.json`, ADR 0013), còn lãnh thổ là nơi tool của nhân vật với tới. Chỗ đề xuất là cạnh kho bảo vật, `~/.elvaria/accounts/<id tộc>/` (mục CT15).
    3. Phép kiểm của từng dòng thêm `checkTribeConfigDir` (lỗi, như `auth_not_declared`).
    4. Phép kiểm giữa các dòng (file mới `a/cli/src/doctor/check-accounts.ts`): gom `ToolInfo` của mọi dòng `doctor` không bỏ qua, gọi `accountClashesOf`, và báo **lỗi** cho cả hai dòng của mỗi cặp. Câu báo nêu hai id tộc và, với `same_config_dir`, đường dẫn; không bao giờ nêu email. `--enable` không bật dòng nào đang nằm trong một cặp trùng. `tribe check` áp cùng luật trước khi bật: nó gọi `doctor()` của các dòng `login` cùng adapter (không gọi model).
    5. `tribe list` thêm cột thư mục cấu hình (`—` khi vắng). Chuỗi `vi` và `en` cho mọi câu mới; `pnpm docs:gen` cho `docs/cli.md`.
- **Điều không đổi, và vì sao** (để người làm không sửa thừa):
  - Mana: bể của `claude_2` có khóa `claude_2` (`poolOf`). `rate_limit_event` của một phiên và `/usage` của lần thăm dò đều chạy trong thư mục của dòng đó, nên số đo là của đúng tài khoản (spike). `budget` và `max_concurrent` vốn theo dòng.
  - Điều phối: `selectAssignee`, `reassignsOf` và `mana.reassign_after_hours` đọc `character.tribe`. Việc mới tự tới nhân vật của dòng còn thức, như giữa `claude` và `gemini` hôm nay. Không phiên, nhân vật hay quest đang chạy nào đổi tài khoản.
  - `--resume`: nhân vật cố định tộc suốt đời, nên phiên được nối lại luôn chạy trong đúng thư mục chứa transcript của nó.
  - `purge`: mỗi dòng Claude đang bật có một `forget` riêng (dòng 71 của bảng).
- **Windows và macOS**: `tool.config_dir` trong `kingdom.json` viết bằng `/`; adapter nhận dạng của máy. Spike chạy với thư mục có dấu cách trong tên. So hai thư mục không phân biệt hoa thường trên `win32` và `darwin`. Trên macOS credential nằm trong Keychain và spike chưa đo được: xem mục CT9. Ca riêng của một OS dùng `it.runIf`.
- **Test** (CLI giả, 0 mana):
  - Domain, 100 %: schema nhận đường dẫn tuyệt đối và từ chối đường dẫn tương đối hay có `\`; `checkTribeConfigDir`; `accountClashesOf` với các ca cùng vắng, cùng thư mục, cùng dấu tài khoản, khác adapter, một dòng `api_key`, một dòng không có dấu; `planTick` với hai dòng cùng adapter cho thấy dòng ngủ không chặn dòng thức.
  - `runner-claude`: phiên của dòng có thư mục nhận `CLAUDE_CONFIG_DIR` đúng thư mục đó; phiên của dòng không khai **không** có biến, kể cả khi `req.env` mang nó; `/usage`, ping, `auth status` và `purge` chạy với cùng biến; hai runner trong một test đọc hai số đo khác nhau; `doctor()` báo `config_dir_ignored` khi CLI trả thư mục khác; `account` bằng nhau khi cùng tài khoản, khác khi khác, và không chứa ký tự `@`; mọi ca dùng thư mục tạm có dấu cách.
  - `apps/cli`: `doctor --config-dir` ghim trường và `--pin` sau đó giữ nó; bốn ca từ chối của tùy chọn; hai dòng `login` cùng adapter không khai thư mục ⇒ lỗi cho cả hai và `--enable` không bật; hai thư mục khác nhau cùng tài khoản ⇒ lỗi; dòng agy có `config_dir` ⇒ lỗi `config_dir_not_declared`; câu báo không chứa email của CLI giả; `tribe check --scenarios` của chi qua; `tribe list` có cột mới; `elvaria run` với hai dòng Claude và CLI giả: quest tới được nhân vật của cả hai dòng, dòng `mana.level` của mỗi dòng mang bể của mình, và trả một worktree thì `purge` chạy trong cả hai thư mục.
- **Chạy thật** (chủ nhân quyết, gần như 0 mana): `elvaria tribe check claude_2` với CLI thật trong thư mục thứ hai, rồi `elvaria doctor`. Task chạm `runner-*`, nên báo cáo nêu để chủ nhân quyết có chạy CI ba hệ điều hành không.
- **Xong khi**: `pnpm check` xanh; các ca trên; `pnpm schemas` sạch; README của `runner-claude`, `runner-core`, `domain` và `apps/cli` nói đúng; ADR và tài liệu ở mục "Sửa ADR và tài liệu" đã sửa; `docs/guides/adding-a-tribe.md` có đoạn "tài khoản thứ hai của cùng một CLI" với năm bước của luồng đích (bước `--sibling-of` ghi là tới PS-27b).
- **Chỗ chừa**: PS-27b thêm `--sibling-of` vào `tribe add` và đọc cột mới của `tribe list`. Adapter Codex và agy khai `config_dir` khi có spike của riêng chúng; lõi không đổi. Một adapter file của chủ nhân tự khai `config_dir` và tự trả `ToolInfo.account` nếu CLI của nó cho biết tài khoản.

## PS-27b — Ngoại hình của chi

- **Mục tiêu**: hai dòng cùng một tộc nhìn là nhận ra cùng tộc, vẫn phân biệt được từng chi, và chủ nhân không phải khai ngoại hình cho chi.
- **Đọc trước**: bảng dòng 78–81; `p/domain/src/tribe/look.ts` và spec của nó; §3.14 đoạn PS-24; ADR 0021 (phần Consequences), ADR 0025.
- **Định nghĩa**:
  - `sibling_of` của một dòng **hợp lệ** khi nó trỏ tới một dòng khác trong `kingdom.tribes[]` mà chính dòng đó không có `sibling_of`. Không hợp lệ (không có dòng đó, trỏ vào chính mình, trỏ vào một chi) thì dòng được coi như không có `sibling_of`.
  - **Số thứ tự**: dòng gốc là 1. Các chi của nó nhận 2, 3, … theo thứ tự trong `kingdom.tribes[]`, tính cả dòng đang tắt. Số này không lưu.
- **Thêm**:
  - **Schema** (`p/domain/src/schema/tribe.ts`): `sibling_of` (`TribeIdSchema`, tùy chọn) và `sibling_name` (`NameSchema`, tùy chọn), thêm sau v1. Schema của `kingdom` không kiểm chéo hai trường này (mục CT7). `pnpm schemas`.
  - **Hàm ngoại hình** (`p/domain/src/tribe/look.ts`, phần mới ở file riêng nếu `look.ts` vượt 300 dòng):
    1. `LookedTribe` thêm `sibling_of?` và `sibling_name?`.
    2. Ngoại hình của một chi là ngoại hình của dòng gốc (lựa chọn của chủ nhân, mục ghim hay tự sinh, như hôm nay), trừ hào quang. Hào quang của chi thứ `n` là phần tử đứng sau hào quang của dòng gốc `n − 1` bước trong `pool.auras`, đi vòng khi hết kho. `source` là giá trị mới `sibling`.
    3. `TribeLook` thêm `siblings?: {root, ordinal, count}`. Trường này có ở dòng gốc và ở mọi chi khi dòng gốc có ít nhất một chi hợp lệ. `count` là số dòng của cả nhóm.
    4. `look` khai trên một chi bị bỏ qua. `sibling_name` thành `TribeLook.name` của chi.
    5. Chi không lấy bảng màu hay huy hiệu nào của kho, nên không đẩy tộc tự sinh nào sang phần khác. Hào quang của nó được giữ như của mọi tộc.
  - **Số La Mã** (`p/domain/src/tribe/roman.ts`): `romanOf(n)` cho `n ≥ 1`, hàm thuần, để CLI hôm nay và giao diện sau này dùng chung.
  - **Tên hiển thị** (`a/cli/src/tribe/look-view.ts`, chuỗi i18n `tribe_look.sibling_name` = `{name} {numeral}`):
    - Chi có `sibling_name`: đúng chữ đó.
    - Chi không có: tên của dòng gốc (tên chủ nhân đặt, hay chữ của theme) kèm số La Mã, ví dụ "Sao Bạc II".
    - Dòng gốc không có tên chủ nhân đặt và có chi: chữ của theme kèm "I". Có tên chủ nhân đặt thì giữ nguyên chữ của chủ nhân.
  - **CLI** (`a/cli/src/tribe/**`):
    1. `elvaria tribe add <id> --sibling-of <dòng gốc>`: `--adapter` bỏ được và mặc định là adapter của dòng gốc. Lệnh từ chối (exit 1) khi dòng gốc không có, khi dòng gốc là một chi, và khi `--adapter` khác adapter của dòng gốc. Lệnh in ngoại hình của chi và nhắc bước `doctor --config-dir`.
    2. `elvaria tribe look <chi>`: in ngoại hình, nguồn `sibling`, dòng gốc và số thứ tự. `--name` ghi `sibling_name`; `--reset` bỏ nó. Các tùy chọn phần ghép bị từ chối (exit 1) kèm câu chỉ sang `tribe look <dòng gốc>`.
    3. `tribe list`: cột Ngoại hình dùng tên hiển thị ở trên.
    4. `doctor` cảnh báo (không phải lỗi) khi một dòng có `sibling_of` không hợp lệ, có `sibling_of` trỏ tới dòng khác adapter, hay có `look` khai trên một chi.
  - **Thuật ngữ** (`p/i18n/src/glossary.json`, rồi `pnpm docs:gen`): thêm "Chi" (mục CT6); sửa dòng "Tộc" thành "một tài khoản … ; tài khoản thứ hai của cùng CLI là một chi"; thêm một dòng ví dụ vào bảng §8 của glossary.
- **Không làm**: không vẽ gì trong giao diện (chưa có package); không đổi `TribeViewSchema`; không thêm hào quang vào kho; không trần cứng cho số chi; không luật nào của tầng việc đọc `sibling_of`.
- **Test**:
  - Domain, 100 %: chi dùng đúng bảng màu, huy hiệu, dáng và khung của dòng gốc ở cả ba nguồn (chủ nhân chọn, ghim, tự sinh); dãy hào quang `glow → sparks → mist → rings → glow` cho `claude`; số thứ tự theo thứ tự danh sách, kể cả khi chi đứng trước dòng gốc; dòng gốc chỉ có `siblings` khi có chi; ba ca `sibling_of` không hợp lệ cho ngoại hình như một tộc riêng; `look` trên chi bị bỏ qua; thêm một chi vào cuối không đổi ngoại hình của bất kỳ dòng nào đã có (chạy trên các vương quốc của spec PS-24); `planTick` cho cùng kết quả khi có và không có `sibling_of`; `romanOf` từ 1 tới 20.
  - `apps/cli`: ba ca từ chối của `--sibling-of`; `tribe look` của chi với `--name`, `--reset` và một tùy chọn phần ghép; `tribe list` in "Sao Bạc I" và "Sao Bạc II"; ba cảnh báo của `doctor`; `pnpm docs:check` và `pnpm i18n:check`.
- **Xong khi**: `pnpm check` xanh; các ca trên; `docs/glossary.md`, `docs/cli.md` và `docs/schemas/**` sinh lại sạch; §3.14 và ADR 0021 đã sửa; hướng dẫn thêm tộc có đủ năm bước.
- **Chỗ chừa**: task `ui-kit` của giai đoạn 2 (P2-02 trong [phase-2.md](phase-2.md)) vẽ `siblings.ordinal` chấm dưới huy hiệu và xếp các thanh mana có cùng `siblings.root` thành một nhóm dưới một huy hiệu. Task nào đưa `look` của tộc tới tầng thế giới thì đưa cùng `sibling_of` và `sibling_name`. Theme thành thư mục riêng (giai đoạn 4) mang kho hào quang của nó theo.

## Chỗ ghi chú #200 khác code

Năm ý đều làm được như đã chốt. Có bốn chỗ ghi chú nói chưa đủ hoặc chưa khớp code:

- **Ý (2), "adapter đặt biến cho mọi tiến trình của tộc (phiên, `/usage`, `doctor`, `tribe check`, `purge`)".** Lời gọi `--version` của `doctor` do `apps/cli` tự chạy (`toolVersion`), không qua adapter. Lời gọi đó không phụ thuộc tài khoản, nên PS-27 để nguyên.
- **Ý (2) và (5), "`doctor` từ chối hai dòng cùng adapter dùng chung một thư mục cấu hình".** Luật này chỉ đúng với dòng `auth = login`. Hai dòng `api_key` cùng adapter khác nhau ở khóa trong kho bảo vật, không ở thư mục. Luật cũng phải bắt ca cả hai dòng cùng không khai thư mục, là ca hôm nay không gì chặn.
- **Ý (3), "người chấm ở chi kia không được tính là khác họ".** Đúng. Điều ghi chú chưa nói là khóa xếp thứ hai của luật chọn người chấm ("tộc khác trước") sẽ ưu tiên người chấm ở chi kia khi hai người ngang nhau về họ (dòng 77 của bảng).
- **Ý (5), "xem phiên của tộc gốc có nạp settings và `CLAUDE.md` cấp người dùng không".** Mọi phiên, lần thăm dò và ping của Elvaria đều chạy `--setting-sources project,local`, nên không dòng nào nạp settings hay `CLAUDE.md` cấp người dùng, dù thư mục cấu hình là mặc định hay riêng. Hai dòng vì thế chạy giống nhau. Spike xác nhận ở thư mục riêng.

Ngoài ra ý (4) nói tới chấm dưới huy hiệu và nhóm thanh mana, nhưng repo chưa có package giao diện nào (dòng 78).

## Sửa ADR và tài liệu khi làm

Phiên kế hoạch không sửa ADR. Đây là lời đề xuất cho phiên làm task, sửa tại chỗ theo mẫu `(Amended <ngày>, <task>: …)`.

- **ADR 0021, gạch đầu dòng thứ nhất của Decision** (PS-27): "(Amended …, PS-27, as the owner decided 2026-11-17: `tool.config_dir` is the config directory of the tribe's CLI, chosen by the owner, who signs in to it once. An adapter that declares `capabilities.config_dir` runs every process of the tribe in it (Claude Code: `CLAUDE_CONFIG_DIR`); Elvaria passes the path on and never reads or writes inside. A second account of one CLI is thus one more row, a tribe of its own in all the work layer does: pool, sleep and wake, budget, slots, characters. `elvaria doctor` refuses two login rows of one adapter that share a directory or an account. Optional, so kingdom.json stays version 1.)"
- **ADR 0021, Consequences** (PS-27b): "(Amended …, PS-27b: a row may name another row as its root, `sibling_of`, for display only. Siblings share the root's palette, crest, figure and frame and take the aura after the root's in the pool, in the order of `kingdom.tribes[]`; a sibling's number is its place in that order and is never stored; its name is `sibling_name`, else the root's name and a Roman numeral. Nothing infers a sibling from the adapter.)"
- **ADR 0009, câu mở của Context** ("Principle 6: two accounts (Claude Code; Antigravity), never rotated"): "(Amended …, PS-27: one account per tribe since ADR 0021, and a second account of the same CLI is a tribe of its own, its pool keyed by its id. Never rotated still holds: no session, character or quest in flight changes account, and Elvaria never signs in or out.)"
- **implementation-plan**: §3.14 (định nghĩa tộc ở đầu mục; bảng năng lực thêm `config_dir`; đoạn PS-24 thêm chi), §3.5 (câu "một pool: = tribe id" thêm ví dụ `claude_2`), §3.9 (câu về env tối thiểu: biến của CLI do adapter đặt).
- **`.claude/rules/runner.md`**, mục "Tiến trình con": thêm một câu rằng `CLAUDE_CONFIG_DIR` chỉ đến từ `tool.config_dir` và do adapter đặt hay gỡ.
- **Hướng dẫn**: `docs/guides/adding-a-tribe.md` (đoạn mới) và `docs/guides/operating-a-kingdom.md` (một dòng trỏ sang).
- **Kế hoạch sản phẩm**: nguyên tắc 6 đã viết "mỗi tộc một tài khoản của người dùng" và "không bao giờ tự xoay tài khoản", nên không cần sửa. Nếu chủ nhân muốn nêu chi trong kế hoạch sản phẩm thì chủ nhân tự sửa.

## Quyết định (chờ chủ nhân chốt)

**Cần trước khi mở task** (ghi task liên quan):

- **CT1** (mọi task) Cách chia và id: PS-27 (tầng việc) rồi PS-27b (hiển thị); không có task spike riêng vì phần Windows đã đo trong phiên này. Khuyến nghị: nhận. Phương án khác: tách phần "luật giữa các dòng" của `doctor` thành PS-27c nếu chủ nhân muốn PS-27 nhỏ hơn; khi đó PS-27 một mình không chặn được hai dòng chung tài khoản.
- **CT2** (PS-27) Adapter Claude làm chủ `CLAUDE_CONFIG_DIR`: có `tool.config_dir` thì đặt, không có thì gỡ khỏi env của phiên, và giá trị của adapter đè lên mọi nguồn khác. Khuyến nghị: nhận. Lý do: lõi không biết tên biến của CLI (ADR 0021), và một secret trùng tên không còn đổi được tài khoản của phiên (dòng 70).
- **CT3** (PS-27) Năng lực mới `capabilities.config_dir`, kiểm bằng `checkTribeConfigDir` như `capabilities.auth`. Khuyến nghị: nhận. Phương án khác: không khai năng lực, chỉ tin thư mục CLI báo trong `doctor()`; adapter nào không báo thì bị coi là không hỗ trợ. Cách đó bớt một trường nhưng `tribe check` không in được năng lực này.
- **CT4** (PS-27) Ba luật của `doctor` và `tribe check`, đều là **lỗi** và đều chặn `--enable`: (a) hai dòng `login` cùng adapter chung thư mục cấu hình, kể cả cùng không khai; (b) hai dòng `login` cùng adapter có cùng dấu tài khoản, là chuỗi băm của email và mã tổ chức mà CLI trả, chỉ so trong bộ nhớ, không ghi và không in; (c) thư mục cấu hình nằm trong vương quốc hay trong một lãnh thổ. Khuyến nghị: nhận cả ba. Phương án khác cho (b): chỉ cảnh báo, vì hai dòng chung tài khoản vẫn đọc đúng số đo của tài khoản đó. Lý do giữ là lỗi: hai dòng chung tài khoản làm chủ nhân tưởng có hai bể mana, và nhân đôi số phiên chạy cùng lúc trên một tài khoản.
- **CT5** (PS-27) Chủ nhân khai thư mục bằng `elvaria doctor --config-dir <tộc>=<đường dẫn>`, vì `tool` chỉ tồn tại sau khi `doctor` ghim (dòng 73). Khuyến nghị: nhận. Phương án khác: `tribe add --config-dir`, phải đổi schema để `tool` có thể thiếu `path` và `version`.
- **CT6** (PS-27b) Tên trường và thuật ngữ: `sibling_of` như đã chốt; tên chi là `sibling_name`; glossary thêm "Chi", tiếng Anh "Sibling tribe", id `sibling`. Khuyến nghị: nhận. Lý do không dùng `branch`: trong repo này "branch" là nhánh git.
- **CT7** (PS-27b) `sibling_of` không hợp lệ thì hàm ngoại hình coi như không có, `doctor` cảnh báo, và `tribe add` từ chối lúc ghi. Schema của `kingdom` không kiểm chéo. Khuyến nghị: nhận. Lý do: đây là trường chỉ để hiển thị (ADR 0025), nên một lỗi của nó không được làm `kingdom.json` thành không hợp lệ và dừng Nhiếp chính.
- **CT8** (PS-27b) Ngoại hình và tên của chi: `look` khai trên chi bị bỏ qua và CLI từ chối ghi; tên mặc định của chi là tên dòng gốc kèm số La Mã; dòng gốc có tên chủ nhân đặt thì giữ nguyên, không thêm "I". Khuyến nghị: nhận.
- **CT15** (PS-27; thêm sau câu hỏi của chủ nhân ngày 2026-11-17; **chủ nhân đã chốt cùng ngày: cạnh kho bảo vật**) Chỗ đặt thư mục cấu hình của một chi. Khuyến nghị: ngoài vương quốc, cạnh kho bảo vật, theo quy ước `~/.elvaria/accounts/<id tộc>/`; hướng dẫn nêu quy ước này, `doctor --config-dir` vẫn nhận mọi đường dẫn hợp lệ, và luật (c) của CT4 giữ nguyên. Lý do: chi vẫn là của vương quốc vì `kingdom.json` ghi đường dẫn tới nó, đúng như cách `paths.treasury` trỏ ra kho bảo vật; còn thư mục vương quốc là thứ chủ nhân có thể chép sang máy khác hay sao lưu, và không nên mang theo đăng nhập cùng transcript. Phương án khác: đặt trong vương quốc, `<vương quốc>/accounts/<id tộc>/`, và luật (c) đổi thành "chỉ được nằm ở đó". Cách này gọn hơn cho người có nhiều vương quốc trên một máy, nhưng mọi đoạn mã duyệt thư mục vương quốc từ nay phải chừa thư mục đó ra, và chép vương quốc đi đâu là chép cả đăng nhập. Bản thử của `elvaria upgrade` hiện chỉ chép sáu mục có tên (`mirror.ts`), nên hôm nay nó không chép thư mục đó.

**Chốt là chờ**:

- **CT9** macOS: tên mục Keychain của một thư mục cấu hình riêng chưa đo (máy đo là Windows). Cách đo ghi ở spike mục "Chưa đo". Khuyến nghị: PS-27 không chờ; đo khi có máy macOS, trước khi chủ nhân dùng chi trên macOS. Lý do: nếu hai thư mục dùng chung một mục Keychain thì cả hai dòng báo cùng một tài khoản và luật (b) của CT4 từ chối, không có hỏng hóc thầm lặng.
- **CT10** Chi cho Codex (`CODEX_HOME`) và agy: chưa mở. Mỗi CLI cần một spike riêng (Codex: `codex login status` và `account/rateLimits/read` với một `CODEX_HOME` thứ hai, không gọi model; agy: chưa có thư mục nhà nào được ghi trong tài liệu). Khuyến nghị: chờ tới khi chủ nhân có tài khoản thứ hai của CLI đó.
- **CT11** Chặn mọi biến chọn tài khoản đến từ secret (`ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `CODEX_HOME`…): mỗi adapter khai danh sách biến nó giữ, và `sessionEnv` từ chối secret trùng tên như đã làm với `ELVARIA_` và `GIT_`. Khuyến nghị: một nhánh sửa nhỏ sau PS-27, vì nó chạm `p/runner-core/src/treasury/**` (vùng "Đọc trước khi sửa") và cả ba adapter.
- **CT12** Phần vẽ trong giao diện (chấm dưới huy hiệu, nhóm thanh mana) thuộc task `ui-kit` của giai đoạn 2; PS-27b chỉ trả dữ liệu. Khuyến nghị: nhận.
- **CT13** Điều khoản của nhà cung cấp về việc một người dùng hai tài khoản: kế hoạch không đánh giá. Khuyến nghị: không thêm cổng kiểu `terms_acknowledged_at`; hướng dẫn thêm một câu nhắc chủ nhân tự xét điều khoản gói của mình.
- **CT14** Sau PS-27: một lần `tribe check` thật của chi (gần như 0 mana) và một lần CI ba hệ điều hành. Khuyến nghị: làm cả hai trước khi chủ nhân giao việc thật cho chi.

## Gợi ý cho task khác (không sửa mục của chúng)

- **P2-02, P2-04, P2-07** ([phase-2.md](phase-2.md)): huy hiệu của `ui-kit` nhận `siblings.ordinal` để vẽ chấm; HUD nhóm các `PoolView` theo `siblings.root` của tộc; chú giải tộc liệt kê dòng gốc một lần, kèm số chi.
- **`tribe check` sau khi CLI tự cập nhật**: hai dòng chung một file chạy cần hai lần kiểm thật (dòng 76). Nếu việc này thành phiền, một task sau có thể cho lần kiểm của một dòng ghim `checked_version` cho các dòng cùng `tool.path`; phần đăng nhập của từng dòng vẫn phải kiểm riêng.
- **Dòng đang tắt**: `crewOf` không dựng runner cho dòng tắt, nên transcript của một chi đã tắt không được `purge` khi trả worktree. Điều này đã đúng với mọi tộc từ trước; ghi lại vì chi làm ca này dễ gặp hơn.
- **Transcript của lần thăm dò**: mỗi lần `-p /usage` ghi một transcript khoảng 3 KB vào `<thư mục cấu hình>/projects/<cwd đã mã hóa>/` (spike mục 3.5), và adapter thăm dò mỗi 15 phút cùng sau mỗi phiên, với cwd là thư mục tạm của hệ thống. Một task sau có thể cho adapter chạy `claude purge --yes` trên cwd của thăm dò, hoặc đặt cwd đó vào `.runs/`. Việc này áp cho mọi dòng Claude, kể cả dòng gốc.
