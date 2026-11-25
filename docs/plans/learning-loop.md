# Vòng học cấp Nhiếp chính: sự cố vận hành từ sổ event — kế hoạch chi tiết

Ngày: 2026-11-25 · Trạng thái: **chờ chủ nhân chốt VH1–VH12** (mục 10) · Nguồn: §11 ngày 2026-11-25, (533)–(535) và (552) · ADR nháp: [0036](../adr/0036-disruptions-second-source-of-learning.md) · Đo trên `main` `cf0fd1fb`, sổ event của `my-kingdom` từ 2026-11-07 tới 2026-11-25 (19 ngày, 22 193 dòng).

Các task `LL-…` ở mục 9 đã vào bảng §8 của kế hoạch triển khai, chưa mở; phiên điều phối quyết lúc mở.

## 1. Bối cảnh

Bài học hôm nay đi một đường: phiên điều phối (người cùng Claude Code, ngoài Elvaria) gặp sự cố, ghi vào file bài học, rồi một đợt rà tay biến chúng thành nhánh sửa repo, dòng địa chí hay dòng kinh. Thầy tu chạy được mỗi ngày nhưng gói bằng chứng của nó chỉ có phán quyết trượt lặp lại ([ADR 0027](../adr/0027-measured-learning.md), `templeEvidenceOf`): hàng đợi đứng, setup bị bỏ, lượt làm lại do hạ tầng, test hết giờ khi máy tải không bao giờ tới nó.

Chủ nhân chốt ở (534) và (535): Nhiếp chính tự nhận ra sự cố của chính mình từ sổ event, không tốn mana; chỗ sổ event chưa đủ thì thêm event hay trường trước (bước (e)); sau đó Thầy tu mới đọc sự cố mỗi tuần và viết thư. File bài học của các đợt rà làm bộ thử.

Kế hoạch này gọi thứ được nhận ra là **sự cố vận hành** (id đề xuất `disruption`, VH1): một lần bộ máy của vương quốc làm chậm hay làm hỏng việc mà không phải do bài làm sai. Từ `incident` của bảng thuật ngữ đã dành cho báo động chuyển thế giới sang phòng thủ (event `incident.*`), nên không dùng lại.

## 2. Bộ thử và bảng chấm

Bộ thử gồm 51 sự cố rút từ năm file bài học (2026-11-12 tới 2026-11-24) và các ứng viên (e3)–(e10) của sổ chờ điều phối, cộng hai mẫu điều phối đã chấm mà file bài học chưa có (setup không chạy lại khi lockfile đổi, README của AH-08b). Thang chấm:

- **Đủ**: một luật trên các trường đang có nhận ra sự cố cùng nguyên nhân của nó.
- **Một phần**: sổ event cho thấy triệu chứng (dừng, trượt, chờ) nhưng nguyên nhân chỉ nằm trong chữ tự do, hoặc phải đoán từ khoảng cách giờ giữa hai event.
- **Thiếu**: sổ event không có dấu vết.
- **Ngoài**: sự cố không đi qua tiến trình Nhiếp chính (repo đang phát triển, shell của phiên điều phối, CI, tài liệu); không tính vào mẫu số.

Kết quả: 22 sự cố **Ngoài**, 1 không đủ dữ kiện để chấm (L45), còn 30 trong phạm vi. 11 dòng soi trên sổ event thật (đánh dấu ✔), phần còn lại chấm theo hợp đồng event (trường có hay không).

