// The console bell's mana lines (implementation-plan §3.5, P1-22): a gauge that warns, sleeps or wakes, a whole
// pool or the cap of one model, in the owner's language. The quest notices are in compose.spec.ts.
import { TribeIdSchema } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { lineOf } from './bell.ts';

const en = translator('en');
const vi = translator('vi');
const gemini = TribeIdSchema.parse('gemini');
const argon = { tribe: gemini, pool: 'gemini_models', model: 'argon' };
const pool = { tribe: gemini, pool: 'claude_gpt_models' };

describe('the console bell on mana', () => {
  it('warns once a gauge nears the cap, naming the cap of one model or the pool', () => {
    expect(lineOf(en, { kind: 'mana_warning', ...argon, window: 'weekly', used_pct: 89.5 })).toBe(
      'Mana running low: the argon cap of tribe gemini has used 89.5% of its weekly window. Near the cap the ' +
        'world stops taking work there; elvaria character model moves a character to another model.',
    );
    expect(lineOf(en, { kind: 'mana_warning', ...pool, window: 'five_hour', used_pct: 90 })).toContain(
      'pool claude_gpt_models of tribe gemini has used 90% of its 5-hour window',
    );
  });

  it('says a gauge ran out, until its reset when known, and came back', () => {
    expect(lineOf(en, { kind: 'mana_asleep', ...argon, resets_at: '2026-11-14T01:51:54Z' })).toBe(
      'Out of mana: the argon cap of tribe gemini, until 2026-11-14T01:51:54Z. What runs on it pauses and keeps ' +
        'its character; the Steward probes just after the reset.',
    );
    expect(lineOf(en, { kind: 'mana_asleep', ...pool })).toContain(
      'Out of mana: pool claude_gpt_models of tribe gemini.',
    );
    expect(lineOf(en, { kind: 'mana_awake', ...pool })).toBe(
      'Mana is back: pool claude_gpt_models of tribe gemini. Its paused quests go on.',
    );
  });

  it('says it in Vietnamese for a Vietnamese owner', () => {
    expect(lineOf(vi, { kind: 'mana_warning', ...argon, window: 'weekly', used_pct: 89.5 })).toBe(
      'Sắp cạn mana: trần riêng của argon, tộc gemini đã dùng 89.5% cửa sổ tuần. Gần trần, thế giới ngừng nhận ' +
        'việc ở đó; elvaria character model chuyển một nhân vật sang model khác.',
    );
    expect(lineOf(vi, { kind: 'mana_awake', ...pool })).toBe(
      'Mana đã về: pool claude_gpt_models của tộc gemini. Nhiệm vụ tạm dừng của nó làm tiếp.',
    );
  });
});
