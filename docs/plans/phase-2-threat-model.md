# Threat model trước giai đoạn 2

Ngày: 2026-11-20 · Trạng thái: **chủ nhân đã chốt** ngày 2026-11-20, B1–B11 (mục "Quyết định") · ADR đi kèm:
[ADR 0031](../adr/0031-herald-pairing-and-session-cookie.md) (Accepted).

Tài liệu này gom các biện pháp bảo mật đang rải ở ADR 0005, 0007, 0008, 0013, 0015, 0021, 0023, 0024, 0026 vào một
chỗ, đối chiếu với code ở `main` 69fa05b, rồi nêu điều phải có trước khi Sứ giả mở cổng mạng. Phiên này không sửa
code. Mọi dòng "đang có" đều đã đọc trong code; chỗ nào chỉ suy từ code mà chưa thử bằng CLI thật thì ghi rõ.

## Summary

Hiện tại (giai đoạn 1.5):

- **R1 · Code do phiên chạy có quyền của chủ nhân.** Hàng rào gác tool của nhân vật, không gác chương trình mà tool
  khởi động: `pnpm test`, `node`, `pnpm install`, shell của Codex đọc được kho bảo vật, đăng nhập của các tộc, kho
  credential của git, khóa SSH, và ra được mạng. (Sửa tại chỗ 2026-11-21, SEC-01: dòng shell và đường dẫn của tool
  nêu các chỗ đó bị hook từ chối ở cả ba tộc, và shell của Codex không còn mạng; chương trình mà dòng lệnh khởi
  động vẫn đọc được, và ở Claude Code, agy vẫn ra được mạng.)
- **R2 · Thư mục kingdom là vùng tin tuyệt đối.** Ai ghi được một file vào `inbox/` thì có quyền chủ nhân (`source`
  tự khai), ghi được `adapters/*.mjs` thì chạy code trong tiến trình Nhiếp chính.
- **R3 · Token giao hàng rộng hơn việc nó làm.** `git credential fill` trả credential của cả tài khoản GitHub, và
  chạy trong thư mục lãnh thổ nên nghe cấu hình git của repo đó.
- **R4 · Chuỗi cung ứng không có cổng ở máy.** `pnpm audit` chỉ chạy trong CI tay; repo chưa tự quét secret trước
  commit.

Giai đoạn 2:

- **R5 · Sứ giả là cổng nghe đầu tiên.** Cổng trên 127.0.0.1 với tới được từ mọi tiến trình trên máy và mọi trang
  web chủ nhân mở (CSRF, DNS rebinding, chiếm WebSocket từ site khác), trong khi cách xác thực chưa được chọn.
- **R6 · Điện thoại ghi lệnh với quyền chủ nhân.** Mất máy hoặc lộ cookie là mất quyền đóng dấu, giao hàng, nâng
  trần mana, nếu không giới hạn loại lệnh theo nguồn.
- **R7 · Web Push thêm một khóa và một đường gọi ra ngoài.** Khóa VAPID lộ thì kẻ khác gửi chuông giả; endpoint do
  điện thoại đăng ký là URL kẻ tấn công chọn được (SSRF).
- **R8 · Chữ tự do từ mạng đi vào prompt.** Khung Tể tướng và chat triệu hồi biến tin nhắn từ điện thoại thành đầu
  vào của model, kèm đường đốt mana từ xa.
- **R9 · Bài học nhập là tiêm prompt bền.** Một dòng xấu được chép vào mọi phiên, kể cả phiên nghiệm thu.

## Tài sản

| Tài sản | Ở đâu | Mất thì sao |
|---|---|---|
| Đăng nhập của các tộc | thư mục nhà của chủ nhân, hoặc `tribes[].tool.config_dir` | người khác tiêu hạn mức, tài khoản bị khóa |
| Token GitHub | kho credential của git (GCM, osxkeychain), lấy bằng `git credential fill` | push, merge, đọc mọi repo token với tới |
| Kho bảo vật | `~/.elvaria/treasury.json`, JSON thường | lộ mọi secret đã gửi vào, sau này cả khóa VAPID |
| Khóa VAPID (P2-08) | dự định trong kho bảo vật | gửi chuông giả tới máy đã đăng ký |
| Phiên của Sứ giả (P2-01) | dự định `<kingdom>/.state/` | ghi lệnh thay chủ nhân |
| Code lãnh thổ | repo chủ nhân gắn vào, worktree `.elvaria/worktrees/` | lộ mã nguồn; commit xấu vào nhánh gốc |
| Kingdom | thư mục ngoài repo: quest, event log, `.runs/`, kinh, bản ghim | sửa trạng thái, giả lệnh, chạy code qua adapter |
| Mana | hạn mức tài khoản các tộc | hết hạn mức, tiền API |

