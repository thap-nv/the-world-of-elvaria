# Báo cáo lần chạy nghiệm thu của Đền (PS-12e)

Lần chạy nghiệm thu của Đền trên vương quốc thật của chủ nhân (`my-kingdom`), ngày 2026-11-19 đến 2026-11-20, trên Windows 11, ba tộc (Claude Code, Antigravity, Codex). Phiên điều phối cùng chủ nhân làm, không phải quest của nhân vật. Kế hoạch: [plans/temple-first.md](../plans/temple-first.md) mục PS-12e. Số đo lấy từ `elvaria metrics` (mục "Bài học trong kinh") ngày 2026-11-20 sau 22 lượt được chấm có nạp dòng mới; bảng sinh lại: [metrics-report.md](../metrics-report.md), [tier-report.md](../tier-report.md). Cách vận hành Đền: [operating-a-kingdom.md](operating-a-kingdom.md).

## 1. Kết luận

Câu hỏi của PS-12e: sau ít nhất 20 phán quyết kể từ khi dòng kinh được nạp, một `fail_kind` lặp có giảm thấy được trên sổ đo không.

- **`wrong_facts` và `style` giảm về con số, nhưng mẫu quá nhỏ để nói là nhờ kinh.** `wrong_facts` từ 8/110 xuống 1/22 (−3 điểm phần trăm), `style` từ 2/110 xuống 0/22 (−2 điểm). Trước đó cả hai loại đã dao động quanh mức thấp (mỗi 20 lượt: 0 đến 2 trượt), nên một lượt trượt hơn hay kém đủ làm đảo kết luận.
- **`incomplete` không giảm: nó tăng** (11/110 → 4/22, +8 điểm) dù dòng `L_20261119_agshqk` chữa đúng loại này. Ba trong bốn lượt trượt là cùng một quest (`yp3jmk`, bị hủy vì Tể tướng biến việc nhỏ thành quest kế hoạch, §4), nên chữ "không giảm" ở đây là kết quả đo được, không phải bằng chứng dòng kinh có hại.
- **Không thể gán công cho kinh.** 22 lượt khác nhau về việc, về tộc và về nghề; không có nhóm đối chứng cùng thời gian; trong cùng khoảng đó có hai thay đổi khác (prompt Tể tướng ở #250 và #251). Theo điều kiện xong của PS-12e, kết quả này vẫn là xong: số đo đã trả lời được câu hỏi, và câu trả lời là "chưa thấy giảm đủ rõ".

Khuyến nghị: giữ chín dòng đã nạp (khối kinh trong prompt người làm có trung vị 2 154 ký tự, mục "Cỡ prompt theo vai và khối" của sổ đo), **gỡ không vội** dòng `agshqk`, nhưng đặt nó vào danh sách đáng xét lại sau 40 lượt có nạp. Chi tiết ở §5.

## 2. Việc đã làm

| Bước của kế hoạch | Kết quả |
|---|---|
| 1. `elvaria upgrade` lên bản có PS-12d | Vương quốc ghim `a636fff` suốt lần chạy (ghi chú phiên điều phối: không cần nâng thêm để đo) |
| 2. Sửa 8 dòng kinh có đầu phạm vi và `fail_kind` | Có sao lưu vào `.backup/20261119T2110-ps12e-scripture/`; `elvaria scripture lint` sạch. Dòng `nj1bcx` cố ý không có `fail_kind` (xem §3) |
| 3. Thêm nhân vật nghề `monk` | `ansel` (claude, `claude-haiku-5-5`, cấp 2) |
| 4. Ghi bảng `fail_kinds` làm mốc | `elvaria metrics` trước lần chạy: 110 lượt được chấm, đạt lượt đầu 31/74 quest (42 %) |
| 5. `temple evidence`, rồi `temple run` có người nhìn | 21:25 ngày 2026-11-19, xem §3 |
| 6. Bật `schedule.temple.enabled` | Đã bật (có sao lưu `kingdom.json`); doctor Sẵn sàng |
| 7. Sau ≥ 20 lượt có nạp, đọc `lessonEffectOf` | Đạt: 22 lượt ngày 2026-11-20 |

## 3. Thầy tu đã làm gì

Hai lần chạy, cả hai bằng một phiên không tool trên model rẻ (`ansel`, Claude Haiku 5.5):

| Lần | Lúc | Kích hoạt | Nhóm lỗi đọc | Thao tác | Thư | Token | Lượt |
|---|---|---|---|---|---|---|---|
| 1 | 2026-11-19 21:25 | chủ nhân (`temple run`) | 2 (`incomplete` 8 phán quyết, `wrong_facts` 5) | 2 `add` | 0 | 19 645 | 2 |
| 2 | 2026-11-20 09:12 | đình chỉ (ember, tộc gemini) | 2 | 0 | 0 | 20 994 | không ghi |

- Lần 1 thêm hai dòng: `L_20261119_agshqk` (`incomplete`, phạm vi vai `assignee`, nguồn `q_20261111_8gg2w0-1`) và `L_20261119_t90y28` (`wrong_facts`, không phạm vi, nguồn `q_20261117_m8d5t2-1`), áp lúc 21:31 khi Nhiếp chính chạy lệnh `temple_report`. Kinh có 10 dòng: 8 của chủ nhân và 2 của Thầy tu.
- Lần 2 không thao tác nào. Báo cáo này không điều tra lý do; xem tờ trình trong `inbox/done` nếu cần.
- Cả hai lần đều ở bậc model; chưa có quyết định ở bậc script nào của Thầy tu (không có thư `proposal`, 0 thư). Trần ước lượng của DB12 là khoảng 10 000 token đầu vào; thực đo mỗi lần chừng 20 000 token cả vào và ra, tức **gấp đôi ước lượng**, vẫn nhỏ so với một quest (§4).
- Dòng `nj1bcx` (đọc file lớn thì tìm trước) không có `fail_kind` nên không thể đo tác dụng; nó chỉ có số lượt nạp (47) và trúng (0). Đó là giới hạn của số đo, không phải bằng chứng nó vô ích.

## 4. Bảng trước và sau

Cột "Trước" lấy từ `logs/ps12e-metrics-before.txt` (110 lượt được chấm); "Sau" là lượt trượt trong 22 lượt kể từ khi nạp dòng mới.

| Dòng kinh | Loại lỗi | Lượt nạp | Trúng / trượt | Trước | Sau | Đổi |
|---|---|---|---|---|---|---|
| `a61684`, `da20we`, `s4x1pw`, `t90y28` | `wrong_facts` | 47 | 43 / 1 (mỗi dòng) | 8/110 (7,3 %) | 1/22 (4,5 %) | −3 điểm |
| `ar8614`, `mmw792` | `style` | 47 | 44 / 0 | 2/110 (1,8 %) | 0/22 | −2 điểm |
| `agshqk` | `incomplete` | 24 | 18 / 4 | 11/110 (10 %) | 4/22 (18 %) | +8 điểm |
| `m22zq0`, `25hqeh` (verifier, codex, win32) | `wrong_facts` | 8 | 8 / 0 | không tính | không tính | cột "Tác dụng" trống |
| `nj1bcx` | — | 47 | 0 / 0 | — | — | không đo được |

Bốn dòng `wrong_facts` đo trên cùng một tập lượt nên 1/22 là **một** lượt trượt đếm bốn lần trong cột "Trượt", không phải bốn lượt. Cùng cách đếm với `style`.

Số đo toàn vương quốc (không riêng kinh): đạt lượt đầu 31/74 (42 %) → 42/91 (46 %); trong 17 quest mới, 11 đạt lượt đầu (65 %). Con số này còn chịu ảnh hưởng của việc khác (prompt Tể tướng ở §6, mẫu quest khác nhau), không gán cho kinh.

## 5. Giới hạn của số đo

- **Cỡ mẫu**: 22 lượt, và trong 20 lượt khoảng ±1 lượt trượt đổi tỉ lệ 5 điểm. `wrong_facts` 1/22 so với 8/110 không đủ để bác bỏ "không đổi"; `style` chỉ có 2 lượt trượt làm mốc.
- **Không có đối chứng**: so trước và sau, không so có kinh với không kinh cùng lúc.
- **Hỗn tạp**: các lượt khác về việc (docs, backend, i18n, integration), về tộc (claude, codex, gemini), về nghề (mage, knight, scout, scribe) và về lãnh thổ; dòng `wrong_facts` không phạm vi nên nạp vào mọi lượt.
- **Nhiễu từ cùng một quest**: ba phán quyết `incomplete` của `yp3jmk` (một quest bị hủy) chiếm ba trong bốn lượt trượt của dòng `agshqk`.
- **Một lần đo nhưng hai thay đổi**: prompt Tể tướng được sửa ở #250 và #251 trong cùng khoảng; hai việc đó tác động tới việc đầu vào của nhân vật, nên làm dịch tỉ lệ trượt.

## 6. Token và chi phí lần chạy

| Việc | Token | Ghi chú |
|---|---|---|
| Thầy tu, lần 1 và 2 | 19 645 và 20 994 | gấp đôi ước lượng của DB12, nhỏ hơn mọi quest dưới đây |
| Quest hạng C của dorian (`txr2c6`) | khoảng 480 000 | vượt ngân sách 360 000 |
| Quest của gemini (hạng F) | khoảng 316 000 | nghiệm thu |
| Quest hạng D của brann (`hh9z0a`) | hơn 496 000 | xin sửa thêm file spec qua thư `amendment` |
| `yp3jmk` | khoảng 1,08 triệu | **thất bại**: việc nhỏ (lệnh `elvaria watch`) bị Tể tướng lập thành quest kế hoạch với quest con và probe, người chấm cassia loại ba lần vì luật ADR 0028; làm lại như quest trực tiếp (`mxpx9q`) thì đạt ngay lượt đầu |

Bài học: chi phí lớn của lần chạy nằm ở quest của nhân vật và ở việc Tể tướng chọn dạng quest sai, không ở Đền. Đã sửa prompt Tể tướng ở #250 (luật soạn nháp chuyển vào `prompts/chancellor.md`) và #251.

## 7. Lỗ hổng tìm được

1. Cột "Nạp" của `elvaria scripture list` là trạng thái nạp (rỗng nghĩa là nạp được), không phải bộ đếm; bộ đếm của bước 7 là cột "Tác dụng" của `elvaria metrics` (phiên điều phối đã đính chính prompt lúc chạy).
2. Dòng không có `fail_kind` (như `nj1bcx`) không bao giờ có "Tác dụng": nên có `fail_kind` cho mọi dòng muốn đo, hoặc một thước khác cho dòng chung.
3. Dòng có phạm vi hẹp (`role=verifier tribe=codex os=win32`) ít lượt hơn (8) nên chưa đủ 20 lượt; lỗ hổng chung của phép đo theo dòng là cần thời gian dài hơn một ngày.
4. Tể tướng lập quest kế hoạch cho việc nhỏ (`yp3jmk`, §6): đã vá bằng prompt, chưa có số đo cho thấy hết.
5. Lần chạy 2 của Đền (9:12) không thêm gì; nếu lỗi lặp không đổi, mỗi lần đình chỉ vẫn tốn 20 000 token. Có thể cho `temple run` bỏ qua khi gói bằng chứng giống lần trước (đề xuất, ngoài phạm vi).

## 8. Quyết định cần chủ nhân chốt

| # | Câu hỏi | Khuyến nghị |
|---|---|---|
| a | Giữ chín dòng đã nạp | Giữ: chi phí thấp, `wrong_facts` và `style` không tệ đi |
| b | `agshqk` (`incomplete`) có gỡ không | Giữ, xem lại sau 40 lượt có nạp; đừng gỡ trên 22 lượt khi nhiễu của `yp3jmk` đang chiếm đa số |
| c | `nj1bcx` không có `fail_kind` | Đặt thêm `fail_kind` cho nó (đo được) hoặc chấp nhận không đo |
| d | Tiếp tục bật lịch `schedule.temple` | Bật; mỗi ngày một lần là đủ rẻ |
| e | Cho `temple run` bỏ qua khi gói bằng chứng không đổi | Làm thành một task nhỏ riêng nếu chủ nhân thấy 20 000 token mỗi đình chỉ là nhiều |
