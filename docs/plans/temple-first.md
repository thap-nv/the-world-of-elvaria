# Đền bản đầu — PS-12, PS-12b, PS-12c, PS-12d và PS-12e: kế hoạch chi tiết

Ngày: 2026-11-19 · Trạng thái: **chủ nhân đã chốt** ngày 2026-11-19 cả mười bảy mục DB1–DB17 ở cuối file. Mười ba mục theo khuyến nghị; DB7, DB9 và DB10 được sửa sau khi chủ nhân hỏi lại; DB13 chủ nhân chọn "tự thả", nên việc đó vào PS-12d ([§11, 2026-11-19](../implementation-plan/11-2026-11-19.md): dòng **docs/plan-ps-12** nêu các mục, hai dòng "Người dùng chốt (trong phiên kế hoạch `plan-ps-12` …)" ghi lời chốt). Chủ nhân mở phiên kế hoạch này bằng quyết định (258). Nguồn bất biến là [§3.16.8](../implementation-plan/3.16-self-strengthening.md), [ADR 0027](../adr/0027-measured-learning.md), nguyên tắc 14 cùng mục 6 và mục 14 của kế hoạch sản phẩm 0.8, và [lesson-sharing.md](lesson-sharing.md) (chủ nhân chốt cả file ngày 2026-11-16): luật xếp bài học L5, bước 0 và tám ràng buộc S1–S8. Phần "Ai đọc" và "Mẫu dùng lại" ở đầu [phase-1.5.md](phase-1.5.md) áp dụng nguyên. Tên hàm, tên trường, tên file và các con số dưới đây là đề xuất khớp với code hiện có. Phiên làm task được đổi cho hợp, miễn giữ hợp đồng, và ghi chỗ đổi vào §11. Chưa task nào dưới đây được mở. Phiên điều phối quyết thứ tự và lúc mở.

## Điều đã chốt mà kế hoạch này giữ

- **Thang sửa lỗi sáu bậc** (ADR 0027): (1) làm cho lỗi không xảy ra được, (2) một check, (3) một script, (4) bí kíp hay địa chí, (5) một dòng kinh, (6) model mạnh hơn. Thầy tu biến bậc 1–3 thành thư `proposal` và bậc 6 thành một mục cho chủ nhân. Chỉ bậc 4–5 là chữ trong prompt.
- **Kinh sửa từng dòng**: chỉ có `add`, `retire`, `merge`. Nhiếp chính từ chối thao tác thay cả tập. Kinh vẫn là Markdown chủ nhân sửa được, và dòng không có siêu dữ liệu là của chủ nhân.
- **Bài học phải đo được**: mỗi lần chạy ghi dòng kinh nó đã nạp, và `helped`, `missed` tính từ dấu vết đó.
- **L5**: bài học về chính Elvaria thì sửa repo Elvaria. Bài học về một repo thì vào địa chí hay tài liệu của repo đó. Phần còn lại mới là kinh, có phạm vi ở đầu dòng.
- **S1–S8** ([lesson-sharing.md](lesson-sharing.md) mục 7): phạm vi có vai (S1). Giá trị phạm vi là id của registry và của vương quốc, riêng lãnh thổ là phạm vi không mang đi được (S2). Mỗi dòng mang `fail_kind` nó chữa (S3). `origin` là trường tùy chọn và `source` mở cho dòng tới từ ngoài (S4). Phiên bản CLI là "đo ở bản nào", không phải bộ lọc (S5). PS-12 chọn cách tính trần 40 dòng (S6). Dấu vết nạp ghi id từng dòng (S7). `elvaria scripture lint` soát mọi dòng theo luật T4 (S8).
- PS-12 **không** dựng lệnh xuất, lệnh nhập, kinh mặc định theo bản phát hành, hay bí kíp. Các việc đó là bước 2–5 của lesson-sharing và PS-13.

## Điều code cho thấy (2026-11-19)

Khảo sát ở `f02e9a1` (nhánh `docs/plan-ps-12`, tách từ `main` `821ea38`). Phiên làm task kiểm lại điều mình dựa vào trước khi viết code.

| # | Thực tế trong code | Hệ quả |
|---|---|---|
| 1 | `packages/domain/src/temple/` chưa có. Schema `lesson` v1 (`packages/domain/src/schema/lesson/lesson.ts`) là thứ duy nhất về kinh trong domain: `source` là `monk` hay `user`, `source_verdict` bắt buộc với `monk`. Văn phạm `- [L_…] câu <!-- verdict= hit= retired= -->` chỉ nằm trong phần mô tả của schema (dòng 61). Chưa có parser, writer hay lệnh nào đọc nó | Mọi mã về kinh là mã mới. Chưa file `lesson` nào từng được ghi ra đĩa, nên sửa schema không cần migration dữ liệu |
| 2 | Kinh vào prompt nguyên cả file. `readScriptures` đọc kinh riêng rồi kinh chung (`packages/steward/src/files.ts:26-33`; đường dẫn kinh chung là hằng `TEMPLE_SCRIPTURE` ở dòng 7, vì `kingdomLayout` chỉ có `scripture(character)`). `promptOf` đưa nguyên văn từng file cho `buildPrompt` (`packages/steward/src/sessions/prompt.ts:197-212`). `scriptureBlock` cắt khoảng trắng rồi nối (`packages/runner-core/src/prompt/blocks.ts:219-222`) | Chỗ lọc theo phạm vi là giữa `readScriptures` và `buildPrompt`. Quyết định lọc là hàm thuần của domain, Nhiếp chính gọi, còn runner-core chỉ in các dòng đã chọn |
| 3 | Khối `scripture` nằm ở phần user của prompt, sau `gazetteer` và trước `skills`, cho cả người làm (`build-prompt.ts:196-204`) lẫn người chấm (`:264-271`). Phiên nối lại bằng `--resume` không mang khối này (`resumedPrompt`). Khung của khối là `packages/runner-core/prompts/scripture.md` | Vị trí giữ nguyên. Phiên Tể tướng và phiên Thầy tu không nạp kinh |
| 4 | Dấu vết nạp (`packages/domain/src/schema/event/load-trace.ts:16-21`) chỉ ghi `scriptures: [{file, lines}]`. Nó nằm trên dòng mở phiên `quest.started`, `quest.unblocked`, `quest.resumed`. Phiên theo sau trong cùng một lượt và phiên Tể tướng không có dấu vết. Sổ đo mới chỉ đọc nó để tính cỡ prompt (`metrics/session-counts.ts:187-226`) | S7 cần một trường mới, tùy chọn, mang tham chiếu từng dòng. Bộ đếm tính theo **lượt** của quest, lấy dòng mở phiên đầu của lượt |
| 5 | Vương quốc thật (chỉ đọc, 2026-11-19): `temple/scripture.md` còn 8 dòng sau bước 0, không dòng nào có id. Hai dòng viết phạm vi bằng chữ ("As a Codex judge on Windows, …"). Không nhân vật nào có `scripture.md` riêng. Không nhân vật nào thuộc nghề `monk`. `schedule.temple` đang tắt. Có 171 file phán quyết, trong đó 41 phán quyết trượt: `incomplete` 11, `tests_fail` 10, `wrong_facts` 8, `other` 5, `style` 2, `flaky` 2, `unsafe` 2, `scope_creep` 1 | Đã có lỗi lặp để Thầy tu đọc ngay từ lần chạy đầu. Hai dòng dành cho người chấm Codex vẫn vào prompt của mọi người làm, nên lọc theo vai có ích ngay |
| 6 | Nghề `monk` có trong `packages/registry-default/classes.json`: `is_monk: true`, `kinds: []`, tộc mặc định `gemini`, model `gemini-3.8-flash-low`, được `Read`, `Glob`, `Grep`, cấm `Edit`, `Write`, `Bash`. Prompt nghề `prompts/monk.md` có sẵn 5 luật. `SPAWN_ROLES` đã có `monk` (`packages/runner-core/src/runner/roles.ts:4`), nhưng chưa mã nào mở phiên với vai đó | Không cần nghề mới. Vai `monk` của runner đã chờ sẵn |
| 7 | `kingdom.schedule.temple` là `{enabled: false, every_quests: 10, weekly: true}` (`packages/domain/src/schema/kingdom-schedule.ts:35-41`). Nó không có `at`, không nằm trong `DAILY_JOBS` (`packages/domain/src/schedule/constants.ts:9`), và `schedule.ran` không có giá trị `temple`. `ScheduledJob` là việc mỗi ngày một lần theo giờ (`packages/steward/src/schedule/ports.ts:37-47`). Dạng không có giờ là `OnCallJob` (`ports.ts:54-58`): chạy ngoài nhịp, mỗi lúc một việc, khi `ready` nói có việc, và không ghi `schedule.ran` | "`ScheduledJob` của thầy tu" trong §3.16.8 không khớp kiểu đó. Việc của Đền là một việc gọi theo điều kiện, có luật tới hạn và event riêng |
| 8 | Mẫu cho một vai chạy phiên model ngoài quest là phân loại thư của Tể tướng: `apps/cli/src/triage/job.ts` và `run-triage.ts` dựng việc, `packages/chancellor/src/session.ts` mở một phiên không tool, câu trả lời là structured output có schema, sai thì thử lại một lần ở tộc không có cờ schema. Kết quả chỉ là lệnh ghi vào `inbox/` với `source: chancellor`, Nhiếp chính áp ở nhịp kế (ADR 0005). `requestOf` đặt cứng `role: 'chancellor'` và trần của Tể tướng (`session.ts:76-89`) | Thầy tu đi đúng đường này. Phần mở phiên cần nhận vai và trần từ ngoài, hoặc có một bản riêng cho Đền |
| 9 | Token của phiên ngoài quest vào ước lượng mana qua dòng `tribe.checked` và `chancellor.answered` (`OUTSIDE_LINES`, `packages/steward/src/mana/book.ts:145-166`). Dòng ghi trong lúc Nhiếp chính chạy chỉ được đọc ở lần khởi động kế. Việc tính ngay được hoãn ở (256)(ii) | Phiên Thầy tu cần một dòng cùng loại. Giới hạn "đọc ở lần khởi động kế" giữ nguyên |
| 10 | Tộc agy nhận prompt trên dòng lệnh, và Windows dừng ở 32 767 ký tự. `TribeLimits.prompt_max_chars` của agy trên `win32` là 26 000 ([domain.md](../../.claude/rules/domain.md), bẫy đã gặp). Tộc này cũng không có structured output riêng | Gói bằng chứng của Thầy tu phải có trần ký tự và cắt theo trần của tộc. Thầy tu ở tộc `gemini` trả lời bằng JSON trong chữ, có một lần thử lại |
| 11 | Thư là `memos/<id>.json`, và schema đòi `quest` cùng `attempt` (`packages/domain/src/schema/memo/memo.ts:156-192`). Chỉ Nhiếp chính ghi thư. Kiểu `proposal` đi tới Tể tướng (`registry/memos.json`). Thư đang mở tới Tể tướng là mục `memo` của bản tấu. Thư tới thẳng chủ nhân hiện ra là mục `objection` (`MEMO_ITEMS`, `packages/domain/src/world/attention.ts:55-61`) | Thư của Thầy tu lấy `quest` và `attempt` từ phán quyết nguồn. Thư bậc 6 gửi thẳng chủ nhân cần `memoKindOf` phân biệt nó với thư phản biện |
| 12 | Vòng "đình chỉ về Đền" mới có nửa đầu. `planTick` đình chỉ nhân vật có `same_fail_suspend` lần trượt cùng loại liên tiếp, và máy trạng thái nhân vật có `temple_done`. Không mã nào phát `temple_done`, và lệnh `send_to_temple` nằm trong danh sách `LATER` (`packages/steward/src/inbox/apply.ts:37-44`), bị từ chối là `unsupported`. Hôm nay chủ nhân thả nhân vật bằng `release` | Kích hoạt "khi bị đình chỉ" làm được. Tự thả nhân vật sau buổi ở Đền là thay đổi hành vi; chủ nhân chốt làm nó ở PS-12d (mục DB13) |
| 13 | Sổ đo là hàm thuần trên `MetricsInput` gồm quest, phán quyết, event và lệnh đã áp (`packages/domain/src/metrics/ledger.ts:15-25`). `runJudgementsOf` đã nói mỗi lượt của người làm đạt hay trượt (`metrics/judgement.ts:26-38`). `lastFailOf` và `escapedOf` đã có. `FAIL_KINDS` là từ vựng đóng gồm 9 loại (`schema/common.ts:29-40`), trong đó `flaky` được tính là lỗi hạ tầng | Bộ đếm và bảng "lỗi lặp" dựng trên các hàm này, không cần nguồn dữ liệu mới ngoài trường mới của dấu vết nạp |
| 14 | `packages/domain/src/metrics/**`, `packages/domain/src/schema/**`, `docs/schemas/**` và `packages/registry-default/classes.json` nằm trong `protected_paths` của lãnh thổ Elvaria ([elvaria-territory.md](../guides/elvaria-territory.md)). `packages/runner-core/src/prompt/**`, `prompts/scripture.md`, `prompts/monk.md` và thư mục mới `domain/src/temple/` thì không | Mọi task con trừ PS-12e đều chạm vùng bảo vệ, nên quest của chúng cần dấu vua ([ADR 0026](../adr/0026-guarded-self-change.md)) |
| 15 | Id bài học là `L_<yyyymmdd>_<6 base32>` (`LESSON_ID_PATTERN`). `IdSource.lesson()` sinh id từ đồng hồ và nguồn ngẫu nhiên. Domain không có hàm băm. Id của thư được dựng bằng cách domain cho khóa (`memoKeyOf`), Nhiếp chính băm bằng `node:crypto`, rồi domain định dạng (`memoIdOf`) | Khóa suy từ nội dung của một dòng kinh đi cùng đường đó |
| 16 | Kinh không qua `redact` trước khi vào prompt ([lesson-sharing.md](lesson-sharing.md) mục 2, dòng 1) | Dòng do Thầy tu viết phải qua các mẫu của `redact` ở bước Nhiếp chính áp thao tác, vì domain không import được `eventlog` |