## Ranh giới tin cậy

1. **Máy chủ nhân ↔ bên ngoài.** Tới giai đoạn 1.5 không có cổng nghe nào; Elvaria chỉ gọi ra (CLI của tộc, GitHub).
2. **Nhiếp chính ↔ thư mục kingdom.** Nhiếp chính tin mọi file trong kingdom.
3. **Nhiếp chính ↔ phiên nhân vật** (worktree). Phiên chạy cùng người dùng hệ điều hành; ngăn cách bằng luật của CLI
   và hook, không phải sandbox (trừ Codex, mà sandbox rào ghi và mạng, không rào đọc: SEC-01, 2026-11-21).
4. **Nhân vật ↔ nội dung lãnh thổ và web.** File trong repo, kết quả WebFetch/WebSearch là dữ liệu, có thể mang lệnh.
5. **Elvaria ↔ CLI của tộc.** Binary bên thứ ba tự cập nhật; adapter chủ nhân viết chạy với quyền của chủ nhân.
6. **Mạng (giai đoạn 2):** trình duyệt trên máy ↔ Sứ giả; điện thoại ↔ đường hầm ↔ Sứ giả; Nhiếp chính ↔ dịch vụ
   push; điện thoại ↔ Tể tướng và phiên đang chạy.
7. **Vương quốc khác ↔ kinh** (bài học nhập).

## Đường tấn công

Cột STRIDE: S giả danh, T sửa đổi, R chối bỏ, I lộ tin, D từ chối dịch vụ, E leo quyền. Mức: Cao, Vừa, Thấp.

### Ranh giới 3 và 4: phiên nhân vật, nội dung lãnh thổ

