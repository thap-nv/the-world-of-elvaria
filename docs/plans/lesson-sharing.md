# Chia sẻ bài học giữa các vương quốc: đề xuất

Ngày: 2026-11-16 · Trạng thái: **đề xuất, chờ chủ nhân chốt** các mục L1–L10 ở §11 (dòng "docs/plan-lesson-sharing" của [§11, 2026-11-16](../implementation-plan/11-2026-11-16.md)). Chưa task nào được mở và chưa dòng code nào đổi. Tài liệu này là căn cứ để chủ nhân sửa kế hoạch sản phẩm (§9) và để sau này viết task; nó chưa phải kế hoạch chi tiết của task nào.

Gốc: định hướng (161) của chủ nhân, ngày 2026-11-15: "Sau này nhiều người dùng Elvaria cho riêng mình; vương quốc của ai người nấy giữ, còn bài học (kinh, địa chí) chia sẻ được giữa các vương quốc để hoàn thiện hơn." Dòng ghi nó nằm ở [file §11 ngày 2026-11-15](../implementation-plan/11-2026-11-15.md), mới có trên nhánh `feat/ps-08c`, và tới `main` khi nhánh đó merge. Chủ nhân mở phiên kế hoạch này bằng quyết định (172).

## 1. Tóm tắt

- **Phần lớn bài học đang có không nên đi dưới dạng kinh.** Trong 21 dòng kinh chung của vương quốc thật, 11 dòng nói về chính Elvaria (thư bàn giao, luật đạt của người chấm, đất nháp). Chúng đúng ở mọi vương quốc vì mọi vương quốc chạy cùng một Elvaria, nên chỗ của chúng là bản phát hành: một check, một script, hay một câu trong mẫu prompt (nguyên tắc 14, sửa ở bậc cao nhất). Đường từ bản phát hành tới vương quốc đã có: `elvaria upgrade`.
- **Địa chí đi theo repo, không đi theo vương quốc.** 22 trong 28 dòng địa chí là dữ kiện của một repo; chúng chỉ có ích cho vương quốc nào gắn cùng repo đó, và repo đã có đường chia sẻ của riêng nó là git.
- **Thứ thật sự cần một cơ chế mới** là phần còn lại: thói quen làm việc, dữ kiện về một tộc trên một hệ điều hành ở một phiên bản CLI, về sau là bí kíp và số hiệu chỉnh.
- **Khuyến nghị về đường đi**: bài học của người khác vào prompt của một vương quốc qua đúng hai cửa. Cửa mặc định là bản phát hành (đã qua duyệt như code, tới bằng `upgrade`, có thử và có đường lùi). Cửa thứ hai là một file gói do chính chủ nhân đưa vào và nhận từng dòng. Không tự tải, không server, không đồng bộ (nguyên tắc 2).
- **Riêng tư**: mặc định không gì rời vương quốc. Xuất là một lệnh chủ nhân gõ, máy chặn trước những gì chắc chắn riêng, chủ nhân duyệt từng dòng, và Elvaria không tự gửi file đi đâu.
- **Tin cậy**: một dòng kinh là một mệnh lệnh cho mọi nhân vật, kể cả người chấm, nên dòng nhập là đường tiêm prompt. Dòng nhập nằm ở chỗ chờ, chỉ vào prompt sau khi chủ nhân nhận, mang phạm vi máy lọc được, và bị gỡ khi số đo tại chỗ không ủng hộ (ADR 0027).
- **Thời điểm**: chưa nên dựng lệnh xuất hay nhập bây giờ. Chưa có vương quốc thứ hai của người khác, và Đền bản đầu (PS-12) chưa làm nên dòng kinh chưa có id, phạm vi hay bộ đếm để mang đi. Việc nên làm ngay là bước 0 (§8), dùng cơ chế đã có, và ghi các ràng buộc S1–S8 (§7) vào PS-12 để định dạng của nó không chặn việc chia sẻ sau này.

## 2. Điều đang có (khảo sát ở `1578486`, 2026-11-16)

