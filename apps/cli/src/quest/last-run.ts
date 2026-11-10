// What the last run of a quest came to (P1-46: (c) of P1-44, (b) of P1-42), so the owner need not open
// verdicts/*.json or the journal: its verdicts in the order they were written (the partial ones each judge stopped
// at, then the judge's or the machine's, then the owner's), each with its notes, and the `plot.restored` lines of the
// run (P1-44). Such a line does not tell whose commands left the paths, a judge's or the checks run in the plot before
// the judge (P1-47), so the text names both. A verdict file that cannot be read is left out, like a journal.
import {
  MACHINE_VERIFIER,
  USER_VERIFIER,
  currentRun,
  isEventOf,
  ownerVerdictIdOf,
  partialVerdictIdOf,
  verdictIdOf,
  verifierSessionsOf,
} from '@elvaria/domain';
import type { Event, EventOf, Quest, Verdict } from '@elvaria/domain';
import type { MessageKey, Translate } from '@elvaria/i18n';

import { NONE } from '../listing.ts';
import type { KingdomContext } from '../kingdom-context.ts';

type RestoredLine = EventOf<'plot.restored'>;

/** How many dropped paths a line names; the journal keeps them all. */
const PATHS_SHOWN = 10;

const RESULT_LABEL: Readonly<Record<Exclude<Verdict['result'], 'partial'>, MessageKey>> = {
  pass: 'cli.quest.run.result.pass',
  fail: 'cli.quest.run.result.fail',
};

/** Run n's verdicts, oldest first: a partial one per judge who stopped part-way, then the closing one, the owner's. */
async function verdictsOf(ctx: KingdomContext, quest: Quest, n: number): Promise<Verdict[]> {
  const partials = Array.from({ length: verifierSessionsOf(quest, n) }, (_, k) =>
    partialVerdictIdOf(quest, n, k + 1),
  );
  const ids = [...partials, verdictIdOf(quest, n), ownerVerdictIdOf(quest, n)];
  const read = await Promise.all(ids.map((id) => ctx.store.verdicts.read(id)));
  return read.flatMap((verdict) => (verdict.ok ? [verdict.value] : []));
}

/** A judge by name; the machine checks (`machine`) in words. The owner's verdict has its own line. */
const whoOf = (t: Translate, verdict: Verdict): string =>
  verdict.verifier_id === MACHINE_VERIFIER ? t('cli.quest.run.who.machine') : verdict.verifier_id;

function headOf(t: Translate, verdict: Verdict): string {
  const who = whoOf(t, verdict);
  if (verdict.result === 'partial')
    return t('cli.quest.run.partial', { who, until: verdict.progress?.checked_until ?? NONE });
  const label = t(RESULT_LABEL[verdict.result]);
  const result = verdict.fail_kind === undefined ? label : `${label} (${verdict.fail_kind})`;
  return verdict.verifier_id === USER_VERIFIER
    ? t('cli.quest.run.verdict_owner', { result })
    : t('cli.quest.run.verdict', { who, result });
}

/** The notes as the judge wrote them, line for line, under a label. */
function notesLines(t: Translate, notes: string | undefined): string[] {
  const lines = (notes ?? '').trim().split(/\r?\n/u);
  if (lines[0] === '') return [];
  const [first = '', ...rest] = lines;
  return [t('cli.quest.run.notes', { notes: first }), ...rest.map((line) => `  ${line}`)];
}

function verdictLines(t: Translate, verdict: Verdict): string[] {
  const failed = verdict.checks.filter((check) => !check.pass).map((check) => check.id);
  const details = [
    ...(failed.length === 0 ? [] : [t('cli.quest.run.failed_checks', { checks: failed.join(', ') })]),
    ...notesLines(t, verdict.notes),
  ];
  return [headOf(t, verdict), ...details.map((line) => `  ${line}`)];
}

function restoredLines(t: Translate, line: RestoredLine): string[] {
  const { paths } = line.data;
  const more = paths.length - PATHS_SHOWN;
  return [
    t('cli.quest.run.restored', { count: paths.length }),
    ...paths.slice(0, PATHS_SHOWN).map((path) => `  ${path}`),
    ...(more > 0 ? [`  ${t('cli.quest.run.restored_more', { count: more })}`] : []),
  ];
}

/** The section of `quest show` on the last run; nothing before the first run, or when it left no trace. */
export async function lastRunLines(
  ctx: KingdomContext,
  quest: Quest,
  journal: readonly Event[],
): Promise<string[]> {
  const n = currentRun(quest);
  if (n === 0) return [];
  const { t } = ctx;
  const verdicts = await verdictsOf(ctx, quest, n);
  const restored = journal.filter(
    (event): event is RestoredLine => isEventOf(event, 'plot.restored') && event.attempt === n,
  );
  const body = [
    ...verdicts.flatMap((verdict) => verdictLines(t, verdict)),
    ...restored.flatMap((line) => restoredLines(t, line)),
  ];
  return body.length === 0
    ? []
    : ['', t('cli.quest.run.head', { run: n }), ...body.map((line) => `  ${line}`)];
}
