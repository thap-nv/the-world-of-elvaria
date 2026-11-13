// The last trial of each git territory (PS-25): `doctor` reminds of a territory never tried, one whose trial failed,
// and one whose commands.setup or checks changed since it was tried; `elvaria territory check <id>` tries it. All
// warnings: a territory without a trial still runs quests, as it did before PS-25, and none is an error of the
// kingdom's files.
import { SCORECARD_ITEMS } from '@elvaria/domain';
import type { Territory } from '@elvaria/domain';

import { readTrialRecord, trialFileOf, triedCommandsOf } from '../territory/trial-record.ts';
import { finding } from './finding.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

/** `2026-11-13T13:05:00+07:00` → `2026-11-13 13:05`: the kingdom's own time, as the record holds it. */
const MINUTE_CHARS = 16;
const shownAt = (at: string): string => at.slice(0, MINUTE_CHARS).replace('T', ' ');

const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index]);

async function trialFinding(ctx: KingdomContext, territory: Territory): Promise<Finding> {
  const { t } = ctx;
  const { id } = territory;
  const read = await readTrialRecord(ctx.store.root, id);
  if (read.kind === 'none') return finding('warn', t('cli.doctor.trial_none', { id }));
  if (read.kind === 'unreadable')
    return finding('warn', t('cli.doctor.trial_unreadable', { id, file: trialFileOf(id) }));
  const { record } = read;
  const at = shownAt(record.tried_at);
  if (record.items.trial === 'fail') return finding('warn', t('cli.doctor.trial_failed', { id, at }));
  if (!sameLines(record.commands, triedCommandsOf(territory)))
    return finding('warn', t('cli.doctor.trial_stale', { id, at }));
  const count = SCORECARD_ITEMS.filter((item) => record.items[item] === 'fail').length;
  return count === 0
    ? finding('ok', t('cli.doctor.trial_passed', { id, at }))
    : finding('ok', t('cli.doctor.trial_passed_gaps', { id, at, count }));
}

/** One line per git territory; a folder territory has no branch to try. */
export async function checkTerritoryTrials(ctx: KingdomContext): Promise<Finding[]> {
  const { items } = await ctx.store.territories.list();
  return Promise.all(items.filter(({ vcs }) => vcs.type === 'git').map((item) => trialFinding(ctx, item)));
}