| Mức | Số | Tỉ lệ | Sự cố |
|---|---|---|---|
| Đủ | 7 | 23 % | L30 quest không ai nhận được (`quest.unclaimable`); L31 ✔ phiên hết `max_turns` rồi vẫn nộp; L32 Tể tướng soạn cho nghề không có người; L33 ✔ vùng thiếu file (`out_of_scope`); L38 lời người chấm (nguồn verdict); L40 lượt hỏi đồ thị code; L42 quest bị sửa sau khi phiên mở |
| Một phần | 17 | 57 % | L01 ✔ `retry` mở lại cho cả nghề; L02 ✔ `quest edit` giết phiên đang chạy; L03 EBUSY ở `tribe check`; L05, L29 setup hay build thiếu thành `breaker:commit`, `breaker:setup`; L06, L36 ✔, L37 ✔, L41 check đỏ vì sandbox, hết giờ, tải; L17 ba vòng chấm; L39 tàu đỏ; L43 ✔ hàng đợi đứng 48 phút; L44 ✔ `git commit` hết trần 120 s; L46 ✔ câu hỏi rỗng `---`; L47 ✔ pre-push hết giờ; L48 ✔ làn khách thoát 3; README của AH-08b |
| Thiếu | 6 | 20 % | L04, L08 đất không được dọn; L09 CLI của tộc bị thay dưới bản ghim (tộc bị giữ không có event); L25, L35 Nhiếp chính dừng hay chết giữa chừng; setup không chạy lại khi lockfile đổi |

So với mẫu điều phối đã chấm: bốn trên năm khớp. Riêng hàng đợi đứng sáng 25 (L43) điều phối chấm Thiếu, ở đây là Một phần: độ dài chờ suy được (`delivery.enqueued` 09:24:43 tới `delivery.guest_merged` 10:12:20), còn lý do (nhánh mặc định đỏ từ lượt tuần tra 09:18, dò ra `flaky` lúc 09:32, không ai tuần tra lại tới khi chủ nhân gõ lệnh 09:58) thì không dòng nào nói.

Lỗ hổng theo loại, kèm số đo trên sổ thật:

| # | Lỗ hổng | Sự cố | Số đo |
|---|---|---|---|
| G1 | Nguyên nhân của một lần trượt chỉ nằm trong chữ | L05, L06, L29, L36, L37, L39, L41, L44, L47, AH-08b | 27 `check.end` trượt, không dòng nào nói check hết giờ hay vì sao; 0 trên 219 mang `environment`; 4 `delivery.failed` có `detail` là chữ ANSI thô; `breaker:commit` ghi "timed out" trong `lines` |
| G2 | Nhiếp chính giữ việc mà không ghi | L09, L43 | 18 lượt làn khách chờ 0–18 phút, một lượt 48 phút; chờ người chấm vì mana, chờ vùng file, tộc bị giữ chỉ rung chuông, không event |
| G3 | Nhiếp chính dừng, chết, khởi động lại | L25, L35 | không loại event nào; chỉ `upgrade.*` |
| G4 | Setup và vòng đời của đất | L04, L08, lockfile | setup chỉ có trong `patrol.ran`; đất của quest không có event |
| G5 | Lệnh của chủ nhân không mang đối tượng | L01, L02 | 2 trên 646 `command.applied` có `quest` ở phong bì; 121 `quest.edited` (15 lúc quest đang `working`) không nói trường nào đổi |
| G6 | Chỉ nhận ra bằng đọc chữ | L03, L46, L48 | để ngoài (VH12) |

## 3. Thiết kế: sự cố là số đọc, luật là dữ liệu

### 3.1 Hàm thuần

`disruptionsOf(events, kinds, window)` ở `packages/domain/src/disruption/` trả về danh sách sự cố, không IO, không đồng hồ. Mỗi sự cố mang: `kind` (id trong registry), `territory` và `quest` khi có, `from` và `to` (giờ của event đầu và cuối), `minutes` khi là một khoảng chờ, `cause` khi event mang mã nguyên nhân, và `evidence`: id của các event làm chứng, ít nhất một, theo thứ tự. Không gì được lưu: sự cố suy ra mỗi lần đọc, như danh hiệu và số đếm (ADR 0020).

### 3.2 Loại sự cố là dữ liệu registry

File registry mới `disruptions.json` (bản mặc định ở `packages/registry-default/`), mỗi dòng một loại, theo một trong hai khuôn (ADR 0016: lõi không `switch` theo loại, chỉ biết hai khuôn):

