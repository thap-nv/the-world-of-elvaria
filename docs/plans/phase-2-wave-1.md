# Đợt 1 của giai đoạn 2 — P2-01, P2-03, P2-04, P2-06: kế hoạch chi tiết

Ngày: 2026-11-21 · Trạng thái: **đề xuất, chờ chủ nhân chốt** các quyết định W1–W15 ở cuối file ([§11, 2026-11-21](../implementation-plan/11-2026-11-21.md), dòng "docs/plan-phase-2-wave-1"). Phiên kế hoạch mở theo (364); không sửa code, không mở task. Bất biến đã chốt mà kế hoạch này giữ: luật thư mục R1–R8 ([§4.2](../implementation-plan/4-code-quality.md)), "Cấu trúc đích" và K1–K13 của [architecture-health.md](architecture-health.md), "Biện pháp bắt buộc" và B1–B11 của [phase-2-threat-model.md](phase-2-threat-model.md), [ADR 0031](../adr/0031-herald-pairing-and-session-cookie.md), [ADR 0005](../adr/0005-single-writer-steward-inbox.md), ba tầng tách biệt, và ba ý (383a)–(383c) của chủ nhân về phân quyền theo thiết bị.

Việc vào đợt nào và mở khi nào do phiên điều phối xếp; file này chỉ ghi phụ thuộc.

## Điều code cho thấy (2026-11-21)

Khảo sát ở `6da3de72` (`main` sau tàu H1b). Số dòng nối tiếp bảng của [phase-2-wave-0.md](phase-2-wave-0.md).

| # | Thực tế trong code | Hệ quả |
|---|---|---|
| 43 | `CommandMessageSchema` (`packages/domain/src/protocol/messages.ts`) nhận nguyên một `InboxCommand`: client tự viết `id`, `ts`, `source` (chỉ cấm `cli`). ADR 0031 mục 5 nói ngược lại: client chỉ gửi `kind` và `payload`, Sứ giả đóng phong bì | P2-01 đổi thông điệp `command` của protocol. Câu "protocol cố định từ P0-09, herald và lite không cần đổi domain" của §8 hết đúng (mục "Chỗ kế hoạch cũ nói sai") |
| 44 | `packages/config/boundaries.mjs` đã có `herald` (`deps`: `domain`, `store`, `eventlog`, `sandbox`) và `cli` đã kê `herald`; `herald` không được import `i18n` | P2-01 không sửa `boundaries.mjs`. Sứ giả không có chuỗi hiển thị của riêng nó: trang ghép đôi nhận chữ từ composition root |
| 45 | `digestStateOf` (thuần: `worldStateOf` rồi `reduce` các dòng `mana.*`) nằm ở `packages/steward/src/schedule/digest.ts`; `apps/cli` (`digest`, `watch`) import nó từ `steward` | Sứ giả cần đúng hàm này mà không được import `steward`. Theo R7 nó về `domain` (P2-04) |
| 46 | Phần dựng `StewardNotices` từ file và log được viết hai lần: bản tấu của Nhiếp chính và `apps/cli/src/digest/digest.ts` (khoảng 40 dòng gọi `scopeHoldsOf`, `forgeOutcomesOf`, `baseHoldsOf`, `heldQuestsOf`, `sealSuspendedOf`, `templeNoticesOf`…) | Sứ giả sẽ là bản thứ ba. P2-04 gom thành một hàm thuần trong `domain` |
| 47 | Ba loại chờ chỉ có trong bộ nhớ của Nhiếp chính: `unjudgeable`, `judge_waits`, `tribes_held` (`packages/domain/src/world/attention-notices.ts`). `unclaimable` thì đã có event `quest.unclaimable` và `.state/unclaimable.json`. `elvaria digest` vì thế thiếu hai loại chờ người chấm (PS-03 (a), chốt 2026-11-12: "chỉ Quản sự đang chạy biết"), và khởi động lại thì chuông rung lại | P2-04 thêm event để cả ba suy được từ log |
| 48 | `reduce` bỏ qua `mana.level`, `mana.exhausted`, `mana.restored` có `model` (`packages/domain/src/world/reduce.ts`); `PoolView` chỉ có một dải mỗi pool; `PoolKey.model` đã có | (a) của P1-22: P2-04b thêm trần riêng của model vào `PoolView` |
| 49 | `Notice` (24 loại) là kiểu ở `packages/steward/src/notice.ts`, chỉ sống trong tiến trình Nhiếp chính; `StewardDeps.bell` là một `Bell`; `ConsoleBell` ở `apps/cli/src/run/bell.ts` (188 dòng) nói bằng `cli.run.notice.*`. `agent.notification` là event duy nhất của "chuông" trong log (hook ghi với actor nhân vật, Nhiếp chính với actor `steward`: (d) của P1-33) | Chuông máy tính (P2-03) là `Bell` thứ hai trong cùng tiến trình. `MBell` cần lịch sử, nên luồng của nó phải suy từ log (P2-04b), không từ `Notice` |
| 50 | Chỗ của biên niên sử đã có: `kingdom.schedule.chronicle` (`enabled` mặc định `false`, `at` 21:00), `chronicle` trong `DAILY_JOBS`, `chronicle.written` trong `EVENT_TYPES` (chưa có schema `data`), thư mục `chronicle/` trong `KINGDOM_DIRS`, thuật ngữ `chronicle` trong glossary. Chưa có mã nào chạy job | P2-06 chỉ thêm job và `data` của event; không thêm khóa lịch |
| 51 | Nghề `bard` trong `packages/registry-default/classes.json`: dạng `publish`, mặc định tộc `claude` model `claude-sonnet-5-5`, tool `Read`, `Edit`, `Write`, `Glob`, `Grep`. Job có model theo lịch đã có mẫu: triage của Tể tướng (`ScheduledJob` `off_tick`, composition root tiêm vào, PS-03b) | Nhà thơ viết biên niên sử là một lượt không tool theo mẫu triage, không phải quest `publish` |
| 52 | `DESTINATIONS` của `sandbox replay` chỉ có `terminal` (`apps/cli/src/sandbox/replay.ts:20`); `replaySchedule` của `packages/sandbox` đã thuần và nói trước là Sứ giả dùng lại | `--to herald` là một đích mới, không đổi `sandbox` |
| 53 | Phong bì event có `territory` và `quest` tùy chọn; `QuestView.territory` bắt buộc; `MemoView.quest` và `CharacterView.current.quest` trỏ về quest; `pools`, `tribes`, `campaigns` là của cả vương quốc | Lọc theo lãnh thổ làm được bằng hàm thuần trên `WorldState` và `Event[]` |
| 54 | `InboxCommand` không có trường thiết bị; `command.applied` và `command.rejected` chỉ ghi `source` khi lệnh không phải của chủ nhân | N10 và việc Nhiếp chính kiểm lại vai cần trường `device` trên lệnh và trên hai event đó |
| 55 | Không có khái niệm quest chỉ đọc. `forgeDue` nhận mọi quest `done` có nhánh trên lãnh thổ không `manual`, kể cả dạng `research`: nhánh được push và PR được mở. Nghề `scout` có `Edit`, `Write`, `WebFetch`, `WebSearch`; dạng `analyze` (cũng `report`) có `Bash(node:*)` | "Hỏi đáp không sửa gì" (383a) không suy ra được từ dạng hay nghề hôm nay. Cần một dấu trên quest do Nhiếp chính đóng (P2-01d) |
| 56 | SEC-01 đã merge: `SECRET_PATHS` (9 glob) có trong mọi `ToolPolicy` và `policy.json` (`secret_paths`), hook từ chối ở cả bốn dialect; `.env` cấm đọc ghi; `redact` chạy trước khi ghi ở hook, runner và store | "Không tra được secret" dựa trên hàng rào đã có; Sứ giả chỉ gửi thứ đã che lúc ghi, rồi che thêm bằng mẫu |
| 57 | `packages/i18n/src/locales/` còn hai file `en.json`, `vi.json`; AH-04 (đợt H2) tách theo namespace. Gốc `packages/steward/src` còn 25 file chạy; AH-05, AH-06 dọn | Task của đợt 1 mở sau H2 (đã chốt ở (363)): chuỗi mới vào file namespace riêng, file mới của `steward` vào thư mục khái niệm theo bản đồ AH-06 |
| 58 | `packages/herald` chưa tồn tại; `ws` chưa có trong lockfile. `minimumReleaseAge` 7 ngày đang bật (SEC-05) | Dependency mới của đợt 1 chỉ có `ws` (bản đủ 7 ngày tuổi); xem W9 cho chuông |

