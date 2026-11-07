// `elvaria seal <quest>` and `elvaria return <quest>`: the owner's word on work that waits for the royal seal
// (implementation-plan §2.5, P1-04). Both are inbox commands; the Steward writes them as the owner's verdict
// (`verdicts/<quest>-<n>-user.json`), weighed three times. A return is a fail verdict, which needs specific notes
// (at least 20 characters) and a fail_kind (`other` by default): the CLI asks for both before it sends anything.
import { FAIL_KINDS, FAIL_NOTES_MIN_LENGTH } from '@elvaria/domain';
import type { FailKind } from '@elvaria/domain';

import { textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { questFor } from './lifecycle.ts';
import { commandHeader, sendCommand } from './send-command.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';

const isFailKind = (value: string): value is FailKind => (FAIL_KINDS as readonly string[]).includes(value);

async function runSeal(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const quest = await questFor(input, ctx, () => 'seal', 'cli.seal.refused');
  if (quest === undefined) return EXIT.failed;
  const note = textOption(input, 'note');
  const payload = { quest: quest.id, ...(note === undefined ? {} : { note }) };
  return sendCommand(ctx, { ...commandHeader(ctx), kind: 'seal', payload }, 'cli.seal.sent', {
    id: quest.id,
  });
}

async function runReturn(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const notes = (textOption(input, 'note') ?? '').trim();
  if (notes.length < FAIL_NOTES_MIN_LENGTH) {
    ctx.io.err(ctx.t('cli.return.note_too_short', { min: FAIL_NOTES_MIN_LENGTH }));
    return EXIT.usage;
  }
  const failKind = textOption(input, 'fail-kind') ?? 'other';
  if (!isFailKind(failKind)) {
    ctx.io.err(ctx.t('cli.return.bad_fail_kind', { given: failKind, kinds: FAIL_KINDS.join(', ') }));
    return EXIT.usage;
  }
  const quest = await questFor(input, ctx, () => 'return', 'cli.return.refused');
  if (quest === undefined) return EXIT.failed;
  const payload = { quest: quest.id, notes, fail_kind: failKind };
  return sendCommand(ctx, { ...commandHeader(ctx), kind: 'return', payload }, 'cli.return.sent', {
    id: quest.id,
  });
}

export const SEAL: CommandSpec = {
  name: ['seal'],
  summary: 'cli.seal.summary',
  args: [{ name: '<quest>', help: 'cli.quest.arg.quest' }],
  options: { note: { type: 'string', value: '<text>', help: 'cli.seal.option.note' } },
  run: runSeal,
};

export const RETURN: CommandSpec = {
  name: ['return'],
  summary: 'cli.return.summary',
  args: [{ name: '<quest>', help: 'cli.quest.arg.quest' }],
  options: {
    note: { type: 'string', value: '<text>', required: true, help: 'cli.return.option.note' },
    'fail-kind': { type: 'string', value: '<kind>', help: 'cli.return.option.fail_kind' },
  },
  run: runReturn,
};
