// The passkey over a real stream through the tunnel (SEC-08, ADR 0031 item 6, ADR 0038): a device registers its first
// passkey right after its pairing, a phone's command of group 2 or 3 gets its own challenge back and lands in inbox/
// only with that passkey's signature on it, and a full device pairs a new device from the phone.
import { DeviceSchema, checkConfirmation } from '@elvaria/domain';
import type { Device, InboxCommand, PasskeyId, ServerMessage } from '@elvaria/domain';
import { nodePasskeyCrypto } from '@elvaria/store';
import { testPasskey } from '@elvaria/testkit';
import type { TestPasskey } from '@elvaria/testkit';
import { afterEach, describe, expect, it } from 'vitest';

import { openClient, streamOf } from '../__fixtures__/client.ts';
import { cookieOf, fullDevice, harness, postCode } from '../__fixtures__/herald.ts';
import { NORTH, Q_NORTH, territoryOf } from '../__fixtures__/world.ts';
import { FIRST_PASSKEY_WINDOW_MS } from '../limit/limits.ts';
import type { Client } from '../__fixtures__/client.ts';
import type { Harness } from '../__fixtures__/herald.ts';

const TUNNEL = 'https://elvaria.example.ts.net';
const KEY = testPasskey('es256', TUNNEL);

let h: Harness | undefined;
afterEach(async () => {
  await h?.stop();
  h = undefined;
});
const started = async (): Promise<Harness> => {
  h = await harness({}, async (store) => {
    await store.territories.write(territoryOf(NORTH));
    await store.quests.write(Q_NORTH);
  });
  return h;
};

/** `device` holding `keys` in its file, as the Steward writes them once it applied add_passkey. */
const keyed = (device: Device, ...keys: readonly TestPasskey[]): Device =>
  DeviceSchema.parse({
    ...device,
    passkeys: keys.map(({ id, public_key, algorithm, origin }) => ({
      id,
      public_key,
      algorithm,
      origin,
      sign_count: 0,
      added_at: '2026-11-27T03:00:00.000Z',
    })),
  });

/** A stream of `device` through the tunnel: its commands are of source lite. */
async function tunnelOf(herald: Harness, device: Device): Promise<Client> {
  const cookie = cookieOf(await postCode(herald.herald.port, await herald.code(device)));
  const opened = await openClient(herald.herald.port, { cookie, origin: TUNNEL, host: new URL(TUNNEL).host });
  if (!opened.ok) throw new Error(`refused: ${opened.status}`);
  return opened.client;
}

/** Sends `frame` and awaits the Herald's answer to it. */
async function send(
  client: Client,
  frame: object,
): Promise<Exclude<ServerMessage, { type: 'snapshot' | 'events' | 'attention' }>> {
  client.send(JSON.stringify(frame));
  return client.next('accepted', 'refused', 'challenge');
}
const order = (client: Client, ref: string, kind: string, payload: object) =>
  send(client, { type: 'command', ref, kind, payload });
const confirm = (client: Client, ref: string, key: TestPasskey, challenge: string) =>
  send(client, { type: 'confirm', ref, confirmation: key.sign(challenge) });

const inbox = async (herald: Harness): Promise<InboxCommand[]> =>
  (await herald.store.inbox.read()).flatMap(({ command }) => (command.ok ? [command.value] : []));

const challengeOf = (answer: Awaited<ReturnType<typeof send>>): string => {
  if (answer.type !== 'challenge') throw new Error(`no challenge: ${JSON.stringify(answer)}`);
  return answer.challenge;
};

describe('registering a passkey (SEC-08)', () => {
  it("takes a device's first passkey right after its pairing, as the device's own add_passkey", async () => {
    const herald = await started();
    const client = await tunnelOf(herald, fullDevice());
    const asked = await send(client, { type: 'enroll', ref: 'k1' });
    expect(asked).toMatchObject({ type: 'challenge', ref: 'k1', passkeys: [] });
    const registration = KEY.register(challengeOf(asked));
    expect(await send(client, { type: 'register', ref: 'k1', registration })).toMatchObject({
      type: 'accepted',
    });
    expect(await inbox(herald)).toMatchObject([
      {
        kind: 'add_passkey',
        source: 'lite',
        device: fullDevice().id,
        payload: {
          passkey: {
            id: KEY.id,
            public_key: KEY.public_key,
            algorithm: 'es256',
            origin: TUNNEL,
            sign_count: 0,
          },
        },
      },
    ]);
    expect(await send(client, { type: 'register', ref: 'k1', registration })).toMatchObject({
      reason: 'no_challenge',
    });
  });

  it('refuses a registration for another challenge, after the pairing window, or on loopback', async () => {
    const herald = await started();
    const client = await tunnelOf(herald, fullDevice());
    await send(client, { type: 'enroll', ref: 'k1' });
    const other = KEY.register('b3RoZXI');
    expect(await send(client, { type: 'register', ref: 'k1', registration: other })).toMatchObject({
      reason: 'passkey_mismatch',
    });
    herald.clock.advance(FIRST_PASSKEY_WINDOW_MS + 1);
    expect(await send(client, { type: 'enroll', ref: 'k2' })).toMatchObject({ reason: 'enroll_closed' });
    const loopback = await streamOf(herald, fullDevice('bbbbbb'));
    expect(await send(loopback, { type: 'enroll', ref: 'k3' })).toMatchObject({
      reason: 'passkey_needs_tunnel',
    });
    expect(await inbox(herald)).toEqual([]);
  });

  it('asks a device that holds a passkey for its signature on a later one, at any time', async () => {
    const herald = await started();
    const client = await tunnelOf(herald, keyed(fullDevice(), KEY));
    herald.clock.advance(FIRST_PASSKEY_WINDOW_MS + 1);
    const asked = await send(client, { type: 'enroll', ref: 'k1' });
    expect(asked).toMatchObject({ type: 'challenge', passkeys: [KEY.id] });
    const second = testPasskey('ed25519', TUNNEL);
    const registered = await send(client, {
      type: 'register',
      ref: 'k1',
      registration: second.register(challengeOf(asked)),
    });
    expect(registered).toMatchObject({ type: 'challenge', passkeys: [KEY.id] });
    expect(await confirm(client, 'k1', KEY, challengeOf(registered))).toMatchObject({ type: 'accepted' });
    expect((await inbox(herald)).map(({ kind, confirmation }) => [kind, confirmation?.passkey])).toEqual([
      ['add_passkey', KEY.id],
    ]);
  });
});

