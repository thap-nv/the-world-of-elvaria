// A command from a stream, in a fixed order (wave-1 plan P2-01c; ADR 0031 item 5, ADR 0037): decode the frame,
// count it against the device's rate, read the device file again (a revoke takes effect at once), seal the envelope
// (the Herald picks `id`, `ts`, `source` and `device`; the client only `kind` and `payload`), ask the domain's
// deviceMay with the scope the Herald's world gives, and only then drop it in inbox/. The Herald never applies a
// command: the Steward does, and checks the device again (ADR 0005).
import {
  commandGroupOf,
  commandOf,
  commandScopeOf,
  decodeClientMessage,
  deviceMay,
  CommandRefSchema,
} from '@elvaria/domain';
import type {
  Clock,
  Device,
  DeviceId,
  DeviceSource,
  IdSource,
  InboxCommand,
  Instant,
  ScopeLookup,
  ServerMessage,
  WorldState,
} from '@elvaria/domain';
import type { KingdomStore } from '@elvaria/store';

import type { FeedView } from '../stream/world-feed.ts';
import type { CommandRate } from './rate.ts';

export interface CommandDeps {
  readonly store: KingdomStore;
  readonly clock: Clock;
  readonly format: (at: Instant) => string;
  readonly ids: Pick<IdSource, 'ulid'>;
  readonly rate: CommandRate;
  readonly view: () => FeedView;
}

/** Who sent the frame: the device of the stream's session, through the origin the stream was opened from. */
export interface Sender {
  readonly device: DeviceId;
  readonly source: DeviceSource;
}

/** Refusals of the Herald's own, besides deviceMay's codes. */
export type CommandRefusal = 'invalid_message' | 'too_many_commands' | 'failed';

/** The message to send back, and the kind the frame asked for when it could be read. */
export interface CommandAnswer {
  readonly reply: ServerMessage;
  readonly kind: string | undefined;
}

const refused = (ref: string, reason: string, kind?: string): CommandAnswer => ({
  reply: { type: 'refused', ref, reason },
  kind,
});

/** The `ref` of a frame that is no command, when it names one: the client can then match the refusal. */
function refOf(text: string): string | undefined {
  try {
    const ref = CommandRefSchema.safeParse((JSON.parse(text) as { ref?: unknown } | null)?.ref);
    return ref.success ? ref.data : undefined;
  } catch {
    return undefined;
  }
}

async function deviceOf(store: KingdomStore, id: DeviceId): Promise<Device | undefined> {
  const read = await store.devices.read(id);
  return read.ok ? read.value : undefined;
}

const lookupOf = (state: WorldState): ScopeLookup => ({
  territoryOf: (quest) => state.quests[quest]?.territory,
  questOf: (memo) => state.memos[memo]?.quest ?? undefined,
});

const questOf = (state: WorldState, command: InboxCommand) =>
  'quest' in command.payload && command.payload.quest !== undefined
    ? state.quests[command.payload.quest]
    : undefined;

/** The deliverable of a new quest's kind, which tells an inquiry device's report from any other work (W7). */
const deliverableOf = (view: FeedView, command: InboxCommand) =>
  command.kind === 'create_quest'
    ? view.registry.kinds.find(({ id }) => id === command.payload.kind)?.deliverable_type
    : undefined;

/** The refusal code of deviceMay for `command`, or undefined when the device may send it. */
async function refusalOf(
  command: InboxCommand,
  sender: Sender,
  deps: CommandDeps,
): Promise<string | undefined> {
  const view = deps.view();
  const may = deviceMay({
    source: sender.source,
    device: await deviceOf(deps.store, sender.device),
    kind: command.kind,
    group: commandGroupOf(command),
    scope: commandScopeOf(command, lookupOf(view.state)),
    deliverable: deliverableOf(view, command),
    quest: questOf(view.state, command),
  });
  return may.ok ? undefined : may.error.code;
}

/**
 * The answer to one text frame: `accepted` once the command is in inbox/, else `refused` with a code. Undefined for a
 * frame that names no ref to answer to: the stream is then closed.
 */
export async function answerCommand(
  text: string,
  sender: Sender,
  deps: CommandDeps,
): Promise<CommandAnswer | undefined> {
  const decoded = decodeClientMessage(text);
  if (!decoded.ok) {
    const ref = refOf(text);
    return ref === undefined ? undefined : refused(ref, 'invalid_message' satisfies CommandRefusal);
  }
  // The passkey messages of SEC-08 are not answered yet.
  if (decoded.value.type !== 'command') return refused(decoded.value.ref, 'invalid_message');
  const { ref, kind } = decoded.value;
  const now = deps.clock.now();
  if (!deps.rate.take(sender.device, now))
    return refused(ref, 'too_many_commands' satisfies CommandRefusal, kind);
  const envelope = { id: deps.ids.ulid(), ts: deps.format(now), ...sender };
  const command = commandOf(decoded.value, envelope);
  if (!command.ok) return refused(ref, 'invalid_message' satisfies CommandRefusal, kind);
  const refusal = await refusalOf(command.value, sender, deps);
  if (refusal !== undefined) return refused(ref, refusal, kind);
  const written = await deps.store.inbox.write(command.value);
  if (!written.ok) return refused(ref, 'failed' satisfies CommandRefusal, kind);
  return { reply: { type: 'accepted', ref, command_id: command.value.id }, kind };
}