| # | Đường | Đang có | Chỗ hở | Mức |
|---|---|---|---|---|
| A1 | I, E: phiên đọc secret ngoài plot bằng tool đọc | Tool đọc ngoài plot bị từ chối: `packages/hooks/src/outside.ts:29-43`; `.env` cấm đọc ghi: `packages/runner-core/src/policy/constants.ts:38`; đường cấm khớp mọi chữ của dòng shell: `packages/hooks/src/laws.ts:171-184` | Hàng rào chỉ áp cho tool đọc (`outside.ts:34`), không cho dòng shell. (Sửa tại chỗ 2026-11-21, SEC-01: chỗ chứa bí mật ngoài mọi lãnh thổ, `secret_paths` của `packages/runner-core/src/policy/constants.ts`, bị từ chối cả trong đường dẫn của tool lẫn trong chữ của dòng shell, ở cả ba tộc: `packages/hooks/src/secret-place.ts`; hàng rào trên dòng lệnh, không là sandbox) | Thấp |
| A2 | I, E: code phiên khởi động (`pnpm test`, `node`, `pnpm install`) đọc kho bảo vật, `~/.ssh`, kho credential, rồi gửi ra mạng | Shell theo danh sách cho phép của nghề (`packages/registry-default/classes.json`); env tối thiểu, không có secret ngoài `secrets_required` (`packages/runner-core/src/treasury/session-env.ts:28-38`); `git push` cấm (`constants.ts:25`) | Env tối thiểu vẫn có `HOME`/`USERPROFILE`/`APPDATA` (`treasury/minimal-env.ts:11-26`) vì CLI cần để tìm đăng nhập; test là code tùy ý; không chặn mạng. ADR 0007 đã nói "hàng rào, không phải sandbox" | **Cao** |
| A3 | I, E: shell của Codex | Sandbox `workspace-write`/`read-only`, thư mục tạm ngoài vùng ghi (`packages/runner-codex/src/args.ts:45-50`) | Theo code: mạng bật (`args.ts:50`), sandbox không chặn đọc ngoài plot, và `policy.json` không mang danh sách lệnh cho phép (`packages/hooks/src/policy.ts:82-91`), nên hook chỉ gác theo tên tool, deny và luật. Chưa thử bằng CLI thật. (Sửa tại chỗ 2026-11-21, SEC-01, đo trên codex-cli 0.171.0-alpha.13, [cli-facts 2026-11-21](../reference/cli-facts-2026-11-21.md) §2: sandbox đọc được mọi file, cả ở `read-only`; mạng nay tắt, cả `127.0.0.1` (`args.ts:52`, chủ nhân chốt); hook rào chỗ bí mật trên dòng lệnh như hai tộc kia, không thêm danh sách lệnh cho phép vì shell là tool đọc của Codex. Còn hở: chương trình mà lệnh khởi động đọc được chỗ bí mật, và model đọc được thì đưa được vào câu trả lời) | Vừa (trước SEC-01: **Cao**) |
| A4 | T: tiêm prompt từ file lãnh thổ hay trang web khiến phiên làm A2, hoặc viết code xấu | WebFetch chỉ cho do thám và phán quan; phán quan không Edit/Write; check máy là trọng tài; verifier khác người làm (ADR 0008) | Do thám có WebFetch và đọc được cả plot: nội dung repo đi ra ngoài qua URL. Phán quan có WebFetch cùng `pnpm test` | Vừa |
| A5 | T, E: phiên sửa `.git/config` của lãnh thổ qua code nó chạy (`core.fsmonitor`, `core.sshCommand`, `credential.helper`) để git của Nhiếp chính chạy chương trình lạ | Tool ghi không chạm `.git/**` (`constants.ts:47`); Codex để `.git` chỉ đọc | Git của plot và của giao hàng không tắt các khóa cấu hình đó; `credential fill` chạy trong thư mục lãnh thổ (`apps/cli/src/forge/credential.ts:62`) | Vừa |
| A6 | T: phiên ghi vào kingdom (`inbox/`, `adapters/`) qua code nó chạy | Tool ghi chỉ trong plot và lá thư bàn giao; hook đóng khi không đọc được policy | Xem R2: không có gì chặn một chương trình con ghi vào kingdom; đường dẫn kingdom nằm trong `ELVARIA_*` | **Cao** |
| A7 | D: phiên đốt mana, treo máy | Cầu dao, trần mana, kill tree (ADR 0009, 0015) | Không thấy chỗ hở mới | Thấp |

### Ranh giới 2: thư mục kingdom

| # | Đường | Đang có | Chỗ hở | Mức |
|---|---|---|---|---|
| K1 | S: file lệnh giả trong `inbox/` | Schema chặt, id ULID, lệnh đã áp thì bỏ qua (ADR 0005); nguồn `chancellor`/`monk` bị giữ trong ủy quyền (`packages/steward/src/inbox/apply.ts:127`) | `source` do người viết file tự khai (`packages/domain/src/schema/command/inbox-command.ts:43`); `cli`, `herald`, `lite` đều là quyền chủ nhân | **Cao** khi có mạng |
| K2 | E: file adapter `<kingdom>/adapters/<name>.mjs` được `import()` vào tiến trình CLI | Chỉ `apps/cli` nạp (`apps/cli/src/tribe/adapter-file.ts:50`); `doctor` in đường dẫn và hash; conformance trước khi bật | Hash chỉ được in, không được ghim: file đổi sau khi bật vẫn được nạp | Vừa |
| K3 | I: secret lọt vào event log, `.runs/`, thư bàn giao | `redact` ở hook trước khi ghi (`packages/hooks/src/write.ts`), runner (`runner/run-log.ts`, `run-output.ts`), log của check (`checks/masked-log.ts`), store (`packages/store/src/texts.ts`, `entities.ts`), và quét trước khi push (`packages/steward/src/forge/scan.ts:117`) | Mẫu chỉ biết 12 dạng; secret dạng lạ không nằm trong kho bảo vật thì lọt. Chấp nhận được | Thấp |
| K4 | I: kho bảo vật là JSON thường | Từ chối file cho nhóm/người khác đọc trên macOS/Linux (`packages/runner-core/src/treasury/treasury.ts:60-63`); lỗi không bao giờ in giá trị | Windows không kiểm ACL; chưa có adapter keychain | Thấp |

