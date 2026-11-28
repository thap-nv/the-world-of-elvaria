// The Steward's Poet port (P2-06b, W10): the Bard poetCallOf chose words the day's ledger as prose in one session with
// no tool (askBard, ADR 0017). The ledger it reads and the prose it gives both pass the event log's redaction first
// (ADR 0013): a quest's title is the owner's text and may carry a token. The prose is then held against the ledger
// (checkChronicle); refused, it is asked for once more in a fresh session with the errors, and refused again it is
// dropped with one line on stderr: the machine's part stands. What passes is appended to chronicle/<day>.md. A file
// that holds the prose already (a run cut short after the append) is left as it is, and no session opens.
import { readFile } from 'node:fs/promises';

import { askBard, chronicleIssueText } from '@elvaria/chancellor';
import type { BardFailure, ChancellorSession } from '@elvaria/chancellor';
import { checkChronicle } from '@elvaria/domain';
import type { Character, ChronicleLedger } from '@elvaria/domain';
import { createRedactor, redactDeep } from '@elvaria/eventlog';
import { inKingdom, readDecree, writeFileAtomic } from '@elvaria/store';
import type { ChronicleContext } from '@elvaria/runner-core';
import type { Poet, PoetRequest, PoetResult } from '@elvaria/steward';

import { sessionOf } from '../say/hearing.ts';
import { structuredOf } from '../temple/monk.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Runners } from '../say/hearing.ts';

/** The first try, and one more told what the machine refused in it. */
const BARD_TRIES = 2;

/** What one or two sessions spent, the last one's id kept. */
interface Spending {
  tokens: number;
  session?: string;
}

interface Opened {
  readonly bard: Character;
  readonly session: () => Promise<ChancellorSession>;
}

/** The Bard, its class and its tribe's runner; undefined when any is missing. */
async function openBard(
  ctx: KingdomContext,
  runners: Runners,
  request: PoetRequest,
): Promise<Opened | undefined> {
  const bard = (await ctx.store.characters.list()).items.find(({ id }) => id === request.bard);
  const runner = bard === undefined ? undefined : runners[bard.tribe];
  const registry = await ctx.store.loadRegistry();
  const found = registry.ok ? registry.value.classes.find(({ id }) => id === bard?.class) : undefined;
  if (bard === undefined || runner === undefined || found === undefined) return undefined;
  const choice = { character: bard, structured_output: structuredOf(runner) };
  return { bard, session: () => sessionOf(ctx, { choice, runner, class: found }, 'chronicle') };
}

const failureText = (failure: BardFailure['failure']): string =>
  failure.code === 'invalid_reply' ? failure.issues.join('; ') : failure.code;

/** One prose that passed the check, or the issues of the last try; undefined when a session gave none. */
async function tale(
  ctx: KingdomContext,
  opened: Opened,
  base: Omit<ChronicleContext, 'issues'>,
  request: PoetRequest,
  spending: Spending,
): Promise<{ readonly text?: string; readonly issues: readonly string[] }> {
  const redactor = createRedactor([]);
  const roster = (await ctx.store.characters.list()).items.map(({ id, name }) => ({ id, name }));
  let issues: readonly string[] = [];
  for (let tries = 0; tries < BARD_TRIES; tries += 1) {
    const session = await opened.session();
    const answer = await askBard({ ...base, issues }, session, request.signal);
    const spent = answer.ok ? answer.value : answer.error;
    spending.tokens += spent.tokens;
    const last = spent.session_ids.at(-1);
    if (last !== undefined) spending.session = last;
    if (!answer.ok) {
      if (answer.error.failure.code !== 'stopped') {
        const problem = failureText(answer.error.failure);
        const line = { day: request.day, name: opened.bard.name, problem, run_dir: session.run_dir };
        ctx.io.err(ctx.t('chronicle.prose.failed', line));
      }
      return { issues: [] };
    }
    const text = redactor(answer.value.text);
    issues = checkChronicle(text, base.ledger, roster).map(chronicleIssueText);
    if (issues.length === 0) return { text, issues };
  }
  return { issues };
}

export function filePoet(ctx: KingdomContext, runners: Runners): Poet {
  return {
    write: async (request): Promise<PoetResult> => {
      const file = inKingdom(ctx.store.root, request.file);
      const heading = ctx.t('chronicle.prose.heading');
      const machine = await readFile(file, 'utf8');
      if (machine.includes(`\n${heading}\n`)) return { prose: true };
      const opened = await openBard(ctx, runners, request);
      if (opened === undefined) return { prose: false };
      const ledger = redactDeep<ChronicleLedger>(request.ledger, createRedactor([]));
      const base = {
        locale: ctx.kingdom.owner.locale,
        decree: await readDecree(ctx.store.root),
        kingdom: ctx.kingdom.name,
        ledger,
      };
      const spending: Spending = { tokens: 0 };
      const told = await tale(ctx, opened, base, request, spending);
      const { bard } = opened;
      const spent = { tribe: bard.tribe, model: bard.model, tokens: spending.tokens, ...pick(spending) };
      if (told.text === undefined) {
        if (told.issues.length > 0) {
          const issues = told.issues.join('; ');
          ctx.io.err(ctx.t('chronicle.prose.refused', { day: request.day, name: bard.name, issues }));
        }
        return { prose: false, spent };
      }
      const note = ctx.t('chronicle.prose.note', { name: bard.name });
      await writeFileAtomic(file, `${machine.trimEnd()}\n\n${heading}\n\n_${note}_\n\n${told.text}\n`);
      return { prose: true, spent };
    },
  };
}

const pick = ({ session }: Spending) => (session === undefined ? {} : { session });
