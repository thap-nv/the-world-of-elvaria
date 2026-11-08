import { describe, expect, it } from 'vitest';

import { BRANN, ELLA, LEVEL, SCRIPT, SESSION, THORN, at, questIn, walk } from './__fixtures__/quests.ts';
import { transition } from './transition.ts';
import type { CharacterId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';

// The fixture quest is rank D: level 3 takes it as a matter of course, level 2 (ceiling E) stretches to it.
const claim = (quest: Quest, level: number, assignee: CharacterId = THORN) =>
  transition(quest, { type: 'claim', at: at(40), assignee, level }, 'steward');
const reassign = (quest: Quest, level: number, assignee: CharacterId = ELLA) =>
  transition(quest, { type: 'reassign', at: at(40), assignee, level }, 'user');

describe('taking a quest above the level', () => {
  it('leaves the seal as it was when the rank is within the ceiling', () => {
    expect(claim(questIn('open'), LEVEL)).toMatchObject({ ok: true, value: { seal_required: false } });
    expect(claim(questIn('open'), 10)).toMatchObject({ ok: true, value: { seal_required: false } });
  });

  it('makes the quest wait for the royal seal when the Steward stretches a character to it', () => {
    expect(claim(questIn('open'), 2)).toMatchObject({
      ok: true,
      value: { status: 'claimed', assignee: THORN, seal_required: true },
    });
  });

  it('never lowers a seal the quest already needs', () => {
    const sealed = questIn('open', { ...SESSION, seal_required: true });
    expect(claim(sealed, 10)).toMatchObject({ ok: true, value: { seal_required: true } });
  });

  it('applies on every reassign, out of a pause, a return or the infirmary', () => {
    for (const status of ['paused_mana', 'returned', 'infirmary'] as const) {
      expect(reassign(questIn(status), 1)).toMatchObject({
        ok: true,
        value: { assignee: ELLA, seal_required: true },
      });
      expect(reassign(questIn(status), LEVEL)).toMatchObject({ ok: true, value: { seal_required: false } });
    }
  });

  it('sends a passing verdict to the owner instead of straight to done', () => {
    const taken = claim(questIn('open'), 1);
    if (!taken.ok) throw new Error(taken.error.code);
    expect(walk(taken.value, ['start', 'submit', 'verdict_pass'])).toMatchObject({
      status: 'awaiting_seal',
      seal_required: true,
    });
  });
});

describe('the owner naming a character for an open quest', () => {
  it('claims the quest for that character at once, whatever its level', () => {
    expect(reassign(questIn('open'), 1, BRANN)).toMatchObject({
      ok: true,
      value: { status: 'claimed', assignee: BRANN, seal_required: true, updated_at: at(40) },
    });
  });

  it('is the owner’s alone, and only for a session-tier quest', () => {
    const open = questIn('open');
    const byTheSteward = transition(
      open,
      { type: 'reassign', at: at(40), assignee: ELLA, level: 3 },
      'steward',
    );
    expect(byTheSteward).toMatchObject({
      ok: false,
      error: { code: 'actor_not_allowed', allowed: ['user'] },
    });
    expect(reassign(questIn('open', SCRIPT), 10)).toMatchObject({
      ok: false,
      error: { code: 'guard_failed', guards: ['session'] },
    });
  });
});

describe('a quest paused for mana changes hands (P1-22)', () => {
  it('lets go of the sleeper the owner suspends: open again for anyone, the run still paused', () => {
    expect(transition(questIn('paused_mana'), { type: 'suspend', at: at(40) }, 'user')).toMatchObject({
      ok: true,
      value: { status: 'open', assignee: null, attempts: 1, attempt_log: [{ outcome: 'paused' }] },
    });
  });

  it('lets the Steward reassign it once it slept too long, as the owner may', () => {
    const event = { type: 'reassign', at: at(40), assignee: ELLA, level: LEVEL } as const;
    expect(transition(questIn('paused_mana'), event, 'steward')).toMatchObject({
      ok: true,
      value: { status: 'claimed', assignee: ELLA },
    });
  });
});
