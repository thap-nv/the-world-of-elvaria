# Sức khỏe cấu trúc của repo trước giai đoạn 2: số đo, kế hoạch dọn và máy gác

Ngày: 2026-11-20 · Trạng thái: **chờ chủ nhân chốt** các mục K1 tới K13 ở cuối file.

**Ai đọc.** Chủ nhân đọc mục Summary và mục Quyết định. Phiên điều phối đọc mục Việc để mở task và xếp đợt. Phiên làm một việc đọc mục Phát hiện, mục Cấu trúc đích và dòng của việc đó. File này không mở task và không thêm dòng §8.

Số đo lấy ở `69fa05b` (`main`, 2026-11-20). Phiên rà soát không sửa code.

## Summary

Chủ nhân nêu ba điều của một kiến trúc dễ mở rộng (2026-11-20). Repo đứng ở đâu so với từng điều:

1. **Chia thư mục rõ ràng.** Ở mức package thì tốt: 14 package và 1 app, ranh giới do hai công cụ gác, không có vòng phụ thuộc. Bên trong package thì không đều. `domain` (2 file ở gốc `src/`, 23 thư mục) và `runner-core` (1 file, 12 thư mục) là mẫu tốt. `steward` là chỗ lộn xộn thật: gốc `src/` có 138 file (25 file chạy và 113 spec), trong đó 104 spec không có file chạy cùng tên. Chưa có luật nào nói gốc `src/` được chứa gì, nên chỗ này sẽ trôi tiếp.
2. **Logic lặp thành phần chung.** Code chép nguyên văn trong mã chạy rất thấp: 0,28 % (21 đoạn, 244 dòng). Nhưng khi bỏ qua tên biến và giá trị chuỗi, số thì 4,92 % mã chạy nằm trong một đoạn có khung giống đoạn khác (71 cặp file từ 60 token, F11). Phần lặp thật nằm ở những chỗ mà công cụ dò chép nguyên văn không thấy: ba adapter chép cùng một khung (khoảng 385 dòng giống nhau sau khi bỏ tên tộc), một quyết định nhỏ được viết lại ở 18 nơi (cách xóa thư mục tạm trên Windows) và 79 spec tự dựng thư mục tạm bằng tay. Repo chưa có nhà chung cho đồ dùng của test.
3. **Thay đổi được dọn sạch.** Điểm này tốt nhất: 0 file mồ côi, 0 dependency thừa, 4 export không ai dùng, 5 export chỉ test dùng, 0 `TODO` hay `FIXME` trong mã chạy, 2 dòng `eslint-disable`, 0 `@ts-ignore`, không có file rác đã commit. Nhưng sạch là nhờ người làm cẩn thận, `pnpm check` chưa có cổng nào giữ.

Ngoài ba điều trên, số đo cho thấy một rủi ro thứ tư cho việc thêm tính năng: **file nóng**. Trong 300 commit gần nhất, 117 commit sửa `vi.json`, 106 sửa README của `steward`, 75 sửa `domain/src/index.ts` và 54 sửa `runner-core/src/index.ts`. Hai file `index.ts` này còn cách trần 300 dòng lần lượt 54 và 26 dòng.

## Số đo

Script đo nằm ngoài repo, ở `elvaria-worktrees/architecture-health-measure/` (`measure.mjs`, `layout.mjs`, `adapters.mjs`, `clones.mjs`, `knip-read.mjs`, `near.mjs`, `shape.mjs`, `knip.json`). Việc V1 và V3 đưa phần cần giữ vào repo. Mọi lệnh chạy ở gốc repo, `$M` là thư mục trên.

