// The breaker of the seal delegation at the terminal (PS-08g, K11): `territory delegation` prints the kingdom's scope of
// it, whether the territory merges by itself, and whether the breaker suspended it, since which quest and why;
// `--resume` sends resume_delegation only for a suspended territory. `quest escaped` sends report_escape only for a
// quest in its base branch, once, and says what follows; the digest, the bell and the metrics word the same lines.
import path from 'node:path';

import {
  EVENT_VERSION,
  EventSchema,
  QuestIdSchema,
  SealDelegationSchema,
  TerritorySchema,
} from '@elvaria/domain';
import type { InboxCommand } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { translator } from '@elvaria/i18n';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, gitRepo, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import { lineOf } from '../run/bell.ts';
import type { TempDir } from '../../test/cli.ts';

const SHA = 'abcdef1234567890abcdef1234567890abcdef12';
const TS = '2026-11-06T06:30:00+07:00';
const NOTE = 'the rooms page lost its header';

let serial = 0;
const lineOfLog = (type: string, data: Record<string, unknown>) => {
  serial += 1;
  return EventSchema.parse({
    v: EVENT_VERSION,
    id: `01JCF8X4Z6Q3W9N2M5R7T8V${String(serial).padStart(3, '0')}`,
    ts: TS,
    type,
    actor: { kind: type === 'quest.escaped' ? 'user' : 'steward' },
    data,
  });
};

const merged = (quest: string, sealed: boolean) =>
  lineOfLog('delivery.merged', {
    quest,
    territory: 'elvaria',
    branch: `quest/${quest}`,
    head: SHA,
    pr: { number: 7, url: 'https://github.com/o/r/pull/7' },
    merge_sha: SHA,
    method: 'merge',
    sealed,
    branch_deleted: true,
  });

const suspended = lineOfLog('delegation.suspended', {
  territory: 'elvaria',
  quest: QUEST_ID,
  cause: 'base_red',
  check: 'unit',
});

