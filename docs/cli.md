# Lệnh `elvaria`

> Sinh từ bảng lệnh `apps/cli/src/commands.ts` bằng `pnpm docs:gen`, CI kiểm drift: sửa nguồn rồi chạy lại lệnh, không sửa file này.

Trong repo: `pnpm elvaria <lệnh>` (Node 24 chạy thẳng `apps/cli/src/cli.ts`, không build); bản build:
`node apps/cli/dist/cli.js` sau `pnpm --filter @elvaria/cli build`. Vương quốc lấy từ `--kingdom` hoặc biến
`ELVARIA_KINGDOM`. Mã thoát: `0` xong, `1` bị từ chối hoặc lỗi (output nói vì sao), `2` sai
dòng lệnh. Chuỗi in ra theo ngôn ngữ của vương quốc (`--locale` thắng); tài liệu này là bản `vi`. Lệnh mà
task sau thêm vào bảng lệnh thì tự có ở đây.

| Lệnh | Việc |
|---|---|
| `elvaria init` | Lập một vương quốc mới: thư mục, registry mặc định và hai tộc. |
| `elvaria doctor` | Kiểm tra máy đã sẵn sàng chưa: registry, git, CLI của từng tộc (và trên Windows, PowerShell có chạy script không, cho tộc mà phiên chạy lệnh trong nó), các lãnh thổ và chương trình mà lệnh của chúng gọi, kho bảo vật, phiên còn sót. |
| `elvaria tribe list` | Liệt kê các tộc: adapter, bật hay tắt, CLI đã ghim và kiểu đăng nhập, hạng tối đa và vùng canh tộc được nhận, năng lực adapter khai. |
| `elvaria tribe add <id>` | Thêm một tộc: một adapter (có sẵn, hoặc file adapters/<name>.mjs trong vương quốc) và tài khoản của chính bạn. Tộc mới tắt; nhân vật cũ không đổi. |
| `elvaria tribe check <id>` | Chạy bộ test hợp đồng với adapter của một tộc và kiểm kiểu đăng nhập; bật tộc khi qua. Với CLI thật, bộ này chạy một việc nhỏ, một lệnh push bị cấm, một lần kill và một lần thăm dò, tốn chút mana. |
| `elvaria tribe disable <id>` | Tắt một tộc: không nhận việc mới; quest đang chạy chạy xong, quest đang chờ thì chờ. elvaria tribe check bật lại. |
| `elvaria tribe look <id>` | Xem ngoại hình của một tộc (tên, bảng màu, huy hiệu, dáng người, hào quang, khung chân dung) và nguồn của nó; kèm tùy chọn thì ghi lựa chọn của ngài vào kingdom.json. Ngoại hình chỉ để hiển thị. |
| `elvaria territory add <path>` | Gắn một repo hoặc thư mục vào vương quốc (mở cõi). |
| `elvaria territory list` | Liệt kê các lãnh thổ. |
| `elvaria territory check <id>` | Chấm một lãnh thổ: thử commands.setup và mọi check trên một đất sạch ở đầu nhánh gốc, rồi in thẻ điểm (0 mana). |
| `elvaria territory graph <id>` | Dựng đồ thị code của một lãnh thổ ở một commit (0 mana) và hỏi nó một câu. |
| `elvaria character add <id>` | Triệu hồi một nhân vật: nghề, tộc, model và cấp ban đầu. |
| `elvaria character list` | Liệt kê các nhân vật. |
| `elvaria character suspend <id>` | Đình chỉ một nhân vật: nhân vật không nhận việc và buông nhiệm vụ đang giữ, nhiệm vụ đi tiếp không có nó (lệnh suspend). |
| `elvaria character release <id>` | Thả một nhân vật bị đình chỉ: nhân vật rảnh lại và nhận việc (lệnh release). |
| `elvaria character level <id> <level>` | Đặt cấp của một nhân vật, lên hay xuống: những lần nhận việc sau theo hạng trần của cấp mới (lệnh set_level). |
| `elvaria character model <id> <model>` | Chuyển một nhân vật sang model khác của chính tộc nó: phiên sau chạy model mới, và đồng hồ mana của model đó ràng nhân vật (lệnh set_model). |
| `elvaria say [<words>]` | Nói với Tể tướng việc bạn muốn: Tể tướng soạn nhiệm vụ nháp, bạn xác nhận (lệnh create_quest, nháp). |
| `elvaria quest add` | Thêm một nhiệm vụ mở ngay, không qua Tể tướng (lệnh create_quest). |
| `elvaria quest list` | Liệt kê các nhiệm vụ trên bảng nhiệm vụ. |
| `elvaria quest show <quest>` | Xem một nhiệm vụ. |
| `elvaria quest confirm <quest>` | Xác nhận một nhiệm vụ nháp để nó mở (lệnh confirm). |
| `elvaria quest cancel <quest>` | Hủy một nhiệm vụ chưa xong; nhiệm vụ nháp thì bỏ đi, nhiệm vụ ở trạm quân y thì được lưu trữ (lệnh cancel hoặc archive). |
| `elvaria quest archive <quest>` | Lưu trữ một nhiệm vụ đã xong và giao hàng, hoặc một nhiệm vụ ở trạm quân y mà chủ nhân bỏ: Nhiếp chính gỡ worktree, giữ nhánh (lệnh archive). |
| `elvaria quest edit <quest>` | Sửa một nhiệm vụ mà không chạm vào file của nó (lệnh edit_quest). |
| `elvaria quest retry <quest>` | Mở lại một nhiệm vụ ở trạm quân y với đủ lượt thử như mới, cho mọi nhân vật đúng nghề đang rảnh hoặc cho nhân vật --to chỉ định, hoặc đưa nhiệm vụ có người chấm cứ rời đi không ra phán quyết, hay chỉ chấm dở, về chờ nghiệm thu (lệnh retry; lệnh reassign khi có --to). |
| `elvaria quest reassign <quest>` | Giao lại một nhiệm vụ cho nhân vật khác, hoặc cho nhân vật bạn chỉ định (lệnh reassign). |
| `elvaria seal <quest>` | Đóng dấu việc đang chờ dấu vua: nhiệm vụ xong (lệnh seal; nặng bằng ba phán quyết). |
| `elvaria return <quest>` | Trả việc đang chờ dấu vua về người làm, kèm ghi chú (lệnh return; nặng bằng ba phán quyết). |
| `elvaria answer <quest> <answer>` | Trả lời câu hỏi của một nhiệm vụ đang chờ bạn (elvaria quest show in câu hỏi): người làm tiếp tục với câu trả lời của bạn (lệnh answer). |
| `elvaria memo list` | Liệt kê thư nhân vật viết về việc ngoài nhiệm vụ của mình (memo), chỉ thư đang chờ trừ khi có --all. |
| `elvaria memo show <memo>` | Xem một thư: ai viết khi làm nhiệm vụ nào, gửi tới đâu, đã quyết thế nào, và toàn bộ nội dung. |
| `elvaria memo decide <memo> <decision>` | Quyết một thư, một lần: gác lại (shelved), bác (rejected), hoặc nêu nhiệm vụ làm việc đó (handled --quest); không nhiệm vụ nào đổi (lệnh decide_memo). |
| `elvaria triage` | Tể tướng phân loại các thư gửi tới mình đang chờ: một lần gọi model cho cả lô (tối đa 20 thư, cũ nhất trước). Trong phạm vi ủy quyền (kingdom.delegation), Nhiếp chính áp quyết định mà không cần bạn; thư còn lại tới bạn kèm lời khuyên, trong bản tấu. kingdom.schedule.triage chạy việc này mỗi ngày trước bản tấu. |
| `elvaria run` | Chạy Nhiếp chính: giao nhiệm vụ cho nhân vật và cho nghiệm thu, tới khi bạn dừng (Ctrl+C). |
| `elvaria wake <tribe>` | Nhờ Nhiếp chính thăm dò mana của một tộc ngay, ví dụ sau khi đăng nhập lại (lệnh wake). |
| `elvaria digest` | In bản tấu lúc này: mọi việc chờ bạn, chia hai nhóm (phải quyết để việc chạy tiếp, chờ được), mỗi việc kèm khuyến nghị và lệnh. Chỉ đọc vương quốc, không tốn mana. |
| `elvaria metrics` | Sổ đo: lượt, làm lại theo nguyên nhân, đạt lượt đầu, lỗi lọt, lần cần chủ nhân. Chỉ đọc vương quốc, không tốn mana. |
| `elvaria sandbox generate` | Sinh một ngày giả vào events/sandbox/ của vương quốc (sa bàn): không chạy phiên nào, không chạm nhiệm vụ thật. |
| `elvaria sandbox replay <file>` | Phát lại một ngày giả thành dòng thời gian trên terminal. |
| `elvaria migrate` | Chuyển mọi file cũ của vương quốc lên phiên bản hiện tại, có sao lưu, và thêm file, mục registry mà bản Elvaria này có và vương quốc còn thiếu. |
| `elvaria upgrade` | Dựng một bản mới của Elvaria cạnh bản đang ghim, thử nó (migrate, doctor và bộ test hợp đồng với CLI giả trên một bản sao cấu hình của vương quốc, một nhiệm vụ bậc script trên vương quốc tạm), qua hết mới ghim rồi chạy migrate của nó trên vương quốc; --rollback về bản trước. 0 mana; không chạy khi Nhiếp chính đang chạy. |

