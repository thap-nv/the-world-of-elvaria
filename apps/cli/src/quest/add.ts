// `elvaria quest add`: a quest straight to `open`, no Chancellor and no mana (implementation-plan §3.11, stage 0).
// It sends `create_quest` with draft = false; the Steward gives the quest its id and writes the file (ADR 0005).
// With --to, the quest names its assignee: only that character takes it, as after a reassign (P1-29). With
// --contract, it heads a party (P1-18): its lead writes the contract and the parts.
import {
  QUEST_TAGS_MAX,
  QUEST_TITLE_MAX_LENGTH,
  RANKS,
  blindTrialDue,
  scriptParamsIssues,
} from '@elvaria/domain';
import type { Character, InboxCommandInput, Kind, Rank, Registry, Territory } from '@elvaria/domain';

import { flagOption, textOption, textOptions } from '../args.ts';
import { EXIT } from '../command.ts';
import { registryIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { assigneeFor, ceilingLines } from './assignee.ts';
import { questsMissing, readTerritory } from './references.ts';
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
  // The Steward refuses params outside the catalog's params_schema (§3.12): say why here, before the inbox.
  const issues = script === undefined || params === undefined ? [] : scriptParamsIssues(script, params);
  if (issues.length > 0)
    problems.push(ctx.t('cli.quest.script_params', { script: id, issues: issues.join('; ') }));
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

/**
 * `--to`: the only character who takes the quest (P1-29), checked as the Steward checks it. A script runs without
 * anyone; without a class (its problem already said) there is nothing to check it against.
 */
async function readAssignee(
  input: CommandInput,
  scripted: boolean,
  klass: string | undefined,
  ctx: KingdomContext,
) {
  const to = textOption(input, 'to');
  if (to === undefined) return { problems: [] };
  if (scripted) return { problems: [ctx.t('cli.quest.add.to_script')] };
  if (klass === undefined) return { problems: [] };
  const character = await assigneeFor(ctx, to, klass);
  return Array.isArray(character) ? { problems: character } : { character, problems: [] };
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

/**
 * `--contract` (P1-18 proposal (g)): the quest heads a party, so the owner opens one without the Chancellor. Only a
 * kind that delivers a list of sub-quests can open its parts (registry data, not a kind id), and only in a session.
 */
function readContract(
  input: CommandInput,
  kind: Kind | undefined,
  script: boolean,
  registry: Registry,
  ctx: KingdomContext,
) {
  if (flagOption(input, 'contract') !== true) return { contract: false, problems: [] };
  if (kind === undefined) return { contract: true, problems: [] };
  if (kind.deliverable_type === 'subquests' && !script) return { contract: true, problems: [] };
  const kinds = registry.kinds.filter((entry) => entry.deliverable_type === 'subquests').map(({ id }) => id);
  return { contract: true, problems: [ctx.t('cli.quest.add.contract_kind', { kinds: kinds.join(', ') })] };
}

/**
 * A session quest of the rank the territory's blind trial asks for, opened alone (P1-43, (a) of P1-37): the trial
 * is built on parties (ADR 0022), so this quest never has one, and the owner may have meant `--contract`.
 */
function blindTrialLines(
  ctx: KingdomContext,
  territory: Territory,
  rank: Rank,
  registry: Registry,
): string[] {
  if (!blindTrialDue(territory, { rank }, [])) return [];
  const kinds = registry.kinds.filter((entry) => entry.deliverable_type === 'subquests').map(({ id }) => id);
  const params = {
    territory: territory.id,
    min_rank: territory.blind_trial.min_rank,
    kinds: kinds.join(', '),
  };
  return [ctx.t('cli.quest.add.no_blind_trial', params)];
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
  const party = readContract(input, basics.kind, script.choice !== undefined, registry.value, ctx);
  const named = await readAssignee(
    input,
    script.choice !== undefined,
    'id' in klass ? klass.id : undefined,
    ctx,
  );
  const territory = await readTerritory(ctx, textOption(input, 'territory') ?? '');
  const dependsOn = [...new Set(textOptions(input, 'depends-on'))];
  const problems = [
    ...[basics, script, klass, tags, party, named].flatMap((part) => part.problems),
    ...(Array.isArray(territory) ? territory : []),
    ...(await questsMissing(ctx, dependsOn)),
  ];
  if (problems.length > 0 || !basics.kind || !basics.rank || Array.isArray(territory)) {
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
    territory: territory.id,
    tier: script.choice === undefined ? 'session' : 'script',
    ...(script.choice === undefined ? {} : { script: script.choice }),
    ...('id' in klass ? { class_required: klass.id } : {}),
    tags: tags.tags,
    ...(party.contract ? { party_role: 'contract' as const } : {}),
    ...(seal === undefined ? {} : { seal_required: seal }),
    ...(dependsOn.length === 0 ? {} : { depends_on: dependsOn }),
    ...('character' in named ? { assignee: named.character.id } : {}),
    created_by: 'user',
  } as const;
  const command = { ...commandHeader(ctx), kind: 'create_quest', payload } as const;
  const sent = await sendQuest(ctx, command, basics.rank, 'character' in named ? named.character : undefined);
  if (sent === EXIT.ok && script.choice === undefined && !party.contract)
    blindTrialLines(ctx, territory, basics.rank, registry.value).forEach(ctx.io.out);
  return sent;
}

/** Sends `create_quest`; for the character `--to` names, what its ceiling means for the quest's rank (P1-29). */
async function sendQuest(
  ctx: KingdomContext,
  command: InboxCommandInput & { readonly payload: { readonly title: string } },
  rank: Rank,
  character: Character | undefined,
): Promise<ExitCode> {
  const { title } = command.payload;
  if (character === undefined) return sendCommand(ctx, command, 'cli.quest.add.sent', { title });
  const params = { title, character: character.id };
  const sent = await sendCommand(ctx, command, 'cli.quest.add.sent_to', params);
  if (sent === EXIT.ok) ceilingLines(ctx, character, rank).forEach(ctx.io.out);
  return sent;
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
    to: { type: 'string', value: '<character>', help: 'cli.quest.add.option.to' },
    contract: { type: 'boolean', help: 'cli.quest.add.option.contract' },
  },
  run: runQuestAdd,
};
