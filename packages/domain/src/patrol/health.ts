// The health of each territory's default branch (PS-26, implementation-plan §3.16.7): a pure fold of the patrol's
// lines (`patrol.ran`) and the merges into the branch (`delivery.merged`). A check is red from the patrol that first
// found it failing until one finds it passing; a check that failed for its environment changes nothing, and a failed
// commands.setup is red as the check `setup`. stepPatrol is the one place that says which checks turned red, with the
// quests merged since the last patrol that found that check green: the digest's `base_red` items, the bell, the draft
// quest, the metrics, and later PS-09d (stop taking quests) and PS-08g (the seal delegation's breaker) read it.
import { isEventOf } from '../schema/event/event.ts';
import { SETUP_CHECK } from './constants.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { CheckAttributedData, CheckCause } from '../schema/event/check-data.ts';
import type { Event } from '../schema/event/event.ts';
import type { PatrolRanData, ScanOutcome } from '../schema/event/patrol-data.ts';

/** (CM-04) What a probe said of a red check: why it turned red, at which commit, and whose merge that was. */
export interface CheckAttribution {
  readonly cause: CheckCause;
  readonly commit?: string;
  readonly culprit?: QuestId;
}

/** A quest merged into the branch between the last green patrol of a check and the patrol that found it red. */
export interface PatrolSuspect {
  readonly quest: QuestId;
  /** It had the royal seal (delivery.merged `sealed`): false only under the seal delegation (PS-08b). */
  readonly sealed: boolean;
  readonly ts: string;
}

export interface RedCheck {
  /** A check id of the territory, or SETUP_CHECK. */
  readonly check: string;
  /** When a patrol first found it red, and the commit it tried then. */
  readonly since: string;
  readonly commit: string | null;
  /** As the latest patrol found it. */
  readonly error_line?: string;
  readonly log_path: string;
  /** The last patrol that found it green before it turned red; absent when none had. */
  readonly green_at?: string;
  /** The quests merged since that green patrol, up to the red one; none without a green patrol. */
  readonly suspects: readonly PatrolSuspect[];
  /** (CM-04) What the probe after it turned red found (`check.attributed`); absent until one did, kept while it stays red. */
  readonly attribution?: CheckAttribution;
}

/** A scan of the latest patrol that did not pass. */
export interface ScanFinding {
  readonly script: string;
  readonly outcome: ScanOutcome;
  readonly count?: number;
}

export interface TerritoryHealth {
  readonly territory: TerritoryId;
  /** The latest patrol: when, and the commit it tried. */
  readonly at: string;
  readonly head: string | null;
  readonly red: readonly RedCheck[];
  readonly scans: readonly ScanFinding[];
}

interface Merge extends PatrolSuspect {
  readonly seq: number;
}

/** What the fold keeps of one territory. */
interface Watch {
  readonly health: TerritoryHealth;
  /** Each check's last green patrol, and how many merges had been seen then. */
  readonly greens: Readonly<Record<string, { readonly at: string; readonly seq: number }>>;
  /** The merges since the oldest of those patrols; none before the first green one. */
  readonly merges: readonly Merge[];
  readonly seen: number;
}

export interface PatrolLedger {
  readonly watches: Readonly<Record<string, Watch>>;
}

export const EMPTY_PATROL_LEDGER: PatrolLedger = { watches: {} };

/** What a step reads of a territory's watch; a territory no patrol has run on yet has no health but its red. */
type WatchView = Omit<Watch, 'health'> & { readonly health: Pick<TerritoryHealth, 'red'> };

const NO_WATCH: WatchView = { health: { red: [] }, greens: {}, merges: [], seen: 0 };

/** One result of a run that ran: red, green, or nothing known (a check that failed for its environment). */
interface Ran {
  readonly check: string;
  readonly red: boolean | undefined;
  readonly error_line?: string;
  readonly log_path: string;
}

/** (RC-03, ADR 0035) A check the patrol carried: green on this very tree before, so green now, with no log of its own. */
interface Carried {
  readonly check: string;
  readonly red: false;
}

