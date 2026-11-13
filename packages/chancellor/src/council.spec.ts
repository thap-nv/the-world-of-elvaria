// The council in the Chancellor's reply (PS-06, ADR 0028): what the screen sends back, the one second try, the brief
// in the plan quest's description and its seal, the kind's seal when a draft says none.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { BriefSchema, QuestDraftFileSchema, QuestDraftSchema, QuestIdSchema } from '@elvaria/domain';
import type { QuestDraft } from '@elvaria/domain';
import { loadPromptTemplates } from '@elvaria/runner-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CHANCELLOR_CLASS_ENTRY, CONTEXT, NATIVE, reply } from './__fixtures__/kingdom.ts';
import { ANSWER_TOKENS, scriptedRunner } from './__fixtures__/runner.ts';
import { templated } from './__fixtures__/template.ts';
import { draftCommands } from './commands.ts';
import { AGAIN_DIR, draftQuests } from './draft-quests.ts';
import { screenDrafts } from './screen.ts';
import type { Answer } from './__fixtures__/runner.ts';

const templates = await loadPromptTemplates();
const COUNCIL = reply('council') as { drafts: unknown[]; brief: unknown };

/** A rank D knight's draft on dc1-se-team in the template, scoped to `scope`, changed by `fields`. */
const draft = (ref: string, scope: readonly string[], fields: Record<string, unknown> = {}): QuestDraft =>
  QuestDraftSchema.parse({
    ref,
    title: `Quest ${ref}`,
    description: templated(`Work ${ref}.`),
    kind: 'build',
    rank: 'D',
    territory: 'dc1-se-team',
    tier: 'session',
    class_required: 'knight',
    tags: ['backend'],
    ...(scope.length === 0 ? {} : { scope_paths: scope }),
    depends_on_refs: [],
    estimate: { tokens: 200_000, minutes: 30, context: 80_000 },
    secrets_required: [],
    ...fields,
  });

const reasons = (drafts: readonly QuestDraft[], brief?: unknown) =>
  screenDrafts(
    drafts,
    CONTEXT,
    brief === undefined ? undefined : QuestDraftFileSchema.parse({ version: 1, drafts, brief }).brief,
  ).dropped.map(({ ref, reason }) => `${ref} ${reason}`);