| Đo gì | Lệnh | Kết quả |
|---|---|---|
| Kích thước | `node $M/measure.mjs . sizes` | Mã chạy 888 file, 82 155 dòng. Spec 90 087 dòng. Lớn nhất: `domain` 271 file và 25,5k dòng, `apps/cli` 190 và 16,6k, `steward` 142 và 14,0k, `runner-core` 125 và 11,6k |
| File ở gốc `src/` | `node $M/measure.mjs . roots` | `steward` 25 file chạy cạnh 14 thư mục, `apps/cli` 18 cạnh 19, `runner-claude` 23 (phẳng), `domain` 2, `runner-core` 1 |
| Spec không có file chạy cùng tên | `node $M/layout.mjs .` | `steward` 107 trên 130 spec (104 ở gốc), `domain` 64 trên 231 (0 ở gốc), `runner-core` 28 trên 108 (0 ở gốc) |
| Thư mục đông | `node $M/measure.mjs . dirs` | `runner-core/src/plot` 31 file chạy, `steward/src/sessions` 30, `apps/cli/src/quest` 27, `runner-core/src/prompt` 27 |
| Sát trần | `eslint packages apps scripts --rule` với hàm 50, file 270, `complexity` 12, tham số 4, rồi `node $M/near.mjs` | 25 file chạy trên 270 dòng. 28 hàm dài 51 tới 60 dòng, 6 hàm đúng 60. 52 hàm có độ phức tạp trên 12, cao nhất 30 (`apps/cli/src/run/bell.ts:121`). 43 hàm có trên 4 tham số |
| Chép nguyên văn, mã chạy | `pnpm dlx jscpd@4 packages apps scripts .claude/hooks --min-lines 8 --min-tokens 70`, bỏ spec, `__fixtures__`, `fixtures` | 21 đoạn, 244 dòng, 0,28 %. 12 đoạn nằm giữa hai package. Mất 11 giây |
| Chép nguyên văn, spec | như trên với `--pattern "**/*.spec.ts" --min-lines 10 --min-tokens 100` | 46 đoạn, 873 dòng, 0,93 %. Hầu hết là khối import đầu file của spec `steward` |
| Khung chép giữa adapter | `node $M/adapters.mjs .` | `locate.ts` claude và codex giống 85 %, `session.ts` codex và antigravity 77 %, `account.ts` claude và codex 69 %, `runner.ts` codex và antigravity 62 %, `run-files.ts` 47 %, `stream.ts` 42 %. Tổng 385 dòng trong các cặp giống từ 40 % |
| Khung chép, toàn bộ mã chạy | `node $M/shape.mjs <đường dẫn tuyệt đối của repo> 50`: cửa sổ 50 token, tên biến, chuỗi và số được coi như nhau, bỏ import, interface, `index.ts`, spec, fixture và bảng dữ liệu | 15 615 trên 317 185 token nằm trong một đoạn giống khung đoạn khác (4,92 %). 194 cặp file, 62 cặp giữa hai workspace. 71 cặp từ 60 token (26 giữa hai workspace), 28 cặp từ 100, 6 cặp từ 200. Theo cặp workspace: trong `apps/cli` 7 154 token, trong `domain` 1 694, claude và codex 945, trong `steward` 601. Mất 1 giây |
| Export, file, dependency thừa | `pnpm dlx knip@5 --config $M/knip.json`, thêm `--production`, thêm `--include-entry-exports` | 0 file, 0 dependency, 4 export. Chế độ production: thêm 5 export chỉ test dùng. Tính cả mặt công khai: 9 export và 16 kiểu không package nào dùng. Mất 10 giây |
| Dấu nợ | `git grep` | 0 `TODO`, `FIXME` trong mã chạy. 2 `eslint-disable`. 0 `@ts-ignore`. `eslint-suppressions.json` có 41 file, 111 lượt, đều là ba luật thời gian của spec |
| Đồ dùng test | `git grep "maxRetries: 10, retryDelay: 100"`, `git grep -c "mkdtemp("` | Cách xóa thư mục tạm viết ở 18 nơi trong 9 workspace. 85 lần gọi `mkdtemp` trực tiếp trong 79 spec. Ba kiểu chỗ đặt: `src/**/__fixtures__/` 90 file, `test/` 20 file (3 package), `fixtures/` 86 file (4 package) |
| File nóng | `git log --oneline -300 --no-merges -- <file>` | `vi.json` 117, README `steward` 106, `domain/src/index.ts` 75, `runner-core/src/index.ts` 54, `apps/cli/src/commands.ts` 31, `domain/src/constants.ts` 26 |
| README | `node $M/layout.mjs .` | `steward` 73 KB, `domain` 56 KB, `apps/cli` 49 KB, `runner-core` 44 KB. Mục "Depends on" của `apps/cli` thiếu `@elvaria/runner-codex` |
| Script không ai gọi | tìm tên từng file `scripts/*.mjs` trong `package.json`, `.husky`, `.github`, `.claude`, script khác | 0 |

Một lần chạy knip đầu cho kết quả sai (mọi dependency nội bộ bị báo thừa) vì config thiếu hậu tố `!` cho entry của chế độ production. Số trong bảng lấy từ lần chạy sau khi sửa config.

## Phát hiện

Xếp theo mức hại cho việc thêm tính năng ở giai đoạn 2.

