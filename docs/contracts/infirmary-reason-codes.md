# Hợp đồng: mã lý do trạm quân y và ghi chú doctor

Hợp đồng của đội q_20261114_mggach (kế hoạch: [plans/infirmary-reason-codes.md](../../plans/infirmary-reason-codes.md)). Mọi phần giữ đúng tên, kiểu và khóa dưới đây; phần nào thấy hợp đồng sai thì ghi vào thư bàn giao, không tự sửa file này.

Mẫu theo: `packages/domain/src/scorecard/reasons.ts` — lý do là một mã cộng tham số, không bao giờ là một câu; CLI nói nó bằng ngôn ngữ của chủ nhân qua `t()`. Chữ do hook, script hay CLI bên ngoài in ra đi vào tham số hoặc `detail` **nguyên văn**, không dịch.

## 1. Event `quest.infirmary`, `v` 2

### 1.1 Số `v`

- `v` của mọi dòng event (`EventSchema` ở `packages/domain/src/schema/event/event.ts`) lên `2`: `v: z.literal(EVENT_VERSION)`. Domain export hằng `EVENT_VERSION` (cùng file, qua `packages/domain/src/index.ts`; `1` cho tới phần d2, `2` từ d2); mọi chỗ ghi event và mọi fixture TS dựng một dòng event dùng hằng này, không viết số `1` hay `2` tay. Riêng `packages/hooks` (không được nạp domain lúc chạy, `.claude/rules/hooks.md`) dùng `CURRENT_EVENT_VERSION` của `@elvaria/eventlog`; `migrations.spec.ts` giữ hai hằng bằng nhau. File `.jsonl` và `.mjs` cố định `"v": 1` (fixture của CLI giả) giữ nguyên: reader nâng chúng.
- `packages/eventlog/src/migrations/` có bước đầu tiên `v1-to-v2.ts` (`EVENT_MIGRATIONS = [v1ToV2]`, nên `CURRENT_EVENT_VERSION = 2`) và fixture `v2.jsonl` cạnh `v1.jsonl`. Event log trên đĩa **không bao giờ bị viết lại**: reader nâng dòng v1 khi đọc.
- Bước `v1ToV2` (thuần, không IO): đặt `v: 2` cho mọi dòng; riêng dòng `type: "quest.infirmary"` có `data.reason` là chuỗi thì thay bằng `{ "code": "legacy", "params": { "text": <chuỗi cũ> } }`. `trip`, `detail` và mọi trường khác giữ nguyên. Dòng loại khác chỉ đổi `v`.

### 1.2 Hình dạng `data` mới

```ts
// packages/domain/src/schema/event/state-data.ts
QuestInfirmaryDataSchema = z.strictObject({
  reason: InfirmaryReasonSchema,          // mới: mã + tham số, thay cho câu tiếng Anh
  trip: z.enum(INFIRMARY_TRIPS).optional(), // như cũ; người ghi mới luôn đặt nó
  detail: InfirmaryDetailSchema.optional(), // như cũ (cùng các khóa); xem 1.4
  ...QUEST_CHANGE,
});
```

```ts
// packages/domain/src/infirmary/reasons.ts (file mới), export qua src/index.ts
export const INFIRMARY_REASONS = [ /* các mã ở mục 2, đúng thứ tự bảng */ ] as const;
export type InfirmaryReasonCode = (typeof INFIRMARY_REASONS)[number];
export type InfirmaryParams = Readonly<Record<string, string | number>>;
export interface InfirmaryReason { readonly code: InfirmaryReasonCode; readonly params: InfirmaryParams; }
/** Khóa tham số bắt buộc của từng mã, đúng như cột "Tham số" ở mục 2. */
export const INFIRMARY_REASON_PARAMS: Readonly<Record<InfirmaryReasonCode, readonly string[]>>;
export const infirmaryReasonOf = (code: InfirmaryReasonCode, params?: InfirmaryParams): InfirmaryReason;
```

`InfirmaryReasonSchema` (zod, cùng chỗ với schema event): `z.strictObject({ code: z.enum(INFIRMARY_REASONS), params: z.record(z.string(), z.union([z.string(), z.int()])) })` cộng một luật: tập khóa của `params` **bằng đúng** `INFIRMARY_REASON_PARAMS[code]` (thiếu hay thừa khóa đều là lỗi, báo ở `data.reason.params`). Không có tham số tùy chọn: khi một chi tiết lúc có lúc không, nó là hai mã (ví dụ `breaker:commit` và `breaker:commit_errors`).

### 1.3 Kiểu của tham số

