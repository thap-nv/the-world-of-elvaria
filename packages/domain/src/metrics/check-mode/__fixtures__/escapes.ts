import { TerritorySchema } from '../../../schema/territory.ts';
import { TERRITORIES } from '../../../world/__fixtures__/examples.ts';
import { attributed, merged } from '../../../patrol/__fixtures__/patrol-log.ts';
import { at, questId, questOf, verdictOf } from '../../__fixtures__/ledger.ts';

export const territoryOf = (id: string, mode = 'narrow') =>
  TerritorySchema.parse({ ...TERRITORIES[0], id, check_policy: { mode } });
export const TERRITORIES_WITH_ESCAPES = [
  territoryOf('alpha'),
  territoryOf('beta'),
  territoryOf('gamma', 'full'),
];
export const mergesOf = (territory: string, count: number) =>
  Array.from({ length: count }, (_, n) => merged(at(n), questId(n + 1), true, territory));
export const conclusion = (territory: string, cause: string, n?: number) =>
  attributed(at(30), { territory, cause, ...(n === undefined ? {} : { culprit: questId(n) }) });
export const ESCAPE_LOG = [
  ...mergesOf('alpha', 12),
  ...mergesOf('beta', 12),
  ...mergesOf('gamma', 12),
  conclusion('alpha', 'own_change', 1),
  conclusion('alpha', 'own_change', 2),
  conclusion('beta', 'combination', 1),
  conclusion('gamma', 'own_change', 1),
  conclusion('gamma', 'combination', 2),
  conclusion('alpha', 'flaky', 3),
  conclusion('alpha', 'outside', 4),
  conclusion('alpha', 'unknown'),
];
export const ESCAPE_QUESTS = [questOf(1, [], { territory: 'alpha' })];
export const ESCAPE_VERDICTS = [
  verdictOf(1, 1, 'pass', { minute: 20 }),
  verdictOf(1, 1, 'fail', { minute: 31, late: true }),
];
