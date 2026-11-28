# Đợt 3–4 của giai đoạn 2 — PS-10, PS-13, PS-18: kế hoạch chi tiết

Ngày: 2026-11-28 · Trạng thái: **chủ nhân đã chốt** X1–X14 ngày 2026-11-28 (mục "Quyết định" cuối file; [§11, 2026-11-28](../implementation-plan/11-2026-11-28.md), dòng "docs/plan-phase-2-wave-3"): X4 và X7 khác khuyến nghị, các mục còn lại theo khuyến nghị. X15–X17 bổ sung cùng ngày, X18 còn mở. Phiên kế hoạch chỉ viết tài liệu: không sửa code, không mở task, không đổi ô Trạng thái ở §8. Chủ nhân chọn ba task này trong phiên (hộp hỏi đáp, 2026-11-28); PS-14, PS-15 (cần PS-13) và PS-16, PS-17, PS-19, PS-20 (giai đoạn sau) chưa có mục chi tiết. Bất biến đã chốt mà kế hoạch này giữ: [ADR 0024](../adr/0024-typed-letters-through-the-steward.md) (thư có kiểu, không ai nhắn vào phiên đang chạy), [ADR 0020](../adr/0020-class-skill-scripture-tags-and-parties.md) (bí kíp không gắn vào nhân vật), [ADR 0025](../adr/0025-persona-is-display-only.md) (tính cách chỉ để hiển thị), [ADR 0005](../adr/0005-single-writer-steward-inbox.md), [ADR 0016](../adr/0016-registry-data-not-code.md), [ADR 0021](../adr/0021-tribe-contract.md), luật thư mục R1–R8 ([§4.2](../implementation-plan/4-code-quality.md)) và ba tầng tách biệt.

Việc vào đợt nào và mở khi nào do phiên điều phối xếp; file này chỉ ghi phụ thuộc. [phase-2.md](phase-2.md) §4 xếp PS-10, PS-13 vào đợt 3 (cùng P2-07) và PS-18 vào đợt 4; PS-12 ở cùng dòng đó đã xong.

## Điều code cho thấy (2026-11-28)

Khảo sát ở `a4d08ab2` (`main`). Số dòng nối tiếp bảng của [phase-2-wave-1.md](phase-2-wave-1.md) (43–58). Phiên làm task kiểm lại điều mình dựa vào trước khi viết code.