### Chỗ kế hoạch cũ nói sai so với code hay với quyết định sau nó

- §8 "Giai đoạn 2", [phase-2.md](phase-2.md) dòng P2-01 và §10 câu 3: "token Bearer trong header". ADR 0031 đã thay; phiên này sửa hai chỗ sau.
- §8 "Giai đoạn 2": "protocol … sống trong `domain/src/protocol` từ P0-09, nên herald và lite không cần đổi domain". Sai từ ADR 0031 mục 5 (dòng 43). Câu đó nằm trong đoạn lịch sử của §8; kế hoạch này là nguồn đúng, task P2-01 sửa câu đó khi làm.
- Kế hoạch sản phẩm 0.8 và [§6](../implementation-plan/6-windows-and-macos.md): chuông máy tính bằng `node-notifier`. W9 đề xuất không dùng dependency; nếu chủ nhân nhận, P2-03 sửa §6 tại chỗ.
- [phase-2.md](phase-2.md) P2-04: "thông báo của hook và của Nhiếp chính thành một luồng cho `MBell`". (d) của P1-33 chỉ nói hai nguồn `agent.notification` hiển thị như nhau; `MBell` của thiết kế còn có dòng "đã đóng dấu", "cả tộc ngủ", "biên niên sử". Kế hoạch này hiểu "một luồng" là một hàm suy từ log (P2-04b).
- Dòng PS-03 ở §8 ghi (a) vào "P2-03"; (a) thuộc P2-04 ([phase-2.md](phase-2.md) đã ghi đúng).
- Dòng SEC-08 ở §8 ghi "ba nhóm lệnh của B3 là hàm thuần trong domain" trong SEC-08, còn biện pháp bắt buộc 2 đặt cơ chế đó vào P2-01. Kế hoạch này đặt hàm nhóm lệnh vào P2-01; SEC-08 dùng nó.
- `main` đang có hai dòng **AH-13** trùng nhau trong `11-2026-11-21.md` (dòng 15 và 19 của file): không thuộc nhánh này, báo phiên điều phối.

## Phân quyền theo thiết bị: thiết kế chung

Yêu cầu của chủ nhân (383) và ba ý đã chốt (383a)–(383c). Phần này là nền cho P2-01, P2-01b, P2-01c, P2-01d và SEC-08.

- **Ba vai** (id tiếng Anh, tên hiển thị qua i18n; W3): `full` (toàn quyền), `scoped` (làm việc trên các lãnh thổ được cấp), `inquiry` (hỏi đáp trên các lãnh thổ được cấp). `scoped` và `inquiry` mang `territories` không rỗng; `full` không mang.
- **Lưu ở đâu** (W2, khuyến nghị): mỗi thiết bị một file `devices/<id>.json`, schema `device` v1 trong `packages/domain/src/schema/` (`version`, `id` dạng `dev_…`, `label`, `role`, `territories`, `created_at`, `revoked_at` tùy chọn). Lý do: vai là cấu hình tin cậy, không phải cache của `.state/`; Nhiếp chính đọc được qua `store` mà không biết Sứ giả; mỗi thao tác là một lần ghi nguyên tử lên một file nhỏ. `.state/herald-sessions.json` chỉ còn mã băm phiên → `device`, `created_at`, `last_seen_at`, và chỉ Sứ giả ghi. Phiên hợp lệ khi: mã băm khớp, file thiết bị còn và chưa `revoked_at`, chưa quá 30 ngày không dùng.
- **Ai cấp và đổi vai** (383c):
  - Từ máy (P2-01b): `elvaria herald pair --role <vai> [--territory <id>]… --label <tên>` tạo file thiết bị và in mã ghép đôi; `elvaria herald device <id> --role … --territory …` đổi; `elvaria herald revoke <id>|--all` đặt `revoked_at`. Đây là ngoại lệ mới của ADR 0005 chỉ ở `apps/cli` (như `tribe add`, `territory delivery`): ghi vào [.claude/rules/cli.md](../../.claude/rules/cli.md) và ADR.
  - Từ thiết bị `full` có passkey (SEC-08): ba kind inbox mới thuộc nhóm 3 (`pair_device`, `set_device`, `revoke_device`), Nhiếp chính áp và ghi file thiết bị. P2-01 không dựng ba kind này.
  - Thu hồi có hiệu lực ngay: Sứ giả đọc lại file thiết bị ở mỗi request, mỗi lệnh, và mỗi nhịp đọc log (đóng socket của thiết bị đã thu hồi).
- **Hàm quyết định** (thuần, `packages/domain/src/device/`): `commandGroupOf(kind, payload)` trả nhóm 1, 2, 3 của ADR 0031; `commandScopeOf(command, world)` trả lãnh thổ mà lệnh chạm hoặc `kingdom`; `deviceMay({ source, device, group, scope, confirmed, quest })` trả `Result` với mã từ chối. Hai bảng `COMMAND_GROUPS` và `COMMAND_SCOPES` có kiểu `Record<InboxCommandKind, …>`: thêm một kind mà thiếu dòng thì `tsc` đỏ. Không `switch` theo kind ngoài hai bảng dữ liệu đó.
  - Nhóm (đề xuất, task chốt từng dòng theo bảng B3): nhóm 2 gồm `seal`, `deliver`, `edit_quest` khi payload nâng trần mana hay số lần thử; nhóm 3 gồm `attach_territory`, `resume_delegation` và ba kind thiết bị; còn lại nhóm 1.
  - Phạm vi: lệnh có `payload.territory` lấy lãnh thổ đó; lệnh có `payload.quest` lấy lãnh thổ của quest; lệnh về thư lấy lãnh thổ của quest mà thư gắn vào. Lệnh không gắn lãnh thổ (`wake`, `suspend`, `release`, `set_level`, `set_model`, `pin_tag`, `send_to_temple`, chiến dịch, thư không có quest) là `kingdom`.
  - Luật: `full` làm mọi lệnh. `scoped` làm mọi lệnh mà phạm vi là một lãnh thổ được cấp, đúng nhóm như `full` (383b); phạm vi `kingdom` và mọi lệnh nhóm 3 thì từ chối. `inquiry` chỉ làm các kind hỏi đáp (dưới), trên lãnh thổ được cấp.
  - Passkey: nguồn `lite` với nhóm 2 hay 3 cần `confirmed` (dấu do SEC-08 thêm). Trước SEC-08 các lệnh đó từ `lite` bị từ chối với mã `passkey_required` (W8). Nguồn `herald` (loopback) không hỏi passkey, đúng ADR 0031.
