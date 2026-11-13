import { describe, expect, it } from 'vitest';

import { TRANSITION_NOTES, renderQuestTransitionTable } from './transition-table.ts';
import { QUEST_TRANSITIONS, rowKey } from './transitions.ts';

const lines = renderQuestTransitionTable().split('\n');

describe('renderQuestTransitionTable', () => {
  it('renders the header of implementation-plan §2.5, one line per row and one per terminal status', () => {
    expect(lines.slice(0, 2)).toEqual([
      '| Từ | Sự kiện | Điều kiện | Ai | Đến | Ghi chú |',
      '|---|---|---|---|---|---|',
    ]);
    expect(lines).toHaveLength(2 + QUEST_TRANSITIONS.length + 1);
    expect(lines.at(-1)).toBe('| archived | — |  |  |  | trạng thái cuối |');
  });

  it('writes the event, the guard, the actor letters, the target and the note of a row', () => {
    expect(lines).toContain(
      '| review | `verdict_fail` | `tier = session`, có `assignee`, `attempts < max_attempts` | V/S | returned | notes bắt buộc, `fail_kind`; bỏ `verifier`, lần nộp sau chọn người chấm mới |',
    );
    expect(lines).toContain('| claimed | `cancel` |  | U | archived |  |');
    expect(lines).toContain(
      '| done | `archive` |  | U/S | archived | Nhiếp chính sau N ngày; xóa worktree khi archive, không sớm hơn |',
    );
  });

  it('keeps notes only for rows that exist, so a removed row cannot leave its note behind', () => {
    const keys = new Set(QUEST_TRANSITIONS.map(rowKey));
    expect(Object.keys(TRANSITION_NOTES).filter((key) => !keys.has(key))).toEqual([]);
  });

  it('renders the rows and notes it is given, with a pipe in a cell escaped', () => {
    const rows = [{ from: 'draft', event: 'confirm', actors: ['user'], to: 'open' }] as const;
    const table = renderQuestTransitionTable(rows, { 'draft.confirm': 'a | b' }).split('\n');
    // Every status but draft has no row here, so each is listed as terminal.
    expect(table).toHaveLength(2 + 1 + 11);
    expect(table[2]).toBe(String.raw`| draft | ` + '`confirm`' + String.raw` |  | U | open | a \| b |`);
  });
});