**F1. Hai file `index.ts` sắp chạm trần và là file nóng.** `packages/runner-core/src/index.ts` dài 274 dòng với 158 câu export, còn 26 dòng. `packages/domain/src/index.ts` dài 246 dòng, mỗi file một dòng `export *` (243 dòng cho 271 file), còn 54 dòng. `packages/domain/src/constants.ts` dài 253 dòng. Giai đoạn 2 thêm Sứ giả và ui đọc `domain`, nên một task giữa chừng sẽ chạm trần và phải tái cấu trúc ngoài phạm vi của nó. Hai file này cũng là chỗ các nhánh song song sửa trùng nhau (75 và 54 trên 300 commit).

**F2. Chuỗi hiển thị dồn vào một file mỗi ngôn ngữ.** `packages/i18n/src/locales/vi.json` nặng 197 KB với 1 612 khóa, trong đó 1 529 khóa dưới `cli.`. 39 % số commit sửa file này. Giai đoạn 2 thêm chuỗi của ui và khách nhẹ vào cùng file. Phiên AI cần sửa một chuỗi phải nạp một file 197 KB.

**F3. Gốc `src/` của `steward` có 138 file.** 113 spec nằm ở gốc, 104 spec là kịch bản chạy qua cả Nhiếp chính nên không có file chạy cùng tên (`forge-queue-merge.spec.ts`, `scope-waits.spec.ts`, `mana-buckets.spec.ts`…). Tên của chúng đã mang tiền tố khái niệm (9 spec `forge-*`, 6 `session-*`, 4 `mana-*`, 4 `temple-*`), trong khi thư mục `forge/`, `sessions/`, `mana/`, `temple/` có sẵn. 25 file chạy ở gốc gồm cả phần ráp nối (`steward.ts`, `tick.ts`) lẫn khái niệm riêng (`background.ts`, `graph-builds.ts`, `unclaimable.ts`, `verdicts.ts`).

**F4. Trần 300 dòng đẻ ra file đặt tên theo trần.** `packages/steward/src/plot-types.ts:1` ghi nó "moved out of types.ts to keep it under the" trần. `packages/steward/src/notice.ts:1` (kiểu của thông báo) đứng cạnh `notices.ts` (rung chuông khi quest đổi nước). Repo có 7 cặp số ít và số nhiều trong cùng thư mục, trong đó `notice` và `notices`, `command` và `commands` (`apps/cli/src`), `look` và `looks` (`steward/src/forge`) là dễ nhầm.

**F5. Ba adapter chép khung của nhau.** `packages/runner-claude/src/locate.ts` và `packages/runner-codex/src/locate.ts` giống 50 trên 59 dòng, chỉ khác tên binary và mẫu tên extension. `packages/runner-antigravity/src/session.ts:120-160` và `packages/runner-codex/src/session.ts:138-178` cùng một vòng: mở tiến trình con, đọc từng dòng, đẩy tín hiệu, dừng khi quá `max_turns`, `kill`. `runner.ts` của hai adapter này giống 104 dòng. `runner-core` đã có `startChild`, `runToEnd`, `createSignalChannel` và bộ `kit/`, nhưng phần ráp chúng lại thì mỗi adapter tự viết. Adapter thứ tư (`runner-gemini`, P1-12c) sẽ chép lần nữa.

**F6. Đồ dùng của test không có nhà chung.** Hai luật của `CLAUDE.md` (thư mục tạm có dấu cách trong tên, repo git lọc `GIT_*`) được giữ bằng cách mỗi spec tự gõ lại. Tùy chọn xóa `{ recursive, force, maxRetries: 10, retryDelay: 100 }` có ở 18 nơi, gồm 3 nơi trong mã chạy của `apps/cli/src/upgrade/`. Luật ranh giới cấm package này import `__fixtures__` của package kia, nên không ai dùng lại được của ai.

**F7. Không có cổng cho ba điều của chủ nhân.** `pnpm check` gác kích thước, ranh giới, kiểu và tài liệu sinh. Nó chưa gác file hay export mồ côi, dependency thừa, code chép, bố cục thư mục và độ phức tạp của hàm. Definition of done và §4 không có dòng nào về dọn code thừa.

**F8. README lớn và nóng.** README của `steward` (73 KB, 683 dòng) bị sửa trong 106 trên 300 commit. README cỡ này khó giữ đúng: `apps/cli/README.md` đã thiếu `@elvaria/runner-codex` ở mục "Depends on" mà `docs:check` không thấy.

**F9. Bộ đổi glob có hai bản.** `packages/hooks/src/glob.ts` và `packages/runner-core/src/checks/glob.ts` chung 54 dòng. Chép là có chủ ý (hook chỉ được nạp `node:fs`, `node:path`, `node:process` và `eventlog`, §1.4). Chưa có test nào đối chiếu hai bản trên cùng một bảng ca.