### Ranh giới 5: CLI của tộc, giao hàng, chuỗi cung ứng

| # | Đường | Đang có | Chỗ hở | Mức |
|---|---|---|---|---|
| C1 | E: tiến trình con nhận env thừa hoặc chạy qua shell | Mọi chỗ spawn ngoài test đều `shell: false`, env dựng theo tên (11 chỗ trong `packages/` và `apps/`, lệnh ở cuối file); `GIT_*` bị bỏ (`packages/runner-claude/src/session.ts:191`, `runner-core/src/process/program.ts:70`) | Hai chỗ của phép thử conformance không nêu `env` nên thừa hưởng env của CLI (`packages/runner-core/src/conformance/spawn-probe.ts:57,63`); chỉ FakeRunner dùng, chạy script của chính Elvaria | Thấp |
| C2 | I, E: token giao hàng | Lấy mỗi lần, không giữ, không hiện cửa sổ (`apps/cli/src/forge/credential.ts:36-39,55-74`); chỉ push `quest/<id>`, không force (ADR 0023); nhân vật không bao giờ push | Token GCM thường là OAuth cả tài khoản; `pr_merge` cùng ủy quyền đóng dấu cho phép merge không người nhìn trong giới hạn `max_diff_lines` | Vừa |
| C3 | T: dependency xấu hoặc có lỗ hổng | `pnpm audit --prod` hôm nay (2026-11-20): không có lỗ hổng; một GHSA bỏ qua có lý do (`pnpm-workspace.yaml:10-16`); `onlyBuiltDependencies` tường minh | Audit chỉ ở CI tay; không có thời gian chờ cho bản mới phát hành; giai đoạn 2 thêm 7 dependency (`ws`, `web-push`, Vite, Preact…) | Vừa |
| C4 | T: CLI tự cập nhật đổi mặc định | Ghim phiên bản, `doctor` báo lệch, conformance sau `upgrade` (ADR 0026) | Không thấy chỗ hở mới | Thấp |

### Ranh giới 6: mạng (chưa có code, đánh giá theo kế hoạch)

| # | Đường | Kế hoạch đang ghi | Chỗ hở | Mức |
|---|---|---|---|---|
| N1 | S, E: trang web bất kỳ gọi Sứ giả trên 127.0.0.1 (CSRF, WebSocket từ origin khác, DNS rebinding) | Chỉ nghe 127.0.0.1 (`docs/plans/phase-2.md` dòng P2-01) | Trình duyệt không áp same-origin cho WebSocket; cookie không đủ nếu không kiểm `Origin` và `Host` | **Cao** |
| N2 | S: tiến trình khác trên máy (kể cả code của một phiên, A2) gọi Sứ giả | Chưa có | Cần xác thực cả trên loopback | **Cao** |
| N3 | S, E: điện thoại mất, cookie lộ | "ghép đôi một lần rồi cookie HttpOnly" (đề xuất) | Chưa có thu hồi theo thiết bị, hạn phiên, giới hạn loại lệnh | **Cao** |
| N4 | I: snapshot và delta mang secret hoặc đường dẫn máy | "che secret trước khi gửi" | Cần cùng redactor với event log, và test | Vừa |
| N5 | D: khung WebSocket lớn, quá nhiều kết nối, bão lệnh | Chưa có | Cần trần kích thước, số kết nối, nhịp lệnh | Vừa |
| N6 | I: đường hầm lộ ra internet | Tailscale, "không lộ ra internet công cộng" (`phase-2.md` §6) | Chưa chốt; Funnel hay Cloudflare công khai biến N1–N3 thành tấn công từ xa | **Cao** |
| N7 | T: SSRF qua endpoint push do điện thoại đăng ký | Chưa có | Nhiếp chính sẽ POST tới URL đó: phải giới hạn theo máy chủ push đã biết | Vừa |
| N8 | I: nội dung chuông hiện trên màn hình khóa; khóa VAPID nằm trong tiến trình có mạng | Khóa trong kho bảo vật | Sứ giả không được đọc kho bảo vật; chuông chỉ mang tên việc và loại | Vừa |
| N9 | T, D: chữ từ điện thoại vào Tể tướng và phiên đang chạy | Tể tướng không có tool (`classes.json`: `allow: []`); lệnh của nó trong ủy quyền | Chưa có trần độ dài, nhịp, mana cho lượt gọi từ điện thoại | Vừa |
| N10 | R: không biết lệnh nào tới từ thiết bị nào | Event `command.*` có `source` | Thiếu mã thiết bị trong event | Thấp |

