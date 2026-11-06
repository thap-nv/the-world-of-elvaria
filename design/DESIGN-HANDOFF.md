# Elvaria — bàn giao thiết kế giao diện v0.2 cho Claude Code

Đi kèm: `ke-hoach-dung-elvaria.md` (kế hoạch), `brief-thiet-ke-giao-dien-elvaria.md` (brief), và thư mục `project/` (toàn bộ mockup). Canvas xem trực tiếp: artifact "Elvaria — Thiết kế giao diện" trên claude.ai.

## 1. Cái gì là nguồn sự thật

| File | Dùng làm gì |
|---|---|
| `project/elvaria.css` | **Design system thật, copy thẳng vào repo** (`renderer/src/styles/elvaria.css`). Token = CSS variables `--elv-*`; class thành phần `.elv-*`. Hai chế độ: `.elv[data-theme="night"]` (mặc định) và `[data-theme="day"]`. |
| `project/Main.dc.html` | Bảng token + thang chữ + quy tắc font (Alegreya, Source Sans 3, Grenze Gotisch, Cinzel). Đọc phần chữ để biết font nào dùng ở đâu. |
| `project/Icons.dc.html` | Bộ icon: mọi path SVG nằm trong khối `renderVals()` ở cuối file, dạng `I(id, label, d)`. Tách ra thành `icons.ts` (map id → path, viewBox 0 0 16 16, stroke 1.5). |
| `project/Components.dc.html` | Mọi thành phần ở trạng thái mẫu, markup dùng đúng class trong `elvaria.css`. |
| `project/Map.dc.html` | **Chỉ là placeholder** cho lớp 3D. Giữ lại bảng màu `--elv-map-*` để Three.js khớp lớp 2D; không chuyển SVG này thành bản đồ thật. |
| `project/Hud.dc.html` | HUD thường trực: bố cục, vị trí overlay, khung Tể tướng, mọi dải toàn cục và toast. Prop `scene` liệt kê đủ trạng thái cần có. |
| `Guild / Quest / Character / Throne / WarRoom / Muster / Territory / Settings / FirstOpen / OpenRealm` | Mỗi màn một file; prop `variant`/`step` liệt kê trạng thái (trống, lỗi, ngủ…). |
| `M*.dc.html` | Khách nhẹ điện thoại 390px. |
| `S-*.dc.html`, `Flow*.dc.html`, `*XL.dc.html` | Chỉ là file "nhập" các màn trên với tham số khác (trạng thái, luồng, 2560×1600). Không cần port; dùng để đối chiếu. |

## 2. Cách đọc một file mockup

Mockup viết bằng HTML + CSS thật nhưng trong định dạng canvas (Design Component):

- `{{ten}}` là lỗ dữ liệu, giá trị tính trong `renderVals()` cuối file. Khi port, thay bằng state/props thật.
- `<sc-if value="{{x}}">` = điều kiện; `<sc-for list="{{xs}}" as="x">` = lặp; `<dc-import name="Hud">` = nhúng file `Hud.dc.html` với props.
- `<helmet>` + `<link rel="stylesheet" href="./elvaria.css">` + link Google Fonts: lấy y nguyên.
- Mọi style bố cục nằm inline để chỉnh trên canvas; khi port, gom vào class theo ý hoặc giữ inline tùy framework.
- Bỏ: `<script src="./support.js">`, khối `data-props`, lớp `DCLogic`.

## 3. Bố cục và ràng buộc đã chốt (từ brief, đã hiện thực trong mockup)

- Thanh trên 48px; dock phải 380px; dock dưới 240px (phải = danh sách/chi tiết, dưới = journal/xem nhanh/điểm quân). Tâm bản đồ luôn trống.
- Mọi overlay HUD (mana, "Cần ngài", minimap, nút chế độ) neo góc trái/phải; khung Tể tướng canh giữa phần bản đồ còn lại.
- Màn ≥ 2200px: cho phép **dock đôi** (hai bảng 380 cạnh nhau, tối đa 760). Giao diện 2D không scale theo màn; phần dư dồn cho bản đồ. Trong code: HUD set `--elv-dock-right-w` = 380 | 760.
- Tên vương quốc / lãnh địa do người dùng đặt: class `.elv-name` (24ch, ellipsis), `.elv-name--2` khi có chỗ hai dòng.
- Đóng dấu (`.elv-btn--seal`, khối đặc, font fantasy) và Trả về (`.elv-btn--return`, viền rỗng bo tròn) luôn ở hai đầu; Trả về bắt buộc có ghi chú. Hành động phá hủy có hộp xác nhận.
- Chuyển động `--elv-dur` 180ms ease-out, chỉ khi có thao tác/sự kiện; chuông rung một lần.
- Font: Alegreya (hiển thị), Source Sans 3 (thân chữ). Font nhấn: Grenze Gotisch (`.elv-fantasy`, có dấu tiếng Việt, ≤ 6 chỗ), Cinzel (`.elv-inscr`/`.elv-wordmark`, **chỉ chữ Latin không dấu và số**). Nạp subset `latin, vietnamese`.
- 7 màu trạng thái quest qua `data-status="open|working|review|done|returned|sleep|infirmary|seal"` trên phần tử cha; 2 màu tộc `--elv-fac-silver` (Sao Bạc/Claude), `--elv-fac-fire` (Lửa Đỏ/Gemini).

## 4. Chưa có trong thiết kế — Claude Code tự suy từ hệ thống

- Màn **Đền** và **Biên niên sử** (dùng Panel + Log/Timeline + Check-item như Character tab Kinh và WarRoom retro).
- Màn **Thẻ chiến dịch** dạng danh sách nhiều chiến dịch (WarRoom mới có một thẻ).
- Toàn bộ lớp 3D: địa hình, model, hoạt hình, nghi thức, thời tiết — theo kế hoạch mục 9; chỉ bảng màu `--elv-map-*` và vật thể hạng (biển gỗ / cờ hiệu / cờ lớn) là đã khớp với lớp 2D.
- Hoạt hình chi tiết của toast/dock mở đóng (chỉ có quy tắc thời lượng).
- Trạng thái hover/focus đã có trong CSS cho nút, card, tab; chưa vẽ riêng.

## 5. Gợi ý thứ tự dùng trong lộ trình

- Giai đoạn 0–1 (xương sống, tầng việc): chưa cần thiết kế; chỉ cần đọc `elvaria.css` để đặt tên enum trạng thái trùng với `data-status`.
- Giai đoạn 2 (chuông + khách nhẹ): port `M*.dc.html` + `MBell`, dùng `elvaria.css` nguyên bản.
- Giai đoạn 3 (thế giới xám): port `Hud.dc.html` (overlay HTML trên Three.js) + `Quest`, `Guild`, `Throne`, `Character`, `Territory`, `Settings`.
- Giai đoạn 4–5: `FirstOpen`, `OpenRealm`, `WarRoom`, `Muster`, trạng thái toàn cục (`scene` của HUD).
