// `elvaria quest add`: a quest straight to `open`, no Chancellor and no mana (implementation-plan §3.11, stage 0).
// It sends `create_quest` with draft = false; the Steward gives the quest its id and writes the file (ADR 0005).
import { QUEST_TAGS_MAX, QUEST_TITLE_MAX_LENGTH, RANKS } from '@elvaria/domain';
import type { Kind, Rank, Registry } from '@elvaria/domain';

import { flagOption, textOption, textOptions } from '../args.ts';
import { EXIT } from '../command.ts';
import { registryIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { questsMissing, territoryMissing } from './references.ts';
import { commandHeader, sendCommand } from './send-command.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

const isRank = (value: string): value is Rank => (RANKS as readonly string[]).includes(value);

/** `--script <id>` makes a script-tier quest: catalog script, no model, mana 0 (ADR 0017). */
interface ScriptChoice {
  readonly id: string;
  readonly params: Record<string, unknown>;
}

function parseParams(text: string | undefined): Record<string, unknown> | undefined {
  if (text === undefined) return {};
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value))
      : undefined;
  } catch {
    return undefined;
  }
}

/** The script, or the problems with it: unknown id, not for this kind, params that are not a JSON object. */
function readScript(input: CommandInput, kind: Kind | undefined, registry: Registry, ctx: KingdomContext) {
  const id = textOption(input, 'script');
  if (id === undefined) return { problems: [] };
  const problems: string[] = [];
  const script = registry.scripts.find((entry) => entry.id === id);
  if (script === undefined) {
    const choices = registry.scripts.map((entry) => entry.id).join(', ');
    problems.push(ctx.t('cli.error.unknown', { option: '--script', value: id, choices }));
  } else if (kind !== undefined && !script.kinds.includes(kind.id))
    problems.push(ctx.t('cli.quest.script_kind', { script: id, kind: kind.id }));
  const params = parseParams(textOption(input, 'params'));
  if (params === undefined) problems.push(ctx.t('cli.quest.bad_params'));
  const choice: ScriptChoice | undefined = params === undefined ? undefined : { id, params };
  return { choice, problems };
}

/** Required class of a session quest: `--class`, or the only class the kind allows. */
function readClass(input: CommandInput, kind: Kind | undefined, ctx: KingdomContext) {
  const given = textOption(input, 'class');
  if (kind === undefined) return { problems: [] };
  const allowed = kind.classes_allowed;
  const wanted = given ?? (allowed.length === 1 ? allowed[0] : undefined);
  const id = allowed.find((entry) => entry === wanted);
  if (id !== undefined) return { id, problems: [] };
  const choices = allowed.join(', ');
  return { problems: [ctx.t('cli.quest.class_for_kind', { kind: kind.id, choices })] };
}

function readTags(input: CommandInput, registry: Registry, ctx: KingdomContext) {
  const tags = [...new Set(textOptions(input, 'tag'))];
  const known: readonly string[] = registry.tags.map((tag) => tag.id);
  const problems = tags
    .filter((tag) => !known.includes(tag))
    .map((tag) => ctx.t('cli.error.unknown', { option: '--tag', value: tag, choices: known.join(', ') }));
  if (tags.length > QUEST_TAGS_MAX) problems.push(ctx.t('cli.quest.too_many_tags', { max: QUEST_TAGS_MAX }));
  return { tags, problems };
}

/** Title, rank and kind: what every quest has. */
function readBasics(input: CommandInput, registry: Registry, ctx: KingdomContext) {
  const problems: string[] = [];
  const title = textOption(input, 'title') ?? '';
  if (title.length > QUEST_TITLE_MAX_LENGTH)
    problems.push(ctx.t('cli.quest.title_length', { max: QUEST_TITLE_MAX_LENGTH }));
  const rank = (textOption(input, 'rank') ?? '').toUpperCase();
  if (!isRank(rank))
    problems.push(ctx.t('cli.error.choice', { option: '--rank', choices: RANKS.join(', ') }));
  const kindId = textOption(input, 'kind') ?? '';
  const kind = registry.kinds.find((entry) => entry.id === kindId);
  if (kind === undefined) {
    const choices = registry.kinds.map((entry) => entry.id).join(', ');
    problems.push(ctx.t('cli.error.unknown', { option: '--kind', value: kindId, choices }));
  }
  return { title, rank: isRank(rank) ? rank : undefined, kind, problems };
}

async function runQuestAdd(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const registry = await ctx.store.loadRegistry();
  if (!registry.ok) {
    registry.error.flatMap((issue) => registryIssueLines(ctx.t, issue)).forEach(ctx.io.err);
    return EXIT.failed;
  }
  const basics = readBasics(input, registry.value, ctx);
  const script = readScript(input, basics.kind, registry.value, ctx);
  const klass = script.choice === undefined ? readClass(input, basics.kind, ctx) : { problems: [] };
  const tags = readTags(input, registry.value, ctx);
  const territory = textOption(input, 'territory') ?? '';
  const dependsOn = [...new Set(textOptions(input, 'depends-on'))];
  const problems = [
    ...[basics, script, klass, tags].flatMap((part) => part.problems),
    ...(await territoryMissing(ctx, territory)),
    ...(await questsMissing(ctx, dependsOn)),
  ];
  if (problems.length > 0 || basics.kind === undefined || basics.rank === undefined) {
    problems.forEach(ctx.io.err);
    return EXIT.failed;
  }
  const seal = flagOption(input, 'seal');
  const payload = {
    draft: false,
    title: basics.title,
    description: textOption(input, 'description') ?? '',
    kind: basics.kind.id,
    rank: basics.rank,
    territory,
    tier: script.choice === undefined ? 'session' : 'script',
    ...(script.choice === undefined ? {} : { script: script.choice }),
    ...('id' in klass ? { class_required: klass.id } : {}),
    tags: tags.tags,
    ...(seal === undefined ? {} : { seal_required: seal }),
    ...(dependsOn.length === 0 ? {} : { depends_on: dependsOn }),
    created_by: 'user',
  } as const;
  const command = { ...commandHeader(ctx), kind: 'create_quest', payload } as const;
  return sendCommand(ctx, command, 'cli.quest.add.sent', { title: basics.title });
}

export const QUEST_ADD: CommandSpec = {
  name: ['quest', 'add'],
  summary: 'cli.quest.add.summary',
  args: [],
  options: {
    title: { type: 'string', value: '<text>', required: true, help: 'cli.quest.add.option.title' },
    description: {
      type: 'string',
      value: '<text>',
      required: true,
      help: 'cli.quest.add.option.description',
    },
    kind: { type: 'string', value: '<kind>', required: true, help: 'cli.quest.add.option.kind' },
    rank: { type: 'string', value: '<F..S>', required: true, help: 'cli.quest.add.option.rank' },
    territory: { type: 'string', value: '<id>', required: true, help: 'cli.quest.add.option.territory' },
    class: { type: 'string', value: '<class>', help: 'cli.quest.add.option.class' },
    tag: { type: 'string', value: '<tag>', multiple: true, help: 'cli.quest.add.option.tag' },
    seal: { type: 'boolean', help: 'cli.quest.add.option.seal' },
    'depends-on': {
      type: 'string',
      value: '<quest>',
      multiple: true,
      help: 'cli.quest.add.option.depends_on',
    },
    script: { type: 'string', value: '<script>', help: 'cli.quest.add.option.script' },
    params: { type: 'string', value: '<json>', help: 'cli.quest.add.option.params' },
  },
  run: runQuestAdd,
};