## Tổng quan và cách chia

- **Mục tiêu**: một lỗi lặp lại trong các phán quyết được đưa lên bậc cao nhất sửa được. Phần buộc phải là chữ trong prompt thì thành một dòng kinh có nguồn, có phạm vi và có số đo. Dòng ngoài phạm vi không tốn chỗ trong prompt, và chủ nhân nhìn sổ đo thì biết dòng nào có tác dụng.
- **Đọc trước**: các nguồn ở đầu file; bảng 1–16 ở trên; [§3.16.1](../implementation-plan/3.16-self-strengthening.md) (sổ đo, dấu vết nạp) và §3.16.3 (việc theo lịch); [ADR 0005](../adr/0005-single-writer-steward-inbox.md), [ADR 0003](../adr/0003-zod-schema-source-generated-json-schema.md), [ADR 0020](../adr/0020-class-skill-scripture-tags-and-parties.md), [ADR 0024](../adr/0024-typed-letters-through-the-steward.md), [ADR 0009](../adr/0009-mana-model.md); [hướng dẫn vận hành](../guides/operating-a-kingdom.md) mục 11.

### Văn phạm của một dòng kinh (mục DB2, DB3, DB5)

```
- [L_20261119_4k2pqz] {role=verifier tribe=codex os=win32 fail_kind=tests_fail} Compare commits with `git diff <base>...HEAD`.
```

- Một bài học là một mục danh sách `- ` trên một dòng. Tiêu đề và dòng trống được bỏ qua. Chữ khác không được nạp, và lint nêu nó ra.
- `[L_…]` là id, tùy chọn. Nhiếp chính đóng id vào mọi dòng nó viết. Dòng chủ nhân viết tay không cần id.
- `{…}` là **đầu phạm vi**, tùy chọn, gồm các cặp `khóa=giá trị` cách nhau bằng dấu cách. Một khóa nhận nhiều giá trị cách nhau bằng dấu phẩy. Không có đầu phạm vi nghĩa là dòng dành cho mọi phiên.
- Phần còn lại là câu, tối đa `LESSON_TEXT_MAX_LENGTH` (300) ký tự. Chỉ câu vào prompt. Id và đầu phạm vi không vào.

| Khóa | Giá trị | Khớp khi |
|---|---|---|
| `role` | `assignee`, `verifier` | vai của phiên |
| `class` | id nghề của registry | nghề của nhân vật |
| `tribe` | id tộc của `kingdom.tribes[]` | tộc của nhân vật |
| `os` | `win32`, `darwin`, `linux` | hệ điều hành Nhiếp chính đang chạy, cùng nguồn với `shellOf` |
| `territory` | id lãnh thổ | lãnh thổ của quest. Có khóa này là dấu "dòng ở lại vương quốc" (S2, P3) |
| `tag` | id tag của registry | quest có ít nhất một tag trong danh sách |
| `fail_kind` | một giá trị của `FAIL_KINDS` | không lọc. Đây là loại lỗi dòng chữa, để đếm `helped` và `missed` (S3) |
| `cli` | chuỗi phiên bản | không lọc. Đây là "đo ở bản nào" (S5) |

- Mọi khóa lọc có mặt đều phải khớp thì dòng mới được nạp. Dòng có đầu phạm vi mà máy không đọc được (khóa lạ, giá trị không có trong registry hay vương quốc) thì **không nạp**, và lint báo lỗi. Lý do: nguyên tắc "ngoài phạm vi thì không nạp" phải đúng cả khi phạm vi viết sai.
- Dòng có ký tự ẩn hay ký tự đổi chiều chữ không bao giờ được nạp (T4, [lesson-sharing.md](lesson-sharing.md) mục 13). (PS-12, chờ chủ nhân chốt, §11) Dòng có câu khớp mẫu secret của sổ sự kiện, hay giá trị secret của phiên, cũng không bao giờ được nạp (ADR 0013): Nhiếp chính đặt chỗ sai `secret` lên dòng, domain coi nó như dòng không đọc được.
- **File bên cạnh** là `scripture.json` nằm cùng thư mục với `scripture.md` (`temple/scripture.json`, `characters/<id>/scripture.json`), do Nhiếp chính ghi. Nó chỉ giữ thứ không suy ra được và chủ nhân không cần gõ tay: `source`, `source_verdict`, `origin`, `cli_version`, ngày thêm, `merged_from`, và với dòng đã gỡ thì ngày gỡ, ai gỡ, câu lúc gỡ. Dòng có id mà file bên cạnh không biết là dòng của chủ nhân. Mục của file bên cạnh mà Markdown không còn dòng nào mang id đó nghĩa là chủ nhân đã xóa dòng.
- **Tham chiếu của một dòng** trong dấu vết nạp và sổ đo: id `L_…` nếu dòng có id. Dòng không id dùng khóa suy từ câu đã chuẩn hóa, dạng `T_<10 base32>`. Chủ nhân sửa câu của một dòng không id thì nó thành bài học mới và số đếm bắt đầu lại.
- `helped` và `missed` **không được lưu** ở đâu. Chúng là hàm thuần trên sổ sự kiện, quest và phán quyết, như danh hiệu và các số đếm khác (ADR 0020).

### Trần 40 dòng (mục DB4, câu S6)

- Trần tính trên số dòng **được nạp cho một phiên** sau khi lọc, gộp kinh riêng và kinh chung. File không có trần. Hằng `SCRIPTURE_LINES_MAX` (40) nằm ở `constants.ts` của domain.
- Lúc dựng prompt: kinh riêng trước, kinh chung sau, theo thứ tự trong file. Dòng thứ 41 trở đi không được nạp. `scripture lint` và `doctor` báo nhân vật nào vượt.
- Lúc áp thao tác `add`: Nhiếp chính tính số dòng nặng nhất mà dòng mới có thể đứng cùng, cho từng nhân vật chưa bị đình chỉ nhân với từng lãnh thổ khớp phạm vi, coi như quest mang mọi tag. Một tổ hợp nào đó vượt 40 thì thao tác bị từ chối với mã `over_cap`. Đó là ca "dòng thứ 41 bị từ chối". Thầy tu phải gộp trước rồi mới thêm được.

### Thang sửa lỗi ở bản đầu (mục DB8)

| Bậc | Id đề xuất | Thầy tu viết gì | Ai làm tiếp |
|---|---|---|---|
| 1 | `prevent` | thư `proposal`: quyền, công cụ hay lệnh lãnh thổ cần đổi | Tể tướng phân loại thư. Trong phạm vi ủy quyền thì thành quest nháp, ngoài phạm vi thì lên chủ nhân |
| 2 | `check` | thư `proposal`: check nào bắt được lỗi, trên lãnh thổ nào | như bậc 1 |
| 3 | `script` | thư `proposal`: script nào làm thay | như bậc 1 |
| 4 | `knowledge` | một dòng kinh chung có `territory=<id>` | Nhiếp chính áp như bậc 5. Bí kíp chờ PS-13. Địa chí vẫn là file chủ nhân viết (L7) |
| 5 | `scripture` | thao tác `add` hay `merge`, có `source_verdict`, phạm vi và `fail_kind` | Nhiếp chính áp |
| 6 | `model` | thư gửi thẳng chủ nhân: nghề hay tag nào cần model mạnh hơn, kèm số đo | chủ nhân quyết bằng `set_model` |

- Luật máy giữ được: quyết định bậc 1–3 và bậc 6 chỉ mang thư, không mang thao tác kinh. Quyết định bậc 4–5 chỉ mang thao tác kinh. Câu trả lời trái luật này bị từ chối ngay ở bước kiểm câu trả lời. Đó là ca "lỗi chặn được bằng check thành thư `proposal`, không thành kinh".
- Theo L5, lỗi về chính Elvaria (thư bàn giao, luật đạt của người chấm, đất nháp) đi bậc 1–3 với lãnh thổ là Elvaria. Vương quốc không gắn lãnh thổ Elvaria thì thư lên chủ nhân như mọi thư ngoài phạm vi ủy quyền.

### Luồng đích sau các task

1. Phiên mở. Nhiếp chính đọc hai file kinh, phân tích từng dòng, lọc theo phiên và cắt ở 40 dòng. Prompt chỉ mang câu của các dòng được chọn. Dòng mở phiên ghi tham chiếu từng dòng đã nạp (PS-12).
2. Lượt được chấm. Sổ đo cộng `helped` hay `missed` cho từng dòng lượt đó đã nạp, và in bảng tỉ lệ từng `fail_kind` theo thời gian (PS-12b).
3. Đủ điều kiện kích hoạt và tộc của Thầy tu rảnh. Máy dựng gói bằng chứng. Không có lỗi lặp và không dòng nào cần xét thì không gọi model. Có thì mở một phiên Thầy tu (PS-12d).
4. Thầy tu trả một quyết định có bậc cho mỗi lỗi lặp. Việc của Đền kiểm câu trả lời rồi ghi một lệnh `temple_report` vào `inbox/` (PS-12d).
5. Ở nhịp kế, Nhiếp chính kiểm từng thao tác bằng hàm thuần, ghi dòng vào Markdown và file bên cạnh, lập thư, ghi event, rung chuông một lần (PS-12c).
6. Thư `proposal` đi tiếp theo đường thư đã có: phân loại thư, quest nháp, bản tấu.
7. Sau ít nhất 20 lượt được chấm có nạp dòng mới, chủ nhân đọc `elvaria metrics` để thấy `fail_kind` tương ứng giảm hay không (PS-12e).

