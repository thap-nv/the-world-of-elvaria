# Bỏ các lượt kiểm lặp: sổ kiểm theo cây, dấu cho hook pre-push, ghép nhánh gốc trước lượt kiểm — kế hoạch chi tiết

Ngày: 2026-11-25 · Trạng thái: **chủ nhân đã chốt K1–K11 ngày 2026-11-25, đều theo khuyến nghị** (mục 7) · Nguồn: (546), (555), (556) chủ nhân đã "oke" hướng ngày 2026-11-25 ([§11](../implementation-plan/11-2026-11-25.md), dòng "chủ nhân chốt (540)–(551)" và dòng "chủ nhân chốt (552)–(556)") · ADR nháp: [0035](../adr/0035-checks-once-per-tree.md) · Đo trên `main` `b6f0abcb`, vương quốc `my-kingdom` (ghim `3d16479b`), sổ event `events/2026-11-25.jsonl`.

Kế hoạch này xây trên [check-modes.md](check-modes.md) (CM-01 tới CM-07 đã xong) và hàng đợi của [phase-2-merge-queue.md](phase-2-merge-queue.md), không thiết kế lại chúng. Tên hàm, tên trường và con số là đề xuất khớp code ở `b6f0abcb`: phiên làm task được đổi cho hợp, miễn giữ hợp đồng, và ghi chỗ đổi vào §11. Phiên điều phối quyết thứ tự và lúc mở task.

## 1. Số đo ngày 2026-11-25 (lãnh thổ `elvaria`, `narrow` + `pr_merge`)

Đếm từ `check.start`, `check.end`, `patrol.ran`, `plot.merged`, `delivery.*`; mã cây lấy bằng `git rev-parse <commit>^{tree}`. Trong ngày có 16 thay đổi vào `main`: 7 quest và 9 PR khách.

| Lượt kiểm | Số lượt | Tổng thời gian | Ghi chú |
|---|---|---|---|
| Sau phiên (trước người chấm) | 12 | 8 177 s (136 phút) | 8 lượt chạy như `full`: bảy lượt của quest chạm `full_when` (`pnpm-lock.yaml`), một của quest Hợp nhất; 2 lượt đỏ |
| Hàng đợi, sau khi ghép nhánh gốc | 7 | 4 847 s (81 phút) | cả 7 đều có `plot.merged` ngay trước: cây đã khác cây của lượt sau phiên |
| Khách | 10 | 2 355 s (39 phút) | 5 PR chỉ có tài liệu (3 check, 10–60 s) |
| Tuần tra `merged` | 14 | 10 219 s (170 phút) | dòng đầu (07:27) là của merge cuối ngày 24 |
| Tuần tra `schedule` và `owner` | 2 | 1 734 s (29 phút) | |
| Hook pre-push trong `git push` của Nhiếp chính | 7 lần push được, 2 lần bị từ chối | ước 70–80 phút | không có event; sáu lần có lượt hàng đợi ngay trước mất 7:44–10:40 từ `check.end` tới `delivery.pushed` (`push.log` cho thấy `check:fast` chạy trong đất của quest) |

Cộng lại khoảng 530 phút máy cho 16 thay đổi, tức chừng 33 phút mỗi thay đổi. Một quest chạm `full_when` chạy bộ `test` đủ bốn lần cho cùng nội dung: sau phiên, ở hàng đợi, trong hook pre-push, ở tuần tra.

Từng kiểu lặp, đối chiếu với năm mục A–E của (556):