**F10. Việc nhỏ.** §1.1 ghi "17 package và 3 app" trong khi đĩa có 14 và 1 (phần còn lại là dự kiến). Ba kiểu chỗ đặt đồ dùng test (`__fixtures__/`, `test/`, `fixtures/`) chưa có luật phân biệt. 52 hàm có độ phức tạp trên 12 mà chưa có ngưỡng nào.

**F11. Khung chép có ở khắp repo, không riêng adapter.** Bộ dò khung (bỏ qua tên biến, chuỗi và số) thấy 71 cặp file giống nhau từ 60 token, trong khi jscpd chỉ thấy 21 đoạn. Mức hại ngang F5. Các cụm lớn nhất dưới đây mới là ứng viên, vì phiên rà soát chưa đọc từng cặp:

- Lệnh quest của `apps/cli`: `quest/lifecycle.ts` có mặt trong 8 cặp, `quest/hold.ts` trong 7, cùng `reassign.ts`, `deliver.ts`, `escaped.ts`, `edit.ts` và `character/suspend.ts`. Cặp lớn nhất là `apps/cli/src/quest/hold.ts:29-77` với `apps/cli/src/quest/lifecycle.ts:29-221` (336 token).
- `packages/eventlog/src/migrations/run.ts` với `packages/store/src/migrations/run.ts` (203 token): bộ chạy migration có hai bản.
- `packages/steward/src/review/prompt-size.ts:77-110` với `packages/steward/src/sessions/claim-prompt-size.ts:60-92` (190 token).
- `packages/hooks/src/write.ts:53-102` với `packages/runner-core/src/runner/run-log.ts:69-109` (134 token), và `packages/hooks/src/antigravity/tools.ts` với `packages/hooks/src/claude/tools.ts` (119 token).
- `packages/domain/src/schema/memo/memo-triage.ts:58-95` với `packages/domain/src/schema/quest/quest-draft.ts:89-124` (138 token).

Một file giống file khác 42 % thì không để nguyên cả file và cũng không gom cả file. Trong `stream.ts` của codex và antigravity, bộ đọc JSON an toàn (`packages/runner-codex/src/stream.ts:43-49`), khung bộ đọc từng dòng và kiểu `StreamReader` là cùng một quyết định nên gom được. Phần đọc từ vựng của từng CLI thì không. Phép thử ở V14 áp cho từng đoạn, không cho cả file.

Điều đã đủ, không cần làm thêm: ranh giới giữa package (ADR 0001, `boundaries.mjs`, hai công cụ), trần file, hàm và độ lồng, quy ước tên file, spec cạnh file trong `domain`, `runner-core` và `apps/cli`, dữ liệu registry thay cho `switch` (ADR 0016, 0021).

## Cấu trúc đích

### Luật chung cho mọi package

- **R1. Một khái niệm một thư mục.** `src/<khái-niệm>/`, tên số ít, kebab-case, lấy từ cột id của glossary khi có.
- **R2. Gốc `src/` chỉ có phần ráp nối.** Gồm `index.ts`, file ráp các khái niệm lại (với `steward` là `steward.ts`) cùng `types.ts`, `constants.ts` khi từ hai thư mục khái niệm trở lên cùng dùng. Ba ngưỡng: gốc `src/` tối đa 20 file chạy. Package trên 40 file chạy thì gốc `src/` tối đa 10. Một thư mục tối đa 30 file chạy trực tiếp, quá thì tách khái niệm con.
- **R3. Spec đứng cạnh thứ nó thử.** Spec của một file đứng cạnh file đó. Spec kịch bản đứng trong thư mục khái niệm mà nó thử. Kịch bản đi qua nhiều khái niệm đứng ở `src/flows/`. Trong package trên 40 file chạy, spec ở gốc `src/` phải có file chạy cùng tên đứng cạnh.
- **R4. Đồ dùng test có hai chỗ.** Mã TypeScript của test ở `src/**/__fixtures__/`. Dữ liệu và chương trình giả được chạy như tiến trình ở `<package>/fixtures/`. Không dùng `test/`.
- **R5. Mặt công khai đi qua barrel của thư mục.** Mỗi thư mục khái niệm có `index.ts` liệt kê tên công khai của nó. `src/index.ts` chỉ `export *` từ các barrel đó. File bên trong package import thẳng file cần dùng, không import barrel, để không sinh vòng.
- **R6. Tên file nói khái niệm.** Không có cặp số ít và số nhiều trong một thư mục. Không đặt tên vì trần (`-types`, `-more`, `-2`): file chạm trần thì tách theo khái niệm.
- **R7. Thứ bị chép sang package thứ hai thì về nhà chung.** Nhà chung là package thấp nhất mà cả hai bên được import theo `boundaries.mjs`: logic thuần về `domain`, IO của thư mục kingdom về `store`, thứ mọi adapter cần về `runner-core` (và `AdapterKit` nếu adapter ngoài repo cũng cần), đồ dùng test về `testkit` (K6). Khi ranh giới cấm dùng chung thì giữ hai bản kèm một test đối chiếu.
- **R8. Package mới của giai đoạn 2** (`herald`, `ui-kit`, `ui`, `lite`) theo R1 tới R6 từ commit đầu, chuỗi hiển thị vào file namespace riêng (V8) và không thêm dòng vào file nóng nào ngoài barrel của chính nó.