### Ranh giới 7: bài học nhập

`docs/plans/lesson-sharing.md` §6 (T1–T9) đã đủ cho nội dung: file gói do chủ nhân đưa bằng đường dẫn, chỉ dữ liệu,
vùng chờ không vào prompt, kiểm ký tự ẩn, URL, đường dẫn tuyệt đối, chủ nhân nhận từng dòng. Thiếu hai điều: lệnh nhập
đi từ mạng thì thuộc nhóm cần passkey và chỉ trỏ tới file gói đã nằm trên máy, nội dung gói không đi qua Sứ giả (nếu
không, R6 nối sang R9); và vùng chờ in ra terminal phải bỏ ký tự điều khiển. Mức: Vừa, và bằng không chừng nào lệnh
nhập chưa được dựng.

## Biện pháp bắt buộc

**Trước P2-01** (là điều kiện xong của P2-01, không phải task riêng):

1. Xác thực theo [ADR 0031](../adr/0031-herald-pairing-and-session-cookie.md): ghép đôi một lần, cookie phiên, kiểm
   `Origin` và `Host` ở mọi request và ở bước nâng cấp WebSocket; có test cho ba ca: thiếu cookie, origin lạ, host lạ.
2. Sứ giả tự đóng `id`, `ts`, `source` cho lệnh; client chỉ gửi `kind` và `payload`. Loại lệnh được phép theo nguồn
   là một hàm thuần trong domain, Nhiếp chính kiểm lại khi áp (inbox là file, K1).
3. Sứ giả chạy bằng env tối thiểu, không đọc kho bảo vật, không import tầng việc (`boundaries.mjs` đã chặn).
4. Trần: kích thước khung WebSocket, số kết nối, số lệnh mỗi phút, số lần ghép đôi sai.
5. File tĩnh: không thoát khỏi thư mục build; header `Content-Security-Policy: default-src 'self'`,
   `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`; không header CORS.
6. Snapshot và delta đi qua cùng redactor với event log; test dùng fixture secret của eventlog.

**Trước P2-07 và P2-08:**

7. Ba nhóm lệnh cho nguồn `lite` (B3, đã chốt): việc hằng ngày đi thẳng; đóng dấu, giao hàng, nâng trần và mọi lệnh
   đổi cấu hình tin cậy cần một lần xác nhận passkey ký trên chính lệnh đó (V8).
8. Endpoint push chỉ nhận khi máy chủ thuộc danh sách dịch vụ push đã biết, `https`, không theo redirect.
9. Khóa VAPID chỉ tiến trình gửi chuông đọc; nội dung chuông không mang câu hỏi, diff hay đường dẫn.
10. Mỗi thiết bị một phiên, thu hồi được từng cái; event lệnh mang mã thiết bị.
11. Nút "nâng trần" trên chuông có trần riêng do chủ nhân đặt; đổi mức trần cần xác nhận passkey (B10).

**Trước P2-09 và P2-10:** trần độ dài và nhịp cho chữ từ điện thoại; trần mana mỗi ngày cho lượt Tể tướng do điện
thoại gọi; chữ của người dùng vào prompt như dữ liệu có khung, không nối vào chỉ dẫn.

**Trước khi bật nhập bài học:** T1–T9 của `lesson-sharing.md` §6, một ADR, và hai điều ở mục "Ranh giới 7".

**Chỗ hở hiện tại nên vá sớm:** A2/A3 (việc V1), A5 (V2), C3 (V4, V5), và ghi rõ giới hạn cho chủ nhân (V6).