### Chia (mục DB1; không task nào sửa bảng chuyển trạng thái quest)

| Id | Việc | Số ý | Cần trước | File chạm chính |
|---|---|---|---|---|
| PS-12 | Kinh từng dòng: văn phạm, parser, lint, lọc theo phạm vi, trần lúc nạp, dấu vết nạp theo dòng | 4 | — | `p/domain/src/temple/**` (mới), `p/domain/src/schema/{lesson,event}/**`, `p/steward/src/{files.ts,sessions/**}`, `p/runner-core/src/prompt/**`, `a/cli/src/scripture/**` (mới), `p/store/src/layout.ts`, `p/i18n` |
| PS-12b | Sổ đo bài học: `helped`, `missed`, tỉ lệ `fail_kind` theo thời gian, bảng lỗi lặp | 3 | PS-12 | `p/domain/src/metrics/**`, `a/cli/src/metrics/**`, `docs/metrics-report.md` |
| PS-12c | Thao tác kinh từng dòng: file bên cạnh, lệnh `temple_report`, luật từ chối, thư của Đền, event | 4 | PS-12 | `p/domain/src/{temple,schema}/**`, `p/steward/src/{inbox,temple}/**`, `p/store`, `a/cli/src/run/bell.ts`, `p/i18n` |
| PS-12d | Thầy tu: luật kích hoạt, gói bằng chứng, hợp đồng câu trả lời, việc ngoài nhịp và mana, tự thả nhân vật | 5 | PS-12b, PS-12c | `p/domain/src/{temple,schema,schedule,character}/**`, `p/runner-core/src/prompt/**` và `prompts/`, `p/chancellor/src/session.ts`, `a/cli/src/temple/**` (mới), `p/steward/src/{schedule,mana}/**`, `p/registry-default/prompts/monk.md` |
| PS-12e | Lần chạy nghiệm thu trên vương quốc thật (**tốn mana**) | 2 | PS-12d | vương quốc thật, `docs/guides/`, `docs/metrics-report.md` |

- **Thứ tự theo phụ thuộc** (đề xuất; phiên điều phối quyết): PS-12 trước. PS-12b và PS-12c song song được sau PS-12. PS-12d sau cả hai. PS-12e sau PS-12d và sau một lần `elvaria upgrade` của vương quốc thật.
- **Giá trị từng bước**: riêng PS-12 đã làm prompt của người làm nhẹ đi, ngay khi chủ nhân thêm đầu phạm vi cho các dòng đang có. PS-12b cho số đo của cả các dòng viết tay. Hai task đó có ích dù Thầy tu chưa chạy.
- **Chồng nhau**: `packages/i18n/src/glossary.json`, hai file locale, `packages/domain/src/index.ts`, `docs/schemas/**`, `docs/events.md`, `docs/cli.md`. PS-12b và PS-28c cùng chạm `packages/domain/src/metrics/**` và `apps/cli/src/metrics/**`. PS-12c và PS-12d cùng chạm `packages/domain/src/temple/**`. PS-13 sẽ chạm `packages/steward/src/sessions/prompt.ts` và `load-trace.ts` như PS-12. Nhánh merge sau giữ cả hai phía và sinh lại file sinh.
- **Mana**: PS-12, PS-12b, PS-12c, PS-12d dùng CLI giả và đồng hồ giả, 0 mana. Chỉ PS-12e tốn mana.
- **Vùng bảo vệ**: xem dòng 14 của bảng. Nếu các task này chạy như quest trên lãnh thổ Elvaria thì mỗi quest cần dấu vua.

## PS-12 — Kinh từng dòng: văn phạm, lọc theo phạm vi và dấu vết nạp

- **Mục tiêu**: một phiên chỉ nạp các dòng kinh thuộc phạm vi của nó, nhiều nhất 40 dòng, và sổ sự kiện biết phiên đã nạp dòng nào.
- **Đọc trước**: dòng 1–5, 15 ở trên; mục "Văn phạm" và "Trần 40 dòng"; `packages/steward/src/sessions/{prompt,load-trace}.ts` cùng spec; `packages/runner-core/src/prompt/{blocks,build-prompt}.ts` và các snapshot; [domain.md](../../.claude/rules/domain.md) mục schema; [lesson-sharing.md](lesson-sharing.md) mục 6 (T4) và mục 7.
- **Trước tiên**: thêm `kingdomLayout.templeScripture()` và các đường dẫn file bên cạnh vào `packages/store/src/layout.ts`, rồi bỏ hằng `TEMPLE_SCRIPTURE` của Nhiếp chính, trong commit riêng không đổi hành vi.
- **Thêm**:
  - **Parser thuần** `parseScripture(text, owner)` (`packages/domain/src/temple/parse.ts`): trả từng dòng với id (nếu có), đầu phạm vi đã đọc, câu, số dòng trong file, và danh sách chỗ sai. Parser chịu lỗi và không bao giờ làm hỏng cả file vì một dòng. Hàm `lessonTextKeyOf(text)` chuẩn hóa câu như `normalizedMemoText`. Nhiếp chính băm khóa đó và domain định dạng `T_…` (dòng 15 của bảng).
  - **Schema `lesson`** (giữ `version: 1`, chỉ thêm trường tùy chọn): `scope` (`role`, `class`, `tribe`, `os`, `territory`, `tag`, mỗi khóa một mảng), `fail_kind`, `cli_version`, `origin`. `source` thêm một giá trị cho dòng tới từ ngoài (đề xuất id `outside`). Luật: `source_verdict` bắt buộc khi `source = monk`, và `origin` bắt buộc khi `source = outside` (S4). PS-12 không có mã nào ghi `outside`. Phần mô tả của schema bỏ văn phạm comment HTML cũ. `pnpm schemas`.
  - **Lint thuần** `lintLesson(line, vocabulary)` (`temple/lint.ts`), theo T4: một dòng, câu tối đa 300 ký tự; chỉ ký tự nhìn thấy được, không thẻ hay comment HTML; không URL, không đường dẫn tuyệt đối; phạm vi hợp lệ theo registry và vương quốc; có `fail_kind`. Máy đánh dấu mà không chặn dòng nhắc tới cài gói, biến môi trường, cấu hình CLI hay địa chỉ mạng. Mỗi chỗ sai là một mã trong một union đóng, có mức `error` hay `warning`. Thiếu `fail_kind` ở dòng của chủ nhân là `warning`. Phần soát bằng mẫu `redact` nằm ở nơi gọi, vì domain không import được `eventlog`.
  - **Chọn dòng cho phiên** `selectLessons(lines, session, vocabulary)` (`temple/select.ts`, thuần): `session` gồm vai, nghề, tộc, hệ điều hành, lãnh thổ và tag của quest; `vocabulary` (`lessonVocabularyOf(registry, kingdom, territories)`) là các id mà phạm vi được nêu, vì "giá trị không có trong registry hay vương quốc" chỉ biết được khi có nó (thực tế khác kế hoạch: kế hoạch ghi hai tham số). Hàm trả `loaded` (đúng thứ tự, kinh riêng trước, nhiều nhất `SCRIPTURE_LINES_MAX`), `out_of_scope`, `unreadable` và `over_cap`. Hàm `worstLoadOf(lines, profile, vocabulary, including?)` cho luật "dòng thứ 41" nằm cùng file, để PS-12c dùng: với `including` (dòng sắp thêm), chỉ các phiên sẽ nạp dòng đó được tính.
  - **Nhiếp chính** (`sessions/prompt.ts`, `files.ts`): đọc hai file, phân tích, chọn, rồi đưa cho `buildPrompt` danh sách câu đã chọn. `PromptBase.scriptures` đổi thành danh sách dòng (tham chiếu và câu). `scriptureBlock` in mỗi dòng một mục `- <câu>`. Khung `prompts/scripture.md` và vị trí của khối giữ nguyên.
  - **Dấu vết nạp** (`schema/event/load-trace.ts`, `sessions/load-trace.ts`): thêm trường tùy chọn `lessons`, là mảng tham chiếu của các dòng đã nạp theo thứ tự. `scriptures[].lines` đổi nghĩa thành số dòng đã nạp của file đó, và file không có dòng nào được nạp thì không có mặt. Dòng event ghi trước PS-12 vẫn hợp lệ.
  - **Lệnh** (0 mana): `elvaria scripture lint` in từng chỗ sai kèm file và số dòng, thoát mã khác 0 khi có `error`. `elvaria scripture list [--character <id>]` in từng dòng với tham chiếu, phạm vi, `fail_kind` và nguồn. Với một nhân vật, lệnh in thêm dòng nào nó sẽ nạp và dòng nào bị cắt vì trần, cho phiên nặng nhất của nó (`worstLoadOf`: vai và lãnh thổ nạp nhiều nhất, quest mang mọi tag). `doctor` thêm một dòng tóm tắt lint, nhiều nhất là cảnh báo. Chuỗi `cli.scripture.*` có đủ `vi` và `en`. `pnpm docs:gen` cho `docs/cli.md`.
  - **Glossary**: thuật ngữ "Phạm vi bài học" (đề xuất id `lesson_scope`), sửa định nghĩa `lesson` và `scripture` (bài học không còn "trỏ tới một verdict" trong mọi trường hợp), thêm ghi chú cho `load_trace`.
  - **Tài liệu**: §2.3 (văn phạm mới, bảng `kingdom.schedule` đủ năm việc), §3.7 và §3.13 (kinh nạp theo phạm vi, không còn "mọi quest của nhân vật đó"), §3.16.8, [hướng dẫn vận hành](../guides/operating-a-kingdom.md) mục 11 (cách viết đầu phạm vi, ví dụ sửa hai dòng "As a Codex judge on Windows"), README của domain, steward, runner-core và cli. ADR 0027 sửa tại chỗ: "(Amended <ngày>, PS-12: phạm vi thêm vai và nghề; phiên bản CLI là nơi đo, không lọc; phạm vi và `fail_kind` nằm ở đầu dòng, file bên cạnh giữ nguồn gốc; số đếm không lưu)".
- **Không làm**: ghi vào file kinh hay file bên cạnh; lệnh hộp thư; bộ đếm; Thầy tu; lệnh xuất hay nhập; đổi chỗ của khối trong prompt.
- **Test** (0 mana):
  - Domain: mọi dạng dòng (có và không có id, có và không có đầu phạm vi, nhiều giá trị, khóa lạ, giá trị lạ, ký tự ẩn, dòng không phải mục danh sách, CRLF). Parser không throw với chuỗi bất kỳ (test theo tính chất). `selectLessons`: từng khóa lọc đúng; dòng không đọc được phạm vi không được nạp; kinh riêng đứng trước; dòng thứ 41 nằm ở `over_cap`. Lint: từng mã. Coverage 100 %.
  - Runner-core: snapshot của prompt đổi đúng ở khối `scripture`. Id và đầu phạm vi không lọt vào prompt. (Thực tế: runner-core chỉ in danh sách nó nhận, nên ca "dòng `{role=verifier}` không có trong prompt của người làm và có trong prompt của người chấm" nằm ở spec của Nhiếp chính, `steward/src/scripture-scope.spec.ts`.)
  - Steward: **dòng ngoài `scope` không vào prompt** và không vào `load_trace.lessons`. Dòng không id có tham chiếu `T_…` ổn định qua hai phiên. Phiên `--resume` không có `lessons`. File kinh trống hay vắng thì prompt và dấu vết như hôm nay.
  - CLI: `scripture lint` trên một thư mục tạm có dấu cách, cho ra đúng mã và mã thoát. `scripture list --character` khớp với thứ Nhiếp chính nạp.
  - `pnpm schemas` và `pnpm docs:gen` sạch.