describe('screenDrafts and the council (PS-06)', () => {
  it('lets small work through: one tag, below rank B', () => {
    expect(reasons([draft('d1', ['apps/api/**'])])).toEqual([]);
    expect(reasons([draft('d1', ['apps/api/**']), draft('d2', ['apps/web/**'])])).toEqual([]);
  });

  it('returns work of the council drafted as quests to do: two tags over two areas, or rank B', () => {
    const spread = [draft('d1', ['apps/api/**']), draft('d2', ['apps/web/**'], { tags: ['frontend'] })];
    expect(reasons(spread)).toEqual(['d1 needs_council', 'd2 needs_council']);
    expect(reasons([draft('d1', [], { rank: 'B' })])).toEqual(['d1 needs_council']);
    // Without a council (the triage of memos), nothing is held to it.
    const { council: _, ...triage } = CONTEXT;
    expect(screenDrafts(spread, triage).dropped).toEqual([]);
  });

  it('keeps a plan of that size only with the brief that names it', () => {
    const [plan] = QuestDraftFileSchema.parse(COUNCIL).drafts;
    if (plan === undefined) throw new Error('fixture: no plan');
    expect(reasons([plan])).toEqual(['d1 needs_brief']);
    expect(reasons([plan], COUNCIL.brief)).toEqual([]);
    const child = draft('d2', ['apps/api/**'], { parent_ref: 'd1' });
    expect(reasons([plan, child])).toEqual(['d1 needs_brief', 'd2 needs_dropped_draft']);
  });

  it('returns a brief that names a draft delivering no sub-quests', () => {
    const named = { ...(COUNCIL.brief as object), plan_ref: 'd1' };
    expect(reasons([draft('d1', ['apps/api/**'])], named)).toEqual(['d1 brief_not_on_plan']);
  });

  it('holds a session draft to the quest template: steps up to rank D, none asked from rank C', () => {
    const noSteps = templated('x').replace(/## Steps[^#]*/, '');
    expect(reasons([draft('d1', ['a/**'], { description: noSteps })])).toEqual(['d1 template']);
    expect(reasons([draft('d1', ['a/**'], { description: noSteps, rank: 'C' })])).toEqual([]);
    const [dropped] = screenDrafts([draft('d1', ['a/**'], { description: 'Do it.' })], CONTEXT).dropped;
    expect(dropped?.detail).toContain('no "## Goal" section, or it is empty; no "## Steps" section');
  });

  it('splits a job by its peak context, its tokens standing in when it gives none (ADR 0017)', () => {
    expect(
      reasons([draft('d1', ['a/**'], { estimate: { tokens: 400_000, minutes: 40, context: 100_000 } })]),
    ).toEqual([]);
    expect(
      reasons([draft('d1', ['a/**'], { estimate: { tokens: 400_000, minutes: 40, context: 150_000 } })]),
    ).toEqual(['d1 over_context_budget']);
    expect(reasons([draft('d1', ['a/**'], { estimate: { tokens: 400_000, minutes: 40 } })])).toEqual([
      'd1 over_context_budget',
    ]);
  });
});

describe('draftQuests sends a returned reply back once (PS-06)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'elvaria council ạ '));
  });
  afterEach(() => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

  function speak(answers: readonly Answer[]) {
    const runner = scriptedRunner(answers);
    const session = {
      runner,
      choice: NATIVE,
      characterClass: CHANCELLOR_CLASS_ENTRY,
      templates,
      run_dir: path.join(dir, 'chancellor-1'),
      env: {},
    };
    return { runner, drafted: draftQuests(CONTEXT, session) };
  }

  const leaves = {
    version: 1,
    drafts: [draft('d1', ['apps/api/**']), draft('d2', ['apps/web/**'], { tags: ['frontend'] })],
  };

  it('asks again with its first reply and why, in a folder of its own, and keeps the second reply', async () => {
    const { runner, drafted } = speak([{ structured: leaves }, { structured: COUNCIL }]);
    const result = await drafted;
    expect(result.ok && result.value).toMatchObject({
      kept: [{ ref: 'd1', kind: 'plan' }],
      dropped: [],
      brief: { plan_ref: 'd1' },
      session_ids: ['chancellor-1', 'chancellor-2'],
      tokens: 2 * ANSWER_TOKENS,
    });
    const [first, second] = runner.requests;
    expect(first?.prompt.user).not.toContain('# Your first reply came back');
    expect(second?.run_dir).toBe(path.join(dir, 'chancellor-1', AGAIN_DIR));
    expect(second?.prompt.user).toContain('# Your first reply came back');
    expect(second?.prompt.user).toContain(
      '- d1 «Quest d1»: the work is large enough for the council (a session draft of rank B or above, or 2 tags over as many areas)',
    );
  });

  it('asks only once more: what still misses is dropped, and a failed second try leaves the first reply', async () => {
    const twice = await speak([{ structured: leaves }, { structured: leaves }]).drafted;
    expect(twice.ok && twice.value.dropped.map(({ reason }) => reason)).toEqual([
      'needs_council',
      'needs_council',
    ]);
    expect(twice.ok && twice.value.session_ids).toHaveLength(2);
    const limited = await speak([{ structured: leaves }, { rate_limited: true }]).drafted;
    expect(limited.ok && limited.value).toMatchObject({
      kept: [],
      session_ids: ['chancellor-1'],
      tokens: ANSWER_TOKENS,
    });
  });

  it('keeps no brief whose plan was dropped', async () => {
    const broken = { ...COUNCIL, drafts: [{ ...(COUNCIL.drafts[0] as object), tags: ['blockchain'] }] };
    const result = await speak([{ structured: broken }]).drafted;
    expect(result.ok && result.value.dropped.map(({ reason }) => reason)).toEqual(['unknown_tag']);
    expect(result.ok && 'brief' in result.value).toBe(false);
  });
});

describe('draftCommands with a brief (PS-06)', () => {
  const header = () => ({
    version: 1 as const,
    id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0A',
    ts: '2026-11-13T09:00:00+07:00',
    source: 'cli' as const,
  });
  const source = { header, questIdOf: () => QuestIdSchema.parse('q_20261113_aaaaaa') };

  it('opens the plan quest with the brief and has it wait for the seal; the quest keeps tokens and minutes', () => {
    const file = QuestDraftFileSchema.parse(COUNCIL);
    const [command] = draftCommands(file.drafts, source, [], file.brief);
    const payload = command?.command.payload;
    expect(payload?.seal_required).toBe(true);
    expect(payload?.estimate).toEqual({ tokens: 300_000, minutes: 40 });
    expect(payload?.description).toMatch(/^## Brief\n\n### Goal\n\nChủ nhân đọc lý do/);
    expect(payload?.description).toContain('- Giữ chuỗi cũ trong event log? Recommended: Không: log mang mã');
    expect(payload?.description).toContain('\n\n## Goal\n\nLý do của trạm xá');
    const empty = BriefSchema.parse({ ...file.brief, out_of_scope: [], assumptions: [], questions: [] });
    expect(draftCommands(file.drafts, source, [], empty)[0]?.command.payload.description).toContain(
      '### Assumptions\n\n- None.',
    );
  });

  it("leaves seal_required out of a draft that says none: the Steward takes its kind's seal_default", () => {
    const [command] = draftCommands([draft('d1', ['a/**'])], source);
    expect(command?.command.payload).not.toHaveProperty('seal_required');
    const [sealed] = draftCommands([draft('d1', ['a/**'], { seal_required: false })], source);
    expect(sealed?.command.payload.seal_required).toBe(false);
  });
});