## Tùy chọn chung

Mọi lệnh đều nhận:

| Tùy chọn | Ý nghĩa |
|---|---|
| `--kingdom <dir>` | Thư mục vương quốc (mặc định: biến ELVARIA_KINGDOM). |
| `--locale <vi\|en>` | Ngôn ngữ in ra: vi hoặc en (mặc định: ngôn ngữ của vương quốc). |
| `-h, --help` | In hướng dẫn của lệnh. |
| `--here` | Chạy lệnh bằng chính mã này, không bằng bản mà vương quốc đang ghim (.state/build.json). |

## `elvaria init`

Lập một vương quốc mới: thư mục, registry mặc định và hai tộc.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `--name <name>` | Tên vương quốc, tối đa 24 ký tự. (bắt buộc) |
| `--profession <profession>` | Nghề của bạn: developer, ba, marketing, researcher hoặc other (mặc định developer). |
| `--tz <zone>` | Múi giờ IANA, ví dụ Asia/Ho_Chi_Minh (mặc định: múi giờ của máy). |
| `--treasury <file>` | File kho bảo vật, nằm ngoài vương quốc (mặc định ~/.elvaria/treasury.json). |

## `elvaria doctor`

Kiểm tra máy đã sẵn sàng chưa: registry, git, CLI của từng tộc (và trên Windows, PowerShell có chạy script không, cho tộc mà phiên chạy lệnh trong nó), các lãnh thổ và chương trình mà lệnh của chúng gọi, kho bảo vật, phiên còn sót.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `--tool <tribe>=<path>` | Đường dẫn CLI của một tộc khi nó không có trên PATH, ví dụ claude=C:/…/claude.exe; lặp lại cho nhiều tộc. |
| `--pin` | Ghim lại phiên bản và đường dẫn CLI vừa tìm thấy khi chúng khác bản đã ghim. |
| `--enable <tribe>` | Kiểm một tộc đang tắt như mọi tộc đang bật và chỉ bật nó trong kingdom.json (enabled: true) khi không có lỗi nào. Tộc có adapter là file của bạn thì bật bằng elvaria tribe check. |
| `--acknowledge-terms <tribe>` | Ghi nhận bạn đã đọc và chấp nhận điều khoản của nhà cung cấp cho tộc này (ADR 0018). |