| # | Thực tế | Hệ quả |
|---|---|---|
| 1 | Kinh vào prompt nguyên văn, cả file, cho cả người làm lẫn người chấm. `readScriptures` (`packages/steward/src/files.ts:26-33`) đọc kinh riêng rồi kinh chung; `scriptureBlock` (`packages/runner-core/src/prompt/blocks.ts:217-219`) chỉ cắt khoảng trắng và nối. Khung của khối là "Lessons from earlier verdicts. Follow them unless the territory's rules say otherwise." (`packages/runner-core/prompts/scripture.md`). Không tách từng dòng, không lọc theo phạm vi, không qua `redact` | Một dòng trong `temple/scripture.md` là một mệnh lệnh cho mọi nhân vật. Dòng tới từ ngoài là đường tiêm prompt trực tiếp |
| 2 | Địa chí cũng vào nguyên văn (`packages/steward/src/sessions/gazetteer.ts:10-22`): chỉ bỏ dòng dấu commit và thêm câu về thư mục đã đổi từ dấu đó | Như dòng 1 |
| 3 | Chưa có parser, writer hay lệnh nào cho kinh. Văn phạm `- [L_…]` chỉ nằm trong mô tả của schema (`packages/domain/src/schema/lesson/lesson.ts:61`) và §2.3; `elvaria scripture lint` chưa có; `packages/domain/src/temple/` chưa có. Dấu vết nạp chỉ ghi file và số dòng (`packages/domain/src/schema/event/load-trace.ts`) | Chưa biết lần chạy nào nạp dòng nào, nên chưa đo được một dòng có giúp không. Mọi thứ cần để mang một bài học đi đều do PS-12 dựng |
| 4 | Schema `lesson` v1: `source` là `monk` hay `user`, `source_verdict` bắt buộc với `monk`; không có phạm vi, bộ đếm hay nguồn gốc ngoài vương quốc. Schema `skill`: `source` là `monk` hay `user`, `scope` là `global` hay một lãnh thổ; `selectSkills` chưa có và runner luôn nhận `skills: []` | Hai schema chưa có chỗ cho thứ tới từ ngoài. PS-12 và PS-13 sẽ sửa chúng, nên đây là lúc rẻ nhất để nêu yêu cầu |
| 5 | `elvaria init` tạo `temple/` rỗng (`packages/store/src/init.ts:54-77`); `registry-default` không mang kinh, bí kíp hay bài mẫu nào | Vương quốc mới bắt đầu từ số không và trả lại đúng các phiên làm lại mà vương quốc trước đã trả |
| 6 | Đường từ bản phát hành tới vương quốc đã có cho registry: sau `elvaria upgrade`, `refreshRegistryDefaults` (`packages/store/src/registry-refresh.ts:116-143`) thay một prompt nghề, một script hay một mục dữ liệu khi vương quốc còn giữ đúng mặc định của bản ghim trước, có sao lưu; thứ chủ nhân đã sửa thì chỉ nêu tên, không ghi (ADR 0016, sửa 2026-11-14). Mẫu prompt của `runner-core/prompts` đi theo bản ghim, không chép vào vương quốc | Cửa vào theo bản phát hành không cần cơ chế mới cho prompt, script, check. Nó đã có thử trước và đường lùi (ADR 0026) |
| 7 | Vương quốc biết phiên bản CLI đã kiểm của từng tộc (`kingdom.tribes[].tool.checked_version`) và giữ tộc khi CLI nói bản khác (`versionHoldsOf`, [§3.14](../implementation-plan/3.14-tribe-contract.md)) | Tín hiệu "CLI đổi phiên bản" đã có sẵn để đánh dấu bài học cần đo lại |
| 8 | Dữ kiện về tộc theo hệ điều hành đã có chỗ ngoài kinh: `shell` là "a system fact the prompt states, not scripture" (`packages/runner-core/src/prompt/build-prompt.ts:72-75`), cùng `capabilities` và `tribeLimitsOf` (ADR 0021) | Một dữ kiện tộc đã chắc thì thành dữ liệu của adapter, không ở lại làm kinh |
| 9 | Không lệnh nào đưa dữ liệu vương quốc ra hay vào ([cli.md](../cli.md)): chỉ có `init`, `territory add`, `migrate`, `upgrade` | Lệnh xuất và nhập là mới hoàn toàn |
| 10 | Bài học hôm nay do chủ nhân và phiên điều phối viết tay ([hướng dẫn vận hành](../guides/operating-a-kingdom.md) §11). Kinh chung của vương quốc thật có 21 dòng: không dòng nào có id hay siêu dữ liệu; 10 dòng nói với một vai ngay trong câu ("As a judge…", "As a mage…"); 3 dòng nói với một tộc trên một hệ điều hành | Phạm vi đang viết bằng chữ, máy không lọc được: 8 dòng chỉ dành cho người chấm vẫn vào prompt của mọi người làm |
| 11 | Từ vựng `FAIL_KINDS` (`packages/domain/src/schema/common.ts:29-40`) đóng và giống nhau ở mọi vương quốc | Một bài học mang theo loại lỗi nó chữa thì vương quốc nhận đếm được nó có giúp không mà không cần phán quyết gốc |
| 12 | Bảng thuật ngữ chưa có từ cho gói bài học, xuất, nhập ([glossary.md](../glossary.md)) | Task đầu tiên của việc này thêm thuật ngữ vào `glossary.json` |

Các câu của kế hoạch sản phẩm 0.8 mà định hướng (161) chạm tới: mục 1 ("không đồng bộ giữa các máy"), nguyên tắc 2 (local-first), nguyên tắc 14 (bài học gắn với một phán quyết hoặc một số đo), mục 4 bảng Lesson (`source_verdict` bắt buộc) và bảng Skill, mục 6 "Đền và kinh", mục 10 giai đoạn 6 ("liên minh (sync thư mục)"), mục 11 (rủi ro "bài học đúng ở một nơi bị áp cho mọi nơi"), mục 14 ("chỉ dùng bí kíp do Đền hoặc người dùng viết, không tải từ ngoài"). Đề xuất sửa từng câu ở §9.

## 3. Bài học là gì khi rời một vương quốc

Câu hỏi cho từng loại: nó còn đúng ở đâu ngoài vương quốc này. Cột số đếm là kết quả đọc `temple/scripture.md` (21 dòng) và hai địa chí (28 dòng dữ kiện) của vương quốc thật ngày 2026-11-16; không dòng nào của chúng được chép vào repo, trừ một câu ví dụ ở dưới.

