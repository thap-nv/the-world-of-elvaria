// `elvaria temple evidence [--json]` (PS-12d, temple-first plan DB10, DB16): the evidence pack a session of the Monk
// would read, now: the repeated failures of the last 50 judged runs with each verdict's notes (redacted, cut at 600
// characters), the lines of scripture with their counts, the Monk's lines worth a review, the checks of each territory
// and the catalog's scripts. The pack is cut at the Monk tribe's prompt ceiling on this OS; with no Monk, at 24 000.
// It reads the kingdom only: nothing is written and no model is called. (PS-12f) A run of the Temple reads the same
// pack (evidenceOf), cut at the prompt ceiling of the Monk who speaks.
import {
  EMPTY_LEDGER,
  evidenceIsEmpty,
  evidenceSizeOf,
  lessonCountsOf,
  lessonEvidenceOf,
  promptMaxOf,
  repeatedFailuresOf,
  sourceOf,
  templeEvidenceOf,
} from '@elvaria/domain';
import type { ScriptureEvidenceLine, TempleEvidence, VerdictId } from '@elvaria/domain';
import { redact } from '@elvaria/eventlog';
import { lessonsIn } from '@elvaria/steward';

import { flagOption } from '../args.ts';
import { EXIT } from '../command-table/command.ts';
import { registryIssueLines, storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { readMetricsSource } from '../metrics/read.ts';
import { handOf } from '../run/crew.ts';
import { readKingdomScriptures } from '../scripture/read.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { KingdomScriptures } from '../scripture/read.ts';

const JSON_INDENT = 2;

/** Every line of every scripture, with who wrote it as the ledger beside it says. */
const scriptureLinesOf = (scriptures: KingdomScriptures): ScriptureEvidenceLine[] =>
  scriptures.files.flatMap((file) =>
    lessonsIn([file]).map((lesson) => ({
      ref: lesson.ref,
      owner: lesson.owner,
      source: sourceOf(lesson, scriptures.ledgers.get(lesson.owner) ?? EMPTY_LEDGER),
      scope: lesson.scope,
      fail_kind: lesson.fail_kind,
      text: lesson.text,
    })),
  );

/**
 * The prompt ceiling of the first Monk's tribe on this OS: its runner's capabilities, read without spawning it. None
 * when the kingdom has no Monk, or its tribe declares none here.
 */
async function monkPromptMaxOf(
  ctx: KingdomContext,
  monkClasses: ReadonlySet<string>,
): Promise<number | undefined> {
  const monks = (await ctx.store.characters.list()).items.filter((character) =>
    monkClasses.has(character.class),
  );
  const tribe = ctx.kingdom.tribes.find(({ id }) => monks.some((monk) => monk.tribe === id));
  if (tribe === undefined) return undefined;
  const found = await handOf(tribe, { kingdom: ctx.kingdom, root: ctx.store.root }, ctx.io);
  return found.kind === 'ready' ? promptMaxOf(found.hand.runner.capabilities, ctx.io.platform) : undefined;
}

/**
 * The pack now; undefined once the reason is printed. `promptMaxOf` gives the ceiling of the Monk's tribe from the
 * Monk classes of the registry, none for the 24 000 of the Temple.
 */
export async function evidenceOf(
  ctx: KingdomContext,
  promptMaxOf: (monkClasses: ReadonlySet<string>) => Promise<number | undefined>,
): Promise<TempleEvidence | undefined> {
  const registry = await ctx.store.loadRegistry();
  const scriptures = await readKingdomScriptures(ctx);
  if (!registry.ok || 'problems' in scriptures) {
    const problems = registry.ok ? ('problems' in scriptures ? scriptures.problems : []) : registry.error;
    problems.flatMap((issue) => registryIssueLines(ctx.t, issue)).forEach(ctx.io.err);
    return undefined;
  }
  scriptures.issues.flatMap((issue) => storeIssueLines(ctx.t, issue)).forEach(ctx.io.err);
  const metrics = await readMetricsSource(ctx.store.root);
  for (const where of metrics.skipped) ctx.io.err(ctx.t('cli.metrics.skipped', { where }));
  // No window of days: the Temple reads the last 50 judged runs, whenever they were (item (q) of the PS-12b row).
  const ledger = lessonEvidenceOf(metrics.input);
  const territories = (await ctx.store.territories.list()).items;
  const monkClasses = new Set(registry.value.classes.filter(({ is_monk }) => is_monk).map(({ id }) => id));
  const promptMax = await promptMaxOf(monkClasses);
  return templeEvidenceOf({
    failures: repeatedFailuresOf(ledger),
    // No secret reaches a prompt (ADR 0013): the log's patterns, as the Steward redacts a line it writes.
    notes: new Map<VerdictId, string>(
      metrics.input.verdicts.map(({ id, notes }) => [id, redact(notes ?? '', [])]),
    ),
    lines: scriptureLinesOf(scriptures),
    counts: lessonCountsOf(ledger, metrics.input.lessons ?? []),
    checks: Object.fromEntries(territories.map(({ id, checks }) => [id, checks.map((check) => check.id)])),
    scripts: registry.value.scripts.map(({ id }) => id),
    ...(promptMax === undefined ? {} : { prompt_max: promptMax }),
  });
}

function printEvidence(ctx: KingdomContext, evidence: TempleEvidence): void {
  for (const { group, members } of evidence.groups) {
    ctx.io.out(ctx.t('cli.temple.evidence.group', { kind: group, count: members.length }));
    for (const member of members)
      ctx.io.out(
        ctx.t('cli.temple.evidence.member', {
          verdict: member.verdict,
          class: member.class ?? '—',
          tribe: member.tribe ?? '—',
          territory: member.territory,
          notes: member.notes.replaceAll(/\s+/g, ' '),
        }),
      );
  }
  if (evidence.dropped.length > 0)
    ctx.io.out(ctx.t('cli.temple.evidence.dropped', { kinds: evidence.dropped.join(', ') }));
  for (const ref of evidence.reviews) ctx.io.out(ctx.t('cli.temple.evidence.review', { ref }));
  ctx.io.out(
    ctx.t(evidenceIsEmpty(evidence) ? 'cli.temple.evidence.empty' : 'cli.temple.evidence.result', {
      groups: evidence.groups.length,
      lines: evidence.lines.length,
      reviews: evidence.reviews.length,
      chars: evidenceSizeOf(evidence),
    }),
  );
}

async function runTempleEvidence(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const evidence = await evidenceOf(ctx, (monkClasses) => monkPromptMaxOf(ctx, monkClasses));
  if (evidence === undefined) return EXIT.failed;
  if (flagOption(input, 'json') === true) ctx.io.out(JSON.stringify(evidence, null, JSON_INDENT));
  else printEvidence(ctx, evidence);
  return EXIT.ok;
}

export const TEMPLE_EVIDENCE: CommandSpec = {
  name: ['temple', 'evidence'],
  summary: 'cli.temple.evidence.summary',
  args: [],
  options: { json: { type: 'boolean', help: 'cli.temple.evidence.option.json' } },
  run: runTempleEvidence,
};
