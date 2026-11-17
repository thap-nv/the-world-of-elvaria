// The draft quest of a patrol that found checks turned red (PS-26, K7): one draft naming the checks, their first
// error lines, logs and suspects, of the kind, rank and class the territory declares.
import { describe, expect, it } from 'vitest';

import { CreateQuestPayloadSchema } from '../schema/command/payloads.ts';
import { patrolFollowUpOf } from './follow-up.ts';
import type { ClassId, KindId, QuestId, TerritoryId } from '../core/ids.ts';
import type { Registry } from '../schema/registry.ts';
import type { RedCheck } from './health.ts';

const kinds = [{ id: 'fix', name_vi: 'Sửa lỗi', name_en: 'Fix' }] as unknown as Registry['kinds'];
const followUp = { kind: 'fix' as KindId, rank: 'D' as const, class: 'knight' as ClassId };
const red = (extra: Partial<RedCheck>): RedCheck => ({
  check: 'unit',
  since: '2026-11-17T06:30:00+07:00',
  commit: 'a'.repeat(40),
  error_line: 'FAIL src/a.spec.ts',
  log_path: '.runs/patrol-elvaria/checks/unit.log',
  suspects: [],
  ...extra,
});
const run = (turned: readonly RedCheck[], locale: 'vi' | 'en' = 'vi') =>
  patrolFollowUpOf({
    territory: 'elvaria' as TerritoryId,
    follow_up: followUp,
    turned_red: turned,
    kinds,
    locale,
  });

describe('patrolFollowUpOf', () => {
  it('a draft of the declared kind, rank and class, made by the patrol, naming each check and its suspects', () => {
    const payload = run([
      red({
        green_at: '2026-11-16T06:30:00+07:00',
        suspects: [
          { quest: 'q_20261116_aaaaa1' as QuestId, sealed: false, ts: 't' },
          { quest: 'q_20261116_aaaaa2' as QuestId, sealed: true, ts: 't' },
        ],
      }),
      red({ check: 'setup', commit: null, green_at: '2026-11-16T06:30:00+07:00' }),
    ]);
    expect(CreateQuestPayloadSchema.parse(payload)).toMatchObject({
      draft: true,
      title: 'Sửa lỗi: elvaria unit, setup',
      kind: 'fix',
      rank: 'D',
      class_required: 'knight',
      created_by: 'patrol',
    });
    expect(payload?.description).toContain('q_20261116_aaaaa1 (merged without the seal), q_20261116_aaaaa2');
    expect(payload?.description).toContain('merged since: none (the change came from outside Elvaria)');
  });

  it('says when no patrol found the check green, or its log nothing; nothing turned red, no draft', () => {
    const { error_line: _line, ...bare } = red({});
    const payload = run([{ ...bare, commit: null }], 'en');
    expect(payload?.title).toBe('Fix: elvaria unit');
    expect(payload?.description).toContain('commit unknown');
    expect(payload?.description).toContain('No earlier patrol found it green.');
    expect(payload?.description).toContain('its log says nothing more');
    expect(run([])).toBeUndefined();
    expect(
      patrolFollowUpOf({
        territory: 'elvaria' as TerritoryId,
        follow_up: { ...followUp, kind: 'gone' as KindId },
        turned_red: [red({})],
        kinds,
        locale: 'vi',
      })?.title,
    ).toBe('gone: elvaria unit');
  });
});