| Loại | Vương quốc thật | Còn đúng ở đâu | Dạng nên mang | Đường đi |
|---|---|---|---|---|
| **A. Bài học về chính Elvaria**: thư bàn giao, mục "Not done", luật đạt của người chấm, đất nháp, cách pháp sư chia kế hoạch | 11 dòng kinh | Mọi vương quốc cùng bản Elvaria | Không nên là kinh. Theo thang sửa lỗi: check hay script nếu được; không thì một câu trong mẫu của `runner-core/prompts` hay prompt nghề, vốn đã theo vai | Bản phát hành (đã có) |
| **B. Thói quen làm việc**: trích nguyên văn, đọc file lớn theo đoạn, kiểm thuật ngữ trước khi nộp | 6 dòng kinh | Mọi vương quốc; có thể khác theo model | Dòng kinh có phạm vi, loại lỗi và bộ đếm | Bản phát hành (kinh mặc định); file gói |
| **C. Dữ kiện tộc × hệ điều hành × phiên bản CLI** | 3 dòng kinh, 2 dòng địa chí | Cùng tộc, cùng hệ điều hành, quanh phiên bản đã đo | Dòng có phạm vi máy đọc được; khi đã chắc thì thành dữ liệu của adapter như `shell` (dòng 8 của §2) | Bản phát hành; file gói |
| **D. Dữ kiện về một công cụ ngoài** (ví dụ lỗi lúc container khởi động là lỗi môi trường) | 1 dòng kinh | Nơi nào dùng công cụ đó | Dòng kinh có tag, hoặc một phần của bí kíp | Như B |
| **E. Dữ kiện của một repo**: lệnh, file lớn, file sinh, quy ước | 22 dòng địa chí | Chỉ vương quốc gắn cùng repo | Tài liệu nằm trong chính repo | Đi theo repo bằng git; không qua vương quốc |
| **F. Kiến thức về một thư viện** lộ ra trong một repo | 2 dòng địa chí | Repo nào dùng thư viện đó | Bí kíp (`SKILL.md`, theo tag), viết lại để không còn đường dẫn của repo gốc | Sau PS-13: bản phát hành hay gói bí kíp |
| **G. Số hiệu chỉnh**: ước lượng token theo hạng, ngưỡng, trần | 2 dòng địa chí; sổ đo | Gần đúng, theo model và cỡ repo | Số gộp, không phải câu | Mặc định của bản phát hành; chờ tới khi có vài vương quốc |
| **H. Dữ liệu registry**: dạng, nghi thức, script, mẫu văn phong, prompt nghề | `registry/` | Mọi vương quốc | File registry | Chỉ bản phát hành (đã có). Không nhập ngang: script là mã chạy trên máy, nghi thức là thước đo (nguyên tắc 17) |
| **I. Của riêng chủ nhân**: `decree.md`, tính cách, phạm vi ủy quyền, ngưỡng mana | — | Không đâu khác | — | Không chia sẻ |

Ví dụ của loại C, trích từ kinh thật:

> As a Codex judge on Windows, git commands that need the work tree (git grep, git diff HEAD, git status) fail with "must be run in a work tree": compare commits with `git diff <base>...HEAD` and read files with `git show HEAD:<path>`.

Câu này có ích cho mọi vương quốc chạy Codex trên Windows và vô nghĩa, thậm chí sai, ở nơi khác. Phạm vi của nó đang nằm trong chữ; một dòng địa chí cùng loại còn ghi cả số phiên bản CLI trong câu.

Ba điều rút ra:

1. **"Chia sẻ bài học" trước hết là đưa bài học lên đúng bậc.** Bài học loại A là lỗ hổng của sản phẩm mà một vương quốc tìm ra. Sửa nó trong repo Elvaria là cách chia sẻ mạnh nhất: mọi vương quốc nhận khi nâng bản, không dòng nào tốn chỗ trong kinh. Điều này nối dài thang thăng cấp đã có: bài học lặp ở hai nhân vật thì lên kinh chung của Đền; bài học đúng ở mọi vương quốc thì lên bản phát hành.
2. **Địa chí không phải thứ để trao giữa các vương quốc.** Dòng loại E theo repo; dòng loại F phải được viết lại thành bí kíp mới đi được; dòng loại C và G nằm lẫn trong địa chí vì hôm nay chưa có chỗ khác.
3. **Phạm vi viết bằng chữ không đi được.** Một dòng muốn sang vương quốc khác phải mang phạm vi máy đọc được (vai, tộc, hệ điều hành, phiên bản CLI đã đo, tag), nếu không nó thành đúng lỗi đã gặp: bài học "shell là PowerShell" viết như luật chung rồi phải sửa thành "On Windows, …" (ADR 0027).

## 4. Riêng tư: cái gì không bao giờ rời vương quốc

Nguyên tắc: **mặc định không gì rời vương quốc**, và thứ rời đi chỉ đi qua tay chủ nhân.

Không bao giờ nằm trong một gói xuất, vì lệnh xuất không đọc chúng: quest (tiêu đề, mô tả), journal, thư bàn giao, phán quyết và ghi chú, thư giữa các nhân vật, bản tấu, biên niên sử, event log, `.runs/`, `kingdom.json`, file lãnh thổ (đường dẫn, remote, tên secret), file nhân vật, kho bảo vật (ADR 0013), địa chí, `decree.md`.

Luật của cửa ra:

- **P1. Xuất là lệnh chủ nhân gõ**, 0 mana, ghi một file văn bản đọc được vào thư mục chủ nhân chỉ. Elvaria không gửi file đi đâu: không mạng, không `git push` (điều cấm sẵn có của CLAUDE.md). Gửi bằng cách nào là việc của chủ nhân.
- **P2. Lệnh xuất chỉ đọc kinh và siêu dữ liệu từng dòng** do PS-12 ghi. Nó không mở file nào trong danh sách trên.
- **P3. Dòng có phạm vi lãnh thổ không xuất được.** Đó là loại E: nó theo repo.
- **P4. Trường bị bỏ khi xuất**: `source_verdict` (là id của một quest), `owner` (tên nhân vật), tên vương quốc. Thay vào đó gói mang loại lỗi (`fail_kind`), phạm vi, số đếm (số lượt nạp, `helped`, `missed`), hash bản Elvaria đang ghim và hệ điều hành.
- **P5. Máy chặn cứng** dòng chứa: giá trị trong kho bảo vật và mẫu của `redact`; đường dẫn tuyệt đối; tên, id, đường dẫn hay remote của bất kỳ lãnh thổ nào; tên nhân vật; id quest; tên vương quốc; tên người dùng của máy; URL; địa chỉ email.
- **P6. Máy đánh dấu, không chặn**: mọi đoạn trong dấu backtick (lệnh, tên file, tên gói). Trong 21 dòng thật có 2 dòng nêu một lệnh riêng của một lãnh thổ làm ví dụ; máy không biết đó là tên riêng, chỉ chỉ ra được chỗ cần nhìn. Vì vậy lọc bằng máy không đủ.
- **P7. Chủ nhân duyệt từng dòng**, mặc định mỗi dòng là "không xuất"; sửa câu chữ cho bỏ được chi tiết riêng là việc của chủ nhân lúc duyệt. Vì vậy chủ nhân duyệt không có máy chặn trước cũng không đủ: mắt người bỏ sót một token.
- **P8. Số đo gộp (loại G) chưa xuất** ở các bước đầu: giá trị của nó chỉ có khi đã có vài vương quốc, và nó cần luật riêng về cỡ mẫu tối thiểu.

Bật theo lựa chọn nghĩa là: không có công tắc "chia sẻ" nào chạy nền. Việc duy nhất xảy ra là lần chủ nhân gõ lệnh xuất và lần chủ nhân tự gửi file.

## 5. Đường đi: bốn phương án

| | A. File gói, trao tay | B. Một repo chung | C. Theo bản phát hành | D. Đồng bộ hay server |
|---|---|---|---|---|
| Cách chạy | Chủ nhân xuất một file, người kia nhập | Các chủ nhân gửi gói vào một repo git; ai muốn thì kéo về rồi nhập | Bài học thành một phần của Elvaria (check, script, prompt, kinh mặc định) và tới bằng `elvaria upgrade` | Vương quốc tự trao đổi qua mạng |
| Nguyên tắc 2 (local-first) | Giữ | Giữ, nếu kéo về là việc của chủ nhân | Giữ | Trái |
| Ai duyệt nội dung | Người nhận, một mình | Người giữ repo, rồi người nhận | Như duyệt code: PR, vùng bảo vệ, dấu vua (ADR 0026) | Không ai |
| Đường tiêm prompt | Rộng nhất: người nhận là hàng rào duy nhất | Hẹp hơn, nếu repo có người giữ | Không thêm đường mới: chủ nhân đã tin bản phát hành vì đang chạy mã của nó | Rộng và tự động |
| Lên được bậc cao hơn kinh | Không: gói chỉ mang câu chữ | Không | Có: một bài học có thể thành check hay script, hết tốn token | Không |
| Trùng và mâu thuẫn | Mỗi người nhận tự xử | Người giữ repo xử một lần | Xử một lần, một bộ thống nhất | Không ai xử |
| Thử trước, đường lùi | Phải dựng | Phải dựng | Đã có: phép thử của `upgrade`, `--rollback` | Không |
| Chi phí dựng | Hai lệnh, một schema | Như A, cộng người giữ repo và quy trình | Gần như không cho loại A, H; một việc nhỏ cho kinh mặc định | Lớn |
| Hợp khi | Hai máy của một chủ nhân; gửi kèm một đề xuất lên repo Elvaria | Đã có nhiều người đóng góp | Ngay bây giờ | Không hợp |

**Khuyến nghị: C là cửa vào mặc định, A là cửa ra và là cửa vào có duyệt; B để sau; D không làm.**

- Bài học loại A và H chỉ đi đường C. Bài học loại B, C, D đi đường C khi đã được duyệt vào bản phát hành, và đi đường A khi một chủ nhân muốn trao sớm hơn.
- Cửa ra của A (lệnh xuất) cũng là cách một người dùng gửi bài học của mình lên: gói kèm vào một issue hay PR của repo Elvaria, người giữ repo đưa nó vào bản phát hành ở đúng bậc. B vì vậy chưa cần một repo riêng: repo Elvaria làm vai đó tới khi lượng đóng góp buộc phải tách.
- Lý do không chọn chỉ A: gói chỉ mang câu chữ, nên mọi bài học dừng ở bậc 5 của thang sửa lỗi, bậc yếu và đắt nhất; và mỗi người nhận phải tự là hàng rào chống tiêm prompt.
- Lý do không chọn chỉ C: nó chậm theo nhịp phát hành, và một chủ nhân có hai máy (quyết định (158): máy thứ hai nhận kinh và địa chí làm hạt giống qua một gói chép tay) cần trao bài học giữa hai vương quốc của mình mà không chờ ai.

