# Bảng thuật ngữ Elvaria

> Sinh từ `packages/i18n/src/glossary.json` bằng `pnpm docs:gen`, CI kiểm drift: sửa nguồn rồi chạy lại lệnh, không sửa file này.

Luật (ADR 0014, [implementation-plan](implementation-plan.md) §2.7 và §4.1):

- Identifier trong code dùng **đúng cột "id"**. Đổi một id EN đã có là thay đổi phá vỡ: cần ADR và migration.
- Id là tiếng Anh thông dụng: `snake_case` cho khóa và giá trị enum trong JSON, `kebab-case` cho id icon/asset/file (kể cả id script), `camelCase`/`PascalCase` trong TypeScript. Không slug tiếng Việt, không từ "màu mè".
- Chất fantasy chỉ nằm ở chuỗi hiển thị (cột VI/EN, qua i18n và theme).
- Cột "icon": id trong bản thiết kế gốc (`design/project/Icons.dc.html`) → id trong code (`packages/ui-kit/src/icons.ts`, nhập một lần bằng `scripts/gen-icons.mjs` qua `scripts/icon-names.json`; sau đó icon mới thêm thẳng vào `ui-kit` với id EN). Icon HUD đã là tiếng Anh (`bell`, `settings`, `mana`, `territory`…) thì giữ nguyên id.

---

## 1. Thế giới và vai hệ thống

| VI | EN | id | Định nghĩa | Nơi dùng |
|---|---|---|---|---|
| Vương quốc | Kingdom | `kingdom` | Một máy, một người dùng, một thư mục trạng thái ngoài repo. | `kingdom.json` |
| Lãnh thổ / lãnh địa | Territory | `territory` | Một repo hoặc thư mục được gắn vào vương quốc. | `territories/<id>/territory.json` |
| Địa chí | Gazetteer | `gazetteer` | Mô tả lãnh thổ: cấu trúc, cách build, quy ước (với dc1 là CLAUDE.md + README.md). | `territories/<id>/gazetteer.md` |
| Chiếu chỉ | Royal decree | `decree` | Luật chung của người dùng cho mọi nhân vật, mọi vai, mọi tộc (ví dụ cách viết commit). Người dùng tự viết, tùy chọn; Elvaria chỉ đọc, đưa vào phần hướng dẫn hệ thống của prompt. Luật của lãnh thổ được ưu tiên khi mâu thuẫn. | `<kingdom>/decree.md` |
| Kho bảo vật | Treasury | `treasury` | Secret của người dùng, dạng `{ "tên": "giá trị" }`, nằm ngoài vương quốc. Nhiệm vụ xin tên trong `secrets_required` (chỉ những tên lãnh thổ cho trong `secrets_allowed`); giá trị chỉ vào env của phiên (tên viết hoa: `npm_token` → `NPM_TOKEN`), không vào prompt, journal, log hay event. | `kingdom.paths.treasury` (mặc định `~/.elvaria/treasury.json`), `quest.secrets_required`, `territory.secrets_allowed` |
| Khảo sát điền địa | Land survey | `survey` | Việc quét lãnh thổ để sinh tòa nhà trên bản đồ. | event `territory.surveyed`, `territory.surveyed_at` |
| Mở cõi | Open a realm (attach territory) | `territory.attach` | Gắn một repo mới; bản đồ mọc thêm một vùng. | lệnh `attach_territory`, event `territory.attached` |
| Quốc vương / Lãnh chúa | The Crown (user) | `user` | Người dùng, chủ vương quốc. | `actor.kind = user`, `verifier_id = user` |
| Tể tướng | Chancellor | `chancellor` | Nhận câu lệnh tự nhiên, tách thành quest draft. | `packages/chancellor`, class `chancellor`, `actor.kind`, `created_by` |
| Quản sự | Steward | `steward` | Tiến trình nền duy nhất ghi trạng thái quest: nhận việc, cầu dao, mana, nghiệm thu, giao hàng. | `packages/steward`, `actor.kind` |
| Sứ giả | Herald | `herald` | World server trên localhost: đọc event log, phát qua WebSocket, ghi lệnh vào inbox. | `packages/herald`, `actor.kind`, inbox `source` |
| Hệ thống | System | `system` | Tác nhân không phải người, không phải nhân vật (migrate, replay…). | `actor.kind` |
| Hội quán / bảng nhiệm vụ | Guild hall / quest board | `quests/` | Nơi lưu quest và trạng thái. | thư mục kingdom, màn Guild |
| Lệnh (của người dùng) | Command | `inbox` | File lệnh người dùng ghi cho Quản sự xử lý. | `inbox/<ulid>.json` |
| Thế giới | World | `world` | Renderer 3D trong trình duyệt. | `apps/world` |
| Khách nhẹ | Lite client | `lite` | Giao diện 2D cho điện thoại. | `apps/lite`, inbox `source` |
| Đường hầm | Tunnel | `tunnel` | Lối vào Sứ giả từ xa có xác thực. | `kingdom.tunnel` |
| Sa bàn | Sandbox | `sandbox` | Ngày giả và replay, không chạy agent, không tốn mana. | `packages/sandbox`, event `sandbox.*` |
| Sự cố | Incident | `incident` | Báo động, chuyển thế giới sang chế độ phòng thủ. | event `incident.*` (dành sẵn) |
| Tuần tra | Patrol | `patrol` | Việc định kỳ phát hiện vấn đề, có trần mana tuần. | `kingdom.schedule.patrol`, `created_by` |
| Mùa | Season | `season` | Một sprint. | theme, UI |
| Lễ hội / đoàn thương nhân | Festival / caravan | theme | Sự kiện nhịp sống (release / giao hàng ra ngoài), chỉ là hình ảnh. | `themes/fantasy` |
| Lớp "cần ngài" | Attention queue | `attention` | Danh sách việc đang chờ người dùng quyết, theo mức khẩn. | selector `attentionQueue(state)` |
| Ngai vàng | Throne | `throne` | Hàng đợi quest chờ dấu vua. | màn Throne |
| Chuông | Bell | `bell` | Thông báo desktop / web push. | `kingdom.bell`, interface `Bell`; icon `bell` → `bell` |
| Phòng chiến sự | War room | `war_room` | Màn điều hành chiến dịch. | UI |
| Điểm quân | Muster | `muster` | Màn tổng kết sau trận. | UI |
| Biên niên sử | Chronicle | `chronicle` | Báo cáo ngày do Nhà thơ viết từ event log. | `chronicle/<ngày>.md`, `kingdom.schedule.chronicle` |
| Đền | Temple | `temple` | Nơi Thầy tu phản tỉnh và giữ kinh chung. | `temple/scripture.md`, `kingdom.schedule.temple`, `lesson.owner = temple` |