- Số đếm, giới hạn, phút: số nguyên (`z.int()`), không phải chuỗi.
- Đường dẫn: tương đối với thư mục kingdom, dấu `/` (ADR 0015).
- Danh sách tên (secret): một chuỗi, các tên nối bằng `, `.
- `lines` của `breaker:commit*`: một chuỗi, các dòng nối bằng `\n`, nguyên văn từ hook (đã bỏ mã màu ANSI, đã che secret như mọi dòng event).
- Chữ bên ngoài (lỗi hệ điều hành, lời của hook, của CLI, lý do git từ chối bản vá): chuỗi nguyên văn.

### 1.4 `detail`

Các khóa của `InfirmaryDetailSchema` giữ nguyên tên và kiểu. Từ `v` 2, `detail.message` **chỉ** mang chữ bên ngoài nguyên văn (lời một script, lời hook khi không có mã `breaker:commit*`), không bao giờ là câu Elvaria tự viết; câu Elvaria tự viết nằm trong `reason`. `paths`, `wip`, `patch`, `apprentice_left`, `script`, `follow_up`, `verifiers_stopped`, `partial_verdicts` vẫn được ghi như trước (metrics, `continuationOf` và `refusedPatchOf` đọc chúng). CLI không in một điều hai lần: điều mà câu của `reason` đã nói thì dòng `detail` tương ứng không in lại.

## 2. Danh sách mã lý do trạm quân y

Khóa i18n của mã `<nhóm>:<tên>` là `cli.quest.infirmary.reason.<nhóm>.<tên>`; của `legacy` là `cli.quest.infirmary.reason.legacy`. Placeholder của khóa (cả `vi` lẫn `en`) đúng bằng cột Tham số.

| Mã | Ai ghi | Tham số | Nghĩa |
|---|---|---|---|
| `breaker:time` | cầu dao (assignee) | `minutes`, `limit` | chạy `minutes` phút, trần `limit` phút |
| `breaker:tokens` | cầu dao (assignee) | `tokens`, `limit` | dùng `tokens` token, trần `limit` |
| `breaker:turns` | cầu dao (assignee) | `turns`, `limit` | `turns` lượt, trần `limit` |
| `breaker:commit` | cầu dao, hook từ chối commit | `lines`, `total_lines`, `log` | hook từ chối; vài dòng đầu `lines`, output có `total_lines` dòng, đủ ở `log` |
| `breaker:commit_errors` | như trên | `lines`, `errors`, `total_lines`, `log` | như trên, thêm `errors` dòng chứa `error` (≥ 1) |
| `breaker:patch` | cầu dao, Nhiếp chính không áp bản vá | `file`, `why` | `elvaria.patch` không được áp; `why` nguyên văn |
| `breaker:forbidden_paths` | cầu dao | `count` | `count` đường dẫn cấm bị đổi (danh sách ở `detail.paths`) |
| `breaker:secrets_refused` | cầu dao secret | `territory`, `names` | lãnh thổ không cho các secret `names` |
| `breaker:secrets_missing` | cầu dao secret | `names` | kho bảo vật thiếu `names` |
| `breaker:treasury_unreadable` | cầu dao secret | `error` | không đọc được kho bảo vật; `error` nguyên văn |
| `breaker:no_session` | không mở được phiên người làm (trip `no_session`) | `error` | plot, request hay spawn ném lỗi; `error` là dòng đầu, tối đa 300 ký tự (thêm lúc giao hàng PS-07, khi merge fix/review-no-session) |
| `judge:time` | cầu dao người chấm | `stopped`, `run` | `stopped` người chấm của lượt `run` bị cầu dao thời gian cắt |
| `judge:tokens` | như trên | `stopped`, `run` | … cầu dao token |
| `judge:turns` | như trên | `stopped`, `run` | … cầu dao lượt |
| `judge:not_a_verdict` | người chấm | `stopped`, `run`, `error` | output của người chấm cuối không phải phán quyết (`error` là mã lỗi kiểm phán quyết) |
| `judge:verdict_unwritten` | người chấm | `stopped`, `run`, `error` | phán quyết không ghi được; `error` nguyên văn |
| `judge:session_ended` | người chấm | `stopped`, `run`, `outcome` | phiên chấm kết thúc `outcome` (giá trị `RunResult.outcome`, kèm mã thoát nếu có, nguyên văn) |
| `judge:session_lost` | người chấm | `stopped`, `run` | phiên chấm bị mất |
| `judge:no_session` | người chấm | `stopped`, `run`, `error` | phiên chấm cuối không mở được (`review.no_session`); `error` như `breaker:no_session` (thêm lúc giao hàng PS-07) |
| `judge:partial_verdicts` | người chấm | `count`, `run` | `count` phán quyết dở ở lượt `run` |
| `judge:partial_verdicts_until` | người chấm | `count`, `run`, `until` | như trên; người chấm cuối dừng ở `until` (chữ của nó, nguyên văn) |
| `restart:time` | lần khởi động lại | `stopped` | Nhiếp chính dừng trước nước này; làm ở lần khởi động sau; `stopped` người chấm bị cắt vì thời gian |
| `restart:tokens` | lần khởi động lại | `stopped` | … vì token/lượt |
| `restart:no_verdict` | lần khởi động lại | `stopped` | … `stopped` người chấm rời đi không phán quyết |
| `restart:partial_verdicts` | lần khởi động lại | `count` | … `count` phán quyết dở |
| `script:broken` | bậc script | `script` | script hỏng (lời script ở `detail.message`) |
| `script:usage` | bậc script | `script` | script không dùng được tham số |
| `script:fail` | bậc script | `script` | script chạy xong mà không đạt |
| `script:fail_follow_up` | bậc script | `script`, `follow_up` | như trên, đã mở quest tiếp nối `follow_up` |
| `quest:max_attempts` | máy trạng thái | (không) | hết số lần thử |
| `legacy` | chỉ bước migrate | `text` | dòng `v` 1: câu tiếng Anh cũ, in nguyên văn |