describe('the breaker of the seal delegation at the terminal', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    const repo = await gitRepo(path.join(dir.root, 'repo elvaria'));
    const io = testIo();
    if ((await run(io, 'territory', 'add', repo, '--id', 'elvaria', '--kingdom', kingdom)) !== 0)
      throw new Error(printed(io));
  });
  afterEach(() => dir.remove());

  const cli = async (...args: string[]) => {
    const io = testIo();
    const code = await run(io, ...args, '--kingdom', kingdom, '--locale', 'en');
    return { code, text: printed(io) };
  };
  const sent = async () =>
    (await openKingdom(kingdom).inbox.read())
      .flatMap(({ command }) => (command.ok ? [command.value] : []))
      .map(({ kind, payload }: InboxCommand) => ({ kind, payload }));

  /** elvaria merges by itself, and the kingdom delegates the seal of small builds. */
  async function delegating(): Promise<void> {
    const store = openKingdom(kingdom);
    const read = await store.territories.read(TerritorySchema.shape.id.parse('elvaria'));
    if (!read.ok) throw new Error('fixture: territory');
    const vcs = { ...read.value.vcs, remote: 'https://github.com/o/r.git' };
    await store.territories.write(
      TerritorySchema.parse({ ...read.value, vcs, delivery: { mode: 'pr_merge' } }),
    );
    const settings = await store.kingdom.read();
    if (!settings.ok) throw new Error('fixture: kingdom');
    const seal = SealDelegationSchema.parse({ max_rank: 'D', kinds: ['build'], max_diff_lines: 300 });
    await store.kingdom.write({ ...settings.value, delegation: { ...settings.value.delegation, seal } });
  }

  it('prints a delegation off and not suspended, and refuses to resume it', async () => {
    const shown = await cli('territory', 'delegation', 'elvaria');
    expect(shown.code).toBe(0);
    expect(shown.text).toContain('The kingdom delegates no seal');
    expect(shown.text).toContain('Territory elvaria delivers by manual, not pr_merge');
    expect(shown.text).toContain('The delegation is not suspended on elvaria.');
    const resume = await cli('territory', 'delegation', 'elvaria', '--resume');
    expect(resume.code).toBe(1);
    expect(resume.text).toContain(
      'The delegation of the seal is not suspended on elvaria: nothing to resume.',
    );
    expect((await cli('territory', 'delegation', 'nowhere')).text).toContain('No territory nowhere.');
    expect(await sent()).toEqual([]);
  });

  it('prints the scope, the suspension and why, what to read first; --resume sends the command', async () => {
    await delegating();
    await openEventLog(kingdom).append([suspended]);
    const shown = await cli('territory', 'delegation', 'elvaria');
    expect(shown.text).toContain(
      "The kingdom's delegation of the seal: kinds build, rank up to D, at most 300 lines changed.",
    );
    expect(shown.text).toContain('Territory elvaria merges by itself (delivery mode pr_merge)');
    expect(shown.text).toContain(`Suspended on elvaria since ${TS}, by quest ${QUEST_ID}.`);
    expect(shown.text).toContain(
      'Why: check unit of the default branch turned red with this quest merged without the seal',
    );
    expect(shown.text).toContain(`Before resuming, read: elvaria quest show ${QUEST_ID}`);
    const digest = await cli('digest');
    expect(digest.text).toContain(`The delegation of the seal on territory elvaria is suspended since ${TS}`);
    expect(digest.text).toContain('`elvaria territory delegation elvaria --resume`');

    const resume = await cli('territory', 'delegation', 'elvaria', '--resume');
    expect(resume.code).toBe(0);
    expect(resume.text).toContain('Sent: the Steward resumes the delegation of the seal on elvaria');
    expect(await sent()).toEqual([{ kind: 'resume_delegation', payload: { territory: 'elvaria' } }]);
    await openEventLog(kingdom).append([lineOfLog('delegation.resumed', { territory: 'elvaria' })]);
    expect((await cli('territory', 'delegation', 'elvaria')).text).toContain('is not suspended on elvaria');
  });

  it('`quest escaped` refuses a quest not merged or reported already, and says what the report does', async () => {
    await plantQuests(
      kingdom,
      questFixture('done', QUEST_ID, { territory: 'elvaria' }),
      questFixture('done', OTHER_QUEST_ID, { territory: 'elvaria', seal_required: true }),
    );
    const early = await cli('quest', 'escaped', QUEST_ID);
    expect(early.code).toBe(1);
    expect(early.text).toContain(`Quest ${QUEST_ID} is not in its base branch yet`);

    await openEventLog(kingdom).append([merged(QUEST_ID, false), merged(OTHER_QUEST_ID, true)]);
    const spared = await cli('quest', 'escaped', QUEST_ID, '--note', NOTE);
    expect(spared.code).toBe(0);
    expect(spared.text).toContain('the delegation of the seal on elvaria stops until');
    const sealed = await cli('quest', 'escaped', OTHER_QUEST_ID);
    expect(sealed.text).toContain('The quest had the seal: only the metrics count it.');
    expect(await sent()).toEqual([
      { kind: 'report_escape', payload: { quest: QUEST_ID, note: NOTE } },
      { kind: 'report_escape', payload: { quest: OTHER_QUEST_ID } },
    ]);

    const report = { quest: QUEST_ID, territory: 'elvaria', delegated: true, note: NOTE };
    await openEventLog(kingdom).append([lineOfLog('quest.escaped', report)]);
    const again = await cli('quest', 'escaped', QUEST_ID);
    expect(again.code).toBe(1);
    expect(again.text).toContain(`An escaped defect is already reported for quest ${QUEST_ID}.`);
    const metrics = (await cli('metrics')).text;
    expect(metrics).toContain(
      'Escaped defects: 0 (owner returns or late machine verdicts, including 0 late), 1 reported after a merge.',
    );
    expect(metrics).toContain(NOTE);
  });

  it('rings once in the owner’s language, with why', () => {
    const quest = QuestIdSchema.parse(QUEST_ID);
    const territory = TerritorySchema.shape.id.parse('elvaria');
    const notice = {
      kind: 'delegation_suspended',
      territory,
      quest,
      cause: 'base_red',
      check: 'unit',
    } as const;
    expect(lineOf(translator('en'), notice)).toBe(
      'The delegation of the seal on elvaria is suspended: check unit of the default branch turned red with this ' +
        `quest merged without the seal since its last green patrol (quest ${QUEST_ID}). New quests there wait for ` +
        'the seal; read what escaped, then: elvaria territory delegation elvaria --resume',
    );
    const reported = { ...notice, cause: 'escape_reported', note: NOTE } as const;
    expect(lineOf(translator('vi'), reported)).toContain(
      `Ủy quyền dấu của elvaria đã ngừng: chủ nhân báo một lỗi lọt theo quest này, quest được merge không qua dấu (ghi chú: ${NOTE})`,
    );
  });
});