## 2. Quest

| VI | EN | id | Định nghĩa | Nơi dùng |
|---|---|---|---|---|
| Nhiệm vụ | Quest | `quest` | Một đơn vị việc thật có người làm và người nghiệm thu. | `quests/<id>.json` |
| Dạng nhiệm vụ | Quest kind | `kind` | Loại việc; quyết định nghi thức và cách giao hàng. | `registry/kinds.json` (§5) |
| Hạng (F–S) | Rank | `rank` | Độ khó/rủi ro của quest. | `quest.rank` |
| Bậc chạy | Execution tier | `tier` | Quest chạy bằng script hay bằng phiên agent. | `quest.tier` |
| Bậc script | Script tier | `script` | Không gọi model; chạy script trong catalog; mana 0. | `quest.tier`, `quest.script`, `registry/scripts.json` |
| Phiên mới | Session tier | `session` | Một phiên agent cấp cao nhất mới cho quest. | `quest.tier` |
| Học đồ | Apprentice | `apprentice` / `subagent` | Sub-agent nhân vật gọi trong phiên của mình; `apprentice` là tên agent duy nhất được phép, `subagent` là nhóm event. | `--agents`, event `agent.subagent.*` |
| Đất riêng / lều trại | Plot / camp | `plot` | Worktree hoặc thư mục riêng của một quest. | `quest.plot`, `PlotManager` |
| Nhánh quest | Quest branch | `quest/<id>` | Nhánh git của worktree. | `quest.plot.branch` |
| Giao hàng | Delivery | `deliver` | Đưa kết quả ra theo quy ước của kind. | `quest.deliverable`, event `delivery.sent` |
| Thư giao hàng | Delivery note | `delivery.md` | Quản sự viết khi giao: quest, phán quyết, thư bàn giao, thứ đã chép hay đã mở, lệnh merge tay; với nhánh là mô tả PR. | `.runs/<quest>-delivery.md`, `quest.deliverable.path` |
| Thư bàn giao | Handover letter | `handover.md` | Agent viết: đang ở đâu, đã xong, chưa xong, quyết định, bước kế. | `quests/<id>/handover.md` |
| Nhật ký (máy) | Journal | `journal.jsonl` | Event của quest do hook ghi. | `quests/<id>/journal.jsonl` |
| Phụ thuộc | Dependency | `depends_on` | Quest phải xong trước. | `quest.depends_on` |
| Đơn vị (trận đánh) | Unit | `unit` | Một việc nhỏ trong quest Trận đánh. | `quest.units[]` |
| Nghề được nhận | Required class | `class_required` | Nghề mà người làm quest phải có. | `quest.class_required` |
| Chuyên môn (tag) | Expertise tag | `tag` / `tags` | Lĩnh vực của quest (frontend, backend…), từ vựng đóng; xếp hạng người làm và chọn bí kíp. | `quest.tags`, `registry/tags.json` (§10b) |
| Đội | Party | `party` | Một việc cần nhiều chuyên môn: quest hợp đồng + các phần + quest ghép; không có file riêng. | `quest.party_id`, `quest.party_role` |
| Trưởng đội | Party lead | `contract` (vai) | Pháp sư làm quest hợp đồng: viết hợp đồng và chia phần. | `party_role = contract` |
| Hợp đồng | Contract | `contract` | Interface giữa các phần (ví dụ OpenAPI), commit trên nhánh quest hợp đồng. | `quest.contract` |
| Phần (của đội) | Part | `part` | Một vùng, một tag chính, một nhân vật, một worktree, một verdict. | `party_role = part` |
| Phần test chấp nhận | Acceptance part | `acceptance` | Phần của Khảo hạch mù: Quản sự tự thêm vào đội; một nhân vật không làm phần nào viết test chấp nhận chỉ từ mô tả và hợp đồng, trên worktree tách từ nhánh hợp đồng; quest ghép gộp và chạy nó. | `party_role = acceptance` (P1-21) |
| Quest ghép | Merge quest | `merge` | Quest cuối của đội: hợp nhất các nhánh phần, chạy toàn bộ kiểm tra; Quản sự tự tạo. | `party_role = merge` |

## 3. Nghiệm thu, cầu dao, mana