| # | Thực tế trong code | Hệ quả |
|---|---|---|
| 59 | Kiểu thư là dữ liệu: `packages/registry-default/memos.json` có bốn kiểu (`proposal` → `chancellor`, `objection` → `judge`, `amendment` → `author`, `advisory` → `quests`). `MEMO_ROUTES` (`packages/domain/src/schema/memo/constants.ts`) là danh sách đóng năm đường. `routeMemo` (`packages/domain/src/memo/memo.ts`) tra registry, không `switch` theo kiểu. Chuỗi `request` chưa là kiểu thư ở đâu cả; chú thích của `MEMO_ROUTES` và mô tả của `MemosFileSchema` ghi "PS-10 adds the route of request" | PS-10 thêm một mục registry. ADR 0024 gửi `request` tới Tể tướng, tức đường `chancellor` đã có: không cần đường mới (X8). Hai chú thích đó sửa theo |
| 60 | Thư đường `chancellor` đã có đường đi trọn: người làm viết ở mục `Memos` của thư bàn giao (luật 8 của `packages/runner-core/prompts/assignee.md`), `memosOf` (`runner-core/src/runner/handover.ts`) đọc, `fileMemos` (`packages/steward/src/memos/file.ts`) lập `memos/<id>.json` và phát `memo.filed`, `memo.routed`. `elvaria triage` lấy thư mở theo `TRIAGED_ROUTES = ['chancellor']` (`apps/cli/src/triage/waiting.ts`); `triageMemos` (một phiên cho cả lô, không nêu kiểu nào) rồi `triageCommands` (thuần) ra `edit_quest` (gộp vào quest nháp hay mở), `create_quest` (mở khi trong ủy quyền, nháp khi ngoài), `decide_memo`, `escalate_memo` | `request` đi nguyên đường này. Phần mới của PS-10 là chữ: luật viết thư trong prompt người làm, cách Tể tướng đọc một `request`, và dấu "quest nào đang cần" trên bản nháp |
| 61 | Nhiếp chính không import `chancellor`; chỉ `apps/cli` gọi Tể tướng (`say`, `triage`, `amend`, `temple`, `chronicle`). Quest nháp là trạng thái `draft` (`confirm` → `open`, `discard` → `archived`, chỉ chủ nhân). `create_quest.payload.memos` nối quest mới với thư; thư giữ `quest` của người viết | "Không tới thẳng nhân vật nào" đã đúng theo cấu trúc: thư không có đường nào tới một phiên đang chạy. PS-10 giữ điều đó bằng test, không dựng thêm rào |
| 62 | Một quest chỉ tự chờ theo thư ở kiểu `amendment` (`submitEndOf`, quest `blocked` chờ người viết đề). `quest.depends_on` chỉ gác lúc nhận việc của quest `open` | Người viết `request` không tự chờ quest được nhờ. Hôm nay muốn chờ thì hỏi chủ nhân một câu (X3) |
| 63 | Hợp đồng `skill` v1 đã có (`packages/domain/src/schema/skill/skill.ts`: `id`, `title`, `description` một dòng, `tags`, `scope`, `source` là `monk` hay `user`, `derived_from`, `max_tokens` mặc định 2 000 và tối thiểu 100), cùng `docs/schemas/skill.schema.json` và `packages/domain/examples/skill.json`. Tiền tố event `skill.*` giữ chỗ, chưa có type. Chưa có `packages/domain/src/skill/`, chưa có `selectSkills`; `store` không đọc `temple/skills/` (chỉ một chú thích ở `layout.ts`); repo không có parser YAML nào | PS-13 không đổi hợp đồng `skill`; thêm hàm chọn, phần đọc file và chỗ nối |
| 64 | Chỗ nối đã chừa: `buildPrompt` nhận `skills: readonly Skill[]`, khối `skills` có trong `PROMPT_BLOCK_IDS` (chỉ ở prompt người làm), `skillsBlock` (`runner-core/src/prompt/blocks.ts`) chỉ in `id` và `description`; `promptOf` (`steward/src/sessions/prompt.ts`) truyền `skills: []`; `LoadTrace.skills` (mảng id) đã có trong schema và trong `loadTraceOf` | Khối hôm nay là một danh sách, viết cho cách nạp của CLI (thân nằm ở file). Đường chèn vào prompt cần thân bí kíp trong khối. Dấu vết nạp không cần event mới |
| 65 | `selectLessons` (`packages/domain/src/temple/select.ts`) là mẫu: hàm thuần nhận phiên, trả thứ được nạp và thứ bị loại; trần là số dòng (`SCRIPTURE_LINES_MAX` 40). Code không có bộ đếm token: cỡ khối đo bằng ký tự (`prompt-blocks.ts`), `skill.max_tokens` chưa ai đọc | `selectSkills` theo hình dạng đó ([temple-first.md](temple-first.md) đã dặn). `max_tokens` cần một phép quy đổi có tên (X9) |
| 66 | Cấu hình theo lần chạy của ba adapter: Claude chạy `--setting-sources project,local`, `--strict-mcp-config`, `--tools` theo nghề (không có `Skill`), file ở `.runs/`. agy ghi `.agents/hooks.json`, shim và `GEMINI.md` vào đất riêng rồi gỡ sau phiên, giữ nguyên `.agents/` của lãnh thổ (`run-files.spec.ts` có ca `.agents/skills/`). Codex chạy `--ignore-user-config --disable plugins`, ghi `AGENTS.override.md` vào đất riêng; `CODEX_HOME` không bao giờ trỏ vào thư mục lần chạy | Không adapter nào có chỗ cho bí kíp. Mọi cách nạp của CLI đều phải ghi file vào đất riêng hay thêm cờ, tức đổi argv và settings: phải chạy `ELVARIA_LIVE=1` |
| 67 | Đã đo về skill: Claude Code ([spike](../spikes/claude-2026-11.md), bổ sung P1-09) với `--setting-sources project,local` bỏ 13 skill cấp người dùng (32 → 19); danh sách skill chỉ vào prompt khi phiên có tool `Skill`, mà `--tools` của nhân vật không có nó; config dir mới không nạp gì từ `~/.claude` ([spike config dir](../spikes/claude-config-dir-2026-11-17.md)). Codex có khối `<skills_instructions>` lấy từ `~/.codex/skills` và plugin ([spike](../spikes/codex-2026-11-12.md), [máy] và [suy]). agy: chỉ có tài liệu đi kèm gói nói về `.agents/`. Chưa tài liệu nào đo việc nạp một `SKILL.md` của lãnh thổ hay của lần chạy khi headless, ở cả ba CLI | Spike của PS-13 còn nguyên, và nay là ba CLI. Trên Claude, bật cách nạp của CLI nghĩa là thêm tool `Skill` vào phiên, kéo cả danh sách skill dựng sẵn vào ngữ cảnh |
| 68 | `AdapterCapabilities` có chín cờ bắt buộc (`ADAPTER_CAPABILITIES`) và các trường tùy chọn thêm sau (`vision`, `search`, `read`, `config_dir`…). `tribeLimitsOn` đưa `vision` vào `TribeLimits` mà không thêm dòng `TRIBE_NARROWING`, để file adapter cũ vẫn qua | Năng lực nạp bí kíp, nếu có, là một trường tùy chọn theo mẫu `vision` (PS-13c) |
| 69 | `character` v1 (`packages/domain/src/schema/character/character.ts`) không có `persona`; chữ `persona` không xuất hiện trong mã nào. `character add` (`--class`, `--tribe`, `--model`, `--level`, `--name`) ghi thẳng file nhân vật (ngoại lệ ADR 0005 của `apps/cli`); đổi nhân vật sau đó đi qua inbox (`set_model`, `set_level`, `pin_tag`) | `persona` là trường tùy chọn thêm sau v1. Đổi tính cách sau khi sinh cần một kind inbox (X7) |
| 70 | Theme: `kingdom.theme` là một chuỗi. Dữ liệu theo theme duy nhất hiện có là bể ngoại hình của tộc trong `domain` (`THEME_POOLS = { fantasy }`, `packages/domain/src/tribe/fantasy-looks.json`, PS-24). Không có thư mục `themes/`, không có schema theme. `packages/ui`, `ui-kit` và `apps/lite` chưa tồn tại (P2-02, P2-07) | Bảng tính cách đi theo mẫu của bể ngoại hình (X6). Bảng nhân vật trên giao diện chưa có để hiện tính cách |
| 71 | Lời của nhân vật tới chủ nhân hôm nay chỉ có hai chỗ: (a) câu hỏi, do người làm viết ngay trong phiên làm việc (mục Câu hỏi của thư bàn giao); (b) phần văn của biên niên sử, một lượt không tool của nhân vật nghề `bard` (`askBard`, `buildChroniclePrompt`; mục P2-06b đã ghi "Tính cách trong lời văn là PS-18"). Tể tướng là một nhân vật (`pickChancellor`) nhưng câu trả lời của nó là dữ liệu có cấu trúc, CLI dựng chữ qua i18n. `summon` chỉ mở terminal của phiên đang chạy; khung chat là P2-10, sau spike P2-05 | Khối "khi nói với chủ nhân" chưa có phiên nào để gắn mà không chạm prompt làm việc, vì câu hỏi nằm trong phiên làm việc. Chỗ đầu tiên dùng được tính cách là biên niên sử (X5) |
| 72 | `planTick(snapshot, now)` và `selectVerifier(quest, candidates, policy)` nhận `Character` nguyên vẹn; hôm nay chúng đọc `id`, `tribe`, `status`, `status_since`, `current`, `level`, `class`, `model`. Prompt có 28 file snapshot ở `packages/runner-core/src/prompt/__snapshots__/` | "Không nhận `persona`" làm được bằng kiểu (`Omit`) mà không đổi người gọi, cộng test đối chiếu có và không có tính cách |

### Chỗ kế hoạch cũ nói sai so với code hay với quyết định sau nó

- [§3.16.9](../implementation-plan/3.16-self-strengthening.md), dòng PS-13 ở §8 và §10 câu 2 viết "hai CLI", "`~/.claude`, `~/.gemini`". Từ ADR 0021 và P1-12d có ba tộc: spike đo cả Codex, và luật không chạm thư mục home gồm cả `~/.codex`.
- ADR 0020 ghi "How each CLI receives a skill is settled by a spike in stage 5"; mô tả `LoadTrace.skills` ("empty until stage 5"), chú thích của `skillsBlock`, `build-prompt.ts`, `sessions/prompt.ts` và `prompts/skills.md` nói cùng ý. §8 đã kéo việc đó về giai đoạn 2. PS-13 sửa các chỗ này; ADR sửa tại chỗ kèm `(Amended …)`.
- Chú thích "PS-10 adds the route of request" (dòng 59) sai nếu X8 theo khuyến nghị.
- [phase-2.md](phase-2.md) §4 xếp PS-12 vào đợt 3; PS-12 đã xong, đợt 3 còn PS-10 và PS-13 cạnh P2-07.
- [§3.16.11](../implementation-plan/3.16-self-strengthening.md) và ADR 0025 kể "câu hỏi" là một phiên nói được với chủ nhân, và cùng lúc đòi prompt làm việc không đổi một ký tự. Hai điều đó không cùng đúng được (dòng 71): câu hỏi được viết trong phiên làm việc. X5 chọn một cách hiểu.
- Số dòng của bảng "Điều code cho thấy": [phase-2-wave-1.md](phase-2-wave-1.md) đánh 43–58, trùng số với [phase-2-merge-queue.md](phase-2-merge-queue.md) (43–64); [sibling-tribes.md](sibling-tribes.md) dùng 65–87. File này nối tiếp wave-1 (59–72) nên cũng trùng số với hai file kia. Khi dẫn một dòng thì nêu cả tên file.