- `event`: một event thuộc `type` thỏa các điều kiện `where`.
- `sequence`: event `first` rồi event `then` trên cùng đối tượng (`same`: `quest`, `territory`, `session` hay `attempt`), cách nhau không quá `within_seconds` hoặc ít nhất `after_minutes`; tùy chọn `unless`, một event xen giữa làm luật không khớp.

Điều kiện là một đường dẫn có chấm vào dòng event (`data.reason.code`, `actor.kind`) cùng đúng một phép: `in` (danh sách giá trị), `gte` (số) hay `exists`. Không biểu thức, không regex trên chữ tự do: sự cố chỉ nhận ra được bằng đọc chữ là dấu hiệu sổ event còn thiếu mã, và được sửa ở sổ event (mục 4).

Các loại mặc định của đợt đầu, chỉ dùng event đang có: `session_cut_then_submitted` (L31), `edit_killed_session` (L02), `edited_after_start` (L42), `retry_changed_assignee` (L01), `guest_waited` (L43, `after_minutes` 30), `commit_refused` (`breaker:commit`, `breaker:commit_errors`), `setup_failed` (`breaker:setup`, `patrol.ran` có `setup.pass` sai), `delivery_refused` (`delivery.failed`), `checks_stopped`, `unclaimable` (L30, L32), `many_rounds` (L17: ba `verdict.fail` trên một quest). Các loại dùng event mới thêm vào ở task dựng event đó.

File `disruptions.json` nằm trong đường bảo vệ như phần còn lại của registry (ADR 0026): Thầy tu chỉ đề xuất đổi luật bằng thư.

### 3.3 Chạy ở đâu

Không có tiến trình hay lịch mới cho việc nhận diện. Hàm thuần được ba chỗ gọi, đều ở bậc script (ADR 0017):

1. `elvaria metrics` in mục "Sự cố vận hành": loại, số lần, tổng phút, id event của ba lần gần nhất; `--json` trả đủ.
2. Bản tấu hằng ngày thêm một dòng đếm theo loại của ngày hôm trước.
3. Gói bằng chứng của lượt Thầy tu vận hành (mục 5).

Hàm không thành một trường của `Metrics`: `metricsOf` đã 243 dòng và HL-06, CM-08 cùng thêm vào đó; lệnh `metrics` gọi nó cạnh `metricsOf`.

### 3.4 Bộ thử thành fixture

30 sự cố trong phạm vi thành fixture ở `packages/domain/src/disruption/__fixtures__/`: mỗi ca một chuỗi event rút gọn (chỉ loại và trường luật cần, id thay bằng id mẫu, không chép chữ của sổ thật hay của file bài học) cùng loại mong đợi và mức mong đợi. Một spec chạy `disruptionsOf` với registry mặc định trên cả bộ và khẳng định từng ca; số ca nhận ra kèm nguyên nhân chia cho 30 là thước đo của (535). Task thêm event thì chuyển ca tương ứng từ "một phần" hay "thiếu" sang "đủ" trong cùng commit.

## 4. Bước (e): event và trường thêm

Mọi thay đổi dưới đây là thêm: loại event mới, hoặc trường tùy chọn trên loại cũ. `v` giữ 2, không migration, đúng tiền lệ của `check.attributed` (CM-04) và của các trường thêm sau v1 (ADR 0003: bản đọc giữ loại lạ). Hệ quả đã biết: schema là `strictObject`, nên một bản ghim cũ hơn không đọc được dòng mới có trường lạ; quay lui `elvaria upgrade` qua các task này cần ghi chú như mọi lần thêm trường trước đây.

### 4.1 Khoảng chờ: `wait.started`, `wait.ended` (G2)

Tên `quest.held` không dùng được: `held` là lệnh giữ của chủ nhân (`elvaria quest hold`, thuật ngữ `hold`). Code đã gọi các khoảng này là "waits" (`JudgeWait`, `ScopeHold`, thư mục `steward/src/waits/`), nên nhóm event mới là `wait`.

