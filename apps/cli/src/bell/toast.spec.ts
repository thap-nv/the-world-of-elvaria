// The toast of each notice that rings on the desktop (P2-03, W13): a heading and one line, masked, never the question.
import { QuestIdSchema, TerritoryIdSchema, TribeIdSchema } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { DESKTOP_RINGS, toastOf } from './toast.ts';
import type { Notice } from '@elvaria/steward';

const en = translator('en');
const vi = translator('vi');
const quest = { id: QuestIdSchema.parse('q_20261127_t0ast1'), title: 'Chuông máy tính', rank: 'C' as const };
const territory = TerritoryIdSchema.parse('elvaria');
const gauge = { tribe: TribeIdSchema.parse('claude'), pool: 'claude_models' };
// Put together at run time, so no secret-shaped literal sits in the repo (eventlog's fixtures do the same).
const JWT = [
  ['ey', 'JhbGciOiJIUzI1NiJ9'].join(''),
  ['ey', 'JzdWIiOiJ0aG9ybiJ9'].join(''),
  'ZmFrZS1zaWduYXR1cmU',
].join('.');

describe('the toast of a notice', () => {
  it('names the quest that waits for the seal, went to the infirmary or asks, and never says the question', () => {
    expect(toastOf(en, { kind: 'awaiting_seal', quest })).toEqual({
      title: 'Elvaria · Waiting for your seal',
      message: 'q_20261127_t0ast1 «Chuông máy tính»',
    });
    const asks = toastOf(en, { kind: 'question', quest, question: 'Push to C:\\secret\\path?' });
    expect(asks).toEqual({
      title: 'Elvaria · A character asks you',
      message: 'q_20261127_t0ast1 «Chuông máy tính»',
    });
    const reason = {
      code: 'breaker:commit_errors',
      params: { lines: 'lint: error x', errors: 1, total_lines: 9, log: '.runs/q-1/pre-commit.log' },
    } as const;
    const infirmary: Notice = { kind: 'infirmary', quest, reason, trip: 'commit' };
    expect(toastOf(vi, infirmary)).toEqual({
      title: 'Elvaria · Một nhiệm vụ vào trạm quân y',
      message: 'q_20261127_t0ast1 «Chuông máy tính»',
    });
  });

  it('names the pool of a whole pool out of mana, and leaves one model out of mana to the terminal', () => {
    expect(toastOf(en, { kind: 'mana_asleep', ...gauge })).toEqual({
      title: 'Elvaria · Out of mana',
      message: 'Pool claude_models of tribe claude',
    });
    expect(toastOf(en, { kind: 'mana_asleep', ...gauge, model: 'claude-opus-5-5' })).toBeUndefined();
  });

  it('names the territory of an alarm, without its checks or the quest blamed', () => {
    const red = toastOf(en, {
      kind: 'base_red',
      territory,
      checks: [{ check: 'test', error_line: 'at /src/x.ts' }],
    });
    expect(red).toEqual({ title: 'Elvaria · A default branch turned red', message: 'Territory elvaria' });
    const suspended = toastOf(vi, {
      kind: 'delegation_suspended',
      territory,
      quest: quest.id,
      cause: 'escape_reported',
    });
    expect(suspended).toEqual({ title: 'Elvaria · Ủy quyền dấu đã ngừng', message: 'Lãnh thổ elvaria' });
  });

  it('says every other notice on the terminal only', () => {
    expect(toastOf(en, { kind: 'mana_awake', ...gauge })).toBeUndefined();
    expect(toastOf(en, { kind: 'subquests_refused', quest, reason: 'none' })).toBeUndefined();
    const desktop = Object.entries(DESKTOP_RINGS).filter(([, rings]) => rings);
    expect(desktop.map(([kind]) => kind).sort()).toEqual(
      ['awaiting_seal', 'base_red', 'delegation_suspended', 'infirmary', 'mana_asleep', 'question'].sort(),
    );
  });

  it('keeps quotes and line breaks of a title as they are, and masks a secret in it', () => {
    const odd = { ...quest, title: `Say "hi" & 'bye'\nthen $(rm -rf ~) ${JWT}` };
    const { message } = toastOf(en, { kind: 'awaiting_seal', quest: odd }) ?? { message: '' };
    expect(message).toBe(`q_20261127_t0ast1 «Say "hi" & 'bye'\nthen $(rm -rf ~) [redacted]»`);
  });
});