## PS-10 — Thư `request`

- **Mục tiêu**: người làm cần một thứ mà vùng khác phải làm thì viết một thư `request`. Thư tới Tể tướng qua triage và thành một quest (nháp, hay mở khi nằm trong ủy quyền; X2), hoặc được gộp, hoặc bị gác. Thư không bao giờ tới một nhân vật hay một phiên đang chạy.
- **Đọc trước khi sửa**: ADR 0024, 0016, 0005; §3.16.2 và §3.16.3; `packages/domain/src/schema/**` (ADR 0003: chỉ sửa chú thích và mô tả); `packages/runner-core/prompts/assignee.md`, `triage.md`, `triage-context.md` và snapshot của chúng.
- **Thêm**:
  - Registry: mục `request` trong `packages/registry-default/memos.json` với `route: chancellor` (X8), tên hiển thị `vi` và `en` (đề xuất "Nhờ việc" / "Request"; task chốt theo glossary), README và spec của registry.
  - Vương quốc đang chạy nhận kiểu mới qua phần làm mới registry mặc định của `elvaria upgrade` (`refreshRegistryDefaults`; file chủ nhân đã sửa thì `upgrade` nêu tên, như hôm nay). Task thêm ca test cho `memos.json`. Vương quốc chưa có kiểu này thì một dòng `request` là `unknown_kind`, như mọi kiểu lạ.
  - Prompt người làm (`assignee.md`): một luật mới cạnh luật 8 và 9. Nội dung: `request` là thứ **quest này cần** mà vùng khác phải làm (một endpoint, một trường schema, một bản sửa ở file ngoài `scope_paths`); dòng mẫu `- request: <thứ cần; vì sao quest này cần; quest này làm tới đâu khi chưa có> refs: <path>, <path>`; một câu phân biệt bốn thứ: `proposal` (việc tôi thấy, quest này không cần), `request` (thứ quest này cần), `amendment` (đề sai), câu hỏi (chủ nhân phải quyết). Việc làm tiếp theo X3: làm phần làm được sau một giao diện nêu trong thư, nộp, ghi phần còn chờ vào thư bàn giao; không làm được gì khi thiếu thứ đó thì viết thư rồi hỏi chủ nhân một câu nêu thư đó. Phần của một đội không viết `request` cho phần khác: thứ cần ở phần khác là chuyện của hợp đồng, viết `amendment` tới pháp sư (ADR 0024: hợp đồng là nơi duy nhất chứa quyết định chung).
  - Prompt triage (`triage.md`, `triage-context.md`): mỗi thư trong lô hiện kèm kiểu của nó, và một luật đọc `request`: bản nháp nói rõ thứ phải giao, nêu id quest đang cần ở mô tả, đặt ở vùng của thứ được nhờ (lãnh thổ, nghề, `scope_paths` theo `refs`). Bốn hành động sẵn có (`merge`, `new_quest`, `shelve`, `owner`) đủ dùng: không thêm `TriageAction`, không đổi hợp đồng `memo-triage`.
  - Ủy quyền: `delegationHolds` quyết như với `proposal` (X2). `triageCommands` không đổi.
  - Hiển thị: tên kiểu ở những nơi liệt kê thư (bản tấu, `elvaria triage`) đã lấy từ registry; task kiểm và thêm chuỗi còn thiếu. Glossary: sửa câu "`request` đến ở PS-10" trong mô tả của `advisory`, rồi `pnpm docs:gen`.
  - Sổ đo: `Metrics.memos` đã đếm theo kiểu; task kiểm rằng `request` hiện ra mà không sửa gì.
  - Sửa chú thích của `MEMO_ROUTES` và mô tả của `MemosFileSchema` (`pnpm schemas`).
- **Không làm**: đường mới trong `MEMO_ROUTES`; người viết tự chờ và tự thức (PS-10b bên dưới, X3); thư trả lời; `request` giữa các phần của một đội; đổi máy trạng thái quest; trần số `request` mỗi lượt (id tất định của thư đã chặn thư trùng, `TRIAGE_MEMOS_MAX` chặn cỡ lô).
- **Test** (CLI giả, 0 mana):
  - Domain: `routeMemo` với `request` ra `chancellor`. Spec của registry có cặp id và đường.
  - Steward: thư bàn giao có một dòng `request` ⇒ `memo.filed` và `memo.routed` tới `chancellor`; không quest nào khác đổi trạng thái; không có `memo.delivered` nào. Đây là ca "không tới thẳng nhân vật nào" của dòng §8.
  - `elvaria triage` với Tể tướng giả: `request` ngoài ủy quyền ⇒ một `create_quest` có `draft: true`, mang `memos: [id]`, không có `assignee`, kèm một `escalate_memo`; trong ủy quyền ⇒ quest `open` (theo X2).
  - Snapshot `assignee-*.txt` và `triage.txt` đổi đúng phần luật mới; snapshot người chấm không đổi.
  - `upgrade` đưa kiểu mới vào registry mặc định của một vương quốc tạm.
- **Xong khi**: `pnpm check` và `pnpm -r test` xanh; `pnpm schemas`, `pnpm docs:gen` sạch; README của `registry-default`, `runner-core` và `chancellor` nói đúng. Sau khi vào bản ghim: thư `request` thật đầu tiên trên vương quốc của chủ nhân được ghi vào §11 (quan sát, không là cổng merge).
- **Cỡ**: S, một phiên. **Model gợi ý**: Opus 5.5, effort high. **Mana**: 0. Khi chạy thật, mỗi `request` là thêm một thư trong lô triage sẵn có, không thêm phiên nào.

