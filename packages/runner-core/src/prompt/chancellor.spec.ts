import { CouncilSchema, TribeIdSchema } from '@elvaria/domain';
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
  council: CouncilSchema.parse({}),
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

  it("names each kind's seal and each class's tools, so no draft turns the seal off or asks a scribe for git log (PS-06)", () => {
    const { system, user } = buildChancellorPrompt(context, templates);
    expect(user).toContain('- `build`: deliverable branch; classes knight, dwarf; sealed by default');
    expect(user).toContain('- `plan`: deliverable subquests; classes mage; no seal by default');
    expect(user).toContain('- `scribe` (Scribe): reads and searches files; writes files; no shell');
    expect(user).toContain('- `chancellor` (Chancellor): no tools');
    expect(user).toMatch(
      /- `knight` \(Knight\): reads and searches files; writes files; shell: `pnpm test`, .*, and its territory's check commands/,
    );
    expect(system).toContain('`seal_required`: leave it out unless the owner said');
  });

  it("quotes the council's thresholds, the quest template and the way to size a session (PS-06)", () => {
    const council = { from_rank: 'A' as const, from_areas: 3 };
    const { system } = buildChancellorPrompt({ ...context, council }, templates);
    expect(system).toContain('of rank A or above, or when it carries 3 tags or more');
    expect(system).toContain(
      '# The quest template\n\nWrite the description of every session draft in this template',
    );
    expect(system).toContain('the text in Vietnamese');
    expect(system).toContain('Quests of rank F to D list their steps in order');
    expect(system).toContain('A job whose peak context would pass 120000 tokens does not fit one session');
    expect(system).not.toMatch(/\{\{/);
  });

  it('shows its first reply and what came back on the second try only (PS-06)', async () => {
    const plain = buildChancellorPrompt(context, templates);
    expect(plain.user).not.toContain('# Your first reply came back');
    const returned = { reply: '{"version": 1}', problems: ['d1: no "## Goal" section, or it is empty'] };
    const again = buildChancellorPrompt({ ...context, returned }, templates);
    expect(again.system).toBe(plain.system);
    expect(again.user.startsWith(plain.user)).toBe(true);
    await expect(again.user.slice(plain.user.length)).toMatchFileSnapshot(
      '__snapshots__/chancellor.returned.txt',
    );
  });
});