type Result = Ran | Carried;

function resultsOf(data: PatrolRanData): Result[] {
  const line = (text: string | undefined) => (text === undefined ? {} : { error_line: text });
  const setup =
    data.setup === null
      ? []
      : [
          {
            check: SETUP_CHECK,
            red: !data.setup.pass,
            ...line(data.setup.error_line),
            log_path: data.setup.log_path,
          },
        ];
  const checks = data.checks.map((check): Result =>
    check.log_path === undefined
      ? { check: check.id, red: false }
      : {
          check: check.id,
          red: check.pass ? false : check.environment ? undefined : true,
          ...line(check.error_line),
          log_path: check.log_path,
        },
  );
  return [...setup, ...checks];
}

/** A check red in this run: kept from the last run when it was red already, else turned red now. */
function redOf(watch: WatchView, result: Ran, ts: string, head: string | null): RedCheck {
  const { check, log_path: logPath } = result;
  const line = result.error_line === undefined ? {} : { error_line: result.error_line };
  const was = watch.health.red.find((red) => red.check === check);
  if (was !== undefined) {
    const { error_line: _old, ...kept } = was;
    return { ...kept, ...line, log_path: logPath };
  }
  const green = watch.greens[check];
  const suspects = green === undefined ? [] : watch.merges.filter(({ seq }) => seq >= green.seq);
  return {
    check,
    since: ts,
    commit: head,
    ...line,
    log_path: logPath,
    ...(green === undefined ? {} : { green_at: green.at }),
    suspects: suspects.map(({ quest, sealed, ts: at }) => ({ quest, sealed, ts: at })),
  };
}

/** The checks' greens after a run that ran them all: a check gone from the territory is forgotten. */
function greensAfter(
  watch: WatchView,
  results: readonly Result[],
  complete: boolean,
  ts: string,
): Watch['greens'] {
  const greens: Record<string, { at: string; seq: number }> = {};
  for (const [check, green] of Object.entries(watch.greens))
    if (!complete || results.some((result) => result.check === check)) greens[check] = green;
  for (const result of results) if (result.red === false) greens[result.check] = { at: ts, seq: watch.seen };
  return greens;
}

export interface PatrolStep {
  readonly ledger: PatrolLedger;
  /** The checks this run found red that the last one had not: one digest item, one ring, one draft quest. */
  readonly turned_red: readonly RedCheck[];
}

/** The ledger after one `patrol.ran` written at `ts`. */
export function stepPatrol(ledger: PatrolLedger, ts: string, data: PatrolRanData): PatrolStep {
  const watch: WatchView = ledger.watches[data.territory] ?? NO_WATCH;
  const results = data.plot_failure === undefined ? resultsOf(data) : [];
  // After a failed setup the checks did not run: what they were stays.
  const complete = data.plot_failure === undefined && (data.setup === null || data.setup.pass);
  const red: RedCheck[] = [];
  for (const result of results) if (result.red === true) red.push(redOf(watch, result, ts, data.head));
  for (const was of watch.health.red) {
    const result = results.find(({ check }) => check === was.check);
    if (result === undefined ? !complete : result.red === undefined) red.push(was);
  }
  const greens = greensAfter(watch, results, complete, ts);
  const oldest = Math.min(...Object.values(greens).map(({ seq }) => seq));
  const scans = data.scans
    .filter(({ outcome }) => outcome !== 'pass')
    .map(({ script, outcome, count }) => ({ script, outcome, ...(count === undefined ? {} : { count }) }));
  const health = { territory: data.territory, at: ts, head: data.head, red, scans };
  const next = { health, greens, merges: watch.merges.filter(({ seq }) => seq >= oldest), seen: watch.seen };
  const known = new Set(watch.health.red.map(({ check }) => check));
  return {
    ledger: { watches: { ...ledger.watches, [data.territory]: next } },
    turned_red: red.filter(({ check }) => !known.has(check)),
  };
}