**PS-10b (đề xuất, chưa có dòng §8)** — người viết `request` tự chờ: quest giữ dấu của thư (như `quest.amendment`) và chờ ở `blocked`; Nhiếp chính đánh thức nó khi thư đóng (bị gác, bị bác) hay khi quest sinh từ thư tới nhánh gốc, kèm một khối trong prompt nói kết cục. Việc này chạm máy trạng thái quest (vùng "Đọc trước khi sửa") nên cần mục chi tiết riêng. Điều kiện mở (X3): sổ đo có ít nhất 10 thư `request`, và hơn một nửa đi kèm một câu hỏi chờ chủ nhân.

## PS-13 — Bí kíp vào phiên: tổng quan và cách chia

- **Mục tiêu**: quest có tag nhận tối đa ba bí kíp khớp tag và lãnh thổ, ở mọi tộc, và dấu vết nạp ghi id của chúng.
- **Vì sao chia** (X1, X4): đường chèn vào prompt đằng nào cũng phải có (dòng §8: "tộc không nạp được vẫn nhận nội dung qua prompt"), không tốn mana, giống nhau ở ba tộc và đo được bằng `load_trace.blocks`. Cách nạp của CLI thì khác nhau từng tộc, phải ghi file vào đất riêng, và chưa có số đo nào cho thấy nó đáng: ba bí kíp ở trần mặc định là 6 000 token trên những phiên vài trăm nghìn token. PS-14 và PS-15 chỉ cần PS-13. Chủ nhân chốt (X4): spike PS-13b làm ngay, song song với PS-13, để đóng câu §10 sớm; PS-13c vẫn chờ kết quả spike.

| Id | Việc | Mana | Cần trước | File chạm chính |
|---|---|---|---|---|
| PS-13 | Chọn bí kíp, chèn vào prompt ở mọi tộc | 0 | — | `p/domain/src/skill/**` (mới), `p/store/src/**`, `p/steward/src/sessions/**`, `p/runner-core/src/prompt/**`, `a/cli` (`doctor`) |
| PS-13b | Spike: ba CLI nạp `SKILL.md` theo lần chạy | có, nhỏ (X14) | — (song song với PS-13) | `docs/spikes/`, `docs/reference/` |
| PS-13c | Nạp bằng cách của CLI ở tộc làm được | có (live) | PS-13, PS-13b, chủ nhân chốt sau spike | `p/domain/src/tribe/**`, ba adapter, `p/runner-core` |

## PS-13 — Chọn bí kíp, chèn vào prompt

- **Đọc trước khi sửa**: ADR 0020, 0016, 0027, 0003; `packages/domain/src/temple/select.ts` và spec (mẫu); `packages/steward/src/sessions/prompt.ts`, `load-trace.ts`; `packages/domain/src/schema/**` (mô tả của `LoadTrace.skills` và của `skill`).
- **Thêm**:
  - `packages/domain/src/skill/` (thư mục khái niệm mới, có barrel và một dòng `export *` ở gốc):
    - `selectSkills(skills, session)` thuần, trả `{ loaded, skipped }`. `session` là `{ territory, tags }`. Khớp khi `tags` giao nhau **và** `scope` là `global` hay đúng lãnh thổ của quest. Xếp: bí kíp của lãnh thổ trước `global` (mô tả schema đã nói), rồi nhiều tag khớp hơn, rồi `id`. Lấy `SKILLS_PER_QUEST_MAX` = 3; phần còn lại vào `skipped` với lý do `over_count`.
    - Bí kíp có thân vượt `max_tokens` bị loại trước khi xếp, lý do `over_tokens`, và không bị cắt bớt (X9): nửa bí kíp là bí kíp sai.
    - `parseSkillFile(text)` thuần: tách front matter và thân của `SKILL.md`, trả `Result`. Front matter là tập con phẳng của YAML (khóa vô hướng và danh sách), đọc bằng parser viết tay; không thêm dependency.
    - `skillIssuesOf(skill, body, vocabulary)` thuần: tag ngoài `registry/tags.json`, `scope` không là lãnh thổ nào, `id` khác tên thư mục, thân rỗng, vượt trần. Mỗi lỗi một mã.
    - Hằng số có tên trong `constants.ts`: `SKILLS_PER_QUEST_MAX`, `SKILL_CHARS_PER_TOKEN` = 4 (X9).
  - `store`: `kingdomLayout.skill(id)` và phần đọc `temple/skills/*/SKILL.md`. Thư mục chưa có thì là rỗng (mẫu `devices/` của P2-01); một file hỏng không chặn các file khác.
  - Nhiếp chính: `promptOf` đọc bí kíp qua `store` như `readScriptures`, gọi `selectSkills` với tag và lãnh thổ của quest, cho mọi phiên vai `assignee`. Phiên nối (`--resume`) không nạp lại, như kinh.
  - `runner-core`: `skillsBlock` in thân, mỗi bí kíp một mục có tiêu đề; lời dẫn ở `prompts/skills.md` sửa theo. Đầu vào của `buildPrompt` đổi từ `Skill[]` sang `PromptSkill { id, title, body }`: `id` cho dấu vết, front matter không tới model (như `PromptLesson`). Thêm snapshot `assignee-skills.txt`; các snapshot hiện có không đổi vì khối rỗng khi không có bí kíp.
  - Dấu vết: `load_trace.skills` mang id thật; mô tả schema bỏ "empty until stage 5" (`pnpm schemas`). Không thêm event.
  - Cảnh báo cho bí kíp bị bỏ (dòng §8): `elvaria doctor` in một dòng cho mỗi bí kíp có lỗi, và bản tấu có một mục theo mẫu thông báo của Đền (`templeNoticesOf`). Lỗi là thuộc tính của file, nên không cần event.
  - File kèm trong thư mục bí kíp không vào prompt ở task này: phiên không đọc được thư mục kingdom. `skillIssuesOf` báo `attachments_unused`.
  - Hướng dẫn: [operating-a-kingdom.md](../guides/operating-a-kingdom.md) §11 thêm cách viết một bí kíp, kèm file mẫu.
  - ADR 0020 sửa tại chỗ: bí kíp tới mọi tộc qua prompt; cách nạp của CLI theo spike PS-13b; "stage 5" thành giai đoạn 2.
- **Không làm**: cách nạp của CLI (PS-13c); bí kíp cho người chấm (X10); Thầy tu viết bí kíp và bí kíp theo bản phát hành (X11); lệnh CLI tạo hay sửa bí kíp (chủ nhân viết tay file, `source: user`).
- **Test**:
  - Domain 100 %: tối đa ba; thứ tự tất định; lãnh thổ trước `global`; tag không khớp; `scope` của lãnh thổ khác; vượt `max_tokens` bị loại kèm lý do; bốn bí kíp khớp thì cái thứ tư `over_count`. Parser: file hợp lệ, thiếu khóa, `monk` thiếu `derived_from`, mô tả hai dòng.
  - Store: thư mục tạm có dấu cách; thư mục chưa có; một file hỏng cạnh một file tốt.
  - Nhiếp chính (CLI giả): quest có tag khớp ⇒ prompt có thân bí kíp và `quest.started` mang `load_trace.skills` đúng id; quest không tag ⇒ khối rỗng; phiên người chấm không có khối; phiên nối không nạp lại.