"Liên minh (sync thư mục)" của giai đoạn 6 trong kế hoạch sản phẩm là phương án D ở dạng nhẹ. Đề xuất thay nó bằng hướng này (§9).

## 6. Tin cậy: bài học nhập là đường tiêm prompt

**Một dòng xấu làm được gì.** Nó được đọc như mệnh lệnh ở mọi phiên, kể cả phiên chấm (dòng 1 của §2). Những thứ đã chặn sẵn trong code không phụ thuộc prompt: danh sách tool và hook của runner, env tối thiểu và kho bảo vật (ADR 0013), nhân vật không push, check đỏ thì trượt dù người chấm nói gì (ADR 0008). Một dòng kinh không mở được quyền nào. Phần còn hở: đốt mana, làm việc kém đi, làm người chấm dễ dãi trong phần phán đoán còn lại của nó, và đưa nội dung repo ra ngoài qua tool đã được phép (tìm web của trinh sát). Với một vương quốc có repo riêng tư, điểm cuối là rủi ro thật.

Luật của cửa vào:

- **T1. Đúng hai cửa.** Bản phát hành, và file gói mà chủ nhân đưa đường dẫn. Elvaria không tự tải gì; Nhiếp chính và nhân vật không đọc gói.
- **T2. Gói là dữ liệu, không phải mã.** Chỉ có câu chữ và siêu dữ liệu theo schema. Không script, không prompt nghề, không nghi thức, không check, không file kèm. Registry chỉ đổi qua bản phát hành (ADR 0016, 0026).
- **T3. Cách ly.** Dòng nhập nằm ở một chỗ chờ, không nằm trong `scripture.md`, và không vào prompt nào tới khi chủ nhân nhận nó. Không phiên model nào đọc chỗ chờ: một thầy tu đọc văn bản lạ cũng là một đường tiêm.
- **T4. Máy soát trước khi chủ nhân đọc**, bằng cùng hàm thuần với `elvaria scripture lint`: một dòng, không quá `LESSON_TEXT_MAX_LENGTH` (300) ký tự; chỉ ký tự nhìn thấy được (từ chối ký tự ẩn, ký tự đổi chiều chữ, thẻ và comment HTML); không URL, không đường dẫn tuyệt đối; qua các mẫu của `redact`; có phạm vi hợp lệ theo registry của vương quốc nhận; có `fail_kind`. Dòng trượt không hiện ra để nhận, chỉ nêu lý do.
- **T5. Chủ nhân nhận từng dòng**; không có "nhận tất cả". Dòng nói với người chấm chạm vào thước đo (nguyên tắc 17) và được nêu riêng khi duyệt.
- **T6. Thử việc bằng số đo tại chỗ.** Dòng nhập bắt đầu với bộ đếm bằng 0; số đếm của nơi gửi chỉ là lời khai cho chủ nhân đọc. Bộ đếm `helped`, `missed` của PS-12 quyết định giữ hay gỡ, như mọi dòng (ADR 0027). Một gói lớn thì thử ở thao trường trước (PS-17), như ADR 0026 đã đòi với thay đổi lớn về prompt.
- **T7. Hết hạn theo phiên bản CLI.** Dòng có phạm vi tộc ghi "đo ở bản nào". Khi `tool.checked_version` của tộc đổi, dòng vẫn được nạp nhưng mang dấu "chưa đo lại", bộ đếm tính lại từ bản mới, và số đo ở bản mới quyết định. Lọc cứng theo đúng số phiên bản thì mỗi lần CLI lên bản là mất hết bài học của tộc; từ 2026-11-06 tới 2026-11-14, agy đi từ 1.5.1 tới 1.5.8.
- **T8. Trùng và mâu thuẫn.** Trùng nguyên văn sau khi chuẩn hóa khoảng trắng thì bỏ. Dòng nhập có cùng `fail_kind` và phạm vi giao với một dòng đang có thì hiện cạnh dòng đó; dòng của vương quốc thắng nếu chủ nhân không nói khác. Máy không phán hai câu có mâu thuẫn không. Trần số dòng vẫn áp dụng: nhận một dòng khi đã đầy là phải gộp hay gỡ một dòng khác.
- **T9. Nguồn gốc không mất.** Mỗi dòng đã nhận giữ `origin` (bản phát hành hay gói nào, id dòng ở nơi gốc, ngày nhận). Dấu vết nạp ghi id dòng, nên sổ đo tách được dòng nhà và dòng nhập; gỡ một gói là gỡ mọi dòng mang `origin` đó, bằng một lệnh.

Chữ ký số cho gói chưa cần: với đường C, hash commit của bản ghim đã là bằng chứng nguyên vẹn; với đường A, chủ nhân biết ai đưa file cho mình. Nó thành cần khi có repo chung (phương án B).

## 7. Quan hệ với việc đã có, và task nào đổi