| VI | EN | id | Định nghĩa | Nơi dùng |
|---|---|---|---|---|
| Nghiệm thu | Verification | `verify` | Nhân vật khác, phiên mới, chấm kết quả theo nghi thức. | `domain/src/verify` |
| Người nghiệm thu (Thợ cả, Thủ thư trưởng, Chiêm tinh gia thứ hai, Trọng tài, Hiền giả) | Judge (titles by kind) | `judge` | Một class nghiệm thu; danh hiệu hiển thị theo kind là dữ liệu theme. | class `judge`, `quest.verifier` (ADR 0011) |
| Người làm | Assignee | `assignee` | Nhân vật nhận làm quest. | `quest.assignee`, `role` |
| Nghi thức | Ritual | `ritual` | Các bước nghiệm thu và luật đạt của một kind. | `registry/rituals.json` (§5) |
| Kiểm tra máy | Machine check | `check` | Lệnh của lãnh thổ chạy trước khi agent chấm; check fail ⇒ fail. | `territory.checks`, `verdict.checks` |
| Máy (người chấm) | Machine | `machine` | Verdict do Quản sự lập từ kiểm tra máy, không có agent. | `verdict.verifier_id = machine` |
| Phán quyết | Verdict | `verdict` | Kết quả một lần nghiệm thu. | `verdicts/<quest>-<n>.json` |
| Trả bài | Return | `returned` / `return` | Quest không đạt, quay lại người làm kèm ghi chú. | trạng thái `returned`, lệnh `return` |
| Dấu vua | Royal seal | `seal` | Người dùng duyệt; nặng gấp 3 phán quyết của agent. | `quest.seal`, lệnh `seal` |
| Cầu dao | Circuit breaker | `breaker` | Trần thời gian, token, lượt, số lần thử của một attempt. | `kingdom.breakers`, outcome `breaker` |
| Sa lầy | Bogged down | `swamp` | Nhân vật kẹt tại chỗ đang làm khi cầu dao (thời gian, token, lượt) ngắt phiên, trong lúc Quản sự dừng tiến trình và lưu việc dở; hiển thị «Sa lầy trong nhiệm vụ {quest}». Là trạng thái, không phải nơi chốn. | `character.status` |
| Trạm quân y | Infirmary | `infirmary` | Quest dừng hẳn, chờ người dùng quyết. | `quest.status` |
| Mana | Mana | `mana` | Hạn mức dùng của một tài khoản/pool. | `kingdom.mana`, event `mana.*` |
| Trần mana | Mana cap | `mana.cap_pct` | Mức dùng tối đa thế giới được chạm (mặc định 98%). | `kingdom.mana` |
| Phần của vua | King's reserve | `mana.king_reserve_pct` | Phần thế giới không bao giờ dùng (mặc định 2%). | `kingdom.mana` |
| Pool mana | Mana pool | `pool` | Một hạn mức riêng trong một tài khoản (Antigravity có `gemini_models`, `claude_gpt_models`); model nào thuộc pool nào thì theo danh sách `/usage` báo, không báo thì theo tiền tố slug. | `kingdom.tribes[].pools`, event `mana.level` |
| Đồng hồ mana | Mana gauge | `PoolKey` | Một bucket mà usage báo: cả một pool, hoặc trần riêng của một model (`model`: Argon, Fable). Một nhân vật bị mọi đồng hồ chứa model của nó ràng; ngủ, thức và cảnh báo theo từng đồng hồ. | event `mana.exhausted`, `mana.restored`, `mana.warning` |
| Hết mana / ngủ | Mana exhausted / asleep | `sleeping_mana` | Một đồng hồ ràng nhân vật đã hết (cả pool, hay trần riêng của model của nó); nhân vật ngủ, quest tạm dừng giữ người làm. | `character.status`, `quest.status = paused_mana` |
| Hồi sinh | Revive | `mana.restored` | Probe thành công; nhân vật tỉnh, quest chạy tiếp bằng phiên mới. | event `mana.restored` |
| Thăm dò (mana) | Probe | `probe` | Lệnh rẻ nhất để biết tộc đã có mana lại chưa. | `AgentRunner.probe`, event `mana.probe` |
| Hạn mức khai báo | Declared allowance | `budget` | Chỉ hai nghĩa: trần của một quest (`quest.budget`) và hạn mức người dùng khai cho một tộc (`tribes[].budget`). Mức mana hiện tại luôn gọi là `mana`. | `quest.budget`, `kingdom.tribes[].budget` |

## 4. Nhân vật

| VI | EN | id | Định nghĩa | Nơi dùng |
|---|---|---|---|---|
| Nhân vật | Character | `character` | Một agent có nghề, tộc, model, cấp. | `characters/<id>/character.json` |
| Nghề | Class | `class` | Prompt vai trò + tool được phép + model mặc định. | `registry/classes.json` (§6) |
| Tộc | Tribe | `tribe` | Một tài khoản người dùng tự đăng nhập + một adapter + một mục theme; tộc của nhân vật cố định suốt đời. | `kingdom.tribes[]`, `character.tribe` (§8) |
| Hợp đồng tộc | Tribe contract | — | Những gì một adapter phải và nên cung cấp để một nhà cung cấp mới thành một tộc mà không sửa lõi. | ADR 0021, implementation-plan §3.14 |
| Bộ chuyển (adapter) | Adapter | `adapter` | Lớp dịch giữa Elvaria và một CLI: package có sẵn hoặc file `adapters/<name>.mjs` của người dùng. | `kingdom.tribes[].adapter` |
| Năng lực (của adapter) | Capabilities | `capabilities` | Adapter làm được gì; thiếu thì tộc bị thu hẹp theo `tribeLimitsOf`. | `AgentRunner.capabilities` |
| Bộ test hợp đồng | Conformance suite | `conformance` | Bộ test mọi adapter phải qua trước khi bật tộc. | `elvaria tribe check` |
| Cấp (1–10) | Level | `level` | Quyết định hạng quest được nhận. | `character.level` |
| Bậc trang bị | Gear tier | `gear_tier` | Suy ra từ cấp (1–3, 4–6, 7–9, 10), không lưu. | `gearTierOf(level)` |
| Danh tiếng | Reputation | `reputation` | Tỉ lệ đạt trong 20 phán quyết gần nhất. | `character.reputation.window` |
| Kinh (riêng / chung) | Scripture (personal / temple) | `scripture` | Bài học dạng Markdown, mỗi dòng một bài. | `characters/<id>/scripture.md`, `temple/scripture.md` |
| Bài học | Lesson | `lesson` | Một dòng kinh, trỏ tới một verdict. | `lesson.schema.json` |
| Ngồi thiền | Meditate | `meditating` | Context gần đầy, agent nén lại. | `character.status`, event `agent.compact` |
| Ngộ đạo | Enlightenment | `enlighten` | Nâng model của nhân vật (cấp ≥ 7, người dùng duyệt). | giai đoạn 5 |
| Đình chỉ | Suspend | `suspended` / `suspend` | Nhân vật bị đưa về Đền. | `character.status`, lệnh `suspend` |
| Triệu hồi | Summon | `summon` | Mở terminal của phiên để người dùng can thiệp. | lệnh `summon` |
| Bí kíp | Skill | `skill` | Kiến thức lĩnh vực, không gắn vào nhân vật; tối đa 3 bí kíp khớp tag và lãnh thổ được nạp cho mỗi quest. | `temple/skills/<id>/SKILL.md`, `skill.schema.json` |
| Danh tiếng theo tag | Expertise (reputation per tag) | `skill_affinity` | Cửa sổ phán quyết theo từng tag; chuyên môn là dữ liệu này, không phải nghề con. | `character.skill_affinity`, `affinityOf` |
| Danh hiệu | Title | `title` | Chữ trên đầu nhân vật, suy ra từ tag ghim hoặc tag có danh tiếng cao nhất; không lưu. | `titleOf(character)`, theme |
| Ghim chuyên môn | Pin a tag | `pinned_tag` / `pin_tag` | Người dùng ghim nhân vật vào một chuyên môn. | `character.pinned_tag`, lệnh `pin_tag` |
| Lời thề không làm | Vow of no production | `vow_no_production` | Nhân vật không được sửa file (judge, monk). | `character.vow_no_production` |

