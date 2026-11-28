// A small kingdom for the stream specs: two territories, a quest on each, built from the domain's examples (read the
// way the sandbox's fixture reads the default registry: a file of a sibling package, never its code), and lines of
// the log as the Steward and the hook write them.
import { readFileSync } from 'node:fs';

import {
  EVENT_VERSION,
  EventSchema,
  QuestSchema,
  TerritorySchema,
  formatUlid,
  questViewOf,
} from '@elvaria/domain';
import type { DeviceId, Event, Instant, Quest, Territory } from '@elvaria/domain';

import { START, format } from './herald.ts';

const EXAMPLES = new URL('../../../domain/examples/', import.meta.url);

const firstExample = (name: string): Record<string, unknown> => {
  const all = JSON.parse(readFileSync(new URL(`${name}.json`, EXAMPLES), 'utf8')) as Record<
    string,
    unknown
  >[];
  const [first] = all;
  if (first === undefined) throw new Error(`no example of ${name}`);
  return first;
};

export const NORTH = 'north';
export const SOUTH = 'south';

export const territoryOf = (id: string): Territory =>
  TerritorySchema.parse({ ...firstExample('territory'), id, name: id });

export function questOf(suffix: string, territory: string, title = `Quest of ${territory}`): Quest {
  const example = firstExample('quest');
  const id = `q_20261127_${suffix}`;
  // The example's plot is on its own quest branch; a new id moves it.
  const plot = { ...(example.plot as Record<string, unknown>), branch: `quest/${id}` };
  return QuestSchema.parse({ ...example, id, territory, title, plot });
}

export const Q_NORTH = questOf('n0rth1', NORTH);
export const Q_SOUTH = questOf('s0th01', SOUTH);

let serial = 0;

/** A line of the log `ms` after START; each gets the next id. */
export function line(fields: Record<string, unknown>, ms = 0): Event {
  serial += 1;
  const at = (START + ms) as Instant;
  return EventSchema.parse({
    v: EVENT_VERSION,
    id: formatUlid(at, BigInt(serial)),
    ts: format(at),
    ...fields,
  });
}

/** The Steward's line of a quest's move, carrying its view; `question` puts free text in the view. */
export const questLine = (quest: Quest, question: string | null = null): Event =>
  line({
    type: 'quest.created',
    actor: { kind: 'steward' },
    quest: quest.id,
    territory: quest.territory,
    data: { quest: { ...questViewOf(quest), question } },
  });

/** A tool call the hook logged for `quest`; `command` is free text. */
export const toolLine = (quest: Quest, command: string): Event =>
  line({
    type: 'agent.tool',
    actor: { kind: 'character', id: 'thorn' },
    quest: quest.id,
    attempt: 1,
    territory: quest.territory,
    data: { tool: 'bash', command, exit: 0 },
  });

/** The Steward's line for a command of `device` that names no quest. */
export const appliedLine = (device: DeviceId, kind = 'wake'): Event =>
  line({
    type: 'command.applied',
    actor: { kind: 'steward' },
    data: { command_id: formatUlid(START, BigInt(900 + serial)), kind, device },
  });