## `elvaria tribe list`

Liệt kê các tộc: adapter, bật hay tắt, CLI đã ghim và kiểu đăng nhập, hạng tối đa và vùng canh tộc được nhận, năng lực adapter khai.

Không có tham số riêng, chỉ các tùy chọn chung.

## `elvaria tribe add`

Thêm một tộc: một adapter (có sẵn, hoặc file adapters/<name>.mjs trong vương quốc) và tài khoản của chính bạn. Tộc mới tắt; nhân vật cũ không đổi.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<id>` | Id của tộc mới, ví dụ codex: chữ thường, chữ số và _, bắt đầu bằng chữ. |
| `--adapter <adapter>` | claude_code, antigravity, gemini_cli, codex_cli, hoặc adapters/<name>.mjs: một file bạn đặt trong thư mục adapters của vương quốc, export createAdapter(kit). (bắt buộc) |
| `--max-concurrent <n>` | Số phiên tài khoản chạy cùng lúc (mặc định 1). |

## `elvaria tribe check`

Chạy bộ test hợp đồng với adapter của một tộc và kiểm kiểu đăng nhập; bật tộc khi qua. Với CLI thật, bộ này chạy một việc nhỏ, một lệnh push bị cấm, một lần kill và một lần thăm dò, tốn chút mana.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<id>` | Một id tộc trong kingdom.json. |
| `--scenarios` | Chạy mọi phép kiểm: CLI là bản giả, diễn các kịch bản của bộ test từ ELVARIA_FAKE_SCENARIO. |
| `--model <model>` | Model của nhân vật thăm dò: mặc định là default_model của tộc, không có thì model rẻ nhất mà nhân vật của tộc chạy ở pool đang bật. |
| `--tool <path>` | Thử một CLI khác thay cho CLI đã ghim (một bản mới, hay CLI giả với --scenarios), chỉ trong lần chạy này: kingdom.json không đổi, tộc không được bật. |