## 5. Dạng nhiệm vụ (kind) và nghi thức (ritual)

11 kind mặc định trong `registry/kinds.json`. Chiến tranh (`campaign`) là vật chứa, không phải kind, nhưng có icon trong nhóm kind.

| VI | EN | kind id | Icon (thiết kế → code) | Nghi thức (VI) | ritual id |
|---|---|---|---|---|---|
| Kiến tạo | Build | `build` | `kien-tao` → `kind-build` | Thợ cả khám công trình | `build_review` |
| Thám hiểm | Research | `research` | `tham-hiem` → `kind-research` | Đánh sinh vật canh giữ | `source_check` |
| Trừ tà | Fix | `fix` | `tru-ta` → `kind-fix` | Săn và đặt bẫy | `regression_check` |
| Gia cố | Refactor | `refactor` | `gia-co` → `kind-refactor` | Thử bão | `stress_test` |
| Soạn thảo | Document | `document` | `soan-thao` → `kind-document` | Thủ thư trưởng duyệt bản thảo | `editorial_review` |
| Rao truyền | Publish | `publish` | `rao-truyen` → `kind-publish` | Dân chúng phản ứng | `audience_review` |
| Chiêm nghiệm | Analyze | `analyze` | `chiem-nghiem` → `kind-analyze` | Chiêm tinh gia thứ hai tính lại | `recompute` |
| Nghị hội | Plan | `plan` | `nghi-hoi` → `kind-plan` | Hội đồng biểu quyết | `council_review` |
| Chinh phục | Integrate | `integrate` | `chinh-phuc` → `kind-integrate` | Lập đồn và cắm cờ | `stability_check` |
| Ngoại giao | Negotiate | `negotiate` | `ngoai-giao` → `kind-negotiate` | Ký hiệp ước | `sign_off` |
| Trận đánh | Batch | `batch` | `tran-danh` → `kind-batch` | Điểm quân sau trận | `unit_tally` |
| Chiến tranh / chiến dịch (vật chứa) | Campaign | `campaign` | `chien-tranh` → `kind-campaign` | Tuyên bố chiến thắng, rồi hội đồng sau chiến | — |
| Mặt trận | Front | `front` | — | — | `campaign.fronts[]` |

Bước nghi thức (`ritual.steps[]`) cũng là id `snake_case` (ví dụ `run_checks`, `read_handover`, `read_diff`, `judge`, `write_verdict`); danh sách chốt ở P0-02 là `RITUAL_STEPS` trong `packages/domain/src/constants.ts` (bảng ở mục 13), vì loader registry từ chối bước lạ.

Nghi thức chọn theo tag, không chỉ theo kind (kế hoạch sản phẩm 0.7, ADR 0022): `kinds[].ritual_overrides` (từ P1-20) chọn nghi thức theo tag của quest, override đầu tiên khớp thắng; Khảo hạch mù ở P1-21:

| VI | EN | id | Khi nào |
|---|---|---|---|
| Thả quái thử thành (0.7 gọi là Thử tường) | Loose a monster on the walls | ritual `mutation_check` | quest Kiến tạo/Gia cố có tag `e2e` hoặc `integration` (test là sản phẩm) |
| Đất nháp của người chấm | Scratch plot | `scratch_plot` (cờ của ritual), worktree `<quest-id>-verify` | Thả quái thử thành: người chấm đập thử ở đây, không commit, xóa sau verdict |
| Khảo hạch mù | Blind trial | `territory.blind_trial` | tùy chọn, quest hạng B+: người khác viết test chấp nhận mà không nhìn diff |

## 6. Nghề (class)

11 class mặc định trong `registry/classes.json`; thiết kế có 12 icon nghề vì `judge` có hai icon theo kind.