- Domain: hàm thuần `waitsOf(snapshot, plan)` trả về những gì đang sẵn sàng mà bị giữ, kèm lý do, từ các hàm đã có; `planTick` không đổi. Năm lý do đầu: `base_red` (nhánh mặc định đỏ, hàng đợi và quest mở cùng chờ, PS-09d), `scope_held` (vùng file do quest khác giữ, `scopeHoldsOf`), `mana` (mọi người hợp lệ bị bình mana giữ, `JudgeWait` và phía người làm), `tribe_held` (tộc bị tắt hay bị giữ vì phiên bản CLI), `room_full` (phòng nền đầy hay check `exclusive` đang chạy).
- Nhiếp chính ghi theo cạnh như `quest.unclaimable`: `wait.started` khi một khoảng chờ đã kéo dài 2 phút (`since` là lúc thấy lần đầu), `wait.ended` khi nó hết, mang id của dòng `wait.started` và số phút. Chờ ngắn hơn 2 phút không ghi, nên xếp hàng bình thường không làm đầy sổ. Trạng thái giữa các nhịp ở `.state/waits.json`, dựng lại từ sổ event khi khởi động (mẫu `waits/unclaimable.ts`).
- Dữ liệu: `reason`, đối tượng chờ (`quest` ở phong bì, hoặc `pr` của làn khách), cái đang giữ (`holder`: quest, check, tộc hay bình mana tùy lý do), `resets_at` khi lý do là mana. `quest.unclaimable`, chuông và bản tấu giữ nguyên.

### 4.2 Mã nguyên nhân trên lần trượt (G1)

Tiền lệ có sẵn: `territory.environment_errors` là các mẫu dò trong log của check trượt; khớp thì `check.end` mang `environment` và check được gác lại (P1-54). Kế hoạch nới cơ chế đó thành **dấu nguyên nhân**, vẫn là dữ liệu của lãnh thổ:

- `territory.failure_marks`: danh sách `{ cause, match }`; `cause` là id `snake_case`, `match` là một đoạn chữ của log. Bản mặc định có `timeout` (spec hay lệnh chạm trần giờ), `setup_stale` (thiếu module hay bản build), `hook_refused` (hook git từ chối). `runner-core` dò dòng khớp đầu tiên trong log đã che của check trượt (cùng chỗ với `withEnvironment`), domain quyết.
- Trường tùy chọn `cause: { code, line }` trên từng check trượt của `check.end`, `patrol.ran`, `delivery.guest_refused`, và trên `delivery.failed`. `code` là mẫu id, không phải enum, để lãnh thổ thêm dấu mà không cần bản phát hành. `check.end` thêm `timed_out` cho từng check, như `patrol.ran` đã có.
- Chỉ dán nhãn, không đổi hành vi: check có dấu `timeout` vẫn đỏ. Việc chạy lại một lượt đỏ do tải là phần của kế hoạch (546) (RC-04).
- Mã trạm quân y mới `breaker:commit_timeout` (tham số `seconds`, `log`) cho lúc chính lệnh `git commit` của Nhiếp chính chạm `GIT_TIMEOUT_MS`, tách khỏi `breaker:commit`. Nó không phải một lần hook từ chối, nên không thành `quest.heal_due` (ADR 0034): Y sư không có lỗi nào để chữa.

### 4.3 Các dữ kiện nhỏ (G3, G4, G5)

- `steward.started` (bản đang chạy, `previous`: `clean`, `unclean` hay `first`, `down_minutes`) và `steward.stopped` (`reason`: `owner`, `upgrade`, `signal`). Khởi động mà không có dòng dừng trước đó là một lần chết giữa chừng.
- `plot.setup`: `commands.setup` chạy trong đất của một quest: `trigger` (`first`, `changed`), các file của `setup_when` đã đổi, `pass`, `duration_ms`, `log_path`, `cause` khi trượt. Ca "lockfile đổi mà setup không chạy lại" đã được chặn ở bậc 1 (`refreshSetup`, nhánh `fix/plot-setup-on-lockfile`); event này cho thấy nó có chạy.
- `command.applied` và `command.rejected` mang `quest` ở phong bì khi lệnh nêu một quest (trường phong bì đã có, chỉ chưa điền).
- `quest.edited` thêm `fields`: tên các trường của quest mà lần sửa đổi, không kèm giá trị.

