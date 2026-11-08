# Báo cáo lệch tài liệu ↔ code (2026-11)

Ngày đọc: 2026-11-08. Quest `q_20261108_g9w4r4`. Phạm vi: 22 ADR trong `docs/adr/` và `README.md` của 14 workspace có trên đĩa (`packages/{config, domain, eventlog, store, registry-default, runner-core, runner-claude, runner-antigravity, hooks, steward, chancellor, sandbox, i18n}`, `apps/cli`). `packages/runner-gemini`, `runner-codex`, `herald`, `ui-kit`, `ui` chưa có trên đĩa (đọc `packages/<tên>/README.md` báo "file does not exist"), nên không có README để đối chiếu.

## Tóm tắt

Đã đối chiếu 7 trên 36 tài liệu (ADR 0001–0003; README của `config`, `domain`, `eventlog`, `store`) và thấy **2 chỗ lệch, cả hai đều nên sửa tài liệu, độ chắc cao**:

1. ADR 0001 (dòng 13) nói có 17 package và không kể `runner-codex`, trong khi `packages/config/boundaries.mjs:26` đã khai báo `runner-codex`, nên bảng `WORKSPACES` có 18 package.
2. ADR 0002 (dòng 16) ghi "Today `reputationOf`, `affinityOf`, `titleOf`", nhưng `familyOf` (`packages/domain/src/character/family.ts:16`) và `poolOf` (`packages/domain/src/mana/pool.ts:15`) cũng đã có; chỉ `gearTierOf` và campaign morale là chưa có.

ADR 0003 và cả 4 README đã đọc đều khớp với code. Có một ghi chú nhỏ, không tính là lệch: README `domain` chưa kể hết các luật chéo của registry. Còn 29 tài liệu chưa đối chiếu vì phạm vi đã thu hẹp do hạn mức, nên báo cáo này **không** cho biết các tài liệu đó có lệch hay không (xem mục "Giới hạn").

## Cách đọc

- Mỗi tài liệu là một mục, đi theo thứ tự; kết quả `khớp` hoặc `lệch N mục`.
- Mỗi chỗ lệch có: **Tài liệu** (đường dẫn:dòng, câu trích nguyên văn), **Code** (đường dẫn:dòng, trích nguyên văn), **Khác ở đâu**, **Đề xuất** (`sửa tài liệu` / `sửa code`) và **Độ chắc**.
- "Khớp" nghĩa là mọi định danh, đường dẫn, con số và hành vi tôi kiểm được trong tài liệu đều có trong code như tài liệu nói. Chỗ không kiểm được ghi ở cuối mỗi mục.
- Cách kiểm: đọc từng tài liệu đầy đủ, rồi mở file code nó nêu (công cụ chỉ đọc được file, không liệt kê thư mục hay grep được; xem mục "Giới hạn" cuối báo cáo). Đường dẫn tương đối so với gốc repo.

---

## Phần A — ADR

### docs/adr/0001-pnpm-monorepo-lint-enforced-boundaries.md — lệch 1 mục

1. **Số package và danh sách package**
   - Tài liệu: `docs/adr/0001-pnpm-monorepo-lint-enforced-boundaries.md:13` — "Each package is a real boundary with its own `package.json`: 17 packages (`config, domain, eventlog, store, registry-default, runner-core, runner-claude, runner-antigravity, runner-gemini, hooks, steward, chancellor, herald, sandbox, i18n, ui-kit, ui`) and 3 apps (`cli, world, lite`)."
   - Code: `packages/config/boundaries.mjs:26` — `'runner-codex': { root: 'packages', deps: ['runner-core'] },` (và `:57` trong `deps` của `cli`). Bảng `WORKSPACES` có 18 khóa dưới `packages/`, không phải 17.
   - Khác ở đâu: ADR (kể cả các dòng "Amended") chưa nhắc `runner-codex`, trong khi bảng một-nguồn mà ADR nói là "exactly the DAG in §1.3" đã có nó (tùy chọn, P1-12d).
   - Đề xuất: sửa tài liệu — thêm một dòng "(Amended …: `runner-codex` (← `runner-core`, tùy chọn, P1-12d) có trong bảng; 18 package)".
   - Độ chắc: cao.
   - Ghi chú (không tính là lệch): trên đĩa mới có 13 package + `apps/cli`; `runner-gemini`, `herald`, `ui-kit`, `ui`, `apps/world`, `apps/lite` chưa có. ADR mô tả cấu trúc đích, `boundaries.mjs:11` nói rõ "Workspaces listed before their package exists are already guarded".