- **"Hỏi đáp" gồm gì** (383a; W7):
  - Xem: snapshot và `events` đã lọc theo lãnh thổ được cấp.
  - `create_quest` chỉ với dạng có `deliverable_type` là `report`, trên lãnh thổ được cấp; Nhiếp chính đóng `read_only` lên quest (P2-01d).
  - `answer` và `cancel` chỉ trên quest `read_only` của lãnh thổ được cấp.
  - Về sau: lượt Tể tướng (P2-09) chỉ soạn được quest `read_only`; triệu hồi (P2-10) chỉ vào phiên của quest `read_only`. Hai task đó thêm kind của mình vào bảng hỏi đáp.
- **Bảo đảm "không sửa"** (P2-01d): quest `read_only` chạy với `ToolPolicy` đã thu hẹp (không shell, `Edit` và `Write` chỉ vào sản phẩm báo cáo và thư bàn giao, Codex ở sandbox `read-only`), `secrets_required` phải rỗng, `forgeDue` trả `false` (không push, không PR, không merge), không cần và không nhận dấu vua, đất bị trả ngay khi `done`. Dấu `read_only` do Nhiếp chính đóng theo vai của thiết bị ghi trong lệnh, không lấy từ payload.
- **Bảo đảm "không secret"**: phiên của quest `read_only` không nhận secret nào của kho bảo vật; `forbidden_paths` của lãnh thổ, `.env` và `secret_paths` của SEC-01 vẫn áp; khuyến nghị thêm: quest `read_only` không có `WebFetch`, `WebSearch` (nội dung lãnh thổ không ra ngoài qua URL, A4 của threat model). Câu trả lời tới thiết bị là thư bàn giao và báo cáo như `store` đã lưu (đã qua `redact` với giá trị của kho bảo vật lúc ghi), rồi qua redactor theo mẫu của Sứ giả. Sứ giả không mở kho bảo vật.
- **Nhiếp chính kiểm lại** (P2-01): khi áp một lệnh nguồn `herald` hay `lite`, Nhiếp chính đọc file thiết bị theo `command.device` và gọi đúng `deviceMay`; thiếu `device`, thiết bị lạ hay đã thu hồi thì `command.rejected` với mã riêng. Lệnh nguồn `cli`, `chancellor`, `monk` không đổi. Giới hạn đã nhận ở (365): tiến trình cục bộ ghi được `inbox/` vẫn tự khai `source: cli`; lớp kiểm này chặn lỗi của Sứ giả, không chặn người dùng hệ điều hành.
- **Lọc theo lãnh thổ** (W6, khuyến nghị: có): hai hàm thuần `scopeState(state, territories)` và `scopeEvents(events, state, territories)` trong `packages/domain/src/device/`. Thiết bị giới hạn nhận: lãnh thổ được cấp; quest của các lãnh thổ đó; thư gắn với quest đó; nhân vật (tên, nghề, cấp, tộc, trạng thái) với `current` để trống khi quest đang làm nằm ngoài vùng; `pools`, `tribes`, ngưỡng mana (của cả vương quốc, cần để hiểu vì sao việc chờ). Không nhận: lãnh thổ và quest khác, chiến dịch, thư không gắn quest, biên niên sử và bản tấu của cả vương quốc. Event đi theo danh sách cho phép: có `territory` hay `quest` trong vùng, hoặc thuộc nhóm của cả vương quốc đã kê (`mana.*`, `character.*` sau khi xóa `current` ngoài vùng); loại event lạ thì bỏ (đóng khi không chắc). Test tính chất: `scopeState(reduce(s, e))` bằng `reduce(scopeState(s), scopeEvents(e))` với mọi dãy event của bộ sinh sẵn có.
- **ADR** (W4, khuyến nghị): ADR 0032 mới "Paired devices carry a role and a list of territories" (vai, file thiết bị, ai cấp, lọc theo lãnh thổ, quest chỉ đọc), kèm sửa tại chỗ ADR 0031 mục 3 và 5 với ghi chú `(Amended …)`. Viết sau khi chủ nhân chốt W2–W8; nội dung đề xuất là mục này.
- **Chia giữa P2-01 và SEC-08**:

| Phần | Task |
|---|---|
| Schema `device`, `InboxCommand.device`, hai bảng nhóm và phạm vi, `deviceMay`, `scopeState`, `scopeEvents`, Nhiếp chính kiểm lại | P2-01 |
| Lệnh `herald pair --role`, `herald device`, `herald devices`, `herald revoke`; Sứ giả gác theo vai ở mọi request và lệnh | P2-01b, P2-01c |
| Quest `read_only` | P2-01d |
| Đăng ký passkey, kiểm chữ ký, dấu `confirmed` trên lệnh, Nhiếp chính đòi dấu đó với `lite` nhóm 2 và 3 | SEC-08 |
| Ba kind `pair_device`, `set_device`, `revoke_device` (cấp và đổi vai từ thiết bị `full`), phần giao diện của `apps/lite` | SEC-08 |

## P2-01 — Sứ giả lõi: tổng quan và cách chia

- **Mục tiêu**: một tiến trình `elvaria herald` chỉ nghe 127.0.0.1, xác thực theo ADR 0031, gửi trạng thái thế giới đã che và đã lọc cho từng thiết bị, nhận lệnh rồi ghi vào `inbox/`. Sáu biện pháp "Trước P2-01" của threat model là điều kiện xong, chia vào các task con dưới đây.
- **Đọc trước**: ADR 0031, 0005, 0013, 0001; [phase-2-threat-model.md](phase-2-threat-model.md) N1–N5, N10 và "Biện pháp bắt buộc"; §2.7 và dòng P0-09 của [§2](../implementation-plan/2-data-and-events.md); R1–R8.
- **Reduce ở đâu**: cả hai phía, như P0-09 đã định. Sứ giả giữ `WorldState` đầy đủ trong bộ nhớ (dựng từ file, rồi `reduce` từng lô dòng mới), gửi `snapshot` khi client nối và `events` sau đó; client `reduce` bằng cùng hàm. Với thiết bị giới hạn, Sứ giả gửi `scopeState` và `scopeEvents`. Sứ giả không ghi `.state/` snapshot ở đợt 1: dựng lại từ file khi khởi động đủ nhanh, `snapshotOf` và `readSnapshot` để dành tới khi đo thấy cần.
- **Hợp đồng với khách** (W5; đổi `packages/domain/src/protocol/`):
  - Client → Sứ giả: `{ type: 'command', ref, kind, payload }`. `ref` là chuỗi ngắn do client đặt để ghép câu trả lời. Không `id`, `ts`, `source`. SEC-08 thêm trường chữ ký (thêm tương thích).
  - Sứ giả → client: `snapshot`, `events` như cũ; thêm `accepted { ref, command_id }` và `refused { ref, reason }` (lệnh đã ghi vào `inbox/`, hay bị Sứ giả từ chối và vì sao); P2-04 thêm `attention`, P2-04b thêm `bell`.
  - Kết quả của lệnh: dòng `command.applied` hay `command.rejected` mang `command_id`; Sứ giả chỉ chuyển hai loại dòng này cho thiết bị đã gửi lệnh đó.
