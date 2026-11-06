// Text frames of the WebSocket protocol (messages.ts). Each end decodes only what the other end may send, so a
// client cannot push a snapshot to the herald and the herald never takes a command for a state.
import { err, ok } from '../core/result.ts';
import { ClientMessageSchema, ServerMessageSchema } from './messages.ts';
import type { Result } from '../core/result.ts';
import type { ClientMessage, ProtocolMessage, ServerMessage } from './messages.ts';
import type { z } from 'zod';

export type ProtocolError =
  | { readonly code: 'not_json' }
  /** The frame is JSON but not a message this end accepts; `issues` are English, for logs. */
  | { readonly code: 'invalid_message'; readonly issues: readonly string[] };

export const encodeMessage = (message: ProtocolMessage): string => JSON.stringify(message);

function parseJson(text: string): Result<unknown, ProtocolError> {
  try {
    return ok(JSON.parse(text));
  } catch {
    return err({ code: 'not_json' });
  }
}

const decodeWith =
  <T>(schema: z.ZodType<T>) =>
  (text: string): Result<T, ProtocolError> => {
    const json = parseJson(text);
    if (!json.ok) return json;
    const parsed = schema.safeParse(json.value);
    if (parsed.success) return ok(parsed.data);
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
    );
    return err({ code: 'invalid_message', issues });
  };

/** What the world and the lite client accept: a snapshot or events. */
export const decodeServerMessage: (text: string) => Result<ServerMessage, ProtocolError> =
  decodeWith(ServerMessageSchema);

/** What the herald accepts: a command. */
export const decodeClientMessage: (text: string) => Result<ClientMessage, ProtocolError> =
  decodeWith(ClientMessageSchema);
