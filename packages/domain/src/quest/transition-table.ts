// Renders QUEST_TRANSITIONS as the table of implementation-plan §2.5, so the plan is generated from the code
// (`pnpm docs:gen`) instead of kept beside it. The plan is written in Vietnamese (CLAUDE.md), so the conditions
// and notes below are Vietnamese documentation text, keyed by row; the rows themselves stay in transitions.ts.
import { QUEST_STATUSES } from '../schema/quest/shared.ts';
import { QUEST_TRANSITIONS, rowKey } from './transitions.ts';
import type { QuestActor } from './events.ts';
import type { QuestGuard, QuestTransitionRow } from './transitions.ts';

/** The actor letters of the plan's legend (§2.5). */
const ACTOR_LETTERS: Readonly<Record<QuestActor, string>> = {
  user: 'U',
  steward: 'S',
  runner: 'R',
  verifier: 'V',
  mana: 'M',
};

const GUARD_TEXT: Readonly<Record<QuestGuard, string>> = {
  session: '`tier = session`',
  by_character: '`tier = session`, có `assignee`',
  by_machine: 'bậc script, hoặc lượt máy của quest ghép (không có `assignee`)',
  merged_by_machine: '`tier = session`, không có `assignee` (lượt máy của quest ghép)',
  can_retry: '`tier = session`, có `assignee`, `attempts < max_attempts`',
  machine_retry: '`tier = session`, không có `assignee` (lượt máy của quest ghép), `attempts < max_attempts`',
  out_of_retries: '`tier = script` hoặc `attempts ≥ max_attempts`',
  seal_required: '`seal_required`',
  no_seal: '`!seal_required`',
  has_assignee: 'có `assignee`',
  no_assignee: 'không có `assignee`',
  needs_verifier: '`tier = session`, chưa có `verifier`',
  has_verifier: 'có `verifier`',
  undelivered: 'chưa có `deliverable.delivered_at`',
  stalled_review:
    '`REVIEW_BREAKS_MAX` người chấm của lượt đã rời đi không ra verdict (cầu dao cắt hoặc `crash`), hoặc `REVIEW_PARTIALS_MAX` người nộp verdict `partial` (`reviewStalled`)',
  no_stalled_review: 'không phải `reviewStalled`',
};

