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
| `elvaria doctor` | Kiểm tra máy đã sẵn sàng chưa: registry, git, CLI của từng tộc, các lãnh thổ. |
| `elvaria territory add <path>` | Gắn một repo hoặc thư mục vào vương quốc (mở cõi). |
| `elvaria territory list` | Liệt kê các lãnh thổ. |
| `elvaria character add <id>` | Triệu hồi một nhân vật: nghề, tộc, model và cấp ban đầu. |
| `elvaria character list` | Liệt kê các nhân vật. |
| `elvaria quest add` | Thêm một nhiệm vụ mở ngay, không qua Tể tướng (lệnh create_quest). |
| `elvaria quest list` | Liệt kê các nhiệm vụ trên bảng nhiệm vụ. |
| `elvaria quest show <quest>` | Xem một nhiệm vụ. |
| `elvaria quest confirm <quest>` | Xác nhận một nhiệm vụ nháp để nó mở (lệnh confirm). |
| `elvaria quest cancel <quest>` | Hủy một nhiệm vụ chưa xong; nhiệm vụ nháp thì bỏ đi (lệnh cancel hoặc archive). |
| `elvaria quest edit <quest>` | Sửa một nhiệm vụ mà không chạm vào file của nó (lệnh edit_quest). |
| `elvaria run` | Chạy Quản sự: giao nhiệm vụ cho nhân vật và cho nghiệm thu, tới khi bạn dừng (Ctrl+C). |
| `elvaria sandbox generate` | Sinh một ngày giả vào events/sandbox/ của vương quốc (sa bàn): không chạy phiên nào, không chạm nhiệm vụ thật. |
| `elvaria sandbox replay <file>` | Phát lại một ngày giả thành dòng thời gian trên terminal. |
| `elvaria migrate` | Chuyển mọi file cũ của vương quốc lên phiên bản hiện tại, có sao lưu. |

## Tùy chọn chung

Mọi lệnh đều nhận:

| Tùy chọn | Ý nghĩa |
|---|---|
| `--kingdom <dir>` | Thư mục vương quốc (mặc định: biến ELVARIA_KINGDOM). |
| `--locale <vi\|en>` | Ngôn ngữ in ra: vi hoặc en (mặc định: ngôn ngữ của vương quốc). |
| `-h, --help` | In hướng dẫn của lệnh. |

## `elvaria init`

Lập một vương quốc mới: thư mục, registry mặc định và hai tộc.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `--name <name>` | Tên vương quốc, tối đa 24 ký tự. (bắt buộc) |
| `--profession <profession>` | Nghề của bạn: developer, ba, marketing, researcher hoặc other (mặc định developer). |
| `--tz <zone>` | Múi giờ IANA, ví dụ Asia/Ho_Chi_Minh (mặc định: múi giờ của máy). |
| `--treasury <file>` | File kho bảo vật, nằm ngoài vương quốc (mặc định ~/.elvaria/treasury.json). |

## `elvaria doctor`

Kiểm tra máy đã sẵn sàng chưa: registry, git, CLI của từng tộc, các lãnh thổ.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `--tool <tribe>=<path>` | Đường dẫn CLI của một tộc khi nó không có trên PATH, ví dụ claude=C:/…/claude.exe; lặp lại cho nhiều tộc. |
| `--pin` | Ghim lại phiên bản và đường dẫn CLI vừa tìm thấy khi chúng khác bản đã ghim. |
| `--acknowledge-terms <tribe>` | Ghi nhận bạn đã đọc và chấp nhận điều khoản của nhà cung cấp cho tộc này (ADR 0018). |

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

## `elvaria character add`

Triệu hồi một nhân vật: nghề, tộc, model và cấp ban đầu.

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<id>` | id của nhân vật: chữ thường, số và gạch ngang, ví dụ thorn. |
| `--class <class>` | Nghề, theo registry/classes.json (knight, scribe, judge…). (bắt buộc) |
| `--tribe <tribe>` | Tộc, một id trong kingdom.tribes (mặc định: tộc gợi ý của nghề). |
| `--model <model>` | Model của CLI (mặc định: model gợi ý của nghề trong tộc của nó). |
| `--level <1-10>` | Cấp ban đầu 1–10, đặt theo độ mạnh của model (mặc định 1). |
| `--name <name>` | Tên hiển thị, tối đa 24 ký tự (mặc định: id viết hoa chữ đầu). |

## `elvaria character list`

Liệt kê các nhân vật.

Không có tham số riêng, chỉ các tùy chọn chung.

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

Hủy một nhiệm vụ chưa xong; nhiệm vụ nháp thì bỏ đi (lệnh cancel hoặc archive).

| Tham số / tùy chọn | Ý nghĩa |
|---|---|
| `<quest>` | id của nhiệm vụ, ví dụ q_20261106_7k3m2a. |
| `--reason <text>` | Lý do hủy. |

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

## `elvaria run`

Chạy Quản sự: giao nhiệm vụ cho nhân vật và cho nghiệm thu, tới khi bạn dừng (Ctrl+C).

Không có tham số riêng, chỉ các tùy chọn chung.

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

Chuyển mọi file cũ của vương quốc lên phiên bản hiện tại, có sao lưu.

Không có tham số riêng, chỉ các tùy chọn chung.
