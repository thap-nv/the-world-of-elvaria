// Lines of the log for the patrol's specs (PS-26): `patrol.ran` of one territory, `delivery.merged` into it.
import { EventSchema } from '../../schema/event/event.ts';
import { PatrolRanDataSchema } from '../../schema/event/patrol-data.ts';
import type { QuestId } from '../../core/ids.ts';
import type { Event } from '../../schema/event/event.ts';
import type { PatrolRanData } from '../../schema/event/patrol-data.ts';

export const TERRITORY = 'elvaria';
export const SHA_A = 'a'.repeat(40);
export const SHA_B = 'b'.repeat(40);

let serial = 0;
export const lineOf = (type: string, ts: string, data: Record<string, unknown>): Event => {
  serial += 1;
  return EventSchema.parse({
    v: 2,
    id: `01JC${String(serial).padStart(22, '0')}`,
    ts,
    type,
    actor: { kind: 'steward' },
    data,
  });
};

export interface CheckLine {
  readonly id: string;
  readonly pass: boolean;
  readonly environment?: boolean;
  readonly error_line?: string;
}

export const checkOf = ({ id, pass, environment = false, error_line: line }: CheckLine) => ({
  id,
  pass,
  duration_ms: 1000,
  timed_out: false,
  environment,
  ...(line === undefined ? {} : { error_line: line }),
  log_path: `.runs/patrol-${TERRITORY}/checks/${id}.log`,
});

export const ranData = (
  checks: readonly CheckLine[],
  extra: Readonly<Record<string, unknown>> = {},
): PatrolRanData =>
  PatrolRanDataSchema.parse({
    territory: TERRITORY,
    head: SHA_A,
    trigger: 'schedule',
    setup: null,
    checks: checks.map(checkOf),
    scans: [],
    ...extra,
  });

export const ran = (
  ts: string,
  checks: readonly CheckLine[],
  extra: Readonly<Record<string, unknown>> = {},
): Event => lineOf('patrol.ran', ts, ranData(checks, extra));

export const merged = (
  ts: string,
  quest: QuestId,
  sealed = true,
  territory = TERRITORY,
  mergeSha = SHA_B,
): Event =>
  lineOf('delivery.merged', ts, {
    quest,
    territory,
    branch: `quest/${quest}`,
    head: SHA_B,
    pr: { number: 7, url: 'https://github.com/o/r/pull/7' },
    merge_sha: mergeSha,
    method: 'merge',
    sealed,
    branch_deleted: true,
  });

const PR = { number: 8, url: 'https://github.com/o/r/pull/8' };

/** (CM-04) `quest`'s branch pushed at `head`, or merged by the Steward as `mergeSha` when given. */
export const delivered = (ts: string, quest: QuestId, head: string, mergeSha?: string): Event => {
  const branch = { quest, territory: TERRITORY, branch: `quest/${quest}`, head, pr: PR };
  return mergeSha === undefined
    ? lineOf('delivery.pushed', ts, { ...branch, forge: 'github' })
    : lineOf('delivery.merged', ts, {
        ...branch,
        merge_sha: mergeSha,
        method: 'merge',
        sealed: true,
        branch_deleted: true,
      });
};

/** (CM-04) A probe's `check.attributed` of the territory's red branch, `data` over a patrol's `unknown`. */
export const attributed = (ts: string, data: Readonly<Record<string, unknown>> = {}): Event =>
  lineOf('check.attributed', ts, {
    territory: TERRITORY,
    source: 'patrol',
    checks: ['unit'],
    runs: [],
    cause: 'unknown',
    ...data,
  });