## 5. Lượt Thầy tu vận hành

Thầy tu hôm nay đã chạy ở cấp vương quốc (`templeDue` không theo lãnh thổ); cái mới là nguồn thứ hai. Lượt mới dùng lại nhân vật, phiên và đường thư của Đền thờ:

| | Lượt hôm nay | Lượt vận hành |
|---|---|---|
| Kích hoạt | `quests`, `weekly`, `suspension` | `disruptions`: bảy ngày một lần, khi có loại lặp từ 3 lần trong cửa sổ |
| Bằng chứng | nhóm phán quyết trượt lặp, dòng kinh cùng số đếm | nhóm sự cố theo loại (số lần, tổng phút, lãnh thổ, mã nguyên nhân, tối đa 5 ví dụ với id event), số trước và sau của các thư cũ, sự cố chủ nhân báo mà không luật nào nhận ra |
| Đầu ra | thao tác trên dòng kinh, thư | **chỉ thư**, tối đa 4, mỗi thư nêu bậc của thang sửa lỗi và id event làm chứng |
| Nguồn bắt buộc | id phán quyết | id event có trong gói bằng chứng |
| Đo | `helped`, `missed` từ vết nạp | tỉ lệ của loại sự cố trước và sau khi thư được làm |

- **Vì sao chỉ thư.** Một dòng kinh cần `fail_kind` để đếm `helped` và `missed`; sự cố không có. Nên bậc `knowledge` và `scripture` của lượt này là thư đề xuất câu chữ; khi chủ nhân hay Tể tướng nhận, Nhiếp chính thêm dòng với `origin` ghi loại sự cố và id event. Luật "dòng của Thầy tu phải có phán quyết nguồn" giữ nguyên cho lượt hôm nay.
- **Đường đi.** Bậc 1–3 (sửa Elvaria, lệnh hay check của lãnh thổ, script) là thư `proposal` tới Tể tướng, như hôm nay; bậc 6 tới chủ nhân. Thư đề xuất đổi `disruptions.json` hay `failure_marks` cũng là `proposal`. Nhiếp chính từ chối thư không có id event nào thuộc gói bằng chứng (mã mới `no_evidence_event`).
- **Trần.** Như lượt hôm nay: 3 lượt, 10 phút, không tool, model của nhân vật Thầy tu, prompt tối đa 24 000 ký tự. Gói bằng chứng rỗng thì không mở phiên. Khóa mới `kingdom.schedule.temple.disruptions` (`enabled` mặc định tắt, `every_days` 7, `repeat_min` 3). `temple.ran` thêm giá trị `disruptions` cho `trigger`.
- **Đo trước và sau.** Với mỗi thư đã đóng `handled`: tỉ lệ của loại sự cố trên 100 lượt trong 14 ngày trước và sau ngày đóng; dưới 20 lượt sau thì ghi "còn sớm" (như `FAIL_RATE_BUCKET_RUNS`). Lượt kế nhận lại các số đó: thư đã làm mà tỉ lệ không giảm thì leo bậc hoặc đề xuất gỡ dòng.

## 6. Phần của phiên điều phối

Phiên điều phối ở ngoài Elvaria; quan sát của nó vào vương quốc qua một cửa không tốn mana, theo ADR 0005:

- Lệnh `elvaria disruption report` ghi một lệnh vào `inbox/`; Nhiếp chính ghi event `disruption.reported` gồm `note` (đã che secret), `kind` khi người báo biết, `quest`, `territory` và id event làm chứng khi có. Tiền lệ: `quest.escaped` là lời báo của chủ nhân về lỗi lọt.
- Một lời báo mà không luật nào nhận ra trong cùng khoảng giờ là một **lần sót**. Số lần sót chia cho số lời báo là thước đo sống của độ phủ, tiếp tục sau khi bộ thử đã đóng băng; lượt Thầy tu vận hành nhận các lần sót và đề xuất luật hay event mới.
- Cho tới khi cửa này có (LL-08), bài học điều phối vẫn đi đường tay của (531) và chỉ làm bộ thử. Thư tay không dùng: thư cần phân loại từng cái, còn lời báo là một điểm dữ liệu có nhãn.