## `elvaria tribe disable`

Tắt một tộc: không nhận việc mới; quest đang chạy chạy xong, quest đang chờ thì chờ. elvaria tribe check bật lại.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<id>` | Một id tộc trong kingdom.json. |

## `elvaria tribe look`

Xem ngoại hình của một tộc (tên, bảng màu, huy hiệu, dáng người, hào quang, khung chân dung) và nguồn của nó; kèm tùy chọn thì ghi lựa chọn của ngài vào kingdom.json. Ngoại hình chỉ để hiển thị.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<id>` | Một id tộc trong kingdom.json. |
| `--palette <id>` | Bảng màu (id trong kho của theme); không được trùng bảng màu của tộc khác. |
| `--crest <id>` | Huy hiệu (id trong kho của theme); không được trùng huy hiệu của tộc khác. |
| `--figure <id>` | Dáng người (id trong kho của theme). |
| `--aura <id>` | Hào quang (id trong kho của theme). |
| `--frame <id>` | Khung chân dung (id trong kho của theme). |
| `--name <name>` | Tên hiển thị của tộc, tối đa 24 ký tự; không có thì tên ghép từ huy hiệu và bảng màu. |
| `--reset` | Bỏ lựa chọn của ngài: tộc lại mang mục ghim của theme, hay ngoại hình tự sinh. |

## `elvaria territory add`

Gắn một repo hoặc thư mục vào vương quốc (mở cõi).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<path>` | Thư mục của lãnh thổ. |
| `--id <id>` | id của lãnh thổ (mặc định: tên thư mục, viết thường, nối bằng gạch ngang). |
| `--name <name>` | Tên hiển thị, tối đa 24 ký tự (mặc định: tên thư mục). |
| `--kind <kind>` | Loại lãnh thổ: code, docs, content, data hoặc mixed (mặc định code). |
| `--branch <branch>` | Nhánh mặc định, nơi các nhánh quest tách ra (mặc định: HEAD của origin, rồi nhánh đang checkout). |

## `elvaria territory list`

Liệt kê các lãnh thổ.

Không có tham số riêng, chỉ các tùy chọn chung.

## `elvaria territory check`

Chấm một lãnh thổ: thử commands.setup và mọi check trên một đất sạch ở đầu nhánh gốc, rồi in thẻ điểm (0 mana).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<id>` | Id của lãnh thổ. |

## `elvaria territory graph`

