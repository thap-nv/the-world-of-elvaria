// The passkey's half of a stream (SEC-08, ADR 0031 item 6, ADR 0038). `confirm` brings the signature of a command
// the Herald challenged; `enroll` asks for a fresh challenge to register a passkey, which only a device reached through
// the tunnel gets, and for its first passkey only within FIRST_PASSKEY_WINDOW_MS of its pairing; `register` brings the
// browser's new passkey, which the Herald checks and turns into the device's own add_passkey command.
import { checkRegistration, commandOf, livePasskeys, toBase64url } from '@elvaria/domain';
import type { ClientMessage, Instant } from '@elvaria/domain';
import { nodePasskeyCrypto } from '@elvaria/store';

import { FIRST_PASSKEY_WINDOW_MS, PASSKEY_CHALLENGE_BYTES } from '../limit/limits.ts';
import { deviceOf, refused } from './answer.ts';
import type { CommandAnswer, CommandDeps, CommandRefusal, Sender } from './answer.ts';
import { submit } from './submit.ts';

type Message<T extends ClientMessage['type']> = Extract<ClientMessage, { type: T }>;

const ADD_PASSKEY = 'add_passkey';
const noChallenge = (ref: string, kind?: string) =>
  refused(ref, 'no_challenge' satisfies CommandRefusal, kind);

/** The command the Herald challenged for `ref`, signed now: checked again from the device file, then written. */
export async function answerConfirm(
  { ref, confirmation }: Message<'confirm'>,
  sender: Sender,
  deps: CommandDeps,
): Promise<CommandAnswer> {
  const waiting = deps.challenges.take(sender.device, ref, deps.clock.now());
  if (waiting?.for !== 'command') return noChallenge(ref);
  return submit(ref, { ...waiting.command, confirmation }, sender, deps);
}

/** Whether a session opened at `opened_at` still may register a device's first passkey at `now`. */
const freshlyPaired = (openedAt: string, now: Instant): boolean =>
  now - Date.parse(openedAt) <= FIRST_PASSKEY_WINDOW_MS;

/** A fresh challenge for a new passkey of the sender, listing the passkeys it holds for the browser to exclude. */
export async function answerEnroll(
  { ref }: Message<'enroll'>,
  sender: Sender,
  deps: CommandDeps,
): Promise<CommandAnswer> {
  // WebAuthn needs the tunnel's HTTPS host; on loopback no passkey is asked anyway (ADR 0031 item 6).
  if (sender.source !== 'lite')
    return refused(ref, 'passkey_needs_tunnel' satisfies CommandRefusal, ADD_PASSKEY);
  const device = await deviceOf(deps.store, sender.device);
  if (device === undefined) return refused(ref, 'unknown_device', ADD_PASSKEY);
  if (device.revoked_at !== undefined) return refused(ref, 'device_revoked', ADD_PASSKEY);
  const now = deps.clock.now();
  if (livePasskeys(device).length === 0 && !freshlyPaired(sender.opened_at, now))
    return refused(ref, 'enroll_closed' satisfies CommandRefusal, ADD_PASSKEY);
  const challenge = toBase64url(deps.random.bytes(PASSKEY_CHALLENGE_BYTES));
  deps.challenges.hold(sender.device, ref, { for: 'registration', challenge }, now);
  const passkeys = (device.passkeys ?? []).map(({ id }) => id);
  return { reply: { type: 'challenge', ref, challenge, passkeys }, kind: ADD_PASSKEY };
}

/**
 * The browser's new passkey for the challenge of `ref`: once checked, the device's add_passkey, sealed as any command.
 * A device with a live passkey then gets that command's challenge back: a later passkey needs a signature by one.
 */
export async function answerRegister(
  { ref, registration }: Message<'register'>,
  sender: Sender,
  deps: CommandDeps,
): Promise<CommandAnswer> {
  const now = deps.clock.now();
  const waiting = deps.challenges.take(sender.device, ref, now);
  if (waiting?.for !== 'registration') return noChallenge(ref, ADD_PASSKEY);
  const checked = checkRegistration({
    crypto: nodePasskeyCrypto,
    challenge: waiting.challenge,
    origin: sender.origin,
    registration,
  });
  if (!checked.ok) return refused(ref, checked.error.code, ADD_PASSKEY);
  const message = { type: 'command', ref, kind: ADD_PASSKEY, payload: { passkey: checked.value } } as const;
  const { device, source } = sender;
  const command = commandOf(message, { id: deps.ids.ulid(), ts: deps.format(now), source, device });
  if (!command.ok) return refused(ref, 'invalid_message' satisfies CommandRefusal, ADD_PASSKEY);
  return submit(ref, command.value, sender, deps);
}
