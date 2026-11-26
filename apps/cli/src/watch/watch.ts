import process from 'node:process';

import { openEventLog } from '@elvaria/eventlog';

import { textOption } from '../args.ts';
import { EXIT } from '../command-table/command.ts';
import { storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { watchLoop } from './loop.ts';
import { watchTable } from './table.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';
import type { WatchRuntime } from './loop.ts';

const DEFAULT_INTERVAL = 5;
const MS_PER_SECOND = 1000;

export function watchInterval(value: string | undefined): number | undefined {
  if (value === undefined) return DEFAULT_INTERVAL;
  if (!/^\d+$/.test(value)) return undefined;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds >= 1 ? seconds : undefined;
}

const terminal: WatchRuntime = {
  isTTY: process.stdout.isTTY,
  setInterval: (refresh, ms) => setInterval(refresh, ms),
  clearInterval: (timer) => {
    clearInterval(timer);
  },
  onInterrupt: (stop) => {
    process.on('SIGINT', stop);
  },
  offInterrupt: (stop) => {
    process.off('SIGINT', stop);
  },
  now: () => Date.now(),
};

export async function runWatch(
  input: CommandInput,
  cli: CliContext,
  runtime: WatchRuntime = terminal,
): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const interval = watchInterval(textOption(input, 'interval'));
  if (interval === undefined) {
    ctx.io.err(ctx.t('cli.watch.invalid_interval'));
    return EXIT.usage;
  }
  const render = async () => {
    const [kingdom, territories, characters, quests, memos, log] = await Promise.all([
      ctx.store.kingdom.read(),
      ctx.store.territories.list(),
      ctx.store.characters.list(),
      ctx.store.quests.list(),
      ctx.store.memos.list(),
      openEventLog(ctx.store.root).read(),
    ]);
    if (!kingdom.ok) {
      storeIssueLines(ctx.t, kingdom.error).forEach(ctx.io.err);
      throw new Error(ctx.t('cli.watch.read_failed'));
    }
    const issues = [...territories.issues, ...characters.issues, ...quests.issues, ...memos.issues];
    issues.flatMap((issue) => storeIssueLines(ctx.t, issue)).forEach(ctx.io.err);
    return watchTable(
      ctx.t,
      {
        kingdom: kingdom.value,
        territories: territories.items,
        characters: characters.items,
        quests: quests.items,
        memos: memos.items,
      },
      log.events,
      ctx.io.clock.now(),
    );
  };
  await watchLoop(render, ctx.io.out, interval * MS_PER_SECOND, runtime);
  return EXIT.ok;
}

export const WATCH: CommandSpec = {
  name: ['watch'],
  summary: 'cli.watch.summary',
  args: [],
  options: { interval: { type: 'string', value: '<seconds>', help: 'cli.watch.interval' } },
  run: runWatch,
};
