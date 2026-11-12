// The parts of the metrics view PS-21 added: the code graph's queries, the tool calls before an assignee's first edit,
// and the prompt's size by role and block. The A/B of PS-21 compares sessions with and without the graph on them.
import { NONE } from '../listing.ts';
import { count, tableSection } from './section.ts';
import type { Metrics, PromptSize, Role } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import type { MetricsSection } from './section.ts';

const percent = (value: number | null): string => (value === null ? NONE : `${value} %`);
const orNone = (value: number | null): string => (value === null ? NONE : count(value));

/** The graph's queries by command, named as the command line names them (`query`, `path`…). */
export function graphLine(t: Translate, metrics: Metrics): string {
  const { total, sessions, by_command } = metrics.graph;
  const by = new Map(by_command.map(({ command, count: n }) => [command.replace(/^graphify /, ''), n]));
  return t('cli.metrics.line.graph', {
    total,
    sessions,
    query: by.get('query') ?? 0,
    path: by.get('path') ?? 0,
    explain: by.get('explain') ?? 0,
    affected: by.get('affected') ?? 0,
  });
}

/** How much an assignee session looked around before its first edit (the 57 % of the PS-21 goal). */
export function firstEditsLine(t: Translate, metrics: Metrics): string {
  const edits = metrics.first_edits;
  return t('cli.metrics.line.first_edits', {
    sessions: edits.sessions.length,
    edited: edits.edited,
    median: orNone(edits.median_before),
    share: percent(edits.share_pct),
    median_share: percent(edits.median_share_pct),
  });
}

const ROLE_KEYS: Readonly<Record<Role, 'cli.metrics.column.assignee' | 'cli.metrics.column.verifier'>> = {
  assignee: 'cli.metrics.column.assignee',
  verifier: 'cli.metrics.column.verifier',
};

const COLUMNS = ['role', 'part', 'block', 'sessions', 'median_chars', 'max_chars'] as const;

/** The whole prompt of each role, then its blocks, from the load traces (PS-01b). */
export function promptSection(t: Translate, metrics: Metrics): MetricsSection {
  const { roles, blocks } = metrics.prompts;
  const row = (size: PromptSize, part: string, block: string): string[] => [
    t(ROLE_KEYS[size.role]),
    part,
    block,
    count(size.sessions),
    count(size.median_chars),
    count(size.max_chars),
  ];
  return tableSection(t('cli.metrics.title.prompts'), t('cli.metrics.none'), {
    header: COLUMNS.map((column) => t(`cli.metrics.column.${column}`)),
    rows: roles.flatMap((size) => [
      row(size, NONE, t('cli.metrics.prompt_whole')),
      ...blocks.filter(({ role }) => role === size.role).map((block) => row(block, block.part, block.block)),
    ]),
  });
}