- **Xong khi**: `pnpm check` và `pnpm -r test` xanh; `pnpm schemas`, `pnpm docs:gen` sạch; `pnpm layout`, `pnpm knip` sạch với thư mục mới; README của `domain`, `store`, `steward`, `runner-core` nói đúng.
- **Cỡ**: M, một phiên. **Model gợi ý**: Opus 5.5, effort high. **Mana**: 0. Khi chạy thật, phiên người làm của quest có bí kíp khớp dài thêm tối đa khoảng 6 000 token đầu vào, đếm được ở `load_trace.blocks`.

## PS-13b — Spike: ba CLI nạp `SKILL.md` theo lần chạy

- **Mục tiêu**: trả lời §10 câu 2 (PS-13) cho Claude Code, agy và Codex ở phiên bản đang ghim lúc làm ([cli-facts 2026-11-21](../reference/cli-facts-2026-11-21.md): 2.1.329, 1.5.13, 0.171.0-alpha.13).
- **Ai làm** (X14): một phiên Claude Code của chủ nhân, như P1-02, P1-12a và P2-05. Nhân vật không được chạy một CLI trong phiên của mình.
- **Câu phải trả lời, cho từng CLI**:
  1. Đặt `SKILL.md` ở đâu thì được nạp mà không chạm thư mục home: trong đất riêng, hay ngoài đất qua một cờ. Tên thư mục và tên cờ trong tài liệu của từng CLI là giả thuyết cho tới khi đo.
  2. Phải bật gì. Với Claude: thêm tool `Skill` vào `--tools` kéo theo bao nhiêu token của danh sách skill dựng sẵn (cách đo của con số 4 681 token ở spike cũ).
  3. Với các cờ cô lập đang dùng (dòng 66), bí kíp của lần chạy có còn được nạp, và skill cấp người dùng có còn bị loại không.
  4. Model có tự đọc thân khi việc khớp mô tả không, và hook hay stream có thấy lần đọc đó không. Dấu vết cần phân biệt "đã chào" với "đã đọc".
  5. File đặt trong đất riêng có lọt vào `git status` hay `prettier --check .` của lãnh thổ không (bẫy `.agents/` của P1-16), và có đụng thư mục skill sẵn có của lãnh thổ không.
  6. Khi `--resume` có phải đặt lại không.
- **Đo ít mana**: Claude có `-p "/context"` trên config dir giả (0 mana, spike config dir đã dùng); Codex có `codex debug prompt-input` (0 mana). Câu 4 cần phiên thật.
- **Kết quả**: `docs/spikes/skills-<ngày>.md` (mỗi dữ kiện ghi nguồn: [máy], [docs], [suy]); bản `cli-facts` mới chỉ ghi phần đổi; [.claude/rules/runner.md](../../.claude/rules/runner.md) và §10 sửa theo; một đề xuất cho PS-13c (tộc nào, tên năng lực, chỗ đặt file), hoặc "không tộc nào đáng" kèm số đo.
- **Không làm**: code adapter. Không đọc, không ghi `~/.claude`, `~/.gemini`, `~/.codex`.
- **Cỡ**: S. **Model gợi ý**: Fable 5.2, effort high (ít code, nhiều suy luận từ kết quả đo). **Mana**: có; trần đề xuất ở X14.

## PS-13c — Nạp bằng cách của CLI (phác thảo, viết chi tiết sau spike)

Năng lực tùy chọn `skills` trong `AdapterCapabilities` theo mẫu `vision` (dòng 68), thành `TribeLimits.skills` là `native` hay `prompt`. Adapter có năng lực ghi các bí kíp đã chọn vào chỗ spike chỉ ra, gỡ sau phiên như file hook; khối prompt của tộc đó chỉ còn danh sách. Tộc khác giữ đường chèn của PS-13. Có kịch bản conformance và một lần chạy live.

## PS-18 — Tính cách: tổng quan và cách chia

- **Vì sao chia** (X1, X5): ADR 0025 cho tính cách tới hai chỗ. Chỗ thứ nhất, khối "khi nói với chủ nhân", chưa có phiên nào để gắn (dòng 71) cho tới khung chat triệu hồi. Chỗ thứ hai, lời hiển thị "cùng đường với Nhà thơ", đã có từ P2-06b.

| Id | Việc | Mana | Cần trước | File chạm chính |
|---|---|---|---|---|
| PS-18 | Tính cách là dữ liệu hiển thị; bất biến; giọng trong biên niên sử | 0 khi test | P2-06b (đã xong) | schema `character`, `p/domain/src/character/**`, `p/domain/src/{dispatch,verify}/**` (chỉ kiểu), `a/cli/src/character/**`, `p/steward/src/inbox/**`, `p/runner-core/prompts/chronicle*.md`, i18n |
| PS-18b | Khối "khi nói với chủ nhân" | theo phiên chat | P2-10 | `p/runner-core/src/prompt/**` |

## PS-18 — Tính cách là dữ liệu hiển thị