/** Notes per row (rowKey); a row without a note needs none. The spec rejects a note for a row that is gone. */
export const TRANSITION_NOTES: Readonly<Record<string, string>> = {
  'draft.confirm': 'Tể tướng tạo draft; `elvaria quest add` tạo thẳng open',
  'draft.discard': 'lệnh `archive`',
  'open.claim':
    'có người rảnh đúng nghề, đủ cấp (`canTake`), tộc còn mana, `depends_on` xong; nhận vượt hạng trần của cấp ⇒ `seal_required`; bậc script: `assignee = null`, actor là Quản sự',
  'open.block': '`depends_on` chưa xong hoặc câu hỏi của Tể tướng chưa trả lời; ghi `blocked.question`',
  'open.reassign.session':
    'lệnh `reassign` có `character`: người dùng giao thẳng, không xét `canTake`; vượt hạng trần ⇒ `seal_required`; `depends_on` vẫn phải xong trước `start`',
  'open.cancel': 'lệnh `cancel`; mọi trạng thái chưa xong đều hủy được',
  'claimed.start': 'đất riêng xong, phiên mở; `attempts` +1, mở lượt mới `n` trong `attempt_log`',
  'claimed.release': 'spawn lỗi; `attempts` không tăng, bỏ `assignee`',
  'claimed.breaker':
    'trip `secrets`: kho bảo vật thiếu secret quest xin, hoặc lãnh thổ đã bỏ nó khỏi `secrets_allowed`; không mở phiên, `attempts` không đổi, chuông',
  'working.submit.by_character':
    'có handover.md; mọi thay đổi đã commit vào nhánh; lượt kết thúc `submitted`',
  'working.submit.by_machine':
    'script chạy xong trong plot, output vào `.runs/` + journal.jsonl; hoặc Quản sự đã gộp sạch mọi phần vào plot của quest ghép (P1-18)',
  'working.release.by_machine':
    'Quản sự dừng giữa lúc script chạy (lần chạy không để lại gì): lượt kết thúc `cancelled`, quest mở lại, tick sau chạy lại (P1-17); hoặc gộp các phần của quest ghép dừng ở xung đột: quest mở lại cho hiệp sĩ, merge dở để nguyên trong plot (P1-18)',
  'working.release.by_character':
    'phiên của nhân vật kết thúc trong lúc không có Quản sự nào chạy (Quản sự dừng hay bị giết): lượt kết thúc `cancelled`, `attempts` trả lại một (lần `redispatch` ngay sau lấy lại nó), cùng nhân vật làm tiếp ở phiên mới từ handover (P1-44)',
  'working.ask': 'ghi `blocked.question`; lượt kết thúc `blocked`',
  'working.mana_out.by_character': 'giữ `assignee`; lượt kết thúc `paused`',
  'working.breaker':
    'kill tree, event `quest.infirmary` kèm lý do; lượt `timeout` (thời gian) hoặc `breaker` (token, lượt, hook từ chối commit lúc nộp); nhân vật → swamp rồi idle',
  'working.crash.can_retry': 'outcome `crash`, cùng nhân vật thử lại',
  'working.crash.out_of_retries':
    'bậc script: lỗi script vào thẳng trạm quân y (lỗi của Elvaria hoặc dữ liệu)',
  'working.suspend.by_character':
    'người dùng đình chỉ nhân vật (§2.6); lượt kết thúc `returned`; người dùng giao lại',
  'working.cancel': 'kill, giữ worktree; lượt kết thúc `cancelled`',
  'paused_mana.mana_restored': 'cùng nhân vật, phiên mới từ handover, cùng lượt `n` (§3.5)',
  'paused_mana.reassign':
    'người dùng đổi người; hoặc Quản sự, khi quest ngủ quá `mana.reassign_after_hours` và có người cùng nghề còn mana (`selectAssignee`, P1-22); mọi `reassign` vượt hạng trần của cấp người mới ⇒ `seal_required`; người cũ bỏ `current`',
  'paused_mana.suspend':
    'người dùng đình chỉ nhân vật đang ngủ trên quest (§2.6): quest thả người đó, bỏ `assignee`, mở lại cho Quản sự giao như mọi quest open; `attempts` giữ, lượt đã kết thúc `paused` từ trước (P1-22)',
  'paused_mana.breaker': 'trip `secrets`, như `claimed`; người làm đang ngủ bỏ `current`',
  'blocked.answer.has_assignee':
    'câu trả lời ghi vào `blocked.answer` và handover.md; phiên mới, cùng lượt `n`',
  'blocked.unblock.no_assignee': '`depends_on` xong',
  'review.assign_verifier.needs_verifier':
    '`selectVerifier` (§3.2), mở lượt vai verifier; quest bậc script không bao giờ có verifier là nhân vật',
  'review.verdict_pass.no_seal':
    'verdict của verifier, hoặc của máy (`machine`) khi không có verifier (ADR 0008)',
  'review.verdict_pass.seal_required': 'chuông',
  'review.verdict_fail.can_retry':
    'notes bắt buộc, `fail_kind`; bỏ `verifier`, lần nộp sau chọn người chấm mới',
  'review.verdict_fail.machine_retry':
    'lượt máy của quest ghép bị đánh trượt: không có người để trả về, quest mở lại cho hiệp sĩ, phiên của nó đọc verdict (P1-18)',
  'review.verdict_fail.out_of_retries': 'chuông; bậc script không có `returned`',
  'review.verdict_partial.has_verifier':
    'người chấm nộp verdict `partial` (lưu `progress`) rồi rời đi; `verifier = null`, lượt kết thúc `partial` (P1-42; trước đó `submitted`), không đếm vào `reviewBreaksOf` mà vào `reviewPartialsOf`; người kế đọc tiếp (P1-33)',
  'review.verdict_partial.needs_verifier':
    'ngay sau hàng trên, khi `REVIEW_PARTIALS_MAX` (3) người chấm của lượt đã nộp verdict `partial` (`partialsStalled`, P1-42): trip `partial_verdicts`, chuông; `retry` của người dùng đưa về review như với cầu dao; hoặc lúc Quản sự khởi động, khi Quản sự trước dừng giữa hàng trên và hàng này (P1-44)',
  'review.mana_out.has_verifier': '`verifier = null`, verdict `partial` lưu `progress`; người kế đọc tiếp',
  'review.breaker.has_verifier':
    'như trên; cả khi CLI của người chấm tự dừng ở trần lượt hay ngân sách (P1-23)',
  'review.breaker.needs_verifier':
    'trip `secrets`, như `claimed`: người chấm cần cùng secret với người làm; hoặc ngay sau hàng trên, khi `REVIEW_BREAKS_MAX` (2) người chấm của lượt đã rời đi không ra verdict (`reviewStalled`, P1-23) và người cuối bị cầu dao cắt, chuông; hoặc lúc Quản sự khởi động, khi Quản sự trước dừng giữa hàng trên và hàng này (P1-44)',
  'review.crash.has_verifier':
    'phiên người chấm kết thúc mà không có phán quyết (CLI lỗi, output không thành verdict): như trên, lượt kết thúc `crash`, đếm vào `reviewBreaksOf` (P1-33)',
  'review.crash.needs_verifier':
    'ngay sau hàng trên, khi `REVIEW_BREAKS_MAX` (2) người chấm của lượt đã rời đi không ra verdict (`reviewStalled`, P1-33): trip `no_verdict`, chuông; `retry` của người dùng đưa về review như với cầu dao; hoặc lúc Quản sự khởi động, khi Quản sự trước dừng giữa hàng trên và hàng này (P1-44)',
  'review.release.has_verifier':
    'phiên người chấm kết thúc trong lúc không có Quản sự nào chạy: người chấm rời đi, lượt kết thúc `cancelled`, không đếm vào `reviewBreaksOf` (P1-44)',
  'review.suspend.has_verifier': 'như trên, khi người dùng đình chỉ người chấm',
  'returned.redispatch': '`attempts` +1, lượt mới, cùng `assignee`, prompt kèm notes',
  'returned.breaker': 'trip `secrets`, như `claimed`',
  'awaiting_seal.seal': '`seal`, verdict `by_human = true` (nặng ×3)',
  'awaiting_seal.return.by_character': 'lệnh `return` kèm ghi chú; bỏ `verifier`',
  'awaiting_seal.return.merged_by_machine':
    'lệnh `return` với lượt máy của quest ghép: không có người để trả về, quest mở lại cho hiệp sĩ, phiên của nó đọc verdict của vua (P1-18)',
  'awaiting_seal.reject': 'lệnh `archive`',
  'done.deliver.undelivered':
    'giao hàng theo kind, ghi `deliverable.delivered_at`; không là trạng thái riêng để không nhân đôi',
  'done.archive': 'Quản sự sau N ngày; xóa worktree khi archive, không sớm hơn',
  'infirmary.retry.no_stalled_review': '`attempts = 0`, bỏ `assignee`, giữ `attempt_log`',
  'infirmary.retry.stalled_review':
    'việc đã xong, chỉ phần chấm bị cắt mãi: giữ `assignee`, `attempts`, lượt `n`; người chấm mới; `reviewBreaksOf` và `reviewPartialsOf` đếm lại từ lần `retry` này (P1-26, P1-42)',
  'infirmary.reassign.session': 'người mới có đủ `max_attempts` (`attempts = 0`)',
  'infirmary.archive': 'lệnh `archive`',
};

