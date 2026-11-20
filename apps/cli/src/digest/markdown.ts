// The digest in the owner's language (implementation-plan §3.16.3, PS-03): the Steward decides what is in it
// (attentionQueue); this words it, item by item, in its two groups, each with its advice and the `elvaria` command to
// run. The scheduled job writes it to digest/<day>.md; `elvaria digest` prints it.
import { ATTENTION_GROUPS } from '@elvaria/domain';
import type { AttentionGroup, AttentionItem, WaitGauge } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import { raisesText } from '../quest/seal-view.ts';
import { suspensionCause } from '../territory/delegation-view.ts';

const NONE = '—';
/** The digits of a commit id the CLI prints (shortSha). */
const SHORT_SHA = 12;

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

/**
 * Where a delivery to the forge stopped and what to do about it (PS-08c), its pull request, and the merge queue's merge
 * quest it waits for (PS-09b).
 */
const deliveryOf = (t: Translate, item: AttentionItem) => ({
  stage: item.stage === undefined ? NONE : t(`cli.forge.stage.${item.stage}`),
  why: item.reason === undefined ? NONE : t(`cli.forge.reason.${item.reason}`),
  url: item.url ?? NONE,
  merge_quest: item.merge_quest ?? NONE,
});

/** A newer build (PS-08d): the commits short, as the CLI prints them. */
const upgradeOf = (item: AttentionItem) => ({
  pinned: item.pinned?.slice(0, SHORT_SHA) ?? NONE,
  latest: item.latest?.slice(0, SHORT_SHA) ?? NONE,
  commits: item.commits ?? NONE,
});

/**
 * A red check of a default branch, or a scan that did not pass (PS-26): what the patrol found, and where; (PS-09d) that
 * the territory takes no work, and how many quests wait for it.
 */
const patrolOf = (t: Translate, item: AttentionItem) => ({
  stopped:
    item.kind === 'base_red' && item.waiting !== undefined
      ? ` ${t('cli.digest.base_stopped', { count: item.waiting.length })}`
      : '',
  territory: item.territory ?? NONE,
  check: item.check ?? NONE,
  error_line: item.error_line ?? NONE,
  log_path: item.log_path ?? NONE,
  commit: item.commit?.slice(0, SHORT_SHA) ?? NONE,
  since: item.since ?? NONE,
  suspects:
    item.suspects === undefined || item.suspects.length === 0
      ? t('cli.digest.no_suspects')
      : item.suspects.join(', '),
  script: item.script ?? NONE,
  outcome: item.outcome ?? NONE,
  count: item.count ?? NONE,
});

/** (PS-08g) Why the breaker suspended a territory's delegation of the seal. */
const suspensionOf = (t: Translate, { cause, check, note }: AttentionItem) => ({
  cause: cause === undefined ? NONE : suspensionCause(t, { cause, check, note }),
});

/** (PS-12g) A character suspended for a fail streak with the Monk's letters, and why the Temple cannot run. */
const templeOf = (t: Translate, item: AttentionItem) => ({
  character: item.character ?? NONE,
  fail_kind: item.fail_kind ?? NONE,
  letters:
    item.letters === undefined || item.letters.length === 0
      ? t('cli.digest.no_letters')
      : item.letters.join(', '),
  reasons: (item.temple_reasons ?? []).map((reason) => t(`cli.digest.temple_reason.${reason}`)).join(', '),
});

/** What the item is about, in one line; every field the line names is given, `—` when the item has none. */
function subjectOf(t: Translate, item: AttentionItem): string {
  return t(`cli.digest.item.${item.kind}`, {
    quest: item.quest ?? NONE,
    title: item.title ?? NONE,
    rank: item.rank ?? NONE,
    question: item.question ?? NONE,
    waiting: item.waiting?.join(', ') ?? NONE,
    holder: item.holder ?? NONE,
    overlap: item.overlap ?? NONE,
    gauges: gaugesOf(t, item.gauges),
    memo: item.memo ?? NONE,
    memo_kind: item.memo_kind ?? NONE,
    from: item.from ?? NONE,
    judge: item.judge ?? NONE,
    tribe: item.tribe ?? NONE,
    path: item.path ?? NONE,
    version: item.version ?? NONE,
    checked_version: item.checked_version ?? NONE,
    pool: item.pool ?? NONE,
    used_pct: item.used_pct ?? NONE,
    resets_at: item.resets_at ?? NONE,
    held_reason: item.held_reason ?? NONE,
    ...triageOf(t, item),
    ...deliveryOf(t, item),
    ...upgradeOf(item),
    ...patrolOf(t, item),
    ...suspensionOf(t, item),
    ...templeOf(t, item),
  });
}

/** (PS-08b) Why the machine raised the seal of a quest the delegation had spared, after its line. */
const raisedOf = (t: Translate, item: AttentionItem): string =>
  item.raised === undefined ? '' : ` ${t('cli.digest.raised', { reasons: raisesText(t, item.raised) })}`;

/** (PS-08b) The git line that undoes a merge without the seal, for the owner to run and push. */
const revertLines = (t: Translate, item: AttentionItem): string[] =>
  item.revert === undefined
    ? []
    : [`  ${t('cli.digest.revert', { command: `\`${item.revert.join(' ')}\`` })}`];

/** One item: its subject, its advice, and its command on a line of its own; (PS-12g) none when the kind has none. */
const itemLines = (t: Translate, item: AttentionItem): string[] => [
  `- ${subjectOf(t, item)}${raisedOf(t, item)} ${t(`cli.digest.advice.${item.advice}`)}`,
  ...(item.command.length === 0 ? [] : [`  \`elvaria ${item.command.join(' ')}\``]),
  ...revertLines(t, item),
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