- **Xong khi**: `pnpm check` xanh; các ca trên; trên một bản sao của kinh thật có thêm đầu phạm vi, prompt của người làm không còn hai dòng dành cho người chấm.
- **Chỗ chừa**: PS-12b đọc `load_trace.lessons`. PS-12c dùng `parseScripture`, `lintLesson`, `worstLoadOf` và thêm phần ghi. Bước 2 và bước 4 của lesson-sharing dùng `origin` và lint. PS-13 thêm `skills` vào cùng dấu vết.
- **Vương quốc đang chạy**: không migration. Sau `elvaria upgrade`, kinh thật vẫn nạp đủ 8 dòng cho mọi phiên như cũ, vì chưa dòng nào có đầu phạm vi. Chủ nhân thêm đầu phạm vi bằng tay khi muốn, theo hướng dẫn vận hành.

## PS-12b — Sổ đo bài học

- **Mục tiêu**: `elvaria metrics` trả lời ba câu. Loại lỗi nào đang lặp. Tỉ lệ của nó đổi thế nào theo thời gian. Mỗi dòng kinh đã đi cùng bao nhiêu lượt đạt và bao nhiêu lượt vẫn trượt đúng loại lỗi nó chữa.
- **Đọc trước**: dòng 4, 13, 14 ở trên; `packages/domain/src/metrics/{metrics-of,judgement,rework,ledger}.ts` cùng spec; `apps/cli/src/metrics/**`; mục PS-28c của [session-stamina.md](session-stamina.md) (cùng vùng code).
- **Thêm** (mọi hàm thuần, trong `packages/domain/src/metrics/`):
  - (Thực tế, PS-12b, chờ người dùng chốt, §11) **Một gói bằng chứng chung** `lessonEvidenceOf(input, window, trails?)` (`metrics/lesson-runs.ts`): mỗi lượt của người làm một bản ghi (nghề, tộc, model, lãnh thổ, tag, kết quả, `fail_kind`, phán quyết trượt đang tính, các dòng kinh đã nạp) và mỗi phiên người chấm một bản ghi (các dòng đã nạp, phán quyết của nó đứng vững hay bị lật). Bốn hàm dưới đây nhận gói này, không nhận `MetricsInput`, để cùng đồng ý một lượt là gì và đạt hay không. Một lượt là mục đầu của `attempt_log` cho mỗi số `n` (như `runJudgementsOf`); dòng mở phiên nào của nó thuộc lượt nào lấy từ `session_id` trong `attempt_log`, không thấy thì lấy `attempts` và `status` của view quest trên dòng.
  - **`lessonCountsOf`** (mục DB6). Đơn vị đếm là một **lượt** của quest. Với mỗi lượt, lấy dòng mở phiên đầu tiên của người làm và các tham chiếu trong `load_trace.lessons` của nó.
    - Lượt chưa có phán quyết quyết định thì chỉ tính vào `loads`.
      - (Thực tế, PS-12b) "Quyết định" là một phán quyết đạt hay trượt còn lại sau khi bỏ các phán quyết trượt không tính. Lượt kết thúc vì cầu dao, phiên chết hay chỉ có phán quyết `partial` thì chưa quyết định; `runJudgementsOf` coi một lượt như thế (có lượt sau) là trượt, còn sổ bài học thì không, vì nó không nói dòng kinh có tác dụng hay không. Lượt có phán quyết bị bác không còn phán quyết nào thì cũng chưa quyết định; còn một phán quyết đạt của người chấm thì là lượt đạt.
      - (Thực tế, PS-12b) Lượt không có `load_trace.lessons` (mục (q) của dòng PS-12: dòng mở phiên không mang khối `scripture`, phiên `--resume`, sổ ghi trước PS-12) là lượt không nạp dòng kinh nào: nó không cộng `loads` cho dòng nào, và với `lessonEffectOf` nó thuộc vế "trước". Vì vậy sổ ghi trước PS-12 cho bảng `lessons` rỗng và không lỗi, hai ca này là cùng một luật.
    - Lượt trượt với đúng `fail_kind` của dòng thì cộng `missed`.
    - Lượt đạt, hay trượt vì loại lỗi khác, thì cộng `helped`.
    - Phán quyết trượt bị chủ nhân đánh dấu `rejudge`, hay bị người chấm thứ hai bác qua thư phản biện, không tính là trượt.
    - Dòng không có `fail_kind` chỉ có `loads`.
    - Với dòng mà phiên **người chấm** nạp: cộng `missed` khi phán quyết của phiên đó bị lật (chủ nhân trả một lượt đã đạt, `rejudge`, hay thư phản biện thắng), cộng `helped` khi phán quyết đứng vững. (Thực tế, PS-12b) Đơn vị ở vế người chấm là một phiên: dòng mở phiên đầu của mỗi phiên người chấm, ghép với phán quyết có `session_id` đúng phiên đó. Phiên không có phán quyết đạt hay trượt (một phán quyết `partial`, phiên chết) chỉ cộng `loads`. "Bị lật" gồm phán quyết đạt mà chủ nhân đã trả lượt đó (có `rejudge` hay không, như `escapedOf`) và phán quyết trượt bị thư phản biện bác; phán quyết của máy không có phiên nên không ở vế này.
    - Kết quả cho mỗi tham chiếu: `loads`, `helped`, `missed`, ngày nạp đầu và ngày nạp cuối.
    - (Thực tế, PS-12b) Hàm là `lessonCountsOf(evidence, facts)`. `facts` là `MetricsInput.lessons` (tùy chọn): với mỗi tham chiếu, `fail_kind` và phạm vi của dòng. Kế hoạch ghi "sổ đo không đọc file kinh", nhưng `helped` và `missed` cần `fail_kind` của dòng mà dấu vết nạp không mang, nên bộ đọc `readMetricsSource` đọc hai loại file kinh bằng `lessonsIn` của Nhiếp chính (như nó đọc nhân vật cho PS-28c) và đưa vào đầu vào. Hàm thuần của domain vẫn không đọc file nào. Tham chiếu mà không file kinh nào còn giữ (chủ nhân đã xóa dòng) thì chỉ có `loads`.
  - **`failKindRatesOf`**: với từng `fail_kind`, số lượt được chấm và số lượt trượt vì loại đó, chia theo các khoảng liên tiếp, mỗi khoảng `FAIL_RATE_BUCKET_RUNS` (20) lượt được chấm, mới nhất sau cùng. Bảng này là thứ cho thấy "một `fail_kind` lặp giảm sau ít nhất 20 phán quyết".
    - (Thực tế, PS-12b) Các khoảng cắt từ lượt cũ nhất, nên một khoảng đã đầy không bao giờ đổi và khoảng mới nhất có thể chưa đầy (mỗi khoảng ghi số lượt của nó). Mỗi `fail_kind` có ít nhất một lượt trượt trong cửa sổ có một hàng, nhiều lượt trượt nhất trước; `flaky` có hàng như mọi loại.
  - **`lessonEffectOf`**: với một dòng có `fail_kind`, so tỉ lệ loại lỗi đó ở các lượt **thuộc phạm vi của dòng** trước lần nạp đầu tiên với các lượt có nạp dòng. Mỗi vế ghi số lượt. Vế sau chưa đủ 20 lượt thì kết quả là `too_early`, không phải một con số.
    - (Thực tế, PS-12b) Ba kết quả: `too_early` (vế sau dưới 20 lượt), `no_baseline` (không lượt nào thuộc phạm vi trước dòng, nên không có gì để so) và `measured` với `points`, hiệu của hai tỉ lệ trượt theo điểm phần trăm (âm là giảm). `Metrics.lessons[].effect` mang nó. Hàm trả null cho dòng không có `fail_kind`, dòng chỉ người chấm đọc (`role` có mà không có `assignee`: không có lượt người làm để đo) và dòng mà không lượt nào trong cửa sổ nạp. "Lần nạp đầu" là lúc lượt đầu tiên mang dòng bắt đầu. Phạm vi của một lượt lấy nghề và tộc từ file nhân vật (`MetricsInput.characters` thêm trường `class`, tùy chọn), lãnh thổ và tag từ quest. Sổ không ghi hệ điều hành của một lượt, nên khóa `os` không lọc ở đây; vương quốc một máy không thấy khác.
  - **`repeatedFailuresOf`**: các nhóm phán quyết trượt cùng `fail_kind` trong `TEMPLE_WINDOW_RUNS` (50) lượt được chấm gần nhất, có từ `TEMPLE_REPEAT_MIN` (3) phán quyết trở lên. Hàm bỏ `flaky` và các phán quyết không tính là trượt ở trên. Mỗi nhóm mang id phán quyết, nghề, tộc, model, lãnh thổ và tag của từng lượt, cùng các dòng kinh mà các lượt đó đã nạp. Đây là đầu vào của Thầy tu ở PS-12d.
    - (Thực tế, PS-12b) "Lượt được chấm gần nhất" là các lượt đã có phán quyết quyết định (lượt chưa quyết định không chiếm chỗ trong 50). `flaky` bị bỏ qua bảng `FAIL_KIND_CAUSES` (nguyên nhân `infra`), không phải bằng một so sánh với chữ `flaky`. Mỗi thành viên của nhóm mang id phán quyết trượt đang tính, quest, số lượt, nghề, tộc, model (của phiên đầu của lượt), lãnh thổ, tag và các dòng đã nạp; nhóm không có danh sách dòng gộp riêng.
  - `Metrics` thêm ba mục `lessons`, `fail_kinds`, `repeats`. `apps/cli/src/metrics/view-lessons.ts` in ba bảng. `docs/metrics-report.md` có ba bảng mới (`pnpm docs:gen --kingdom <dir>`).
    - (Thực tế, PS-12b) Câu của dòng nằm ở `MetricsSource.sentences` của bộ đọc, không trong `Metrics`; `metricsSections(t, metrics, sentences?)` và `renderMetricsReport(input, skipped, sentences?)` ghép nó khi in, nên `--json` chỉ có tham chiếu. Câu quá 60 ký tự bị cắt trong bảng. Các giới hạn đã biết của bảng nằm ở `view-limits.ts` (tách khỏi `view.ts`, đã chạm trần 300 dòng). Ba bảng đứng trước bảng "sau lời nhắc".
  - Glossary: "Trúng" và "Trượt" của bài học (id `helped`, `missed`), "Lỗi lặp" (đề xuất id `repeated_failure`).
  - (Mục (270) của §11, chờ người dùng chốt) **Cột "tiếp sức"** của bảng "sau lời nhắc" (mục (x) của dòng PS-28c; [session-stamina.md](session-stamina.md) đã chừa chỗ này): `AfterWrapUp.raised`, số phiên được nhắc mà `limit` trên một dòng `agent.session.usage` cao hơn lần trước của cùng phiên trên cùng thước. Đọc từ log, không đọc file nào; một phiên đổi thước thì thước mới chưa có "lần trước" nên không phải tiếp sức. Số này chỉ cho biết chủ nhân đã nâng trần khi phiên còn chạy, không phân biệt nâng sau lời nhắc hay trước. Đếm trong các phiên được nhắc và đã kết thúc; phiên được tiếp sức mà chưa bao giờ được nhắc không có hàng.