Đã kiểm khớp: `boundaries.spec.ts` khẳng định đúng các điều ở dòng 17 (`packages/config/boundaries.spec.ts:64-132`, `:190-197`); `commitlint.config.mjs:2,20` đọc `WORKSPACES` làm `scope-enum`; `package.json:18` chạy `depcruise` với `.dependency-cruiser.mjs`; build `tsc -p` của eventlog (`packages/eventlog/package.json:14`). Câu "A third runner is a new package plus one registration line in `apps/cli`" (dòng 26): xem mục `apps/cli/README.md`.

### docs/adr/0002-pure-domain-package.md — lệch 1 mục

1. **Hàm suy ra "đã có hôm nay"**
   - Tài liệu: `docs/adr/0002-pure-domain-package.md:16` — "Derived values are functions, never stored: `gearTierOf`, `reputationOf`, `familyOf`, `poolOf`, campaign morale. (Today `reputationOf`, `affinityOf`, `titleOf`; the others come with their tasks.)"
   - Code: `packages/domain/src/character/family.ts:16` — `export function familyOf(model: string): string {`; `packages/domain/src/mana/pool.ts:15` — `export function poolOf(tribe: Pick<Tribe, 'id' | 'pools'>, model: string): PoolId {`. Cả hai được xuất ở `packages/domain/src/index.ts:6,24`.
   - Khác ở đâu: ghi chú "Today …" đã cũ: `familyOf` (P1-04/ADR 0008) và `poolOf` (P1-05/ADR 0009) đã có; chỉ `gearTierOf` và campaign morale là chưa có.
   - Đề xuất: sửa tài liệu — đổi thành "(Today `reputationOf`, `affinityOf`, `titleOf`, `familyOf`, `poolOf`; `gearTierOf` and campaign morale come with their tasks.)".
   - Độ chắc: cao.

Đã kiểm khớp: danh sách cấm của dòng 12 có trong `packages/config/eslint-boundaries.mjs:24-28,119-151` (mọi built-in Node, `process`, `Buffer`, `fetch`, `crypto`, `performance`, timer, `Date.now`, `new Date()` không đối số, `Math.random`; bỏ qua `NOT_RUNTIME` ở `:17`); `Clock`, `RandomSource`, `IdSource` ở `packages/domain/src/core/clock.ts:11`, `core/id-source.ts:19,24`; các hàm quyết định dòng 15 đều có (`planTick` `dispatch/plan-tick.ts:226`, `transition` `quest/transition.ts:48`, `evaluateBreakers` `breaker/evaluate.ts:40`, `decideManaState` `mana/state.ts:36`, `selectVerifier`, `validateVerdict`, `statusToneOf` xuất ở `index.ts:34,81,82`); `domain` chỉ phụ thuộc `zod` (`packages/domain/package.json:14-16`); ngưỡng coverage 100 (`packages/domain/vitest.config.mjs:28`).

### docs/adr/0003-zod-schema-source-generated-json-schema.md — khớp

Đã kiểm: `CONTRACTS` có đúng 17 hợp đồng (`packages/domain/src/schema/contracts.ts:24-42`); `pnpm schemas` = `node scripts/gen-schemas.mjs` và `pnpm check` có `pnpm schemas --check` (`package.json:11,19`); `EventSchema` giữ `v: z.literal(1)` và `type` là pattern, không phải enum, nên reader giữ type lạ (`packages/domain/src/schema/event/event.ts:36,39`); chuỗi migration của store ở `packages/store/src/migrations/index.ts:28-41` (12 contract, đều rỗng ở v1), của eventlog ở `packages/eventlog/src/migrations/index.ts:7`; `migrateKingdom` ghi bản cũ vào `.backup/<stamp>/` trước khi ghi đè (`packages/store/src/migrate-kingdom.ts:64-104`); test đọc mọi fixture cũ: `packages/store/src/migrations/migrations.spec.ts:1-2`.

---

## Phần B — README của workspace

### packages/config/README.md — khớp