| Việc đã có | Quan hệ | Đề xuất đổi |
|---|---|---|
| **PS-12 Đền bản đầu** (§3.16.8, ADR 0027) | Dựng mọi thứ một bài học cần để đi được: id từng dòng, siêu dữ liệu bên cạnh, phạm vi, bộ đếm, lọc khi dựng prompt | Thêm ràng buộc S1–S8 dưới đây khi lập kế hoạch PS-12. Không thêm lệnh xuất hay nhập vào PS-12 |
| **Thầy tu ở giai đoạn 5** (viết bí kíp từ bài học lặp) | Thầy tu là người gán phạm vi, nên cũng là người biết dòng nào không gắn với lãnh thổ nào | Thêm một đầu ra: dòng đã đo là có ích và không có phạm vi lãnh thổ thành mục "đáng gửi lên" trong bản tấu. Thầy tu không tự xuất, và không đọc chỗ chờ của gói nhập (T3) |
| **PS-13 Bí kíp vào phiên**, **PS-14**, **PS-15** | Bí kíp mặc định của PS-14 và PS-15 đã là "bí kíp theo bản phát hành": chúng là bên dùng đầu tiên của đường C cho bí kíp | Schema `skill`: `source` mở thêm giá trị cho bí kíp của bản phát hành, và chúng được làm mới khi `upgrade` theo cùng luật với prompt nghề. Nhập bí kíp từ file ngoài để sau (bước 5) |
| **PS-17 Thao trường** | Nơi thử một gói trước khi dùng thật (T6); chế độ gỡ thử đo được một dòng mặc định còn cần không | Một gói bài học là một biến thể hợp lệ, cạnh prompt, bí kíp và model. Không đổi phạm vi của PS-17 |
| **PS-20 Tra cứu kho** | Chỉ mục dựng từ file của vương quốc | Chỉ mục chỉ gồm dòng đã nhận; mỗi mục mang `origin` như các ngữ cảnh khác |
| **Schema `lesson`** (`packages/domain/src/schema/lesson/`) | Hợp đồng dữ liệu (ADR 0003), PS-12 sửa | Xem S3, S4 |
| **`elvaria upgrade`** và `refreshRegistryDefaults` | Đường C đã chạy cho registry | Bước 2 dùng lại nguyên luật "chỉ thay thứ còn trùng mặc định cũ" |
| **Cách ghi bài học bằng tay hôm nay** ([hướng dẫn vận hành](../guides/operating-a-kingdom.md) §11) | Nguồn của cả 21 dòng | Thêm một bước phân loại trước khi viết (bước 0 của §8). Sửa hướng dẫn khi chủ nhân chốt L5 |
| PS-08 tới PS-11, các việc `P2-…` | Không liên quan | Không đổi |

Ràng buộc gửi PS-12 (chốt khi lập kế hoạch PS-12, mục L8):

- **S1. Phạm vi có vai.** Danh sách phạm vi của ADR 0027 (tộc, hệ điều hành, phiên bản CLI, lãnh thổ, tag) thiếu vai: 10 trong 21 dòng thật nói với người chấm, người làm hay pháp sư. Thêm nghề hoặc vai vào phạm vi thì prompt của người làm nhẹ đi 8 dòng ngay ở vương quốc thật, chưa cần chia sẻ gì.
- **S2. Giá trị phạm vi là từ vựng đi được**: id tộc, tên nền tảng, id tag và id nghề của registry. Lãnh thổ là phạm vi duy nhất không đi được, và sự có mặt của nó là dấu "dòng này ở lại" (P3).
- **S3. Mỗi dòng mang `fail_kind` nó chữa.** Hôm nay loại lỗi chỉ suy ra được qua `source_verdict`, thứ không rời vương quốc.
- **S4. `origin` là trường tùy chọn**; dòng không có `origin` là của vương quốc. Giá trị của `source` mở cho dòng tới từ ngoài; dòng đó không có `source_verdict` tại chỗ. Nguyên tắc 14 vẫn giữ: nó gắn với một số đo, là bộ đếm tại chỗ kể từ lúc nhận.
- **S5. Phiên bản CLI là "đo ở bản nào"**, không phải bộ lọc cứng (T7).
- **S6. Trần 40 dòng tính trên số dòng được nạp cho một phiên sau khi lọc phạm vi**, hay trên cả file: PS-12 phải chọn. Khi kinh có dòng cho ba tộc trên hai hệ điều hành, file có thể dài hơn 40 dòng mà mỗi prompt vẫn ngắn.
- **S7. Dấu vết nạp ghi id từng dòng** (đã hẹn ở `load-trace.ts`): thiếu nó thì T6 và T9 không làm được.
- **S8. `elvaria scripture lint`** (đã hẹn ở §2.3) soát mọi dòng bằng các luật của T4, kể cả dòng chủ nhân viết tay.

## 8. Đặt vào giai đoạn nào

Các bước dưới đây chưa là task và chưa có số hiệu ở §8 của kế hoạch triển khai. Mỗi bước nêu điều kiện để bắt đầu.