- **Mục tiêu**: mỗi nhân vật có thể mang một tính cách mà chủ nhân thấy (lệnh `character`, biên niên sử, trạng thái thế giới cho giao diện về sau), còn mọi quyết định, mọi prompt làm việc và prompt người chấm giữ nguyên từng byte.
- **Đọc trước khi sửa**: ADR 0025, 0008, 0014; `packages/domain/src/schema/**` (ADR 0003); `packages/domain/src/verify/**` (ADR 0008: task chỉ đổi kiểu của tham số, commit nói rõ).
- **Thêm**:
  - Schema: `character.persona` tùy chọn, thêm sau v1 (`version` giữ 1): `tone` (id trong bảng tính cách), `address` (cách gọi chủ nhân, một dòng, tối đa 40 ký tự) và cách tự xưng đi cặp với nó (X15; tên trường do task chốt theo glossary), `verbosity` (`terse`, `plain`, `chatty`), `quirks` (tối đa ba dòng, mỗi dòng tối đa 80 ký tự). `CharacterView.persona` để khách vẽ được; task xét có tăng `WORLD_STATE_VERSION` không.
  - Bảng tính cách (X6): dữ liệu theo theme trong `domain`, cạnh bể ngoại hình, có schema zod. Tám giọng của ADR 0025 với id `gruff`, `sweet`, `stern`, `calm`, `hot_tempered`, `terse`, `funny`, `cold`. Mỗi mục: tên `vi` và `en`, cặp xưng hô mặc định theo ngôn ngữ (tự xưng và gọi chủ nhân), `verbosity` mặc định, một câu tả giọng cho Nhà thơ. Câu tả giọng tả hành vi (câu dài hay ngắn, mở bằng gì, bỏ gì), không tả bằng tính từ (X15). Chữ tiếng Việt của bảng do chủ nhân duyệt (X12).
  - `personaOf(character, theme)` thuần: tính cách đã điền mặc định từ bảng, hay `null`.
  - CLI: `character add --persona <tone>|none` và `--address <chữ>`. Không nêu cờ thì nhân vật mới rút ngẫu nhiên một giọng từ bảng bằng `RandomSource` (X7, chủ nhân chốt); `--persona none` để không có tính cách (lựa chọn của phiên kế hoạch, cho người muốn tắt). Nhân vật đã có của vương quốc đang chạy không đổi cho tới khi chủ nhân gọi `set_persona`. Lệnh xem nhân vật hiện tính cách. Chuỗi cả `vi` và `en`.
  - Inbox (X7): kind `set_persona { character, persona | null }`; Nhiếp chính ghi file và phát dòng nhân vật. Thêm dòng vào `COMMAND_GROUPS` (nhóm 1) và `COMMAND_SCOPES` (`kingdom`); lệnh `elvaria character persona <id>`.
  - Bất biến bằng kiểu: `CharacterAtWork = Omit<Character, 'persona'>` trong `domain`. `KingdomSnapshot.characters`, ứng viên của `selectVerifier` và `selectAssignee`, và nhân vật trong đầu vào của mọi hàm dựng prompt trừ biên niên sử dùng kiểu này: đọc `persona` ở đó là lỗi `tsc`. Người gọi không đổi, vì một `Character` gán được vào kiểu hẹp hơn.
  - Bất biến bằng test: (1) `runner-core` chạy lại mọi ca snapshot hiện có với nhân vật mang đủ tính cách: 27 file ngoài `chronicle.txt` không đổi một byte; (2) test tính chất trong `domain`: `planTick`, `selectVerifier`, `selectAssignee` cho cùng kết quả khi thêm tính cách ngẫu nhiên vào mọi nhân vật.
  - Biên niên sử (X5): `buildChroniclePrompt` nhận thêm bảng giọng của các nhân vật vừa có mặt trong bảng sự kiện của ngày vừa có tính cách (tên, giọng, cách gọi chủ nhân, độ dài lời, nét riêng), đưa vào `chronicle-context.md` như dữ liệu có khung, cắt theo một trần ký tự có tên. `chronicle.md` thêm luật: được trích một câu ngắn của nhân vật theo giọng đó; dữ kiện vẫn chỉ lấy từ bảng sự kiện; tin xấu nói thẳng (ADR 0025). Giọng chỉ đi qua cặp xưng hô, độ dài câu và nhiều nhất một nét riêng trong mỗi câu trích; không thêm ẩn dụ hay trạng từ đệm (X15, điều 9 và 19 tới 21 của [bản gọn](../reference/viet-tieng-viet-gon.md)). Không nhân vật nào có tính cách thì prompt giữ nguyên (`chronicle.txt` không đổi); thêm snapshot `chronicle-personas.txt`. `checkChronicle` giữ nguyên.
  - `address` và `quirks` là chữ chủ nhân viết: qua `redact` khi ghi, như tên nhân vật.
  - Glossary thêm `persona`, rồi `pnpm docs:gen`. ADR 0025 sửa tại chỗ theo X5.
- **Không làm**: khối "khi nói với chủ nhân" (PS-18b); lời thoại do model viết cho chuông, bản tấu hay câu hỏi (mỗi dòng một lượt gọi; X5); `moodOf`, `bondOf`, truyền kỳ (PS-19); bảng nhân vật trên giao diện (P2-02, P2-07 đọc `CharacterView.persona`); tính cách tự hình thành theo thời gian.
- **Test**: hai bất biến trên; spec và fixture của schema; `character add` không cờ rút giọng tất định với `RandomSource` giả, `--persona none` không ghi trường nào; `set_persona` từ thiết bị `scoped` bị từ chối (phạm vi `kingdom`); Nhà thơ với CLI giả: có tính cách ⇒ prompt có bảng giọng, văn bịa một quest vẫn bị `checkChronicle` bắt. 0 mana.
- **Xong khi**: `pnpm check` và `pnpm -r test` xanh; `pnpm schemas`, `pnpm docs:gen` sạch; README của `domain`, `runner-core`, `apps/cli` nói đúng. Hai điều kiện của dòng §8 đổi chỗ (X13): "khối chỉ có khi phiên nói được với chủ nhân" sang PS-18b; "sổ đo không đổi ngoài nhiễu" thành một quan sát ghi §11 sau 20 quest kể từ khi đội hình có tính cách.
- **Cỡ**: M. Phiên chật ngữ cảnh thì cắt ở ranh giới tự nhiên: phần biên niên sử thành một task sau. **Model gợi ý**: Opus 5.5, effort high. **Mana**: 0 khi test. Khi chạy thật, lượt Nhà thơ mỗi tối dài thêm vài trăm token nếu đội hình có tính cách.

## PS-18b — Khối "khi nói với chủ nhân" (phác thảo, viết chi tiết cùng P2-10)

Một khối mới trong `PROMPT_BLOCK_IDS`, dựng từ `personaOf`, tối đa khoảng 600 ký tự, chỉ có trong prompt của phiên chat triệu hồi: cách gọi, giọng, độ dài lời, nét riêng, và câu "tin xấu nói thẳng; giọng không vào code, commit, tài liệu giao hay thư bàn giao". Hợp đồng của phiên chat chờ spike P2-05 và §10 câu 1, nên mục này chưa viết được chi tiết.

## PS-15a — Chữ tiếng Việt của máy: soát chuỗi `vi` và lint

(Bổ sung 2026-11-28, chủ nhân đồng ý trong phiên sau khi xem skill "viet-tieng-viet"; X16.)