- **Không làm**: lưu số đếm vào file; ngưỡng tự gỡ dòng; đếm theo phiên bản CLI (bước nhập gói, T7); đọc file kinh trong hàm thuần. Hàm thuần của sổ đo chỉ đọc quest, phán quyết, event, lệnh, nhân vật và `fail_kind` cùng phạm vi của từng dòng do bộ đọc đưa vào (xem trên). Câu của một dòng do lệnh CLI ghép từ file kinh khi in.
- **Test** (0 mana): bộ fixture dựng tay của `metrics/__fixtures__`. Mỗi luật đếm ở trên có một ca. Lượt có hai phiên của người làm chỉ đếm một lần. Sổ ghi trước PS-12 (không có `lessons`) cho bảng rỗng và không lỗi. `failKindRatesOf` với 40 lượt cho hai khoảng. `lessonEffectOf` trả `too_early` ở 19 lượt và một con số ở 20. `repeatedFailuresOf` bỏ `flaky` và `rejudge`. Coverage 100 %. Ở CLI: `metrics` in ba bảng và nói rõ khi chưa có dữ liệu.
  - (Thực tế, PS-12b) Fixture là `metrics/__fixtures__/lessons.ts` (một quest một lượt cho một thế giới nhiều lượt, dòng mở phiên, bằng chứng dựng tay). Test của domain nằm ở `lesson-runs`, `lesson-rulings`, `lesson-counts`, `lesson-effect`, `fail-kind-rates`, `repeated-failures` và `lesson-ledger` (qua `metricsOf`) cùng ca `raised` ở `after-wrap-up.spec.ts`; test của CLI ở `view-lessons.spec.ts` (bảng dựng tay) và `view-lessons-command.spec.ts` (lệnh trên một vương quốc có file kinh).
- **Xong khi**: `pnpm check` xanh; các ca trên; `elvaria metrics` trên một bản sao của vương quốc thật in được bảng `fail_kinds` và `repeats` từ 171 phán quyết đã có (bảng `lessons` còn rỗng vì chưa phiên nào ghi dấu vết theo dòng).
- **Chỗ chừa**: PS-12d lấy `repeatedFailuresOf` và `lessonCountsOf` làm gói bằng chứng. PS-12e đọc `failKindRatesOf` và `lessonEffectOf`. PS-17 (thao trường) dùng cùng các số này cho một biến thể.

## PS-12c — Thao tác kinh từng dòng do Nhiếp chính áp

- **Mục tiêu**: mọi thay đổi của máy lên kinh là một thao tác trên một dòng, có nguồn, được Nhiếp chính kiểm bằng hàm thuần rồi mới ghi. Thao tác sai bị từ chối kèm lý do.
- **Đọc trước**: dòng 1, 11, 14–16 ở trên; mục "Trần 40 dòng" và "Thang sửa lỗi"; `packages/steward/src/inbox/apply.ts` và `memos/{file,advisory}.ts`; `packages/domain/src/schema/command/**`; mẫu "Event mới" và "Lệnh hộp thư mới" ở [phase-1.5.md](phase-1.5.md); [cli.md](../../.claude/rules/cli.md).
- **Thêm**:
  - **Hợp đồng `scripture`** v1 (`packages/domain/src/schema/lesson/scripture.ts`): file bên cạnh `{version: 1, lessons: [...]}`, mỗi mục gồm `id`, `source`, `source_verdict`, `origin`, `cli_version`, `added_at`, `merged_from`, và `retired` (`at`, `by`, `text`, `merged_into`). `packages/store` thêm phần đọc và ghi nguyên tử cho hai file. Fixture và ví dụ theo ADR 0003. (Thực tế, §11 PS-12c) `retired` còn có `why` và `command` (id của tờ trình đã gỡ, để lệnh áp lại không gỡ hai lần); `by` là `monk` hay `user` (dành cho lệnh của chủ nhân, DB15); `cli_version` chỉ có khi phạm vi nêu đúng một tộc; `added_at` là ngày giờ. Store có `scriptures.read`, `writeLedger`, `writeText`; `elvaria migrate` đi qua mọi sổ kinh như các hợp đồng khác.
  - **Thao tác** (`schema/temple/operation.ts`), union đóng theo `op`:
    - `add`: `owner` (`temple` hay một nhân vật), `scope`, `fail_kind`, `text`, `source_verdict`;
    - `retire`: `lesson`, `why`;
    - `merge`: `lessons` (từ hai id), cùng các trường của `add` cho dòng thay thế.
  - **Lệnh hộp thư `temple_report`** với `source: monk` (thêm `monk` vào `COMMAND_SOURCES`). Payload gồm `operations` (tối đa `SCRIPTURE_LINES_MAX` mục; luật thuần ở dưới quyết phần còn lại) và `letters` (tối đa 6). (Thực tế) Payload có thêm `character`, nhân vật Thầy tu viết tờ trình: thư cần `from`, và Nhiếp chính từ chối cả lệnh khi đó không phải nhân vật (`unknown_character`) hay không thuộc nghề `is_monk` (`not_monk`); tờ trình phải có ít nhất một thao tác hay một thư; `to` của thư phải khớp bậc (`model` tới chủ nhân, ba bậc kia tới Tể tướng). Mỗi thư có `rung`, `to` (`chancellor` hay `owner`), `source_verdict`, `body`, `refs`. Đây là thêm tương thích, lệnh vẫn `version: 1`.
  - **Luật thuần** (`packages/domain/src/temple/edit.ts`), trả `Result`:
    - `templeReportIssues(report, state)` (mục DB7, sửa sau lời chốt; thực tế nhận `operations` và các file kinh): cả lệnh bị từ chối với mã `replaces_scripture` khi nó phạm một trong hai luật. Luật thứ nhất: `add` và `merge` cùng tạo ra nhiều nhất `TEMPLE_ADDS_MAX` (3) dòng mới, theo "tối đa 3 bài học mỗi lần" của kế hoạch sản phẩm. Luật thứ hai: trong một file, số dòng bị lấy đi (bị `retire`, hay là dòng cũ của một `merge`) không quá nửa số dòng của Thầy tu đang có trong file đó, và luôn được ít nhất `TEMPLE_REMOVALS_FLOOR` (2) dòng, để một lần gộp hai dòng lúc nào cũng làm được. Schema không có `op` nào thay cả file.
    - `scriptureEditOf(state, operation, facts)`: từ chối từng thao tác với một mã. `no_source_verdict`: `add` hay `merge` thiếu `source_verdict`. `unknown_verdict`: phán quyết không tồn tại hay không phải phán quyết trượt. `unknown_lesson`: id không có trong file. `not_monk_lesson`: `retire` hay `merge` một dòng không do Thầy tu viết. `over_cap`: dòng thứ 41. `lint`: dòng trượt `lintLesson` ở mức `error`, thiếu `fail_kind`, hay khớp mẫu `redact`. `duplicate`: câu đã có sau khi chuẩn hóa. (Thực tế) Thêm `unknown_owner` (kinh của người không có trong vương quốc); `lint` mang danh sách mã lint; `duplicate` so với kinh của chủ dòng và kinh chung (dòng của kinh chung thì so với mọi kinh); `over_cap` cân các nhân vật có nghề nhận quest (Thầy tu, Tể tướng không nạp kinh), nhân vật bị đình chỉ chỉ khi dòng thuộc kinh riêng của nó. Thao tác mà Nhiếp chính đã bắt đầu ghi trước khi dừng (sổ đã có id của dòng mới, hay dòng đã gỡ mang id lệnh này) được làm nốt mà không kiểm lại các luật phụ thuộc kinh lúc đó.
    - `formatLessonLine(lesson)`: dạng chữ của một dòng, để `parseScripture(formatLessonLine(x))` trả lại `x`.
  - **Nhiếp chính áp** (`packages/steward/src/temple/apply.ts`, gọi từ `inbox/apply.ts`), theo thứ tự của lệnh:
    - `add`: nối một dòng vào cuối file Markdown, có id mới từ `IdSource.lesson()`, rồi ghi mục vào file bên cạnh với `cli_version` là `tool.checked_version` của tộc trong phạm vi. (Thực tế) Id băm từ id của lệnh và vị trí thao tác (`lessonIdOf`, như id của thư), để lệnh áp lại cho đúng id cũ; Nhiếp chính ghi sổ trước, Markdown sau, dòng event sau cùng, nên một lần dừng giữa chừng luôn để lại dấu cho lần áp kế làm nốt.
    - `retire`: xóa dòng khỏi Markdown và ghi `retired` kèm câu lúc gỡ vào file bên cạnh.
    - `merge`: gỡ các dòng cũ với `merged_into`, rồi thêm dòng mới với `merged_from`.
    - Nhiếp chính đọc lại file ngay trước khi ghi và ghi nguyên tử. Dòng của chủ nhân không bao giờ bị đổi. Mọi dòng khác trong file giữ nguyên từng ký tự.
    - Mỗi thư thành một `memos/<id>.json` kiểu `proposal`: `from` là nhân vật Thầy tu, `quest` và `attempt` lấy từ `source_verdict`, id băm từ quest, kiểu và nội dung như mọi thư, nên lệnh chạy lại không lập thư hai lần. Thư `to: owner` hiện trong bản tấu là mục `memo`. Phiên làm task sửa `memoKindOf` để thư tới chủ nhân mà không phải thư phản biện không hiện thành `objection` (dòng 11 của bảng). (Thực tế) Thư tới chủ nhân không có `refusal` là mục `memo`; thư có phán quyết đã mất hay không phải phán quyết trượt bị bỏ kèm cảnh báo.
  - **Event**: `lesson.added` (`lesson`, `owner`, `scope`, `fail_kind`, `source`, `source_verdict`, `merged_from`), `lesson.retired` (`lesson`, `owner`, `by`, `why`, `merged_into`), `lesson.refused` (`op`, `code`, và `lesson` khi có; thực tế thêm `issues` khi `code = lint`; tờ trình bị từ chối cả chỉ có `command.rejected`). Cả ba do Nhiếp chính ghi. Thư dùng `memo.filed` và `memo.routed` đã có. `docs/events.md`, bảng `events` của glossary, dòng mẫu ở `packages/eventlog/src/migrations/v1.jsonl`.
  - **Chuông**: một loại `Notice` mới (đề xuất `temple`) mang số dòng thêm, gỡ, bị từ chối và số thư. Chuông rung một lần cho mỗi lệnh, kèm dòng chữ của nó ở `apps/cli/src/run/bell.ts`.
  - **Tài liệu**: §2.2 (hai file bên cạnh), §2.3, §3.16.8, glossary (thuật ngữ cho file bên cạnh, đề xuất "Sổ kinh", id `scripture_ledger`; "Tờ trình của Đền", id `temple_report`), README của domain, steward, store.