## 7. Ca biên

- Hai luật khớp cùng một event: cả hai được báo; gói bằng chứng gộp các sự cố chung event làm chứng thành một ví dụ.
- Khoảng chờ còn mở khi Nhiếp chính dừng: lúc khởi động, khoảng chờ không còn đúng được đóng bằng `wait.ended` với giờ khởi động; sự cố có `to` trống khi sổ kết thúc giữa chừng.
- Cửa sổ cắt ngang một chuỗi: `sequence` chỉ khớp khi event đầu nằm trong cửa sổ; event sau được đọc quá cửa sổ tối đa bằng `within_seconds` hay một ngày.
- Dòng `v` 1: đọc qua migration như mọi nơi; lý do `legacy` không khớp luật theo mã, và 30 trên 43 dòng `quest.infirmary` của sổ thật thuộc dạng này, nên số đếm của những ngày đầu thấp hơn thực tế.
- Registry lỗi: `disruptions.json` sai schema thì `elvaria metrics` báo lỗi của file và bỏ mục sự cố; phần còn lại của sổ đo vẫn in.
- Dấu nguyên nhân khớp nhầm: `cause` luôn kèm `line`, nên người đọc kiểm được; dấu chỉ dò trong log của check đã trượt.
- Lượt Thầy tu vận hành và lượt hôm nay cùng tới hạn một ngày: chạy lượt hôm nay trước, lượt vận hành ngày sau, để mỗi ngày tối đa một phiên Thầy tu.
- Thư trùng: gói bằng chứng liệt kê thư còn mở theo loại sự cố; Nhiếp chính từ chối thư thứ hai cho cùng loại khi thư trước chưa đóng.
- Secret: `note` của lời báo và `line` của dấu nguyên nhân qua bộ che trước khi ghi (ADR 0013).

## 8. Đo thành công

| Thước đo | Hôm nay | Sau LL-01 | Sau LL-04 | Sau LL-05 |
|---|---|---|---|---|
| Sự cố của bộ thử nhận ra kèm nguyên nhân (trên 30) | 7 (23 %), chấm tay | 9 (30 %) | 15 (50 %) | 22 (73 %) |
| Sự cố của bộ thử thấy được triệu chứng | 24 (80 %), chấm tay | 24 | 28 | 28 |

Các cột sau là dự tính theo từng ca; spec của LL-01 thay số chấm tay bằng số máy đếm. Ngưỡng đề xuất (VH10): từ 70 % kèm nguyên nhân sau LL-05. Tám ca còn lại (L03, L04, L06, L08, L39, L46, L48, AH-08b) để ngoài có chủ ý.

Với lượt Thầy tu vận hành, sau bốn tuần bật: số thư gửi, số được nhận (`accepted` hay `handled`), số bị bác; với thư đã làm, tỉ lệ của loại sự cố trước và sau; số lời báo tay và số lần sót. Đạt khi quá nửa số thư được nhận và ít nhất một loại sự cố giảm tỉ lệ sau thư của nó; không đạt thì tắt lịch và xem lại gói bằng chứng trước khi tốn thêm mana.

## 9. Chia task (đã vào §8, chưa mở)