Luật hiển thị của `legacy`: dòng có `trip` thì CLI nói như trước (nhãn `cli.quest.infirmary.trip.<trip>` rồi các dòng `detail`); dòng không có `trip` thì in `text` nguyên văn. Không người ghi mới nào phát `legacy` sau khi phần steward (d4) xong.

## 3. `breaker:commit`: dòng đầu, số lỗi, file log

- Hàm thuần `hookOutputHead(output: string): HookOutputHead` ở `packages/runner-core/src/plot/hook-output.ts`, export qua `src/index.ts`:

```ts
export interface HookOutputHead {
  readonly lines: readonly string[]; // ≤ HEAD_LINES dòng không rỗng đầu tiên, mỗi dòng ≤ LINE_CHARS ký tự
  readonly errors: number;           // số dòng (của cả output) khớp /error/i
  readonly total_lines: number;      // số dòng của output, bỏ dòng rỗng cuối
}
export const HEAD_LINES = 5;
export const LINE_CHARS = 200;
```

- Một dòng dài hơn `LINE_CHARS` cắt ở khoảng trắng cuối cùng trong `LINE_CHARS` ký tự đầu rồi thêm `…`; một chữ dài hơn `LINE_CHARS` (không có khoảng trắng) mới cắt cứng ở `LINE_CHARS` rồi thêm `…`. Không bao giờ tách một cặp surrogate. Mã màu ANSI bị bỏ trước khi chọn dòng.
- `CommitOutcome` (`packages/runner-core/src/plot/worktree-ops.ts`), nhánh `refused`, thêm `head: HookOutputHead` và `log?: string`. `detail` giữ, nay là `head.lines.join('\n')` (không còn 2000 ký tự cuối: `DETAIL_CHARS` bỏ). Khi có `rescue`, toàn bộ output (stderr rồi stdout, như `said` bây giờ) được ghi vào `<rescue.dir>/pre-commit.log`, và `log` là `'pre-commit.log'` (tên file trong thư mục của lượt chạy). Không `rescue` thì không file, không `log`.
- `rescue.dir` của Nhiếp chính là thư mục lượt chạy `runDirOf(quest, n, 'assignee')` (`packages/steward/src/sessions/commit.ts`). Tham số `log` của lý do là đường dẫn tương đối với kingdom, dấu `/`: `.runs/<quest>-<n>/pre-commit.log` (đúng chuỗi `runDirOf` trả, nối `/pre-commit.log`).
- Mã: `errors === 0` → `breaker:commit`; `errors ≥ 1` → `breaker:commit_errors`. `lines` của lý do là `head.lines.join('\n')` (có thể rỗng khi hook không in gì).

## 4. `doctor()`: ghi chú có mã

### 4.1 Kiểu

```ts
// packages/runner-core/src/runner/doctor-notes.ts (file mới), export qua src/index.ts
export const DOCTOR_NOTES = [ /* các mã ở 4.2, đúng thứ tự bảng */ ] as const;
export type DoctorNoteCode = (typeof DOCTOR_NOTES)[number];
export interface DoctorNote { readonly code: DoctorNoteCode; readonly params: Readonly<Record<string, string | number>>; }
export const DOCTOR_NOTE_PARAMS: Readonly<Record<DoctorNoteCode, readonly string[]>>;
export const doctorNoteOf = (code: DoctorNoteCode, params?: DoctorNote['params']): DoctorNote;
/** Ghi chú cho một lệnh không chạy tới cuối: hết giờ → doctor:command_timed_out, không khởi động → doctor:command_not_started. */
export function callNote(command: string, run: { readonly timed_out: boolean; readonly failure?: string }, timeoutMs: number): DoctorNote | undefined;
/** Ghi chú khi hook của Elvaria chưa build (thay cho câu hookMissing). */
export async function hookNote(script: string | undefined): Promise<DoctorNote | undefined>;
```