- **Không làm**: phiên model; luật kích hoạt; lệnh CLI cho chủ nhân thêm hay gỡ dòng (chủ nhân sửa file); thăng một dòng từ kinh riêng lên kinh chung tự động; ghi địa chí; bí kíp.
- **Test** (0 mana; lệnh viết tay trong test, thư mục tạm có dấu cách):
  - **Thao tác thay cả tập bị từ chối**: lệnh gỡ mọi dòng rồi thêm lại bị từ chối nguyên lệnh với `replaces_scripture`, và file không đổi một byte. `op: 'replace'` không qua schema của hộp thư.
  - **Bài học không có `source_verdict` bị từ chối** (`no_source_verdict`). Phán quyết không tồn tại hay là phán quyết đạt thì `unknown_verdict`.
  - **Dòng thứ 41 bị từ chối**: kinh có 40 dòng nạp cho một nhân vật thì `add` thêm một dòng cùng phạm vi bị `over_cap`. `add` một dòng cho tộc khác vẫn qua. Sau một `merge` hai dòng thì `add` qua.
  - `retire` một dòng của chủ nhân bị `not_monk_lesson`. `add` một dòng có URL, có ký tự ẩn hay khớp mẫu secret bị `lint`.
  - Sau `add`: Markdown có đúng một dòng mới ở cuối, các dòng khác nguyên vẹn, file bên cạnh qua schema, có `lesson.added`, và phiên kế nạp dòng đó nếu thuộc phạm vi.
  - Chủ nhân sửa file giữa lúc lệnh nằm trong hộp thư: thao tác áp trên bản mới nhất. Chủ nhân xóa một dòng của Thầy tu: lần đọc kế coi mục bên cạnh là dòng đã bị chủ nhân gỡ, không lỗi.
  - Lệnh áp hai lần (Nhiếp chính dừng giữa chừng rồi chạy lại) không thêm dòng hai lần và không lập thư hai lần.
  - Thư bậc 1–3 tới Tể tướng, thư bậc 6 tới chủ nhân, cả hai có mặt trong `attentionQueue` với đúng loại mục.
  - Domain coverage 100 %. `pnpm schemas` và `pnpm docs:gen` sạch.
- **Xong khi**: `pnpm check` xanh; các ca trên.
- **Chỗ chừa**: PS-12d là người viết lệnh. Bước 4 của lesson-sharing (nhập gói) thêm một `source` khác cho cùng thao tác `add`, với `origin` thay cho `source_verdict`. PS-13 thêm thao tác trên bí kíp cho bậc 4.
- **Vương quốc đang chạy**: không migration. File bên cạnh chỉ xuất hiện khi có thao tác đầu tiên. `elvaria upgrade` đã sao lưu `temple/`.

## PS-12d — Thầy tu: việc của Đền và phiên model

**Chia** (mục (281) của §11, 2026-11-19): mục này làm thành ba task. **PS-12d** là phần thuần: luật kích hoạt,
gói bằng chứng, hợp đồng `temple-reply` cùng hàm kiểm, `templeCommands`, event `temple.ran` trong sổ mana và
`elvaria temple evidence`. **PS-12f** (sau PS-12d) là phiên Thầy tu: việc ngoài nhịp, prompt, mở phiên, `elvaria
temple run` và lúc ghi `temple.ran`. **PS-12g** (song song với PS-12d) là tự thả nhân vật và mục bản tấu khi Đền
không chạy được. Phần "Tài liệu" và "Test" dưới đây đi theo task của phần chúng nói tới.

**Thực tế PS-12d** (2026-11-19, dòng PS-12d của [§11](../implementation-plan/11-2026-11-19.md)): `templeDue` đọc
`templeLogOf(events)` (lượt được chấm, lượt trượt và các lần đình chỉ do Nhiếp chính ghi kể từ `temple.ran` gần nhất);
gói bằng chứng ở `temple/evidence.ts`, câu trả lời ở `schema/temple/reply.ts` cùng `temple/reply.ts`
(`templeReplyIssues`, `templeCommands`). Một quyết định bậc `scripture` có thể mang `replaces` (hai dòng của Thầy tu trở
lên), thành thao tác `merge`. `elvaria temple evidence` có `--json`.

- **Mục tiêu**: khi bằng chứng đã đủ và Đền được bật, một phiên Thầy tu đọc các lỗi lặp cùng số đo rồi trả mỗi lỗi một quyết định có bậc. Mỗi lần chạy tốn nhiều nhất một phiên có trần.
- **Đọc trước**: dòng 6–12 ở trên; `apps/cli/src/triage/**`, `apps/cli/src/say/hearing.ts`, `packages/chancellor/src/{session,triage-memos}.ts`; `packages/steward/src/schedule/**`; `packages/steward/src/mana/book.ts`; [§3.5](../implementation-plan/3.5-mana.md); [runner.md](../../.claude/rules/runner.md) mục structured output của Codex và agy.
- **Thêm**:
  - **Luật kích hoạt thuần** `templeDue` (`packages/domain/src/temple/due.ts`; mục DB9, sửa sau lời chốt). Đền tới hạn khi `schedule.temple.enabled` bật và một trong ba điều đúng:
    - đã có từ `every_quests` lượt được chấm kể từ lần `temple.ran` gần nhất, tính trên cả vương quốc;
    - `weekly` bật, đã qua 7 ngày, và có ít nhất một phán quyết trượt mới;
    - một nhân vật bị đình chỉ vì chuỗi trượt mà chưa lần `temple.ran` nào xét lần đình chỉ đó.

    Hai điều kiện đầu chạy nhiều nhất một lần mỗi ngày. Điều kiện đình chỉ không theo trần đó: Thầy tu chạy ngay khi tộc của nó rảnh, mỗi lần đình chỉ một lần chạy, để nhân vật không phải chờ tới hôm sau.
  - **Tự thả nhân vật** (mục DB13, chủ nhân chốt làm ở task này). Luật thuần `templeReleasesOf` (`packages/domain/src/temple/release.ts`): một nhân vật bị đình chỉ **vì chuỗi trượt** được thả khi một thao tác `add` hay `merge` của Thầy tu đã được áp, dòng mới mang đúng `fail_kind` của chuỗi trượt, và phiên kế của nhân vật sẽ nạp dòng đó (kinh riêng của nó, hay kinh chung có phạm vi khớp). Nhiếp chính phát `temple_done` của máy trạng thái nhân vật ngay sau khi áp lệnh `temple_report`, rồi rung chuông. Nhân vật ở lại chờ chủ nhân khi Thầy tu chọn bậc 1–3 hay bậc 6 cho lỗi của nó, khi thao tác bị từ chối, hay khi nó bị đình chỉ bằng lệnh `suspend` của chủ nhân. Lý do: thả một nhân vật mà lỗi của nó cần một check hay một quyền mới thì nó trượt lại đúng lỗi cũ. Bản tấu nêu nhân vật còn chờ kèm thư của Thầy tu. Phiên làm task đọc `packages/domain/src/character/{transitions,transition,fail-streak}.ts` cùng spec trước khi sửa, và kiểm cách phân biệt đình chỉ vì chuỗi trượt với đình chỉ do chủ nhân.
  - **Mục bản tấu khi Đền không chạy được** (mục DB10, sửa sau lời chốt): khi Đền tắt hay vương quốc chưa có nhân vật Thầy tu mà có lỗi lặp đang chờ, bản tấu có một mục chờ được (đề xuất `temple_waiting`) nêu số lỗi lặp, vì sao Đền không chạy, và lệnh để bật. Nhiếp chính đếm số nhóm lúc viết bản tấu, 0 mana. (Thực tế PS-12g, chờ chủ nhân chốt: bảng chú ý cho mỗi kind một lệnh tĩnh, mà bật Đền là sửa tay `kingdom.json`, không có lệnh `elvaria`, nên mục là một trong hai kind: `temple_no_monk` khi không có Thầy tu chưa bị đình chỉ, lệnh `character add` với nghề Thầy tu đầu tiên của registry, dòng nêu cả khi Đền cũng tắt; `temple_off` khi có Thầy tu mà Đền tắt, không có dòng lệnh, lời khuyên ghi đoạn `kingdom.json` cần thêm và nói bật thì tốn mana. Nhân vật còn chờ là kind `character_suspended`.)
  - **Việc ngoài nhịp** theo dạng `OnCallJob` (`apps/cli/src/temple/job.ts`, đưa vào `StewardDeps.onCall`). `ready` đòi: tới hạn; có một nhân vật nghề `is_monk` chưa bị đình chỉ; tộc của nó không bị giữ, không có phiên nào đang chạy và bể mana của nó đang mở. `JobView` thêm phần Nhiếp chính đếm sẵn từ sổ, để `ready` không đọc lại mọi phán quyết ở mỗi nhịp. Việc của Đền không giữ chỗ tộc như phân loại thư: nó chờ tới khi tộc rảnh.
  - **Gói bằng chứng thuần** `templeEvidenceOf` (`temple/evidence.ts`): các nhóm của `repeatedFailuresOf`, mỗi nhóm kèm ghi chú của từng phán quyết cắt ở `TEMPLE_NOTES_MAX_CHARS` (600). Gói còn có các dòng kinh đang có kèm phạm vi và `loads`, `helped`, `missed`; tên các check của từng lãnh thổ; danh sách script của catalog; và các dòng của Thầy tu đáng xét gỡ (có từ 20 lượt nạp mà `missed` không ít hơn `helped`). Gói có trần ký tự: số nhỏ hơn giữa `TEMPLE_PROMPT_MAX_CHARS` (24 000) và `prompt_max_chars` của tộc. Nhóm lặp nhiều nhất được giữ trước. Gói không có nhóm nào và không có dòng nào cần xét thì **không gọi model**. Ghi chú đi qua `redact` ở nơi gọi.
  - **Hợp đồng câu trả lời `temple-reply`** v1 (`schema/temple/reply.ts`): `decisions[]`, mỗi quyết định có `group`, `rung` (`prevent`, `check`, `script`, `knowledge`, `scripture`, `model`, hoặc `none` khi bằng chứng chưa đủ), `why`, và đúng một trong hai thứ `letter` hay `lesson`; `reviews[]` cho các dòng đáng xét (`keep` hay `retire`). Hàm kiểm thuần: mỗi nhóm của gói được quyết đúng một lần; không nhóm nào ngoài gói; bậc và thứ đi kèm khớp nhau theo bảng "Thang sửa lỗi"; `source_verdict` thuộc nhóm; nhiều nhất `TEMPLE_ADDS_MAX` dòng mới. Schema gửi cho CLI theo đúng các luật của từng tộc (`forTheCli` cho Claude, `strictSchemaOf` cho Codex).
  - **`templeCommands`** thuần: từ câu trả lời đã kiểm ra đúng một lệnh `temple_report`.
  - **Prompt**: mẫu mới `packages/runner-core/prompts/temple.md` cùng hàm `buildTemplePrompt` (thang sửa lỗi, luật L5, cách viết phạm vi, gói bằng chứng). `packages/registry-default/prompts/monk.md` sửa cho khớp: Thầy tu chọn bậc trước khi viết một dòng, và không gỡ dòng của chủ nhân. Phiên có vai `monk`, không có tool nào, một lượt hỏi. Trần phút và trần lượt là hằng riêng của Đền.
  - **Mở phiên**: tách phần chung của `hear` (`packages/chancellor/src/session.ts`) để nhận vai và trần từ ngoài. Nếu ranh giới gói không cho thì đặt phần chung ở `runner-core`. Không thêm package mới và không sửa `boundaries.mjs`.
  - **Event `temple.ran`**: `trigger` (`quests`, `weekly`, `suspension`, `owner`), `day`, `groups`, `operations`, `letters`, và khi có phiên thì `tribe`, `model`, `tokens`, `session`. Lần chạy không gọi model cũng ghi dòng này, để bộ đếm `every_quests` bắt đầu lại. `OUTSIDE_LINES` của `steward/src/mana/book.ts` thêm type này (mục DB10). Câu comment ở `domain/src/mana/estimate.ts` nêu tên ba dòng: đây là file trong danh sách "Đọc trước khi sửa", commit nói rõ chỉ đổi comment.
  - **Lệnh**: `elvaria temple evidence` in gói bằng chứng và nói vì sao Đền tới hạn hay chưa (0 mana). `elvaria temple run` chạy một lần ngay (**tốn mana**), như `elvaria triage`. `kingdom.schedule.temple` thêm phần mô tả trong schema, nói rõ bật thì tốn mana.
  - **Tài liệu**: §3.16.3 và §3.16.8, §3.5 (phiên của Đền trong ước lượng mana), §9 (bỏ "Monk, parser/writer bài học" khỏi giai đoạn 5), [hướng dẫn vận hành](../guides/operating-a-kingdom.md) (bật Đền, thêm nhân vật Thầy tu, đọc thư của Đền), glossary ("Thang sửa lỗi" với sáu bậc, đề xuất id `fix_ladder`; event `temple.ran`), README của chancellor, cli, steward.