## Việc

Đề xuất, chưa có id; phiên điều phối mở task. Cột cuối theo luật (359): việc S–M máy móc một vùng thì giao quest, việc
lõi khó hay cần phán đoán thiết kế thì một phiên tự làm.

| Việc | Cỡ | `scope_paths` | Điều kiện xong | Ai làm |
|---|---|---|---|---|
| V1 · Hàng rào shell cho chỗ chứa bí mật: dòng shell nhắc tới file kho bảo vật, `.ssh`, `.git-credentials`, thư mục cấu hình của tộc, hay `git credential` thì bị từ chối ở cả ba tộc | M | `packages/runner-core/src/policy/**`, `packages/hooks/src/**` (thực tế SEC-01 chạm thêm `runner-core/src/conformance/**` và `src/runner/**`, CLI giả của ba adapter cùng hook giả của `runner-claude/fixtures`, `runner-codex/src/**` cho mạng, `eslint-suppressions.json`) | Kịch bản conformance mới bị từ chối ở Claude, agy, Codex; README nói rõ đây là hàng rào | Phiên tự làm (hook là `protected_paths`, lõi bảo mật) |
| V2 · Git của Nhiếp chính không nghe cấu hình repo: `credential fill` chạy ngoài thư mục lãnh thổ; git của plot và giao hàng thêm `-c core.fsmonitor=false`, bỏ `core.sshCommand` | S | `apps/cli/src/forge/credential.ts`, `packages/runner-core/src/plot/git.ts`, `packages/steward/src/forge/git.ts` | Test: repo có `credential.helper` và `core.fsmonitor` độc không chạy chương trình nào | Phiên tự làm (đổi một lựa chọn của PS-08, B5) |
| V3 · Ghim hash của file adapter trong `kingdom.tribes[]`; lệch thì không nạp | S | `apps/cli/src/tribe/**`, schema tộc | Test: file đổi sau khi bật thì `run` từ chối và nêu cách bật lại | Giao quest (cần dấu vua vì chạm schema) |
| V4 · Quét secret của chính repo trước commit bằng mẫu `redact` sẵn có, và `pnpm audit:prod` cho lượt merge | S | `scripts/**`, `package.json`, `.husky/**` | Commit có token giả bị chặn; `pnpm check` vẫn không cần mạng | Giao quest |
| V5 · `minimumReleaseAge` trong `pnpm-workspace.yaml` | S | `pnpm-workspace.yaml`, `docs/implementation-plan/7-tooling-and-ci.md` | `pnpm install` từ chối bản phát hành mới hơn ngưỡng | Phiên điều phối làm thẳng |
| V6 · Mục "Bảo mật" trong hướng dẫn vận hành: lãnh thổ là code tin như chính mình, token hẹp, kho bảo vật chỉ giữ secret phạm vi hẹp | S | `docs/guides/operating-a-kingdom.md` | Có mục, `pnpm docs:check` xanh | Giao quest (thư lại) |
| V7 · `doctor` cảnh báo kho bảo vật trên Windows khi ACL cho người khác đọc | S | `apps/cli/src/doctor/**` | Test riêng cho Windows | Giao quest, chờ được |
| V8 · Xác nhận passkey (WebAuthn) của Sứ giả: đăng ký khóa lúc ghép đôi, chữ ký trên mã băm của `kind` và `payload`, kiểm bằng `node:crypto`, không dependency mới | M | `packages/herald/**`, `apps/lite/**`, hàm nhóm lệnh trong `packages/domain` | Test: lệnh nhóm hai và ba thiếu chữ ký, chữ ký của lệnh khác, hay khóa đã thu hồi đều bị từ chối | Phiên tự làm (lõi bảo mật), trước P2-07 |

Cổng máy muốn thêm, không cái nào cần dependency mới:

- **Quét secret trước commit** (V4): dùng `packages/eventlog/src/redact-patterns.json`, cùng mẫu với cổng trước push
  của PS-08d, nên không thêm công cụ ngoài.
- **`pnpm audit --prod` ở lượt merge** (V4): cần mạng nên không vào `pnpm check`; phiên điều phối chạy trước mỗi lần
  merge có đổi `pnpm-lock.yaml`.
