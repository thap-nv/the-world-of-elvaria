// Lines of the log for the check ledger's specs (RC-03): `check.end` of a quest's, the queue's or a guest's checks,
// and `patrol.ran`, each parsed as the log reads them.
import { EventSchema } from '../../schema/event/event.ts';
import type { Event } from '../../schema/event/event.ts';

export const TERRITORY = 'elvaria';
export const TREE_A = 'a'.repeat(40);
export const TREE_B = 'b'.repeat(40);
export const BASE_1 = '1'.repeat(40);
export const BASE_2 = '2'.repeat(40);
export const CONFIG = '0123456789abcdef';
export const OTHER_CONFIG = 'fedcba9876543210';
export const AT = '2026-11-26T08:00:00+07:00';

/** The id of the `n`th line these builders make. */
export const lineId = (n: number): string => `01JC${String(n).padStart(22, '0')}`;

export interface LineCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly carried_from?: string;
}

let serial = 0;
const lineOf = (type: string, envelope: Record<string, unknown>, data: Record<string, unknown>): Event => {
  serial += 1;
  return EventSchema.parse({
    v: 2,
    id: lineId(serial),
    ts: AT,
    type,
    actor: { kind: 'steward' },
    ...envelope,
    data,
  });
};

/** The `n` the next line gets: what its id will be. */
export const nextLine = (): number => serial + 1;

const endCheck = ({ id, pass, carried_from: from }: LineCheck) => ({
  id,
  pass,
  duration_ms: from === undefined ? 1000 : 0,
  ...(from === undefined ? {} : { carried_from: from }),
});

/** A `check.end` of `checks`, on TREE_A under CONFIG unless `data` says otherwise. */
export const checkEnd = (
  checks: readonly LineCheck[],
  data: Readonly<Record<string, unknown>> = {},
  envelope: Readonly<Record<string, unknown>> = { territory: TERRITORY },
): Event =>
  lineOf('check.end', envelope, {
    outcome: checks.every(({ pass }) => pass) ? 'pass' : 'fail',
    checks: checks.map(endCheck),
    tree: TREE_A,
    config: CONFIG,
    ...data,
  });

const patrolCheck = ({ id, pass, carried_from: from }: LineCheck) => ({
  id,
  pass,
  duration_ms: from === undefined ? 1000 : 0,
  timed_out: false,
  environment: false,
  ...(from === undefined
    ? { log_path: `.runs/patrol-${TERRITORY}/checks/${id}.log` }
    : { carried_from: from }),
});

/** A `patrol.ran` of `checks`, on TREE_A under CONFIG unless `data` says otherwise. */
export const patrolRan = (
  checks: readonly LineCheck[],
  data: Readonly<Record<string, unknown>> = {},
): Event =>
  lineOf(
    'patrol.ran',
    { territory: TERRITORY },
    {
      territory: TERRITORY,
      head: 'c'.repeat(40),
      trigger: 'merged',
      tree: TREE_A,
      config: CONFIG,
      setup: null,
      checks: checks.map(patrolCheck),
      scans: [],
      ...data,
    },
  );
