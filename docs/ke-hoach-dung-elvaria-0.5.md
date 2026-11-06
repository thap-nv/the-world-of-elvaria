# Kế hoạch dựng Elvaria

Ngày: 2026-11-06 · Phiên bản 0.5 (0.4 + mô hình nghề / skill / kinh, chuyên môn theo danh tiếng tag, và luật đội cho việc nhiều chuyên môn)

**Elvaria** là tên sản phẩm và repo. Mỗi người dùng tự đặt tên vương quốc của mình khi mở lần đầu và tên từng lãnh địa khi gắn dự án (mặc định là tên repo).

---

## 1. Tóm tắt

Elvaria là một thế giới fantasy low-poly 3D chạy trên máy cá nhân (Windows và macOS), trong đó mỗi AI agent là một nhân vật có nghề: nhận việc thật từ bảng nhiệm vụ, làm, được nhân vật khác nghiệm thu, và giao ra code, tài liệu, nghiên cứu thật. Thế giới là giao diện quản lý, không phải trang trí bên cạnh giao diện quản lý.

Một vương quốc = một người dùng = một máy. Developer, BA, marketing, researcher dùng cùng một thế giới nhưng sống ở những khu khác nhau của nó. Không có server chung, không đồng bộ giữa các máy.

Tiêu chí thành công của bản v1:

- Nói một câu với Tể tướng → quest đúng dạng xuất hiện trên bảng, nhân vật đúng nghề tự nhận và làm.
- Mọi quest xong đều qua nghiệm thu của một nhân vật khác, phiên khác; không có "tự làm tự chấm".
- Hết mana không mất việc: đăng nhập lại là nhân vật tỉnh dậy và làm tiếp từ journal.
- Thế giới nhàn rỗi dùng dưới 5% CPU; để cạnh VS Code cả ngày không nóng máy.
- Biên niên sử mỗi tối đọc được như một báo cáo ngày.
- Mở trên điện thoại từ xa: thấy việc cần duyệt, đóng dấu, ra lệnh cho Tể tướng — máy ở nhà làm tiếp.

---

## 2. Nguyên tắc nền

Mười ba điều không đổi trong suốt dự án. Mọi quyết định thiết kế sau này phải đối chiếu với danh sách này.

1. **Ba tầng tách biệt.** Tầng việc (work engine) – tầng sự kiện (event bus) – tầng thế giới (renderer). Renderer chỉ *nghe* sự kiện, không bao giờ gọi ngược vào tầng việc. Thay toàn bộ hình ảnh mà không đụng logic.
2. **Local-first.** Một máy là một vương quốc. Trạng thái là file trong một thư mục. Không tài khoản, không server, không realtime liên máy.
3. **Trạng thái việc nằm ngoài phiên agent.** Nhân vật có thể chết bất cứ lúc nào (hết mana, crash, tắt máy) mà không mất việc. Journal của quest là nguồn sự thật, không phải trí nhớ phiên chat.
4. **Người làm không phán.** Nghiệm thu luôn do nhân vật khác, phiên mới, chưa thấy quá trình làm; ưu tiên khác nhà cung cấp (Claude làm thì Gemini duyệt và ngược lại).
5. **Mỗi nhân vật một nghề.** Không kiêm nhiệm. Thiếu người thì triệu hồi thêm, không ép hiệp sĩ đi chép sách.
6. **Mana là hạn mức, và chỉ có hai nguồn.** Một tài khoản Claude Code + một tài khoản Antigravity/Gemini. Hệ thống không bao giờ tự xoay tài khoản; hồi sinh là việc của người dùng. Thế giới dùng tới trần người dùng đặt (mặc định 98%) nhưng luôn chừa **phần của vua**.
7. **Ánh xạ là dữ liệu.** Dạng nhiệm vụ → tòa nhà, hoạt hình, nghi thức nằm trong file theme. Đổi theme không sửa lõi.
8. **Nhẹ là luật, không phải mục tiêu.** Vẽ khi có thay đổi; trần 30 fps; tab ẩn thì dừng.
9. **Mọi thứ nhìn được đều hỏi được.** Click nhân vật, tòa nhà, quái → thông tin thật và hành động thật.
10. **Sa bàn trước, sắc đẹp sau.** Logic chạy đúng trên hộp xám rồi mới tô.
11. **Tỉ lệ thật trong lãnh thổ, nén giữa các lãnh thổ.** Nhà đúng cỡ và vào được, núi leo được; đường giữa các vùng rút ngắn, một chuyến đi không quá 20 giây.
12. **Thế giới mọc dần.** Gắn repo là mở cõi. Quốc vương phải thấy được tất cả, nên mọi thứ xa camera đều có dạng rút gọn, và luôn có một lớp "cần ngài" nói việc gì đang chờ.
13. **Một quest, một context.** Mỗi nhân vật là một phiên cấp cao nhất mới, nạp đúng phần cần từ journal, kinh và địa chí; trí nhớ dài nằm trên đĩa, không nằm trong phiên. Tể tướng chia việc sao cho một quest xong trong một context; việc dài hơn thì chia, không kéo dài phiên. Cái gì máy làm được thì không gọi model.

---

## 3. Kiến trúc tổng thể

```mermaid
flowchart LR
    U[Người dùng<br/>Lãnh chúa] -->|câu lệnh tự nhiên| TT[Tể tướng<br/>intake agent]
    TT -->|quest.json| QB[(Bảng nhiệm vụ<br/>quests/)]
    QB --> DS[Quản sự<br/>dispatcher]
    DS -->|chọn nhân vật đúng nghề| RC[Runner Claude Code]
    DS -->|chọn nhân vật đúng nghề| RG[Runner Gemini CLI]
    RC -->|worktree riêng| WK[Đất riêng<br/>git worktree / thư mục]
    RG --> WK
    RC -->|hooks + JSON| EV[(Sự kiện<br/>events/*.jsonl)]
    RG -->|hooks + JSON| EV
    DS -->|quest.state| EV
    EV --> SG[Sứ giả<br/>world server, localhost]
    SG -->|WebSocket| R3[Thế giới 3D<br/>trình duyệt, Three.js]
    R3 -->|click: xem / triệu hồi / đóng dấu| SG
    SG --> QB
    DS -->|quest xong| VF[Nhân vật nghiệm thu<br/>khác người, khác phiên]
    VF -->|verdict.json| QB
    QB -->|cần dấu vua| NG[Ngai vàng<br/>hàng đợi + chuông điện thoại]
    SCH[Lịch: Thầy tu, Nhà thơ, Tuần tra] --> EV
    SCH --> QB
```

Thành phần và trách nhiệm:

| Thành phần | Tên trong thế giới | Làm gì | Công nghệ dự kiến |
|---|---|---|---|
| Intake agent | Tể tướng | Nhận câu lệnh tự nhiên, tách thành quest đúng dạng, ước lượng hạng và mana, hỏi lại tối đa một câu | Agent chạy bằng Claude (Sonnet), prompt + schema quest |
| Bảng nhiệm vụ | Hội quán | Lưu quest, trạng thái, journal, verdict | Thư mục file JSON + Markdown (SQLite khi cần truy vấn) |
| Dispatcher | Quản sự | Vòng lặp: chọn quest → chọn nhân vật → spawn runner → theo dõi cầu dao → chuyển sang nghiệm thu → giao hàng | Node.js hoặc Python, một tiến trình nền |
| Runner | Sứ giả triệu hồi | Mở phiên agent với prompt dựng từ quest + kinh + địa chí; chuẩn hóa output thành sự kiện | Gọi `claude` và `gemini` ở chế độ headless; script Node chạy y hệt trên Windows và macOS |
| Event log | Biên niên gốc | Mọi sự kiện, một dòng JSON, theo ngày | JSONL, append-only |
| World server | Sứ giả | Đọc event log, giữ world state, phục vụ renderer | Node.js, WebSocket, tĩnh trên localhost |
| Renderer | Thế giới | Góc nhìn Chúa, nhân vật, tòa nhà, nghi thức, trận đánh | Three.js + Vite, chạy trong trình duyệt |
| Verifier | Thợ cả, Thủ thư trưởng, Trọng tài, Hiền giả… | Chạy kiểm tra máy rồi chấm theo nghi thức của dạng nhiệm vụ | Nhân vật nghề nghiệm thu, giới "không làm" |
| Lịch | Thầy tu, Nhà thơ, Tuần tra | Phản tỉnh, biên niên sử, phát hiện vấn đề | Bộ lịch tích hợp trong Quản sự (không dựa vào cron hay Task Scheduler), model rẻ |
| Đường hầm (tùy chọn) | Cổng thành | Mở Sứ giả ra ngoài có xác thực để điện thoại hoặc máy khác xem và điều khiển | Tailscale hoặc Cloudflare Tunnel + token; khách nhẹ 2D cho điện thoại |