### Bản đồ đích của các package lớn

| Package | Hôm nay | Đích |
|---|---|---|
| `domain` | 2 file ở gốc, 23 thư mục, `index.ts` 243 dòng `export *` | Giữ thư mục. Mỗi thư mục một barrel, `index.ts` còn khoảng 25 dòng. Hằng số trong `constants.ts` về `constants.ts` của thư mục dùng nó |
| `runner-core` | 1 file ở gốc, 12 thư mục, `index.ts` 274 dòng | Giữ thư mục. Mỗi thư mục một barrel. Thêm phần chung của adapter (V5). `plot/` (31 file) tách khái niệm con khi thêm file |
| `steward` | 25 file chạy và 113 spec ở gốc | Gốc còn `index.ts`, `steward.ts`, `context.ts`, `types.ts`. Đề xuất nhóm: `tick/` (`loop`, `tick`, `steps`, `restart`, `steward-state`, `world`, `files`), `bell/` (`notice`, `notices` đổi tên theo việc nó làm), `quest/` (`record`, `verdicts`, `seal`, `infirmary`), `waits/` (`unclaimable`, `unjudgeable`, `judge-waits`), `background/` (`background`, `graph-builds`, `tribe-versions`), `plot/` (`plots`, `plot-types`). Spec về thư mục khái niệm theo tiền tố, phần còn lại về `flows/` |
| `apps/cli` | 18 file ở gốc, 19 thư mục | Gốc còn `cli.ts`, `run-cli.ts`, `commands.ts`, `command.ts`. Phần khung dòng lệnh (`args`, `help`, `io`, `node-io`, `table`, `listing`, `labels`) về `shell/`. `init.ts`, `migrate.ts` về thư mục lệnh của chúng |
| `runner-claude`, `runner-codex`, `runner-antigravity` | phẳng, 23, 17 và 13 file | Sau V5 đo lại. Còn trên 20 file thì nhóm theo `cli/` (tìm và hỏi CLI), `session/`, `run/` |
| `store`, `eventlog`, `hooks`, `sandbox`, `chancellor` | phẳng, 13 tới 18 file | Giữ nguyên, dưới ngưỡng 20 |

Tên thư mục trong bảng là đề xuất. Phiên làm việc đó chốt tên sau khi đọc code và ghi vào §11.

## Việc dọn và tái cấu trúc

"Quest" là việc cơ học trong một vùng, giao cho nhân vật. "Phiên" là việc cần phán đoán thiết kế, một phiên tự làm (luật (359) của phiên điều phối). Phiên điều phối đặt id và xếp đợt.