Dựng đồ thị code của một lãnh thổ ở một commit (0 mana) và hỏi nó một câu.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<id>` | Id của lãnh thổ. |
| `--commit <ref>` | Commit, nhánh hoặc tag để dựng (mặc định: đầu nhánh mặc định). |
| `--query <words>` | Các từ để hỏi đồ thị (tên mã và đường dẫn cho kết quả tốt nhất), như graphify query. |

## `elvaria character add`

Triệu hồi một nhân vật: nghề, tộc, model và cấp ban đầu.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<id>` | id của nhân vật: chữ thường, số và gạch ngang, ví dụ thorn. |
| `--class <class>` | Nghề, theo registry/classes.json (knight, scribe, judge…). (bắt buộc) |
| `--tribe <tribe>` | Tộc, một id trong kingdom.tribes (mặc định: tộc gợi ý của nghề). |
| `--model <model>` | Model của CLI (mặc định: model gợi ý của nghề trong tộc của nó). |
| `--level <1-10>` | Cấp ban đầu 1–10, đặt theo độ mạnh của model (mặc định theo model: Opus hoặc Astra 5, Sonnet, Pro hoặc Sol 4, Argon hoặc Terra 3, Haiku, Flash hoặc Luna 2, model khác 1). |
| `--name <name>` | Tên hiển thị, tối đa 24 ký tự (mặc định: id viết hoa chữ đầu). |

## `elvaria character list`

Liệt kê các nhân vật.

Không có tham số riêng, chỉ các tùy chọn chung.

## `elvaria character suspend`

Đình chỉ một nhân vật: nhân vật không nhận việc và buông nhiệm vụ đang giữ, nhiệm vụ đi tiếp không có nó (lệnh suspend).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<id>` | id của nhân vật, ví dụ thorn. |
| `--reason <text>` | Lý do đình chỉ (giữ cùng lệnh). |

## `elvaria character release`

Thả một nhân vật bị đình chỉ: nhân vật rảnh lại và nhận việc (lệnh release).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<id>` | id của nhân vật, ví dụ thorn. |

## `elvaria character level`

Đặt cấp của một nhân vật, lên hay xuống: những lần nhận việc sau theo hạng trần của cấp mới (lệnh set_level).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<id>` | id của nhân vật, ví dụ thorn. |
| `<level>` | Cấp mới, 1–10. |

## `elvaria character model`

Chuyển một nhân vật sang model khác của chính tộc nó: phiên sau chạy model mới, và đồng hồ mana của model đó ràng nhân vật (lệnh set_model).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<id>` | id của nhân vật, ví dụ thorn. |
| `<model>` | Model CLI mới, cùng tộc, ví dụ gemini-3.8-flash-high. |

## `elvaria say`

Nói với Tể tướng việc bạn muốn: Tể tướng soạn nhiệm vụ nháp, bạn xác nhận (lệnh create_quest, nháp).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `[<words>]` | Việc bạn muốn làm, bằng lời của bạn, trong ngoặc kép; có --memo thì không bắt buộc. |
| `--memo <memo>` | Đưa Tể tướng một thư (memo) thay cho, hoặc cùng với, lời của bạn: Tể tướng soạn nhiệm vụ từ thư. |

## `elvaria quest add`