Luồng một quest từ đầu đến cuối:

1. Người dùng gõ lệnh → Tể tướng tạo `quests/<id>.json` (trạng thái `open`).
2. Quản sự thấy quest `open`, lọc nhân vật rảnh đúng nghề, đủ cấp, tộc còn mana, rồi xếp theo danh tiếng trên các tag của quest → `claimed`.
3. Runner tạo đất riêng (worktree cho code, thư mục cho tài liệu), dựng prompt (quest + journal + kinh + địa chí + tối đa 3 bí kíp khớp tag và lãnh thổ), mở phiên → `working`. Hooks ghi sự kiện; nhân vật trên bản đồ đi tới đúng tòa nhà.
4. Agent ghi journal theo mốc, nộp bài → `review`.
5. Quản sự chọn nhân vật nghiệm thu (khác người, khác phiên, ưu tiên khác tộc) → chạy kiểm tra máy → chấm theo nghi thức → `verdict`.
6. Đạt → `done`, giao hàng theo quy ước của dạng; cần dấu vua → `awaiting_seal` + chuông. Không đạt → `returned` kèm ghi chú, quay lại bước 3 với cùng nhân vật (tối đa N lần).
7. Tối: Nhà thơ đọc sự kiện ngày → `chronicle/<ngày>.md`.

---

## 4. Mô hình dữ liệu

### Quest

| Trường | Kiểu | Ghi chú |
|---|---|---|
| id, title, description | string | |
| kind | enum | 11 dạng ở mục 5 |
| rank | F, E, D, C, B, A, S | Tể tướng ước lượng, người dùng sửa được |
| class_required | string | nghề được nhận |
| tags | string[] | chuyên môn: frontend, backend, db, infra, i18n, e2e, docs… do Tể tướng gán; quyết định xếp hạng nhân vật và bí kíp được nạp |
| party_id, contract | id, path | thuộc đội nào; hợp đồng giữa các phần (ví dụ OpenAPI) nếu là quest con của đội |
| territory | id | dự án/thư mục |
| status | enum | open, claimed, working, review, returned, done, awaiting_seal, blocked, paused_mana, infirmary, archived |
| assignee, verifier | character id | verifier ≠ assignee, luôn |
| campaign_id, parent_id | id | thuộc chiến dịch / quest cha |
| budget | {max_minutes, max_tokens, max_attempts} | cầu dao |
| attempts | number | |
| journal | path | `quests/<id>/journal.md` |
| deliverable | {type, path hoặc branch} | quy ước giao hàng theo dạng |
| seal_required | boolean | |
| created_at, updated_at | ISO | |

### Character

| Trường | Ghi chú |
|---|---|
| id, name | |
| class | nghề (mục 6) |
| provider | claude hoặc gemini |
| model | tier hiện tại |
| level | 1–10 |
| gear_tier | 1–4, suy từ cấp (1–3, 4–6, 7–9, 10); quyết định trang bị hiển thị |
| reputation | {pass, fail, human_pass, human_fail, window[]} |
| skill_affinity | {tag: {pass, fail, window[]}} — danh tiếng theo từng tag, tự tích lũy; nguồn của chuyên môn |
| title | danh hiệu hiện trên đầu, sinh từ tag có danh tiếng cao nhất (hoặc người dùng ghim) |
| status | idle, working, reviewing, sleeping_mana, meditating, suspended, swamp |
| scripture | path `characters/<id>/scripture.md` (kinh riêng) |
| vow_no_production | true cho nghề nghiệm thu và thầy tu |

### Territory

| Trường | Ghi chú |
|---|---|
| id, name, path | repo hoặc thư mục |
| kind | code, docs, content, data, mixed |
| gazetteer | path `territories/<id>/gazetteer.md` (địa chí: cấu trúc, cách build, quy ước) |
| buildings[] | sinh từ khảo sát điền địa: module → tòa nhà, test → tường, docs → kệ |
| health | {ci, open_bugs, last_patrol} → thời tiết |
| worktrees[] | lều trại đang mở |
| map_anchor, bounds | vị trí và ranh giới trên bản đồ, sinh khi mở cõi |
| lod | full, reduced, icon — theo khoảng cách camera và số lãnh thổ đang mở |

### Campaign (Chiến tranh)

| Trường | Ghi chú |
|---|---|
| id, name, mode | offense (release, launch, epic) hoặc defense (sự cố) |
| fronts[] | mỗi mặt trận: tên, mục tiêu, quest_ids[] |
| victory_conditions[] | điều kiện kiểm tra được |
| morale | tỉ lệ hoàn thành / thời gian còn lại |
| status | declared, active, won, lost, retro_pending, closed |
| retro | path hội đồng sau chiến |

### Verdict

| Trường | Ghi chú |
|---|---|
| quest_id, attempt, verifier_id | |
| ritual | nghi thức của dạng (mục 5) |
| checks[] | kết quả kiểm tra máy: tên, pass/fail, log |
| result | pass, fail |
| notes | ghi chú trả bài, cụ thể, có thể hành động |
| by_human | true nếu là dấu vua |

### Lesson (một dòng kinh)

| Trường | Ghi chú |
|---|---|
| id, owner | character id hoặc `temple` |
| text | một câu, mệnh lệnh |
| source_verdict | bắt buộc: bài học phải bắt nguồn từ phán quyết |
| created_at, last_hit_at, retired_at | thanh lọc sau 3 mùa không chạm |

### Skill (bí kíp)

| Trường | Ghi chú |
|---|---|
| id, title | |
| tags[] | tag quest mà bí kíp này áp dụng |
| scope | `global` hoặc id lãnh thổ |
| path | `temple/skills/<id>/SKILL.md` + file kèm; runner chuyển sang định dạng skill của từng CLI khi nạp vào worktree |
| source | `temple` (thầy tu viết từ bài học lặp) hoặc `user` |
| max_tokens | trần kích thước; bí kíp dài quá thì chia |

### Event

```json
{"ts":"2026-11-06T09:12:03+07:00","type":"agent.tool","character":"thorn","quest":"q_0142","territory":"shop-api","data":{"tool":"Edit","path":"src/auth/login.ts"}}
```

Các loại sự kiện chính: `quest.created / claimed / started / submitted / returned / done / sealed / paused / infirmary`, `agent.tool` (read, write, bash, search, web), `agent.subagent.spawn / end`, `agent.compact`, `verdict.pass / fail`, `mana.level / exhausted / restored`, `character.sleep / wake / meditate / suspend`, `campaign.declared / front.update / won / lost / retro`, `battle.start / unit.down / unit.fall / wounded / end`, `incident.alarm / cleared`, `patrol.rumor`, `delivery.sent`, `chronicle.written`.

### Bố cục thư mục

```
kingdom/
  kingdom.json               # tên vương quốc, nghề người dùng, cài đặt, mana_cap, king_reserve, lịch bật/tắt
  territories/<id>/          # territory.json, gazetteer.md
  quests/<id>.json
  quests/<id>/journal.md     # journal, ghi chú trả bài, thư bàn giao
  characters/<id>/           # character.json, scripture.md
  campaigns/<id>.json
  verdicts/<quest>-<n>.json
  events/YYYY-MM-DD.jsonl
  chronicle/YYYY-MM-DD.md
  temple/scripture.md        # kinh chung
  temple/skills/<id>/        # bí kíp: SKILL.md + file kèm, nạp theo tag
  world/map.json             # địa hình, vị trí lãnh thổ, tòa nhà
  world/themes/fantasy/      # kinds.json, classes.json, rituals.json, assets/
```