| Việc | Nội dung | scope_paths | Cỡ | Ai làm | Xong khi |
|---|---|---|---|---|---|
| V1 | Cổng dọn sạch: knip vào `pnpm check`, config ở gốc repo, sửa các export thừa đang có | `knip.json`, `package.json`, `pnpm-lock.yaml`, các file knip nêu, `docs/guides/repo-handbook.md` | S | Phiên | `pnpm check` chạy knip. Một spec chứng minh file mồ côi và export thừa làm cổng đỏ |
| V2 | Luật thư mục R1 tới R8 vào §4.2 và `.claude/rules/`, cổng `pnpm layout` (`scripts/src-layout.mjs`, không thêm dependency) với file baseline chỉ được giảm | `scripts/src-layout.mjs` và spec, `package.json`, `docs/implementation-plan/4-code-quality.md`, `1-repo-structure.md` (sửa F10), `.claude/rules/` | S | Phiên | Cổng đỏ khi thêm file vào gốc `src/` đã quá ngưỡng, thêm spec ở gốc, thêm thư mục `test/`, thêm cặp số ít và số nhiều. Baseline ghi đúng các vi phạm hôm nay |
| V3 | Barrel theo thư mục cho `domain` và `runner-core`, tách `domain/src/constants.ts` | `packages/domain/src/**/index.ts`, `packages/domain/src/constants.ts`, `packages/runner-core/src/**/index.ts` | S mỗi package | Quest, sau khi phiên làm mẫu một thư mục | Mặt công khai không đổi (so danh sách export trước và sau). Hai `index.ts` dưới 40 dòng. `pnpm -r test`, `pnpm typecheck` xanh |
| V4 | Tách file chuỗi theo namespace: `locales/<ngôn ngữ>/<namespace>.json`, ghép khi nạp. `i18n:check` và `docs:gen` đọc dạng mới | `packages/i18n/**`, `scripts/i18n-check.mjs`, `scripts/docs-*.mjs` chạm locale | M | Phiên viết bộ nạp và script tách, chạy script một lần | Tập khóa và giá trị sau khi ghép trùng từng byte với trước. Không file namespace nào quá 40 KB |
| V5 | Dọn gốc `steward`, phần spec: chuyển 104 spec kịch bản về thư mục khái niệm hoặc `flows/` (9 spec còn lại đi theo file chạy của chúng ở V6) | `packages/steward/src/**/*.spec.ts` | M | Quest (chỉ `git mv` và sửa đường import) | Gốc `src/` không còn spec kịch bản. Số test và coverage không đổi |
| V6 | Dọn gốc `steward`, phần file chạy: nhóm 25 file theo bản đồ đích, đổi tên `notice`, `notices`, `plot-types` | `packages/steward/src/**`, README `steward` | M | Phiên chốt bản đồ, quest chuyển file | Gốc `src/` tối đa 10 file chạy. Baseline của V2 giảm |
| V7 | Nhà chung cho đồ dùng test (theo K6): thư mục tạm có dấu cách và xóa có thử lại, repo git lọc `GIT_*`. Mã chạy của `apps/cli/src/upgrade/` dùng một hằng số xóa ở `store` | package mới `packages/testkit`, `packages/config/boundaries.mjs`, ADR 0001 (sửa tại chỗ), `packages/store/src/io/**`, rồi từng package | S cho package mới, S mỗi package chuyển sang | Phiên làm package, quest chuyển từng package | `git grep "maxRetries: 10"` còn 2 nơi. Không spec nào gọi `mkdtemp` trực tiếp |
| V8 | Gom `test/` về `__fixtures__/` theo R4 | `apps/cli/test/**`, `packages/eventlog/test/**`, `packages/store/test/**` và các import | S | Quest | Không còn thư mục `test/` |
| V9 | Phần chung của adapter về `runner-core`: tìm CLI (`locate`), tài khoản (`account`), phiên đọc từng dòng (`session`), khung `runner`, khung bộ đọc stream và bộ đọc JSON an toàn (`stream`) | `packages/runner-core/src/**`, `packages/runner-{claude,codex,antigravity}/src/**` | M | Phiên | Bộ conformance xanh cho cả ba adapter. `node $M/adapters.mjs` không còn cặp nào giống từ 40 %. Không cần `ELVARIA_LIVE` |
| V10 | Test đối chiếu hai bộ đổi glob trên một bảng ca | `scripts/glob-parity.spec.ts` | S | Quest | Sửa một bản mà không sửa bản kia thì test đỏ |
| V11 | `docs:check` so mục "Depends on" với `package.json`, sửa README `apps/cli` | `scripts/docs-check.mjs` và spec, `apps/cli/README.md` | S | Quest | README thiếu một dependency làm `docs:check` đỏ |
| V12 | Dọn gốc `apps/cli` và đo lại ba adapter sau V9 | `apps/cli/src/*.ts`, `packages/runner-claude/src/**` | S | Quest | Baseline của V2 giảm về 0 hoặc chỉ còn `runner-core/src/plot` |
| V13 | Cổng khung chép: đưa bộ dò khung vào `scripts/` (dùng `typescript` đã có, không thêm dependency), file `shape-clones.json` ghi từng cặp được giữ kèm lý do. Cổng đỏ khi có cặp mới từ 60 token ngoài danh sách, hoặc khi một cặp trong danh sách lớn lên | `scripts/shape-clones.mjs` và spec, `shape-clones.json`, `package.json` | S | Phiên | `pnpm check` chạy cổng. Danh sách ban đầu là 71 cặp hôm nay, đánh dấu "chưa xét" |
| V14 | Rà toàn bộ khung chép: xét từng cặp trong danh sách bằng phép thử "sửa bên này thì bên kia có buộc phải sửa theo không", áp cho từng đoạn. Có thì gom về nhà chung theo R7, kèm luật lint cấm bản chép tay khi viết được. Không thì ghi lý do giữ | theo cụm: `apps/cli/src/quest/**`, `packages/{eventlog,store}/src/migrations/**`, `packages/steward/src/{review,sessions}/**`, `packages/hooks/src/**`, `packages/domain/src/schema/**` | M, chia theo cụm | Phiên xét và chốt cách gom, quest gom từng cụm | Không còn cặp "chưa xét". Tỉ lệ token trong khung chép thấp hơn 4,92 % |
| V15 | Báo cáo dòng không chạy: knip `--production` vào cổng của V1 với danh sách cho phép cho API dành cho test, báo cáo dòng test không chạy tới, báo cáo `NODE_V8_COVERAGE` của `sandbox replay`, của bộ conformance với CLI giả và của một ngày vương quốc thật | `knip.json`, `scripts/` (script báo cáo và spec), `docs/guides/repo-handbook.md` | S | Phiên | Báo cáo liệt kê theo package các dòng test có chạy mà lần chạy thật không chạy. Đây là báo cáo, không là cổng |

