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
  script: '`tier = script`',
  can_retry: '`tier = session`, `attempts < max_attempts`',
  out_of_retries: '`tier = script` hoặc `attempts ≥ max_attempts`',
  seal_required: '`seal_required`',
  no_seal: '`!seal_required`',
  has_assignee: 'có `assignee`',
  no_assignee: 'không có `assignee`',
  needs_verifier: '`tier = session`, chưa có `verifier`',
  has_verifier: 'có `verifier`',
  undelivered: 'chưa có `deliverable.delivered_at`',
};

/** Notes per row (rowKey); a row without a note needs none. The spec rejects a note for a row that is gone. */
export const TRANSITION_NOTES: Readonly<Record<string, string>> = {
  'draft.confirm': 'Tể tướng tạo draft; `elvaria quest add` tạo thẳng open',
  'draft.discard': 'lệnh `archive`',
  'open.claim':
    'có người rảnh đúng nghề, đủ cấp, tộc còn mana, `depends_on` xong; bậc script: `assignee = null`, actor là Quản sự',
  'open.block': '`depends_on` chưa xong hoặc câu hỏi của Tể tướng chưa trả lời; ghi `blocked.question`',
  'open.cancel': 'lệnh `cancel`; mọi trạng thái chưa xong đều hủy được',
  'claimed.start': 'đất riêng xong, phiên mở; `attempts` +1, mở lượt mới `n` trong `attempt_log`',
  'claimed.release': 'spawn lỗi; `attempts` không tăng, bỏ `assignee`',
  'working.submit.session': 'có handover.md; mọi thay đổi đã commit vào nhánh; lượt kết thúc `submitted`',
  'working.submit.script': 'script chạy xong trong plot, output vào `.runs/` + journal.jsonl',
  'working.ask': 'ghi `blocked.question`; lượt kết thúc `blocked`',
  'working.mana_out.session': 'giữ `assignee`; lượt kết thúc `paused`',
  'working.breaker':
    'kill tree, event `quest.infirmary` kèm lý do; lượt `timeout` (thời gian) hoặc `breaker` (token, lượt); nhân vật → swamp rồi idle',
  'working.crash.can_retry': 'outcome `crash`, cùng nhân vật thử lại',
  'working.crash.out_of_retries':
    'bậc script: lỗi script vào thẳng trạm quân y (lỗi của Elvaria hoặc dữ liệu)',
  'working.suspend.session':
    'người dùng đình chỉ nhân vật (§2.6); lượt kết thúc `returned`; người dùng giao lại',
  'working.cancel': 'kill, giữ worktree; lượt kết thúc `cancelled`',
  'paused_mana.mana_restored': 'cùng nhân vật, phiên mới từ handover, cùng lượt `n` (§3.5)',
  'paused_mana.reassign': 'người dùng đổi người',
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
  'review.verdict_fail.out_of_retries': 'chuông; bậc script không có `returned`',
  'review.mana_out.has_verifier': '`verifier = null`, verdict `partial` lưu `progress`; người kế đọc tiếp',
  'review.breaker.has_verifier': 'như trên',
  'review.suspend.has_verifier': 'như trên, khi người dùng đình chỉ người chấm',
  'returned.redispatch': '`attempts` +1, lượt mới, cùng `assignee`, prompt kèm notes',
  'awaiting_seal.seal': '`seal`, verdict `by_human = true` (nặng ×3)',
  'awaiting_seal.return.session': 'lệnh `return` kèm ghi chú; bỏ `verifier`',
  'awaiting_seal.reject': 'lệnh `archive`',
  'done.deliver.undelivered':
    'giao hàng theo kind, ghi `deliverable.delivered_at`; không là trạng thái riêng để không nhân đôi',
  'done.archive': 'Quản sự sau N ngày; xóa worktree khi archive, không sớm hơn',
  'infirmary.retry': '`attempts = 0`, bỏ `assignee`, giữ `attempt_log`',
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
