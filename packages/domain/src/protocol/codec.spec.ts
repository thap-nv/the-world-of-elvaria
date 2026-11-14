import { describe, expect, it } from 'vitest';

import commands from '../../examples/inbox-command.json' with { type: 'json' };
import events from '../../examples/event.json' with { type: 'json' };
import { InboxCommandSchema } from '../schema/command/inbox-command.ts';
import { EVENT_VERSION, EventSchema } from '../schema/event/event.ts';
import { CAMPAIGNS, CHARACTERS, KINGDOM, QUESTS, TERRITORIES } from '../world/__fixtures__/examples.ts';
import { worldStateOf } from '../world/world-state.ts';
import { decodeClientMessage, decodeServerMessage, encodeMessage } from './codec.ts';
import { ProtocolMessageSchema } from './messages.ts';
import type { ProtocolMessage } from './messages.ts';

const STATE = worldStateOf({
  kingdom: KINGDOM,
  territories: TERRITORIES,
  characters: CHARACTERS,
  quests: QUESTS,
  campaigns: CAMPAIGNS,
});
const EVENTS = events.map((event) => EventSchema.parse(event));
const [SEAL_FROM_PHONE, CREATE_FROM_CLI] = commands.map((command) => InboxCommandSchema.parse(command));

const SNAPSHOT: ProtocolMessage = { type: 'snapshot', state: STATE };
const LINES: ProtocolMessage = { type: 'events', events: EVENTS };
const COMMAND: ProtocolMessage = { type: 'command', command: SEAL_FROM_PHONE! };

describe('the WebSocket protocol', () => {
  it('has the three messages fixed for stage 2: snapshot, events, command', () => {
    for (const message of [SNAPSHOT, LINES, COMMAND]) {
      expect(ProtocolMessageSchema.parse(message)).toEqual(message);
    }
  });

  it('carries a snapshot and log lines from the herald to a client unchanged', () => {
    expect(decodeServerMessage(encodeMessage(SNAPSHOT))).toEqual({ ok: true, value: SNAPSHOT });
    expect(decodeServerMessage(encodeMessage(LINES))).toEqual({ ok: true, value: LINES });
  });

  it('carries a command from a client to the herald unchanged', () => {
    expect(decodeClientMessage(encodeMessage(COMMAND))).toEqual({ ok: true, value: COMMAND });
  });

  it('lets each end accept only what the other may send', () => {
    expect(decodeServerMessage(encodeMessage(COMMAND))).toMatchObject({
      ok: false,
      error: { code: 'invalid_message' },
    });
    expect(decodeClientMessage(encodeMessage(SNAPSHOT))).toMatchObject({
      ok: false,
      error: { code: 'invalid_message' },
    });
  });

  it('refuses a command a WebSocket client claims came from the CLI', () => {
    const frame = encodeMessage({ type: 'command', command: CREATE_FROM_CLI! });
    expect(decodeClientMessage(frame)).toEqual({
      ok: false,
      error: {
        code: 'invalid_message',
        issues: ['command.source: a WebSocket client sends commands as herald or lite'],
      },
    });
  });

  it.each([
    ['an empty batch of lines', { type: 'events', events: [] }, 'events: Too small'],
    [
      'a line that breaks the event contract',
      { type: 'events', events: [{ ...events[0], v: EVENT_VERSION + 1 }] },
      'events.0.v',
    ],
    ['a state that is not a world state', { type: 'snapshot', state: { quests: {} } }, 'state.kingdom'],
    [
      'an unknown message',
      { type: 'hello' },
      "type: Invalid discriminator value. Expected 'snapshot' | 'events'",
    ],
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