| Bước | Nội dung | Bắt đầu khi | Cỡ |
|---|---|---|---|
| **0. Đưa bài học lên đúng bậc** | Với từng dòng loại A của kinh thật: thành check hay script nếu được; không thì vào mẫu của `runner-core/prompts` (phần của người chấm, của pháp sư) hay prompt nghề của `registry-default`. Dòng loại C đã chắc thành dữ liệu của adapter. Sau `upgrade`, gỡ dòng tương ứng khỏi kinh của vương quốc. Từ nay phiên điều phối phân loại mỗi bài học trước khi viết: của Elvaria thì sửa repo; của một repo thì vào địa chí hay tài liệu của repo đó; còn lại mới là kinh, có phạm vi ở đầu câu | Chủ nhân chốt L5. Không cần cơ chế mới, không cần ADR | Một nhánh sửa nhỏ |
| **1. PS-12 mang S1–S8** | Đền bản đầu như đã định, với định dạng đi được | PS-12 được lập kế hoạch (giai đoạn 2, đợt 3 của [phase-2.md](phase-2.md)) | Nằm trong PS-12 |
| **2. Kinh mặc định theo bản phát hành** | Bản phát hành mang một bộ kinh mặc định (loại B, C, D đã qua tay chủ nhân), `init` đặt nó vào vương quốc mới, `upgrade` làm mới nó theo luật của `refreshRegistryDefaults`; dòng mặc định qua cùng bộ lọc phạm vi và cùng bộ đếm. Khuyến nghị giữ nó ở một file riêng, không trộn vào `temple/scripture.md`, để bản phát hành không bao giờ ghi vào kinh của chủ nhân | Sau PS-12 | Một task nhỏ |
| **3. Xuất gói** | Lệnh xuất theo P1–P8; schema của gói trong domain; thuật ngữ mới vào glossary | Sau bước 1, và khi có ít nhất hai vương quốc đã chạy đủ lâu để có bộ đếm. Máy thứ hai của chủ nhân tính là một | Một task |
| **4. Nhập gói** | Lệnh nhập theo T1–T9: chỗ chờ, soát bằng máy, nhận từng dòng, gỡ theo `origin` | Sau bước 3 | Một task; chạm prompt nên có ADR trước |
| **5. Phần của giai đoạn 5 trở đi** | Gói bí kíp (sau PS-13); thử gói ở thao trường (sau PS-17); số hiệu chỉnh gộp; repo chung nếu đã có người đóng góp | Khi có nhu cầu thật | Chưa ước lượng |

**Chưa nên dựng bước 3 và 4 bây giờ**, vì ba lý do. Chưa có người dùng thứ hai, nên chưa ai để trao. Dòng kinh chưa có id, phạm vi và bộ đếm, nên gói hôm nay chỉ là một file Markdown chép tay, thứ mà chủ nhân đã làm được không cần lệnh nào ((158)). Và phần giá trị lớn nhất (loại A, hơn nửa số dòng) không cần hai bước đó.

Không làm ở bất kỳ bước nào: đồng bộ thư mục, tự tải, gửi số đo tự động, nhập registry hay script từ ngoài bản phát hành.

## 9. Đề xuất cho kế hoạch sản phẩm (chủ nhân sửa)

Phiên này không sửa `docs/ke-hoach-dung-elvaria-0.8.md`. Các chỗ sẽ đổi nếu chủ nhân theo khuyến nghị:

| Mục | Hôm nay | Đề xuất |
|---|---|---|
| 1 Tóm tắt | "Không có server chung, không đồng bộ giữa các máy." | Giữ, thêm một câu: bài học thì chia sẻ được giữa các vương quốc, qua bản phát hành và qua file do chủ nhân xuất và nhập; việc, quest và mã nguồn của vương quốc nào ở lại vương quốc đó |
| 2 Nguyên tắc 2 | Local-first | Giữ nguyên chữ: hướng này không cần sửa nó |
| 2 Nguyên tắc 14 | "Mỗi bài học… gắn với một phán quyết hoặc một số đo" | Giữ nguyên chữ. Ghi chú ở mục 14: bài học tới từ ngoài gắn với số đo tại chỗ kể từ lúc nhận |
| 4 Lesson | `source_verdict` "bắt buộc" | Bắt buộc với bài học của thầy tu; thêm `origin` (bản phát hành hay gói), `fail_kind`, và vai trong `scope` |
| 4 Skill | `source`: `temple` hoặc `user` | Thêm nguồn "bản phát hành" |
| 6 Đền và kinh | Bài học ở ≥ 2 nhân vật lên kinh chung | Thêm bậc kế: bài học đúng ở mọi vương quốc lên bản phát hành, ở bậc cao nhất của thang sửa lỗi; kinh mặc định theo bản phát hành; dòng nhập qua chỗ chờ và chủ nhân nhận từng dòng |
| 10 Lộ trình | Giai đoạn 5 và 6 | Giai đoạn 2: Đền bản đầu mang định dạng đi được. Giai đoạn 5: kinh mặc định, xuất, nhập. Giai đoạn 6: bỏ "liên minh (sync thư mục)", thay bằng "gói bí kíp, số hiệu chỉnh gộp, repo bài học chung" |
| 11 Rủi ro | — | Hai dòng mới: bài học nhập là đường tiêm prompt (T1–T9); bài học xuất làm lộ thông tin riêng (P1–P8) |
| 12 Nhật ký | — | Một dòng cho quyết định này |
| 14 "Thư viện kỹ năng" | "Chỉ dùng bí kíp do Đền hoặc người dùng viết, không tải từ ngoài" | "Không tự tải từ ngoài: bí kíp và bài học của người khác chỉ vào qua bản phát hành, hoặc qua file do chủ nhân nhập và nhận" |
| 14 Thang sửa lỗi | Sáu bậc | Thêm một câu trước thang: lỗi mà vương quốc nào cũng sẽ gặp thì sửa trong Elvaria, không sửa trong kinh của một vương quốc |

Có nâng số phiên bản của kế hoạch sản phẩm (0.9) hay sửa tại chỗ trong 0.8 là việc chủ nhân chọn.

## 10. Đề xuất ADR (chưa viết)

