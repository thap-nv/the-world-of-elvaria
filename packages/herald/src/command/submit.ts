// What the Herald does with a command it sealed (ADR 0031 items 5 and 6, ADR 0037, ADR 0038): the domain's deviceMay,
// with the scope its world gives and the passkey signature the command carries, checked against the device file read
// again. A phone's command of group 2 or 3 without a signature gets the command's challenge back when its device has a
// passkey to sign it, and waits for `confirm`. Else it lands in inbox/; a pair_device brings the new device's pairing
// code, printed to the device that asked only. The Herald never applies a command: the Steward does, and checks again.
import {
  checkConfirmation,
  commandChallenge,
  commandGroupOf,
  commandScopeOf,
  deviceMay,
  isPairingKind,
  livePasskeys,
} from '@elvaria/domain';
import type { Device, InboxCommand, ScopeLookup, WorldState } from '@elvaria/domain';
import { nodePasskeyCrypto } from '@elvaria/store';

import { issuePairingCode } from '../pairing/pairing.ts';
import type { FeedView } from '../stream/world-feed.ts';
import { deviceOf, refused } from './answer.ts';
import type { CommandAnswer, CommandDeps, CommandRefusal, Sender } from './answer.ts';

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

/** deviceMay on `command` as it stands, its signature checked against `device`'s passkeys. */
function mayOf(command: InboxCommand, sender: Sender, device: Device | undefined, view: FeedView) {
  const { confirmation } = command;
  const passkeys = device?.passkeys ?? [];
  return deviceMay({
    source: sender.source,
    device,
    kind: command.kind,
    group: commandGroupOf(command),
    scope: commandScopeOf(command, lookupOf(view.state)),
    confirmation:
      confirmation === undefined
        ? undefined
        : checkConfirmation({ crypto: nodePasskeyCrypto, command, confirmation, passkeys }),
    deliverable: deliverableOf(view, command),
    quest: questOf(view.state, command),
  });
}

/** The answer of a written command: `accepted`, with the pairing code of the device a pair_device makes. */
async function written(ref: string, command: InboxCommand, deps: CommandDeps): Promise<CommandAnswer> {
  const accepted = { type: 'accepted', ref, command_id: command.id } as const;
  if (!isPairingKind(command.kind) || !('device' in command.payload))
    return { reply: accepted, kind: command.kind };
  const { device } = command.payload;
  const issued = await issuePairingCode({ root: deps.store.root, ...deps }, device);
  // The command is in inbox/ already: without a code the owner pairs the device again from the machine.
  if (!issued.ok) return { reply: accepted, kind: command.kind };
  return { reply: { ...accepted, pairing: { device, ...issued.value } }, kind: command.kind };
}

/** The Herald's answer to `command`, sealed for `ref`: a refusal, a challenge, or the command in inbox/. */
export async function submit(
  ref: string,
  command: InboxCommand,
  sender: Sender,
  deps: CommandDeps,
): Promise<CommandAnswer> {
  const device = await deviceOf(deps.store, sender.device);
  const may = mayOf(command, sender, device, deps.view());
  const keys = device === undefined ? [] : livePasskeys(device);
  if (!may.ok && may.error.code === 'passkey_required' && keys.length > 0) {
    deps.challenges.hold(sender.device, ref, { for: 'command', command }, deps.clock.now());
    const challenge = commandChallenge(nodePasskeyCrypto, command);
    return {
      reply: { type: 'challenge', ref, challenge, passkeys: keys.map(({ id }) => id) },
      kind: command.kind,
    };
  }
  if (!may.ok) return refused(ref, may.error.code, command.kind);
  const stored = await deps.store.inbox.write(command);
  if (!stored.ok) return refused(ref, 'failed' satisfies CommandRefusal, command.kind);
  return written(ref, command, deps);
}