- **`minimumReleaseAge`** (V5): thiết lập sẵn của pnpm, chặn bản vừa phát hành trong vài ngày đầu, lúc phần lớn gói
  bị chiếm được phát hiện. Kiểm tên thiết lập theo tài liệu của bản pnpm đang ghim khi làm.

## Quyết định cho chủ nhân

Đã chốt cả ngày 2026-11-20; các khuyến nghị dưới đây giữ làm lý do, kết quả ở mục "Quyết định" cuối file.

**Phải chốt trước P2-01:**

- **B1 · Xác thực của Sứ giả.** Khuyến nghị: duyệt ADR 0031 (mã ghép đôi dùng một lần, cookie `HttpOnly` +
  `SameSite=Strict`, kiểm `Origin`/`Host`, thu hồi theo thiết bị). Thay câu "token Bearer trong header" của §8.
- **B2 · Đường hầm.** Khuyến nghị: Tailscale trong tailnet riêng (`tailscale serve`, có HTTPS cho service worker);
  không Funnel, không Cloudflare công khai; Sứ giả không có cờ nghe ngoài 127.0.0.1.
- **B3 · Điện thoại được ra lệnh gì.** **Đã chốt 2026-11-20** (mục "Quyết định"): mọi lệnh đều làm được từ điện
  thoại, chia ba nhóm theo hậu quả; hai nhóm sau cần xác nhận passkey. Cơ chế nhóm theo nguồn nằm trong P2-01.
- **B4 · Chấp nhận R1 có điều kiện.** Khuyến nghị: không dựng sandbox hệ điều hành trong giai đoạn 2; làm V1 và V6;
  ghi thành luật vận hành "chỉ gắn lãnh thổ mà bạn tin code của nó như code của mình". Lý do: sandbox thật là việc
  cỡ L trên Windows, còn rủi ro chính (tiêm prompt dẫn tới lộ secret) giảm được nhiều bằng token hẹp (B5).

**Chờ được:**

- **B5 · Token giao hàng hẹp.** Khuyến nghị: token fine-grained chỉ cho repo lãnh thổ (contents và pull requests),
  và V2. Nên xong trước khi bật `pr_merge` cho lãnh thổ thứ hai.
- **B6 · Cổng audit và quét secret (V4).** Khuyến nghị: làm, theo cách không cần mạng trong `pnpm check`.
- **B7 · `minimumReleaseAge` (V5).** Khuyến nghị: 7 ngày, làm trước khi thêm 7 dependency của giai đoạn 2.
- **B8 · Kho bảo vật trên Windows.** Khuyến nghị: V7 bây giờ; adapter keychain khi khóa VAPID vào kho (P2-08).
- **B9 · Nhập bài học.** Khuyến nghị: giữ đóng tới khi có ADR. Theo B3, lệnh nhập từ điện thoại cần passkey và chỉ
  trỏ tới file gói đã nằm trên máy.
- **B10 · Trần cho điện thoại.** Khuyến nghị: trần mana mỗi ngày cho lượt Tể tướng và cho nút "nâng trần", đặt
  trong `kingdom.json`; đổi mức trần từ điện thoại cần passkey (B3). Chốt trước P2-08.
- **B11 · Ghim hash adapter (V3).** Khuyến nghị: làm, cỡ S.

## Lệnh để kiểm lại

Chạy từ gốc repo, Git Bash:

```bash
# mọi chỗ spawn ngoài test
grep -rnE "\b(spawn|spawnSync|execFile|execFileSync|execSync|fork)\(" --include=*.ts --include=*.mjs \
  packages apps scripts .claude/hooks | grep -vE "node_modules|\.spec\.|/fixtures/|__fixtures__|/dist/|/test/"
# shell: true và process.env nguyên khối
grep -rnE "shell:\s*true|env:\s*process\.env" --include=*.ts --include=*.mjs packages apps scripts \
  | grep -vE "node_modules|\.spec\.|/fixtures/|/dist/"
# chỗ gọi redact
grep -rlE "createRedactor\(|redactDeep\(|maskLogFile\(" packages apps --include=*.ts | grep -vE "spec|__fixtures__"
# quyền của từng nghề
node -e "for (const c of JSON.parse(require('fs').readFileSync('packages/registry-default/classes.json','utf8')).classes) console.log(c.id, JSON.stringify(c.tools))"
pnpm audit --prod
```

