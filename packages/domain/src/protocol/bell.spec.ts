import { describe, expect, it } from 'vitest';

import { decodeClientMessage, decodeServerMessage } from './codec.ts';
import { ServerMessageSchema } from './messages.ts';

const ENTRY = {
  kind: 'notification',
  ts: '2026-11-28T12:00:00+07:00',
  event_id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0A',
  vibrate: false,
};

describe('bell server messages', () => {
  it('parses history and an empty history, only in the server direction', () => {
    for (const entries of [[], [ENTRY]]) {
      const message = { type: 'bell', entries };
      expect(ServerMessageSchema.parse(message)).toEqual(message);
      expect(decodeServerMessage(JSON.stringify(message))).toEqual({ ok: true, value: message });
      expect(decodeClientMessage(JSON.stringify(message))).toMatchObject({ ok: false });
    }
  });

  it.each([
    { type: 'bell' },
    { type: 'bell', entries: {} },
    ...[
      { ...ENTRY, kind: 'unknown' },
      { ...ENTRY, event_id: 'bad' },
      { ...ENTRY, ts: 'today' },
      { ...ENTRY, vibrate: 'yes' },
      { kind: 'sealed' },
      { ...ENTRY, character: 'Bad name' },
      { ...ENTRY, quest: 'bad' },
      { ...ENTRY, extra: true },
    ].map((entry) => ({ type: 'bell', entries: [entry] })),
  ])('refuses malformed history: %j', (message) => {
    expect(decodeServerMessage(JSON.stringify(message))).toMatchObject({
      ok: false,
      error: { code: 'invalid_message' },
    });
  });
});