Thêm một nhiệm vụ mở ngay, không qua Tể tướng (lệnh create_quest).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `--title <text>` | Tiêu đề, tối đa 120 ký tự. (bắt buộc) |
| `--description <text>` | Mô tả việc cần làm. (bắt buộc) |
| `--kind <kind>` | Dạng nhiệm vụ, theo registry/kinds.json (build, fix, document…). (bắt buộc) |
| `--rank <F..S>` | Hạng: F, E, D, C, B, A hoặc S. (bắt buộc) |
| `--territory <id>` | id của lãnh thổ. (bắt buộc) |
| `--class <class>` | Nghề được nhận (mặc định: nghề duy nhất mà dạng nhiệm vụ cho phép). |
| `--tag <tag>` | Chuyên môn, theo registry/tags.json; lặp lại cho nhiều tag (tối đa 6). |
| `--seal` | Cần dấu vua trước khi xong (--no-seal để tắt; mặc định theo dạng nhiệm vụ). |
| `--depends-on <quest>` | Nhiệm vụ phải xong trước; lặp lại cho nhiều nhiệm vụ. |
| `--script <script>` | Chạy ở bậc script: một id trong registry/scripts.json, không gọi model, không tốn mana. |
| `--params <json>` | Tham số của script, một đối tượng JSON. |
| `--to <character>` | Nhân vật nhận việc: chỉ nhân vật này nhận nhiệm vụ, cấp nào cũng được (vượt hạng trần thì nhiệm vụ chờ dấu vua). Đúng nghề của nhiệm vụ; không dùng cho nhiệm vụ bậc script. |
| `--contract` | Nhiệm vụ là quest hợp đồng của một đội: trưởng đội viết hợp đồng rồi chia phần, Nhiếp chính tự thêm quest ghép. Trong mô tả, một dòng --- kết thúc phần việc: phần sau chỉ dành cho trưởng đội, người viết test của Khảo hạch mù không đọc. |
| `--scope <glob>` | Glob của các file nhiệm vụ sẽ sửa, tính từ gốc lãnh thổ; lặp lại cho nhiều glob. Hai nhiệm vụ có vùng giao nhau không bao giờ chạy cùng lúc trên một lãnh thổ; nhiệm vụ không khai vùng thì chạy một mình ở đó. |

## `elvaria quest list`

Liệt kê các nhiệm vụ trên bảng nhiệm vụ.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `--status <status>` | Chỉ hiện trạng thái này (id, ví dụ open); lặp lại cho nhiều trạng thái. |
| `--territory <id>` | Chỉ hiện nhiệm vụ của lãnh thổ này. |

## `elvaria quest show`

Xem một nhiệm vụ.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<quest>` | id của nhiệm vụ, ví dụ q_20261106_7k3m2a. |

## `elvaria quest confirm`

Xác nhận một nhiệm vụ nháp để nó mở (lệnh confirm).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<quest>` | id của nhiệm vụ, ví dụ q_20261106_7k3m2a. |

## `elvaria quest cancel`

Hủy một nhiệm vụ chưa xong; nhiệm vụ nháp thì bỏ đi, nhiệm vụ ở trạm quân y thì được lưu trữ (lệnh cancel hoặc archive).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<quest>` | id của nhiệm vụ, ví dụ q_20261106_7k3m2a. |
| `--reason <text>` | Lý do hủy. |

## `elvaria quest archive`

Lưu trữ một nhiệm vụ đã xong và giao hàng, hoặc một nhiệm vụ ở trạm quân y mà chủ nhân bỏ: Nhiếp chính gỡ worktree, giữ nhánh (lệnh archive).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<quest>` | id của nhiệm vụ, ví dụ q_20261106_7k3m2a. |

## `elvaria quest edit`

Sửa một nhiệm vụ mà không chạm vào file của nó (lệnh edit_quest).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<quest>` | id của nhiệm vụ, ví dụ q_20261106_7k3m2a. |
| `--title <text>` | Tiêu đề, tối đa 120 ký tự. |
| `--description <text>` | Mô tả việc cần làm. |
| `--rank <F..S>` | Hạng: F, E, D, C, B, A hoặc S. |
| `--seal` | Bật (--seal) hoặc tắt (--no-seal) yêu cầu dấu vua. |
| `--depends-on <quest>` | Danh sách phụ thuộc mới, thay cho danh sách cũ; lặp lại cho nhiều nhiệm vụ. |
| `--max-minutes <n>` | Trần số phút cho một lần thử. |
| `--max-tokens <n>` | Trần số token cho một lần thử. |
| `--max-attempts <n>` | Số lần thử tối đa. |
| `--scope <glob>` | Vùng file mới, thay cho vùng cũ: glob của các file nhiệm vụ sẽ sửa; lặp lại cho nhiều glob. |

## `elvaria quest retry`

Mở lại một nhiệm vụ ở trạm quân y với đủ lượt thử như mới, cho mọi nhân vật đúng nghề đang rảnh hoặc cho nhân vật --to chỉ định, hoặc đưa nhiệm vụ có người chấm cứ rời đi không ra phán quyết, hay chỉ chấm dở, về chờ nghiệm thu (lệnh retry; lệnh reassign khi có --to).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<quest>` | id của nhiệm vụ, ví dụ q_20261106_7k3m2a. |
| `--to <character>` | Nhân vật làm lại, đúng nghề của nhiệm vụ, cấp nào cũng được (vượt hạng trần thì nhiệm vụ chờ dấu vua): chỉ nhân vật này nhận nhiệm vụ, với đủ lượt thử như mới (lệnh reassign). Không có thì nhiệm vụ mở cho mọi nhân vật đúng nghề đang rảnh. |