| VI | EN | class id | Icon (thiết kế → code) | Ghi chú |
|---|---|---|---|---|
| Tể tướng | Chancellor | `chancellor` | `te-tuong` → `class-chancellor` | không làm quest |
| Pháp sư | Mage | `mage` | `phap-su` → `class-mage` | Nghị hội, chia mặt trận |
| Hiệp sĩ | Knight | `knight` | `hiep-si` → `class-knight` | viết code |
| Người lùn | Dwarf | `dwarf` | `nguoi-lun` → `class-dwarf` | build, CI, hạ tầng, tích hợp |
| Elf trinh sát | Scout | `scout` | `elf-trinh-sat` → `class-scout` | nghiên cứu, tuần tra; class duy nhất có web |
| Thư ký | Scribe | `scribe` | `thu-ky` → `class-scribe` | tài liệu |
| Nhà thơ | Bard | `bard` | `nha-tho` → `class-bard` | nội dung, biên niên sử |
| Chiêm tinh gia | Astrologer | `astrologer` | `chiem-tinh-gia` → `class-astrologer` | phân tích dữ liệu |
| Sứ thần | Envoy | `envoy` | `su-than` → `class-envoy` | thư từ, chỉ nháp |
| Người nghiệm thu | Judge | `judge` | `tho-ca` → `class-judge-build`; `thu-thu-truong` → `class-judge-document` | `is_verifier`; danh hiệu và icon theo kind là dữ liệu theme (`title_by_kind`, `icon_by_kind`) |
| Thầy tu | Monk | `monk` | `thay-tu` → `class-monk` | `is_monk`; phản tỉnh, viết kinh |

Danh hiệu của `judge` (chuỗi hiển thị, không phải id): Thợ cả (Kiến tạo), Thủ thư trưởng (Soạn thảo), Chiêm tinh gia thứ hai (Chiêm nghiệm), Trọng tài (đối kháng trong Trận đánh), Hiền giả. Bảng đầy đủ kind → danh hiệu chốt trong `themes/fantasy/classes.json` ở giai đoạn 4.

## 7. Trạng thái

### 7.1 Trạng thái quest (`quest.status`)

| VI | id | Tông `data-status` | Icon (thiết kế → code) |
|---|---|---|---|
| Nháp (chờ xác nhận) | `draft` | `open` | — |
| Mở | `open` | `open` | `q-open` → `quest-open` |
| Đã nhận | `claimed` | `working` | — |
| Đang làm | `working` | `working` | `q-working` → `quest-working` |
| Chờ nghiệm thu | `review` | `review` | `q-review` → `quest-review` |
| Bị trả bài | `returned` | `returned` | `q-returned` → `quest-returned` |
| Chờ dấu vua | `awaiting_seal` | `seal` | `q-seal` → `quest-seal` |
| Xong | `done` | `done` | `q-done` → `quest-done` |
| Chờ trả lời / bị chặn | `blocked` | `open` | — |
| Tạm dừng (hết mana) | `paused_mana` | `sleep` | `q-sleep` → `quest-sleep` |
| Trạm quân y | `infirmary` | `infirmary` | `q-infirmary` → `quest-infirmary` |
| Lưu trữ | `archived` | `open` | — |

8 tông `data-status` của `elvaria.css`: `open, working, review, done, returned, sleep, infirmary, seal` — ánh xạ bằng `statusToneOf(status)`.

### 7.2 Trạng thái nhân vật (`character.status`)

| VI | id | Icon (thiết kế → code) |
|---|---|---|
| Rảnh | `idle` | — (không icon) |
| Làm việc | `working` | `c-working` → `character-working` |
| Nghiệm thu | `reviewing` | `c-reviewing` → `character-reviewing` |
| Ngủ (hết mana) | `sleeping_mana` | `c-sleeping` → `character-sleeping` |
| Thiền | `meditating` | `c-meditating` → `character-meditating` |
| Đình chỉ | `suspended` | `c-suspended` → `character-suspended` |
| Sa lầy | `swamp` | `c-swamp` → `character-swamp` |

`character.status_before_sleep` chỉ nhận `idle`, `working`, `reviewing`.

## 8. Tộc (`tribe`)

Tộc là id mở trong `kingdom.tribes[]`; `elvaria init` ghi hai tộc đầu. Thêm tộc theo hợp đồng tộc (ADR 0021).

| VI (tên theme, tạm) | id | Icon (thiết kế → code) | Adapter |
|---|---|---|---|
| Tộc Sao Bạc | `claude` | `fac-silver` → `tribe-silver` | `claude_code` (Claude Code) |
| Tộc Lửa Đỏ | `gemini` | `fac-fire` → `tribe-fire` | `antigravity` (Antigravity CLI, mặc định) hoặc `gemini_cli` (Gemini CLI + API key, đường lui) |
| (chưa đặt tên; ví dụ) | `codex` | `tribe-neutral` cho tới khi theme có huy hiệu | `codex_cli` (Codex CLI, tùy chọn) |

Adapter có sẵn: `claude_code`, `antigravity`, `gemini_cli`, `codex_cli`; ngoài ra là file `adapters/<name>.mjs` trong kingdom.

Họ model (suy ra từ slug, không lưu): `claude`, `gemini`, `gpt` (Codex thuộc họ `gpt`) — luật tách vai so họ model trước, rồi mới so tộc (ADR 0008).

## 9. Hành động của người dùng (`inbox-command.kind`)