- **Mục tiêu**: chủ nhân nói tiếng Việt đọc bản tấu, chuông và kết quả lệnh thì hiểu ngay việc gì đã xảy ra và mình cần làm gì. Phần lớn chữ chủ nhân đọc mỗi ngày là chuỗi máy (1 886 chuỗi ở `packages/i18n/src/locales/vi/`), nên sửa một lần là mọi bản tấu về sau đều đổi, và không tốn mana khi chạy.
- **Điều khảo sát cho thấy** (ở `a4d08ab2`): không chuỗi nào dính các cụm sáo đã thử; có 7 gạch en, 3 gạch em, 15 dấu ba chấm liền và 4 mũi tên. Xưng hô lẫn lộn: bản tấu có "chờ bạn" ở một chuỗi và "chủ nhân nên xem lại" ở chuỗi kế. Có chuỗi mang chữ nội bộ ("K3/K7 của plans/recheck.md", "check mang sang trên cùng cây").
- **Đọc trước khi sửa**: [viet-tieng-viet-gon.md](../reference/viet-tieng-viet-gon.md); ADR 0014; [glossary.md](../glossary.md) (task không đổi tên hiển thị của thuật ngữ).
- **Thêm**:
  - Chốt một cách máy gọi chủ nhân (X18) rồi sửa mọi chuỗi `vi` theo đó.
  - Soát bằng mắt theo bản gọn, theo thứ tự `cli-digest`, `bell`, `cli-quest-infirmary-reason`, `cli-doctor`, `cli-error`, rồi các namespace còn lại. Hai phép thử cho từng chuỗi: người ngoài nghề có hiểu không; chuỗi của một việc chờ chủ nhân có nói chủ nhân cần làm gì không. Chữ nội bộ (mã mục của kế hoạch, đường dẫn tài liệu, tên hàm) rời khỏi chuỗi hiển thị.
  - Lint trong `pnpm i18n:check` cho chuỗi `vi`: ký tự của điều 23 và 24 (gạch dài, nháy cong, ba chấm liền, mũi tên, "&"), từ xưng hô lạc khỏi cách đã chốt, và danh sách cụm của điều 10 tới 21. Chuỗi cần giữ một cụm thì khai trong một file ngoại lệ kèm lý do (mẫu `shape-clones.json`). Danh sách mẫu nằm ở một file dữ liệu để PS-15 dùng lại (X17), không chép hai nơi.
  - Chuỗi `en` chỉ đổi khi chuỗi `vi` tương ứng đổi nghĩa; placeholder hai bên giữ khớp (`i18n:check` sẵn có).
  - Spec và snapshot của `apps/cli` có chuỗi `vi` sửa theo.
- **Không làm**: đổi tên hiển thị của thuật ngữ trong glossary; chuỗi `en`; prompt (tiếng Anh); chữ do model viết (mục dưới); dấu «…» quanh tên nhiệm vụ (quy ước hiển thị sẵn có).
- **Test**: spec của lint có chuỗi tốt và chuỗi xấu cho từng luật; `pnpm i18n:check` đỏ khi thêm một chuỗi `vi` có gạch dài hay từ xưng hô lạc; file ngoại lệ không có dòng thừa. 0 mana.
- **Xong khi**: `pnpm check` xanh; dòng §11 của task có bảng trước và sau của mười chuỗi bản tấu để chủ nhân duyệt giọng.
- **Cỡ**: M. Phiên chật thì cắt sau năm namespace đầu và lint, phần còn lại thành một task sau. **Model gợi ý**: Opus 5.5, effort high, phiên Claude Code có skill `viet-tieng-viet` ở chế độ Sửa. **Mana**: 0.

## Skill viết tiếng Việt: dùng ở đâu

(Bổ sung 2026-11-28; X17.) Bản đầy đủ của skill dài khoảng 39 KB, vượt trần mặc định của một bí kíp (dòng 63), và front matter của nó theo chuẩn Agent Skills (`name`, `description`), khác hợp đồng `skill` v1. [viet-tieng-viet-gon.md](../reference/viet-tieng-viet-gon.md) là bản "viết" gọn: 6 229 ký tự, khoảng 1 560 token theo X9, bỏ hai chế độ Sửa và Góp ý.

| Loại chữ | Đường áp dụng | Task |
|---|---|---|
| Chuỗi máy (bản tấu, chuông, CLI) | Soát chuỗi `vi`, lint trong `i18n:check` | PS-15a |
| Biên niên sử | Luật gọn trong prompt của Nhà thơ khi ngôn ngữ của chủ nhân là `vi`; máy kiểm thêm các mẫu của lint, trượt thì viết lại một lần (cơ chế của P2-06b) | PS-15 |
| Tài liệu giao ra | Bản gọn là nguồn của `registry/style/vi.json` và fixture VI của `style-lint`, và là bí kíp mặc định mang tag `docs` | PS-15 |
| Câu hỏi và thư bàn giao | Chủ nhân chép 10 tới 15 dòng của bản gọn vào `decree.md` của vương quốc; không cần code | làm được ngay |
| Lời theo giọng nhân vật | Điều 9 và 19 tới 21 của bản gọn là rào cho bảng giọng (X15) | PS-18 |

## Phụ thuộc giữa các task

- PS-15a đứng riêng, không cần PS-13; nên xong trước PS-15 để PS-15 dùng lại danh sách mẫu. Nó chạm mọi file locale `vi`: task nào thêm chuỗi `vi` trong lúc PS-15a mở thì nhánh merge sau chạy lại lint.
- PS-10 đứng riêng. PS-13 đứng riêng; PS-13b → PS-13c; PS-13 → PS-13c. PS-14 và PS-15 cần PS-13, không cần PS-13b hay PS-13c.
- PS-18 cần P2-06b (đã xong). PS-18b cần P2-10.
- PS-10 và PS-13 cùng chạm `packages/runner-core/src/prompt/__snapshots__/assignee-*.txt` (PS-10 đổi luật trong `assignee.md`, PS-13 thêm một file): nhánh merge sau dựng lại snapshot.
- PS-18 thêm một kind inbox cùng đợt với P2-08 và P2-09: nhánh merge sau giữ cả hai phía ở `inbox-command.ts`, `COMMAND_GROUPS`, `COMMAND_SCOPES` (đúng lý do [phase-2.md](phase-2.md) xếp chúng cùng đợt 4).
- **File nóng**: `packages/i18n/src/glossary.json` và file locale (mỗi task một namespace), `packages/domain/src/index.ts` (barrel `skill/`), `docs/schemas/**`, `docs/cli.md`, `packages/steward/src/sessions/prompt.ts` (PS-13).
- **Vùng bảo vệ**: schema (PS-10 chỉ chú thích và mô tả; PS-13 mô tả; PS-18 trường mới), `verify/**` (PS-18, chỉ kiểu).
- **Vùng nhạy hệ điều hành**: không task nào trong ba task chính; PS-13c có (adapter).

## Quyết định

Chủ nhân chốt ngày 2026-11-28, trong phiên kế hoạch, qua hộp hỏi đáp ([§11, 2026-11-28](../implementation-plan/11-2026-11-28.md)). X4 và X7 khác khuyến nghị của phiên; các mục còn lại theo khuyến nghị.

**Phải chốt trước khi mở task:**