| Task | Cỡ | Cần trước | Việc | Model gợi ý |
|---|---|---|---|---|
| LL-01 | M | không | registry `disruptions.json`, `disruptionsOf`, các loại trên event đang có, fixture bộ thử cùng spec đo | Phiên, Opus high |
| LL-02 | S | LL-01 | mục "Sự cố vận hành" của `elvaria metrics`, `--json` | Quest tộc codex có brief |
| LL-03 | M | HL-05, LL-01 | `wait.started`, `wait.ended`, `waitsOf`, sổ `.state/waits.json` | Phiên, Opus xhigh |
| LL-04 | M | HL-05, LL-01 | `steward.started`, `steward.stopped`, `plot.setup`, `quest` trên lệnh, `fields` của `quest.edited` | Phiên, Opus high |
| LL-05 | M | HL-05, RC-04, LL-01 | `failure_marks`, `cause`, `timed_out`, `breaker:commit_timeout` | Phiên, Opus xhigh |
| LL-06 | S–M | HL-05 | (552)(a): ghi chú có mã cho `probe()` | Quest tộc codex có brief |
| LL-07 | S–M | HL-05 | (552)(b): mã lý do của bản vá và của script | Quest tộc codex có brief |
| LL-08 | S | LL-02 | `elvaria disruption report`, `disruption.reported`, số lần sót | Quest tộc codex có brief |
| LL-09 | M | LL-03, LL-05 | domain của lượt Thầy tu vận hành: tới hạn, gói bằng chứng, luật của thư, số trước và sau | Phiên, Opus xhigh |
| LL-10 | M | LL-09, LL-08 | nối lượt vận hành vào lịch, prompt, bản tấu, sổ đo; ADR 0036 thành accepted | Phiên, Opus high |

Thứ tự theo phụ thuộc: **đợt A** (LL-01, LL-02) không chạm file nào của HL-04, HL-05, nên làm được trước đợt Y sư; **đợt B** (LL-03, LL-04, LL-05, LL-06, LL-07) sau HL-05; **đợt C** (LL-08, LL-09, LL-10). Bước (e) (LL-01 tới LL-05) xong trước lượt Thầy tu (LL-09, LL-10), đúng (535).

Hai dòng (552) là LL-06 và LL-07: cùng chủ đề "mã máy đọc thay cho chữ" với mục 4.2 nhưng không task nào của vòng học cần chúng trước, nên đứng riêng trong đợt B, mỗi dòng một quest.

**Đọc trước** của từng task: LL-01 đọc ADR 0016, 0026, `packages/domain/src/schema/registry*.ts`, `metrics/causes.ts`; LL-03 đọc `dispatch/scope.ts`, `dispatch/judge-waits.ts`, `dispatch/forge-due.ts`, `steward/src/waits/unclaimable.ts`; LL-04 đọc `steward/src/tick/restart.ts`, `steward/src/plot/plot.ts`, `steward/src/inbox/apply.ts`; LL-05 đọc `runner-core/src/checks/environment.ts`, `steward/src/review/environment.ts`, hợp đồng [infirmary-reason-codes](../contracts/infirmary-reason-codes.md), ADR 0034; LL-06 và LL-07 đọc `runner-core/src/runner/doctor-notes.ts` (mẫu ghi chú có mã) và hợp đồng trên; LL-09 đọc ADR 0027, [temple-first.md](temple-first.md), `domain/src/temple/**`.

### Chồng với việc khác

