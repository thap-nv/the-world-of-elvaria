# Brief thiết kế giao diện — Elvaria

Ngày: 2026-11-06 · Phiên bản 0.2 · Đi kèm "Kế hoạch dựng Elvaria" 0.2

---

## 1. Thiết kế cái gì, không thiết kế cái gì

**Thiết kế:** lớp giao diện 2D phủ lên thế giới 3D (HUD, bảng, thẻ, hàng đợi, khung chat) và **design system** dùng chung cho cả lớp 2D lẫn lớp 3D (màu, chữ, icon, chất liệu). Cộng thêm **khách nhẹ cho điện thoại**: bản đồ 2D phẳng, Ngai vàng, trạm quân y, chuông, khung Tể tướng — không có 3D.

**Elvaria** là tên sản phẩm; người dùng tự đặt tên vương quốc và từng lãnh địa, nên mọi chỗ hiển thị tên phải chịu được tên dài tới 24 ký tự và cắt gọn đẹp.

**Không thiết kế:** địa hình, model tòa nhà, nhân vật 3D, hoạt hình, hiệu ứng trận đánh. Những thứ này dựng bằng Three.js và bộ tài sản low-poly; design system chỉ cung cấp bảng màu và quy tắc để chúng khớp với lớp 2D.

Không dùng logo, tên thương hiệu hay nhận diện của Anthropic, Google hay bất kỳ hãng nào. Hai tộc trong thế giới có tên và huy hiệu **tự sáng tác** (tạm gọi Tộc Sao Bạc và Tộc Lửa Đỏ; sẽ đổi).

---

## 2. Người dùng và bối cảnh

- Một người, làm việc trên laptop 13–15 inch, thế giới mở trong một tab trình duyệt **bên cạnh** VS Code hoặc trên màn hình thứ hai.
- Nghề: developer là chính; BA, marketing, researcher dùng cùng giao diện ở các khu khác.
- Hai cách nhìn: **liếc** (2 giây: có gì cần tôi không? dự án kẹt ở đâu?) và **đào** (mở bảng, đọc journal, đóng dấu). Giao diện phải phục vụ cái liếc trước.
- Thế giới chạy cả ngày; giao diện không được gây mỏi mắt, không nhấp nháy, không hoạt hình liên tục.
- Từ xa: trên điện thoại qua đường hầm, để duyệt và ra lệnh khi không ở máy. Điện thoại không cần thấy thế giới 3D, nhưng phải làm được mọi việc cần quyết.

---

## 3. Hướng nghệ thuật

- **Thế giới ồn, giao diện lặng.** Bản đồ 3D low-poly có màu và chuyển động; lớp 2D phẳng, ít màu, nhường sân khấu. Giao diện là tấm bản đồ giấy đặt lên bàn, không phải cửa sổ game.
- **Chất liệu gợi, không tả.** Giấy da, gỗ tối, đồng cũ, mực — thể hiện bằng màu và viền mảnh, không texture ảnh, không bevel, không glow.
- **Màu:** nền ấm tối (nâu đen, xanh đen) cho ban đêm, giấy da nhạt cho ban ngày; một màu nhấn đồng/vàng cũ cho hành động chính; màu trạng thái rõ nghĩa (đang làm, chờ nghiệm thu, đạt, trả về, ngủ, bệnh xá). Mỗi tộc một màu mana riêng, không trùng màu trạng thái.
- **Chữ:** một font hiển thị có khí chất cổ cho tên nhân vật, tên quest, tiêu đề (serif hoặc blackletter nhẹ, vẫn đọc được ở 14px); một font sans nhân văn cho thân chữ, số liệu, log. Không quá hai font.
- **Icon:** phẳng, hai tông, nét 1.5px, nhận ra ở 16px. Cần bộ cho 11 dạng nhiệm vụ, 12 nghề, 7 trạng thái quest, 6 trạng thái nhân vật, 2 tộc, các hành động (đóng dấu, trả về, triệu hồi, đình chỉ).
- **Chuyển động:** ≤ 200 ms, ease-out, chỉ khi người dùng thao tác hoặc có sự kiện mới. Chuông rung một lần rồi đứng yên.
- Tham chiếu tinh thần: bản đồ trong sách fantasy, nhật ký phiêu lưu, bảng quest của hội phiêu lưu; đồ họa low-poly kiểu Dorfromantik / Townscaper cho phần 3D.

---

## 4. Design system cần giao