| VI | id | Icon (thiết kế → code) | Ghi chú |
|---|---|---|---|
| Xác nhận draft | `confirm` | — | `draft` → `open` |
| Đóng dấu | `seal` | `act-seal` → `action-seal` | |
| Trả về | `return` | `act-return` → `action-return` | bắt buộc ghi chú; `rejudge`: trả để chấm lại vì người chấm làm hỏng, không tính trượt cho người làm (từ P1-40) |
| Thử lại | `retry` | — | từ trạm quân y |
| Hủy | `cancel` | — | |
| Lưu trữ | `archive` | `act-archive` → `action-archive` | cũng dùng cho bỏ draft và từ chối khi chờ dấu |
| Triệu hồi | `summon` | `act-summon` → `action-summon` | |
| Đánh thức (đã đăng nhập lại) | `wake` | — | probe ngay |
| Đình chỉ | `suspend` | `act-suspend` → `action-suspend` | |
| Thả (hết đình chỉ) | `release` | — | |
| Giao lại | `reassign` | `act-reassign` → `action-reassign` | |
| Đưa về Đền | `send_to_temple` | `act-temple` → `action-temple` | |
| Tuyên chiến | `declare_campaign` | `act-declare` → `action-declare` | |
| Kết thúc chiến dịch | `close_campaign` | — | |
| Tạo quest | `create_quest` | — | Tể tướng gửi với `draft: true`; `assignee` (tùy chọn, `quest add --to`): chỉ người đó nhận |
| Trả lời câu hỏi | `answer` | — | quest `blocked` |
| Đổi hạng | `set_rank` | — | |
| Mở cõi | `attach_territory` | — | |
| Sửa quest | `edit_quest` | — | kèm `expected_updated_at` |
| Ghim chuyên môn | `pin_tag` | — | `tag = null` để bỏ ghim |
| Đặt cấp | `set_level` | — | `elvaria character level`; ghi `level_since` |
| Đổi model | `set_model` | — | `elvaria character model`; model cùng tộc, nghề và tộc không đổi; ghi `character.model_changed` |

Nguồn lệnh (`source`): `cli`, `herald`, `lite`.

## 10. Catalog script (`registry/scripts.json`)

| id | VI | Làm gì |
|---|---|---|
| `link-check` | Kiểm tra link | kiểm mọi link nội bộ; `produces: units` (mỗi link một đơn vị) |
| `run-check` | Chạy kiểm tra | chạy một `checks[].id` của lãnh thổ |
| `count-files` | Đếm file | đếm file theo glob |
| `diff-stat` | Thống kê diff | thống kê thay đổi của nhánh |
| `compare-numbers` | So khớp số | so hai bộ số liệu |
| `todo-scan` | Quét dấu TODO | đếm dấu TODO, FIXME, HACK, XXX theo file và glob |

## 10b. Tag chuyên môn mặc định (`registry/tags.json`)

| id | VI | EN |
|---|---|---|
| `frontend` | Giao diện web | Frontend |
| `backend` | Máy chủ | Backend |
| `db` | Cơ sở dữ liệu | Database |
| `infra` | Hạ tầng | Infrastructure |
| `i18n` | Đa ngôn ngữ | Internationalisation |
| `e2e` | Kiểm thử đầu-cuối | End-to-end tests |
| `integration` | Kiểm thử tích hợp | Integration tests |
| `docs` | Tài liệu | Documentation |

## 11. Giá trị liệt kê trong schema

Mọi giá trị enum xuất hiện trong [schemas/](schemas/) có ở bảng này hoặc ở một mục khác của file này.

| Trường | Giá trị (id) | Nghĩa (VI) |
|---|---|---|
| `rank` (cũng `breakers.high_rank_from`, `laws.rank_floor[].min_rank`, `set_rank`) | `F`, `E`, `D`, `C`, `B`, `A`, `S` | hạng thấp → cao |
| `tier` | `script`, `session` | bậc script / phiên mới |
| `territory.kind` | `code`, `docs`, `content`, `data`, `mixed` | loại lãnh thổ |
| `vcs.type` | `git`, `none` | |
| `health.ci` | `green`, `red`, `unknown` | thời tiết lãnh thổ |
| `plot.type` | `worktree`, `folder`, `none` | đất riêng |
| `deliverable.type` (cũng `kind.deliverable_type`) | `branch`, `file`, `report`, `draft`, `subquests`, `none` | dạng giao hàng |
| `created_by` | `chancellor`, `user`, `council`, `patrol`, `battle`, `campaign` | ai tạo quest (`council` = hội đồng Nghị hội, `battle` = Trận đánh) |
| `role` (`attempt_log`, `character.current`) | `assignee`, `verifier` | người làm / người nghiệm thu |
| `attempt_log.outcome` | `submitted`, `partial`, `returned`, `timeout`, `breaker`, `crash`, `paused`, `blocked`, `cancelled` | kết thúc một lần thử; `timeout` = cầu dao thời gian, `breaker` = cầu dao token/lượt; `partial` = người chấm nộp phán quyết dở (P1-42; mục cũ ghi `submitted`) |
| `units[].outcome` | `pending`, `done`, `not_done`, `needs_user`, `debt` | chưa xử lý / xác quái / bia mộ / thương binh / đổ nát |
| `verdict.result` | `pass`, `fail`, `partial` | đạt / không đạt / dở dang (người kế đọc tiếp) |
| `verdict.fail_kind` (cũng `consecutive_fail.fail_kind`) | `tests_fail`, `scope_creep`, `missing_i18n`, `wrong_facts`, `incomplete`, `style`, `unsafe`, `other`, `flaky` | loại lỗi, để đếm "cùng loại"; `flaky` (từ P1-20, ADR 0022): một check vừa qua vừa trượt trên cùng commit, Quản sự mở quest Trừ tà |
| `verdict.verifier_id` (giá trị đặc biệt) | `user`, `machine` | dấu vua / verdict máy; không nhân vật nào được mang id này |
| `campaign.mode` | `offense`, `defense` | tấn công (release, launch) / phòng thủ (sự cố) |
| `campaign.status` | `declared`, `active`, `won`, `lost`, `retro_pending`, `closed` | |
| `close_campaign.outcome` | `won`, `lost` | |
| `victory_conditions[].check.type` | `all_quests_done`, `command` | |
| `lesson.source` | `monk`, `user` | Thầy tu viết / người dùng tự thêm |
| `lesson.owner` (giá trị đặc biệt) | `temple` | kinh chung; không nhân vật nào được mang id này |
| `party_role` (quest, quest-draft) | `contract`, `part`, `acceptance`, `merge` | quest hợp đồng / phần / phần test chấp nhận của Khảo hạch mù (Quản sự tạo, không có trong quest-draft) / quest ghép |
| `skill.source` | `monk`, `user` | Thầy tu viết / người dùng viết |
| `skill.scope` (giá trị đặc biệt) | `global` | áp dụng mọi lãnh thổ; nếu không thì là id một lãnh thổ; không lãnh thổ nào được mang id `global` |
| `actor.kind` | `character`, `user`, `steward`, `chancellor`, `herald`, `system` | |
| `owner.profession` | `developer`, `ba`, `marketing`, `researcher`, `other` | |
| `owner.locale` | `vi`, `en` | ngôn ngữ của mọi thứ người dùng đọc |
| `ui.mode` | `night`, `day` | |
| `ui.eco` | boolean | chế độ tiết kiệm |
| `tunnel.kind` | `tailscale`, `cloudflare` | |
| `tribes[].tool.auth` | `login`, `api_key` | đăng nhập của chính CLI (claude.ai, Google, ChatGPT) / API key từ kho bảo vật (trả phí ⇒ bắt buộc `budget.usd_week`) |
| `tribes[].adapter` (có sẵn) | `claude_code`, `antigravity`, `gemini_cli`, `codex_cli` | hoặc `adapters/<name>.mjs` |
| `tribes[].pools` (Antigravity) | `gemini_models`, `claude_gpt_models` | hai pool của Antigravity |
| `dispatch.fairness` | `round_robin_territory` | xoay vòng theo lãnh thổ |
| `dispatch.verifier_same_family` | `different_model`, `machine_only` | khi không có người chấm khác họ model |
| `ritual.pass_rule` | `all_checks_and_agent`, `checks_only`, `agent_only` | |
| `script.produces` | `report`, `units`, `check` | |
| event `agent.tool` → `data.tool` | `read`, `write`, `bash`, `web`, `search`, `other` | |
| event `agent.session.end` → `data.outcome` | `completed`, `max_turns`, `budget`, `killed`, `error` | kết thúc phiên CLI (`RunResult.outcome`); `budget` = chạm `--max-budget-usd` |
| event `quest.infirmary` → `data.trip` | `time`, `tokens`, `turns`, `commit`, `secrets`, `no_verdict`, `partial_verdicts`, `max_attempts`, `script_broken`, `script_usage`, `script_fail` | vì sao vào trạm quân y (P1-32): năm loại cầu dao, việc nghiệm thu kẹt vì người chấm cứ rời đi không ra phán quyết (`no_verdict`, P1-33) hay cứ nộp phán quyết dở (`partial_verdicts`, P1-42), hết số lần thử, hay lượt bậc script mà script hỏng, không dùng được tham số, không đạt; dòng cũ không có trường này |
| event `mana.level` → `data.pool` | id tộc (ví dụ `claude`), `gemini_models`, `claude_gpt_models` | tài khoản một pool dùng id tộc làm pool; Antigravity có hai pool |
| event `mana.level` → `data.window` | `five_hour`, `weekly` | cửa sổ hạn mức |
| event `mana.level` → `data.source` | `rate_limits`, `estimate`, `signal` | ba nguồn gauge (ADR 0009) |
| `kingdom.schedule` | `chronicle`, `temple`, `patrol` | ba lịch, mỗi cái tắt được |
| `kingdom.bell` | `desktop`, `web_push`, `messaging` | ba kênh chuông |

