// A frame from a stream, in a fixed order (wave-1 plan P2-01c; ADR 0031 item 5, ADR 0037, ADR 0038): decode it,
// count it against the device's rate, then answer by its type. A `command` is sealed in the envelope the Herald picks
// (`id`, `ts`, `source`, `device`, and the new device's id of a pair_device; the client only `kind` and `payload`)
// and submitted (submit.ts); `confirm`, `enroll` and `register` are the passkey's half (passkey.ts).
import { CommandRefSchema, commandOf, decodeClientMessage, isPairingKind } from '@elvaria/domain';
import type { ClientMessage, CommandMessage } from '@elvaria/domain';

import { refused } from './answer.ts';
import type { CommandAnswer, CommandDeps, CommandRefusal, Sender } from './answer.ts';
import { answerConfirm, answerEnroll, answerRegister } from './passkey.ts';
import { submit } from './submit.ts';

export type { CommandDeps } from './answer.ts';

/** The `ref` of a frame that is no message, when it names one: the client can then match the refusal. */
function refOf(text: string): string | undefined {
  try {
    const ref = CommandRefSchema.safeParse((JSON.parse(text) as { ref?: unknown } | null)?.ref);
    return ref.success ? ref.data : undefined;
  } catch {
    return undefined;
  }
}

/** A client's command, sealed and submitted. */
async function answerOrder(
  message: CommandMessage,
  sender: Sender,
  deps: CommandDeps,
): Promise<CommandAnswer> {
  const { ref, kind } = message;
  const { device, source } = sender;
  const envelope = { id: deps.ids.ulid(), ts: deps.format(deps.clock.now()), source, device };
  const pairs = isPairingKind(kind) ? { pairs: deps.ids.device() } : {};
  const command = commandOf(message, { ...envelope, ...pairs });
  if (!command.ok) return refused(ref, 'invalid_message' satisfies CommandRefusal, kind);
  return submit(ref, command.value, sender, deps);
}

/** A decoded frame to whichever half answers its type. */
function answerOf(message: ClientMessage, sender: Sender, deps: CommandDeps): Promise<CommandAnswer> {
  if (message.type === 'confirm') return answerConfirm(message, sender, deps);
  if (message.type === 'enroll') return answerEnroll(message, sender, deps);
  if (message.type === 'register') return answerRegister(message, sender, deps);
  return answerOrder(message, sender, deps);
}

/**
 * The answer to one text frame: `accepted` once a command is in inbox/, a `challenge` for a passkey to sign, else
 * `refused` with a code. Undefined for a frame that names no ref to answer to: the stream is then closed.
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
  const message = decoded.value;
  if (!deps.rate.take(sender.device, deps.clock.now()))
    return refused(
      message.ref,
      'too_many_commands' satisfies CommandRefusal,
      'kind' in message ? message.kind : undefined,
    );
  return answerOf(message, sender, deps);
}