---

## 5. Dạng nhiệm vụ và nghi thức nghiệm thu

Mọi việc thật của mọi nghề rơi vào một trong 11 dạng. Mỗi dạng có nơi chốn, hành động, nghi thức và quy ước giao hàng riêng. Chiến tranh là vật chứa, không phải dạng lá.

| Dạng | Việc thật | Nơi trên bản đồ | Nghi thức nghiệm thu | Kiểm tra máy đi kèm | Giao hàng |
|---|---|---|---|---|---|
| **Kiến tạo** | Feature, trang, slide, thiết kế, bộ cấu hình mới | Công trường, xưởng, họa thất | *Thợ cả khám công trình*: chất tải, nứt thì vá; đạt thì lễ khánh thành | test, lint, build, type-check | Nhánh/PR (code); file vào thư mục đã định |
| **Thám hiểm** | Nghiên cứu công nghệ, khảo sát thị trường, điều tra đối thủ | Vùng sương mù | *Đánh sinh vật canh giữ*: Rồng (câu hỏi lớn), Hydra (nhiều đầu), Sphinx (phải chính xác); thua thì về lấy thêm chứng cứ | kiểm tra nguồn còn sống, số liệu có trích dẫn | Báo cáo vào thư viện; vùng sáng lên trên bản đồ |
| **Trừ tà** | Bug, lỗi dữ liệu, link chết, số sai trong báo cáo | Nơi việc hỏng, quái xuất hiện tại chỗ | *Săn và đặt bẫy*: giết quái chưa đủ, phải đặt bẫy và chờ một đêm | regression test mới + toàn bộ test cũ | PR sửa lỗi kèm test |
| **Gia cố** | Refactor, tối ưu, biên tập lại, dọn backlog | Tường thành, lò mài | *Thử bão*: chịu stress test / benchmark / so sánh trước–sau | benchmark, test, diff số liệu | PR + bảng trước/sau |
| **Soạn thảo** | Tài liệu, spec, BRD, SOP, hợp đồng nháp | Phòng chép sách | *Thủ thư trưởng duyệt bản thảo*: đối chiếu, gạch chỗ sai, đóng gáy | kiểm tra link, mục lục, thuật ngữ nhất quán | File vào thư viện (md/docx) |
| **Rao truyền** | Blog, post, email chiến dịch, thông cáo | Quảng trường | *Dân chúng phản ứng*: nhà thơ hát thử, đám đông chấm theo checklist giọng điệu/thương hiệu | độ dài, từ cấm, link UTM | Bản nháp chờ dấu vua trước khi đăng |
| **Chiêm nghiệm** | Phân tích số, dashboard, A/B test, báo cáo tuần | Đài thiên văn | *Chiêm tinh gia thứ hai tính lại* từ dữ liệu gốc; khớp thì khắc lên bia | chạy lại script, so khớp số | Báo cáo + dữ liệu gốc + script |
| **Nghị hội** | Kế hoạch sprint, chia epic, chọn giải pháp, phân tích yêu cầu | Phòng hội đồng | *Hội đồng biểu quyết*: 2–3 agent phản biện, đủ phiếu mới ban chiếu | kiểm tra mọi quest con có hạng, nghề, mana | Danh sách quest con lên bảng |
| **Chinh phục** | Tích hợp API ngoài, migrate, tiếp quản legacy, đưa công cụ mới vào, mở thị trường, thắng khách hàng | Pháo đài có cờ lạ | *Lập đồn và cắm cờ*: vây hãm → đoạt → đồn trú; giữ được qua một mùa mới tính | chạy ổn N ngày, có docs, có người phụ trách, hệ cũ đã tháo | Tích hợp + địa chí cập nhật |
| **Ngoại giao** | Đàm phán vendor, xin phê duyệt stakeholder, phối hợp đối tác | Sứ quán | *Ký hiệp ước*: hai bên xác nhận bằng văn bản | — | Bản nháp thư/điều khoản; người dùng gửi |
| **Trận đánh** | Bầy việc nhỏ (triage 80 issue, 200 file, 40 test vỡ, load test) hoặc đối kháng (red/blue team, bake-off, tranh luận, so sánh cạnh tranh) | Chiến trường | *Điểm quân sau trận*: xác quái = xong, bia mộ = chưa xong, thương binh = chờ người, đổ nát = nợ tạo ra | từng đơn vị có pass/fail riêng; trọng tài cho đối kháng | Báo cáo trận + quest Gia cố tự sinh cho đổ nát |
| **Chiến tranh** (vật chứa) | Release lớn, launch, epic, deadline; phòng thủ: sự cố, lỗ hổng, khủng hoảng | Phòng chiến sự | *Tuyên bố chiến thắng* khi mọi mặt trận đóng, rồi *hội đồng sau chiến* (retro/postmortem) | điều kiện chiến thắng kiểm tra được | Chiếu bài học → kinh chung |

Nghi thức là **dữ liệu** trong `world/themes/fantasy/rituals.json`: tên, các bước, hoạt hình, điều kiện đạt. Thêm dạng mới = thêm một dòng ở đây và một tòa nhà.

Sự kiện nhịp sống: **lễ hội** (release/launch), **đoàn thương nhân** (giao hàng ra ngoài), **mùa** (sprint), **tuần tra đêm** (việc định kỳ), **chuông báo động** (sự cố → chế độ phòng thủ).

---

## 6. Nhân vật: nghề, cấp, danh tiếng, Đền và kinh

### Nghề (class)

Một nghề = prompt vai trò + bộ kỹ năng + tool được phép + model + nhà cung cấp.

| Nghề | Việc thật | Nhận dạng | Tộc / model gợi ý | Giới |
|---|---|---|---|---|
| Tể tướng | Intake, tách quest, hỏi lại | — | Claude Sonnet | không làm quest |
| Pháp sư | Kiến trúc, lên kế hoạch, chia việc | Nghị hội, Chiến tranh (chia mặt trận) | Claude Opus/Sonnet | |
| Hiệp sĩ | Viết code | Kiến tạo, Trừ tà, Gia cố (code), Trận đánh | Claude Sonnet | |
| Người lùn | Build, CI, hạ tầng, tích hợp | Kiến tạo (infra), Chinh phục, Gia cố | Claude Sonnet / Haiku | |
| Elf trinh sát | Nghiên cứu, khảo sát, tuần tra | Thám hiểm, khảo sát điền địa, tuần tra | Gemini Pro / Flash | |
| Thư ký | Viết tài liệu | Soạn thảo | Gemini Pro hoặc Claude Sonnet | |
| Nhà thơ | Nội dung lan truyền; biên niên sử | Rao truyền; chronicle | Gemini Flash (chronicle), Sonnet (nội dung) | |
| Chiêm tinh gia | Phân tích dữ liệu | Chiêm nghiệm | Claude Sonnet | |
| Sứ thần | Thư từ, đàm phán nháp | Ngoại giao | Claude Sonnet | không gửi, chỉ nháp |
| Thợ cả / Thủ thư trưởng / Chiêm tinh gia thứ hai / Trọng tài / Hiền giả | Nghiệm thu theo nghi thức | — | **Tộc ngược với người làm** | giới không làm |
| Thầy tu | Phản tỉnh, viết kinh, thanh lọc | — | Haiku / Flash | giới không làm |

Quy tắc chọn người nghiệm thu: khác nhân vật → phiên mới → ưu tiên khác tộc → nếu cùng tộc thì bắt buộc khác model hoặc có checklist bên ngoài (test tự động) làm trọng tài chính.

### Nghề, bí kíp, kinh — ba thứ khác nhau