`ToolInfo` (`packages/runner-core/src/runner/types.ts`):

```ts
export interface ToolInfo {
  readonly path: AbsolutePath;
  readonly version: string;
  readonly auth_ok: boolean;
  readonly notes?: readonly DoctorNote[]; // mới: điều Elvaria tự nói, theo thứ tự
  readonly detail?: string;               // chữ bên ngoài, in nguyên văn (adapter file vẫn trả được chuỗi)
}
```

`hookProblem`/`hookMissing` giữ nguyên chữ ký (adapter cũ vẫn biên dịch được) cho tới khi phần adapter (d5) chuyển hết sang `hookNote`; `withHookProblem` của kit thêm `doctor:hook_missing` vào `notes` thay vì nối câu vào `detail`.

### 4.2 Danh sách mã doctor

Khóa i18n của `doctor:<tên>` là `cli.doctor.note.<tên>`; placeholder đúng bằng cột Tham số.

| Mã | Tham số | Nghĩa |
|---|---|---|
| `doctor:not_found` | `cli`, `places` | không thấy CLI `cli` ở các chỗ `places` (danh sách đường dẫn nguyên văn) |
| `doctor:no_version` | `command` | `command` không in phiên bản |
| `doctor:command_timed_out` | `command`, `seconds` | `command` không trả lời trong `seconds` giây, đã dừng (máy bận hay mạng chậm) |
| `doctor:command_not_started` | `command`, `error` | `command` không khởi động được; `error` nguyên văn |
| `doctor:not_signed_in` | `command`, `login` | `command` cho thấy chưa đăng nhập (hoặc mất mạng); đăng nhập bằng `login` |
| `doctor:sign_in_ending` | `date`, `login` | phiên đăng nhập hết hạn trước `date`; chạy `login` trước đó |
| `doctor:terms_not_acknowledged` | (không) | chủ nhân chưa chấp nhận điều khoản (ADR 0018): `elvaria doctor --acknowledge-terms` |
| `doctor:hook_missing` | `file` | hook của Elvaria chưa build: thiếu `file` (chạy `pnpm --filter @elvaria/hooks build`) |
| `doctor:bad_note` | `code` | adapter file trả một ghi chú có mã lạ hay tham số sai; `code` nguyên văn |

### 4.3 Adapter file qua kit

Adapter file (người ngoài viết) **không buộc** trả mã: `doctor()` của nó trả `detail` chuỗi (in nguyên văn) và/hoặc `notes`. Lớp bọc của kit (`withHookCheck` ở `packages/runner-core/src/kit/adapter-module.ts`) kiểm từng phần tử của `notes`: mã có trong `DOCTOR_NOTES` và đủ đúng khóa của `DOCTOR_NOTE_PARAMS` thì giữ; phần tử khác thành `doctor:bad_note` với `code` là mã nó mang (hay `?` khi không có). Không bao giờ ném lỗi vì `notes`.

### 4.4 CLI in

`loginFindings` (`apps/cli/src/doctor/check-tribe.ts`) dựng một dòng `cli.doctor.adapter_detail` với `detail` = từng ghi chú dịch bằng `t('cli.doctor.note.<tên>', params)`, rồi `ToolInfo.detail` nguyên văn, nối bằng `; `. Không ghi chú, không `detail` và `auth_ok: false` thì như nay `cli.doctor.login_failed`. Mức (`error`/`warn`) giữ như nay theo `auth_ok`.

## 5. Ai sở hữu gì

| Phần | Định nghĩa trong code |
|---|---|
| d1 (mọi chỗ ghi event) | hằng `EVENT_VERSION` (còn `1`) và mọi người ghi, mọi fixture TS dùng nó; không đổi hành vi |
| d2 (domain, eventlog) | mục 1, mã ở mục 2 (`INFIRMARY_REASONS`, `INFIRMARY_REASON_PARAMS`, schema, migrate), `EVENT_VERSION = 2`; tham số có cấu trúc của cầu dao (`Breaker.params` của domain: `minutes`/`tokens`/`turns`, `limit`); người ghi lý do hiện có tạm bọc câu cũ thành `legacy` để cây còn xanh |
| d3 (runner-core) | mục 3 và 4.1, 4.3 |
| d4 (steward, CLI quest/run/sandbox) | phát mã mục 2 thay cho `legacy` tạm; khóa `cli.quest.infirmary.reason.*`; hiển thị trong `quest show`, chuông, dòng thời gian sandbox |
| d5 (adapter, CLI doctor) | claude, codex, antigravity trả `notes`; khóa `cli.doctor.note.*`; mục 4.4 |
