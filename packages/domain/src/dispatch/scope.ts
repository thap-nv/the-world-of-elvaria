// The files a quest changes (implementation-plan §3.16.5, ADR 0028, PS-05): `quest.scope_paths`, globs relative to
// the territory root. Within a territory the Steward never starts a quest whose scope meets one a quest holds (R3),
// and a session-tier quest without a scope runs alone among working quests (R2); script-tier quests are outside both
// rules. This file decides who holds what, when two scopes meet and why a quest waits, as pure functions of the
// quests; the roster applies them (roster.ts) and `quest list` says them (scopeHolderOf).
import { plotBaseOf } from '../party/plot-base.ts';
import { questFinished } from '../quest/finished.ts';
import type { QuestId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Territory } from '../schema/territory.ts';

/** The first character that makes a glob more than its literal text. */
const GLOB_MARK = /[*?[{]/;

/** A glob as scopes compare it: `/` apart, no leading `./` or `/`, in lower case as Windows and macOS file systems. */
const normal = (glob: string): string =>
  glob
    .replaceAll('\\', '/')
    .replace(/^(?:\.\/|\/)+/, '')
    .toLowerCase();

/** The text of a glob before its first wildcard: every path it matches starts with it. */
function literalOf(glob: string): string {
  const at = glob.search(GLOB_MARK);
  return at === -1 ? glob : glob.slice(0, at);
}

const isLiteral = (glob: string): boolean => !GLOB_MARK.test(glob);

/** The quest's scope; none for a quest that declares none. */
export const scopeOf = (quest: Pick<Quest, 'scope_paths'>): readonly string[] => quest.scope_paths ?? [];

/** The globs of the territory's shared paths (territory.shared_paths): hot files, never an overlap. */
export const sharedGlobsOf = (territory: Pick<Territory, 'shared_paths'> | undefined): string[] =>
  (territory?.shared_paths ?? []).map(({ glob }) => glob);

/**
 * Whether an entry of a scope lies inside the shared paths: a shared glob of the same text, or a folder glob
 * (`<folder>/**`, `**`) whose folder starts the entry. Any other shape counts as an overlap: better one reported by
 * mistake than two quests on one file.
 */
function isShared(entry: string, shared: readonly string[]): boolean {
  return shared.map(normal).some((glob) => {
    if (glob === entry) return true;
    const folder = literalOf(glob);
    const folderGlob = glob.slice(folder.length) === '**' && (folder === '' || folder.endsWith('/'));
    return folderGlob && literalOf(entry).startsWith(folder);
  });
}

/** Two entries may name one file: two paths are one, or one is a folder of the other; else literal texts nest. */
function entriesMeet(a: string, b: string): boolean {
  if (isLiteral(a) && isLiteral(b)) return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
  const [x, y] = [literalOf(a), literalOf(b)];
  return x.startsWith(y) || y.startsWith(x);
}

/**
 * Whether two scopes may name one file (ADR 0028): by the literal text of their globs, so a doubt is an overlap.
 * Entries inside the territory's `shared` globs do not count.
 */
export function scopesMeet(
  a: readonly string[],
  b: readonly string[],
  shared: readonly string[] = [],
): boolean {
  const own = (scope: readonly string[]) => scope.map(normal).filter((entry) => !isShared(entry, shared));
  const right = own(b);
  return own(a).some((x) => right.some((y) => entriesMeet(x, y)));
}

/** A session-tier quest at work on its territory: R2 counts these. */
export const worksOnTerritory = (quest: Quest): boolean =>
  quest.tier === 'session' && quest.status === 'working';

/**
 * Whether the quest holds its scope (ADR 0028, amended 2026-11-11): a session-tier quest with a scope, from its first
 * run until it is archived (cancelled included), so a quest done and waiting for the owner's merge still holds it. A
 * run is an attempt or an entry of its log: a retry from the infirmary sets attempts back to 0 and keeps its log.
 */
export const holdsScope = (quest: Quest): boolean =>
  quest.tier === 'session' &&
  scopeOf(quest).length > 0 &&
  quest.status !== 'archived' &&
  (quest.attempts > 0 || quest.attempt_log.length > 0);

/**
 * The quests whose work `quest`'s plot is built on: the first branch plotBaseOf says it may start from, then that
 * quest's, and so on; for a party's merge quest, every part it merges too, since each part holds its scope until it
 * is archived and the merge quest's scope is theirs together.
 */
export function baseChainOf(quest: Quest, quests: readonly Quest[]): ReadonlySet<QuestId> {
  const chain = new Set<QuestId>();
  const queue = [quest];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const base = plotBaseOf(next, quests);
    // plotBaseOf names only branches of these quests' plots.
    const branches = new Set([...base.from.slice(0, 1), ...base.merge]);
    for (const found of quests.filter(({ plot }) => branches.has(plot.branch ?? ''))) {
      if (found.id === quest.id || chain.has(found.id)) continue;
      chain.add(found.id);
      queue.push(found);
    }
  }
  return chain;
}

/** Why a quest waits on its territory's scope rules: who it waits for, by which rule. */
export interface ScopeWait {
  /**
   * `alone` (R2): a session-tier quest without a scope works there, or this quest has none and another works there.
   * `scope` (R3): `holder` holds a scope that meets this quest's.
   */
  readonly rule: 'alone' | 'scope';
  readonly holder: QuestId;
}

/** What the scope rules read of one territory. */
interface TerritoryScopes {
  /** Its session-tier quests at work (worksOnTerritory), and those the roster started in this tick. */
  readonly working: readonly Quest[];
  /** Its quests that hold a scope (holdsScope), and those with a scope the roster started in this tick. */
  readonly holders: readonly Quest[];
  /** sharedGlobsOf the territory. */
  readonly shared: readonly string[];
}

/** Why `quest` may not start on its territory now (R2, R3), or null; `quests` is the kingdom's, for baseChainOf. */
function scopeWaitOf(quest: Quest, on: TerritoryScopes, quests: readonly Quest[]): ScopeWait | null {
  if (quest.tier === 'script') return null;
  const scope = scopeOf(quest);
  const others = on.working.filter(({ id }) => id !== quest.id);
  const alone =
    others.find((other) => scopeOf(other).length === 0) ?? (scope.length === 0 ? others[0] : undefined);
  if (alone !== undefined) return { rule: 'alone', holder: alone.id };
  if (scope.length === 0) return null;
  const chain = baseChainOf(quest, quests);
  const holder = on.holders.find(
    (other) => other.id !== quest.id && !chain.has(other.id) && scopesMeet(scope, scopeOf(other), on.shared),
  );
  return holder === undefined ? null : { rule: 'scope', holder: holder.id };
}

/** The scope rules over the kingdom's quests for one tick, kept up to date as the roster starts quests. */
export interface ScopeBook {
  /** Why `quest` may not start on `territory` (its own) now, or null. */
  readonly waitOf: (quest: Quest, territory: Pick<Territory, 'id' | 'shared_paths'>) => ScopeWait | null;
  /** `quest` starts in this tick: a session-tier quest works from now, and holds its scope when it has one. */
  readonly start: (quest: Quest) => void;
}

export function scopeBookOf(quests: readonly Quest[]): ScopeBook {
  const working = quests.filter(worksOnTerritory);
  const holders = quests.filter(holdsScope);
  return {
    waitOf: (quest, territory) => {
      const on = (other: Quest): boolean => other.territory === territory.id;
      const scopes = {
        working: working.filter(on),
        holders: holders.filter(on),
        shared: sharedGlobsOf(territory),
      };
      return scopeWaitOf(quest, scopes, quests);
    },
    start: (quest) => {
      if (quest.tier !== 'session') return;
      working.push(quest);
      if (scopeOf(quest).length > 0) holders.push(quest);
    },
  };
}

/**
 * Why `quest` waits on its territory's scope rules as the kingdom stands, for `quest list` and the owner's report:
 * not a claim blocker (claimBlocker), since this wait ends by itself. `territory` gives the shared paths.
 */
export const scopeHolderOf = (
  quest: Quest,
  quests: readonly Quest[],
  territory?: Pick<Territory, 'shared_paths'>,
): ScopeWait | null =>
  scopeBookOf(quests).waitOf(quest, { id: quest.territory, shared_paths: territory?.shared_paths });

/** Statuses in which a quest waits to start a session: the scope rules may be what it waits for. */
export const SCOPE_WAITING_STATUSES: readonly Quest['status'][] = ['open', 'claimed', 'returned'];

/** A done quest that still holds its scope while quests ready to start wait for it (the owner's digest, PS-03). */
export interface ScopeHold {
  readonly quest: QuestId;
  readonly waiting: readonly QuestId[];
}

/**
 * The done quests that hold a scope other quests wait for (R3), each with the quests that wait, their dependencies
 * finished: once the owner merges and archives it, they start. `territories` give the shared paths.
 */
export function scopeHoldsOf(
  quests: readonly Quest[],
  territories: readonly Pick<Territory, 'id' | 'shared_paths'>[],
): ScopeHold[] {
  const book = scopeBookOf(quests);
  const finished = new Set(quests.filter(questFinished).map(({ id }) => id));
  const done = new Set(quests.filter(({ status }) => status === 'done').map(({ id }) => id));
  const held = new Map<QuestId, QuestId[]>();
  for (const quest of quests) {
    if (!SCOPE_WAITING_STATUSES.includes(quest.status)) continue;
    if (!quest.depends_on.every((id) => finished.has(id))) continue;
    const territory = territories.find(({ id }) => id === quest.territory) ?? { id: quest.territory };
    const wait = book.waitOf(quest, territory);
    if (wait?.rule !== 'scope' || !done.has(wait.holder)) continue;
    held.set(wait.holder, [...(held.get(wait.holder) ?? []), quest.id]);
  }
  return [...held].map(([quest, waiting]) => ({ quest, waiting }));
}