/** The ledger after a merge into a territory's branch: kept only once a patrol found a check green there. */
function stepMerge(ledger: PatrolLedger, event: Event): PatrolLedger {
  if (!isEventOf(event, 'delivery.merged')) return ledger;
  const { territory, quest, sealed } = event.data;
  const watch = ledger.watches[territory];
  if (watch === undefined || Object.keys(watch.greens).length === 0) return ledger;
  const merge = { quest, sealed, ts: event.ts, seq: watch.seen };
  const next = { ...watch, merges: [...watch.merges, merge], seen: watch.seen + 1 };
  return { watches: { ...ledger.watches, [territory]: next } };
}

/** The patrol's red checks of a territory no probe has attributed yet. */
export const unattributedOf = (health: TerritoryHealth | undefined): string[] =>
  (health?.red ?? []).filter(({ attribution }) => attribution === undefined).map(({ check }) => check);

/** The red checks of `health` after a probe of its territory: those it ran and no probe had named get its finding. */
export function attributedHealth(health: TerritoryHealth, data: CheckAttributedData): TerritoryHealth {
  if (data.source !== 'patrol' || data.territory !== health.territory) return health;
  const { cause, commit, culprit } = data;
  const named = (check: RedCheck): boolean =>
    check.attribution === undefined && data.checks.includes(check.check);
  // (RC-04, R-B) Green again on the very head the patrol found red: those checks are not red, so the guests and the
  // queue go on at once instead of waiting for the next patrol; red again there, the next patrol turns them red anew.
  if (cause === 'flaky' && commit !== undefined && commit === health.head)
    return { ...health, red: health.red.filter((check) => !named(check)) };
  const attribution = {
    cause,
    ...(commit === undefined ? {} : { commit }),
    ...(culprit === undefined ? {} : { culprit }),
  };
  const red = health.red.map((check): RedCheck =>
    check.attribution === undefined && data.checks.includes(check.check) ? { ...check, attribution } : check,
  );
  return { ...health, red };
}

/** The ledger after a probe of a territory's red branch (CM-04): the red checks it ran get its finding. */
function stepAttribution(ledger: PatrolLedger, event: Event): PatrolLedger {
  if (!isEventOf(event, 'check.attributed')) return ledger;
  const watch = ledger.watches[event.data.territory];
  if (watch === undefined) return ledger;
  const next = { ...watch, health: attributedHealth(watch.health, event.data) };
  return { watches: { ...ledger.watches, [event.data.territory]: next } };
}

/** A green-to-red turn of one check, as the metrics list it. */
export interface RedFlip extends RedCheck {
  readonly territory: TerritoryId;
}

/** Folds the log; `onFlip` hears each check that turned red, in order. */
function fold(events: readonly Event[], onFlip?: (flip: RedFlip) => void): PatrolLedger {
  let ledger = EMPTY_PATROL_LEDGER;
  for (const event of events) {
    ledger = stepAttribution(stepMerge(ledger, event), event);
    if (!isEventOf(event, 'patrol.ran')) continue;
    const step = stepPatrol(ledger, event.ts, event.data);
    ledger = step.ledger;
    for (const red of step.turned_red) onFlip?.({ territory: event.data.territory, ...red });
  }
  return ledger;
}

export const patrolLedgerOf = (events: readonly Event[]): PatrolLedger => fold(events);

/** Each patrolled territory's health, by id: what the latest patrol found and the checks red since. */
export const healthOf = (ledger: PatrolLedger): TerritoryHealth[] =>
  Object.values(ledger.watches)
    .map(({ health }) => health)
    .toSorted((a, b) => a.territory.localeCompare(b.territory));

export const baseHealthOf = (events: readonly Event[]): TerritoryHealth[] => healthOf(fold(events));

/** Every check that turned red, in the log's order (the metrics' "base red after a merge"). */
export function redFlipsOf(events: readonly Event[]): RedFlip[] {
  const flips: RedFlip[] = [];
  fold(events, (flip) => flips.push(flip));
  return flips;
}
