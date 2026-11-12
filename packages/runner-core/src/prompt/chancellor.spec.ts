import { TribeIdSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { DECREE, REGISTRY, SABLE, TERRITORY, THORN, classPromptOf } from '../__fixtures__/world.ts';
import { buildChancellorPrompt } from './chancellor.ts';
import { loadPromptTemplates } from './templates.ts';
import type { ChancellorContext } from './chancellor.ts';

const templates = await loadPromptTemplates();

const context: ChancellorContext = {
  utterance: '  Kiểm tra link trong docs rồi viết lại README cho rõ phần cài đặt.  ',
  locale: 'vi',
  decree: null,
  class_prompt: classPromptOf('chancellor'),
  territories: [TERRITORY],
  registry: REGISTRY,
  roster: [THORN, SABLE],
  mana: [
    {
      tribe: TribeIdSchema.parse('claude'),
      pool: 'claude',
      asleep: false,
      resets_at: null,
      readings: [
        {
          window: 'five_hour',
          used_pct: 42,
          resets_at: null,
          source: 'rate_limits',
          observed_at: '2026-11-07T09:00:00+07:00',
        },
      ],
    },
    {
      tribe: TribeIdSchema.parse('gemini'),
      pool: 'gemini_models',
      asleep: true,
      resets_at: null,
      readings: [],
    },
  ],
  context_budget_tokens: 120_000,
};

describe('buildChancellorPrompt (§10 question 3)', () => {
  it('snapshot', async () => {
    const { system, user } = buildChancellorPrompt(context, templates);
    await expect(`=== system ===\n${system}\n\n=== user ===\n${user}\n`).toMatchFileSnapshot(
      '__snapshots__/chancellor.txt',
    );
  });

  it('opens with the royal decree when there is one', async () => {
    const plain = buildChancellorPrompt(context, templates);
    const decreed = buildChancellorPrompt({ ...context, decree: DECREE }, templates);
    expect(decreed.user).toBe(plain.user);
    expect(decreed.system.endsWith(plain.system)).toBe(true);
    await expect(decreed.system).toMatchFileSnapshot('__snapshots__/chancellor.decree.txt');
  });

  it('says so when the kingdom is still empty', () => {
    const { user } = buildChancellorPrompt(
      { ...context, territories: [], roster: [], mana: [], registry: { ...REGISTRY, scripts: [] } },
      templates,
    );
    expect(user).toContain('No territory is attached yet.');
    expect(user).toContain('No character yet.');
    expect(user).toContain('No reading yet.');
    expect(user).toContain('# Script catalog\n\nNone.');
  });

  it("names a territory's shared paths, which no draft puts in its scope (PS-05)", () => {
    const shared = { glob: 'packages/i18n/src/glossary.json', merge: 'union' as const };
    const { user } = buildChancellorPrompt(
      { ...context, territories: [{ ...TERRITORY, shared_paths: [shared] }] },
      templates,
    );
    expect(user).toContain('; shared paths: `packages/i18n/src/glossary.json`');
    expect(buildChancellorPrompt(context, templates).user).not.toContain('shared paths');
  });
});