## `elvaria quest reassign`

Giao lại một nhiệm vụ cho nhân vật khác, hoặc cho nhân vật bạn chỉ định (lệnh reassign).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<quest>` | id của nhiệm vụ, ví dụ q_20261106_7k3m2a. |
| `--to <character>` | Nhân vật nhận việc, đúng nghề của nhiệm vụ, cấp nào cũng được (vượt hạng trần thì nhiệm vụ chờ dấu vua). Không có thì Nhiếp chính chọn trong những người đang rảnh. |

## `elvaria seal`

Đóng dấu việc đang chờ dấu vua: nhiệm vụ xong (lệnh seal; nặng bằng ba phán quyết).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<quest>` | id của nhiệm vụ, ví dụ q_20261106_7k3m2a. |
| `--note <text>` | Một lời cho người làm, lưu cùng dấu vua. |

## `elvaria return`

Trả việc đang chờ dấu vua về người làm, kèm ghi chú (lệnh return; nặng bằng ba phán quyết).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<quest>` | id của nhiệm vụ, ví dụ q_20261106_7k3m2a. |
| `--note <text>` | Sai gì, ở đâu, ít nhất 20 ký tự: người làm đọc nó ở phiên kế tiếp. (bắt buộc) |
| `--fail-kind <kind>` | Kiểu lỗi, để đếm những lần trượt cùng kiểu liền nhau: tests_fail, scope_creep, missing_i18n, wrong_facts, incomplete, style, unsafe hoặc other (mặc định). |
| `--rejudge` | Người chấm làm hỏng, không phải người làm (không đập thử, shell không chạy được test): việc quay lại để chấm lại, và lần trả này không tính vào danh tiếng hay chuỗi trượt của người làm. |

## `elvaria answer`

Trả lời câu hỏi của một nhiệm vụ đang chờ bạn (elvaria quest show in câu hỏi): người làm tiếp tục với câu trả lời của bạn (lệnh answer).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<quest>` | id của nhiệm vụ, ví dụ q_20261106_7k3m2a. |
| `<answer>` | Câu trả lời của bạn cho câu hỏi của nhân vật, trong ngoặc kép. |

## `elvaria memo list`

Liệt kê thư nhân vật viết về việc ngoài nhiệm vụ của mình (memo), chỉ thư đang chờ trừ khi có --all.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `--all` | In cả thư đã quyết. |

## `elvaria memo show`

Xem một thư: ai viết khi làm nhiệm vụ nào, gửi tới đâu, đã quyết thế nào, và toàn bộ nội dung.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<memo>` | id của thư, ví dụ m_20261112_4k2pqz (elvaria memo list in ra). |

## `elvaria memo decide`

Quyết một thư, một lần: gác lại (shelved), bác (rejected), hoặc nêu nhiệm vụ làm việc đó (handled --quest); không nhiệm vụ nào đổi (lệnh decide_memo).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<memo>` | id của thư, ví dụ m_20261112_4k2pqz (elvaria memo list in ra). |
| `<decision>` | shelved, rejected hoặc handled. |
| `--quest <quest>` | Đi với handled: nhiệm vụ làm việc đó. |
| `--note <text>` | Ghi chú lưu cùng quyết định. |

## `elvaria triage`