## 12. Danh mục event type (v1)

`type` là chuỗi `nhóm.hành_động`; type chưa biết được giữ nguyên và bỏ qua khi vẽ. Danh mục chính xác và payload: [events.md](events.md) (sinh từ domain) và [schemas/event.schema.json](schemas/event.schema.json).

| Nhóm | Type | Nghĩa (VI) |
|---|---|---|
| Quest | `quest.drafted`, `quest.created`, `quest.claimed`, `quest.released`, `quest.started`, `quest.submitted`, `quest.returned`, `quest.verdict`, `quest.done`, `quest.sealed`, `quest.archived`, `quest.blocked`, `quest.unblocked`, `quest.paused`, `quest.resumed`, `quest.infirmary`, `quest.delivered`, `quest.edited`, `quest.unclaimable` | mỗi chuyển trạng thái của quest (§2.5 của implementation-plan); `quest.edited`: người dùng sửa trường của quest (`edit_quest`, `set_rank`); `quest.unclaimable`: Quản sự báo quest `open` không ai nhận được (§3.1) |
| Phiên agent | `agent.session.start`, `agent.session.end`, `agent.tool`, `agent.tool.blocked`, `agent.subagent.start`, `agent.subagent.end`, `agent.subagent.overrun`, `agent.compact`, `agent.notification` | những gì phiên CLI làm, do hook và stream ghi; `overrun` = học đồ quá `subagent_max_minutes`; `compact` = ngồi thiền |
| Kiểm tra máy | `check.start`, `check.end` | kiểm tra máy của một lượt đã nộp chạy ngoài nhịp, quest nằm `review` chưa có người chấm trong lúc đó; `check.end` nói `pass`, `fail`, `error` (chưa chạy được, tick sau chạy lại) hay `stopped` (Quản sự dừng hoặc quest đi tiếp) |
| Phán quyết | `verdict.pass`, `verdict.fail`, `verdict.partial` | kết quả nghiệm thu |
| Mana | `mana.level`, `mana.warning`, `mana.exhausted`, `mana.restored`, `mana.probe`, `mana.signal` | số đo, cảnh báo (một lần mỗi đồng hồ), hết, hồi sinh, thăm dò, tín hiệu hết trong băng (429, `StopFailure`); `exhausted`/`restored` có `model` khi chỉ trần riêng của một model ngủ hay thức |
| Nhân vật | `character.created`, `character.sleep`, `character.wake`, `character.meditate`, `character.suspend`, `character.release`, `character.swamp`, `character.level_up`, `character.level_down`, `character.model_changed` | |
| Lệnh | `command.received`, `command.applied`, `command.rejected` | Quản sự xử lý `inbox/` |
| Khác | `delivery.sent`, `plot.patched`, `plot.merged`, `plot.restored`, `chronicle.written`, `territory.attached`, `territory.surveyed`, `territory.health`, `sandbox.replay.start`, `sandbox.replay.end` | `plot.patched`: Quản sự áp bản vá của người làm vào `laws.patch_paths` trước commit `submit` (P1-28); `plot.merged`: Quản sự gộp các nhánh phần vào nhánh quest ghép, hoặc dừng ở một nhánh (P1-21); `plot.restored`: sau phiên người chấm ngoài đất nháp, Quản sự đưa đất của quest về commit của nó, bỏ những gì lệnh của người chấm để lại (P1-44) |
| Dành sẵn | `campaign.*`, `battle.*`, `incident.*`, `patrol.*`, `party.*`, `skill.*` | giai đoạn 5; đội và bí kíp |