**Thứ tự.** V1 và V2 trước, vì cổng phải có trước khi dọn để không trôi lại. Rồi V3 và V4, hai việc gỡ file nóng, trước khi package đầu tiên của giai đoạn 2 thêm export và chuỗi. V5 rồi V6. V7 rồi V8. V9 trước adapter thứ tư. V10, V11, V12 xen vào lúc nào cũng được. V13 đi cùng V1 và V2. V14 làm dần theo cụm, cụm `apps/cli/src/quest` trước vì lớn nhất. V15 sau V1.

**Rủi ro conflict.** V4 chạm file mà 39 % commit sửa, V3 chạm hai file mà 25 % và 18 % commit sửa, V5 và V6 chạm vùng mà hầu hết task của Nhiếp chính thêm spec. Bốn việc này nên làm trong một khoảng lặng giữa hai đợt, mỗi việc một PR, merge trong ngày, khi không nhánh nào khác đang mở trên vùng đó. Git theo được file đổi tên nên nhánh mở sau chỉ cần merge `origin/main`. V9 chạm `runner-*`, vùng nhạy hệ điều hành: báo chủ nhân để quyết có chạy CI hay không. V1, V2, V10, V11 chỉ thêm file và ít conflict.

## Máy gác

| Cổng | Vào `pnpm check` | Dependency mới và lý do |
|---|---|---|
| File, export, dependency không ai dùng | `pnpm knip` (10 giây) | `knip` (dev). `dependency-cruiser` có luật `no-orphans` cho file, nhưng không thấy export thừa và dependency thừa, là hai chỗ rác hay nằm |
| Bố cục thư mục R2, R3, R4, R6 | `pnpm layout` | Không. Script Node trong `scripts/`, baseline chỉ được giảm, như `eslint-suppressions.json` |
| Code chép và khung chép | `pnpm dup`: bộ dò khung tự viết, đỏ khi có cặp mới từ 60 token ngoài `shape-clones.json` (1 giây) | Không. Dùng `typescript` đã có. Chép nguyên văn là trường hợp riêng của khung chép nên không cần jscpd |
| Bản chép tay của thứ đã có phần chung | luật ESLint `no-restricted-syntax` hoặc `no-restricted-imports` đi kèm từng phần chung (ví dụ cấm `mkdtemp` trong spec ngoài `testkit`) | Không |
| Code chỉ còn test gọi | `pnpm knip` chạy thêm chế độ `--production` | Không thêm gì ngoài `knip` |
| Dòng không chạy | không vào cổng: báo cáo coverage của test và của lần chạy thật (`NODE_V8_COVERAGE`) | Không |
| Độ phức tạp của hàm | ESLint `complexity` 15, vi phạm hôm nay vào `eslint-suppressions.json` | Không |
| README đúng dependency | trong `docs:check` | Không |
| Hai bản glob | spec ở `scripts/` | Không |

Dòng đề xuất thêm vào tài liệu (chưa sửa, chờ chốt):