const cell = (text: string): string => text.replaceAll('|', String.raw`\|`);
const line = (cells: readonly string[]): string => `| ${cells.map(cell).join(' | ')} |`;

const rowLine = (row: QuestTransitionRow, notes: Readonly<Record<string, string>>): string =>
  line([
    row.from,
    `\`${row.event}\``,
    row.guard === undefined ? '' : GUARD_TEXT[row.guard],
    row.actors.map((actor) => ACTOR_LETTERS[actor]).join('/'),
    row.to,
    notes[rowKey(row)] ?? '',
  ]);

/**
 * The §2.5 table as Markdown, one line per row and one per status nothing leaves; no trailing newline.
 * `pnpm docs:gen` calls it with the defaults; the parameters are for the spec.
 */
export function renderQuestTransitionTable(
  rows: readonly QuestTransitionRow[] = QUEST_TRANSITIONS,
  notes: Readonly<Record<string, string>> = TRANSITION_NOTES,
): string {
  const terminal = QUEST_STATUSES.filter((status) => !rows.some((row) => row.from === status));
  return [
    line(['Từ', 'Sự kiện', 'Điều kiện', 'Ai', 'Đến', 'Ghi chú']),
    '|---|---|---|---|---|---|',
    ...rows.map((row) => rowLine(row, notes)),
    ...terminal.map((status) => line([status, '—', '', '', '', 'trạng thái cuối'])),
  ].join('\n');
}