| | Là gì | Gắn vào | Ai viết | Nạp khi nào |
|---|---|---|---|---|
| **Nghề** | Động từ: viết code, nghiên cứu, chép sách, chấm bài. Quyết định tool, model, tộc, dạng quest | Nhân vật, cố định suốt đời | Theme | Mọi quest |
| **Bí kíp** (skill) | Kiến thức lĩnh vực: "React + TanStack Query theo quy ước repo này", "NestJS + Drizzle migration", "Playwright + axe", "i18n theo i18n-style.md" | Không gắn vào ai; cất ở thư viện Đền | Thầy tu (từ bài học lặp ở nhiều nhân vật và là kỹ thuật chứ không phải thói quen) hoặc người dùng | Theo quest: khớp tag và lãnh thổ, tối đa 3 bí kíp mỗi quest |
| **Kinh** | Bài học hành vi, ngắn, riêng từng nhân vật | Nhân vật | Thầy tu, từ phán quyết | Mọi quest của nhân vật đó |

Chuyên môn không phải là nghề con. Không có "hiệp sĩ frontend" và "hiệp sĩ backend" như hai nghề; có hiệp sĩ với **danh tiếng theo tag**. Mỗi phán quyết cộng vào `skill_affinity` của tag quest đó; Quản sự lọc theo nghề rồi xếp theo danh tiếng trên tag của quest. Sau vài mùa, một hiệp sĩ tự thành "hiệp sĩ frontend" vì đạt nhiều ở đó, và nhận **danh hiệu** hiện trên đầu. Người dùng có thể ghim một nhân vật vào một chuyên môn; mặc định dữ liệu quyết định. Cùng một bộ bí kíp chạy qua hai nhân vật hai model là cách so sánh model theo lĩnh vực.

Giai đoạn 1: **không có bí kíp riêng nào**; `CLAUDE.md` của repo là bí kíp của lãnh thổ. Bí kíp đầu tiên chỉ ra đời khi Đền thấy nhu cầu thật.

### Đội: một việc cần nhiều chuyên môn

Luật "một quest = một nhân vật = một context" không đổi. Một việc chạm cả backend lẫn frontend không phải một quest mà là một **đội** (party):

1. Tể tướng nhận ra việc có nhiều tag ở nhiều vùng → mở Nghị hội.
2. Pháp sư (trưởng đội) viết **hợp đồng** trước: interface giữa các phần (với dc1-se-team là OpenAPI, vì web lấy type từ đó). Hợp đồng là bức thư đầu tiên và thường là duy nhất giữa các thành viên.
3. Mỗi phần là một quest con, một tag chính, một nhân vật, một worktree, một verdict riêng. Chạy song song.
4. **Quest ghép** cuối cùng: hợp nhất các nhánh, chạy kiểm tra toàn phần (e2e, integration), có thợ cả chấm lần nữa. Đội chỉ xong khi quest ghép xong.
5. Người chấm từng phần và người chấm quest ghép đều không phải thành viên đội.

Chỉ tách khi đáng: mỗi phiên mới có chi phí cố định, nên không băm việc 20 phút thành ba phiên 7 phút. Tách khi các phần ở vùng khác nhau với hợp đồng rõ, hoặc khi song song tiết kiệm thời gian thật. Trên bản đồ: đội đi cùng nhau dưới một lá cờ; quest ghép là lễ khánh thành chung.

### Cấp và danh tiếng

- Cấp 1–10, tương ứng hạng quest được nhận F→S. Quest hạng cao hơn cấp một bậc thì được nhận khi không còn ai; cao hơn hai bậc thì không.
- Danh tiếng = tỉ lệ đạt trong cửa sổ 20 phán quyết gần nhất. Phán quyết của người dùng (dấu vua, trả bài) nặng **gấp 3** phán quyết của agent.
- Lên cấp: ≥ 10 phán quyết trong cửa sổ và tỉ lệ đạt ≥ 85%. Xuống cấp: tỉ lệ < 60%.
- Đình chỉ về Đền: 3 lần trả bài liên tiếp cùng loại lỗi.
- **Ngộ đạo** = nâng model: cấp ≥ 7, người dùng duyệt (vì tốn mana hơn).

### Trang bị theo cấp

- Nhân vật là mô-đun: thân cơ bản theo nghề + ô gắn trang bị (đầu, thân, vũ khí, áo choàng, hào quang).
- Bốn bậc theo `gear_tier`: vải (cấp 1–3) → da/xích (4–6) → giáp/phù chú (7–9) → huyền thoại có hào quang nhẹ (10).
- Để không nổ số lượng tài sản: bậc dùng chung chất liệu và màu cho mọi nghề; mỗi nghề chỉ có 1–2 món riêng mỗi bậc. Hiệp sĩ cấp 1 áo vải cầm kiếm gỗ; cấp 10 giáp sáng, áo choàng, kiếm phát sáng.
- Hạng quest cũng nhìn thấy được trên bản đồ: biển gỗ (F–D) → cờ hiệu (C–B) → cờ lớn có hào quang (A–S); giàn giáo cao hơn, sinh vật canh giữ to hơn theo hạng.

### Đền và kinh

- Kích hoạt: mỗi 10 quest của một nhân vật, hoặc hằng tuần, hoặc khi bị đình chỉ.
- Thầy tu đọc verdict + journal của nhân vật; viết tối đa 3 bài học/lần; mỗi bài học **phải trỏ tới một verdict**. Nhân vật không tự chấm mình.
- Kinh riêng ≤ 40 dòng. Bài học 3 mùa không trúng lỗi tương ứng thì gỡ. Bài học xuất hiện ở ≥ 2 nhân vật thì chuyển lên **kinh chung** của Đền.
- Kinh là file Markdown; người dùng sửa trực tiếp được.
- **Ngồi thiền** = khi context gần đầy: nhân vật tóm tắt journal rồi mở phiên mới. Sự kiện `agent.compact` hiển thị như thiền.

Kết hôn và thế hệ sau (tiến hóa cấu hình từ kinh của hai nhân vật) để chương hai; con kế thừa bài học, không kế thừa nghề.

---

## 7. Luật vương quốc

### Quyền hạn

| Tự làm, không hỏi | Cần dấu vua |
|---|---|
| Đọc/sửa file trong đất riêng của quest | Hợp nhất vào nhánh chính, push |
| Chạy test, lint, build, script cục bộ | Xóa file ngoài đất riêng, xóa nhánh |
| Tìm kiếm web, đọc tài liệu | Gửi email, đăng bài, nhắn tin ra ngoài |
| Ghi journal, thư bàn giao | Gọi API tốn tiền, mua, thanh toán |
| Tạo quest con (Nghị hội) | Chạm thư mục ngoài lãnh thổ, cài đặt hệ thống |

Ánh xạ vào chế độ quyền của Claude Code và Gemini CLI: danh sách tool cho phép theo nghề; mọi thứ khác bị chặn ở runner, không chỉ ở prompt.

### Đất riêng

- Quest Kiến tạo / Trừ tà / Gia cố trên code: **git worktree riêng** cho mỗi quest, nhánh `quest/<id>`. Hợp nhất là một cửa ải có nghiệm thu, không bao giờ tự động.
- Quest tài liệu/nội dung: thư mục riêng `quests/<id>/work/`, giao hàng là bước copy có chủ đích.

### Kho bảo vật

- Secrets, `.env`, token không bao giờ vào prompt hay journal. Runner nạp qua biến môi trường từ kho (keychain / file ngoài kingdom), nhân vật chỉ gọi tên.
- Hook chặn ghi: mọi output có dạng token/khóa bị che trước khi vào event log.

### Cầu dao (mặc định, sửa trong kingdom.json)

| Cầu dao | Mặc định | Khi vượt |
|---|---|---|
| Thời gian một lần thử | 45 phút (hạng F–C), 120 phút (B–S) | Nhân vật lạc đầm lầy; quest → infirmary |
| Số lần thử | 3 | Quest → infirmary, chuông |
| Mana một quest | theo hạng; ước lượng của Tể tướng × 2 | Dừng, chuông |
| Trả bài liên tiếp cùng loại | 3 | Nhân vật đình chỉ về Đền |
| Tuần tra | ≤ 10% mana tuần | Tuần tra tắt tới tuần sau |

### Script, sub-agent hay phiên mới

Quản sự chọn theo ước lượng của Tể tướng, ba bậc:

| Bậc | Khi nào | Cách chạy | Tính mana |
|---|---|---|---|
| **Script** | Việc tí hon và xác định: kiểm tra link, đếm file, chạy lint/test, so khớp số | Không gọi model; Quản sự hoặc nhân vật chạy script, kết quả vào journal | 0 |
| **Sub-agent** (học trò) | Ngắn hơn `subagent_max_minutes` (mặc định 5), cần phán đoán, và phiên mẹ đã có sẵn ngữ cảnh: đọc một file rồi trả lời một câu, kiểm một mục checklist | Nhân vật tự gọi trong quest của mình; hiện là học trò đi theo | Tính vào cầu dao của quest mẹ |
| **Phiên mới** (nhân vật) | Việc dài, hoặc cần journal và verdict riêng, hoặc chạy song song được, hoặc phải độc lập | Quản sự mở quest (con) và giao cho một nhân vật; phiên headless riêng, prompt dựng từ đầu | Quest riêng, cầu dao riêng |

Ba điều không đổi dù ước lượng thế nào: người nghiệm thu không bao giờ là sub-agent của người làm; sub-agent không đẻ sub-agent; sub-agent chạy quá ngưỡng thì nhân vật dừng nó, ghi journal, Quản sự mở quest con. Trong Trận đánh, phần lớn đơn vị là bậc script; đơn vị cần phán đoán chạy thành phiên headless model rẻ, không phải sub-agent treo dưới một phiên mẹ. Ngưỡng và tỉ lệ ba bậc đo được từ event log (token theo quest), chỉnh trong `kingdom.json` sau vài tuần dữ liệu.

Chi phí cố định của mỗi phiên mới (system prompt, CLAUDE.md, địa chí) là lý do Tể tướng gom việc tí hon thay vì mỗi cái một quest; prompt caching giảm phần này nhưng không xóa.

### Mana và hồi sinh

- Theo dõi: Claude từ `rate_limits` (5 giờ, 7 ngày, % đã dùng, giờ reset) trong dữ liệu status line; Gemini từ 429 và phản hồi quota.
- Trần: `mana_cap` (mặc định 98%) và `king_reserve` — phần của vua, thế giới không bao giờ chạm (mặc định 2% để khớp trần 98%; tăng lên 10% nếu muốn giữ phần dùng trực tiếp). Thế giới không nhận quest mới khi mức dùng ≥ min(mana_cap, 100 − king_reserve), cảnh báo trước đó 10 điểm; chạm trần hoặc 429 liên tiếp → cả tộc về đền ngủ, quest đang làm → `paused_mana` (giữ nguyên người làm, không giao lại).
- Việc theo lịch (tuần tra, Đền, Nhà thơ) tính vào mana như quest; tắt được từng cái trong kingdom.json. Không chạy thế giới thì không tốn gì.
- Chia công bằng: khi nhiều lãnh thổ cùng có quest, Quản sự xoay vòng theo lãnh thổ và ưu tiên theo hạng, không để một repo nuốt hết mana.
- Hồi sinh: Quản sự ping định kỳ bằng một lệnh rẻ; thành công → `mana.restored`, nhân vật tỉnh, đọc journal, làm tiếp. Nguồn hồi sinh (chờ reset, người dùng đăng nhập lại, đổi vai sang tộc khác) là việc của người dùng; hệ thống không tự xoay tài khoản.
- Nghiệm thu dở dang: verdict ghi "đã kiểm tới đâu"; người nghiệm thu mới đọc tiếp, không làm lại.

---

## 8. Runner và tầng sự kiện

### Runner Claude Code

- Mở phiên headless (`-p`) với prompt dựng từ: mô tả quest + kinh riêng + kinh chung + địa chí lãnh thổ + quy ước giao hàng của dạng. Đọc output JSON để biết kết thúc, token, lỗi.
- Hooks của Claude Code (chạy script ở các mốc vòng đời: trước/sau tool, khi dừng, khi spawn sub-agent, khi nén context) ghi một dòng JSON vào `events/` cho từng hành động. Runner không sửa Claude Code; cấu hình hook nằm trong `~/.claude/`.
- Sub-agent và Agent Teams: mỗi sub-agent là một học trò đi theo nhân vật; team bền vững là một đội.
- Status line cung cấp `rate_limits.five_hour` và `rate_limits.seven_day` → mana.
- Chế độ tương tác: click "triệu hồi" trên bản đồ mở terminal của phiên đó để người dùng can thiệp.

### Runner Gemini CLI

- Chế độ headless `gemini -p "..." --output-format json`; mã thoát 0 thành công, 1 lỗi, 42 lỗi đầu vào, 53 vượt giới hạn lượt.
- Gemini CLI có hooks (`gemini hooks`) và GEMINI.md làm context file; dùng GEMINI.md để nạp kinh + địa chí.
- Đăng nhập Google một lần, tương tác; runner không giữ token.
- Antigravity IDE dành cho người dùng ngồi làm trực tiếp; tộc Gemini trong thế giới chạy bằng Gemini CLI vì script được.

