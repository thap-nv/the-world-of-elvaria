// Hand-made kingdom files for the metrics specs: quests with their attempt logs, verdicts, event lines and inbox
// commands, shaped like the files of the stage-1 milestone day (docs/guides/phase-1-report.md §3).
import { InboxCommandSchema } from '../../schema/command/inbox-command.ts';
import { EVENT_VERSION } from '../../schema/event/event.ts';
import { QuestSchema } from '../../schema/quest/quest.ts';
import type { InboxCommand } from '../../schema/command/inbox-command.ts';
import type { FailKind, Role } from '../../schema/common.ts';
import type { Event } from '../../schema/event/event.ts';
import type { Attempt } from '../../schema/quest/quest-parts.ts';
import type { Quest } from '../../schema/quest/quest.ts';
import type { Verdict } from '../../schema/quest/verdict.ts';

const two = (value: number): string => String(value).padStart(2, '0');

/** Minute `m` of 2026-11-08 (from 07:00), or of another day. */
export const at = (m: number, day = '2026-11-08'): string =>
  `${day}T${two(7 + Math.floor(m / 60))}:${two(m % 60)}:00+07:00`;

export const questId = (n: number): Quest['id'] => `q_20261108_${String(n).padStart(6, '0')}` as Quest['id'];

export interface EntrySpec {
  readonly n: number;
  readonly role?: Role;
  /** null: the machine's run (a script). */
  readonly character?: string | null;
  readonly outcome?: Attempt['outcome'];
  readonly start: number;
  /** Absent: the session is still open. */
  readonly end?: number;
  readonly tokens?: number;
  readonly session?: string;
  readonly day?: string;
}

const entryOf = (id: string, spec: EntrySpec): Record<string, unknown> => {
  const role = spec.role ?? 'assignee';
  const day = spec.day ?? '2026-11-08';
  return {
    n: spec.n,
    character: spec.character === undefined ? (role === 'assignee' ? 'thorn' : 'vesper') : spec.character,
    role,
    started_at: at(spec.start, day),
    ...(spec.end === undefined ? {} : { ended_at: at(spec.end, day) }),
    ...(spec.outcome === undefined ? {} : { outcome: spec.outcome }),
    ...(spec.session === undefined ? {} : { session_id: spec.session }),
    ...(spec.tokens === undefined ? {} : { tokens: spec.tokens }),
    run_dir: role === 'verifier' ? `.runs/${id}-${spec.n}/verify` : `.runs/${id}-${spec.n}`,
  };
};

export interface QuestSpec {
  readonly kind?: string;
  readonly tier?: 'session' | 'script';
  readonly class?: string;
  readonly tags?: readonly string[];
  readonly status?: Quest['status'];
  readonly sealed?: number;
  /** Default dc1-se-team. */
  readonly territory?: string;
}

/** A quest whose attempt log is `log`, valid by its schema. */
export function questOf(n: number, log: readonly EntrySpec[], spec: QuestSpec = {}): Quest {
  const id = questId(n);
  const tier = spec.tier ?? 'session';
  return QuestSchema.parse({
    version: 1,
    id,
    title: `Quest ${n}`,
    description: 'A quest of the metrics specs.',
    kind: spec.kind ?? 'build',
    rank: 'E',
    territory: spec.territory ?? 'dc1-se-team',
    ...(tier === 'session'
      ? { class_required: spec.class ?? 'knight' }
      : { script: { id: 'link-check', params: {} } }),
    tags: spec.tags ?? ['infra'],
    status: spec.status ?? 'archived',
    tier,
    assignee: null,
    verifier: null,
    budget: { max_minutes: 45, max_tokens: 400000, max_attempts: 3 },
    estimate: { tokens: 200000, minutes: 30 },
    attempts: 1,
    attempt_log: log.map((entry) => entryOf(id, entry)),
    plot: { type: 'none' },
    deliverable: { type: 'branch' },
    seal_required: spec.sealed !== undefined,
    ...(spec.sealed === undefined ? {} : { seal: { at: at(spec.sealed) } }),
    created_by: 'user',
    created_at: at(0),
    updated_at: at(0),
  });
}

export interface VerdictSpec {
  readonly fail_kind?: FailKind;
  readonly owner?: boolean;
  readonly machine?: boolean;
  readonly rejudge?: boolean;
  readonly minute: number;
}

/** A verdict on run `attempt` of quest `n`: a judge's, the machine's or the owner's. */
export function verdictOf(n: number, attempt: number, result: Verdict['result'], spec: VerdictSpec): Verdict {
  const id = questId(n);
  const owner = spec.owner === true;
  const judge = owner ? 'user' : spec.machine === true ? 'machine' : 'vesper';
  return {
    version: 1,
    id: (owner ? `${id}-${attempt}-user` : `${id}-${attempt}`) as Verdict['id'],
    quest_id: id,
    attempt,
    verifier_id: judge,
    ritual: 'build_review' as Verdict['ritual'],
    checks: [],
    result,
    ...(spec.fail_kind === undefined ? {} : { fail_kind: spec.fail_kind }),
    ...(result === 'fail' ? { notes: 'The README still names the old command.' } : {}),
    ...(result === 'partial' ? { progress: { checked_until: 'src/a.ts' } } : {}),
    ...(spec.rejudge === undefined ? {} : { rejudge: spec.rejudge }),
    by_human: owner,
    ...(judge === 'vesper' ? { session_id: `s-${n}-${attempt}` } : {}),
    created_at: at(spec.minute),
  };
}

let counter = 0;
const ulid = (): string => {
  counter += 1;
  return `01JC${String(counter).padStart(22, '0')}`;
};

/** An event line as the kingdom's log holds it (the reader has checked it against EventSchema). */
export function lineOf(type: string, data: Record<string, unknown>, ts: string, quest?: string): Event {
  return {
    v: EVENT_VERSION,
    id: ulid() as Event['id'],
    ts,
    type,
    actor: { kind: 'steward' },
    ...(quest === undefined ? {} : { quest: quest as Event['quest'] }),
    data,
  } as Event;
}

/** An owner's command from the CLI, valid by its schema. */
export function commandOf(kind: string, payload: Record<string, unknown>, ts: string): InboxCommand {
  return InboxCommandSchema.parse({ version: 1, id: ulid(), ts, kind, source: 'cli', payload });
}

export const appliedLine = (command: InboxCommand): Event =>
  lineOf('command.applied', { command_id: command.id }, command.ts);
