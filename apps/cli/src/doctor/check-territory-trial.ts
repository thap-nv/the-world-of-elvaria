// The last trial of each git territory (PS-25): `doctor` reminds of a territory never tried, one whose trial failed,
// and one whose commands.setup or checks changed since it was tried; `elvaria territory check <id>` tries it. All
// warnings: a territory without a trial still runs quests, as it did before PS-25, and none is an error of the
// kingdom's files. Only the trial and each check's time come from the trial's record; the other items of the card
// read the kingdom's files, the ledger and git alone, so they are read again on every run (fix/kingdom-upkeep): a
// gazetteer or a list fixed by hand showed as failing until the next trial, a quarter of an hour of Docker.
import { TRIAL_ITEMS, itemsWithoutTrialOf, metricsOf } from '@elvaria/domain';
import type { Metrics, ScorecardItem, Territory } from '@elvaria/domain';
import { commitsSinceStamp, gazetteerStampOf } from '@elvaria/runner-core';
import { inKingdom, kingdomLayout, readTextFile } from '@elvaria/store';

import { readMetricsSource } from '../metrics/read.ts';
import { processHostOf } from '../run/plots.ts';
import { MARK, itemKeyOf, reasonKeyOf } from '../territory/check-view.ts';
import { readTrialRecord, trialFileOf, triedCommandsOf } from '../territory/trial-record.ts';
import { finding } from './finding.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { TrialRecord } from '../territory/trial-record.ts';
import type { Finding } from './finding.ts';

/** `2026-11-13T13:05:00+07:00` → `2026-11-13 13:05`: the kingdom's own time, as the record holds it. */
const MINUTE_CHARS = 16;
const shownAt = (at: string): string => at.slice(0, MINUTE_CHARS).replace('T', ' ');
/** A reason under its item, deeper than the item's own detail line, as on the card. */
const REASON_INDENT = '  ';

const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index]);

/** The ledger, read once per doctor run and only when a territory passed its trial. */
type LedgerOnce = () => Promise<Metrics>;

/** The items no trial is needed for, as they stand now: the gazetteer's commits counted without a fetch. */
async function itemsNowOf(ctx: KingdomContext, territory: Territory, ledger: LedgerOnce) {
  const text = (await readTextFile(inKingdom(ctx.store.root, kingdomLayout.gazetteer(territory.id)))) ?? null;
  const stamp = text === null ? undefined : gazetteerStampOf(text);
  const commits =
    stamp === undefined
      ? undefined
      : await commitsSinceStamp({ territory, host: processHostOf(ctx.io), stamp });
  const gazetteer = {
    text,
    ...(stamp === undefined ? {} : { stamp }),
    ...(commits === undefined ? {} : { commits_since: commits }),
  };
  return itemsWithoutTrialOf({ territory, metrics: await ledger(), gazetteer });
}

/** `✓ Each check's time, ✗ Gazetteer`: each item with its mark. */
const listOf = (ctx: KingdomContext, items: readonly Omit<ScorecardItem, 'reasons'>[]): string =>
  items.map((item) => `${MARK[item.status]} ${ctx.t(itemKeyOf(item))}`).join(', ');

/** Why each item read now fails, under its name: the card's lines, without waiting for a trial. */
const whyLines = (ctx: KingdomContext, failing: readonly ScorecardItem[]): string[] =>
  failing.flatMap((item) => [
    `${MARK.fail} ${ctx.t(itemKeyOf(item))}:`,
    ...item.reasons.map(({ code, params }) => `${REASON_INDENT}${ctx.t(reasonKeyOf(code), params)}`),
  ]);

async function passedFinding(
  ctx: KingdomContext,
  territory: Territory,
  record: TrialRecord,
  ledger: LedgerOnce,
): Promise<Finding> {
  const { t } = ctx;
  const params = { id: territory.id, at: shownAt(record.tried_at) };
  const tried = TRIAL_ITEMS.filter((id) => id !== 'trial').map((id) => ({ id, status: record.items[id] }));
  const now = await itemsNowOf(ctx, territory, ledger);
  const triedFailing = tried.filter(({ status }) => status === 'fail');
  const nowFailing = now.filter(({ status }) => status === 'fail');
  const count = triedFailing.length + nowFailing.length;
  const details = [
    t('cli.doctor.trial_from', { items: listOf(ctx, tried) }),
    t('cli.doctor.trial_now', { items: listOf(ctx, now) }),
    ...whyLines(ctx, nowFailing),
    ...(triedFailing.length === 0 ? [] : [t('cli.doctor.trial_rerun', { id: territory.id })]),
  ];
  return count === 0
    ? finding('ok', t('cli.doctor.trial_passed', params), details)
    : finding('ok', t('cli.doctor.trial_passed_gaps', { ...params, count }), details);
}

async function trialFinding(ctx: KingdomContext, territory: Territory, ledger: LedgerOnce): Promise<Finding> {
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
  return passedFinding(ctx, territory, record, ledger);
}

/** One line per git territory; a folder territory has no branch to try. */
export async function checkTerritoryTrials(ctx: KingdomContext): Promise<Finding[]> {
  const { items } = await ctx.store.territories.list();
  let read: Promise<Metrics> | undefined;
  const ledger: LedgerOnce = () =>
    (read ??= readMetricsSource(ctx.store.root).then(({ input }) => metricsOf(input)));
  return Promise.all(
    items.filter(({ vcs }) => vcs.type === 'git').map((item) => trialFinding(ctx, item, ledger)),
  );
}
