import { describe, expect, it } from 'vitest';

import events from '../../examples/event.json' with { type: 'json' };
import { EVENT_VERSION, EventSchema } from '../schema/event/event.ts';
import { CAMPAIGNS, CHARACTERS, KINGDOM, QUESTS, TERRITORIES } from '../world/__fixtures__/examples.ts';
import { worldStateOf } from '../world/world-state.ts';
import { decodeClientMessage, decodeServerMessage, encodeMessage } from './codec.ts';
import { commandOf } from './envelope.ts';
import { ProtocolMessageSchema } from './messages.ts';
import type { DeviceId, Ulid } from '../core/ids.ts';
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

const ENVELOPE = {
  id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0A' as Ulid,
  ts: '2026-11-26T19:45:00+07:00',
  source: 'lite',
  device: 'dev_20261126_4k2pqz' as DeviceId,
} as const;

describe('the WebSocket protocol', () => {
  it('has the messages of stage 2: snapshot, events, accepted and refused, and a command', () => {
    for (const message of [SNAPSHOT, LINES, ACCEPTED, REFUSED, SEAL]) {
      expect(ProtocolMessageSchema.parse(message)).toEqual(message);
    }
  });

  it('carries a snapshot, log lines and the answers to a command from the herald to a client unchanged', () => {
    for (const message of [SNAPSHOT, LINES, ACCEPTED, REFUSED])
      expect(decodeServerMessage(encodeMessage(message))).toEqual({ ok: true, value: message });
  });

  it('carries a command from a client to the herald unchanged', () => {
    expect(decodeClientMessage(encodeMessage(SEAL))).toEqual({ ok: true, value: SEAL });
  });

  it('lets each end accept only what the other may send', () => {
    for (const message of [SEAL])
      expect(decodeServerMessage(encodeMessage(message))).toMatchObject({
        ok: false,
        error: { code: 'invalid_message' },
      });
    for (const message of [SNAPSHOT, ACCEPTED, REFUSED])
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