- **Không làm**: cho Thầy tu tool đọc file; đọc journal (mục DB16); phiên riêng cho từng nhân vật; thả nhân vật do chủ nhân đình chỉ; lệnh `send_to_temple`; bí kíp; tính ngay token của phiên ngoài quest ((256)(ii)).
- **Test** (CLI giả, đồng hồ giả, 0 mana):
  - `templeDue`: từng điều kiện; hai điều kiện theo số lượt và theo tuần không quá một lần mỗi ngày; một lần đình chỉ sau khi Đền đã chạy hôm đó vẫn làm Đền tới hạn, đúng một lần; tắt thì không bao giờ tới hạn; đồng hồ lùi không chạy lại.
  - Tự thả: nhân vật bị đình chỉ vì chuỗi trượt `tests_fail` được thả ngay sau khi dòng kinh mang `fail_kind=tests_fail` thuộc phạm vi của nó được áp, và chuỗi trượt về 0. Nó ở lại khi Thầy tu trả `rung: check`, khi thao tác bị từ chối, khi dòng mới không thuộc phạm vi của nó, và khi chủ nhân là người đình chỉ. Bản tấu nêu nhân vật còn chờ.
  - Đền tắt, hay không có nhân vật Thầy tu, mà có hai nhóm lỗi lặp: bản tấu có đúng một mục chờ được nêu số 2 và lệnh bật (thực tế PS-12g: với `temple_off` lệnh bật nằm trong lời khuyên). Không có lỗi lặp thì không có mục nào.
  - Gói bằng chứng: cắt đúng trần của tộc; nhóm lặp nhiều nhất còn lại; ghi chú đã che secret; gói rỗng thì không có phiên, vẫn có `temple.ran` với 0 token.
  - **Lỗi chặn được bằng check thành thư `proposal`, không thành kinh**: CLI giả trả `rung: check` cho một nhóm. Sau hai nhịp có một thư `proposal` tới Tể tướng và không có dòng kinh nào mới. Câu trả lời `rung: check` kèm `lesson` bị từ chối ở bước kiểm, phiên được thử lại một lần, và việc hỏng thì không ghi lệnh nào.
  - Câu trả lời `rung: scripture` cho ra một lệnh `temple_report`. Sau nhịp kế, dòng có trong kinh với đúng phạm vi, và phiên kế của nhân vật thuộc phạm vi nạp nó.
  - Thầy tu ở tộc không có structured output trả JSON trong chữ: lần đầu sai, lần hai đúng, cả hai phiên được cộng token.
  - Tộc của Thầy tu đang có phiên, bị giữ vì phiên bản CLI, hay bể đã đóng: việc chờ và không chặn tộc nhận quest. Không có nhân vật Thầy tu: in một lần, không phiên.
  - Nhiếp chính dừng giữa phiên: phiên bị giết, không có `temple.ran`, lần khởi động kế chạy lại.
  - `temple.ran` có token được ước lượng mana tính từ lần khởi động kế.
  - Hợp đồng `temple-reply` qua CLI giả của cả ba tộc (schema chặt của Codex).
- **Xong khi**: `pnpm check` xanh; các ca trên; `elvaria temple evidence` trên một bản sao của vương quốc thật in được các nhóm lỗi lặp.
- **Chỗ chừa**: giai đoạn 5 thêm đầu ra "đáng gửi lên" cho dòng đã đo là có ích và không có phạm vi lãnh thổ, cùng việc viết bí kíp. PS-15 dùng cùng việc này cho `fail_kind: style`. PS-17 chạy thử một dòng của Thầy tu trước khi dùng thật.
- **Hệ điều hành**: task chạm đường mở phiên của ba tộc, nên báo cáo nêu để chủ nhân quyết có chạy CI ba hệ điều hành không.

## PS-12e — Lần chạy nghiệm thu trên vương quốc thật (tốn mana)

- **Mục tiêu**: trên vương quốc thật, một `fail_kind` lặp giảm thấy được trên sổ đo sau ít nhất 20 phán quyết kể từ khi dòng kinh tương ứng được nạp.
- **Ai làm**: phiên điều phối cùng chủ nhân. Đây không phải quest của nhân vật.
- **Các bước**:
  1. `elvaria upgrade` lên bản có PS-12d.
  2. Sửa 8 dòng của kinh thật cho có đầu phạm vi và `fail_kind`, có sao lưu, rồi `elvaria scripture lint` sạch.
  3. Thêm một nhân vật nghề `monk` (mục DB11).
  4. Ghi lại bảng `fail_kinds` làm mốc.
  5. Chạy `elvaria temple evidence`, rồi `elvaria temple run` một lần có người nhìn.
  6. Bật `schedule.temple.enabled`.
  7. Sau ít nhất 20 lượt được chấm có nạp dòng mới, đọc `lessonEffectOf` và bảng `fail_kinds`.
- **Kết quả ghi lại**: một báo cáo ngắn trong `docs/guides/`, gồm từng quyết định của Thầy tu theo bậc, số thư, số dòng, token của từng lần chạy, bảng trước và sau, và các lỗ hổng tìm được; `docs/metrics-report.md` sinh lại; một dòng §11.
- **Trần mana** (mục DB12): `elvaria temple run` đầu tiên một phiên. Sau đó Đền chạy nhiều nhất một lần mỗi ngày, cộng một lần cho mỗi lần đình chỉ. Ước lượng: mỗi lần khoảng 10 000 token đầu vào trên một model rẻ (gói tối đa 24 000 ký tự), đầu ra dưới 2 000 token. Con số thật do lần chạy này đo.
- **Xong khi**: báo cáo có bảng trước và sau với ít nhất 20 lượt ở vế sau. Nếu tỉ lệ không giảm thì báo cáo nói vậy, và dòng kinh đi vào danh sách đáng xét gỡ. Kết quả đó vẫn là xong: điều kiện là số đo trả lời được câu hỏi, không phải câu trả lời phải đẹp.

## Chỗ kế hoạch cũ khác code

Mười bốn chỗ dưới đây cần đọc chính xác hơn khi làm. Không chỗ nào đổi một ADR. Các chỗ đổi câu chữ của §3.16.8 nằm trong mục DB tương ứng.

1. **"`ScheduledJob` của thầy tu"** (§3.16.8): `schedule.temple` không có giờ và không nằm trong `DAILY_JOBS`, nên việc của Đền là việc gọi theo điều kiện, với event `temple.ran` thay cho `schedule.ran` (dòng 7 của bảng).
2. **"Kích hoạt như kế hoạch sản phẩm mục 6"**: mục 6 viết "mỗi 10 quest của một nhân vật", còn `every_quests` là một số của cả vương quốc. Bản đầu đếm trên cả vương quốc và chạy một phiên cho mọi bằng chứng mới (mục DB9).
3. **"Đầu vào: verdict theo `fail_kind`, sổ đo, journal"**: journal chủ yếu là dòng tool, và prompt của tộc mặc định của Thầy tu bị giới hạn 26 000 ký tự trên Windows. Bản đầu không đưa journal vào (mục DB16).
4. **"Siêu dữ liệu của từng dòng (`source_verdict`, `scope`, `helped`, `missed`, ngày) nằm ở file bên cạnh"**: L5 và hướng dẫn vận hành đặt phạm vi ở đầu dòng để chủ nhân viết tay được, còn số đếm là giá trị suy ra. File bên cạnh chỉ giữ nguồn gốc và ngày (mục DB2, DB6).
5. **Văn phạm trong schema `lesson` v1** đặt `verdict=`, `hit=`, `retired=` trong một comment HTML cuối dòng. ADR 0027 đã chuyển siêu dữ liệu ra file bên cạnh, và T4 cấm comment HTML trong một dòng. Văn phạm mới bỏ comment.
6. **"Bài học không có `source_verdict` bị từ chối"** (§8): kế hoạch sản phẩm, sau (161), chỉ đòi `source_verdict` với bài học của Thầy tu. Luật đúng là Nhiếp chính từ chối thao tác `add` hay `merge` thiếu `source_verdict`. Dòng chủ nhân viết tay không cần.
7. **"Lọc theo `scope` khi dựng prompt" chạm `p/runner-core/src/prompt/**`** (§8): quyết định lọc là hàm thuần của domain, do Nhiếp chính gọi. Runner-core chỉ đổi cách in khối.
8. **"Trần 40 dòng giữ nguyên"**: kế hoạch sản phẩm nói "kinh riêng ≤ 40 dòng", và schema nói theo. Với phạm vi theo tộc, hệ điều hành và vai, trần hợp lý là trần của một phiên (mục DB4).
9. **"Bài học 3 mùa không trúng thì gỡ"**: "mùa" chưa có độ dài máy đọc được. Bản đầu chỉ gỡ theo số đo (mục DB14).
10. **§3.13** viết kinh được nạp cho "mọi quest của nhân vật đó". Sau PS-12 câu đúng là "mọi quest thuộc phạm vi của dòng".
11. **§2.3**: bảng `kingdom.schedule` chỉ liệt kê `chronicle`, `temple`, `patrol`, trong khi schema có năm việc. **§9**: dòng về giai đoạn 5 còn ghi "Monk (`ScheduledJob`), parser/writer bài học".
12. **Dấu vết nạp** không có ở phiên theo sau trong một lượt và ở phiên `--resume`, nên số đếm tính theo lượt, không theo phiên (dòng 4 của bảng).
13. **Đình chỉ về Đền**: `temple_done` chưa có ai phát và `send_to_temple` bị từ chối. "Đền" trong tên đình chỉ hôm nay chỉ là tên gọi (dòng 12 của bảng). PS-12d phát `temple_done` theo mục DB13; `send_to_temple` vẫn chưa làm.
14. **Token của việc theo lịch**: §3.5 viết việc theo lịch tính vào mana, nhưng phiên ngoài quest chỉ được tính từ lần khởi động kế của Nhiếp chính ((256)(ii)).

## Event, schema, glossary và i18n cần thêm

| Loại | Thêm | Task |
|---|---|---|
| Schema | `lesson` thêm `scope`, `fail_kind`, `cli_version`, `origin`, giá trị `source` mới; `load_trace.lessons` | PS-12 |
| Schema | hợp đồng `scripture` (file bên cạnh); thao tác kinh; lệnh `temple_report`; `COMMAND_SOURCES` thêm `monk` | PS-12c |
| Schema | hợp đồng `temple-reply`; phần mô tả của `kingdom.schedule.temple` | PS-12d |
| Event | `lesson.added`, `lesson.retired`, `lesson.refused` | PS-12c |
| Event | `temple.ran` | PS-12d |
| Glossary | `lesson_scope`; sửa `lesson`, `scripture`, `load_trace` | PS-12 |
| Glossary | `helped`, `missed`, `repeated_failure` | PS-12b |
| Glossary | `scripture_ledger`, `temple_report`, ba event | PS-12c |
| Glossary | `fix_ladder` cùng sáu bậc, event `temple.ran` | PS-12d |
| i18n | `cli.scripture.*` | PS-12 |
| i18n | chuỗi của ba bảng sổ đo | PS-12b |
| i18n | dòng chuông của `Notice` mới | PS-12c |
| i18n | `cli.temple.*` | PS-12d |
| ADR | 0027 sửa tại chỗ ("Amended", theo [lesson-sharing.md](lesson-sharing.md) mục 10) | PS-12 |