Một ADR mới, viết khi mở task đầu tiên chạm tới prompt (bước 2 hay bước 4), mang số kế tiếp lúc đó. Tiêu đề đề xuất: "Lessons travel by release and by owner-reviewed files; a kingdom fetches nothing". Nội dung: hai cửa vào (T1), gói là dữ liệu (T2), cách ly và nhận từng dòng (T3, T5), thử việc bằng số đo tại chỗ (T6), cửa ra theo P1–P7, và ba phương án bị loại ở §5.

Hai ADR đã có sẽ sửa tại chỗ khi PS-12 và PS-13 làm, theo mẫu "(Amended <ngày>, <task>: …)": ADR 0027 (phạm vi thêm vai; phiên bản CLI là "đo ở bản"; `origin`), ADR 0020 (nguồn của bí kíp). ADR 0016 không đổi: registry chỉ theo bản phát hành là điều nó đã nói.

## 11. Quyết định chờ chủ nhân

**Phải chốt** (hướng của tài liệu này; chốt xong thì merge):

| # | Quyết định | Khuyến nghị |
|---|---|---|
| **L1** | **Đường đi.** Bài học của vương quốc khác vào prompt qua đâu | Hai cửa: bản phát hành là mặc định, file gói do chủ nhân nhập là cửa thứ hai; không repo chung riêng lúc này, không đồng bộ (§5) |
| **L2** | **Thời điểm.** Có dựng lệnh xuất và nhập bây giờ không | Không. Thứ tự là bước 0 → PS-12 mang S1–S8 → kinh mặc định → xuất → nhập, mỗi bước chờ điều kiện của nó (§8) |
| **L3** | **Riêng tư.** Danh sách không bao giờ rời vương quốc và cách lọc | Theo §4: mặc định không xuất gì; máy chặn cứng rồi chủ nhân duyệt từng dòng; dòng có phạm vi lãnh thổ và số đo gộp không xuất |
| **L4** | **Tin cậy.** Luật cho bài học nhập | Theo §6: chỗ chờ, máy soát, nhận từng dòng, thử việc bằng số đo tại chỗ, gỡ theo `origin`; registry, script và nghi thức chỉ theo bản phát hành |

**Chờ được** (mỗi mục ghi lúc cần chốt):

| # | Quyết định | Khuyến nghị | Cần trước |
|---|---|---|---|
| **L5** | Bước 0: có làm ngay không, và ai làm (một phiên của chủ nhân, hay một quest trên lãnh thổ Elvaria) | Làm, bằng một phiên của chủ nhân trên một nhánh sửa nhỏ: 8 trong 11 dòng chạm prompt của người chấm, tức thước đo (nguyên tắc 17), nên không giao cho nhân vật | Không chặn gì |
| **L6** | Kế hoạch sản phẩm: sửa theo §9, và nâng lên 0.9 hay sửa trong 0.8 | Sửa trong 0.8, ghi "(161)" ở chỗ sửa: hướng này không đổi nguyên tắc nào | Trước task đầu tiên của bước 2 |
| **L7** | Địa chí: giữ như hôm nay (file của vương quốc; dữ kiện repo đáng chia sẻ thì một quest chuyển vào tài liệu của chính repo), hay thêm một file địa chí nằm trong repo mà Elvaria đọc cùng địa chí của vương quốc | Giữ như hôm nay. File trong repo đổi hợp đồng dữ liệu của lãnh thổ và đặt một file của Elvaria vào repo của người khác; xét lại khi máy thứ hai cho thấy chép tay địa chí là vướng thật | Không chặn gì |
| **L8** | Ràng buộc S1–S8 cho PS-12 | Nhận cả tám; S6 để PS-12 chọn | Khi lập kế hoạch PS-12 |
| **L9** | ADR mới (§10) | Viết cùng task đầu tiên chạm prompt, không viết bây giờ | Bước 2 hoặc 4 |
| **L10** | Tra web về cách các công cụ khác chia sẻ luật, prompt và skill (tốn token; phiên này chưa tra) | Làm một lần, trước khi viết ADR của L9, chủ yếu để kiểm danh sách của T4 với các kiểu tấn công đã biết | Trước L9 |

## 12. Điều chưa biết

- Phiên này không tra web. Hai điều dưới đây là trí nhớ của phiên, chưa kiểm lại ngày 2026-11-16: định dạng thư mục `SKILL.md` đã là một chuẩn mở mà nhiều CLI đọc được (§10 câu 2 của kế hoạch triển khai cũng ghi "nguồn thứ cấp" cho điều này), nên gói bí kíp có thể không cần định dạng riêng; và đã có báo cáo về file luật chia sẻ công khai mang ký tự ẩn để tiêm lệnh, là lý do của luật "chỉ ký tự nhìn thấy được" ở T4. Luật đó đứng được dù báo cáo đúng hay sai. Mục L10 là để kiểm.
- Bộ đếm `helped` và `missed` chưa tồn tại, nên chưa biết sau bao nhiêu lượt nạp thì một dòng nhập đủ số đo để giữ hay gỡ. PS-12 đặt mốc "ít nhất 20 phán quyết" cho một loại lỗi; ngưỡng của T6 chọn sau khi PS-12 chạy thật.
- Chưa có lần chạy thật nào trên macOS, nên mọi bài học loại C hôm nay đều đo trên Windows.
- Elvaria phát hành ra ngoài bằng cách nào (hôm nay là một checkout git mà `upgrade` dựng bản ghim từ đó) chưa được quyết; đường C dựa vào cách đó, dù nó là gì.
