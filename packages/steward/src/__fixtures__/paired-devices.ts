// A kingdom with paired devices and a passkey, and commands as the Herald writes them, signed or not (SEC-08): the
// Steward's specs of the device check and the device commands.
import { openEventLog } from '@elvaria/eventlog';
import { DeviceSchema, commandChallenge } from '@elvaria/domain';
import type { Device, DeviceId, InboxCommandInput, SignedCommand } from '@elvaria/domain';
import { nodePasskeyCrypto } from '@elvaria/store';
import { testPasskey } from '@elvaria/testkit';
import type { TestPasskey } from '@elvaria/testkit';

import type { Bench } from './kingdom.ts';

export const AT = '2026-11-07T08:00:00+07:00';
export const TS = '2026-11-07T09:00:00+07:00';
export const KEY = testPasskey('es256');
export const OTHER_KEY = testPasskey('rs256');
const stored = (key: TestPasskey, revoked?: string) => ({
  id: key.id,
  public_key: key.public_key,
  algorithm: key.algorithm,
  origin: key.origin,
  sign_count: 0,
  added_at: AT,
  ...(revoked === undefined ? {} : { revoked_at: revoked }),
});

export const DEVICES = {
  owner: { id: 'dev_20261107_7pzkfv', role: 'full', passkeys: [stored(KEY), stored(OTHER_KEY, AT)] },
  docs: { id: 'dev_20261107_4k2pqz', role: 'scoped', territories: ['handbook'] },
  asks: { id: 'dev_20261107_9tw3hx', role: 'inquiry', territories: ['dc1-se-team'] },
} as const;
type Name = keyof typeof DEVICES;
export const NEW = 'dev_20261107_5m8q2r' as DeviceId;

interface Sent {
  readonly source?: 'herald' | 'lite' | 'chancellor';
  /** Signs the command with this passkey; `for` signs another command's challenge instead. */
  readonly key?: TestPasskey;
  readonly for?: string;
  readonly signCount?: number;
}

/** A command as the Herald writes it, signed by `sent.key` over its own challenge unless `sent.for` names another id. */
export async function send(
  kingdom: Bench,
  device: Name,
  kind: string,
  payload: object,
  sent: Sent = {},
): Promise<string> {
  const id = kingdom.ids.ulid();
  const signed = { id, kind, payload } as unknown as SignedCommand;
  const challenge = commandChallenge(nodePasskeyCrypto, {
    ...signed,
    id: (sent.for ?? id) as SignedCommand['id'],
  });
  const confirmation =
    sent.key === undefined
      ? {}
      : { confirmation: sent.key.sign(challenge, { signCount: sent.signCount ?? 0 }) };
  const source = sent.source ?? 'lite';
  const named = source === 'chancellor' ? {} : { device: DEVICES[device].id };
  const command = { version: 1, id, ts: TS, kind, source, ...named, ...confirmation, payload };
  const written = await kingdom.store.inbox.write(command as unknown as InboxCommandInput);
  if (!written.ok) throw new Error(written.error.message);
  return id;
}

export const answersOf = async (kingdom: Bench, ids: readonly string[]) => {
  const lines = (await openEventLog(kingdom.root).read()).events;
  return ids.map((id) => {
    const line = lines.find(({ type, data }) => type.startsWith('command.') && data.command_id === id);
    return line?.type === 'command.applied' ? 'applied' : line?.data.reason;
  });
};

export const deviceFile = async (kingdom: Bench, id: string): Promise<Device | undefined> => {
  const read = await kingdom.store.devices.read(id as DeviceId);
  return read.ok ? read.value : undefined;
};

/** Writes the device files of DEVICES into `kingdom`. */
export async function withDevices(kingdom: Bench): Promise<void> {
  for (const [label, device] of Object.entries(DEVICES)) {
    const written = await kingdom.store.devices.write(
      DeviceSchema.parse({ version: 1, label, created_at: AT, ...device }),
    );
    if (!written.ok) throw new Error(written.error.message);
  }
}
