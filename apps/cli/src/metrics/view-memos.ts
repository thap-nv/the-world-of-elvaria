// The memos and objections of the ledger (PS-22, implementation-plan §3.16.1–2): memos by kind with those sent to the
// owner and (PS-03b) those the owner and the Chancellor's triage decided, and for each judge the verdicts a second
// judge read beside an objection and those it overturned. Apart from view.ts, which is near its limit.
import { count, tableSection } from './section.ts';
import type { MetricsSection } from './section.ts';
import type { Metrics } from '@elvaria/domain';
import type { MessageKey, Translate } from '@elvaria/i18n';

const columns = (t: Translate, keys: readonly string[]): string[] =>
  keys.map((key) => t(`cli.metrics.column.${key}` as MessageKey));

export const memosSection = (t: Translate, metrics: Metrics): MetricsSection =>
  tableSection(t('cli.metrics.title.memos'), t('cli.metrics.none'), {
    // (PS-03b) Who decided them: the owner, or the Chancellor's triage within kingdom.delegation.
    header: columns(t, ['kind', 'filed', 'to_owner', 'by_owner', 'by_chancellor']),
    rows: metrics.memos.map((memos) => [
      memos.kind,
      ...[memos.filed, memos.to_owner, memos.by_owner, memos.by_chancellor].map(count),
    ]),
  });

export const objectionsSection = (t: Translate, metrics: Metrics): MetricsSection =>
  tableSection(t('cli.metrics.title.objections'), t('cli.metrics.none'), {
    header: columns(t, ['verifier', 'answered', 'overturned']),
    rows: metrics.objections.map(({ judge, answered, overturned }) => [
      judge,
      count(answered),
      count(overturned),
    ]),
  });
