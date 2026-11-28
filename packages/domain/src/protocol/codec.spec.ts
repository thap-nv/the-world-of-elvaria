import { describe, expect, it } from 'vitest';

import events from '../../examples/event.json' with { type: 'json' };
import { EVENT_VERSION, EventSchema } from '../schema/event/event.ts';
import { CAMPAIGNS, CHARACTERS, KINGDOM, QUESTS, TERRITORIES } from '../world/__fixtures__/examples.ts';
import { itemOf } from '../world/attention-notices.ts';
import { worldStateOf } from '../world/world-state.ts';
import { decodeClientMessage, decodeServerMessage, encodeMessage } from './codec.ts';
import { commandOf } from './envelope.ts';
import { ProtocolMessageSchema } from './messages.ts';
import type { DeviceId, QuestId, Ulid } from '../core/ids.ts';
import type { PasskeyId } from '../schema/device/passkey.ts';
import type { CommandMessage, ProtocolMessage } from './messages.ts';

const STATE = worldStateOf({
  kingdom: KINGDOM,
  territories: TERRITORIES,
  characters: CHARACTERS,
  quests: QUESTS,
  campaigns: CAMPAIGNS,
});
const EVENTS = events.map((event) => EventSchema.parse(event));

const SNAPSHOT: ProtocolMessage = { type: 'snapshot', state: STATE };
const LINES: ProtocolMessage = { type: 'events', events: EVENTS };
const SEAL: CommandMessage = {
  type: 'command',
  ref: 'seal-1',
  kind: 'seal',
  payload: { quest: 'q_20261106_7k3m2a', note: 'Đã xem diff trên điện thoại.' },
};
const ACCEPTED: ProtocolMessage = {
  type: 'accepted',
  ref: 'seal-1',
  command_id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0A' as Ulid,
};
const REFUSED: ProtocolMessage = { type: 'refused', ref: 'seal-1', reason: 'passkey_required' };
// P2-04: the owner's attention queue, as the herald sends it after a batch of events.
const ATTENTION: ProtocolMessage = {
  type: 'attention',
  items: [
    itemOf('awaiting_seal', {
      quest: 'q_20261106_7k3m2a' as QuestId,
      title: 'Sửa trang "đăng nhập"',
      rank: 'B',
    }),
  ],
};

// SEC-08: the passkey's round trip, and the pairing code a pair_device command answers with.
const CHALLENGE: ProtocolMessage = {
  type: 'challenge',
  ref: 'seal-1',
  challenge: 'kZ3c1lJ9oQx8VQ2b7zjv0m5W7p1G3k6sA2dYq4tHf8E',
  passkeys: ['cred-1' as PasskeyId],
};
const CONFIRM: ProtocolMessage = {
  type: 'confirm',
  ref: 'seal-1',
  confirmation: {
    passkey: 'cred-1' as PasskeyId,
    authenticator_data: 'AAAA',
    client_data: 'e30',
    signature: 'MEU',
  },
};
const ENROLL: ProtocolMessage = { type: 'enroll', ref: 'key-1' };
const REGISTER: ProtocolMessage = {
  type: 'register',
  ref: 'key-1',
  registration: {
    id: 'cred-2' as PasskeyId,
    public_key: 'MFkw',
    algorithm: 'rs256',
    authenticator_data: 'AAAA',
    client_data: 'e30',
  },
};
const PAIRED: ProtocolMessage = {
  ...ACCEPTED,
  pairing: {
    device: 'dev_20261128_9tw3hx' as DeviceId,
    code: 'c0de',
    expires_at: '2026-11-28T10:05:00+07:00',
  },
};

const ENVELOPE = {
  id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0A' as Ulid,
  ts: '2026-11-26T19:45:00+07:00',
  source: 'lite',
  device: 'dev_20261126_4k2pqz' as DeviceId,
} as const;

