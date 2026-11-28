// `elvaria sandbox replay <file> [--speed 20] [--to terminal]`: a fake day played back as a timeline
// (implementation-plan §7; the milestone of stage 0). The file is read by the event log's own reader, so every
// line shown has passed the event contract; a line that does not is reported and skipped. The kingdom is
// optional: with one (--kingdom or ELVARIA_KINGDOM), the owner's language and the registry's names are used.
// (P2-01c) `--to herald [--port <n>]` plays the same schedule through a Herald over a throwaway kingdom
// (replay-herald.ts).
import path from 'node:path';

import { readDay, replay, replaySpan } from '@elvaria/sandbox';
import type { EventLogIssue } from '@elvaria/eventlog';
import { pathExists } from '@elvaria/store';

import { textOption } from '../args.ts';
import { EXIT } from '../command-table/command.ts';
import { kingdomDir, openKingdomContext } from '../kingdom-context.ts';
import { portFrom } from '../herald/herald.ts';
import { replayToHerald } from './replay-herald.ts';
import { timeline } from './timeline.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';
import type { TimelineContext } from './timeline.ts';

const DEFAULT_SPEED = 20;
const MINUTE_MS = 60_000;
const DESTINATIONS = ['terminal', 'herald'] as const;
/** `HH:MM` of an ISO 8601 time with offset. */
const CLOCK = { from: 11, to: 16 } as const;
const DATE_LENGTH = 10;

interface ReplayRequest {
  readonly file: string;
  readonly speed: number;
  readonly to: (typeof DESTINATIONS)[number];
  /** The Herald's port with --to herald; 0 picks a free one. */
  readonly port: number;
}

function readRequest(input: CommandInput, ctx: CliContext): ReplayRequest | string[] {
  const { t, io } = ctx;
  const problems: string[] = [];
  const speedText = textOption(input, 'speed');
  const speed = speedText === undefined ? DEFAULT_SPEED : Number(speedText);
  if (!/^\d+(?:\.\d+)?$/.test(speedText ?? String(DEFAULT_SPEED)) || !(speed > 0)) {
    problems.push(t('cli.sandbox.bad_speed'));
  }
  const toText = textOption(input, 'to') ?? 'terminal';
  const to = DESTINATIONS.find((destination) => destination === toText);
  if (to === undefined) {
    problems.push(t('cli.error.choice', { option: '--to', choices: DESTINATIONS.join(', ') }));
  }
  const portText = textOption(input, 'port');
  const port = portText === undefined ? 0 : portFrom(portText);
  if (port === undefined) problems.push(t('cli.herald.bad_port', { value: portText ?? '' }));
  const file = path.resolve(io.cwd, input.positionals[0] ?? '');
  if (problems.length > 0 || to === undefined || port === undefined) return problems;
  return { file, speed, to, port };
}

/** The owner's language and names when a kingdom is known; the command line's language otherwise. */
async function timelineContext(input: CommandInput, cli: CliContext): Promise<TimelineContext | undefined> {
  if (kingdomDir(input, cli.io) === undefined) return { t: cli.t, locale: cli.locale };
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return undefined;
  const registry = await ctx.store.loadRegistry();
  return { t: ctx.t, locale: ctx.locale, registry: registry.ok ? registry.value : undefined };
}

function issueLine(context: TimelineContext, issue: EventLogIssue): string {
  return context.t('cli.sandbox.bad_line', {
    offset: issue.offset,
    code: issue.code,
    message: issue.message,
  });
}

async function play(context: TimelineContext, cli: CliContext, request: ReplayRequest): Promise<ExitCode> {
  const { t } = context;
  const { io } = cli;
  const { events, issues } = await readDay(request.file);
  issues.map((issue) => issueLine(context, issue)).forEach(io.err);
  const span = replaySpan(events, request.speed);
  if (span === undefined) {
    io.err(t('cli.sandbox.empty', { file: request.file }));
    return EXIT.failed;
  }
  const minutes = Math.round(span.waitMs / MINUTE_MS);
  const duration =
    minutes < 1 ? t('cli.sandbox.duration.under_minute') : t('cli.sandbox.duration.minutes', { minutes });
  const header = {
    fake: t('sandbox.fake_data'),
    date: span.from.slice(0, DATE_LENGTH),
    lines: events.length,
    from: span.from.slice(CLOCK.from, CLOCK.to),
    to: span.to.slice(CLOCK.from, CLOCK.to),
    speed: request.speed,
    duration,
  };
  io.out(t('cli.sandbox.replay.start', header));
  if (request.to === 'herald') {
    const played = await replayToHerald(cli, { events, speed: request.speed, port: request.port });
    return issues.length === 0 ? played : EXIT.failed;
  }
  const line = timeline(context);
  const emit = (event: Parameters<typeof line>[0]): void => {
    io.out(line(event));
  };
  await replay(events, { speed: request.speed, sleep: io.sleep, emit });
  const counts = { lines: events.length, issues: issues.length };
  io.out(
    issues.length === 0 ? t('cli.sandbox.replay.end', counts) : t('cli.sandbox.replay.end_issues', counts),
  );
  return issues.length === 0 ? EXIT.ok : EXIT.failed;
}

async function runReplay(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const request = readRequest(input, cli);
  if (Array.isArray(request)) {
    request.forEach(cli.io.err);
    return EXIT.usage;
  }
  const context = await timelineContext(input, cli);
  if (context === undefined) return EXIT.failed;
  if (!(await pathExists(request.file))) {
    cli.io.err(context.t('cli.sandbox.no_file', { file: request.file }));
    return EXIT.failed;
  }
  return play(context, cli, request);
}

export const SANDBOX_REPLAY: CommandSpec = {
  name: ['sandbox', 'replay'],
  summary: 'cli.sandbox.replay.summary',
  args: [{ name: '<file>', help: 'cli.sandbox.replay.arg.file' }],
  options: {
    speed: { type: 'string', value: '<n>', help: 'cli.sandbox.replay.option.speed' },
    to: { type: 'string', value: '<terminal|herald>', help: 'cli.sandbox.replay.option.to' },
    port: { type: 'string', value: '<port>', help: 'cli.sandbox.replay.option.port' },
  },
  run: runReplay,
};