Đã kiểm: `boundaries.mjs`, `eslint-boundaries.mjs`, `depcruise.mjs`, `eslint-i18n.mjs` có và được `eslint.mjs` dùng (`packages/config/eslint.mjs:11-12,104-107`); `commitlint.config.mjs:2,20` đọc bảng; `exports` có `./eslint`, `./prettier` (= `prettier.json`), `./tsconfig/base.json`, `./tsconfig/node.json` (`packages/config/package.json:7-14`); `tsconfig/base.json` đặt `"types": []` (`packages/config/tsconfig/base.json:24`); `DEV_ONLY = ['config']` (`boundaries.mjs:72`); file gốc `.dependency-cruiser.mjs`, `.prettierrc.json` nạp preset; các spec `boundaries.spec.ts`, `depcruise.spec.ts`, `eslint-boundaries.spec.ts`, `eslint-i18n.spec.ts` có trên đĩa.

### packages/domain/README.md — khớp

Đã kiểm từng định danh nêu trong README với `packages/domain/src/index.ts` và file nguồn: `CONTRACTS` 17 mục (`schema/contracts.ts:24-42`); `parseRegistry`, `checkRegistry` (`schema/registry.ts:58,90`); `transition(quest, event, actor)` (`quest/transition.ts:48`); `planTick(snapshot, now)` và các trường `breakers`, `suspensions`, `wakes`, `starts`, `verifications`, `machine_verdicts`, `unjudgeable`, `redispatches`, `claims`, `scripts`, `script_verdicts`, `unclaimable`, `deliveries` (`dispatch/plan-tick.ts:54-101,226-270`); `poolOpenOf` (`dispatch/roster.ts:93`); `resumedSession`, `answeredAlready` (`dispatch/revival.ts:33,50`); `evaluateBreakers(attempt, limits, now, usage)`, thứ tự time → tokens → turns, time ngắt đúng phút (`breaker/evaluate.ts:40-56`); `underPassRule` với `incomplete` cho check `subquests` (`verify/pass-rule.ts:27,33,45`); id verdict `-p<k>`, `-user` (`verify/verdict-id.ts:1-16`); `poolOf`, `decideManaState(readings, pool, cfg, now, model?)` với ngưỡng `min(cap_pct, 100 − king_reserve_pct)` (`mana/pool.ts:15`, `mana/state.ts:19,36-55`); `nextProbeOf` (`mana/schedule.ts:20`); `canTake`, `aboveCeiling`, `levelChange` với `level_since` (`character/level.ts:29,38,46`); `familyOf` (`character/family.ts:16`); `snapshotOf`, `readSnapshot` (`world/snapshot.ts:37,50`); `zonedTime`, `RandomSource`, `IdSource` (`core/clock.ts:48`, `core/id-source.ts:19,24`); chỉ phụ thuộc `zod` (`packages/domain/package.json:14-16`); `vitest.config.mjs` đọc `elvaria.css` và chuyển qua `provide` (`packages/domain/vitest.config.mjs:10-21`), ngưỡng 100 (`:28`).

Ghi chú (không tính lệch): danh sách luật chéo của registry ở dòng 9–10 chưa kể hết (`verifier_and_monk`, `entry_mismatch`, luật `follow_up` có trong `schema/registry.ts:29-39,168-203`); README không nói đó là danh sách đủ.

### packages/eventlog/README.md — khớp

Đã kiểm: dòng ≤ 64 KiB (`packages/eventlog/src/constants.ts:7`), hai file ngày được theo dõi (`:16`), tail bằng polling 500 ms với `from`, `intervalMs`, `signal` (`src/tail.ts:11-17,31-40`); `openEventLog`, `openJournal` (`src/event-log.ts:35,47`); chuỗi migration rỗng (`src/migrations/index.ts:7`); `redact(text, known, patterns)`, `createRedactor`, `redactDeep`, mẫu ở `redact-patterns.json` (`src/redact.ts:6,61,75,94`); `createStamper`, `tsFormatter`, `localTs` xuất ở `src/index.ts:27`; điều kiện `elvaria-dist` trong `exports` (`packages/eventlog/package.json:7-12`); phụ thuộc duy nhất `@elvaria/domain` (`:18-20`); các spec `concurrency.spec.ts`, `crash.spec.ts`, `light-entry.spec.ts`, `stamp.spec.ts` có trên đĩa.

### packages/store/README.md — khớp