`env: process.env` còn hai chỗ, cả hai đúng: hook đọc env của chính nó (`packages/hooks/src/elvaria-hook.ts:23`) và
CLI đọc env của nó để dựng env tối thiểu (`apps/cli/src/node-io.ts:30`); không chỗ nào truyền cho tiến trình con.

## Quyết định

**B3, chốt 2026-11-20** ([§11, 2026-11-20](../implementation-plan/11-2026-11-20.md)). Chủ nhân không muốn việc nào
buộc phải ngồi máy. Xác thực theo thiết bị cùng Tailscale đủ cho phần mạng; điều còn hở là điện thoại đang mở khóa vào
tay người khác, và passkey đóng chỗ đó. Mọi lệnh làm được từ điện thoại đã ghép đôi, chia theo hậu quả:

| Nhóm | Lệnh | Từ điện thoại |
|---|---|---|
| 1 · Vận hành hằng ngày | xem, trả lời câu hỏi, thử lại, tạm dừng, tạo và sửa quest, quyết thư, triệu hồi, gọi Tể tướng | Đi thẳng |
| 2 · Hậu quả lớn | đóng dấu, giao hàng, nâng trần mana | Xác nhận passkey |
| 3 · Đổi cấu hình tin cậy | lãnh thổ và chế độ giao hàng, tộc và adapter, tên secret, giới hạn ủy quyền, mức trần, ghép thiết bị mới, `upgrade`, nhập bài học | Xác nhận passkey |

Ba điều đi kèm, chủ nhân chốt cùng ngày:

- Lần ghép đôi đầu tiên và passkey đầu tiên vẫn bắt đầu từ mã in trên máy; thiết bị và passkey về sau thêm được từ
  một thiết bị đã có passkey.
- Lệnh nhóm 3 từ điện thoại chỉ trỏ tới thứ đã nằm trên máy (file adapter, file gói bài học, repo); Sứ giả không nhận
  nội dung file qua mạng. Passkey chứng minh ai ra lệnh, không chứng minh file sạch.
- Nhiều lệnh nhóm 3 hôm nay là ngoại lệ của ADR 0005 (CLI ghi file thẳng), chưa có loại lệnh `inbox/`. Chúng tới được
  điện thoại khi loại lệnh tương ứng được dựng; đợt 1 có nhóm 1, nhóm 2 và cơ chế passkey.

**B1, B2, B4–B11, chốt 2026-11-20**, tất cả theo khuyến nghị:

- **B1:** ADR 0031 chuyển sang Accepted; câu "token Bearer trong header" của §8 hết hiệu lực.
- **B2:** Tailscale trong tailnet riêng (`tailscale serve`); không Funnel, không Cloudflare công khai; Sứ giả chỉ nghe
  127.0.0.1.
- **B4:** không dựng sandbox hệ điều hành trong giai đoạn 2; làm V1 và V6; luật vận hành "chỉ gắn lãnh thổ mà bạn tin
  code của nó như code của mình".
- **B5:** token fine-grained chỉ cho repo lãnh thổ, và V2; xong trước khi bật `pr_merge` cho lãnh thổ thứ hai.
- **B6:** làm V4 (quét secret trước commit, `pnpm audit --prod` ở lượt merge).
- **B7:** `minimumReleaseAge` 7 ngày (V5), trước khi thêm dependency của giai đoạn 2.
- **B8:** V7 bây giờ; adapter keychain khi khóa VAPID vào kho (P2-08).
- **B9:** nhập bài học giữ đóng tới khi có ADR; từ điện thoại thì theo nhóm 3 của B3.
- **B10:** trần mana mỗi ngày cho lượt Tể tướng và nút "nâng trần"; đổi mức trần từ điện thoại cần passkey.
- **B11:** ghim hash file adapter (V3).

Việc V1–V8 chưa có id: phiên điều phối mở task và xếp thứ tự.
