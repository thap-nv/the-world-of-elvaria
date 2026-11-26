// `data` of the lines that answer an inbox command (implementation-plan §2.3, ADR 0005): the Steward applied it or
// refused it. Apart from event-data.ts since PS-03b.
import { z } from 'zod';

import { DeviceIdSchema, REGISTRY_ID_PATTERN, UlidSchema } from '../../core/ids.ts';
import { COMMAND_SOURCES } from '../command/inbox-command.ts';

const describe = (description: string) => ({ description });

export const CommandResultDataSchema = z.strictObject({
  command_id: UlidSchema,
  reason: z.string().optional(),
  // Optional and added after v1 (PS-01b): a line written before it, or of a file no command could be read from, has
  // none. A pattern, not the list of kinds, so an older build still reads the line of a kind it does not know.
  kind: z
    .string()
    .regex(REGISTRY_ID_PATTERN)
    .optional()
    .meta(
      describe(
        "The command's `kind` (InboxCommand.kind), so the metrics ledger counts the owner's steps from the log alone; inbox/done/ names it for lines written before PS-01b.",
      ),
    ),
  // Optional and added after v1 (PS-03b), written only for a command the owner did not write.
  source: z
    .enum(COMMAND_SOURCES)
    .exclude(['cli', 'herald', 'lite'])
    .optional()
    .meta(
      describe(
        "`chancellor` when the command came from the Chancellor's triage (PS-03b), `monk` from the temple (PS-12c): the metrics ledger leaves it out of the owner's steps. Absent for the owner's commands (CLI, Herald, phone).",
      ),
    ),
  // Optional and added after v1 (P2-01): the command's own `device`, so the log says which paired device asked
  // (threat model N10) and the Herald hands the answer to that device only.
  device: DeviceIdSchema.optional().meta(
    describe(
      'The paired device a command of source herald or lite came from (InboxCommand.device), when it named one.',
    ),
  ),
});