- Definition of done của `CLAUDE.md`: "Thay đổi không để lại file, export hay dependency không ai dùng: code bị thay thế thì xóa trong cùng commit (`pnpm knip`)."
- Definition of done: "File mới nằm trong thư mục khái niệm của nó, không thêm vào gốc `src/` (`pnpm layout`). Logic đã có ở package khác thì chuyển về nhà chung, không chép."
- Definition of done: "Phần chung mới đi kèm luật cấm bản chép tay khi viết được. Cặp khung chép mới thì gom, hoặc ghi lý do giữ vào `shape-clones.json` (`pnpm dup`)."
- Bảng Change impact: dòng "File mới, đổi tên hay xóa file" phải chạy `pnpm layout`, `pnpm knip`.
- §4.2: bảng quy ước thêm R1 tới R8, kèm ba ngưỡng 10, 20 và 30.
- `docs/guides/repo-handbook.md`, mục thêm package: package mới theo R8.

## Quyết định cho chủ nhân

Phải chốt trước giai đoạn 2:

- **K1. Thêm knip làm cổng dọn sạch (V1).** Khuyến nghị: có. Repo đang sạch nên bật cổng gần như không tốn công sửa. Một lượt knip chạy 10 giây.
- **K2. Luật thư mục R1 tới R8 với ba ngưỡng 10, 20, 30 và cổng `layout` có baseline (V2).** Khuyến nghị: có. Ba ngưỡng đặt sao cho hôm nay chỉ có 4 chỗ vượt: gốc `steward` (25), gốc `apps/cli` (18), `runner-claude` phẳng 23 file, `runner-core/src/plot` 31 file. Baseline còn ghi 104 spec kịch bản ở gốc `steward`, 3 thư mục `test/` và 7 cặp tên số ít và số nhiều.
- **K3. Barrel theo thư mục cho `domain` và `runner-core` (V3).** Khuyến nghị: có, làm trước package đầu tiên của giai đoạn 2. Cách khác là nâng trần riêng cho `index.ts`, rẻ hơn nhưng giữ nguyên file nóng.
- **K4. Tách file chuỗi theo namespace (V4).** Khuyến nghị: có, trước khi ui và khách nhẹ thêm chuỗi.
- **K5. Dọn gốc `steward` (V5, V6) trong một khoảng lặng.** Khuyến nghị: có, V5 ngay sau V2. Phiên điều phối chọn khoảng lặng.
- **K6. Nhà chung cho đồ dùng test là package mới `@elvaria/testkit`, chỉ dev (V7).** Việc này sửa ADR 0001 và `boundaries.mjs`. Khuyến nghị: có. Package giữ nhỏ, chỉ có thư mục tạm và repo git, không phụ thuộc package nào. Bộ dựng kingdom vẫn ở `__fixtures__` của từng package. Cách khác là để nguyên và chỉ thêm luật lint cấm gọi `mkdtemp` trong spec, nhưng khi đó mỗi package vẫn giữ một bản.
- **K13. Cổng khung chép cho toàn bộ mã chạy, có danh sách cặp được giữ kèm lý do (V13), rồi rà dần 71 cặp hiện có (V14).** Khuyến nghị: có, bật cổng cùng V1 và V2 để code của giai đoạn 2 không chép thêm. Việc rà làm theo cụm, cụm lệnh quest của `apps/cli` trước. Ngưỡng 60 token (khoảng 8 dòng) là đề xuất, phiên làm V13 thử lại trên vài ngưỡng.

Chờ được:

- **K7. Gom phần chép của adapter về `runner-core` (V9).** Khuyến nghị: làm trước adapter thứ tư, không chặn giai đoạn 2.
- **K8. Cổng jscpd.** Khuyến nghị: không thêm. Bộ dò khung của K13 thấy cả chép nguyên văn và không cần dependency mới.
- **K9. Ngưỡng `complexity` 15 với baseline.** Khuyến nghị: có, làm cùng V2. Không sửa 52 hàm hiện có, chỉ chặn hàm mới.
- **K10. README lớn.** Khuyến nghị: làm V11 ngay. Còn việc chia README trên 20 KB thành README theo thư mục khái niệm thì chờ sau V6, khi thư mục của `steward` đã yên.
- **K11. Dọn gốc `apps/cli` và nhóm file của `runner-claude` (V12).** Khuyến nghị: chờ, làm khi vùng đó rảnh.
- **K12. Báo cáo dòng không chạy (V15).** Khuyến nghị: knip `--production` vào cổng cùng K1. Hai báo cáo coverage làm sau, chạy định kỳ, không làm cổng vì đường xử lý lỗi hiếm vẫn là code cần giữ. Phiên rà soát chưa đo hai báo cáo này.

## Quyết định

Chưa có. Chủ nhân chốt thì ghi ở đây và một dòng §11 của ngày chốt.
