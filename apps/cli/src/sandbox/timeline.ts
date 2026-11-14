// One line of a replayed day as the owner reads it: the local time, then a sentence in the owner's language
// (ADR 0014). Every value comes from the line itself, the view it carries (P0-09) or a name met on an earlier
// line, so a timeline needs no kingdom files; with the kingdom's registry, classes and kinds get their names.
import type {
  CharacterView,
  Event,
  InfirmaryReason,
  QuestView,
  Registry,
  TerritoryView,
} from '@elvaria/domain';
import type { Locale, MessageKey, Params, Translate } from '@elvaria/i18n';

import { nameIn } from '../labels.ts';
import { NONE } from '../listing.ts';
import { reasonText } from '../quest/infirmary-reason.ts';

export interface TimelineContext {
  readonly t: Translate;
  readonly locale: Locale;
  readonly registry?: Registry | undefined;
}

/** `HH:MM:SS` of an ISO 8601 time with offset: the kingdom's local time, as the line was written. */
const TIME = { from: 11, to: 19 } as const;

const LINE_KEYS: Readonly<Record<string, MessageKey>> = {
  'quest.drafted': 'cli.sandbox.line.quest.drafted',
  'quest.created': 'cli.sandbox.line.quest.created',
  'quest.claimed': 'cli.sandbox.line.quest.claimed',
  'quest.released': 'cli.sandbox.line.quest.released',
  'quest.started': 'cli.sandbox.line.quest.started',
  'quest.submitted': 'cli.sandbox.line.quest.submitted',
  'quest.returned': 'cli.sandbox.line.quest.returned',
  'quest.verdict': 'cli.sandbox.line.quest.verdict',
  'quest.done': 'cli.sandbox.line.quest.done',
  'quest.sealed': 'cli.sandbox.line.quest.sealed',
  'quest.archived': 'cli.sandbox.line.quest.archived',
  'quest.blocked': 'cli.sandbox.line.quest.blocked',
  'quest.unblocked': 'cli.sandbox.line.quest.unblocked',
  'quest.paused': 'cli.sandbox.line.quest.paused',
  'quest.resumed': 'cli.sandbox.line.quest.resumed',
  'quest.infirmary': 'cli.sandbox.line.quest.infirmary',
  'quest.delivered': 'cli.sandbox.line.quest.delivered',
  'character.created': 'cli.sandbox.line.character.created',
  'character.sleep': 'cli.sandbox.line.character.sleep',
  'character.wake': 'cli.sandbox.line.character.wake',
  'character.meditate': 'cli.sandbox.line.character.meditate',
  'character.suspend': 'cli.sandbox.line.character.suspend',
  'character.release': 'cli.sandbox.line.character.release',
  'character.swamp': 'cli.sandbox.line.character.swamp',
  'character.level_up': 'cli.sandbox.line.character.level_up',
  'character.level_down': 'cli.sandbox.line.character.level_down',
  'territory.attached': 'cli.sandbox.line.territory.attached',
  'territory.surveyed': 'cli.sandbox.line.territory.surveyed',
  'territory.health': 'cli.sandbox.line.territory.health',
  'mana.level': 'cli.sandbox.line.mana.level',
  'mana.warning': 'cli.sandbox.line.mana.warning',
  'mana.exhausted': 'cli.sandbox.line.mana.exhausted',
  'mana.restored': 'cli.sandbox.line.mana.restored',
  'mana.probe': 'cli.sandbox.line.mana.probe',
  'mana.signal': 'cli.sandbox.line.mana.signal',
  'agent.session.start': 'cli.sandbox.line.agent.session.start',
  'agent.session.end': 'cli.sandbox.line.agent.session.end',
  'agent.tool': 'cli.sandbox.line.agent.tool',
  'agent.tool.blocked': 'cli.sandbox.line.agent.tool.blocked',
  'verdict.pass': 'cli.sandbox.line.verdict.pass',
  'verdict.fail': 'cli.sandbox.line.verdict.fail',
  'verdict.partial': 'cli.sandbox.line.verdict.partial',
  'command.received': 'cli.sandbox.line.command.received',
  'command.applied': 'cli.sandbox.line.command.applied',
  'command.rejected': 'cli.sandbox.line.command.rejected',
};

const LABELS: Readonly<Record<string, MessageKey>> = {
  five_hour: 'cli.sandbox.window.five_hour',
  weekly: 'cli.sandbox.window.weekly',
  completed: 'cli.sandbox.outcome.completed',
  max_turns: 'cli.sandbox.outcome.max_turns',
  budget: 'cli.sandbox.outcome.budget',
  killed: 'cli.sandbox.outcome.killed',
  error: 'cli.sandbox.outcome.error',
  read: 'cli.sandbox.tool.read',
  write: 'cli.sandbox.tool.write',
  bash: 'cli.sandbox.tool.bash',
  web: 'cli.sandbox.tool.web',
  search: 'cli.sandbox.tool.search',
  other: 'cli.sandbox.tool.other',
};

type Data = Readonly<Record<string, unknown>>;

