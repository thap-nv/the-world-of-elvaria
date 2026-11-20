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
  it('includes old specs, locale keys and generated outputs in the drafting instructions', () => {
    const { system } = buildChancellorPrompt(context, templates);
    expect(system).toContain('include existing specs that assert the old behavior');
    expect(system).toContain('allow those assertions to change with the new behavior');
    expect(system).toContain('new keys in both `packages/i18n/src/locales/vi.json` and `en.json`');
    expect(system).toContain(
      'regenerate them only with `pnpm docs:gen` or `pnpm schemas`, never edit them by hand',
    );
    expect(system).toContain('Keep `scope_paths`, Files and Steps consistent');
  });

  it('drafts small work directly while preserving the council requirement', () => {
    const { system } = buildChancellorPrompt(context, templates);
    expect(system).toContain('Small work that fits one session gets one direct quest');
    expect(system).toContain('no `plan` quest, no child quests and no `parent_ref`');
    expect(system).toContain('especially when the owner explicitly asks for a direct quest');
    expect(system).toContain(
      'This applies only below the council thresholds; the council rules still take precedence.',
    );
    expect(system).toContain('of rank B or above, or when it carries 2 tags or more');
  });

  it('requires new journal lines instead of changing old entries', () => {
    const { system } = buildChancellorPrompt(context, templates);
    expect(system).toContain('§11 (`docs/implementation-plan/11-*.md`) is append-only');
    expect(system).toContain('never instruct a character to edit or delete an existing §11 line');
  });

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

  // fix/council-run-gaps (a), PS-11 (l): a quest tagged visual waits in review while no tribe reads images.
  it('lists the tag that asks for eyes only when a tribe that works reads images', () => {
    expect(buildChancellorPrompt(context, templates).user).not.toContain('- `visual`');
    expect(buildChancellorPrompt({ ...context, vision: true }, templates).user).toContain('- `visual`: ');
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