## Quyết định (chủ nhân chốt 2026-11-19)

Mỗi mục có một khuyến nghị. Mục nào tốn mana thì ghi rõ.

**Lời chốt ngày 2026-11-19**, trong phiên kế hoạch, qua hai lượt. Lượt đầu (hộp hỏi đáp): chủ nhân nhận **DB5**, **DB8** và **DB11** theo khuyến nghị, và trả lời "chưa chốt" cho tám mục phải chốt còn lại. Lượt hai, sau khi hỏi vì sao có trần 3 thêm, 3 gỡ, 2 gộp và Đền tắt mặc định thì có lỡ việc không, chủ nhân chốt:

- **DB7** giao phiên kế hoạch đề xuất lại trần cho hợp. Trần mới: mỗi lần nhiều nhất 3 dòng mới (tính cả dòng thay thế của một lần gộp), và trong một file không lấy đi quá nửa số dòng của Thầy tu, nhưng luôn được ít nhất 2 dòng. Hai trần "3 gỡ" và "2 gộp" bỏ.
- **DB9** nhận, có sửa: trần một lần mỗi ngày chỉ áp cho kích hoạt theo số lượt và theo tuần. Đình chỉ thì Thầy tu chạy ngay khi tộc rảnh.
- **DB10** nhận, có sửa: khi Đền tắt hay chưa có nhân vật Thầy tu mà có lỗi lặp đang chờ, bản tấu có một mục chờ được, 0 mana.
- **DB13** chủ nhân chọn **tự thả**, khác khuyến nghị "chưa làm": việc đó vào PS-12d, theo luật ở mục của task. Lệnh `send_to_temple` vẫn chưa làm.
- **DB1–DB4, DB6, DB12, DB14–DB17**: "còn lại chốt hết", tức là theo khuyến nghị dưới đây.

Các gạch đầu dòng dưới đây giữ chữ lúc hỏi. Chỗ nào lời chốt đổi thì đoạn trên và mục của task là bản đúng.

**Cần trước khi mở task** (ghi task liên quan):

- **DB1** (mọi task) Cách chia và id: PS-12, PS-12b, PS-12c, PS-12d, PS-12e như bảng ở "Tổng quan". Khuyến nghị: nhận. Lý do: mỗi task vừa một context và không task nào quá 4 ý. Lần chạy thật đứng riêng để bốn task code đóng được mà không chờ 20 phán quyết.
- **DB2** (PS-12) Văn phạm: `- [id] {đầu phạm vi} câu`. Phạm vi và `fail_kind` nằm ở đầu dòng trong Markdown. File bên cạnh `scripture.json` chỉ giữ nguồn gốc và ngày. Khuyến nghị: nhận. Chỗ này khác câu chữ của §3.16.8 (phạm vi ở file bên cạnh). Lý do: L5 đã chốt phạm vi ở đầu dòng, chủ nhân và phiên điều phối viết dòng bằng tay, và một dòng sai phạm vi là thứ chủ nhân cần sửa nhanh nhất. Phương án khác: mọi siêu dữ liệu ở file bên cạnh. Khi đó dòng viết tay không có phạm vi cho tới khi có lệnh gán.
- **DB3** (PS-12) Khóa phạm vi gồm `role`, `class`, `tribe`, `os`, `territory`, `tag`. `cli` chỉ ghi nơi đo và không lọc. Dòng có phạm vi máy không đọc được thì không nạp. Khuyến nghị: nhận. Phương án khác cho dòng không đọc được: vẫn nạp cho mọi phiên. Cách đó dễ chịu hơn với lỗi gõ, nhưng một dòng dành riêng cho người chấm sẽ lọt vào mọi prompt.
- **DB4** (PS-12, PS-12c; câu S6 và câu 6 của §10) Trần 40 tính trên số dòng nạp cho một phiên sau khi lọc, gộp kinh riêng và kinh chung. File không có trần. Vượt thì lấy 40 dòng đầu, lint báo. Thao tác `add` làm một nhân vật vượt 40 thì bị từ chối. Khuyến nghị: nhận. Phương án khác: trần 40 trên mỗi file, đơn giản hơn nhưng chặn kinh chung của vương quốc có ba tộc trên hai hệ điều hành.
- **DB5** (PS-12) Dòng chủ nhân viết tay không có id: máy không ghi gì vào dòng đó. Dấu vết nạp dùng khóa suy từ câu, và sửa câu thì số đếm bắt đầu lại. Khuyến nghị: nhận. Lý do: Nhiếp chính không bao giờ sửa dòng của chủ nhân, nên không có ca hai bên ghi cùng lúc. Phương án khác: Nhiếp chính đóng id vào dòng ở lần đọc đầu. Số đếm sống qua việc sửa câu, nhưng file của chủ nhân bị máy sửa.
- **DB6** (PS-12b) `helped` và `missed` tính theo lượt, theo `fail_kind` của dòng, không lưu ở đâu. Với dòng do phiên người chấm nạp, `missed` là phán quyết bị lật. Khuyến nghị: nhận. Chỗ này khác câu chữ của §3.16.8 (số đếm ở file bên cạnh). Lý do: số đếm đã lưu sẽ lệch khỏi sổ sự kiện.
- **DB7** (PS-12c) Kết quả của Thầy tu là một lệnh hộp thư `temple_report` với `source: monk`. Mỗi lần nhiều nhất 3 dòng thêm, 3 dòng gỡ, 2 lần gộp. Thầy tu chỉ gỡ hay gộp dòng do Thầy tu viết. Với dòng của chủ nhân, Thầy tu chỉ được đề nghị trong một thư. Khuyến nghị: nhận.
- **DB8** (PS-12c, PS-12d) Thang sửa lỗi ở bản đầu như bảng: bậc 1–3 là thư `proposal` tới Tể tướng; bậc 4 là một dòng kinh có phạm vi lãnh thổ; bậc 6 là thư thẳng tới chủ nhân. Khuyến nghị: nhận. Phương án khác cho bậc 4: Thầy tu ghi thẳng vào địa chí. Cách đó trái L7 (địa chí là file chủ nhân viết) và dòng không có số đo.
- **DB9** (PS-12d) Thầy tu là một phiên không tool, mỗi lần chạy một lần gọi model, đọc gói bằng chứng do máy dựng. Kích hoạt: `every_quests` đếm trên cả vương quốc, hoặc hằng tuần, hoặc khi có nhân vật bị đình chỉ, và nhiều nhất một lần mỗi ngày. Khuyến nghị: nhận. Phương án khác: một phiên cho mỗi nhân vật như câu chữ của kế hoạch sản phẩm. Số phiên khi đó nhân theo số nhân vật.
- **DB10** (PS-12d) **Tốn mana khi bật.** `schedule.temple.enabled` giữ mặc định tắt. Phiên có trần riêng và gói tối đa 24 000 ký tự. Token ghi ở `temple.ran` và vào ước lượng mana từ lần khởi động kế của Nhiếp chính. Đền không chạy khi bể của tộc đã đóng. Khuyến nghị: nhận. Ước lượng là khoảng 10 000 token mỗi lần và nhiều nhất một lần mỗi ngày, PS-12e đo lại.

**Chờ được**:

- **DB11** (trước PS-12e; **tốn mana**) Tộc và model của nhân vật Thầy tu ở vương quốc thật. Khuyến nghị: một nhân vật tộc `claude` với model rẻ nhất của tộc. Lý do: câu trả lời là một hợp đồng chặt, CLI của tộc này nhận schema và nhận prompt qua stdin. Mặc định của registry (`gemini`, flash) giữ nguyên cho vương quốc khác. Phương án khác: giữ mặc định `gemini`. Cách đó dùng bể rẻ và ít tranh chấp hơn, nhưng prompt bị trần 26 000 ký tự trên Windows và câu trả lời là JSON trong chữ.
- **DB12** (PS-12e; **tốn mana**) Ai chạy lần nghiệm thu và trần của nó. Khuyến nghị: phiên điều phối chạy, lần `temple run` đầu có chủ nhân nhìn, rồi bật lịch cho tới khi đủ 20 lượt.
- **DB13** Tự thả nhân vật bị đình chỉ sau khi Thầy tu đã viết bài học cho nó (`temple_done`), và lệnh `send_to_temple`. Khuyến nghị: chưa làm. Xét sau PS-12e, khi biết bài học của Thầy tu có đổi được chuỗi trượt không.
- **DB14** Ngưỡng tự gỡ một dòng bằng số, và luật "3 mùa". Khuyến nghị: chọn sau PS-12e, cùng lúc với ngưỡng T6 của bước nhập gói.
- **DB15** Lệnh cho chủ nhân thêm, gỡ dòng hay đóng id vào dòng viết tay, và việc tự thăng một dòng có ở hai nhân vật lên kinh chung. Khuyến nghị: chưa làm. Chủ nhân sửa file, và Thầy tu dùng `merge` khi thấy trùng.
- **DB16** Đưa trích đoạn journal vào gói bằng chứng. Khuyến nghị: chỉ làm khi PS-12e cho thấy ghi chú của phán quyết không đủ để Thầy tu chọn bậc.
- **DB17** Số đếm tách theo phiên bản CLI (T7). Khuyến nghị: làm cùng bước nhập gói. PS-12 đã ghi `cli_version` lúc thêm dòng, và sổ có các dòng `tribe.checked`.

## Gợi ý cho task khác (không sửa mục của chúng)

- **PS-13** (bí kíp vào phiên): cùng chạm `sessions/prompt.ts` và `load-trace.ts`. `selectSkills` nên theo hình dạng của `selectLessons` (một hàm thuần nhận phiên, trả thứ được nạp và thứ bị loại). Bậc 4 của thang nhận thêm thao tác trên bí kíp khi PS-13 xong.
- **PS-15** (bí kíp tài liệu): "chủ nhân trả bài với `fail_kind: style` thì thầy tu đề xuất mẫu mới" là một quyết định bậc `script` hay `knowledge` của cùng việc ở PS-12d, không cần việc theo lịch thứ hai.
- **PS-17** (thao trường): một dòng kinh là một biến thể thử được, và chế độ gỡ thử đo được một dòng còn cần không. Các số so sánh là của PS-12b.
- **PS-20** (tra cứu kho): chỉ mục lấy các dòng đang nạp được, mỗi mục mang phạm vi và `origin`.
- **Bước 2–4 của lesson-sharing** (kinh mặc định, xuất, nhập): dùng `origin`, `lintLesson`, thao tác `add` của PS-12c, và các số của PS-12b cho luật thử việc T6.
- **(256)(ii)** (tính ngay token của phiên do việc của Nhiếp chính chạy): `temple.ran` là dòng thứ ba cùng loại. Nhánh làm (ii) nên xử lý cả ba.
- **P2-01, P2-04, P2-07** (thế giới và khách nhẹ): `lesson.added`, `lesson.retired` và `temple.ran` là các dòng để vẽ cảnh Đền. Không trường mới nào của `WorldState`.
- **Sửa nhỏ, chưa ai nhận**: bảng `kingdom.schedule` của §2.3 thiếu `triage` và `digest` (chỗ 11 ở trên); PS-12 sửa khi chạm §2.3.