| Mục | Thực tế đo được | Hệ quả cho thiết kế |
|---|---|---|
| A | Bảy quest giao hàng và ba PR khách (#317, #319, #320) có commit merge **cùng mã cây** với đầu nhánh đã kiểm (ví dụ `527d8612` và `e43d91e3` cùng cây `a52d1360`). Năm lượt tuần tra chạy lại đúng cây vừa qua một lượt đủ bộ: `e43d91e3`, `07e27ecc`, `6e448a6f`, `95ac0e92`, `3d16479b`, cộng 3 975 s. Lượt 09:18 còn đỏ vì chập chờn và kéo theo 14 phút dò | Luật cùng cây (mục 2.1) bỏ trọn năm lượt này |
| A, phần còn lại | Bốn lượt tuần tra đi sau merge chỉ có tài liệu (`280b6de2`, `4de1578c`, `eb8699d5`, `0032d3c0`, cộng 2 693 s): lượt khách trước đó là lượt hẹp 3 check, nên luật cùng cây không giúp. Năm lượt còn lại: bốn lượt đi sau một lượt hẹp có code (tuần tra là lượt đủ bộ thật của chúng) và dòng 07:27 của merge ngày 24, chưa đối chiếu | Luật "phần khác nằm ngoài `when`" (mục 2.6); năm lượt cuối giữ nguyên |
| B | 07:44 tuần tra `schedule` trên `459a99a7`, đầu đã tuần tra xanh lúc 07:27: 1 018 s, chồng với lượt kiểm của một quest | Luật cùng cây, có trần tuổi |
| C | **Tiền đề của (556) không khớp sổ event.** Giữa lượt sau phiên và lượt hàng đợi luôn có một `plot.merged`: quest tách nhánh từ một `main` cũ, hàng đợi ghép `main` mới rồi kiểm lại, nên hai lượt chạy trên **hai cây khác nhau**. Khi nhánh đã giữ nhánh gốc thì hàng đợi vốn bỏ lượt kiểm (`update.state: current`, quest zxz2yw). Với bốn quest (mw33rr, zz3c7z, zatpdc, vxhvkm) `main` không đi trong lúc chấm (zz3c7z sát nút: `main` đi đúng lúc lượt sau phiên bắt đầu): lượt hàng đợi (2 664 s) chỉ để kiểm phép ghép mà lượt sau phiên đã có thể kiểm | "Chỉ chạy check chưa có" không cứu được C. Phải đổi thứ tự: ghép nhánh gốc **trước** lượt kiểm sau phiên (mục 2.5, ADR 0035) |
| D | vxhvkm 14:52: lượt hàng đợi đỏ `test` vì máy tải, kết luận `combination` ngay (không chạy lại lần nào), mở quest Hợp nhất sqcack: thêm một phiên model, một lượt sau phiên 1 061 s, một lượt hàng đợi 554 s. sqcack 15:15 và 15:30: `push_refused` vì `check:fast` trong hook hết giờ | Hàng đợi chạy lại check đỏ một lần trên cùng cây trước khi kết luận (mục 2.2); hook không chạy lại (mục 2.3) |
| E | Làn khách coi lệnh hẹp thoát 3 là đỏ (PR #317) | Đã sửa ở `fix/narrow-uncovered-full` (PR #321, merge `cf0fd1fb`); không thuộc task nào dưới đây |

## 2. Thiết kế

### 2.1 Sổ kiểm và luật cùng cây

- **Một lần check xanh là một sự thật về một cây git**, không về một commit hay một nhánh. "Cùng cây" đo bằng mã cây (`git rev-parse <commit>^{tree}`): commit merge do forge tạo, commit ghép thử không ref của làn khách và đầu nhánh quest sau khi ghép có commit khác nhau mà cùng mã cây khi nội dung giống hệt. Không dùng cặp "nhánh gốc + đầu nhánh": hai cặp khác nhau có thể cho cùng một cây, và cây forge tạo ra khi merge mới là thứ tuần tra thấy. Forge ghép khác git ở máy thì mã cây khác, không gì được mang sang: sai lệch chỉ tốn một lượt chạy.
- **Sổ kiểm** (`check_ledger`) là hàm thuần của event log, như `forgeOutcomesOf`: mỗi dòng `check.end` và `patrol.ran` (sau này `train.ran`) mang thêm `tree`, `config` và, với lượt hẹp, `base`. Từ đó suy ra các dòng sổ: lãnh thổ, check, loại lệnh (`run` hay `narrow`), mã cây, gốc diff (chỉ với `narrow`), giờ chạy, dòng nguồn. Không file mới; Nhiếp chính dựng lại sổ lúc khởi động và thêm từng dòng nó ghi. Sổ không nằm trong `forge/book.ts` (theo quest) hay `guest-book.ts` (theo PR): nó theo cây, và hàng đợi, làn khách, tuần tra, tàu cùng đọc.
- **Luật cùng cây:** trước khi chạy một check, Nhiếp chính hỏi sổ. Check được **mang sang** (không chạy) khi sổ có một lần xanh của **đúng lệnh đó** trên **đúng mã cây đó**, với `narrow` thì thêm đúng gốc diff đó. Lần `run` xanh không thay được lần `narrow` và ngược lại.
- **Không vào sổ:** check đỏ; check bị gạt vì môi trường; lượt trên đất còn thay đổi chưa commit (dòng không có `tree`); check được mang sang (nó không phải lần chạy mới, nên tuổi tính từ lần chạy thật).
- **Hết hạn:**
  - `config` là dấu vân tay của `commands.setup` và của `id`, `run`, `narrow` từng check (sha256 rút gọn, tính ở runner-core). Chủ nhân sửa một lệnh thì mọi dòng sổ cũ của lãnh thổ hết hiệu lực. Sửa `when`, `full_when`, `mode`, `timeout_minutes` không làm hết hạn: chúng đổi việc chọn check, không đổi nghĩa của một lần xanh.
  - Trần tuổi `CARRY_MAX_AGE_HOURS` = 12 (hằng số): tuần tra theo ngày trên một repo đứng yên vẫn chạy thật mỗi ngày, bắt việc môi trường trôi (Node, pnpm, test phụ thuộc ngày giờ).
  - `elvaria upgrade` **không** làm hết hạn: dòng sổ nói về cây của lãnh thổ, không về bản Elvaria đang ghim. Ở vương quốc này chuỗi thường gặp là merge, upgrade, rồi tuần tra `merged`; cho hết hạn theo upgrade là bỏ gần hết phần lợi của A (K3).
- **Quyết định là hàm thuần** trong domain (`carryOf`: sổ, mã cây, các check sắp chạy với lệnh và gốc, `config` hiện tại, giờ ⇒ check nào chạy, check nào mang sang và từ dòng nào). Nhiếp chính chỉ thực thi. Lõi không biết `pnpm`, không biết `scripts/check-stamp.mjs`.

### 2.2 Lượt nào ghi sổ, lượt nào đọc sổ

| Lượt | Ghi sổ | Đọc sổ |
|---|---|---|
| Sau phiên | có | không (với mục 2.5, chính lượt này chạy trên cây đã ghép) |
| Hàng đợi, sau khi ghép | có | có: giao lại sau một lần đỏ trên cùng commit ghép chỉ chạy các check từng đỏ ((546), D) |
| Khách | có (cây của commit ghép thử) | có: xếp lại cùng đầu nhánh, cùng nhánh gốc thì chỉ chạy check từng đỏ |
| Tuần tra `merged`, `schedule`, `base_moved`, `queue` | có | có (A, B; phép thử nhánh gốc của PS-09d trả lời ngay khi cây đã có sổ xanh) |
| Tuần tra `owner` (`territory patrol --now`) | có | không: chủ nhân gọi là chạy đủ, đây cũng là cách chạy lại khi nghi sổ |
| Phép dò | không | không |
| Tàu của CM-08 | có | có (mục 2.7) |

- **Tuần tra mang hết** mọi check và lãnh thổ không có `patrol.scans`: không dựng đất, không chạy `commands.setup`, vẫn ghi một dòng `patrol.ran` (`setup: null`, mỗi check `pass: true`, `duration_ms: 0`, `carried_from`) và `territory.health`. Mọi chỗ đọc `patrol.ran` chạy như cũ: sức khỏe nhánh gốc, đầu xanh của phép dò (`greenHeadOf`), `mergedPatrolOf` (đầu đã tuần tra), cầu dao ủy quyền. Mang một phần thì đất được dựng và chỉ các check còn lại chạy (`tryTerritory` đã nhận tập con `checks` cho phép dò).
- **Hàng đợi đỏ thì chạy lại check đỏ một lần** trên cùng cây, trong cùng lượt, trước khi hỏi nhánh gốc (PS-09d) và bước 4 (CM-06). Xanh ở lần hai ⇒ `check.attributed` nguồn `queue`, nguyên nhân `flaky` (hai giá trị đã có trong schema), lần giao đi tiếp. Đây là bước 2 của phép dò tuần tra đem về hàng đợi, và là cách chung để tách "hết giờ do tải" khỏi đỏ thật mà không cần biết bộ test của lãnh thổ. Ngày 25/11 nó tránh được quest Hợp nhất sqcack. Lượt sau phiên **không** chạy lại: ở đó đỏ thường là đỏ thật của người làm. Làn khách không tự chạy lại: phiên của người xếp lại, sổ lo phần đã xanh.
- **Sổ đo** (CM-09a) không tính check mang sang vào trung vị và p90 thời gian, và đếm riêng số check mang sang; không thì một lượt 0 giây làm lệch số.

### 2.3 Dấu kiểm cho hook pre-push (phần sản phẩm)

- **Vấn đề:** `git push` nhánh `quest/<id>` chạy hook pre-push của lãnh thổ như khi chủ nhân push (ADR 0023; `--no-verify` bị cấm). Hook của Elvaria thấy đất của quest không có dấu nên chạy `check:fast`, tức thêm một lần `test` cả repo cho commit vừa qua lượt kiểm của Nhiếp chính.
- **Đường đi của dấu:** biến môi trường tường minh trên chính lệnh push. Nhiếp chính đặt `ELVARIA_CHECKED_HEAD=<sha>` trong env của `git push` khi commit sắp push đã qua một lượt kiểm xanh của nó trên đúng commit đó, lượt ấy có ít nhất một check và không check nào bị gạt vì môi trường: lượt hàng đợi vừa xong, hay lượt sau phiên khi nhánh đã giữ nhánh gốc. Hook vẫn chạy; **hook của lãnh thổ tự quyết** có bỏ phần kiểm của nó cho commit đó không. Lõi không biết hook làm gì, lãnh thổ không có hook thì biến không ai đọc. Cùng kiểu với `ELVARIA_CHECK_BASE` của CM-01: một biến có tài liệu, không ghép vào lệnh.
- **Vì sao không hai đường kia:**
  - File trong git dir: sống lâu hơn lần push, phải dọn, phải chống dấu cũ; biến môi trường chỉ có nghĩa trong đúng tiến trình push đó.
  - Trường lãnh thổ "lệnh chạy sau lượt kiểm xanh": thêm một trường schema, một lần spawn, một kiểu lỗi mới, mà hook vẫn không biết ai đóng dấu.
- `delivery.pushed` thêm `push_ms` (thời gian lệnh `git push`, gồm cả hook) để sổ đo thấy được chi phí của hook mà không phải đọc log ((535): nhận ra sự cố chỉ từ sổ event).

### 2.4 Phần của repo Elvaria: `check-stamp`, dấu hẹp ((555))

Ba thay đổi này nằm ở `scripts/`, `.husky/`, `.claude/hooks/` của repo, không phải sản phẩm:

1. **Nhận lời của Nhiếp chính.** `check-stamp.mjs verify` bỏ `check:fast` khi `ELVARIA_CHECKED_HEAD` bằng mọi sha được push **và** mọi ref đích là `refs/heads/quest/*` hay `refs/heads/train/*` (nhánh chỉ Nhiếp chính push). Phiên của người push `feat/…`, `fix/…`, `docs/…`, nên biến này không mở cửa nào cho họ.
2. **Dấu hẹp.** `pnpm check:changed` chạy mặc định (không `--only`, không `--dry-run`, không `--base` khác, không `ELVARIA_CHECK_BASE`), xanh, trên cây sạch lúc bắt đầu và lúc xong, cùng HEAD, không đường dẫn nào "không luật nào phủ" thì ghi dấu `changed <head>` vào cùng file dấu. `verify` nhận dấu hẹp khi không ref đích nào là `refs/heads/main`. Hook không đọc vương quốc và không cần file đánh dấu chế độ trong repo: push một nhánh không phải là merge, cổng là bên merge (lượt thử của Nhiếp chính ở `pr_merge`; ở chế độ khác CLAUDE.md bước 5 vẫn đòi `pnpm check` đủ trước khi merge tay). Dấu đủ của `pnpm check` giữ nguyên nghĩa.
3. **Chặn đường vòng.** `guard-bash` chặn lệnh tự đặt `ELVARIA_CHECKED_HEAD`, như đã chặn `--no-verify` và `HUSKY=0`.

Hệ quả cho phiên task: một lần `pnpm check:changed` sau `git merge origin/main` rồi push, không còn 8–10 phút `check:fast`. Lời CLAUDE.md bước 5 không đổi.

### 2.5 Ghép nhánh gốc trước lượt kiểm sau phiên (C; ADR 0035)

- **Nay:** phán quyết đạt ⇒ dấu vua ⇒ hàng đợi ⇒ ghép nhánh gốc ⇒ chạy lại check ⇒ push (ADR 0023). Lượt sau phiên kiểm một cây sẽ không bao giờ vào `main`; cây thật chỉ được kiểm sau khi người chấm đã xong. Quest ghép của đội đã làm ngược lại từ PS-08e (`mergePartsBeforeChecks`: ghép nhánh gốc rồi mới kiểm).
- **Đề xuất:** với quest mà hàng đợi sẽ cập nhật (K4 của kế hoạch hàng đợi: lãnh thổ `pr` hay `pr_merge`, quest `forgeDue` nhận), khi phiên nộp bài và lãnh thổ không đỏ, Nhiếp chính ghép nhánh gốc vào nhánh quest **trước** lượt kiểm sau phiên, bằng đúng phép cập nhật của hàng đợi (không rebase, luật `shared_paths`, `commands.setup` lại khi cần, `commands.generate` với commit riêng, `PlotRecord.base` dời theo). Lượt kiểm theo chế độ chạy trên cây đã ghép; người chấm đọc lượt đó và nhánh đó (diff so với gốc mới vẫn chỉ là phần của quest).
- **Xanh** (14 trên 15 lượt theo số đo 22/11): dòng `plot.merged`, người chấm vào việc. Tới hàng đợi mà nhánh gốc không đi thì `update.state` là `current`: không lượt kiểm nào nữa. Nhánh gốc đã đi trong lúc chấm thì hàng đợi ghép phần mới và kiểm lại như nay.
- **Không ghép sớm**, lượt sau phiên chạy như nay: conflict mà luật không giải được hay git từ chối (hàng đợi vẫn là nơi gặp conflict, quest Hợp nhất của PS-09b); lãnh thổ đang đỏ; phần và hợp đồng của đội; lãnh thổ `manual`.
- **Đỏ sau khi ghép sớm** không được tính cho người làm khi chưa biết lỗi của ai (ADR 0032, 0033: lỗi do ghép không trừ ai). Hợp đồng: **nhánh quest chỉ giữ commit ghép khi lượt kiểm trên nó xanh**. Đỏ thì Nhiếp chính gỡ phép ghép (commit của chính nó, chưa push), nhánh về đầu lúc nộp, rồi chạy lại các check đỏ ở đó:
  - còn đỏ ⇒ lỗi của chính thay đổi: trượt như nay, phán quyết máy nêu các check đó;
  - xanh cả ⇒ lỗi do ghép: chạy nốt các check còn lại trên đầu lúc nộp và đi tiếp như nay (người chấm, rồi hàng đợi gặp lại phép ghép và xử lý theo PS-09b, PS-09d, CM-06).
  - Dòng `check.end` của lượt bị gỡ mang `taken_back: true` để sổ đo và người chấm không đọc nó.
- **Giá:** lượt đỏ tốn thêm phần chạy lại các check đỏ (ngày 25/11: hai lượt đỏ, ước vài phút); đổi lại 44 phút lượt hàng đợi và cả chuỗi quest Hợp nhất sqcack. Người làm bị trả về tiếp tục trên nhánh như lúc nộp, không mang phép ghép đỏ.
- **Dừng giữa chừng:** `update_pending` của đất đã có. Nhiếp chính kế thấy nhánh gốc đã vào mà còn treo thì chạy tiếp từ `commands.generate` và lượt kiểm, như hàng đợi.

### 2.6 Luật "phần khác nằm ngoài `when`" (chờ được, K7)

- Mở rộng luật cùng cây: một lần xanh của check X trên cây T1 mang sang được cây T2 khi **mọi đường dẫn khác nhau giữa T1 và T2** không khớp `when` của X, không khớp `full_when`, và đều có ít nhất một check trông. Với dòng `narrow`, phần khác giữa hai gốc diff cũng phải nằm ngoài `when` của X. Cùng cây là trường hợp "không có phần khác".
- Nó đúng **theo lời khai của lãnh thổ**, như `selectChecks` vốn tin `when` khi chọn check cho một quest: một quest chỉ sửa `docs/**` nay đã không chạy `test`. Ngày 25/11 luật này bỏ được bốn lượt tuần tra sau merge chỉ có tài liệu (2 693 s) và lượt hàng đợi của x6t14e (khoảng 1 000 s, khi `main` đi vì một PR tài liệu trong lúc chấm).
- **Đánh đổi:** tuần tra `merged` thôi là lưới độc lập với `when`. Lời khai `when` thiếu (một test đọc file ngoài `when` của nó) thì lỗi chỉ lộ ở tuần tra `schedule`, chậm tối đa một ngày, và phép dò phải đi dải dài hơn. Vì thế luật này chỉ cho tuần tra `merged` và lượt hàng đợi ghép lại; `schedule` và `owner` không dùng; mở sau khi luật cùng cây đã chạy 20 merge mà không có lỗi lọt.
- Dòng mang sang vẫn không vào sổ, nên chuỗi merge tài liệu không nối dài tuổi của một lần chạy thật: quá 12 giờ là chạy lại.

### 2.7 CM-08 và CM-06 dùng lại gì

- **CM-08 (tàu):** `train.ran` mang `tree`, `config` và là một nguồn của sổ kiểm; dòng "tuần tra bỏ qua khi cây của đầu nhánh gốc đúng là cây tàu vừa kiểm xanh" trong bảng của check-modes không cần code riêng, luật cùng cây cho nó. Lệnh push nhánh `train/<lãnh thổ>/<id>` dùng cùng hàm đặt `ELVARIA_CHECKED_HEAD`; hook của Elvaria đã nhận `refs/heads/train/*` từ RC-01. Tàu đi lại sau một lần đỏ chập chờn trên cùng cây chỉ chạy check từng đỏ qua `carryOf`. Mục khách ở `deferred` ("tàu một toa", chạy đủ bộ) ghi sổ đủ bộ nên tuần tra sau nó mang hết. Với mục 2.5, nhánh quest lên tàu đã giữ nhánh gốc, phép ghép của tàu ít conflict hơn. Luật riêng của CM-08 "tàu kế chỉ chạy lại các check từng đỏ" (khác cây) giữ nguyên, không đi qua sổ.
- **CM-06:** `lateFailAt` có luật riêng "check đã xanh sau phiên với đúng lệnh thì là `combination`" (`ownRunChecksOf`). Chuyển nó sang đọc sổ là việc dọn, không nằm trong kế hoạch này (K10). Bước chạy lại check đỏ của mục 2.2 đứng **trước** nó.
- **Thứ tự:** các task dưới đây chạm `packages/steward/src/forge/**` và `review/**`, cùng vùng với CM-08; (550) đã xếp (546) trước CM-08.

## 3. Hợp đồng dữ liệu đổi

Mọi đổi là thêm trường tùy chọn: `version` của file giữ nguyên, `v` của event giữ 2, **không migration**; mỗi schema thêm ví dụ ở `packages/domain/examples/**`, dòng mẫu ở `packages/eventlog/src/migrations/v1.jsonl`, thuật ngữ mới vào glossary.

| Chỗ | Đổi | Task |
|---|---|---|
| `check.end` | `tree` (mã cây của commit được kiểm; vắng khi đất còn thay đổi chưa commit hay không có git), `base` (chỉ với `mode: narrow`: commit trong `ELVARIA_CHECK_BASE`), `config` (dấu vân tay lệnh); `checks[].carried_from` (id của dòng event giữ lần chạy thật; có thì `pass: true`, `duration_ms: 0`) | RC-03 |
| `check.end` | `taken_back: true` (lượt trên phép ghép sớm đã bị gỡ; sổ đo và người chấm bỏ qua) | RC-05 |
| `patrol.ran` | `tree`, `config`; `checks[].carried_from`; `log_path` của check thành tùy chọn, vắng khi và chỉ khi có `carried_from` | RC-03 |
| `delivery.pushed` | `push_ms` | RC-02 |
| `check.attributed` | không đổi schema: nguồn `queue` nay có thể mang nguyên nhân `flaky` kèm lần chạy lại trong `runs` | RC-04 |
| Lệnh `git push` của Nhiếp chính | biến môi trường `ELVARIA_CHECKED_HEAD` (sha đã qua lượt kiểm); tài liệu ở hướng dẫn lãnh thổ và ADR 0023 | RC-02 |
| `train.ran` (CM-08, chưa có) | thêm `tree`, `config` khi CM-08 định nghĩa nó | CM-08 |
| File dấu của repo Elvaria (`elvaria-check-ok` trong git dir, không phải hợp đồng sản phẩm) | thêm dạng `changed <head>` | RC-01 |
| Glossary | `check_ledger` (Sổ kiểm / Check ledger), `carried` (Mang sang / Carried) | RC-03 |

`territory.json` không đổi: không trường mới, không công tắc (K11). Sổ kiểm suy từ event, không file nào mới.

## 4. Ca biên

- **Đất bẩn lúc bắt đầu kiểm** (file chưa commit, không tính file bị ignore): dòng không có `tree`, không vào sổ.
- **Check bị gạt vì môi trường:** không vào sổ, và lần push sau lượt đó không mang `ELVARIA_CHECKED_HEAD`.
- **Chủ nhân sửa lệnh check giữa hai lượt:** `config` khác, không mang sang.
- **Merge tay ngoài Elvaria, `merge_method: squash`, forge ghép khác git ở máy, `main` đi giữa lượt thử khách và lúc forge merge:** đều quy về so mã cây; khác thì tuần tra chạy.
- **Bí mật:** lượt của quest chạy với bí mật của quest, tuần tra với bí mật của lãnh thổ. Một check chỉ xanh nhờ bí mật của quest được mang sang tuần tra sẽ che việc tuần tra thiếu bí mật đó; lần tuần tra chạy thật sau 12 giờ lộ ra. Chấp nhận.
- **Nhiếp chính khởi động lại:** sổ dựng lại từ log (các dòng trong 12 giờ gần nhất là đủ).
- **Phép dò và đầu xanh:** dòng `patrol.ran` mang sang vẫn là một đầu xanh; phép dò không chạy trên sổ và không ghi sổ.
- **Quest con tách từ nhánh quest cha** (`baseChainOf`): phép ghép sớm chỉ thêm commit ghép vào nhánh cha; nhánh con nhận qua merge như nay.
- **Người chấm ở đất nháp** (Thả quái thử thành): đất nháp cắt từ đầu nhánh quest, nay là đầu đã ghép; lượt của nó vẫn chạy như `full`.
- **Trần diff của ủy quyền dấu, `touched`, phạm vi file:** đều đo so với `PlotRecord.base`, đã dời theo phép ghép, nên chỉ thấy phần của quest. Task RC-05 kiểm lại từng chỗ đọc diff của người chấm (prompt, `narrow_checks`, thư giao hàng).
- **Lãnh thổ `manual`, lãnh thổ không git:** không ghép sớm, không sổ kiểm (không có cây).
- **Bản ghim cũ đọc log mới** (lùi bản): như mọi trường thêm từ CM-01, schema chặt của bản cũ có thể không đọc được dòng có trường mới; ghi vào ghi chú nâng cấp.
- **Windows và macOS:** `rev-parse <sha>^{tree}` chạy `shell: false` nên `^` không bị shell ăn; biến môi trường đi từ Nhiếp chính qua git tới hook (`sh` của husky rồi node) như các biến `DELIVERY_GIT_SWITCHES`; gỡ phép ghép là thao tác git trong đất có dấu cách trong đường dẫn. RC-02 (hook, push) và RC-05 (đất, git) chạm vùng nhạy hệ điều hành: nêu trong báo cáo để chủ nhân quyết chạy CI.

## 5. Đo thành công

Đọc từ sổ event, cùng cách đếm của mục 1 (RC-07 đưa vào `elvaria metrics`):

- **Phút máy kiểm cho mỗi thay đổi vào `main`** (mọi lượt cộng thời gian push): từ khoảng 33 phút xuống dưới 15 phút sau RC-05. Ước từ số ngày 25/11: RC-01 + RC-02 bỏ 70–80 phút, RC-04 bỏ 83 phút (A, B), RC-05 bỏ 44 phút cộng chuỗi quest Hợp nhất (27 phút và một phiên model), RC-06 bỏ thêm khoảng 62 phút.
- **Số lần một check chạy cho một thay đổi:** quest chạm `full_when` từ 4 lần `test` đủ bộ xuống 1 (2 khi `main` đi vì code trong lúc chấm).
- **`push_ms`:** từ 8–10 phút xuống dưới 1 phút; không còn `push_refused` vì hook hết giờ.
- **Từ lúc lượt sau phiên xong tới `delivery.merged`** khi nhánh gốc không đi: nay khoảng 20 phút cộng thời gian chấm (zatpdc: 13:25 tới 13:46), đích là thời gian chấm cộng dưới 3 phút.
- **An toàn:** số lần một check đỏ ở tuần tra chạy thật mà lần tuần tra trước đó trên cùng cây đã mang sang chính check ấy. Đích là 0; một lần là một mục bản tấu và chủ nhân xét lại K3, K7.
- Số check mang sang mỗi ngày và số quest Hợp nhất mở vì `combination` (kỳ vọng giảm nhờ bước chạy lại).

## 6. Chia task

Cỡ theo một context. "Đọc trước" là vùng "đọc trước khi sửa" của CLAUDE.md.

| Id | Việc | Cỡ | Cần trước | File chạm chính | Đọc trước, model gợi ý | Xong khi |
|---|---|---|---|---|---|---|
| RC-01 | Repo: `verify` nhận `ELVARIA_CHECKED_HEAD` cho ref `quest/*`, `train/*`; dấu hẹp của `check:changed` và luật nhận nó; `guard-bash` chặn tự đặt biến; sổ tay repo và README của `scripts/` | S | — | `scripts/check-stamp.mjs`, `scripts/check-changed.mjs` và spec, `.husky/pre-push`, `.claude/hooks/guard-bash.mjs`, `docs/guides/repo-handbook.md` | — (đường dẫn được bảo vệ: Phiên, hay Quest có dấu); Opus high | spec: sáu ca của `verify` (lời Nhiếp chính đúng ref, sai ref, sha lệch; dấu hẹp tới nhánh thường, tới `main`; cây bẩn); `check:changed` chỉ ghi dấu khi chạy mặc định trên cây sạch và mọi đường dẫn có luật |
| RC-02 | Sản phẩm: `git push` của Nhiếp chính mang `ELVARIA_CHECKED_HEAD` khi commit đã qua lượt kiểm xanh không gạt check nào; `push_ms` trên `delivery.pushed`; đoạn Amended của ADR 0023; hướng dẫn lãnh thổ nói hook đọc biến thế nào | S | — (có lợi trên `elvaria` khi RC-01 đã ở `main`) | `p/steward/src/forge/{push,git,update}.ts`, schema `delivery-data`, `docs/guides/elvaria-territory.md` | schema event; Opus high | git thật có hook pre-push ghi env ra file: lượt xanh ⇒ hook thấy đúng sha; lượt gạt vì môi trường ⇒ không có biến; nhánh `current` ⇒ có biến |
| RC-03 | Sổ kiểm, phần thuần: trường `tree`, `base`, `config`, `carried_from` trên `check.end`, `patrol.ran`; `checkLedgerOf`, `carryOf` trong domain; mã cây và dấu vân tay lệnh ở runner-core; bộ chạy check nhận danh sách mang sang; glossary | M | — | `p/domain/src/schema/event/{check-data,patrol-data}.ts`, thư mục mới `p/domain/src/check-ledger/`, `p/runner-core/src/{checks,plot}/**` | schema event (Opus xhigh) | domain 100 %: cùng cây cùng lệnh ⇒ mang; khác cây, khác lệnh, khác gốc `narrow`, quá 12 giờ, `config` khác, check đỏ hay bị gạt ⇒ chạy; dòng mang sang không vào sổ; log cũ không có trường mới vẫn đọc được |
| RC-04 | Nối dây luật cùng cây: tuần tra (A, B, phép thử `queue`), hàng đợi và làn khách (D), tuần tra mang hết không dựng đất; hàng đợi đỏ chạy lại check đỏ một lần ⇒ `flaky`; sổ đo bỏ check mang sang khỏi thời gian | M | RC-03 | `p/steward/src/{patrol,forge,review}/**`, thư mục mới `p/steward/src/check-ledger/`, `p/domain/src/metrics/check-mode/**` | — ; Opus xhigh (cổng của hàng đợi) | git thật, forge giả: quest kiểm đủ bộ rồi merge ⇒ tuần tra `merged` ghi `patrol.ran` mang hết, không dựng đất; lượt hẹp trước đó ⇒ tuần tra chạy các check có `narrow`; `owner` chạy đủ; giao lại sau đỏ chỉ chạy check đỏ; đỏ rồi xanh ⇒ `flaky` và giao tiếp; khởi động lại giữ sổ |
| RC-05 | Ghép nhánh gốc trước lượt kiểm sau phiên (mục 2.5): ghép sớm, gỡ khi đỏ, `taken_back`, dừng giữa chừng; ADR 0035 thành accepted, đoạn Amended vào ADR 0023, 0032 | M | RC-04 (cùng `review/start-checks.ts`) | `p/steward/src/{review,party}/**`, `p/runner-core/src/plot/**` (gỡ phép ghép), schema `check-data` | schema event; vùng nhạy hệ điều hành (đất, git); Opus xhigh | git thật: nhánh gốc đã đi, ghép sạch, xanh ⇒ người chấm đọc lượt trên cây đã ghép, hàng đợi không kiểm lại; conflict ⇒ như nay; đỏ do chính quest ⇒ nhánh như lúc nộp, trượt; đỏ do ghép ⇒ nhánh như lúc nộp, đi tiếp như nay; dừng giữa chừng rồi chạy lại không ghép hai lần |
| RC-06 | Luật "phần khác nằm ngoài `when`" cho tuần tra `merged` và lượt hàng đợi ghép lại (mục 2.6); chỉ mở sau khi RC-04 chạy 20 merge và số "mang sang rồi đỏ" là 0 (K7) | S–M | RC-04, số đo 20 merge; phần hàng đợi cần RC-05 | `p/domain/src/check-ledger/**`, `p/runner-core/src/plot/**` (phần khác giữa hai cây), `p/steward/src/{patrol,forge}/**` | — ; Opus high | merge chỉ có tài liệu sau một lượt đủ bộ ⇒ tuần tra `merged` chỉ chạy check có `when` khớp; chạm `full_when` ⇒ chạy đủ; `schedule` không dùng luật này |
| RC-07 | Sổ đo của mục 5: phút kiểm mỗi thay đổi (gồm `push_ms`), số lần mỗi check chạy cho một thay đổi, số check mang sang, số "mang sang rồi đỏ"; một dòng trong bản tấu khi số cuối khác 0 | S | RC-04 (RC-02 cho `push_ms`) | `p/domain/src/metrics/**`, `a/cli/src/metrics/**` | — ; Quest, Sonnet high | báo cáo in các số trên từ một sổ event mẫu có lượt mang sang, lượt chạy thật và một lần "mang sang rồi đỏ" |

- **Thứ tự đề xuất** (phiên điều phối quyết): RC-01, RC-02, RC-03 không cần nhau và mở được cùng lúc (RC-02 và RC-03 cùng chạm `schema/event/**`: nhánh merge sau sinh lại `docs/schemas`, `docs/events.md`). Rồi RC-04 → RC-05. RC-07 sau RC-04. RC-06 chờ số đo của K7.
- **Việc vận hành, không phải task:** sau khi RC-01 vào `main` và bản có RC-02 được ghim thì không phải sửa gì ở vương quốc; mẫu prompt của điều phối giữ "một lần `check:changed` sau merge" ((555)).
- **Chồng nhau:** `packages/steward/src/forge/**` (RC-02, RC-04, RC-06, CM-08: không mở hai task trong nhóm cùng lúc), `packages/domain/src/schema/**` và `docs/schemas/**` (RC-02, RC-03, RC-05, HL-04), `packages/i18n/src/glossary.json` (RC-03).
- **Ngoài phạm vi, ghi lại cho đợt rà bài học (548):** 8 trên 12 lượt sau phiên ngày 25/11 chạy như `full`, phần lớn vì quest thêm devDependency nên chạm `pnpm-lock.yaml` trong `full_when`; thu hẹp `full_when` hay tăng tốc bộ `test` là đòn bẩy còn lại sau kế hoạch này.

## 7. Quyết định cần chủ nhân

**Chủ nhân đã chốt ngày 2026-11-25 ("chốt hết"): K1–K11 đều theo khuyến nghị** ([§11](../implementation-plan/11-2026-11-25.md), dòng "Chủ nhân chốt K1–K11 của kế hoạch bỏ các lượt kiểm lặp"). Hai danh sách dưới đây giữ làm hồ sơ: mỗi mục là điều đã chốt.

**Phải chốt trước khi mở task:**

- **K1** (RC-02) Dấu kiểm tới hook bằng biến môi trường `ELVARIA_CHECKED_HEAD` trên lệnh `git push` của Nhiếp chính; hook vẫn chạy và tự quyết. Khuyến nghị: nhận. Phương án khác: file trong git dir của đất; trường lãnh thổ chứa lệnh chạy sau lượt kiểm xanh.
- **K2** (RC-01) Hook của repo Elvaria nhận dấu hẹp của `check:changed` khi không ref đích nào là `main`, không đọc vương quốc; lời của Nhiếp chính chỉ được nhận cho `quest/*`, `train/*`. Khuyến nghị: nhận. Phương án khác: một file trong repo ghi "lãnh thổ này ở `pr_merge`" (trùng với vương quốc, dễ lệch).
- **K3** (RC-03) "Cùng cây" là mã cây git; sổ kiểm suy từ event; hết hạn khi lệnh check hay `commands.setup` đổi và khi quá 12 giờ; `elvaria upgrade` không làm hết hạn. Khuyến nghị: nhận. Phương án khác: sổ chỉ trong bộ nhớ (mỗi lần khởi động lại, kể cả upgrade, kiểm lại một lượt; đơn giản hơn nhưng mất phần lớn lợi của A ở vương quốc này).
- **K4** (RC-04) Tuần tra `merged`, `schedule`, `base_moved`, `queue` mang sang theo luật cùng cây; tuần tra `owner` luôn chạy đủ; tuần tra mang hết vẫn ghi `patrol.ran`. Khuyến nghị: nhận.
- **K5** (RC-04) Hàng đợi đỏ thì chạy lại các check đỏ một lần trên cùng cây; xanh ⇒ `flaky`, giao tiếp, không mở quest Hợp nhất. Khuyến nghị: nhận.
- **K6** (RC-05, ADR 0035) Ghép nhánh gốc trước lượt kiểm sau phiên, với hợp đồng "nhánh chỉ giữ commit ghép khi lượt trên nó xanh" (mục 2.5). Đây là thay cho ý C của (556), vì hai lượt không chạy trên cùng cây. Khuyến nghị: nhận. Phương án khác: (a) giữ thứ tự cũ, chấp nhận mỗi quest một lượt hàng đợi; (b) ghép sớm và đỏ thì tính luôn cho người làm (đơn giản hơn, nhưng trừ điểm cả khi lỗi do ghép).

**Chờ được:**

- **K7** (RC-06) Luật "phần khác nằm ngoài `when`". Khuyến nghị: nhận hướng, mở sau khi RC-04 chạy 20 merge và số "mang sang rồi đỏ" là 0.
- **K8** Con số: trần tuổi 12 giờ; hàng đợi chạy lại một lần. Khuyến nghị: nhận làm mặc định, chỉnh theo số đo của RC-07.
- **K9** Conflict lúc ghép sớm: trả cho người làm giải (rẻ hơn một quest Hợp nhất) thay vì để hàng đợi mở quest Hợp nhất. Khuyến nghị: chưa; đo số quest Hợp nhất vì conflict sau RC-05 rồi xét.
- **K10** Chuyển luật riêng của `lateFailAt` (CM-06) sang đọc sổ kiểm. Khuyến nghị: để tới khi chạm vùng đó (CM-08).
- **K11** Công tắc theo lãnh thổ cho việc mang sang hay ghép sớm. Khuyến nghị: không; đường lùi là `territory patrol --now` (chạy đủ) và ghim lại bản cũ.