describe('the WebSocket protocol', () => {
  it('has the messages of stage 2: snapshot, events, accepted, refused, attention, and a command', () => {
    for (const message of [
      SNAPSHOT,
      LINES,
      ACCEPTED,
      REFUSED,
      ATTENTION,
      SEAL,
      CHALLENGE,
      CONFIRM,
      ENROLL,
      REGISTER,
    ]) {
      expect(ProtocolMessageSchema.parse(message)).toEqual(message);
    }
  });

  it('carries a snapshot, log lines and the answers to a command from the herald to a client unchanged', () => {
    for (const message of [SNAPSHOT, LINES, ACCEPTED, REFUSED, ATTENTION, CHALLENGE, PAIRED])
      expect(decodeServerMessage(encodeMessage(message))).toEqual({ ok: true, value: message });
  });

  it('carries a command, and the passkey messages of SEC-08, from a client to the herald unchanged', () => {
    for (const message of [SEAL, CONFIRM, ENROLL, REGISTER])
      expect(decodeClientMessage(encodeMessage(message))).toEqual({ ok: true, value: message });
  });

  it('lets each end accept only what the other may send', () => {
    for (const message of [SEAL, CONFIRM])
      expect(decodeServerMessage(encodeMessage(message))).toMatchObject({
        ok: false,
        error: { code: 'invalid_message' },
      });
    for (const message of [SNAPSHOT, ACCEPTED, REFUSED, ATTENTION])
      expect(decodeClientMessage(encodeMessage(message))).toMatchObject({
        ok: false,
        error: { code: 'invalid_message' },
      });
  });

  // ADR 0031 item 5: the herald writes the envelope; a client claiming one is refused, not trusted.
  it.each<[string, Record<string, unknown>]>([
    ['an id', { id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0A' }],
    ['a source', { source: 'cli' }],
    ['a device', { device: 'dev_20261126_7pzkfv' }],
    ['a whole inbox command, as before P2-01', { command: { kind: 'seal' } }],
  ])('refuses a command that brings %s of its own', (_, extra) => {
    const decoded = decodeClientMessage(JSON.stringify({ ...SEAL, ...extra }));
    expect(decoded).toMatchObject({ ok: false, error: { code: 'invalid_message' } });
  });

  it('refuses a ref that could carry anything but a short tag', () => {
    expect(decodeClientMessage(JSON.stringify({ ...SEAL, ref: 'x'.repeat(65) }))).toMatchObject({
      ok: false,
    });
    expect(decodeClientMessage(JSON.stringify({ ...SEAL, ref: '<b>' }))).toMatchObject({ ok: false });
    expect(decodeClientMessage(JSON.stringify({ ...SEAL, ref: 'a'.repeat(64) }))).toMatchObject({ ok: true });
  });

  it.each([
    ['an empty batch of lines', { type: 'events', events: [] }, 'events: Too small'],
    [
      'a line that breaks the event contract',
      { type: 'events', events: [{ ...events[0], v: EVENT_VERSION + 1 }] },
      'events.0.v',
    ],
    ['a state that is not a world state', { type: 'snapshot', state: { quests: {} } }, 'state.kingdom'],
    ['an answer without its command id', { type: 'accepted', ref: 'a' }, 'command_id'],
    ['a refusal whose reason is not a code', { type: 'refused', ref: 'a', reason: 'No.' }, 'reason'],
    ['an unknown message', { type: 'hello' }, 'type: Invalid'],
  ])('refuses %s, saying where', (_, message, issue) => {
    const decoded = decodeServerMessage(JSON.stringify(message));
    expect(decoded.ok).toBe(false);
    if (decoded.ok || decoded.error.code !== 'invalid_message') throw new Error('expected invalid_message');
    expect(decoded.error.issues.join('\n')).toContain(issue);
  });

  it('refuses a frame that is not JSON', () => {
    expect(decodeServerMessage('{"type":')).toEqual({ ok: false, error: { code: 'not_json' } });
    expect(decodeClientMessage('')).toEqual({ ok: false, error: { code: 'not_json' } });
  });
});

describe('the envelope the herald writes (commandOf)', () => {
  it("puts the client's kind and payload in the herald's id, time, source and device", () => {
    expect(commandOf(SEAL, ENVELOPE)).toEqual({
      ok: true,
      value: {
        version: 1,
        id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0A',
        ts: '2026-11-26T19:45:00+07:00',
        kind: 'seal',
        source: 'lite',
        device: 'dev_20261126_4k2pqz',
        payload: { quest: 'q_20261106_7k3m2a', note: 'Đã xem diff trên điện thoại.' },
      },
    });
  });

  it("names the new device of a pair_device command with the id the herald drew, never the client's", () => {
    const pair: CommandMessage = {
      type: 'command',
      ref: 'pair-1',
      kind: 'pair_device',
      payload: { device: 'dev_20261128_aaaaaa', label: 'Tablet', role: 'full' },
    };
    const drawn = 'dev_20261128_9tw3hx' as DeviceId;
    expect(commandOf(pair, { ...ENVELOPE, pairs: drawn })).toMatchObject({
      ok: true,
      value: { kind: 'pair_device', device: ENVELOPE.device, payload: { device: drawn, label: 'Tablet' } },
    });
    expect(commandOf(pair, ENVELOPE)).toMatchObject({ ok: false, error: { code: 'invalid_message' } });
    expect(commandOf(SEAL, { ...ENVELOPE, pairs: drawn })).toMatchObject({
      ok: true,
      value: { payload: SEAL.payload },
    });
  });

  it('checks the payload against its kind, and the kind against the inbox contract', () => {
    expect(commandOf({ ...SEAL, payload: { quest: 'nope' } }, ENVELOPE)).toMatchObject({
      ok: false,
      error: { code: 'invalid_message', issues: [expect.stringContaining('payload.quest')] },
    });
    expect(commandOf({ ...SEAL, kind: 'launch' }, ENVELOPE)).toMatchObject({
      ok: false,
      error: { code: 'invalid_message', issues: [expect.stringMatching(/^kind: Invalid discriminator/)] },
    });
  });
});