- **HL-04, HL-05**: cùng chạm `domain/src/infirmary/reasons.ts` (LL-05, LL-07), `steward/src/tick/**` và `sessions/**` (LL-03, LL-04, LL-05). Vì vậy đợt B đứng sau HL-05. `waitsOf` đọc `TickPlan`, không sửa `plan-tick.ts`.
- **HL-06**: cùng chạm `apps/cli/src/metrics/**` với LL-02 (một chỗ nối mục vào báo cáo); hai task không cùng mở, hoặc task sau gộp tay.
- **Kế hoạch (546)** ([recheck.md](recheck.md), task `RC-…`, PR #322): RC-03 thêm `tree`, `base`, `config`, `carried_from` vào `check.end` và `patrol.ran`, đúng hai file schema mà LL-05 thêm `cause` và `timed_out`; RC-04 nối luật cùng cây ở `steward/src/{patrol,forge,review}/**` và cho hàng đợi chạy lại check đỏ một lần rồi ghi `flaky`. Vì vậy LL-05 đứng sau RC-04. Phần dùng chung: có `tree` của RC-03 thì registry thêm được loại "cùng cây, đỏ rồi xanh" mà không cần trường mới; `cause` của LL-05 chỉ dán nhãn và không đụng luật chạy lại của RC-04; check mang sang (`carried_from`) không được dò dấu nguyên nhân vì nó không có log mới.
- **CM-08**: thêm `train.ran` và `train` trên event giao hàng; LL-05 thêm `cause` vào cùng file schema `delivery-data.ts` (hai trường tùy chọn khác tên). Loại sự cố cho tàu đỏ thêm sau khi `train.ran` có.

## 10. Quyết định cần chủ nhân

**Phải chốt trước khi mở task:**

- **VH1** (trước LL-01). Tên khái niệm: `disruption`, tiếng Việt "sự cố vận hành"; `incident` giữ cho báo động của thế giới. *Khuyến nghị: nhận.* Hướng khác: dùng lại `incident`, đổi nghĩa mục thuật ngữ đã có.
- **VH2** (trước LL-01). Luật nhận diện là file registry `disruptions.json` với hai khuôn và ba phép so, thuộc đường bảo vệ. *Khuyến nghị: nhận.* Hướng khác: bảng hằng trong domain như `metrics/causes.ts`, đơn giản hơn nhưng mỗi luật mới cần một bản phát hành.
- **VH3** (trước LL-01). Bộ thử vào repo dưới dạng fixture rút gọn, id mẫu, không chép chữ của sổ thật hay của file bài học. *Khuyến nghị: nhận.*
- **VH4** (trước LL-03). Khoảng chờ là hai loại event mới `wait.started`, `wait.ended`, ghi khi chờ từ 2 phút, năm lý do đầu, `quest.unclaimable` giữ nguyên. *Khuyến nghị: nhận.*
- **VH5** (trước LL-05). Dấu nguyên nhân là dữ liệu lãnh thổ (`failure_marks`), chỉ dán nhãn; mã mới `breaker:commit_timeout` không đi vào Y sư. *Khuyến nghị: nhận.*
- **VH6** (trước LL-09). Lượt Thầy tu vận hành chỉ viết thư; dòng kinh hay địa chí được thêm khi thư được nhận, mang `origin` là id event. *Khuyến nghị: nhận.* Hướng khác: cho Thầy tu tự thêm dòng với nguồn là event, nhanh hơn nhưng dòng không đo được `helped`, `missed`.
- **VH7** (trước LL-09). Lịch bảy ngày một lần, mặc định tắt, cần loại lặp từ 3 lần; trần phiên như lượt Thầy tu hôm nay. *Khuyến nghị: nhận.*

**Chờ được:**

- **VH8.** Cửa báo tay `elvaria disruption report` (LL-08) thay cho thư tay. *Khuyến nghị: nhận.*
- **VH9.** Đợt A (LL-01, LL-02) mở trước đợt Y sư vì không chồng file. *Khuyến nghị: nhận; phiên điều phối quyết lúc mở.*
- **VH10.** Ngưỡng thành công của bước (e): từ 70 % sự cố của bộ thử nhận ra kèm nguyên nhân sau LL-05. *Khuyến nghị: nhận.*
- **VH11.** LL-05 đứng sau RC-04 của kế hoạch (546) vì cùng file schema và cùng thư mục của Nhiếp chính; loại sự cố "cùng cây, đỏ rồi xanh" thêm vào registry sau RC-03. *Khuyến nghị: nhận.*
- **VH12.** Không thêm event cho L04, L08 (đất không được dọn, đã chặn ở bậc 1) và không dò chữ cho L03, L46, L48. *Khuyến nghị: nhận.*

**Đề xuất ngoài phạm vi:** hôm nay một lần `git commit` của Nhiếp chính hết trần 120 s vẫn mang mã `breaker:commit`, tức là cùng mã với lần hook từ chối mà ADR 0034 gửi đi chữa; phiên HL-05 nên kiểm ca này trước khi LL-05 tách mã.