Tể tướng phân loại các thư gửi tới mình đang chờ: một lần gọi model cho cả lô (tối đa 20 thư, cũ nhất trước). Trong phạm vi ủy quyền (kingdom.delegation), Nhiếp chính áp quyết định mà không cần bạn; thư còn lại tới bạn kèm lời khuyên, trong bản tấu. kingdom.schedule.triage chạy việc này mỗi ngày trước bản tấu.

Không có tham số riêng, chỉ các tùy chọn chung.

## `elvaria run`

Chạy Nhiếp chính: giao nhiệm vụ cho nhân vật và cho nghiệm thu, tới khi bạn dừng (Ctrl+C).

Không có tham số riêng, chỉ các tùy chọn chung.

## `elvaria wake`

Nhờ Nhiếp chính thăm dò mana của một tộc ngay, ví dụ sau khi đăng nhập lại (lệnh wake).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<tribe>` | Tộc cần thăm dò lại tài khoản (một id trong kingdom.json). |

## `elvaria digest`

In bản tấu lúc này: mọi việc chờ bạn, chia hai nhóm (phải quyết để việc chạy tiếp, chờ được), mỗi việc kèm khuyến nghị và lệnh. Chỉ đọc vương quốc, không tốn mana.

Không có tham số riêng, chỉ các tùy chọn chung.

## `elvaria metrics`

Sổ đo: lượt, làm lại theo nguyên nhân, đạt lượt đầu, lỗi lọt, lần cần chủ nhân. Chỉ đọc vương quốc, không tốn mana.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `--since <yyyy-mm-dd>` | Từ ngày này, tính cả ngày đó (yyyy-mm-dd). |
| `--until <yyyy-mm-dd>` | Tới ngày này, tính cả ngày đó (yyyy-mm-dd). |
| `--json` | In toàn bộ số đo dạng JSON thay cho bảng. |
| `--plan <quest>` | Thay cho sổ đo: các quest con của một quest kế hoạch đã chạy ra sao so với kế hoạch: vùng khai cạnh file đã chạm, ước lượng cạnh token, thư và lượt làm lại. |

## `elvaria sandbox generate`

Sinh một ngày giả vào events/sandbox/ của vương quốc (sa bàn): không chạy phiên nào, không chạm nhiệm vụ thật.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `--day <busy\|quiet\|mana-out>` | Kịch bản: busy (bận), quiet (vắng) hoặc mana-out (hết mana); mặc định busy. |
| `--seed <n>` | Số nguyên từ 0; cùng seed cho cùng một ngày (mặc định: ngẫu nhiên, in ra để lặp lại). |
| `--date <YYYY-MM-DD>` | Ngày giả YYYY-MM-DD theo múi giờ của vương quốc (mặc định: hôm nay). |

## `elvaria sandbox replay`

Phát lại một ngày giả thành dòng thời gian trên terminal.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<file>` | File ngày giả, ví dụ <vương quốc>/events/sandbox/2026-11-06.jsonl. |
| `--speed <n>` | Nhanh gấp bao nhiêu lần thời gian thật (mặc định 20: mười giờ trong ba mươi phút). |
| `--to <terminal>` | Phát tới đâu: terminal (Sứ giả phát qua WebSocket từ giai đoạn 2). |

## `elvaria migrate`

Chuyển mọi file cũ của vương quốc lên phiên bản hiện tại, có sao lưu, và thêm file, mục registry mà bản Elvaria này có và vương quốc còn thiếu.

Không có tham số riêng, chỉ các tùy chọn chung.

## `elvaria upgrade`

Dựng một bản mới của Elvaria cạnh bản đang ghim, thử nó (migrate, doctor và bộ test hợp đồng với CLI giả trên một bản sao cấu hình của vương quốc, một nhiệm vụ bậc script trên vương quốc tạm), qua hết mới ghim rồi chạy migrate của nó trên vương quốc; --rollback về bản trước. 0 mana; không chạy khi Nhiếp chính đang chạy.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `--ref <ref>` | Commit, nhánh hay tag của repo Elvaria mà lệnh này chạy từ đó (mặc định: main). |
| `--rollback` | Ghim lại bản trước, không dựng gì. |
