// The territory's scorecard in the owner's language (PS-25): a title, one line per item with its mark, each reason
// indented under it, and the verdict on the trial. The domain gives codes and values, never sentences (ADR 0014).
import type { ScorecardItem, ScorecardStatus, TerritoryScorecard } from '@elvaria/domain';
import type { MessageKey, Translate } from '@elvaria/i18n';

const MARK: Readonly<Record<ScorecardStatus, string>> = { pass: '✓', fail: '✗', unmeasured: '—' };
const INDENT = '    ';

export const itemKeyOf = (item: Pick<ScorecardItem, 'id'>): MessageKey =>
  `cli.territory.check.item.${item.id}` as MessageKey;

export const reasonKeyOf = (code: string): MessageKey => `cli.territory.check.reason.${code}` as MessageKey;

function itemLines(t: Translate, item: ScorecardItem): string[] {
  return [
    `${MARK[item.status]} ${t(itemKeyOf(item))}`,
    ...item.reasons.map(({ code, params }) => `${INDENT}${t(reasonKeyOf(code), params)}`),
  ];
}

function verdictOf(t: Translate, card: TerritoryScorecard): string {
  const [trial] = card.items;
  const id = card.territory;
  if (trial?.status === 'unmeasured') return t('cli.territory.check.untried', { id });
  if (!card.ready) return t('cli.territory.check.not_ready', { id });
  const failing = card.items.filter(({ status }) => status === 'fail').length;
  return failing === 0
    ? t('cli.territory.check.ready_all')
    : t('cli.territory.check.ready', { count: failing });
}

export function scorecardLines(t: Translate, card: TerritoryScorecard, branch: string): string[] {
  const title =
    card.base === null
      ? t('cli.territory.check.title_untried', { id: card.territory })
      : t('cli.territory.check.title', { id: card.territory, branch, base: card.base });
  return [title, ...card.items.flatMap((item) => itemLines(t, item)), verdictOf(t, card)];
}