- **Cổng và địa chỉ** (W12): `kingdom.herald` (tùy chọn, thêm sau v1): `port` mặc định 7411, `origins` (origin của đường hầm, chủ nhân thêm; origin loopback luôn có). `elvaria herald --port <n>` đè cho một lần chạy; test dùng cổng 0. Không có tùy chọn địa chỉ nghe.
- **Nguồn của lệnh**: `herald` khi request tới qua origin loopback, `lite` khi tới qua một origin của `herald.origins` (ADR 0031 mục 5).
- **Chia** (W1):

| Id | Việc | Cần trước | Vùng bảo vệ | File chạm chính |
|---|---|---|---|---|
| P2-01 | Hợp đồng lệnh, thiết bị và vai | H2 (AH-03, AH-04) | schema, `steward` | `p/domain/src/{device,protocol,schema}/**`, `p/store/src/**`, `p/steward/src/inbox/**`, glossary |
| P2-01b | Sứ giả: máy chủ, ghép đôi, phiên | P2-01 | — | `p/herald/**` (mới), `a/cli/src/herald/**`, `commands.ts` |
| P2-01c | Sứ giả: luồng thế giới và lệnh | P2-01b; P2-04 cho `attention` | — | `p/herald/src/{stream,command}/**`, `a/cli/src/sandbox/replay.ts`, `ws` |
| P2-01d | Quest chỉ đọc cho vai hỏi đáp | P2-01 | `hooks`, `runner-core/policy`, schema | `p/domain/src/{dispatch,schema/quest}/**`, `p/runner-core/src/policy/**`, `p/hooks/src/**`, `p/steward/src/inbox/**` |

- **Thư mục của `packages/herald`** (R1–R6 từ commit đầu; tên là đề xuất, task chốt và ghi §11): `src/index.ts` chỉ gom barrel; `src/server/` (listener HTTP, bảng route, header, file tĩnh); `src/pairing/` (mã, số lần sai); `src/session/` (cookie, file phiên, hạn); `src/origin/` (kiểm `Host`, `Origin`); `src/limit/` (trần và nhịp); `src/stream/` (đọc log, trạng thái, gửi theo thiết bị, WebSocket); `src/command/` (phong bì, ghi `inbox/`). Phần thuần (kiểm origin, đọc cookie, đếm nhịp, giải đường dẫn tĩnh) là hàm test không cần socket. Đồ dùng test ở `src/**/__fixtures__/`. Sứ giả là adapter IO: nhận `clock`, nguồn byte ngẫu nhiên, `store`, `log`, `redactor`, chữ của trang ghép đôi và thư mục tĩnh qua tham số.
- **Chỗ chừa cho task khác**: SEC-08 (passkey, ba kind thiết bị); P2-07 (bản build của `apps/lite` làm thư mục tĩnh); P2-08 (đăng ký push là một kind inbox); P2-09, P2-10 (kind mới vào hai bảng nhóm và phạm vi, và vào bảng hỏi đáp); mã QR lúc ghép đôi (W11).

## P2-01 — Hợp đồng lệnh, thiết bị và vai

- **Mục tiêu**: mọi luật "thiết bị nào được gửi lệnh nào, thấy gì" là hàm thuần có test 100 %, và Nhiếp chính áp đúng luật đó, trước khi có dòng mã mạng nào.
- **Đọc trước khi sửa** (CLAUDE.md): `packages/domain/src/schema/**` (ADR 0003); `packages/steward/src/inbox/apply.ts` và spec của nó.
- **Thêm**:
  - `packages/domain/src/device/`: schema và kiểu `Device`, `DeviceRole`; `COMMAND_GROUPS`, `COMMAND_SCOPES`, `INQUIRY_KINDS`; `commandGroupOf`, `commandScopeOf`, `deviceMay`; `scopeState`, `scopeEvents`; barrel `index.ts` (R5). Schema file `device` vào `packages/domain/src/schema/` và `docs/schemas/` qua `pnpm schemas`.
  - `InboxCommand.device` (tùy chọn, thêm sau v1, `version` giữ 1): id thiết bị, chỉ Sứ giả ghi. `CommandResultDataSchema.device` (tùy chọn): N10.
  - Protocol: thông điệp `command` mới, `accepted`, `refused`; `decodeClientMessage` không còn nhận `InboxCommand`. Không client nào đang dùng hợp đồng cũ, nên không cần migration; spec `codec.spec.ts` đổi theo.
  - `kingdom.herald` (`port`, `origins`), tùy chọn với mặc định.
  - `store`: `devices` (đọc, liệt kê, ghi nguyên tử), `kingdomLayout.device(id)`, `devices` trong `KINGDOM_DIRS`; `elvaria migrate` tạo thư mục cho vương quốc cũ.
  - Nhiếp chính: bước kiểm ở đầu `applyCommand` cho nguồn `herald` và `lite`; mã từ chối `unknown_device`, `device_revoked`, `role_forbids`, `outside_territories`, `passkey_required`.
  - Glossary: `device`, ba vai, `pairing`; i18n cho mã từ chối (file namespace riêng sau AH-04).
- **Không làm**: mã mạng; ba kind thiết bị của SEC-08; dấu `read_only` (P2-01d, nhưng `deviceMay` đã nhận `quest.read_only` làm đầu vào tùy chọn để P2-01d không sửa lại chữ ký).
- **Test**: domain 100 %: bảng vai × nhóm × phạm vi đủ mọi ô; mọi kind có dòng ở hai bảng (kiểu và spec); `scopeState` và `scopeEvents` với test tính chất nêu trên; event loại lạ bị bỏ. Steward: lệnh `seal` từ thiết bị `scoped` ngoài lãnh thổ bị `command.rejected`; từ `inquiry` bị từ chối; `create_quest` dạng `build` từ `inquiry` bị từ chối; thiết bị đã thu hồi; lệnh `cli` không đổi (bộ spec `inbox` cũ xanh nguyên).
- **Xong khi**: `pnpm check` và `pnpm -r test` xanh; `pnpm schemas`, `pnpm docs:gen` sạch; vương quốc không có thiết bị nào không đổi hành vi.

## P2-01b — Sứ giả: máy chủ, ghép đôi, phiên

