# Y sư ở trạm quân y: mỗi lượt một lần chữa — kế hoạch chi tiết

Ngày: 2026-11-25 · Trạng thái: **chủ nhân đã chốt K1–K12 ngày 2026-11-25** (mục 9) · Nguồn: ý (513) và (515) chủ nhân đã "oke" ngày 2026-11-25 · ADR nháp: [0034](../adr/0034-one-heal-per-run.md) · Đo trên `main` `2ee1e2b4`, vương quốc `my-kingdom` (ghim `459a99a7`).

Các task `HL-…` ở mục 8 đã vào bảng §8 của kế hoạch triển khai, chưa mở; phiên điều phối quyết lúc mở.

## 1. Bối cảnh

Hôm nay một quest vào trạm quân y thì dừng hẳn và chuông rung. Chủ nhân (hay phiên điều phối) đọc `quest show`, mở log, sửa tay trong đất riêng rồi `quest submit`, hoặc `quest retry --to`. Hai ý đã được chủ nhân nhận:

- **(513)** Commit bị hook từ chối vì lỗi lint (`breaker:commit_errors`) tự trở về **chính người làm** kèm log pre-commit. Ý này đổi quyết định ở [phase-2-plan.md](phase-2-plan.md) dòng 64 và [ADR 0030](../adr/0030-cut-session-with-progress-goes-on.md) (trip `commit` luôn vào trạm quân y).
- **(515)** Nghề mới **Y sư** (`healer`): Nhiếp chính mở một phiên ngắn, model rẻ, trần nhỏ, trong đất của quest; nó chỉ sửa đúng chỗ log chỉ ra rồi nộp, mỗi lượt tối đa một lần. Y sư tính là người từng làm quest (ADR 0008).

## 2. Số đo

Đếm từ sổ event của `my-kingdom`, 2026-11-07 tới 2026-11-25 08:58: **42 dòng `quest.infirmary`**.

| Nhóm lý do | Số dòng | Chủ nhân chờ rồi làm gì | Ghi chú |
|---|---|---|---|
| trần token (`breaker:tokens`, dòng v1 `tokens`) | 26 | sửa trần rồi `retry` | dòng cuối ngày 2026-11-15; từ khi vương quốc có (F) thì lần cắt có tiến triển tự đi tiếp |
| hết lượt thử (`quest:max_attempts`) | 8 | chờ 0,6 tới 66 phút, trung vị 18; 4 lần sửa quest rồi mở lại, 3 lần mở lại nguyên trạng, 1 lần lưu trữ | cần người đọc ba phán quyết và quyết |
| commit bị hook từ chối (trip `commit`) | 5 | chờ 2 tới 26 phút, trung vị 5; ba ca gần nhất sửa tay rồi `quest submit` | xem bảng dưới |
| `time`, `turns`, `no_verdict` | 3 | mỗi loại một dòng | |

Đề bài của phiên ghi 7 dòng `breaker:commit_errors`; sổ của `my-kingdom` có 5 dòng trip `commit` (2 dòng v1 và 3 dòng `breaker:commit_errors`). Hai dòng còn lại không tìm thấy ở đây.

Từ 2026-11-16 (sau (F)) chỉ còn 6 dòng trong 10 ngày: 3 dòng hết lượt thử và 3 dòng commit bị từ chối. Hai nhóm này là phần việc còn lại của trạm quân y.

Năm ca commit bị từ chối:

| Ngày | Quest | Người làm | Lỗi | Sau đó |
|---|---|---|---|---|
| 11-12 | `gwrz5m` (C) | dorian, Codex | (dòng v1, không có log) | `retry` sau 26 phút, người khác làm lại: 107 016 token |
| 11-14 | `b5n3tj` (C) | dorian, Codex | (dòng v1) | sửa mô tả, `reassign` về dorian: phiên sau tốn 1 029 567 token |
| 11-24 | `hs4k2h` (D) | dorian, Codex | 1 lỗi `unbound-method`, log 28 dòng | sửa tay, `quest submit` sau 7 phút |
| 11-24 | `a1frec` (E) | dorian, Codex | 10 lỗi `no-unsafe-*` ở 5 file (kiểu không resolve), log 43 dòng | sửa tay, `quest submit` sau 2 phút |
| 11-25 | `rpp1c9` (D) | dorian, Codex | 10 lỗi `no-unsafe-*` ở 1 file, log 35 dòng | sửa 1 dòng, `quest submit` sau 5 phút |

Ba điều đọc được:

1. **Cả năm ca là của dorian (Codex), ở lượt đầu.** Người làm thuộc tộc Claude và Gemini chưa bị hook từ chối lần nào. Gốc mà phiên điều phối đã nêu cho ba ca gần nhất: người làm không lint được trong phiên, vì dependency mới chỉ được nối lúc Nhiếp chính commit. Vì sao chỉ Codex gặp thì phiên này chưa đo. Hai bản vá gốc vừa merge: `commands.setup_when` (#303, #304) và lệnh install cho hiệp sĩ (#305, ý (512)). Số ca có thể giảm; chưa có số đo sau hai bản vá.
2. **Log ngắn và chỉ đúng chỗ**: 28 tới 43 dòng, mỗi lỗi có file, dòng, tên luật. Ba ca gần nhất đều sửa xong trong vài dòng. Hook của lãnh thổ `elvaria` đã chạy `eslint --fix` và `prettier --write`, nên lỗi còn lại là lỗi máy không tự sửa được.
3. **Một phiên làm lại đủ trần thì đắt**: sau lần từ chối ở `b5n3tj`, phiên kế của chính người làm tốn 1 029 567 token (mô tả có được sửa trước đó, nên không tách được phần chữa). Phiên chữa phải có trần riêng.

Phiên đầu tiên của người làm sau một lần vào trạm quân y (token đếm như cầu dao đếm; có phiên chỉ nộp lại, có phiên làm tiếp việc dở). Mức thấp nhất là mốc cho giá một phiên chữa:

| Người làm | Model | Số phiên | Thấp nhất | Trung vị |
|---|---|---|---|---|
| thorn | Sonnet | 7 | 26 869 | 58 399 |
| brann | Opus | 6 | 68 094 | 117 098 |
| dorian | Codex (`gpt-6.1-sol`) | 6 | 66 848 | 140 728 |

## 3. Hai hướng đặt cạnh nhau

| | (513) người làm tự chữa | (515) Y sư chữa |
|---|---|---|
| Ai mở phiên | chính người làm, phiên mới, cùng lượt | một nhân vật nghề `healer` |
| Model | của người làm (Codex, Opus, Sonnet, Gemini) | của Y sư (đề xuất Sonnet) |
| Token mỗi lần chữa (ước từ bảng trên) | Sonnet 30–60 nghìn, Opus 70–120 nghìn, Codex 70–140 nghìn | 30–60 nghìn Sonnet |
| Cửa sổ Claude | không tốn khi người làm là Codex hay Gemini (cả 5 ca đã đo) | luôn tốn, kể cả cho quest của Codex |
| Chất lượng | phiên mới nên không nhớ gì hơn Y sư; có prompt nghề và kinh của mình; phiên đầu đã không lint được thì phiên chữa có thể cũng vậy: nó sửa theo log rồi để hook kiểm | có lệnh lint của hiệp sĩ để thử trong đất trước khi nộp (chưa đo); không có kinh của người làm |
| Rủi ro vòng lặp | có nếu không chặn: phiên đủ trần làm lại cả việc (`b5n3tj`) | thấp: trần nhỏ, phần được đổi đo bằng máy |
| Tách vai (ADR 0008) | không đổi | thêm một người làm: Y sư không chấm quest đó, và **họ model của Y sư tính vào phía người làm**. Quest của dorian (GPT) do Y sư Sonnet chữa thì người chấm ưu tiên chỉ còn họ Gemini (ilse), thay cho vesper hay maren |
| Lý do không chữa được | không giúp gì | viết được chẩn đoán cho chủ nhân (hết lượt thử, không tiến triển) |
| Công dựng | nhỏ: dùng lại đường "đi tiếp cùng lượt" của ADR 0030 | lớn hơn: nghề, trạng thái mới, phiên trong đất của người khác, đo phần đổi |

**Kết luận: kết hợp, thành một cơ chế có hai nhánh.** Hai hướng khác nhau ở chỗ *ai* mở phiên chữa; phần còn lại giống nhau: lý do nào chữa được, mỗi lượt một lần, trần nhỏ, hook của lãnh thổ là trọng tài, trượt lần hai thì vào trạm quân y. Nhánh người làm tự chữa dựng trước vì nó nhỏ, không đụng tách vai, và trên số đo hiện có nó nhận cả 5 ca mà không tốn cửa sổ Claude. Y sư là nhánh thứ hai của cùng cơ chế: rẻ hơn khi người làm chạy Opus, và là nhân vật duy nhất viết được chẩn đoán. (Bảng trên so một Y sư Sonnet duy nhất. Chủ nhân sau đó chốt mỗi tộc một Y sư, nên ca của Codex do Y sư tộc `codex` chữa: xem 4.3 và mục 9.)

## 4. Thiết kế

### 4.1 Mỗi lượt một lần chữa

Khi commit nộp của một phiên người làm bị hook từ chối (`submitWork` → `commitPlot` trả `refused`):

1. Domain quyết (`healCallOf`, hàm thuần): lý do thuộc nhóm chữa được (4.2), lượt `n` chưa dùng lần chữa, quest là quest phiên có người làm, `kingdom.heal.enabled` bật ⇒ **chữa**; ngược lại ⇒ trạm quân y như hôm nay.
2. Chữa: quest sang `returned`, **không chuông**, mục attempt của phiên vừa xong ghi `heal: "due"`. Phần việc vẫn nằm đã stage trong đất, `pre-commit.log` và `wip.patch` vẫn ở `.runs/<quest>-<n>/`.
3. Nhịp kế, `planTick` chọn người chữa (4.3) và Nhiếp chính mở **một phiên chữa**, cùng lượt `n`, không tăng `attempts`.
4. Phiên chữa xong, Nhiếp chính commit lại qua hook của lãnh thổ. Qua ⇒ quest sang `review` như mọi lần nộp (check máy, người chấm, vùng bảo vệ, dấu vua). Bị từ chối lần nữa ⇒ trạm quân y và chuông, kèm cả hai log.

Lần chữa tính theo lượt: `retry` và `reassign` mở lượt `n + 1`, lượt đó có lần chữa của nó. Mana vẫn chặn vòng lặp như với ADR 0030.

### 4.2 Lý do nào chữa được

| Mã lý do | Đợt đầu | Vì sao |
|---|---|---|
| `breaker:commit_errors`, `breaker:commit` | **chữa** | hook từ chối, có log; sửa trong phạm vi quest là đủ |
| `breaker:setup` | không | `commands.setup` hỏng: thường là lockfile hay mạng, việc của chủ nhân |
| `breaker:patch` | không | bản vá `elvaria.patch` nằm ngoài đất; chưa có ca nào để đo |
| `breaker:forbidden_paths` | không bao giờ | chủ nhân xem đất trước mọi phiên (P1-49) |
| `breaker:secrets_*`, `breaker:treasury_unreadable`, `breaker:no_session` | không bao giờ | không phiên nào mở được, hoặc chỉ chủ nhân sửa được kho bảo vật |
| `quest:max_attempts`, `breaker:no_progress` | không chữa; **chẩn đoán** ở đợt C (4.7) | cần người quyết: sửa đề bài, đổi người, chia việc |
| `judge:*`, `restart:*`, `script:*` | không | việc không dở; `retry` là đủ |

Danh sách chữa được là một hằng của domain (`HEALABLE_REASONS`), vì nó gắn với việc mã làm được (commit lại), không phải cấu hình. Đề bài của phiên ghi "lý do rủi ro chỉ viết chẩn đoán"; kế hoạch này đề xuất **không mở phiên nào** cho `secrets`, `forbidden_paths`, `no_session`: dòng lý do của máy đã nêu đủ tên secret, đường dẫn, lỗi spawn, một phiên model không thêm được gì (ADR 0017: máy làm được thì không gọi model).

### 4.3 Ai chữa

`selectHealer` (hàm thuần trong domain, `planTick` gọi) đọc đội hình:

1. Ứng viên là nhân vật nghề có `is_healer`, không bị đình chỉ, tộc đang bật, bể mana còn.
2. **Chỉ lấy Y sư có họ model đã nằm trong những người làm quest** (`attempt_log` và người làm hiện tại). Y sư như vậy không thêm họ mới vào phía người làm, nên người chấm ưu tiên vẫn như trước khi chữa.
3. Có ứng viên đang rảnh ⇒ Y sư đó chữa (cấp cao trước). Có ứng viên nhưng đang bận ⇒ chờ nó (một phiên chữa dài nhất 22,5 phút). Không có ứng viên ⇒ **người làm tự chữa**.

Vương quốc không triệu hồi Y sư nào thì luôn là nhánh người làm tự chữa: đội hình là công tắc của (515), không cần cờ riêng.

(HL-03: `selectHealer(quest, characters, policy)` ở `dispatch/select-healer.ts` trả `{ by: 'healer', character }`, `{ by: 'wait' }` hay `{ by: 'doer' }`. Luật 1 đi vào qua hai vị từ mà `planTick` truyền ở HL-04: `stands` (không bị đình chỉ, tộc bật và có runner, bể mana mở: `Roster.standsBy` cùng `manaOpen`) và `free` (`Roster.canStart`); giới hạn của tộc trên lãnh thổ (`max_rank`, vùng canh) chưa xét, HL-04 gộp vào `stands` nếu cần, như `mayClaim`. (HL-04, theo (557): `stands` là `Roster.mayClaim` cùng `Roster.manaOpen`, nên Y sư mà tộc không nhận được hạng hay vùng canh của quest trên lãnh thổ đó, hay bể mana đóng, không chữa nó và người làm tự chữa; `free` là `Roster.canStart`; Y sư rảnh mà lãnh thổ hết chỗ thì quest chờ. Luật trong `selectHealer` không đổi.) Luật 2 đọc họ của người làm từ `workedOn` và file nhân vật còn trong đội hình; họ không rõ, ở Y sư hay ở người làm, không bao giờ trùng. Thêm hai luật kế hoạch chưa nêu: Y sư không phải người làm hiện tại (người làm tự chữa đi đường `redispatch`), và người mà `partyBarsOf` chặn khỏi quest (từng chấm quest đó hay quest cùng đội, phía bên kia của trận thử mù) không bao giờ chữa nó. Xếp hạng: cấp cao trước, rồi rảnh lâu nhất, rồi id.)

Một Y sư Sonnet duy nhất chỉ chữa được quest của người làm họ Claude (thorn, brann, brom, morwen, lyra, orrin), và không nhận ca nào trong 5 ca đã đo (đều của dorian, họ GPT). **Chủ nhân chốt (K7): mỗi tộc một Y sư** (`claude`, `codex`, `gemini`), mỗi Y sư chạy model thuộc họ của tộc mình, để quest của họ nào cũng có Y sư cùng họ. Luật 2 giữ nguyên và đo theo họ model, không theo tên tộc: một Y sư tộc `gemini` chạy model Claude thì tính là họ Claude. Nhánh người làm tự chữa còn lại cho lúc Y sư cùng họ hết mana, bị đình chỉ hay tộc bị tắt, và cho vương quốc không có Y sư.

### 4.4 Phiên chữa

Chung cho cả hai nhánh:

- **Trần riêng**, không lấy trần của quest: `kingdom.heal.tokens` (mặc định 150 000) và `kingdom.heal.minutes` (15) là mức 100 %; (F) nhắc ở 85 % và cắt ở 150 % (225 000 token, 22,5 phút). Trần lượt theo tộc như mọi phiên.
- Phiên chữa bị trần cắt thì **không có phiên tiếp**: quest vào trạm quân y. Phiên tự chữa của người làm mà hỏng hay hết mana thì đi đường sẵn có của `working` (hỏng: một lượt thử mới; hết mana: ngủ rồi dậy làm tiếp). Phiên của Y sư hỏng thì quest vào trạm quân y; Y sư hết mana thì lần chữa không tính, nhịp sau chọn lại.
- Prompt nói rõ: việc đã làm xong và đang nằm đã stage; chỉ sửa điều log nêu; không làm lại việc; không tắt luật lint.

Người làm tự chữa: phiên mới của chính nó trong trạng thái `working` (đường `returned` → `redispatch` của ADR 0030), prompt nghề như thường, phần "đi tiếp" mang các dòng lỗi của `pre-commit.log` (đã che secret, cắt ở 4 000 ký tự; người làm không đọc được `.runs/`). Không giới hạn phần được đổi: đó là việc của chính nó, người chấm đọc cả diff. (HL-02: phần "đi tiếp" mang **đầu** log, mọi dòng không trống từ dòng đầu tới 4 000 ký tự, không lọc riêng dòng có chữ `error`, vì lint in đường dẫn file trên một dòng và lỗi trên các dòng sau; che bằng secret của phiên và mẫu của ADR 0013 trước khi cắt, như đuôi log check. Khối là `refused-commit.md` viết lại cho cả hai ca, chờ phản biện đề bài và chờ chữa, kèm lời dặn không làm lại việc, không tắt luật lint, không bỏ qua hook; `revive.md` nêu thêm ca này. Chỉ phiên ngay sau mục `due` đọc log; phiên dậy sau mana trong lượt chữa thì không. Commit của lượt đã có `due` để lại log, `wip.patch` và `set-aside/` ở `.runs/<quest>-<n>/heal/`, nên log lần hai nằm cạnh log lần đầu mà không ghi đè; lý do trạm quân y của lần hai trỏ vào nó.)

Y sư chữa: phiên trong trạng thái mới `healing`, trong đất của quest.

- **Đọc**: mã lý do và tham số, `pre-commit.log`, tiêu đề, mô tả và `scope_paths` của quest, danh sách file đã stage, thư bàn giao. Không nạp prompt nghề hay kinh của người làm.
- **Tool** (dữ liệu của nghề): `Read`, `Edit`, `Write`, `Glob`, `Grep`, lệnh lint, typecheck và install mà hiệp sĩ có, `git status`, `git diff`. Cấm `git add`, `git commit`, `git push`, `WebFetch`, `Agent`. Luật lãnh thổ (đường cấm, vùng bảo vệ) áp như mọi phiên.
- **Phần được đổi đo bằng máy, không chỉ dặn trong prompt.** Lúc mở phiên, cây đã stage là phần việc của người làm; lúc phiên kết thúc, Nhiếp chính lấy khác biệt giữa hai cây làm phần Y sư đổi, ghi ra `.runs/<quest>-<n>/heal/heal.patch`. Vượt `kingdom.heal.max_files` (8) hay `max_lines` (60), hoặc chạm file không nằm trong phần việc đã stage ⇒ lần chữa bị từ chối: đất được trả về đúng cây của người làm, quest vào trạm quân y.
- **Người chấm thấy phần Y sư đổi**: prompt người chấm chép `heal.patch` (nhiều nhất 60 dòng) dưới một mục riêng, cạnh diff của nhánh.
- **Thư**: Y sư thêm một mục vào `handover.md` (đã sửa gì, vì sao; hoặc vì sao không chữa được). Cổng thư ở `Stop` giữ nguyên, vì vai của phiên vẫn là `assignee`.
- Thư mục phiên: `.runs/<quest>-<n>/heal/`, để log và output của người làm không bị ghi đè.

### 4.5 Luồng trạng thái mới

```text
working ──breaker(commit, chữa được, lượt chưa chữa)──▶ returned   (không chuông; heal: "due")
returned ──redispatch──▶ working      người làm tự chữa, cùng lượt, không tăng attempts
returned ──heal──▶ healing            Y sư mở phiên
healing ──submit──▶ review            commit lại qua hook thành công
healing ──breaker | crash──▶ infirmary   chuông, kèm thư của Y sư
```

Hàng của bảng §2.5 (`packages/domain/src/quest/transitions.ts`):

| Từ | Event | Ai | Guard | Tới | Ghi chú |
|---|---|---|---|---|---|
| `working` | `breaker` | S | `heal_due` (mới) | `returned` | đứng trước `cut_goes_on`; `cut_stops` thành "không phải hai guard kia" |
| `returned` | `heal` (mới) | S | — | `healing` | mở mục attempt của Y sư: vai `assignee`, cùng `n`, `heal: "session"` |
| `healing` | `submit` | S | — | `review` | Nhiếp chính commit sau khi đo phần đổi |
| `healing` | `breaker` | S | — | `infirmary` | hook từ chối lần hai, vượt giới hạn, trần cắt, đường cấm |
| `healing` | `crash` | S | — | `infirmary` | CLI hỏng, phiên mất |
| `healing` | `mana_out` | M | — | `returned` | lần chữa không tính; nhịp sau chọn lại |
| `healing` | `release` | S | — | `returned` | Nhiếp chính khởi động lại dưới phiên (như P1-44) |
| `healing` | `cancel` | U | — | `archived` | |

(HL-04, khác bảng trên: `returned.heal` có guard `awaits_heal` (`awaitsHeal`): mục cuối là mục `due`, hay phiên của một Y sư kết thúc mà chưa chữa; quest `returned` khác không nhận `heal`. Hiệu ứng của `heal` từ chối Y sư là người làm hiện tại (`healer_is_assignee`) hay từng chấm quest (`healer_judged`), để máy giữ ADR 0008 cả khi `selectHealer` bị bỏ qua; mục của Y sư có `run_dir` `.runs/<quest>-<n>/heal`. `healing.release` không trả lượt thử nào, vì phiên chữa không lấy lượt. Sau `healing.mana_out` hay `healing.release` quest ở `returned` mà `awaitsHeal` vẫn đúng: nhịp sau chọn lại, và nếu người làm tự chữa thì `redispatch` mở phiên cùng lượt, `heal: "session"`. Quest `healing` tính vào `max_concurrent` của lãnh thổ và luật R2 như `working`; cầu dao đọc tộc của phiên chữa từ nhân vật của mục mở (Y sư), không từ `assignee`.)

Hiệu ứng đổi: `redispatch` sau một mục `heal: "due"` là phiên cùng lượt (như `endedInCut`) và ghi `heal: "session"`; `cutGoesOn` trả sai với phiên chữa. `quest.assignee` không đổi suốt lần chữa: phán quyết sau đó vẫn tính danh tiếng cho người làm, lần trượt trả quest về người làm với lượt mới. `infirmary` giữ nguyên nghĩa "dừng hẳn, chờ chủ nhân": `quest submit`, `retry`, `reassign`, `archive` sau một lần chữa hỏng chạy như hôm nay (`assignee_last` đúng vì mục cuối mang vai `assignee`).

### 4.6 Tách vai và bậc script

- **Y sư là người làm của quest.** Mục attempt của nó mang vai `assignee`, nên luật 1 của ADR 0008 (`selectVerifier`, `verifierEntry`, `validateVerdict`) loại nó khỏi người chấm mà **không sửa dòng nào trong `packages/domain/src/verify/**`**; HL-03 thêm test khẳng định. Luật đội của ADR 0020 cũng tự áp. Nghề `healer` không được vừa `is_verifier` (kiểm ở `parseRegistry`).
- Luật 4 và 5 (họ model, slug model) đọc mọi người làm, nên họ của Y sư tính vào. Luật 2 ở 4.3 giữ cho phép tính đó không đổi kết quả.
- **Bậc script đi trước model** (ADR 0017), ba lớp đã có hoặc không tốn gì: `commands.setup` chạy lại trước commit khi file của `setup_when` đổi (#303); hook của lãnh thổ tự `--fix` trước khi báo lỗi; lần commit lại là trọng tài bằng máy của lần chữa. Một lệnh `commands.fix` do Nhiếp chính chạy trước khi gọi model chỉ có ích cho lãnh thổ có hook chỉ kiểm mà không sửa: để dành (K10).

### 4.7 Đợt C: chẩn đoán (chưa dựng)

Với `quest:max_attempts` và `breaker:no_progress`, Y sư mở một phiên **chỉ đọc** (không `Edit`, không shell), đọc ba phán quyết, thư bàn giao và `git log`, rồi viết một thư loại mới `diagnosis` gửi chủ nhân: nguyên nhân, và một lệnh đề xuất (`quest edit --description …` rồi `reassign --to …`, hay chia việc). Chuông in thư đó; chủ nhân vẫn là người quyết. Mỗi lần vào trạm quân y một thư. Chỉ dựng sau khi sổ đo của đợt A và B cho thấy đáng (K9).

## 5. Hợp đồng dữ liệu đổi

Mọi thay đổi là thêm trường tùy chọn, giá trị enum hay loại event mới: file v1 và dòng event cũ vẫn hợp lệ, không tăng `version`, không migrate. Tên dưới đây là đề xuất; task ghi hợp đồng cuối.

- **`registry/classes.json`**: trường tùy chọn `is_healer` (vắng là `false`). Dòng mặc định:

  ```json
  {
    "id": "healer", "name_vi": "Y sư", "name_en": "Healer", "kinds": [],
    "is_verifier": false, "is_monk": false, "is_healer": true,
    "default_tribe": "claude", "default_model": "claude-sonnet-5-5",
    "tools": {
      "allow": ["Read", "Edit", "Write", "Glob", "Grep", "Bash(pnpm lint:*)", "Bash(pnpm typecheck:*)",
        "Bash(pnpm --filter:*)", "Bash(pnpm install --frozen-lockfile --prefer-offline)",
        "Bash(git status:*)", "Bash(git diff:*)"],
      "deny": ["Bash(git add:*)", "Bash(git commit:*)", "Bash(git push:*)", "WebFetch", "Agent"]
    },
    "prompt_file": "prompts/healer.md"
  }
  ```

  (HL-03: các dòng nghề mặc định khác không ghi `is_healer: false`, vì `registryGaps` sẽ nêu khóa thiếu ở mọi dòng nghề của vương quốc cũ; `parseRegistry` báo `verifier_and_healer` khi một nghề vừa `is_verifier` vừa `is_healer`. Vương quốc cũ nạp được như cũ; `elvaria upgrade` chạy `migrate` của bản ghim, thêm dòng `healer` theo id và chép `prompts/healer.md`, không đổi dòng nào chủ nhân đã có.)
- **`kingdom.json`**: đối tượng tùy chọn `heal`: `enabled` (true), `tokens` (150 000), `minutes` (15), `max_files` (8), `max_lines` (60). Vắng thì lấy mặc định. Vương quốc chỉ thêm khóa này sau `elvaria upgrade` (bản ghim cũ từ chối khóa lạ).
- **Đội hình**: mỗi tộc một Y sư (K7) là nhân vật của vương quốc (`elvaria character add`), cùng một nghề `healer`; registry không đổi theo số Y sư.
- **Quest**: `status` thêm `healing`; mục `attempt_log[]` thêm trường tùy chọn `heal`: `"due"` (phiên của người làm mà commit bị từ chối và được chữa) hay `"session"` (phiên chữa, của người làm hay của Y sư). (HL-01: `session` ghi trên mọi phiên người làm của cùng lượt sau mục `due`, cả phiên dậy sau mana hay sau câu trả lời, để trần `kingdom.heal`, luật không đi tiếp và mẫu (G) theo phiên chữa tới hết lượt.) `statusToneOf('healing')` là `infirmary`; nhãn hiển thị "Đang chữa".
- **Event của máy trạng thái**: `heal` (mang `healer`); event `breaker` thêm trường tùy chọn `reason` (mã lý do) để guard đọc. (HL-01: Nhiếp chính chỉ ghi `reason` khi `kingdom.heal.enabled` bật, vì guard chỉ đọc quest và event, không đọc cấu hình; không có `reason` thì quest vào trạm quân y như trước, như lần cắt không có `progress` của ADR 0030.)
- **Sổ event**: loại mới `quest.heal_due` (dòng của nước `working` → `returned`, mang mã lý do như `quest.infirmary`; HL-01 ghi hợp đồng: `data` gồm `reason` và view của quest, không có `trip`, `detail`. `questLogTypeOf(event, from, to)` không phân biệt được nước này với `working.breaker.cut_goes_on` (cùng `breaker`, cùng `working` → `returned`), nên Nhiếp chính đặt tên dòng ở HL-02: nước `breaker` mà mục cuối của `attempt_log` sau nước mang `heal: "due"`) và `quest.healing` (mang `healer`); `quest.submitted` thêm trường tùy chọn `heal` (`by`, `files`, `lines`, `patch`). (HL-04 ghi hợp đồng: `quest.healing` có `data` gồm `healer` và view của quest; `heal` của `quest.submitted` có đủ bốn trường (`files` ≥ 1, `lines` ≥ 0, `patch` là đường dẫn `.runs/<quest>-<n>/heal/heal.patch`) và chỉ có ở lần nộp của phiên Y sư: lần tự chữa của người làm không đo nên không có; hai loại `quest.heal_due` và `quest.healing` đều vào bộ giảm của thế giới (`reduce`), HL-01 chưa đưa `quest.heal_due` vào.)
- **Mã lý do trạm quân y** (nhóm mới, khóa i18n `cli.quest.infirmary.reason.heal.*`): `heal:over_limit` (`files`, `lines`), `heal:out_of_work` (`count`, đường dẫn ở `detail.paths`), `heal:unchanged` (Y sư không sửa gì), `heal:cut` (`trip`), `heal:session_ended` (`outcome`). (HL-04: đúng các tham số này, nhóm đứng sau `breaker:*` trong `INFIRMARY_REASONS`; Nhiếp chính ghi chúng ở HL-05.) Hook từ chối lần hai dùng lại `breaker:commit` và `breaker:commit_errors`, `log` trỏ vào log của lần hai.
- **Thuật ngữ** (`glossary.json`, rồi `pnpm docs:gen`): Y sư / Healer / `healer`; Đang chữa / Healing / `healing`; Chữa / Heal / `heal`. (HL-03 thêm `healer` vào bảng nghề và `heal` vào bảng nghiệm thu, cầu dao; `healing` vào bảng trạng thái quest cùng trạng thái ở HL-04.)

## 6. Ca biên

- Thư của người làm có phản biện đề bài (`amendment`): giữ thứ tự của `submitEndOf`, quest chờ tác giả như hôm nay; lần chữa chỉ xét khi kết cục là `breaker`.
- Phiên chữa của người làm bị hook từ chối lần nữa: guard `heal_due` sai (lượt đã có `heal: "due"`), quest theo hàng `cut_stops` vào trạm quân y.
- Phần việc chạm vùng bảo vệ: lần nộp sau khi chữa đánh dấu và nâng dấu vua như mọi lần nộp (`protectedMarkOf`, `submitSealOf`).
- Y sư làm một đường cấm đổi (chỉ một chương trình nó chạy mới làm được): `commitPlot` trả `forbidden`, quest vào trạm quân y với `breaker:forbidden_paths`, chủ nhân xem trước.
- Phần của đội: Y sư từng chữa một phần thì thuộc đội đó theo ADR 0020; nó không phải người chấm nên không mất gì.
- Quest ghép do máy gộp (không có người làm) và quest bậc script: không có lần chữa.
- Chủ nhân đình chỉ người làm khi quest đang `returned` chờ tự chữa: quest chờ như mọi quest `returned`; `reassign` mở lượt mới.
- `plan-tick.ts` đã 298 dòng (trần 300): phần chọn lần chữa nằm ở file riêng trong `dispatch/`, như `wakes.ts`.

## 7. Đo thành công

Từ sổ event, in ở `elvaria metrics` (HL-06):

1. Số lần `quest.heal_due`, chia theo người chữa (người làm, Y sư) và theo tộc.
2. Tỉ lệ chữa khỏi: lần chữa mà quest tới `review` trong cùng lượt. Mốc: từ 70 % sau 10 lần.
3. Token mỗi phiên chữa theo tộc. Mốc: trung vị dưới 80 000.
4. Kết quả chấm của lượt đã chữa so với lượt thường (tỉ lệ pass).
5. Số lần chủ nhân phải `quest submit` hay sửa tay sau một lần commit bị từ chối. Hôm nay 5 trên 5; mốc: 0 với ca chữa khỏi.

Mốc 2 không đạt ở Y sư của một tộc sau 10 lần chữa là tín hiệu để xét lại luật họ model cho tộc đó (K6): cho một Y sư khác họ chữa quest của tộc ấy.

## 8. Chia task (đã vào §8, chưa mở)

Cỡ theo một context. "Đọc trước" là vùng "đọc trước khi sửa" của CLAUDE.md: task có dấu đó chạy Opus xhigh.

| Id | Việc | Cỡ | Cần trước | File chạm chính | Đọc trước | Xong khi |
|---|---|---|---|---|---|---|
| HL-01 | **Domain: mỗi lượt một lần chữa, nhánh người làm.** `HEALABLE_REASONS`, `healCallOf`, trường `heal` của attempt, `reason` trên event `breaker`, guard `heal_due` và hàng `working.breaker.heal_due`, `redispatch` cùng lượt, `cutGoesOn` sai với phiên chữa, `kingdom.heal` và trần phiên chữa trong `breakersOf`, mẫu hiệu chỉnh (G) bỏ phiên chữa, loại event `quest.heal_due`; ADR 0034 thành accepted; sửa dòng 64 của phase-2-plan và ADR 0030 tại chỗ | M | — | `p/domain/src/{quest,breaker,infirmary,metrics}/**`, `p/domain/src/schema/{quest,event,kingdom*}`, `docs/adr/0034*`, `docs/adr/0030*`, `docs/plans/phase-2-plan.md`, `docs/implementation-plan/{2-data-and-events,3.4-breakers}.md` | máy trạng thái, schema | spec: lần hook từ chối đầu của một lượt đưa quest về `returned`, `redispatch` kế đó không tăng `attempts` và không đổi `n`; lần thứ hai trong lượt vào `infirmary`; `patch`, `setup`, `forbidden_paths`, `secrets`, `no_session` không bao giờ được chữa; phiên chữa bị trần cắt vào `infirmary`; coverage 100 % |
| HL-02 | **Nhiếp chính và prompt: người làm tự chữa.** `breakAssignee` truyền mã lý do, không chuông khi được chữa; phần "đi tiếp" mang dòng lỗi của log (che secret, cắt 4 000 ký tự) qua `refused-commit.md`; log lần hai nằm cạnh log lần đầu; `quest show` và `quest list` nói quest đang chờ chữa; hướng dẫn vận hành mục trạm quân y | M | HL-01 | `p/steward/src/sessions/{breaker,submit,commit,continuation}.ts`, `p/runner-core/prompts/**`, `p/runner-core/src/prompt/**`, `a/cli/src/quest/**`, `p/i18n`, `docs/guides/operating-a-kingdom.md` | — | spec của steward: phiên có commit bị hook từ chối được nối, không chuông và không lệnh nào của chủ nhân, bằng một phiên của cùng nhân vật, cùng lượt, prompt có dòng lỗi của log; commit qua thì quest tới `review`; bị từ chối lần nữa thì `infirmary`, chuông, đủ hai log |
| HL-03 | **Nghề `healer` và luật chọn.** `is_healer` trên `ClassSchema`, kiểm ở `parseRegistry`; dòng nghề và `prompts/healer.md` mặc định; `selectHealer` (thuần); thuật ngữ; `character add --class healer`; test: Y sư từng chữa quest không bao giờ được chọn chấm quest đó hay quest cùng đội; với ba Y sư ba họ, `selectHealer` chọn đúng Y sư cùng họ với người làm | S | HL-02 | `p/domain/src/schema/registry*.ts`, `p/domain/src/dispatch/**`, `p/registry-default/**`, `p/i18n/src/glossary.json` và locale, `a/cli/src/character/**` | schema; `verify/**` chỉ thêm test | `pnpm -r test` xanh; vương quốc có `classes.json` cũ vẫn nạp được; `elvaria upgrade` đưa dòng nghề mới vào vương quốc hoặc hướng dẫn ghi cách thêm tay |
| HL-04 | **Máy trạng thái của Y sư.** Trạng thái `healing`, event `heal`, các hàng `returned.heal` và `healing.*`, hiệu ứng, `planTick.heals`, loại event `quest.healing`, trường `heal` của `quest.submitted`, mã lý do `heal:*`, `statusToneOf`, nhãn CLI | M | HL-03 | `p/domain/src/{quest,dispatch,infirmary,world}/**`, `p/domain/src/schema/**`, `a/cli/src/labels.ts`, `p/i18n` | máy trạng thái, schema | spec: bảng §2.5 sinh lại có 7 hàng mới, guard của mỗi cặp (từ, event) không bao giờ cùng đúng; `planTick` không vừa `starts` vừa `heals` một quest; Y sư bận thì quest chờ, không có Y sư hợp lệ thì `starts` (HL-04: `redispatches`, vì HL-01 (e) đưa quest chờ chữa vào đó) |
| HL-05 | **Nhiếp chính: phiên của Y sư.** Mở phiên trong đất của quest (prompt `heal.md`, chính sách tool của nghề, thư mục `/heal`, trần riêng); cổng `Plots` chụp cây đã stage và lấy khác biệt; giới hạn, `heal.patch`, trả đất khi bị từ chối; commit qua hook, nộp hay vào trạm quân y; chuông kèm thư của Y sư; mục `heal.patch` trong prompt người chấm; phiên mất khi khởi động lại | M | HL-04 | `p/steward/src/sessions/**`, `p/steward/src/tick/**`, `p/runner-core/src/{plot,prompt,policy}/**`, `p/runner-core/prompts/**`, `a/cli/src/{quest,run}/**`, `docs/guides/operating-a-kingdom.md` | — | spec của steward với repo git thật trong thư mục tạm: Y sư sửa một dòng, commit qua, quest tới `review`, `heal.patch` đúng một dòng đó và có trong prompt người chấm; Y sư đổi 61 dòng hay một file ngoài phần đã stage thì đất trở lại đúng cây cũ và quest vào `infirmary`. Chạm plot và git: nêu trong báo cáo để chủ nhân quyết có chạy CI hai hệ điều hành |
| HL-06 | **Sổ đo lần chữa**: năm số của mục 7 trong `elvaria metrics` và một dòng trong bản tấu | S | HL-02 | `p/domain/src/metrics/**`, `a/cli/src/metrics/**` | — | báo cáo in năm số từ một sổ event mẫu có lần chữa khỏi, lần chữa hỏng và lần Y sư chữa |
| HL-07 | (Đợt C, chờ K9) **Chẩn đoán**: phiên chỉ đọc của Y sư cho `quest:max_attempts` và `breaker:no_progress`, loại thư `diagnosis` gửi chủ nhân, chuông in thư và lệnh đề xuất | M | HL-05, số đo | `p/registry-default/memos.json`, `p/domain/src/{memo,dispatch}/**`, `p/steward/src/**`, `a/cli/src/run/**` | — | quest hết lượt thử có đúng một thư chẩn đoán trước khi chủ nhân làm gì; phiên đó không có `Edit`, `Write`, shell |

Phụ thuộc: HL-01 → HL-02 là đợt A và đứng được một mình (đó là (513)). HL-06 chạy song song với đợt B. HL-03 → HL-04 → HL-05 là đợt B. HL-01 và HL-04 cùng sửa `transitions.ts`, `effects.ts` nên không chạy cùng lúc. Đợt B mở ngay sau HL-02, không chờ số đo (K5). Sau HL-02 và sau HL-05: `elvaria upgrade` vương quốc; sau HL-05 chủ nhân triệu hồi ba Y sư, mỗi tộc một (`elvaria character add`, nghề `healer`). Model gợi ý là model rẻ mà tộc đó đang dùng: `claude-sonnet-5-5` cho `claude`, `gpt-6.1-sol-low` cho `codex`, `gemini-3.8-flash-high` cho `gemini`; chủ nhân chọn lúc triệu hồi.

## 9. Quyết định của chủ nhân (chốt 2026-11-25)

Chủ nhân trả lời trong phiên lập kế hoạch: "tạo cho mỗi tộc 1 Y sư để đảm bảo là nếu cần thì có Y sư. K5: dựng Y sư luôn. Còn lại oke". Dòng §11 của ngày ghi lại. Hai chỗ chủ nhân chọn khác khuyến nghị là K5 và K7.

**Trước HL-01:**

- **K1. Kết hợp thành một cơ chế, nhánh người làm tự chữa dựng trước.** Chốt: đồng ý. Đợt A (HL-01, HL-02) là (513).
- **K2. Đợt đầu chỉ chữa `breaker:commit` và `breaker:commit_errors`.** Chốt: đồng ý; `setup` và `patch` chờ có ca để đo. Không phiên nào cho `secrets`, `forbidden_paths`, `no_session` (lý do ở 4.2).
- **K3. Trần phiên chữa 150 000 token và 15 phút, cắt ở 150 %; phiên chữa bị cắt thì vào trạm quân y.** Chốt: đồng ý, chỉnh khi đủ 10 mẫu.
- **K4. Phiên chữa không tốn lượt thử, và cơ chế bật mặc định** (`kingdom.heal.enabled`). Chốt: đồng ý cả hai.

**Trước HL-03 (đợt B):**

- **K5. Khi nào dựng Y sư.** Chốt: **dựng luôn**, ngay sau HL-02, không chờ số đo. (Khuyến nghị của kế hoạch là chờ khoảng 10 lần chữa của đợt A.)
- **K6. Luật họ model của `selectHealer`** (4.3, luật 2). Chốt (a): Y sư chỉ chữa quest đã có người làm cùng họ; không có Y sư cùng họ thì người làm tự chữa. Mốc xét lại là tỉ lệ chữa khỏi dưới 70 % sau 10 lần. Bản đề xuất đo mốc này trên Codex tự chữa; nay ca của Codex do Y sư tộc `codex` chữa, nên phiên lập kế hoạch đọc mốc là đo trên Y sư của từng tộc.
- **K7. Tên và Y sư.** Chốt: id `healer`, "Y sư" / "Healer", trạng thái `healing` "Đang chữa". **Mỗi tộc một Y sư** (`claude`, `codex`, `gemini`), thay cho một Y sư Sonnet của bản đề xuất. Model của từng Y sư chủ nhân chọn lúc triệu hồi (gợi ý ở mục 8). Điều cần theo dõi: Y sư tộc `codex` chạy trong cùng sandbox với dorian, nên nếu gốc là phiên Codex không lint được thì nó cũng sửa theo log rồi để hook kiểm; số 2 và 3 của mục 7, chia theo tộc, sẽ cho thấy.
- **K8. Giới hạn phần Y sư được đổi: 8 file, 60 dòng, chỉ file đã có trong phần việc đã stage.** Chốt: đồng ý. Hệ quả: lỗi `max-lines` (phải tách file) Y sư không chữa được, quest vào trạm quân y kèm thư của nó.

**Chờ số đo:**

- **K9. Đợt C (chẩn đoán cho hết lượt thử và không tiến triển).** Chốt: chưa dựng. HL-07 nằm ở §8 với điều kiện chỉ mở khi chủ nhân chốt lại sau khi đợt A và B có số.
- **K10. `commands.fix`, bậc script tự sửa trước khi gọi model.** Chốt: chưa làm; xét lại khi có lãnh thổ thứ hai.
- **K11. Y sư bó tay thì có trả tiếp cho người làm tự chữa không.** Chốt: không, giữ "mỗi lượt một lần chữa"; xét lại theo số ca `heal:unchanged`.
- **K12. Bài học cho người làm bị hook từ chối nhiều lần.** Chốt: HL-06 đếm theo nhân vật; việc đưa vào kinh chờ đợt rà bài học.
