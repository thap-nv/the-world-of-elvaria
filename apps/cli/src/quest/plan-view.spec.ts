import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir } from '../../test/cli.ts';
import type { Quest } from '@elvaria/domain';

const BRIEF = [
  '## Brief',
  '',
  '### Goal',
  '',
  'Export the orders as CSV.',
  '',
  '### Questions, with the answers the owner accepted by confirming this quest',
  '',
  '- CSV or JSON? Recommended: CSV',
].join('\n');

const DESCRIPTION = `${BRIEF}\n\n## Goal\n\nPlan the export of the orders.`;

const PLAN_FILE = [
  '# The orders export',
  '',
  '## Summary',
  '',
  'Two parts: the endpoint, then its page. About 400k tokens.',
  '',
  '## Survey',
  '',
  'apps/api/src/reports/.',
].join('\n');

const WORK = `quests/${QUEST_ID}/work`;

/** A plan quest of the mage, its plot a folder of the kingdom. */
const planQuest = (
  status: 'awaiting_seal' | 'working',
  plot: Record<string, unknown> = { type: 'folder', path: WORK },
) =>
  questFixture(status, QUEST_ID, {
    kind: 'plan',
    class_required: 'mage',
    description: DESCRIPTION,
    deliverable: { type: 'subquests' },
    plot,
    assignee: 'merle',
    attempts: 1,
    ...(status === 'awaiting_seal' ? { seal_required: true } : {}),
  });

// A plan quest in `quest show` (PS-06b): its brief apart from the rest, and its plan's summary while the seal waits.
describe('elvaria quest show of a plan quest', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const show = async (id: string, locale: 'vi' | 'en' = 'en'): Promise<string> => {
    const io = testIo();
    expect(await run(io, 'quest', 'show', id, '--kingdom', kingdom, '--locale', locale)).toBe(0);
    return io.printed.out.join('\n');
  };

  const leave = async (files: Readonly<Record<string, string>>): Promise<void> => {
    for (const [file, text] of Object.entries(files)) {
      const target = path.join(kingdom, ...WORK.split('/'), ...file.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, text, 'utf8');
    }
  };

  it('prints the brief, then the summary of the plan file, then the rest of the description', async () => {
    await plantQuests(kingdom, planQuest('awaiting_seal'));
    await leave({ 'subquests.json': '{}', 'plans/orders.md': PLAN_FILE, 'plans/notes.md': '# Notes' });
    const text = await show(QUEST_ID);
    const order = [
      'Brief (confirming the quest accepted its recommended answers)',
      '### Goal\n\nExport the orders as CSV.',
      'Plan summary (plans/orders.md): the page you seal the plan on',
      'Two parts: the endpoint, then its page. About 400k tokens.',
      'Description\n## Goal\n\nPlan the export of the orders.',
    ].map((part) => text.indexOf(part));
    expect(order.every((at, index) => at > (order[index - 1] ?? -1))).toBe(true);
    expect(text).not.toContain('## Survey');
    expect(await show(QUEST_ID, 'vi')).toContain('Tóm tắt kế hoạch (plans/orders.md)');
  });

  it('says when the plot holds no plan file with a summary, or there is no plot', async () => {
    const plotless: Quest = {
      ...planQuest('awaiting_seal', { type: 'none' }),
      id: OTHER_QUEST_ID as Quest['id'],
    };
    await plantQuests(kingdom, planQuest('awaiting_seal'), plotless);
    await leave({ 'subquests.json': '{}', 'plans/orders.md': '# Orders\n\n## Survey\n\nx' });
    const none = 'No plan file with a summary in the plot (plans/<topic>.md with "## Summary").';
    expect(await show(QUEST_ID)).toContain(none);
    expect(await show(OTHER_QUEST_ID)).toContain(none);
  });

  it('keeps the summary for the seal, and prints any other quest as before', async () => {
    await plantQuests(kingdom, planQuest('working'), questFixture('open', OTHER_QUEST_ID));
    await leave({ 'subquests.json': '{}', 'plans/orders.md': PLAN_FILE });
    const working = await show(QUEST_ID);
    expect(working).toContain('Brief (confirming');
    expect(working).not.toContain('Plan summary');
    const plain = await show(OTHER_QUEST_ID);
    expect(plain).not.toContain('Description');
    expect(plain.endsWith('\n\nGom lint, typecheck và test thành một lệnh.')).toBe(true);
  });

  it('prints the description of a plan without a brief as before, outside the seal', async () => {
    await plantQuests(kingdom, { ...planQuest('working'), description: '## Goal\n\nPlan it.' });
    const text = await show(QUEST_ID);
    expect(text).not.toContain('Description');
    expect(text.endsWith('\n\n## Goal\n\nPlan it.')).toBe(true);
  });
});
