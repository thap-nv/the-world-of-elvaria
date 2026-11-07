// `elvaria wake <tribe>`: "I signed in again" (implementation-plan §3.5, ADR 0009). The Steward probes the tribe's
// account at its next tick instead of waiting for the probe's own time; the CLI only drops the command in the
// inbox (ADR 0005), after checking the tribe is one of the kingdom's.
import { EXIT } from './command.ts';
import { openKingdomContext } from './kingdom-context.ts';
import { commandHeader, sendCommand } from './quest/send-command.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from './command.ts';

async function runWake(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const named = input.positionals[0] ?? '';
  const tribe = ctx.kingdom.tribes.find(({ id }) => id === named)?.id;
  if (tribe === undefined) {
    const tribes = ctx.kingdom.tribes.map(({ id }) => id).join(', ');
    ctx.io.err(ctx.t('cli.wake.unknown', { tribe: named, tribes }));
    return EXIT.failed;
  }
  const command = { ...commandHeader(ctx), kind: 'wake', payload: { tribe } } as const;
  return sendCommand(ctx, command, 'cli.wake.sent', { tribe });
}

export const WAKE: CommandSpec = {
  name: ['wake'],
  summary: 'cli.wake.summary',
  args: [{ name: '<tribe>', help: 'cli.wake.arg.tribe' }],
  options: {},
  run: runWake,
};