- **Mục tiêu**: `elvaria herald` chạy được, ghép đôi được một trình duyệt trên loopback, và từ chối mọi request không qua xác thực. Chưa có WebSocket.
- **Thêm**:
  - Package `packages/herald` (README đủ bốn mục; `package.json` chỉ phụ thuộc `domain`, `store`, `eventlog`).
  - HTTP bằng `node:http`, bind `127.0.0.1` cứng. Route: `GET /pair?code=…` trả trang xác nhận (không đổi trạng thái); `POST /pair` đổi mã lấy cookie rồi chuyển về `/`; `GET /` và file tĩnh; mọi route khác 404. Trang ghép đôi là HTML không script, form `POST`, chữ do composition root đưa vào.
  - Mã ghép đôi: 128 bit ngẫu nhiên, 5 phút, một lần; `elvaria herald pair` ghi mã băm, hạn và id thiết bị vào `.state/herald-pairing.json` (dưới `withLock` của `store`), Sứ giả đọc và xóa khi dùng; 5 lần sai thì xóa mọi mã đang chờ.
  - Cookie phiên 256 bit, `HttpOnly; SameSite=Strict; Path=/`, thêm `Secure` khi request tới qua HTTPS của đường hầm (theo origin đã khai); Sứ giả chỉ giữ SHA-256, so trong thời gian hằng.
  - Mọi request: `Host` và `Origin` (khi có) phải thuộc danh sách; đổi trạng thái chỉ bằng `POST`; không header CORS. Header của file tĩnh: `Content-Security-Policy: default-src 'self'`, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`; đường dẫn tĩnh không thoát khỏi thư mục build (dùng `staysInside` của `store`).
  - Trần (hằng số có tên trong `src/limit/`): cỡ thân request, số kết nối, số lần ghép đôi sai.
  - Redactor của Sứ giả: `createRedactor` với giá trị đã biết là mã ghép đôi và id phiên; log của Sứ giả đi qua nó.
  - Lệnh CLI trong `apps/cli/src/herald/`: `herald` (chạy), `herald pair`, `herald devices`, `herald device`, `herald revoke`; `docs/cli.md` qua `pnpm docs:gen`. Env của tiến trình là env tối thiểu như mọi lệnh; Sứ giả không import gì của kho bảo vật (đã là luật `boundaries`).
  - `doctor`: một dòng cho `kingdom.herald` (cổng, origin lạ không phải `https`).
- **Windows và macOS**: cổng đang bận thì báo lỗi có mã và thoát khác 0; đóng server khi nhận tín hiệu dừng theo cách `elvaria run` đang làm. Không có đường dẫn riêng của hệ điều hành ngoài thư mục tĩnh.
- **Test** (cổng 0, vương quốc tạm có dấu cách, 0 mana): thiếu cookie ⇒ 401; `Origin` lạ ⇒ 403; `Host` lạ ⇒ 403 (ba ca bắt buộc của threat model); mã đúng ⇒ cookie và file phiên chỉ chứa mã băm; mã dùng lần hai, mã hết hạn, 5 lần sai; thiết bị bị `revoke` ⇒ request kế tiếp 401; `GET` không đổi trạng thái; đường dẫn `..` ⇒ 404; đủ bốn header; không header CORS; log không chứa mã hay id phiên.
- **Xong khi**: `pnpm check` xanh; các ca trên; `pnpm boundaries`, `pnpm layout`, `pnpm knip` sạch với package mới; README của `herald` và `apps/cli` nói đúng.

## P2-01c — Sứ giả: luồng thế giới và lệnh

- **Mục tiêu**: client đã ghép đôi nhận `snapshot` rồi `events` qua WebSocket, đúng phần nó được thấy, và gửi được lệnh vào `inbox/`.
- **Dependency mới**: `ws` (máy chủ WebSocket; Node 24 không có sẵn phía máy chủ). Lý do ghi trong commit; bản phải đủ 7 ngày tuổi.
- **Thêm**:
  - Nâng cấp WebSocket ở `/ws`: cần cookie và `Origin` thuộc danh sách (thiếu `Origin` thì từ chối); trần cỡ khung, số kết nối mỗi thiết bị và tổng.
  - Trạng thái: đọc file qua `store`, dựng bằng hàm của P2-04 (`worldStateOf` cộng mana từ log), rồi `tailEventLog` (polling sẵn có) và `reduce` từng lô. File đọc lỗi thì bỏ qua như Nhiếp chính.
  - Gửi: mỗi kết nối nhận `snapshot` lúc nối, rồi `events`; thiết bị giới hạn qua `scopeState`, `scopeEvents`. Mọi thông điệp qua `redactDeep` với redactor của Sứ giả trước khi mã hóa.
  - Lệnh: `decodeClientMessage` → kiểm nhịp (số lệnh mỗi phút, theo thiết bị) → `deviceMay` → đóng phong bì (`id` ULID, `ts`, `source`, `device`) → `store.inbox` ghi → `accepted`; từ chối thì `refused` với mã. Sứ giả không áp lệnh, không đọc kết quả ngoài hai dòng `command.*`.
  - `elvaria sandbox replay <file> --to herald`: phát một ngày giả qua một Sứ giả chạy trên vương quốc tạm, dùng `replaySchedule`; client thấy `sandbox: true`.
- **Test** (`ws` làm client trong spec): nâng cấp thiếu cookie, `Origin` lạ, thiếu `Origin`; snapshot đầu khớp `worldStateOf`; dòng mới của log tới client theo thứ tự; fixture secret của `eventlog` không lọt vào snapshot hay delta; thiết bị `scoped` không nhận quest ngoài lãnh thổ, kể cả qua event; lệnh hợp lệ thành file `inbox/<ulid>.json` có `source` và `device` do Sứ giả đặt (client gửi kèm `source` thì khung bị từ chối); lệnh nhóm 2 từ origin đường hầm ⇒ `refused passkey_required`; vượt nhịp; khung quá cỡ đóng kết nối; thu hồi thiết bị đóng socket đang mở; hai Sứ giả test chạy song song không đụng nhau (cổng 0, vương quốc tạm riêng).
- **Xong khi**: `pnpm check` xanh; các ca trên; sáu biện pháp "Trước P2-01" đều có test nêu tên biện pháp; `sandbox replay --to herald` chạy trên Windows.

## P2-01d — Quest chỉ đọc cho vai hỏi đáp

- **Mục tiêu**: quest do thiết bị `inquiry` tạo không sửa được lãnh thổ, không được giao hàng, không chạm secret (383a).
- **Đọc trước khi sửa**: `packages/domain/src/schema/**`; `packages/hooks/src/**` và `packages/runner-core/src/policy/**` (vùng `protected_paths`, lõi bảo mật: phiên tự làm, không giao quest); `packages/steward/src/deliver/deliver.ts` và `packages/runner-core/src/prompt/deliverable-facts.ts` để biết sản phẩm `report` được ghi ở đâu.
- **Thêm**:
  - `quest.read_only` (tùy chọn, thêm sau v1). Chỉ Nhiếp chính đặt, khi áp `create_quest` của một thiết bị `inquiry`; payload của client không có trường này. `QuestView.read_only` để khách vẽ được.
  - Luật thuần trong domain: quest `read_only` phải thuộc dạng có `deliverable_type` `report`, `secrets_required` rỗng, không dấu vua; `forgeDue` trả `false`; `edit_quest` không gỡ được `read_only`.
  - `ToolPolicy` của phiên làm quest `read_only`: giao của tool nghề với bộ chỉ đọc (`Read`, `Glob`, `Grep`), `Edit` và `Write` chỉ vào đường dẫn sản phẩm và thư bàn giao, không shell, không `WebFetch`, `WebSearch` (W7); Codex chạy sandbox `read-only`. Hook nhận cờ qua `policy.json` và từ chối ghi ngoài hai chỗ đó ở cả bốn dialect.
  - Trả đất ngay khi quest `done` (không chờ nhánh vào nhánh gốc, vì nhánh không đi đâu).
  - Kịch bản conformance mới `read_only_write` (phiên thử ghi một file trong đất, bị từ chối) cho CLI giả của ba tộc.
- **Test**: domain 100 %; steward với CLI giả: `create_quest` dạng `research` từ `inquiry` ⇒ quest có `read_only`, phiên không ghi được file nguồn, `done` rồi không có `delivery.*`, đất được trả; cùng lệnh từ `full` không có `read_only`; `answer` từ `inquiry` lên quest thường bị từ chối. 0 mana. Chạy kịch bản với CLI thật là quyết định tốn mana của chủ nhân (ghi ở W7).
- **Xong khi**: `pnpm check` và `pnpm -r test` xanh; bản build của hook dựng lại; README của `hooks`, `runner-core` nói đúng.

## P2-03 — Chuông máy tính

- **Mục tiêu**: khi `elvaria run` rung chuông, chủ nhân thấy một thông báo hệ thống trên Windows và macOS, không cần nhìn terminal.
- **Cách làm** (W9, khuyến nghị: không dependency): `DesktopBell` là adapter spawn công cụ có sẵn của hệ điều hành, `shell: false`, env tối thiểu: Windows gọi `powershell.exe -NoProfile -NonInteractive -Command <kịch bản cố định>` dựng toast bằng API thông báo của Windows; macOS gọi `osascript -e <kịch bản cố định>`. Tiêu đề và nội dung đi qua biến môi trường của tiến trình con, không nối vào chuỗi lệnh. Linux và máy không có công cụ: adapter báo "không có" một lần ở log rồi im. Phương án khác: `node-notifier` như kế hoạch cũ (kèm hai binary dựng sẵn trong gói, bản phát hành gần nhất đã cũ; thêm bề mặt chuỗi cung ứng mà C3 của threat model muốn giảm).
- **Việc đầu tiên của task**: đo hai lệnh trên máy thật (Windows của chủ nhân; macOS qua CI chạy tay) và ghi kết quả vào [§6](../implementation-plan/6-windows-and-macos.md); nếu toast của Windows không hiện được từ tiến trình nền thì dừng và hỏi chủ nhân về `node-notifier`.
- **Thêm** (`apps/cli/src/bell/`, thư mục khái niệm mới; `run/bell.ts` giữ nguyên chỗ):
  - `desktop.ts`: adapter; `fan-out.ts`: một `Bell` rung nhiều `Bell`, cái này lỗi không chặn cái kia, không bao giờ làm hỏng nhịp; `toast.ts`: `Notice` → tiêu đề và một dòng (tên loại, tên quest), qua `t()`, đã `redact`, không mang câu hỏi, diff hay đường dẫn.
  - Bảng dữ liệu `DESKTOP_RINGS` (W13, khuyến nghị): `awaiting_seal`, `infirmary`, `question`, `mana_asleep` của cả pool, và mọi mục báo động (`base_red`, `delegation_suspended`). Các loại khác chỉ ra terminal.
  - `kingdom.bell.desktop.enabled` (tùy chọn, mặc định `true`); composition root không gắn `DesktopBell` khi terminal không tương tác hay khi `--once`.
- **Chỗ chừa**: `WebPushBell` (P2-08) là `Bell` thứ ba trong cùng `fan-out`.
- **Test**: adapter với trình spawn giả: đúng chương trình và tham số cho từng hệ điều hành, chữ có dấu nháy và ký tự xuống dòng không vào dòng lệnh; công cụ thiếu ⇒ một dòng log, không ném; `fan-out` với một chuông ném lỗi; mọi loại `Notice` có ô trong bảng (kiểu). Ca riêng của Windows và của macOS có test riêng. 0 mana.
- **Xong khi**: `pnpm check` xanh; một toast thật trên máy chủ nhân khi một quest sang `awaiting_seal`, ghi vào dòng §11 của task; README của `apps/cli` nói đúng. Vùng nhạy hệ điều hành: nêu trong báo cáo để chủ nhân quyết chạy CI.

## P2-04 — Trạng thái thế giới cho điện thoại: tổng quan và cách chia

- **Mục tiêu**: mọi thứ điện thoại vẽ (bản đồ, "cần ngài", thanh mana, chuông) suy được từ file và log bằng hàm thuần trong `domain`, không cần bộ nhớ của Nhiếp chính, để Sứ giả, `elvaria digest` và bản tấu của Nhiếp chính ra cùng một kết quả.
- **Tộc là danh sách mở** (chốt 2026-11-12): không hàm nào ở đây mặc định hai tộc hay hai thanh mana.
- **Chia** (W1):

| Id | Việc | Cần trước | File chạm chính |
|---|---|---|---|
| P2-04 | "Cần ngài" từ file và log | H2 (AH-03, AH-05, AH-06) | `p/domain/src/world/**`, `p/domain/src/schema/event/**`, `p/steward/src/{schedule,waits}/**`, `a/cli/src/{digest,watch}/**`, `p/domain/src/protocol/**` |
| P2-04b | Trần của model trong `PoolView`; luồng chuông | P2-04 | `p/domain/src/world/**`, `p/domain/src/protocol/**` |

## P2-04 — "Cần ngài" từ file và log

- **Thêm**:
  - Chuyển `digestStateOf` về `packages/domain/src/world/` (R7), đặt tên theo việc nó làm; `steward` và `apps/cli` import từ `domain`, bản ở `steward` xóa trong cùng commit.
  - Một hàm thuần dựng `StewardNotices` từ `{ kingdom, territories, quests, characters, memos, verdicts, registry, events }`: gom phần đang chép ở `apps/cli/src/digest/digest.ts` và ở bản tấu của Nhiếp chính. `upgrade` (cần git) vẫn do người gọi đưa vào.
  - Ba loại chờ thành event để suy được từ log: quest chờ người chấm mà đội hình không có (`unjudgeable`), quest mà mana của mọi người chấm đều đóng (`judge_waits`), tộc bị giữ vì CLI đổi phiên bản (`tribes_held`; nếu đã có dòng log đủ để suy thì không thêm event, task kiểm khi làm). Mỗi loại một event ghi một lần khi Nhiếp chính phát hiện, cùng mẫu với `quest.unclaimable`; hàm suy trả "còn chờ" khi sau dòng đó quest chưa đổi trạng thái hay chưa có phiên chấm mới. Tên event do task chốt theo glossary. Nhiếp chính khởi động lại thì đọc log và không rung lại.
  - `AttentionItem` có schema zod; protocol thêm thông điệp `attention { items }` (Sứ giả tính lại sau mỗi lô event và gửi khi danh sách đổi; thiết bị giới hạn nhận phần của lãnh thổ được cấp).
- **Đọc trước khi sửa**: `packages/domain/src/schema/**`. Event mới là thêm tương thích (ADR 0003): không đổi tên hay payload của event đã phát.
- **Test**: domain 100 %; test đối chiếu: với cùng file và log, `elvaria digest`, bản tấu của Nhiếp chính và hàm mới ra cùng danh sách (trừ `upgrade`); `elvaria digest` không có Nhiếp chính chạy nay thấy quest chờ người chấm; khởi động lại Nhiếp chính không rung lại `unjudgeable` và `judge_mana`.
- **Xong khi**: `pnpm check`, `pnpm -r test` xanh; `docs/events.md` và schema sinh lại sạch; không còn bản chép của phần dựng thông báo (`pnpm dup` không thêm cặp nào).

## P2-04b — Trần của model trong `PoolView`; luồng chuông

- **Thêm**:
  - `PoolView.models` (tùy chọn): mỗi model có trần riêng một mục `{ model, asleep, resets_at, readings }`; `reduce` nhận các dòng `mana.*` có `model` vào đó thay vì bỏ qua. `WORLD_STATE_VERSION` tăng (snapshot cũ bị bỏ và dựng lại, đúng thiết kế của P0-09).
  - Luồng chuông: bảng dữ liệu `BELL_TABLE` (loại event → loại dòng, có rung không) và hàm thuần `bellEntryOf(event, state)`; schema `BellEntry`. Các loại dòng theo thiết kế `MBell`: chờ dấu, bệnh xá, cả pool ngủ, báo động, đã đóng dấu, biên niên sử đã viết, cùng `agent.notification` của hook và của Nhiếp chính qua cùng một dòng của bảng ((d) của P1-33). Bốn loại rung theo thiết kế: chờ dấu, bệnh xá, báo động, cả pool ngủ.
  - Protocol thêm `bell { entries }`: Sứ giả gửi các dòng của 7 ngày gần nhất khi client nối; sau đó client tự nối thêm bằng `bellEntryOf` trên `events`. Đã xem hay chưa là trạng thái của client, không lưu ở máy.
- **Chỗ chừa**: P2-08 dùng cột "có rung" của `BELL_TABLE` để chọn dòng nào thành web push; `chronicle.written` có `data` từ P2-06.
- **Test**: domain 100 %; `reduce` và `worldStateOf` vẫn khớp nhau với trần model; mỗi loại event của bảng ra đúng loại dòng; `agent.notification` actor nhân vật và actor `steward` ra cùng loại dòng; loại event lạ không ra dòng nào.
- **Xong khi**: `pnpm check`, `pnpm -r test` xanh; `pnpm schemas` sạch.

## P2-06 — Nhà thơ và biên niên sử v1: tổng quan và cách chia

- **Mục tiêu** (mốc của giai đoạn 2): biên niên sử buổi tối đọc đúng những gì đã xảy ra. Nguyên tắc: máy dựng dữ kiện, model chỉ viết văn từ dữ kiện đó, máy kiểm lại văn (ADR 0017).
- **Chia** (W1, W10): bản máy không cần model đứng được một mình và là lưới đỡ của bản văn.

| Id | Việc | Mana | Cần trước | File chạm chính |
|---|---|---|---|---|
| P2-06 | Bảng sự kiện của ngày, máy kiểm, biên niên sử bản máy | 0 | H2 (AH-03, AH-04, AH-06) | `p/domain/src/chronicle/**` (mới), `p/steward/src/schedule/**`, `a/cli/src/chronicle/**`, schema event |
| P2-06b | Nhà thơ viết văn | có, mỗi ngày một lượt khi bật | P2-06 | `a/cli/src/chronicle/**`, `p/runner-core/prompts/**`, `kingdom-schedule.ts` |

## P2-06 — Bảng sự kiện của ngày, máy kiểm, biên niên sử bản máy

- **Thêm**:
  - `packages/domain/src/chronicle/`: `dayLedgerOf(events, world, day)` thuần, trả bảng sự kiện của một ngày theo giờ địa phương của vương quốc: quest xong, bị trả, được đóng dấu, vào bệnh xá, được giao và merge; phán quyết đạt và trượt; nhân vật lên và xuống cấp; pool ngủ và thức; mỗi mục kèm id quest, tên nhân vật, lãnh thổ. Có schema zod (`version`).
  - `checkChronicle(text, ledger, roster)` thuần: mọi id quest xuất hiện trong văn phải có trong bảng; mọi tên nhân vật của đội hình xuất hiện trong văn phải có trong bảng của ngày đó; trần độ dài. Trả danh sách lỗi có mã.
  - Bản máy: `chronicle/<ngày>.md` gồm phần đầu do máy viết từ bảng (số đếm và danh sách, qua mẫu i18n theo `kingdom.owner.locale`), và `chronicle/<ngày>.json` là bảng sự kiện đã lưu. Văn bản qua `redact` trước khi ghi.
  - Job `chronicle` (`in_tick`, như bản tấu) chạy trên bộ lịch sẵn có lúc `schedule.chronicle.at`; event `chronicle.written` có `data` (`day`, `file`, `quests`, `prose`: có phần văn của Nhà thơ hay không).
  - `elvaria chronicle [--day <ngày>]`: in biên niên sử của một ngày, hoặc dựng tại chỗ từ log khi chưa có file (không ghi gì).
  - Mặc định (W15): `schedule.chronicle.enabled` thành `true`, vì bản máy không tốn mana.
- **Test**: domain 100 %; ngày giả của `sandbox` cho ra bảng khớp số đếm của ngày đó; ngày không có gì ⇒ file ngắn nói rõ không có việc; `checkChronicle` bắt id quest bịa và tên nhân vật không làm gì hôm đó; job chạy một lần mỗi ngày, khởi động lại không ghi đè (`schedule.ran`); ranh giới ngày theo múi giờ của vương quốc.
- **Xong khi**: `pnpm check`, `pnpm -r test` xanh; `docs/events.md`, `docs/cli.md`, schema sinh lại sạch.

## P2-06b — Nhà thơ viết văn

- **Mục tiêu**: phần văn của biên niên sử do một nhân vật nghề `bard` viết từ bảng sự kiện; sai một dữ kiện thì bỏ phần văn, bản máy còn nguyên.
- **Tốn mana**: mỗi ngày tối đa một lượt, trên pool của nhân vật `bard` của vương quốc. Ước lượng chưa đo: đầu vào là bảng sự kiện đã cắt ở 12 000 ký tự cùng mẫu prompt, đầu ra dưới 600 từ, tức khoảng 10 nghìn token mỗi ngày. Tắt mặc định.
- **Thêm**:
  - `schedule.chronicle.prose` (tùy chọn, mặc định `false`): bật thì job `off_tick` chạy sau bản máy, theo mẫu triage của PS-03b.
  - Ai viết: nhân vật nghề `bard` đầu tiên của đội hình, với tộc và model của chính nó (tộc là dữ liệu; chủ nhân chọn model rẻ bằng `character add` hay `set_model`). Không có nhân vật `bard`, pool của nó đang đóng (`mana_open` của `JobView`), hay ngày không có gì: không gọi model.
  - Lượt gọi không tool (`allow: []`), prompt là mẫu `runner-core/prompts/` mới nhận bảng sự kiện như dữ liệu có khung; không đọc file, không vào đất nào.
  - Sau lượt gọi: `redact`, rồi `checkChronicle`. Đạt thì nối phần văn vào `chronicle/<ngày>.md` và ghi `chronicle.written` với `prose: true`. Trượt thì thử lại một lần kèm danh sách lỗi; trượt nữa thì giữ bản máy và ghi một dòng log. Mana của lượt gọi ghi như mọi phiên (`mana.level`), sổ đo thấy được.
  - Bản tấu: không thêm mục. Tính cách trong lời văn là PS-18, không thuộc task này.
- **Test** (CLI giả, 0 mana): văn đúng ⇒ file có hai phần; văn nhắc quest không có ⇒ thử lại rồi giữ bản máy; pool đóng ⇒ không phiên nào mở; `prose` tắt ⇒ không phiên nào mở; snapshot của prompt; secret giả trong tên quest không lọt vào file.
- **Xong khi**: `pnpm check` xanh; một lần chạy thật trên vương quốc của chủ nhân (tốn mana, chủ nhân bật) có biên niên sử đúng với `elvaria chronicle --day` bản máy, ghi vào §11.

## Phụ thuộc giữa các task

- P2-01 → P2-01b → P2-01c; P2-01 → P2-01d. P2-01c cần P2-04 chỉ cho thông điệp `attention` (làm trước được, thêm sau).
- P2-04 → P2-04b. P2-06 → P2-06b. P2-03 đứng riêng.
- SEC-08 cần P2-01, P2-01b, P2-01c. P2-07 cần P2-01c, P2-01d, P2-04b. P2-08 cần P2-03, P2-04b.
- Mọi task cần đợt H2 đã merge (AH-03 barrel của `domain`, AH-04 file chuỗi theo namespace, AH-05 và AH-06 gốc `steward`), đúng (363).
- **File nóng** mà nhiều task cùng chạm: `packages/i18n/src/glossary.json` và file locale (sau AH-04 mỗi task một namespace riêng: `herald`, `device`, `bell`, `chronicle`), `packages/domain/src/schema/event/event-types.ts`, `packages/domain/src/protocol/messages.ts` (P2-01, P2-04, P2-04b), `packages/domain/src/schema/kingdom.ts` (P2-01 `herald`, P2-03 `bell`), `packages/steward/src/inbox/apply.ts` (P2-01, P2-01d), `apps/cli/src/commands.ts` (P2-01b, P2-06), `pnpm-lock.yaml` (P2-01c), các file sinh. Nhánh merge sau giữ cả hai phía rồi chạy lại generator.
- **Vùng nhạy hệ điều hành**: P2-01b, P2-01c (socket, tín hiệu dừng), P2-01d (hook), P2-03 (thông báo hệ thống).

## Quyết định cho chủ nhân

**Phải chốt trước khi mở task:**

- **W1 · Cách chia và id.** P2-01, P2-01b, P2-01c, P2-01d; P2-03; P2-04, P2-04b; P2-06, P2-06b. Khuyến nghị: nhận. Chặn mọi task.
- **W2 · Vai và lãnh thổ của thiết bị lưu ở đâu.** (A) mỗi thiết bị một file `devices/<id>.json` có schema; (B) mảng `herald.devices[]` trong `kingdom.json`; (C) trong `.state/herald-sessions.json` như ADR 0031 đang ghi nhãn thiết bị. Khuyến nghị (A): vai là cấu hình tin cậy chứ không phải cache; Nhiếp chính đọc được mà không biết Sứ giả; `kingdom.json` không có thêm người ghi. Chặn P2-01.
- **W3 · Tên ba vai và cách cấp từ máy.** Id `full`, `scoped`, `inquiry`; `elvaria herald pair` bắt buộc nêu `--role` (không có vai mặc định), `scoped` và `inquiry` bắt buộc ít nhất một `--territory`. Khuyến nghị: nhận. Chặn P2-01.
- **W4 · ADR.** ADR 0032 mới cho vai, file thiết bị, lọc theo lãnh thổ và quest chỉ đọc; ADR 0031 sửa tại chỗ mục 3 và 5 kèm `(Amended …)`. Phương án khác: chỉ sửa ADR 0031. Khuyến nghị: ADR mới, vì đây là quyết định mới chứ không phải chỉnh cho khớp. Viết trong task P2-01. Chặn P2-01.
- **W5 · Đổi hợp đồng protocol.** `command` chỉ còn `ref`, `kind`, `payload`; thêm `accepted`, `refused`, rồi `attention` (P2-04) và `bell` (P2-04b). Khuyến nghị: nhận; chưa client nào dùng hợp đồng cũ. Chặn P2-01.
- **W6 · Thiết bị giới hạn thấy gì.** Lọc snapshot và `events` theo lãnh thổ ở Sứ giả, đóng khi không chắc; vẫn thấy mana, tộc và nhân vật (không kèm quest ngoài vùng); không thấy chiến dịch, bản tấu và biên niên sử của cả vương quốc. Khuyến nghị: nhận. Chặn P2-01.
- **W7 · "Hỏi đáp" gồm lệnh nào, và quest chỉ đọc chặt tới đâu.** `create_quest` dạng `report` (thành quest `read_only`), `answer` và `cancel` trên quest `read_only`; quest `read_only` không shell, không `WebFetch`, `WebSearch`, không secret, không giao hàng. Khuyến nghị: nhận, kể cả cấm web (việc cần tra web thì giao từ thiết bị `scoped` hay `full`). Kịch bản `read_only_write` với CLI thật của ba tộc **tốn mana** (cỡ SEC-01: vài phiên ngắn mỗi tộc); khuyến nghị: chạy một lần khi P2-01d xong. Chặn P2-01 (bảng hỏi đáp) và P2-01d.
- **W8 · Trước khi có SEC-08.** Lệnh nhóm 2 và 3 từ nguồn `lite` bị từ chối `passkey_required`; trên loopback không hỏi passkey (ADR 0031). Khuyến nghị: nhận. Chặn P2-01.
- **W9 · Chuông máy tính không dependency.** `powershell.exe` và `osascript` thay cho `node-notifier`; đo trên máy thật là bước đầu của task, không đạt thì quay lại hỏi. Khuyến nghị: nhận. Chặn P2-03.
- **W10 · Biên niên sử hai tầng, và mana của Nhà thơ.** Bản máy (P2-06, 0 mana) luôn có; phần văn của Nhà thơ (P2-06b) **tốn mana** mỗi ngày một lượt (ước lượng 10 nghìn token, chưa đo), tắt mặc định, viết bằng model của nhân vật nghề `bard`. Khuyến nghị: nhận; mở P2-06b sau khi bản máy chạy được vài ngày. Chặn P2-06.

**Chờ được:**

- **W11 · Mã QR lúc ghép đôi.** ADR 0031 nói in URL và mã QR, và cũng nói không dependency ngoài `ws`. Khuyến nghị: P2-01b chỉ in URL; mã QR (bộ mã hóa tự viết, thuần, có test) làm cùng hướng dẫn đường hầm của P2-11, lúc điện thoại thật sự cần quét.
- **W12 · Cổng mặc định 7411 và `herald.origins` sửa tay** trong `kingdom.json` (như `dispatch`). Khuyến nghị: nhận; lệnh riêng để thêm origin thuộc nhóm 3, làm khi cần.
- **W13 · Loại chuông nào thành thông báo hệ thống.** Chờ dấu, bệnh xá, câu hỏi của nhân vật, cả pool ngủ, báo động. Khuyến nghị: nhận; sửa được sau bằng một dòng của bảng.
- **W14 · Dòng §8 của các task `P2-…`** nằm trong bảng của chặng tự cường như `AH-…` và `SEC-…` ((362)), để dòng xong chuyển file lưu mà không sửa script. Khuyến nghị: nhận.
- **W15 · `schedule.chronicle.enabled` mặc định `true`** từ P2-06: vương quốc đang chạy sẽ có thêm một file mỗi tối, 0 mana. Khuyến nghị: nhận.