describe('confirming a command with the passkey (SEC-08)', () => {
  it('answers a command of group 2 with its own challenge, and writes it once signed', async () => {
    const herald = await started();
    const client = await tunnelOf(herald, keyed(fullDevice(), KEY));
    const asked = await order(client, 's1', 'seal', { quest: Q_NORTH.id });
    expect(asked).toMatchObject({ type: 'challenge', ref: 's1', passkeys: [KEY.id] });
    expect(await inbox(herald)).toEqual([]);
    expect(await confirm(client, 's1', KEY, challengeOf(asked))).toMatchObject({
      type: 'accepted',
      ref: 's1',
    });
    const [written] = await inbox(herald);
    // The signature stands for the command as written, id included: the Steward checks it again there.
    const again = checkConfirmation({
      crypto: nodePasskeyCrypto,
      command: written!,
      confirmation: written!.confirmation!,
      passkeys: keyed(fullDevice(), KEY).passkeys!,
    });
    expect(again).toEqual({ ok: true, value: { passkey: KEY.id, sign_count: 0 } });
    expect(await confirm(client, 's1', KEY, challengeOf(asked))).toMatchObject({ reason: 'no_challenge' });
  });

  it("refuses the signature of another command, a revoked passkey's, and a challenge that expired", async () => {
    const herald = await started();
    const client = await tunnelOf(herald, keyed(fullDevice(), KEY));
    const first = challengeOf(await order(client, 's1', 'seal', { quest: Q_NORTH.id }));
    const second = challengeOf(await order(client, 's2', 'deliver', { quest: Q_NORTH.id }));
    expect(await confirm(client, 's1', KEY, second)).toMatchObject({ reason: 'passkey_mismatch' });
    expect(await confirm(client, 's2', KEY, first)).toMatchObject({ reason: 'passkey_mismatch' });
    const late = challengeOf(await order(client, 's3', 'seal', { quest: Q_NORTH.id }));
    herald.clock.advance(5 * 60 * 1000 + 1);
    expect(await confirm(client, 's3', KEY, late)).toMatchObject({ reason: 'no_challenge' });
    const revoked = DeviceSchema.parse({
      ...keyed(fullDevice('cccccc'), KEY),
      passkeys: [{ ...keyed(fullDevice(), KEY).passkeys![0], revoked_at: '2026-11-27T03:01:00.000Z' }],
    });
    const other = await tunnelOf(herald, revoked);
    expect(await order(other, 's4', 'seal', { quest: Q_NORTH.id })).toMatchObject({
      reason: 'passkey_required',
    });
    expect(await inbox(herald)).toEqual([]);
  });
});

describe('pairing a device from the phone (SEC-08)', () => {
  it('draws the new id itself and hands the pairing code to the full device that asked only', async () => {
    const herald = await started();
    const client = await tunnelOf(herald, keyed(fullDevice(), KEY));
    const asked = await order(client, 'p1', 'pair_device', {
      device: 'dev_20261127_zzzzzz',
      label: 'Tablet',
      role: 'full',
    });
    const answer = await confirm(client, 'p1', KEY, challengeOf(asked));
    if (answer.type !== 'accepted' || answer.pairing === undefined) throw new Error(JSON.stringify(answer));
    const { device, code } = answer.pairing;
    const [written] = await inbox(herald);
    expect(written).toMatchObject({
      kind: 'pair_device',
      payload: { device, label: 'Tablet', role: 'full' },
    });
    expect(device).not.toBe('dev_20261127_zzzzzz');
    expect(JSON.stringify(herald.logged)).not.toContain(code);
    // Once the Steward wrote the device file, the code pairs it, once.
    await herald.store.devices.write({
      version: 1,
      id: device,
      label: 'Tablet',
      role: 'full',
      created_at: written!.ts,
    });
    expect((await postCode(herald.herald.port, code)).status).toBe(303);
  });

  it('refuses the device commands of a scoped device before any challenge', async () => {
    const herald = await started();
    const scoped = DeviceSchema.parse({ ...keyed(fullDevice(), KEY), role: 'scoped', territories: [NORTH] });
    const client = await tunnelOf(herald, scoped);
    for (const [kind, payload] of [
      ['pair_device', { label: 'x', role: 'full' }],
      ['set_device', { device: scoped.id, role: 'full' }],
      ['revoke_device', { device: scoped.id, passkey: KEY.id as PasskeyId }],
    ] as const)
      expect(await order(client, kind, kind, payload)).toMatchObject({ reason: 'role_forbids' });
  });
});
