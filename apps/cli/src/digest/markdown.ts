// The digest in the owner's language (implementation-plan §3.16.3, PS-03): the Steward decides what is in it
// (attentionQueue); this words it, item by item, in its two groups, each with its advice and the `elvaria` command to
// run. The scheduled job writes it to digest/<day>.md; `elvaria digest` prints it.
import { ATTENTION_GROUPS } from '@elvaria/domain';
import type { AttentionGroup, AttentionItem, WaitGauge } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

const NONE = '—';

/** The pools that hold a quest's judges, each with its reset when known; the bell says them so too. */
export function gaugesOf(t: Translate, gauges: readonly WaitGauge[] = []): string {
  return gauges
    .map(({ tribe, pool, resets_at }) =>
      resets_at === undefined
        ? t('cli.digest.gauge', { tribe, pool })
        : t('cli.digest.gauge_until', { tribe, pool, resets_at }),
    )
    .join(', ');
}

/** What the Chancellor's triage would do with a memo it sent up, and why it is the owner's (PS-03b). */
function triageOf(t: Translate, item: AttentionItem) {
  const triage =
    item.triage === undefined ? NONE : t(`cli.triage.action.${item.triage}`, { quest: item.target ?? NONE });
  const holds = (item.holds ?? []).map((hold) => t(`cli.triage.hold.${hold}`)).join(', ');
  return { triage, holds: holds === '' ? NONE : holds };
}

/** What the item is about, in one line; every field the line names is given, `—` when the item has none. */
function subjectOf(t: Translate, item: AttentionItem): string {
  return t(`cli.digest.item.${item.kind}`, {
    quest: item.quest ?? NONE,
    title: item.title ?? NONE,
    rank: item.rank ?? NONE,
    question: item.question ?? NONE,
    waiting: item.waiting?.join(', ') ?? NONE,
    gauges: gaugesOf(t, item.gauges),
    memo: item.memo ?? NONE,
    memo_kind: item.memo_kind ?? NONE,
    from: item.from ?? NONE,
    tribe: item.tribe ?? NONE,
    path: item.path ?? NONE,
    version: item.version ?? NONE,
    checked_version: item.checked_version ?? NONE,
    pool: item.pool ?? NONE,
    used_pct: item.used_pct ?? NONE,
    resets_at: item.resets_at ?? NONE,
    ...triageOf(t, item),
  });
}

/** One item: its subject, its advice, and its command on a line of its own. */
const itemLines = (t: Translate, item: AttentionItem): string[] => [
  `- ${subjectOf(t, item)} ${t(`cli.digest.advice.${item.advice}`)}`,
  `  \`elvaria ${item.command.join(' ')}\``,
];

function groupLines(t: Translate, group: AttentionGroup, items: readonly AttentionItem[]): string[] {
  const mine = items.filter((item) => item.group === group);
  if (mine.length === 0) return [];
  return ['', `## ${t(`cli.digest.group.${group}`)}`, '', ...mine.flatMap((item) => itemLines(t, item))];
}

/** The digest of `day` (`yyyy-mm-dd`) for the kingdom `name`, as Markdown ending in a newline. */
export function digestMarkdown(
  t: Translate,
  digest: { readonly day: string; readonly name: string; readonly items: readonly AttentionItem[] },
): string {
  const { day, name, items } = digest;
  const must = items.filter(({ group }) => group === 'must').length;
  const head = [`# ${t('cli.digest.title', { day, kingdom: name })}`, ''];
  const body =
    items.length === 0
      ? [t('cli.digest.empty')]
      : [
          t('cli.digest.counts', { must, can_wait: items.length - must }),
          ...ATTENTION_GROUPS.flatMap((group) => groupLines(t, group, items)),
        ];
  return `${[...head, ...body].join('\n')}\n`;
}