- **X1 · Cách chia và id.** PS-10; PS-13, PS-13b, PS-13c; PS-18, PS-18b. PS-10b chỉ là đề xuất, chưa có id trong §8.
- **X2 · `request` và ủy quyền.** Như `proposal`. Trong `kingdom.delegation` thì Tể tướng mở quest không cần chủ nhân; ngoài thì quest nháp và thư lên chủ nhân. `delegation` là chỗ duy nhất nói việc gì mở được mà không hỏi. Phương án đã loại: `request` luôn thành quest nháp chờ `confirm` (đúng chữ "quest nháp" của dòng §8, thêm một lần chủ nhân can thiệp cho mỗi thư).
- **X3 · Người viết `request` có tự chờ không.** Không, ở PS-10. Người làm làm phần làm được rồi nộp; không làm được gì thì hỏi chủ nhân một câu nêu thư (cơ chế `blocked` sẵn có). PS-10b mở khi sổ đo có ít nhất 10 thư `request` và hơn một nửa đi kèm câu hỏi. Phương án đã loại: làm PS-10b ngay sau PS-10 (chạm máy trạng thái quest, cỡ M).
- **X4 · Thứ tự của PS-13 và spike: chèn prompt, spike song song** (khác khuyến nghị). PS-13 (chèn vào prompt, 0 mana) đứng một mình và đủ cho PS-14, PS-15; PS-13b làm ngay, song song với PS-13, để đóng câu §10 sớm, tốn mana trong trần của X14. Phiên khuyến nghị hoãn spike tới khi vương quốc có ít nhất ba bí kíp thật và khối `skills` có trung vị trên 4 000 token (kết quả spike cũ nhanh: Claude Code đi từ 2.1.318 tới 2.1.329 trong ba tuần; chưa có bí kíp nào để đo lợi ích). Hệ quả của lựa chọn: nếu PS-13c mở muộn mà phiên bản CLI đã đổi, PS-13c đo lại phần đổi trước khi viết adapter. Phương án đã loại: spike trước rồi mới viết code (chặn PS-14, PS-15 vào một phép đo không đổi thiết kế của đường chèn).
- **X5 · Tính cách hiện ở đâu trước.** Trong biên niên sử, qua bảng giọng trong prompt của Nhà thơ (không thêm lượt gọi nào). Khối "khi nói với chủ nhân" đợi khung chat (PS-18b). Câu hỏi của người làm hiện nguyên văn, không mang giọng. Chuông và bản tấu giữ chữ của máy. ADR 0025 sửa tại chỗ cho khớp; task PS-18 viết. Phương án đã loại: (a) thêm một lượt model rẻ viết lại câu hỏi và dòng chuông theo giọng (tốn mana theo số sự kiện, có rủi ro lệch nghĩa câu hỏi); (b) gắn khối vào prompt người làm (trái ADR 0025: prompt làm việc đổi, cần ADR mới).
- **X6 · Bảng tính cách ở đâu.** Dữ liệu theo theme trong `domain`, cạnh bể ngoại hình (mẫu PS-24); chủ nhân đổi cho từng nhân vật bằng `--address` và `set_persona`. Phương án đã loại: `registry/personas.json` trong vương quốc (chủ nhân sửa được cả bảng, thêm một file registry và đường làm mới khi `upgrade`).
- **X7 · Đổi tính cách sau khi sinh, và mặc định: `set_persona`, mặc định ngẫu nhiên** (khác khuyến nghị). Có kind inbox `set_persona`. `character add` không nêu `--persona` thì nhân vật mới rút ngẫu nhiên một giọng từ bảng. Phiên khuyến nghị mặc định không có tính cách. Hệ quả của lựa chọn: phần lớn nhân vật mới sẽ mang tính cách, nên hai bất biến của PS-18 (kiểu `CharacterAtWork`, test đối chiếu) là cổng thật chứ không là phòng xa; phiên thêm `--persona none` cho người muốn tắt. Nhân vật đã có không đổi cho tới khi chủ nhân gọi `set_persona`. Phương án đã loại: chỉ đặt được lúc sinh.

**Chờ được, đã chốt cùng lúc theo khuyến nghị:**

- **X8 · Đường của `request`** là `chancellor` sẵn có; không thêm đường vào `MEMO_ROUTES`.
- **X9 · `max_tokens` đo bằng ký tự chia 4** (hằng có tên); bí kíp vượt trần bị bỏ nguyên kèm cảnh báo, không cắt.
- **X10 · Bí kíp chỉ vào prompt người làm** ở PS-13. Người chấm có nhận không thì xét ở PS-14 và PS-15, khi có bí kíp thật.
- **X11 · Thầy tu viết bí kíp** (bậc 4 của thang sửa lỗi) **và bí kíp theo bản phát hành** là task riêng sau PS-13; PS-13 chỉ đọc bí kíp chủ nhân viết tay.
- **X12 · Bảng tám giọng mặc định**: task PS-18 đề xuất chữ tiếng Việt (tên giọng, cách gọi chủ nhân), chủ nhân duyệt trong PR của task. Đóng câu (PS-18) của §10.
- **X13 · Hai điều kiện xong của dòng §8 PS-18 đổi chỗ**: một sang PS-18b, một thành quan sát ghi §11 (mục PS-18).
- **X14 · Spike PS-13b** do một phiên Claude Code của chủ nhân làm (**tốn mana**); trần: tối đa sáu phiên ngắn cho mỗi CLI trên model rẻ nhất của tộc, phần nào có lệnh 0 mana thì dùng lệnh đó.

**Bổ sung sau khi chốt (2026-11-28, chủ nhân đồng ý trong phiên, sau khi xem skill "viet-tieng-viet"):**

- **X15 · Xưng hô của tính cách là một cặp** (tự xưng và gọi chủ nhân). Câu tả giọng của bảng tả hành vi, không tả bằng tính từ. Trong biên niên sử, giọng chỉ đi qua cặp xưng hô, độ dài câu và nhiều nhất một nét riêng mỗi câu trích.
- **X16 · Task mới PS-15a**: soát chuỗi `vi` của máy và thêm lint; 0 mana, không cần PS-13.
- **X17 · Bản gọn của skill** ([viet-tieng-viet-gon.md](../reference/viet-tieng-viet-gon.md)) là nguồn đề xuất cho `style/vi.json`, fixture VI và bí kíp mặc định của PS-15. Danh sách mẫu của lint ở PS-15a là một file dữ liệu mà PS-15 dùng lại.
- **X18 · Còn mở, chốt khi mở PS-15a: máy gọi chủ nhân là gì trong chuỗi `vi`.** Khuyến nghị: "ngài" khi nói với chủ nhân và "chủ nhân" khi nhắc ở ngôi thứ ba; bỏ "bạn".
