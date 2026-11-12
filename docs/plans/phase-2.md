# Giai đoạn 2: đề xuất chia việc

Ngày: 2026-11-12 · Trạng thái: **đề xuất**; chủ nhân chốt ngày 2026-11-12 cách dùng (đầu vào cho Nghị hội sau mốc PS-07) và thứ tự, câu 3–7 ở §6 còn chờ ([kế hoạch triển khai](../implementation-plan.md) §10 câu 3, §11 dòng P1-51 và dòng chốt sau nó). Chưa task nào ở đây được mở, và số hiệu `P2-…` chưa có trong bảng §8.

Tài liệu này là bản đề xuất lại, khi đóng giai đoạn 1 (P1-51), của danh sách mà phiên điều phối đưa ra ngày 2026-11-10 và chủ nhân chưa chốt. Từ hôm đó có bốn thứ đổi: kế hoạch sản phẩm 0.8 thêm giai đoạn 1.5 và quy định giai đoạn 2 do chính Elvaria lập kế hoạch và làm; vài mục của danh sách đã thành task khác; lần chạy lại mốc ([P1-50](../guides/phase-1-rerun.md)) cho số đo về cỡ việc; lượt soát kế hoạch giai đoạn 1.5 (PR #113) xếp chỗ cho hai đề xuất của P1-50.

## 1. Mốc

Theo [kế hoạch sản phẩm 0.8](../ke-hoach-dung-elvaria-0.8.md) §10:

- Biên niên sử buổi tối đọc đúng những gì đã xảy ra.
- Đóng dấu một quest từ điện thoại khi ở ngoài nhà, máy ở nhà làm tiếp. Bài e2e của mốc là `Flow6`.
- (0.8) Ba quest song song trên lãnh thổ Elvaria vào nhánh chính mà không ai gỡ conflict tay.

Đề xuất thêm một số đo cho mốc, lấy từ `elvaria metrics`: số lần chủ nhân phải can thiệp ngoài dấu vua trên mỗi quest, so với lần chạy P1-50 (26 lần trên 24 quest). Giai đoạn 2 đưa chuông và dấu vua ra ngoài terminal, nên con số này phải giảm thấy được.

Phần "hooks hai CLI → events, mana tracking" của lộ trình đã xong ở giai đoạn 1 (P1-08, P1-22, P1-48).

## 2. Ai lập kế hoạch, ai làm

Kế hoạch sản phẩm 0.8 và §8 của kế hoạch triển khai đã chốt: giai đoạn 2 mở sau mốc PS-07; bảng task do Nghị hội của Elvaria soạn, chủ nhân đóng một dấu trên kế hoạch; việc do nhân vật làm trên lãnh thổ Elvaria. Vì vậy các mục `P2-…` dưới đây là **việc** giao cho Nghị hội làm tấu trình, không phải task viết sẵn cho một phiên Claude Code như bảng giai đoạn 1. Pháp sư chia mỗi việc thành quest hay đội vừa một context; ràng buộc kiến trúc mà kế hoạch đó phải giữ nằm ở §8 "Giai đoạn 2–5".

Một ngoại lệ đề xuất: **P2-05 (spike triệu hồi) do một phiên Claude Code của chủ nhân làm**, như hai spike P1-02 và P1-12a. Spike phải tự chạy `claude` và `agy` với stdin mở; nhân vật không được chạy một CLI bên trong phiên của mình (luật công cụ cấm, và phiên lồng nhau đốt mana ngoài mọi cầu dao).

## 3. Việc của giai đoạn 2

Cột "Đổi so với 2026-11-10" ghi chỗ khác bản gốc. Số hiệu giữ nguyên để các dòng §11 đã nhắc `P2-…` vẫn đúng.

| Việc | Nội dung | Cần xong trước | Đổi so với 2026-11-10 |
|---|---|---|---|
| P2-01 | **Sứ giả lõi**: package `p/herald`, lệnh `elvaria herald`. HTTP tĩnh và WebSocket chỉ trên 127.0.0.1; gửi snapshot khi client nối; đọc tiếp event log rồi `reduce` ra `events`; nhận `command` và ghi vào `inbox/`; che secret trước khi gửi; xác thực; `sandbox replay --to herald`. Dependency mới: `ws` | — | xác thực phải chọn lại: §8 ghi "token Bearer trong header", mà WebSocket của trình duyệt không đặt được header (đề xuất: ghép đôi một lần rồi cookie HttpOnly). Danh sách "cần ngài" lấy từ `attentionQueue` của PS-03, không dựng riêng |
| P2-02 | **ui-kit và ui nền**: `pnpm ui:import` từ `design/`, `gen-icons`, font tự host; Vite, Preact, signals; các thành phần mà màn điện thoại cần; test tông của `statusToneOf` đọc CSS của ui-kit | PS-11 | là việc giao diện đầu tiên, nên đứng sau nghi thức xem ảnh (PS-11) và mang Playwright vào lãnh thổ Elvaria. Chia thành một đội: phần nhập (script, máy chạy), phần nền, phần thành phần |
| P2-03 | **Chuông máy tính**: `DesktopBell` (node-notifier) cạnh `ConsoleBell` | — | nửa "lý do trạm quân y và `detail` của `doctor` thành mã cộng i18n" đã là việc làm bài thử của mốc PS-07; cảnh báo "một trần mana đóng làm thiếu người chấm" ((d) của P1-50) đã vào PS-03 và P1-56. Còn lại là một việc nhỏ |
| P2-04 | **Trạng thái thế giới cho điện thoại** (domain/world): `PoolView` có trần riêng của một model đang ngủ ((a) của P1-22); thông báo của hook và của Quản sự thành một luồng cho `MBell` ((d) của P1-33) | PS-03 | bỏ (c) của P1-33 (`sequels`), đã làm ở P1-49. Luồng thông báo dựng trên `attentionQueue` của PS-03 |
| P2-05 | **Spike triệu hồi** (tốn mana, chủ nhân ngồi máy): trả lời các câu còn mở của §10 câu 1 bằng một phiên Claude thật và một phiên agy; kết quả là file spike và đề xuất hợp đồng dữ liệu | — | do phiên Claude Code làm, không phải quest (§2) |
| P2-06 | **Nhà thơ và biên niên sử v1**: script dựng bảng sự kiện của ngày; model rẻ (nghề `bard`) chỉ viết văn từ bảng đó; máy kiểm mọi quest và nhân vật được nhắc đều có thật; `chronicle/<ngày>.md`, event `chronicle.written` | PS-03 | chạy trên bộ lịch của PS-03 (`kingdom.schedule`), không dựng `ScheduledJob` riêng. PS-18 (tính cách trong lời nói) đi cùng |
| P2-07 | **Khách nhẹ: bản đồ và ngai vàng** (`a/lite`): `MMap`, `MThrone` (đóng dấu; trả về bắt buộc có ghi chú), các trạng thái `S-MMapOffline`, `S-MTunnelLost`, `S-MThroneEmpty`; Sứ giả phục vụ bản build | P2-01, P2-02, P2-04 | không đổi |
| P2-08 | **Chuông trên điện thoại**: `WebPushBell`, khóa VAPID trong kho bảo vật; điện thoại đăng ký qua Sứ giả → `inbox/` (một kind mới); service worker; màn `MBell` | P2-03, P2-07 | đề xuất thêm: `MBell` có nút cho ba lệnh mà P1-50 cần nhiều nhất ngoài dấu vua (`answer`, `retry`, nâng trần của `edit_quest`); ba lệnh đã có trong hợp đồng inbox |
| P2-09 | **Khung Tể tướng trên điện thoại** (`MChancellor`): một kind inbox mới; Quản sự chạy Tể tướng qua một cổng do composition root tiêm vào, vì Sứ giả không được gọi model | P2-07 | không đổi; sửa ADR 0005 |
| P2-10 | **Khung chat triệu hồi**: runner giữ stdin mở, kind `message`, event `agent.message`, năng lực mới của runner, ghi journal, khung chat trên lite (chưa có mockup) | P2-05, chủ nhân chốt §10 câu 1, P2-07 | không đổi; không thuộc mốc |
| P2-11 | **Mốc giai đoạn 2**: e2e `Flow6` (Playwright), hướng dẫn dựng đường hầm, cờ tắt đường hầm, một lần chạy thật từ ngoài nhà, báo cáo giai đoạn 2 | P2-01 … P2-09 | thêm số đo can thiệp của §1 |

Task `PS-…` của chặng tự cường xen vào giai đoạn 2 (đã có dòng ở §8, không đổi): PS-08 giao hàng tới merge và PS-11 nghi thức xem ảnh ở đầu giai đoạn; PS-09 hàng đợi merge sau PS-08; PS-10 thư `request` và `objection`; PS-12 Đền bản đầu; PS-13 bí kíp vào phiên; PS-18 tính cách.

## 4. Thứ tự đề xuất

| Đợt | Việc | Vì sao ở đây |
|---|---|---|
| 0 | PS-08, PS-11 song song; rồi PS-09 | mọi việc sau đó chạy song song trên lãnh thổ Elvaria, nên đường giao hàng và hàng đợi merge phải có trước; PS-11 trước việc giao diện đầu tiên |
| 1 | P2-01, P2-03, P2-04, P2-06 song song | bốn vùng code rời nhau: `p/herald` (mới), chuông trong `a/cli`, `p/domain/src/world`, bộ lịch của Quản sự và prompt nhà thơ. P2-01 là đường găng của mốc |
| 2 | P2-02 (đội); P2-05 khi chủ nhân ngồi máy được | giao diện bắt đầu khi đã có nghi thức xem ảnh |
| 3 | P2-07; PS-10, PS-12, PS-13 vào chỗ trống | khách nhẹ cần Sứ giả, ui và trạng thái thế giới; ba task PS ở vùng code khác |
| 4 | P2-08 và P2-09 song song; PS-18 | cùng thêm kind inbox và màn điện thoại: nhánh merge sau giữ cả hai phía ở schema lệnh và glossary |
| 5 | P2-10 | sau spike và sau khi chủ nhân chốt §10 câu 1 |
| Mốc | P2-11 | |

## 5. Bài học của giai đoạn 1 mà kế hoạch giai đoạn 2 phải giữ

Số đo ở [báo cáo P1-50](../guides/phase-1-rerun.md) §3, §4, §7.

- **Mỗi quest vừa một context.** Chi phí xấp xỉ số lượt nhân cỡ ngữ cảnh. Trên một repo web nhiều file, quest hạng D vượt 240 nghìn token ngay lượt đầu và hạng C, B vượt 480 nghìn ở 4 trong 6 phiên; mỗi lần vượt là một lần chủ nhân can thiệp. Việc giao diện (P2-02, P2-07, P2-08) chia theo màn và theo thành phần, không theo package; `check_plan_ready` của PS-06 tách phần có ngữ cảnh đỉnh quá khoảng 200 nghìn token.
- **Cái gì máy làm được thì là script.** `ui:import` và `gen-icons` là script chạy một lần (0 mana); nhân vật viết và test script, không tự chép 50 file của `design/` qua ngữ cảnh.
- **File nóng khai trước.** Mọi việc ở đây cùng chạm `packages/i18n/src/glossary.json`, hai file locale, `apps/cli/src/commands.ts`, `packages/domain/src/schema/event/event-types.ts`, `packages/config/boundaries.mjs`, `pnpm-lock.yaml` và các file sinh. Chúng nằm trong `shared_paths` của lãnh thổ Elvaria (PS-05), và hàng đợi merge (PS-09) ghép chúng; không có hai thứ đó thì các quest song song xếp thành hàng một hoặc chủ nhân gỡ conflict tay.
- **Check không dùng tài nguyên chung.** Ở P1-50, lệnh dọn stack Docker của quest này hạ e2e của quest kia ba lần. Test của Sứ giả và e2e của khách nhẹ mở cổng ngẫu nhiên và dùng một vương quốc tạm cho mỗi lần chạy, để hai quest chạy check cùng lúc được; không check nào của lãnh thổ Elvaria cần khóa `exclusive`.
- **Dependency mới nêu trong kế hoạch.** `ws`, `node-notifier`, Vite, Preact, signals, Playwright, thư viện web push: chủ nhân duyệt một lần cùng dấu trên kế hoạch, không phải ở từng quest.
- **Vùng bảo vệ.** `boundaries.mjs`, schema và các file "Đọc trước khi sửa" của CLAUDE.md nên nằm trong `protected_paths` của lãnh thổ Elvaria (PS-04: quest chạm vùng đó chờ dấu vua); việc nào thêm package mới (P2-01, P2-02, P2-07) đều chạm `boundaries.mjs`, nên kế hoạch gom các thay đổi đó vào ít quest nhất.
- **Người chấm.** Mỗi model người làm có hai người chấm khác model trên hai đồng hồ mana; việc giao diện cần người chấm của tộc có năng lực `vision` (PS-11).

## 6. Câu chờ chủ nhân

Ba câu đầu là của P1-51; bốn câu sau có từ bản 2026-11-10 và chưa được trả lời.

1. **Cách dùng danh sách này.** Khuyến nghị: giữ `P2-01 … P2-11` với nội dung ở §3 làm đầu vào cho tấu trình; sau mốc PS-07, chủ nhân giao cho Nghị hội, Nghị hội soạn bảng task của §8, chủ nhân đóng một dấu. Phương án khác: một phiên điều phối viết bảng §8 ngay bây giờ như giai đoạn 1 (nhanh hơn, nhưng bỏ mất phép thử của chính Nghị hội mà kế hoạch sản phẩm 0.8 đặt ra). Không chặn việc nào trước PS-07. **Chủ nhân chốt 2026-11-12: theo khuyến nghị.**
2. **Thứ tự ở §4**, nhất là việc đặt PS-08, PS-09 và PS-11 trước mọi `P2-…`. Khuyến nghị: giữ. Chặn việc mở giai đoạn 2, không chặn giai đoạn 1.5. **Chủ nhân chốt 2026-11-12: giữ.**
3. **P2-05 do phiên Claude Code làm** (§2), và `MBell` có ba nút lệnh (P2-08). Khuyến nghị: đồng ý cả hai. Để sau được.
4. **Kênh chuông trên điện thoại** (P2-08): web push hay ứng dụng nhắn tin. Khuyến nghị web push: không thêm bên thứ ba, đi chung đường hầm; iPhone cần iOS 16.4 trở lên và "Thêm vào màn hình chính". Cần biết điện thoại của chủ nhân là iPhone hay Android. Chặn P2-08.
5. **Đường hầm** (P2-11, chỉ là cấu hình): Tailscale hay Cloudflare Tunnel. Khuyến nghị Tailscale: không lộ ra internet công cộng, có sẵn HTTPS (service worker bắt buộc HTTPS). Chặn P2-11.
6. **Quản sự chạy Tể tướng khi lệnh tới từ điện thoại** (P2-09): đổi hợp đồng inbox và vai của Quản sự, sửa ADR 0005. Khuyến nghị: đồng ý. Phương án khác: điện thoại chỉ tạo quest thô, không qua Tể tướng. Chặn P2-09.
7. **Triệu hồi** (P2-10): chốt §10 câu 1 sau khi spike P2-05 có kết quả. Chặn P2-10, không chặn mốc.