- **Token màu** (tên khớp với CSS variables trong code): nền ngày/đêm, mặt bảng, viền, mực chính/phụ, nhấn, 7 màu trạng thái quest, 2 màu tộc, 3 màu sức khỏe lãnh thổ (tốt / cảnh báo / sự cố).
- **Thang chữ:** 11 / 13 / 15 / 18 / 24, dòng 1.4; quy tắc dùng font hiển thị.
- **Bộ icon** như mục 3, giao dạng SVG đơn sắc.
- **Bậc trang bị** cho avatar và thẻ nhân vật: 4 bậc (vải, da/xích, giáp/phù chú, huyền thoại) thể hiện bằng viền và chất liệu của khung avatar, không chỉ bằng con số cấp.
- **Hạng quest** F–S: badge có 3 mức hình thức (biển gỗ, cờ hiệu, cờ lớn) khớp với vật thể trên bản đồ 3D.
- **Thành phần:** Panel (dock phải và dưới), Card quest, Badge hạng F–S, Avatar nghề + vòng danh tiếng, Thanh mana, Nút đóng dấu / trả về (hai nút này phải khác nhau rõ, không cùng hình), Dòng log có mốc giờ, Tooltip, Toast chuông, Dropdown trạng thái, Tab, Ô nhập Tể tướng, Nút triệu hồi, Huy hiệu tộc.
- **Khoảng cách và bo góc:** bước 4/8; bo góc nhỏ (4–6px); viền 1px.
- Hai chế độ: đêm (mặc định, vì nền 3D thường tối) và ngày.

---

## 5. Màn hình và trạng thái

### HUD thường trực (không che tâm bản đồ)

- Thanh trên: tên vương quốc, đồng hồ ngày/đêm, mùa (sprint), số việc chờ dấu, chuông.
- Góc: minimap, nút chế độ (toàn cảnh / theo chân / điện ảnh), nút tiết kiệm.
- Hai thanh mana theo tộc với vạch **phần của vua** và giờ hồi; trạng thái "tộc đang ngủ" phải thấy ngay.
- Lớp **"Cần ngài"**: danh sách việc cần quyết (dấu, trả, quân y) xếp theo mức khẩn, luôn có mặt dù bản đồ đang ở đâu; minimap có "nhiệt" hoạt động theo lãnh thổ.

### Khung Tể tướng

- Ô nhập một dòng, mở rộng khi gõ. Sau khi gõ: **bản xem trước** các quest được tách ra (dạng, hạng, lãnh thổ, mana ước lượng), sửa được từng cái, xác nhận một lần. Trạng thái: Tể tướng hỏi lại một câu; không hiểu; tộc hết mana.

### Hội quán — bảng nhiệm vụ

- Danh sách hoặc cột theo trạng thái; lọc theo dạng, lãnh thổ, chiến dịch, người làm.
- Card quest: tiêu đề, icon dạng, badge hạng, avatar người làm, lãnh thổ, mana, tuổi, số lần thử.
- Trạng thái trống: "chưa có quest" với gợi ý gõ lệnh.

### Thẻ quest chi tiết

- Mô tả, journal dạng dòng thời gian, các lần thử, verdict (kiểm tra máy pass/fail + ghi chú), link giao hàng.
- Hành động: đóng dấu, trả về kèm ghi chú, giao lại, triệu hồi terminal, lưu trữ.

### Bảng nhân vật

- Tên, nghề, cấp, vòng danh tiếng, tộc, model; quest đang làm; 5 hành động gần nhất; token hôm nay.
- Tab Kinh: danh sách bài học (sửa được), bài học thầy tu đề xuất chờ duyệt.
- Tab Trang bị: bậc hiện tại, món sẽ mở khi lên cấp.
- Hành động: triệu hồi, đưa về Đền, đình chỉ. Trạng thái: làm việc, nghiệm thu, ngủ (hết mana, kèm giờ hồi), thiền, đình chỉ, lạc đầm lầy.

### Bảng lãnh thổ / tòa nhà

- Sức khỏe (CI, bug mở, tuần tra gần nhất) và lý do thời tiết; quest tại đây; link địa chí; lều trại đang mở.

### Ngai vàng

- Hàng đợi chờ dấu + trạm quân y, mỗi mục: việc gì, ai làm, xem nhanh kết quả (diff / tài liệu / bản nháp), hai nút đóng dấu – trả về kèm ô ghi chú. Đi được bằng bàn phím. Trống: "không có tấu chương".

### Phòng chiến sự

- Thẻ chiến dịch: tên, chế độ (tấn công / phòng thủ), các mặt trận với tiến độ, đồng hồ sĩ khí, checklist điều kiện chiến thắng; hành động: tuyên chiến, đóng, mở hội đồng sau chiến. Chế độ phòng thủ: dải báo động đỏ ở thanh trên, không popup.

### Trận đánh