## 13. Dữ liệu registry mặc định

Ví dụ trong [schemas/kind.schema.json](schemas/kind.schema.json) và [schemas/ritual.schema.json](schemas/ritual.schema.json); chốt ở P0-02 trong `packages/registry-default`.

Kiểm tra mặc định theo kind (`kind.checks_default`) — tên loại kiểm tra; lãnh thổ ánh xạ chúng vào lệnh thật trong `territory.checks`:

| kind | id kiểm tra | Nghĩa (VI) |
|---|---|---|
| `build` | `test`, `lint`, `typecheck`, `build` | test, lint, kiểm kiểu, build |
| `research` | `links_alive`, `citations` | nguồn còn sống, số liệu có trích dẫn |
| `fix` | `regression_test`, `test` | có regression test mới + toàn bộ test cũ |
| `refactor` | `benchmark`, `test`, `diff_stats` | benchmark, test, số liệu trước/sau |
| `document` | `links_alive`, `toc`, `terminology` | link, mục lục, thuật ngữ nhất quán |
| `publish` | `length`, `banned_words`, `utm_links` | độ dài, từ cấm, link UTM |
| `analyze` | `rerun_script`, `numbers_match` | chạy lại script, số khớp |
| `plan` | `subquests_complete` | mọi quest con có hạng, nghề, mana |
| `integrate` | `stable_days`, `docs_present`, `owner_named`, `legacy_removed` | chạy ổn N ngày, có docs, có người phụ trách, hệ cũ đã tháo |
| `negotiate` | — | |
| `batch` | `per_unit` | mỗi đơn vị có pass/fail riêng |

Bước nghi thức (`ritual.steps[]`):

| id | Nghĩa (VI) |
|---|---|
| `run_checks` | chạy kiểm tra máy (trước khi agent chấm) |
| `read_handover` | đọc thư bàn giao |
| `read_diff` | đọc diff của nhánh |
| `read_draft` | đọc bản nháp |
| `read_plan` | đọc kế hoạch và quest con |
| `check_sources` | kiểm từng nguồn được trích |
| `cross_check_sources` | đối chiếu tài liệu với nguồn gốc |
| `check_regression_test` | có test tái hiện lỗi và test đó xanh |
| `check_tests_cover_change` | thay đổi hành vi có test đi kèm (khi lãnh thổ có test); thiếu thì `fail_kind: incomplete` |
| `compare_before_after` | so số liệu trước/sau |
| `score_tone_checklist` | chấm theo checklist giọng điệu/thương hiệu |
| `rerun_from_source` | tính lại từ dữ liệu gốc |
| `compare_numbers` | so khớp số |
| `challenge_scope` | phản biện phạm vi |
| `tally_units` | điểm từng đơn vị của trận |
| `judge` | agent chấm theo nghi thức |
| `write_verdict` | ghi phán quyết |
| `rerun_clean` | chạy lại trong đất nháp sạch, DB sạch (từ P1-20) |
| `break_and_expect_red` | đập thử: làm hỏng thứ test bảo vệ, test phải đỏ (từ P1-20) |
| `flake_check` | chạy 3 lần, flaky thì không qua (từ P1-20) |
| `coverage_not_lower` | coverage không giảm so với base (từ P1-20) |

## 14. Từ cấm trong identifier

Đã có từ chính thức, nên không dùng từ bên trái trong identifier, khóa JSON hay id dữ liệu. `pnpm docs:check` quét mã chạy và dữ liệu (identifier, khóa JSON, chuỗi dạng id), trừ test, fixture, file cấu hình công cụ và chuỗi văn xuôi; hai từ chỉ cấm theo một nghĩa (`budget`, `agent`) để review bắt, không quét. Văn xuôi trong tài liệu không bị cấm.

| Từ cấm | Dùng thay |
|---|---|
| `dispatcher` | `steward` |
| `intake` | `chancellor` |
| `approve`, `approval` | `seal` |
| `reviewer` | `judge` (class), `verifier` (vai) |
| `worker` | `assignee` |
| `task` | `quest` |
| `provider` | `tribe` (tộc; "nhà cung cấp" chỉ dùng trong văn xuôi) |
| `team` | `party` (đội) |
| `subclass`, `specialization` | `tag` (chuyên môn là danh tiếng theo tag, không phải nghề con) |
| `project` | `territory` |
| `tester` | `knight` + tag `e2e` (không có nghề tester: viết test là viết code, kế hoạch sản phẩm 0.7) |
| `budget` khi nói về mức mana | `mana` (`budget` chỉ dùng như mục 3) |
| `agent` khi nói về nhân vật | `character` (nhóm event `agent.*` nói về phiên CLI, không phải nhân vật) |

Id "màu mè" bị thay bằng từ thông dụng; `pnpm docs:check` cũng chặn chúng:

| Id "màu mè" | Dùng thay |
|---|---|
| `exorcise` | `fix` |
| `fortify` | `refactor` |
| `proclaim` | `publish` |
| `divine` | `analyze` |
| `conquer` | `integrate` |