const objectIn = (data: Data, key: string): object | undefined => {
  const value = data[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
};

const textIn = (data: Data, key: string): string | undefined => {
  const value = data[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
};

/**
 * A plain reason as written; the code and params of a `quest.infirmary` reason (contract infirmary-reason-codes)
 * in the owner's language, its sentence only: a timeline gives each line one row, so a refusing hook's lines stay
 * for `quest show`. EventSchema has checked that line's reason, so its shape is `InfirmaryReason`.
 */
function reasonIn(t: Translate, data: Data): string | undefined {
  const reason = objectIn(data, 'reason') as InfirmaryReason | undefined;
  if (reason === undefined) return textIn(data, 'reason');
  const [sentence] = reasonText(t, reason).split('\n');
  return sentence;
}

/** A quest moved into review by assign_verifier, or left there by its verifier, has a sentence of its own. */
function keyOf(event: Event, quest: QuestView | undefined): MessageKey {
  const inReview = quest?.status === 'review';
  if (event.type === 'quest.started' && inReview) return 'cli.sandbox.line.quest.review_started';
  if (event.type === 'quest.verdict' && inReview) return 'cli.sandbox.line.quest.verdict_partial';
  return LINE_KEYS[event.type] ?? 'cli.sandbox.line.other';
}

/** Names from the views a line carries: the character it is about, and those the same step moved. */
function learnNames(names: Map<string, string>, data: Data): void {
  const one = objectIn(data, 'character') as CharacterView | undefined;
  const many = Array.isArray(data.characters) ? (data.characters as CharacterView[]) : [];
  for (const view of one === undefined ? many : [one, ...many]) names.set(view.id, view.name);
}

interface Lookup {
  readonly context: TimelineContext;
  readonly names: ReadonlyMap<string, string>;
}

const nameOf = ({ names }: Lookup, id: string | null): string => (id === null ? NONE : (names.get(id) ?? id));

function whoOf(lookup: Lookup, event: Event): string {
  const { t } = lookup.context;
  if (textIn(event.data, 'verifier') === 'machine') return t('cli.sandbox.who.machine');
  if (event.actor.kind === 'character') return nameOf(lookup, event.actor.id ?? null);
  if (event.actor.kind === 'steward') return t('cli.sandbox.who.steward');
  if (event.actor.kind === 'user') return t('cli.sandbox.who.owner');
  return event.actor.kind;
}

function questParams(lookup: Lookup, quest: QuestView): Params {
  const { t, locale, registry } = lookup.context;
  const kind = registry?.kinds.find(({ id }) => id === quest.kind);
  return {
    quest: quest.id,
    title: quest.title,
    kind: kind === undefined ? quest.kind : nameIn(locale, kind),
    rank: quest.rank,
    attempts: quest.attempts,
    max: quest.max_attempts,
    // A script-tier quest is the Steward's own (§2.5): nobody holds it.
    assignee: quest.assignee === null ? t('cli.sandbox.who.steward') : nameOf(lookup, quest.assignee),
    verifier: nameOf(lookup, quest.verifier),
    question: quest.question ?? NONE,
  };
}

function characterParams({ context }: Lookup, character: CharacterView): Params {
  const klass = context.registry?.classes.find(({ id }) => id === character.class);
  return {
    name: character.name,
    class: klass === undefined ? character.class : nameIn(context.locale, klass),
    level: character.level,
    tribe: character.tribe,
    current: character.current?.quest ?? NONE,
  };
}

const territoryParams = (territory: TerritoryView): Params => ({
  territory: territory.name,
  ci: territory.health.ci,
  bugs: territory.health.open_bugs,
});

/** The plain values some types carry: mana, sessions, tools, verdicts, reasons. */
function plainParams({ context }: Lookup, data: Data): Params {
  const label = (key: string): string => {
    const value = textIn(data, key) ?? NONE;
    const message = LABELS[value];
    return message === undefined ? value : context.t(message);
  };
  return {
    tribe: textIn(data, 'tribe') ?? NONE,
    pool: textIn(data, 'pool') ?? NONE,
    pct: textIn(data, 'used_pct') ?? NONE,
    window: label('window'),
    model: textIn(data, 'model') ?? NONE,
    outcome: label('outcome'),
    tool: label('tool'),
    target: textIn(data, 'path') ?? textIn(data, 'command') ?? textIn(data, 'url') ?? '',
    reason: reasonIn(context.t, data) ?? NONE,
    error: textIn(data, 'error') ?? NONE,
    fail_kind: textIn(data, 'fail_kind') ?? NONE,
  };
}

/** A formatter for the lines of one replay, in order: it remembers the names it has met. */
export function timeline(context: TimelineContext): (event: Event) => string {
  const names = new Map<string, string>();
  return (event) => {
    learnNames(names, event.data);
    const lookup = { context, names };
    // EventSchema has checked `data` of every type that carries a view, so its shape is the view's.
    const quest = objectIn(event.data, 'quest') as QuestView | undefined;
    const character = objectIn(event.data, 'character') as CharacterView | undefined;
    const territory = objectIn(event.data, 'territory') as TerritoryView | undefined;
    const params: Params = {
      type: event.type,
      who: whoOf(lookup, event),
      quest: event.quest ?? NONE,
      ...plainParams(lookup, event.data),
      ...(quest === undefined ? {} : questParams(lookup, quest)),
      ...(character === undefined ? {} : characterParams(lookup, character)),
      ...(territory === undefined ? {} : territoryParams(territory)),
    };
    return `${event.ts.slice(TIME.from, TIME.to)}  ${context.t(keyOf(event, quest), params)}`;
  };
}