- Trong trận: số đơn vị còn / gục / bị thương, không che chiến trường.
- **Điểm quân sau trận:** bốn cột xác quái – bia mộ – thương binh – đổ nát, mỗi cột liệt kê việc; nút xem lại với tốc độ 1×/5×/20×.

### Đền

- Danh sách nhân vật đang tĩnh tâm; bài học đề xuất (duyệt / bỏ); kinh chung; danh sách sắp thanh lọc.

### Biên niên sử

- Một trang mỗi ngày, lọc theo lãnh thổ, mỗi dòng link về quest.

### Lần đầu mở

- Đặt tên vương quốc → chọn nghề chính → gắn lãnh thổ đầu tiên → tiến trình khảo sát điền địa (trinh sát đang đi, phát hiện gì) → thế giới hiện ra.

### Mở cõi (gắn lãnh thổ mới)

- Chọn repo/thư mục → đặt tên lãnh địa (mặc định tên repo) → trinh sát khảo sát (tiến trình, phát hiện gì) → vùng đất mới hiện ở biên bản đồ với đường nối. Trạng thái: không truy cập được thư mục; khảo sát dở dang.

### Khách nhẹ cho điện thoại

- Bản đồ 2D phẳng: vùng lãnh thổ là ô màu theo sức khỏe, nhân vật là chấm có icon nghề; chạm vùng → quest ở đó.
- Ngai vàng, trạm quân y, chuông, khung Tể tướng ở bề rộng 390px; thao tác một tay; nút đóng dấu và trả về cách xa nhau.
- Trạng thái: máy ở nhà offline hoặc ngủ (hiện lần cuối liên lạc), đường hầm mất kết nối.

### Cài đặt

- Ngưỡng mana và phần của vua, cầu dao, kênh chuông, đường hầm bật/tắt, chế độ ngày/đêm, chế độ tiết kiệm, theme.

### Trạng thái toàn cục cần có

- Cả tộc đang ngủ (một dải, không che bản đồ, kèm giờ hồi và nút "đã đăng nhập lại").
- CLI không chạy được / chưa đăng nhập.
- Sa bàn đang phát lại (nhãn rõ "DỮ LIỆU GIẢ").

---

## 6. Luồng chính cần mockup đầy đủ

1. Ra lệnh → xem trước quest → xác nhận → thấy nhân vật nhận → theo dõi journal → chờ dấu → đóng dấu.
2. Hết mana giữa chừng → nhân vật ngủ → người dùng đăng nhập lại → "đã đăng nhập lại" → tỉnh, làm tiếp.
3. Sự cố → chuông → dải phòng thủ → quest Trừ tà tự sinh → cleared → hội đồng sau chiến.
4. Lần đầu mở → khảo sát → thế giới.
5. Gắn repo mới → đặt tên lãnh địa → khảo sát → vùng mới mọc trên bản đồ.
6. Trên điện thoại: chuông → mở Ngai vàng → đóng dấu → máy ở nhà tiếp tục.

---

## 7. Ràng buộc

- Bảng dock bên phải tối đa 380px, bên dưới tối đa 240px; tâm bản đồ luôn trống.
- Đọc được trên nền 3D cả sáng lẫn tối: bảng có nền đục, không blur nặng.
- Không hiệu ứng tốn GPU (blur lớn, bóng mềm nhiều lớp, hoạt hình nền).
- Mọi hành động phá hủy hoặc ra ngoài (đóng dấu hợp nhất, gửi, xóa) có xác nhận rõ, nút không đặt cạnh nút thường.
- Điện thoại: khách nhẹ là bắt buộc ở v1 (bản đồ 2D, Ngai vàng, trạm quân y, chuông, Tể tướng); 3D chỉ trên desktop.
- Tên vương quốc và lãnh địa do người dùng đặt: chừa chỗ tới 24 ký tự, cắt gọn đẹp khi dài hơn.
- Văn bản giao diện tiếng Việt; thuật ngữ thế giới giữ nguyên (quest, mana, dấu vua, Tể tướng…).

---

## 8. Đầu ra mong muốn

- Design system (token, chữ, icon, thành phần) ở cả hai chế độ.
- Mockup desktop 1440×900 cho: HUD + bản đồ (placeholder 3D), Hội quán, Thẻ quest, Bảng nhân vật, Ngai vàng, Phòng chiến sự, Điểm quân sau trận, Lần đầu mở, Mở cõi.
- Mockup điện thoại 390×844 cho khách nhẹ: bản đồ 2D, Ngai vàng, chuông, Tể tướng.
- Trạng thái trống / lỗi / hết mana cho các màn hình trên.
- Sáu luồng ở mục 6 dưới dạng chuỗi màn hình.
- Tên token và thành phần dùng được trực tiếp trong code (CSS variables, tên class).