Lưu ý: cú pháp flag và tên hook của cả hai CLI thay đổi theo phiên bản; giai đoạn 1 phải khóa phiên bản và kiểm tra lại theo tài liệu chính thức ([Claude Code](https://code.claude.com/docs), [Gemini CLI](https://geminicli.com/docs)).

### Chuẩn hóa

Runner dịch output của hai CLI về cùng schema sự kiện ở mục 4. Thế giới không bao giờ biết phía sau là CLI nào; chỉ biết tộc.

### Sứ giả (world server)

- Theo dõi `events/*.jsonl` (tail), dựng world state trong bộ nhớ, đẩy delta qua WebSocket.
- Phục vụ renderer tĩnh tại `http://localhost:<port>`.
- Nhận hành động từ renderer: đóng dấu, trả bài, triệu hồi, tạo quest nhanh → ghi vào `quests/` (Quản sự đọc), không gọi agent trực tiếp.
- Chuông: khi `awaiting_seal` hoặc `infirmary` → thông báo hệ thống trên máy (Windows/macOS) và đẩy tới điện thoại qua đường hầm (web push hoặc ứng dụng nhắn tin; chọn ở giai đoạn 2).
- Truy cập từ xa (tùy chọn): Sứ giả đứng sau một đường hầm riêng (Tailscale hoặc Cloudflare Tunnel), có token/mật khẩu và HTTPS. Mọi hành động từ xa vẫn chỉ ghi vào `quests/` để Quản sự đọc, nên quyền hạn không đổi và không có lệnh nào chạy trực tiếp từ ngoài. Điện thoại nhận **khách nhẹ**: bản đồ 2D phẳng, Ngai vàng, trạm quân y, chuông, khung Tể tướng; không tải 3D. Điều kiện: máy chạy Elvaria không được ngủ; tắt đường hầm bằng một cờ.
- Phương án đưa cả runner lên VM cloud để dành cho sau, đi kèm API key.

### Đa nền tảng

- Hook, runner, Quản sự, Sứ giả đều là Node; không bash, không PowerShell riêng. Đường dẫn qua `path` của Node; không giả định ký tự phân cách.
- Windows: cần Git for Windows cho worktree; thông báo qua toast hệ thống. macOS: thông báo qua Notification Center.
- Bộ lịch nằm trong Quản sự (chạy khi Quản sự chạy), không cài cron/Task Scheduler/launchd.

---

## 9. Thế giới 3D low-poly

### Công nghệ

- **Three.js** + Vite, TypeScript (đã chốt; Babylon.js chỉ xem lại nếu phần leo núi cần navmesh dựng sẵn).
- Camera: MapControls (kéo, xoay, zoom), giới hạn góc và độ cao; chế độ **theo chân** một nhân vật; chế độ **điện ảnh** tự lượn tới nơi có sự kiện rồi về toàn cảnh.
- Địa hình: heightmap từ `world/map.json`, shader màu theo cao độ (đầm lầy, đồng cỏ, rừng, núi, tuyết), sông là mesh dải với shader rẻ.
- Lãnh thổ: vùng đa giác trên bản đồ; tòa nhà sinh từ khảo sát điền địa đặt trong vùng. **Mở cõi**: gắn repo mới thì bản đồ mọc thêm một vùng ở biên (địa hình sinh theo kiểu dự án: code = thung lũng có thành, docs = cao nguyên thư viện, data = đài thiên văn trên núi), có đường nối về trung tâm. Bản đồ không có kích thước cố định.
- Tỉ lệ: trong một lãnh thổ là tỉ lệ thật — nhà đúng cỡ so với nhân vật và có nội thất; núi có đường mòn, tháp canh, hang. Giữa các lãnh thổ, khoảng cách nén; đi xa thì có **xe ngựa / điểu thú** (fast travel có hoạt hình), tối đa 20 giây mỗi chuyến.
- Nội thất: khi nhân vật vào nhà, mái mờ đi hoặc nhấc lên (kiểu nhà búp bê); nội thất chỉ được vẽ khi mái mở. Camera luôn ở trên, không bao giờ chui vào trong.
- Mức chi tiết theo lãnh thổ: `full` (nhân vật, nội thất, hoạt hình) khi camera gần; `reduced` (tòa nhà, không nhân vật) ở xa; `icon` (khối + cờ trạng thái + thời tiết) khi rất xa hoặc khi có nhiều lãnh thổ. Chỉ một vài lãnh thổ ở mức full cùng lúc — đây là cái giữ 20 repo vẫn nhẹ.
- Nhân vật: GLTF low-poly mô-đun — thân cơ bản theo nghề + ô gắn trang bị đổi theo `gear_tier`; clip hoạt hình: idle, walk, ride, work, read, sleep, fight, celebrate, meditate.
- Tìm đường: lưới nav trên địa hình có giới hạn độ dốc (leo núi theo đường mòn), A*; tốc độ đi bộ cố định, cưỡi thú khi đi xa.
- Giao diện: overlay HTML (bảng thông tin khi click, hàng đợi ngai vàng, thanh mana theo tộc có vạch phần của vua, minimap có "nhiệt" hoạt động, lớp **"cần ngài"** liệt kê việc chờ quyết theo mức khẩn).
- Chế độ điện ảnh ưu tiên: sự cố > chờ dấu > trận đánh > nghi thức > di chuyển thường; khi để màn hình thứ hai, camera tự tới nơi quan trọng nhất rồi về toàn cảnh.

### Luật nhẹ

- Render-on-demand: vẽ khi có sự kiện, khi camera đổi, khi hoạt hình đang chạy; không có gì thì không vẽ.
- Trần 30 fps khi hoạt động; tab ẩn → dừng hẳn.
- Cây, đá, nhà: instancing; rừng là một draw call.
- Ánh sáng nướng sẵn + một đèn hướng; không bóng đổ thời gian thực (tối đa một bóng rẻ cho nhân vật đang chọn).
- Sương mù theo khoảng cách; 3 mức chi tiết theo khoảng cách camera.
- Chế độ tiết kiệm (pin): 15 fps, tắt thời tiết và điện ảnh.
- Ngân sách mỗi lãnh thổ: ≤ 150 draw call ở mức full; mức icon gần như miễn phí. Nội thất không tồn tại trong scene khi mái đóng.
- Mục tiêu đo được: nhàn rỗi < 5% CPU; RAM renderer < 300 MB với 10 lãnh thổ; khởi động < 3 giây.

### Nghi thức, thời tiết, trận đánh

- Mỗi nghi thức là một kịch bản hoạt hình ngắn (≤ 10 giây) kích hoạt bởi sự kiện verdict; không chặn thế giới.
- Thời tiết theo `territory.health`: CI đỏ → mây đen, sự cố → sấm, backlog già → sương.
- Ngày đêm theo giờ thật.
- Trận đánh: một đơn vị trên màn hình = một nhóm việc (mặc định 5), tối đa 40 sprite động; đám đông xa là texture lặp; lửa/khói là vài tile hoạt hình; máu và xác vẽ một lần lên nền tĩnh; replay từ event log với tốc độ tùy chọn.
- Điêu tàn: xác quái phai sau 3 ngày; bia mộ, đổ nát tồn tại tới khi quest tương ứng xong.

### Tài sản

- Giai đoạn xám: hộp, nón, viên nang có màu theo nghề.
- Bộ low-poly miễn phí: Kenney (CC0), Quaternius (CC0); hoạt hình nhân vật từ thư viện sẵn có (ví dụ Mixamo). Ghi giấy phép từng gói vào `world/themes/fantasy/LICENSES.md` trước khi dùng.
- Trang bị theo cấp: 4 bậc dùng chung chất liệu và màu; mỗi nghề 1–2 món riêng mỗi bậc (xem mục 6). Nội thất: 1 bộ bàn ghế/kệ/lò cho mỗi loại tòa nhà, ghép lại thành nhiều phòng.

### Khách nhẹ cho điện thoại

- Bản đồ 2D phẳng vẽ từ cùng `world/map.json` (vùng là ô màu theo sức khỏe, nhân vật là chấm có icon nghề), Ngai vàng, trạm quân y, chuông, khung Tể tướng.
- Không tải Three.js; cùng WebSocket, cùng hành động, cùng quyền hạn như desktop.

### Sa bàn

- `elvaria sandbox replay events/2026-11-10.jsonl --speed 20`: phát lại một ngày thật.
- `elvaria sandbox generate --day busy`: sinh một ngày giả có đủ dạng quest, một trận đánh, một lần hết mana.
- Dùng cho toàn bộ giai đoạn 3–4 và demo; không chạy agent, không tốn mana.

---

## 10. Lộ trình

Ước lượng theo thời gian làm bán thời gian; mốc kiểm chứng là điều kiện để sang giai đoạn sau.

| Giai đoạn | Nội dung | Mốc kiểm chứng |
|---|---|---|
| **0. Xương sống và sa bàn** (1–2 tuần) | Repo, schema quest/character/event, thư mục kingdom, CLI tạo/xem quest, bộ sinh sự kiện giả, replay ra terminal | Replay một "ngày giả" in ra dòng thời gian đọc được |
| **1. Tầng việc chạy thật** (2–3 tuần) | Tể tướng, Quản sự, runner Claude + runner Gemini, worktree, luật tách vai, verdict, journal, hồi sinh; 4 nhân vật: hiệp sĩ, elf, thư ký, thợ cả | 10 quest thật (code + docs + research) đi hết vòng không cần can thiệp; cố tình để hết mana rồi hồi sinh, việc tiếp tục đúng chỗ |
| **2. Sự kiện, chuông và khách nhẹ** (2 tuần) | Hooks hai CLI → events, mana tracking với phần của vua, chuông, Nhà thơ viết biên niên sử v1; khách nhẹ 2D cho điện thoại + đường hầm có xác thực | Biên niên sử tối đọc đúng những gì đã xảy ra; đóng dấu một quest từ điện thoại ngoài nhà và máy ở nhà làm tiếp |
| **3. Thế giới xám** (3–4 tuần) | Three.js, địa hình tỉ lệ thật trong lãnh thổ, vùng lãnh thổ, tòa nhà hộp có nội thất hộp và mái cắt, nhân vật viên nang, tìm đường có độ dốc, xe ngựa giữa vùng, camera, click panel, render-on-demand, mức chi tiết theo lãnh thổ, sa bàn 3D | Replay một ngày trên bản đồ với 3 lãnh thổ; nhàn rỗi < 5% CPU; click mọi thứ đều ra thông tin |
| **4. Nghi thức và sắc đẹp** (5–6 tuần) | Khảo sát điền địa và mở cõi, tài sản thật, trang bị theo cấp, hạng quest nhìn thấy được, 11 dạng có tòa nhà và hoạt hình, nội thất thật, nghi thức, thời tiết, ngày đêm, điện ảnh có ưu tiên, lớp "cần ngài", theme là dữ liệu | Người lạ nhìn 2 phút nói được dự án đang ở đâu và kẹt ở đâu; gắn repo thứ tư thì bản đồ mọc thêm vùng mà không chỉnh tay |
| **5. Đền, tuần tra, chiến dịch, trận đánh** (4+ tuần) | Thầy tu và kinh, danh tiếng và cấp, tuần tra có trần mana, Chiến tranh (tấn công và phòng thủ), Trận đánh với replay, điêu tàn và tái thiết | Một đợt triage 50 issue chạy thành một trận; kinh của một nhân vật khiến lỗi lặp giảm thấy được |
| **6. Chương hai** (sau) | Kết hôn và thế hệ sau, liên minh (sync thư mục), theme thứ hai, chế độ đa nghề sâu hơn, đưa toàn bộ runner lên VM cloud bằng API key | — |

Thứ làm trước trong mỗi giai đoạn: thứ chứng minh được giả định rủi ro nhất. Giai đoạn 1: luật tách vai và hồi sinh. Giai đoạn 3: render-on-demand.

---

## 11. Rủi ro và câu hỏi mở

| Rủi ro | Giảm nhẹ |
|---|---|
| Đốt hạn mức tuần quá nhanh với 4–6 nhân vật | Vai rẻ dùng Haiku/Flash; trần mana và phần của vua; tuần tra ≤ 10%; ước lượng mana trước khi nhận |
| Nghiệm thu bằng agent yếu, cho qua bừa | Kiểm tra máy làm trọng tài chính; khác tộc; dấu vua nặng gấp 3; theo dõi tỉ lệ đạt của verifier |
| Kinh phình, nhân vật ngu đi | ≤ 40 dòng; thanh lọc 3 mùa; bài học phải trỏ verdict |
| Xung đột khi hợp nhất worktree | Hợp nhất là quest riêng có nghiệm thu; rebase trước; quest chạm cùng file không chạy song song |
| CLI đổi flag/hook theo phiên bản | Khóa phiên bản; runner là lớp mỏng, dễ sửa |
| Quota Gemini chia nhiều "pool" khó đo | Giai đoạn 1 đo thực nghiệm; coi 429 là tín hiệu chính |
| Công sức 3D vượt dự kiến | Sa bàn + hộp xám trước; mọi sắc đẹp là giai đoạn 4, có thể cắt |
| Giấy phép tài sản | Chỉ CC0 hoặc có giấy phép rõ; ghi LICENSES.md |
| Người dùng thành nút thắt ở ngai vàng | Chỉ hành động ra ngoài và hợp nhất mới cần dấu; mọi thứ khác tự chạy |
| Event log phình | Một file/ngày; nén sau 30 ngày; world state có snapshot |
| Tỉ lệ thật làm công đoạn 3–4 phình | Nội thất chỉ là hộp ở giai đoạn 3; mái cắt và fast travel giữ camera và thời gian trong tầm kiểm soát; mức icon cho lãnh thổ xa |
| Mở Sứ giả ra ngoài thành cửa vào máy | Chỉ qua đường hầm riêng + token + HTTPS; hành động từ xa chỉ ghi file, không chạy lệnh; tắt được bằng một cờ |

Câu hỏi mở (trả lời trước giai đoạn 1):

- [x] Tên: **Elvaria**; CLI `elvaria`.
- [x] Hệ điều hành: Windows chính, macOS phụ.
- [x] Repo đầu tiên: `dc1-se-team` (`D:\Dummy\Tool - DC1\dc1-se-team`, GitHub `thap-nv/dc1-se-team`, private). Khảo sát ở mục 13.
- [x] Trần mana: 98%, kèm phần của vua chỉnh được.
- [x] Three.js.
- [x] Chuông điện thoại: web push qua đường hầm.
- [x] Đường hầm: chọn khi vào thực tế ở giai đoạn 2 (Tailscale hay Cloudflare Tunnel); kiến trúc không phụ thuộc.

Không còn câu hỏi mở trước giai đoạn 0.

---

## 12. Nhật ký quyết định

| Ngày | Quyết định |
|---|---|
| 2026-11-05 | Theo hướng "công xưởng" (việc thật), mở rộng: bảng việc rõ ràng, tự nhận đúng nghề, kiểm tra chéo |
| 2026-11-05 | Thế giới fantasy tự thiết kế; phải nhẹ |
| 2026-11-05 | Một tài khoản Claude Code + một tài khoản Antigravity; không tự xoay tài khoản; hết mana thì người dùng tự đăng nhập để hồi sinh |
| 2026-11-06 | Việc hỗn hợp: code chính, có tài liệu, nghiên cứu, loại khác sau |
| 2026-11-06 | Bỏ lãnh chúa/lãnh địa/server chung; mỗi máy một vương quốc; "nhiều người dùng" = nhiều nghề |
| 2026-11-06 | Tám dạng nền + Chinh phục + Ngoại giao + Trận đánh; Chiến tranh là vật chứa; nghiệm thu theo dạng, Rồng chỉ canh vùng đất mới |
| 2026-11-06 | Đền và thầy tu làm sớm; kết hôn/thế hệ sau để chương hai; luật tách vai vào tầng 1 |
| 2026-11-06 | Thêm Tể tướng, khảo sát điền địa, luật vương quốc, tuần tra, giao hàng và chuông, sa bàn |
| 2026-11-06 | Đồ họa: low-poly 3D trong trình duyệt, góc nhìn Chúa, render-on-demand |
| 2026-11-06 | Tên sản phẩm: Elvaria; người dùng tự đặt tên vương quốc và lãnh địa |
| 2026-11-06 | Windows + macOS; script Node, bộ lịch tích hợp |
| 2026-11-06 | Trần mana 98% kèm phần của vua; việc theo lịch tính vào mana, tắt được |
| 2026-11-06 | Three.js |
| 2026-11-06 | Remote: mở Sứ giả qua đường hầm có xác thực, khách nhẹ cho điện thoại; cloud toàn phần để sau với API key |
| 2026-11-06 | Trang bị theo cấp (4 bậc), hạng quest nhìn thấy được |
| 2026-11-06 | Mở cõi, mức chi tiết theo lãnh thổ, lớp "cần ngài", chia mana công bằng |
| 2026-11-06 | Tỉ lệ thật trong lãnh thổ, nén giữa các lãnh thổ; nội thất mái cắt; xe ngựa/điểu thú |
| 2026-11-06 | Lãnh thổ đầu tiên: dc1-se-team; chuông = web push qua đường hầm; loại đường hầm chọn ở giai đoạn 2 |
| 2026-11-06 | Nguyên tắc 13 "một quest, một context"; chọn script / sub-agent / phiên mới theo ước lượng, ngưỡng sub-agent 5 phút chỉnh được |
| 2026-11-06 | Nghề / bí kíp / kinh là ba thứ khác nhau; bí kíp nạp theo tag, không gắn vào nhân vật; chuyên môn = danh tiếng theo tag; giai đoạn 1 chưa có bí kíp riêng |
| 2026-11-06 | Việc nhiều chuyên môn = đội: hợp đồng trước, mỗi phần một quest con, quest ghép cuối, người chấm ngoài đội |

---

## 13. Lãnh thổ đầu tiên: dc1-se-team

Khảo sát điền địa ngày 2026-11-06, chỉ đọc, trên máy của bạn (GitHub chưa kết nối nên không clone được từ cloud; khi làm giai đoạn 1 cần kết nối GitHub hoặc chạy runner trên máy này — mặc định là trên máy này).

### Đất đai

| Mặt | Thực tế |
|---|---|
| Loại | **code**, monorepo pnpm 10 / Node 24: `apps/api` (NestJS, Drizzle, Postgres), `apps/web` (React, TanStack Router/Query, Vite, CSS Modules), `packages/shared` (scoring, permissions, content, api-types), `packages/config` |
| Việc thật | Web app "Bản đồ năng lực SE · DC1": tự đánh giá 39 mảng L1–L5, dashboard team, xác nhận level, kỳ đánh giá, đăng nhập Microsoft Entra, song ngữ VI/EN |
| Quy mô | ~39k dòng ts/tsx, 1.097 file (không tính node_modules), 17 module API, 15 feature web, 18 ADR |
| Tường lũy | 78 file test: 54 unit (vitest; scoring có gate coverage 100%), 24 e2e (Playwright + axe); integration dùng Testcontainers; CI `ci.yml` chạy lint, typecheck, unit, integration, e2e, openapi drift, content rebuild, Docker build; husky pre-commit (lint-staged) và pre-push |
| Sức khỏe | 0 TODO/FIXME trong ts/tsx; nhánh đang làm `feat/l5-confirm-highlight`; commit gần nhất 05/11 |
| Hạ tầng | `infra/`: Docker Compose dev/e2e/prod, nginx, Postgres, scripts deploy/backup; có `.wrangler` cũ và `legacy/` (bản HTML tĩnh trước) |
| Tài liệu | `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/architecture.md`, `docs/runbook.md`, `docs/deploy-ubuntu.md`, `docs/i18n-style.md`, `docs/adr/0001–0018`, nội dung gốc `ban-do-nang-luc-se.md` |
| Kho bảo vật | `.env` ở gốc repo (đã trong .gitignore), `infra/secrets/`. Elvaria **không bao giờ** đọc hai nơi này; hook che mọi chuỗi dạng token trước khi vào event log |

### Điều quan trọng nhất: repo đã có sẵn địa chí

`CLAUDE.md` của repo là một bộ luật hoàn chỉnh: convention bắt buộc (công thức chỉ ở `packages/shared/src/scoring`, phân quyền chỉ ở `permissions.ts`, module API không gọi repository của module khác, mọi chuỗi UI qua `t()` cả VI lẫn EN, mỗi thay đổi có test cùng PR), danh sách "đọc trước khi sửa", danh sách "cấm khi chưa có chỉ thị" (sửa migration đã apply, đổi guard/RBAC không có integration test, `any`, `--no-verify`, commit `.env`, sửa file ngoài phạm vi), bảng "đụng vào gì thì phải chạy gì", và Definition of Done.

Hệ quả cho Elvaria:

- **Địa chí của lãnh thổ này = `CLAUDE.md` + `README.md`**, không cần trinh sát viết lại. Khảo sát điền địa chỉ bổ sung bản đồ module → tòa nhà.
- Claude Code đọc `CLAUDE.md` tự động. Tộc Gemini thì không, nên runner Gemini phải nạp nội dung `CLAUDE.md` vào `GEMINI.md` trong worktree của quest (sinh ra, không commit). Đây là một yêu cầu cụ thể cho giai đoạn 1.
- Bảng "Change impact" của repo ánh xạ thẳng vào **kiểm tra máy của nghi thức**: đụng `packages/shared` → `pnpm -r test` + `typecheck`; đụng DTO/controller → `pnpm api:openapi` + web typecheck; đụng locale → `pnpm i18n:check`; đụng flow → `pnpm e2e`. Thợ cả không cần đoán.
- Danh sách "cấm" của repo trở thành **luật riêng của lãnh thổ**, chặn ở runner (tool allowlist) chứ không chỉ ở prompt.
- Tích hợp test và e2e cần Docker + Postgres: có trên máy bạn, nhưng chậm. Cầu dao thời gian cho quest đụng e2e nên là 120 phút thay vì 45.

### Bản đồ lãnh thổ (đề xuất cho khảo sát điền địa tự động)

| Thứ trong repo | Trên bản đồ |
|---|---|
| `apps/api` (17 module) | Lâu đài, mỗi module một tháp/phòng: auth và guards là cổng thành |
| `apps/web` (15 feature) | Thành phố, mỗi feature một khu phố; `shell` là quảng trường trung tâm |
| `packages/shared/src/scoring` | Đền thờ công thức; gate coverage 100% là tường thiêng, nứt là không được |
| `packages/shared/src/auth/permissions.ts` | Trạm gác duy nhất; mọi quest đụng vào đều hạng B trở lên |
| `packages/shared/src/content` (md → JSON phiên bản) | Nhà in; sửa bằng md + `content:build`, không sửa JSON tay |
| `docs/adr` (18 ADR) | Thư viện: 18 cuốn, cuốn mới là ADR mới |
| `infra/` | Bến cảng và xưởng tàu: compose, nginx, deploy, backup |
| 54 unit test / 24 e2e | Tường trong / tường ngoài; CI là tuần tra |
| `legacy/`, `.wrangler` | Phế tích phía biên, có thể thành quest Gia cố "dọn phế tích" |
| `.env`, `infra/secrets` | Kho bảo vật, khóa, không ai vào |

### 10 quest thử cho giai đoạn 1

Chọn để phủ các dạng, nhỏ, có thể nghiệm thu bằng máy, và không đụng chỗ "đọc trước khi sửa" của repo. Tất cả làm trong worktree riêng; hợp nhất chờ dấu vua.

| # | Dạng | Quest | Nghề làm | Nghiệm thu |
|---|---|---|---|---|
| 1 | Soạn thảo | Viết `docs/testing.md`: chiến lược test (unit, integration, e2e, axe, coverage gate) tổng hợp từ README, CLAUDE.md, cấu hình vitest/playwright | Thư ký (Gemini) | Thủ thư trưởng (Claude): đối chiếu với file cấu hình thật |
| 2 | Thám hiểm | Đọc 18 ADR, lập bảng quyết định còn hiệu lực / đã bị thay thế / mâu thuẫn nhau; đề xuất ADR nào cần "superseded" | Elf (Gemini) | Sphinx: mỗi kết luận phải trích đúng ADR |
| 3 | Chiêm nghiệm | Thống kê test theo module/feature (số file test, có/không integration, coverage từ `apps/api/coverage`), chỉ ra module thiếu tường | Chiêm tinh gia (Claude) | Chiêm tinh gia thứ hai (Gemini) tính lại từ cây thư mục |
| 4 | Trận đánh (nhỏ) | Kiểm tra mọi link nội bộ trong `README.md`, `docs/**/*.md`, `CLAUDE.md`; mỗi link là một con quái, link chết là quái cần giết | Hiệp sĩ + học trò | Từng link pass/fail bằng script |
| 5 | Kiến tạo (nhỏ) | Thêm script `pnpm check` gom lint + typecheck + test + i18n:check đúng như README mô tả "kiểm tra trước khi push", cập nhật README | Hiệp sĩ (Claude) | Thợ cả (Gemini): chạy `pnpm check` thật, xanh mới qua |
| 6 | Gia cố | Rà `apps/web/src/features/**` tìm chuỗi UI chưa qua `t()` hoặc thiếu ở một ngôn ngữ; `pnpm i18n:check` và lint rule i18next là cơn bão | Hiệp sĩ (Claude) | Thử bão: i18n:check + lint xanh, không đổi gì ngoài locale/feature đã nêu |
| 7 | Rao truyền | Viết thông báo "What's new" VI + EN cho 3 thay đổi gần nhất (L5 chờ xác nhận nổi bật, giữ mọi level còn lại, nudge cá nhân) theo `docs/i18n-style.md`, để đăng lên kênh Teams | Nhà thơ (Claude) | Dân chúng (Gemini) chấm theo i18n-style; bản nháp chờ dấu vua, không tự gửi |
| 8 | Nghị hội | Chia việc "cập nhật `docs/architecture.md` theo ADR 0014–0018" thành 2–3 quest con có hạng và nghề | Pháp sư (Claude) | Hội đồng 2 agent phản biện phạm vi |
| 9 | Soạn thảo | Quest con đầu tiên sinh từ #8 | Thư ký | Thủ thư trưởng |
| 10 | Trừ tà | Chạy `pnpm lint && pnpm typecheck && pnpm test` trên nhánh `main`; mọi cảnh báo hoặc test đỏ/flaky là một con quái; không có quái thì quest tự đóng với biên bản "lãnh thổ sạch" | Hiệp sĩ | Săn và đặt bẫy: regression test nếu có sửa |

Mốc kiểm chứng giai đoạn 1 giữ nguyên: 10 quest này đi hết vòng không cần can thiệp ngoài dấu vua; trong lúc chạy, cố tình để hết mana một tộc rồi hồi sinh.

Chưa dùng ở đây: Chinh phục, Ngoại giao, Chiến tranh — chúng vào giai đoạn 5 khi có việc thật (ví dụ Chinh phục: dọn `legacy/` và `.wrangler`; Chiến tranh: một release).