Đã kiểm: `openKingdom(dir)` → `KingdomStore` (`packages/store/src/kingdom-store.ts:37-64`); ghi nguyên tử: file tạm cùng thư mục, `handle.sync()`, rename có thử lại `EPERM`/`EACCES`/`EBUSY` trong ngân sách thời gian (`src/io/atomic.ts:16-19,57-74`); mã `not_a_folder` (`src/issues.ts:23`); 12 contract được lưu, chuỗi ở `src/migrations/index.ts:10-41`; `migrateKingdom` với `.backup/<stamp>/` (`src/migrate-kingdom.ts:65-82`); inbox `write`/`read`/`ack` → `inbox/done/` (`src/inbox.ts:23-61`); `loadRegistry` kiểm `prompt_file` của mọi nghề, `missingRegistryFiles` (`src/registry.ts:42-80`); xuất `readClassPrompt`, `readDecree`, `redactHandover`, `acquireLock`, `isLocked`, `initKingdom`, `addMissingRegistryFiles` (`src/index.ts:5,13,15`); phụ thuộc `domain`, `eventlog`, `proper-lockfile` (`packages/store/package.json:14-18`); `test/kingdom.ts`, `test/update-worker.ts`, `src/concurrency.spec.ts`, `src/migrations/migrations.spec.ts` có trên đĩa.


---

## Giới hạn

### Tài liệu chưa đối chiếu

Ngày 2026-11-08, chủ nhân thu hẹp phạm vi quest vì hạn mức (mana): không đối chiếu thêm tài liệu nào sau 7 tài liệu ở trên. Vì vậy 29 tài liệu dưới đây **chưa được đối chiếu**. Báo cáo không khẳng định chúng khớp hay lệch với code. Tên file ADR lấy từ bảng ở `docs/implementation-plan.md:1167-1185`.

ADR (19):

- `docs/adr/0004-kingdom-state-is-files.md`
- `docs/adr/0005-single-writer-steward-inbox.md`
- `docs/adr/0006-runner-adapter-behind-agentrunner.md`
- `docs/adr/0007-claude-workers-dontask-own-worktrees.md`
- `docs/adr/0008-separation-of-duties.md`
- `docs/adr/0009-mana-model.md`
- `docs/adr/0010-two-file-journal.md`
- `docs/adr/0011-one-judge-class-per-tribe.md`
- `docs/adr/0012-worktree-for-every-git-quest.md`
- `docs/adr/0013-treasury-and-redaction.md`
- `docs/adr/0014-english-identifiers-glossary-bilingual-ui.md`
- `docs/adr/0015-node-only-scripts.md`
- `docs/adr/0016-registry-data-not-code.md`
- `docs/adr/0017-one-quest-one-context-three-tiers.md`
- `docs/adr/0018-gemini-tribe-on-antigravity-cli.md`
- `docs/adr/0019-preact-ui-design-source-of-truth.md`
- `docs/adr/0020-class-skill-scripture-tags-and-parties.md`
- `docs/adr/0021-tribe-contract.md`
- `docs/adr/0022-tests-in-the-world.md`

README (10):

- `packages/registry-default/README.md`
- `packages/runner-core/README.md`
- `packages/runner-claude/README.md`
- `packages/runner-antigravity/README.md`
- `packages/hooks/README.md`
- `packages/steward/README.md`
- `packages/chancellor/README.md`
- `packages/sandbox/README.md`
- `packages/i18n/README.md`
- `apps/cli/README.md`

Hệ quả: câu ở ADR 0001 dòng 26 ("A third runner is a new package plus one registration line in `apps/cli`") mà mục ADR 0001 hẹn kiểm ở mục `apps/cli/README.md` vẫn **chưa được kiểm**, vì mục đó không được viết.

### Giới hạn của cách kiểm

- Công cụ của phiên chỉ đọc được từng file. Không chạy được lệnh shell (hook chặn: "Elvaria rule: run_command: your class has no Bash"), nên không liệt kê được thư mục, không grep được, không chạy được `pnpm check`. Một định danh mà tài liệu nêu chỉ được xác nhận khi tôi mở đúng file chứa nó. Chỗ lệch nằm ở file tôi không mở thì có thể đã bị bỏ sót.
- Không đọc được `docs/dependency-graph.md` (hook báo "forbidden path"), nên ADR 0001 được so với `packages/config/boundaries.mjs` chứ không so với đồ thị sinh ra.
- Muốn biết chắc các tài liệu còn lại, cần một quest tiếp theo đối chiếu 29 tài liệu ở trên, nên chia thành nhiều quest nhỏ (ví dụ theo nhóm ADR 0004–0013, ADR 0014–0022, và các README).
