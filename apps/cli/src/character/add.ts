// `elvaria character add <id> --class <class>`: summon a character (implementation-plan §2.6, §3.14). No inbox
// command creates a character (`summon` opens a running session's terminal), so the CLI writes the new file
// itself, and only ever creates one: an existing character is never overwritten, and every later change to it
// is the Steward's (ADR 0005, as amended for P0-08).
import {
  CHARACTER_LEVEL_MAX,
  CharacterIdSchema,
  CharacterSchema,
  ModelSlugSchema,
  NAME_MAX_LENGTH,
  rankCeilingOf,
  startingLevelOf,
} from '@elvaria/domain';
import type { Character, CharacterClass, CharacterId, Registry, Tribe, TribeModel } from '@elvaria/domain';

import { textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { recordCharacterCreated } from '../events.ts';
import { registryIssueLines, storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { nameIn } from '../labels.ts';
import { levelOfText } from './level.ts';
import { declaredModelsOf, unservedLine } from './served.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** `2026-11-06`: the date part of an ISO time, which `stats.tokens_day` stores. */
const DATE_LENGTH = 10;

/** `thorn` → `Thorn`, cut to the 24 characters a name may have. */
const nameOf = (id: string): string =>
  `${id.charAt(0).toUpperCase()}${id.slice(1)}`.slice(0, NAME_MAX_LENGTH);

/** `--level` as given; undefined when the owner left it to the model (P1-26). */
function readLevel(input: CommandInput): number | 'invalid' | undefined {
  const text = textOption(input, 'level');
  return text === undefined ? undefined : (levelOfText(text) ?? 'invalid');
}

/** Where the starting level came from: `--level`, the model's row, or neither (level 1). */
type LevelSource = 'option' | 'model' | 'none';

interface Choices {
  readonly id: CharacterId;
  readonly name: string;
  readonly klass: CharacterClass;
  readonly tribe: Tribe;
  readonly model: string;
  readonly level: number;
  readonly levelSource: LevelSource;
  /** The models the tribe's adapter declares (PS-23); undefined: it declares none. */
  readonly declared?: readonly TribeModel[] | undefined;
}

/**
 * The level `--level` gave, else the model's starting level (startingLevelOf: the one the tribe's adapter declares,
 * else the slug's words), else 1.
 */
function levelOf(
  given: number | undefined,
  model: string,
  declared?: readonly TribeModel[],
): Pick<Choices, 'level' | 'levelSource'> {
  if (given !== undefined) return { level: given, levelSource: 'option' };
  const suggested = startingLevelOf(model, declared);
  return suggested === undefined
    ? { level: 1, levelSource: 'none' }
    : { level: suggested, levelSource: 'model' };
}

/** Class and tribe: the class's own tribe unless `--tribe` names another of kingdom.tribes. */
function readClassAndTribe(input: CommandInput, ctx: KingdomContext, registry: Registry) {
  const { t } = ctx;
  const problems: string[] = [];
  const classId = textOption(input, 'class') ?? '';
  const klass = registry.classes.find((entry) => entry.id === classId);
  const classes = registry.classes.map((entry) => entry.id).join(', ');
  if (klass === undefined)
    problems.push(t('cli.error.unknown', { option: '--class', value: classId, choices: classes }));
  const tribeId = textOption(input, 'tribe') ?? klass?.default_tribe ?? '';
  const tribe = ctx.kingdom.tribes.find((entry) => entry.id === tribeId);
  const tribes = ctx.kingdom.tribes.map((entry) => entry.id).join(', ');
  if (tribe === undefined)
    problems.push(t('cli.error.unknown', { option: '--tribe', value: tribeId, choices: tribes }));
  return { klass, tribe, problems };
}

/** `--model`, else the class default in its own tribe, else the default doctor pinned for the tribe. */
function readModel(input: CommandInput, ctx: KingdomContext, klass: CharacterClass, tribe: Tribe) {
  const model =
    textOption(input, 'model') ??
    (klass.default_tribe === tribe.id ? klass.default_model : tribe.tool?.default_model);
  if (model === undefined) return { problems: [ctx.t('cli.character.need_model', { tribe: tribe.id })] };
  if (!ModelSlugSchema.safeParse(model).success)
    return { problems: [ctx.t('cli.character.bad_model', { model })] };
  return { model, problems: [] };
}

/** What the owner asked for, or every problem with the command line at once. */
function readChoices(input: CommandInput, ctx: KingdomContext, registry: Registry): Choices | string[] {
  const { t } = ctx;
  const idText = input.positionals[0] ?? '';
  const id = CharacterIdSchema.safeParse(idText);
  const name = textOption(input, 'name') ?? nameOf(idText);
  const level = readLevel(input);
  const { klass, tribe, problems } = readClassAndTribe(input, ctx, registry);
  const model = klass === undefined || tribe === undefined ? undefined : readModel(input, ctx, klass, tribe);
  const all = [
    ...(id.success ? [] : [t('cli.character.bad_id', { id: idText })]),
    ...(name.length > 0 && name.length <= NAME_MAX_LENGTH
      ? []
      : [t('cli.error.name_length', { max: NAME_MAX_LENGTH })]),
    ...(level === 'invalid' ? [t('cli.character.bad_level', { max: CHARACTER_LEVEL_MAX })] : []),
    ...problems,
    ...(model?.problems ?? []),
  ];
  if (all.length > 0 || !id.success || !klass || !tribe || model?.model === undefined || level === 'invalid')
    return all;
  return { id: id.data, name, klass, tribe, model: model.model, ...levelOf(level, model.model) };
}

/** A character as summoned: idle, no verdicts yet, at its starting level (§2.6). */
export function newCharacter(choices: Choices, now: string): Character {
  return CharacterSchema.parse({
    version: 1,
    id: choices.id,
    name: choices.name,
    class: choices.klass.id,
    tribe: choices.tribe.id,
    model: choices.model,
    level: choices.level,
    reputation: { window: [] },
    skill_affinity: {},
    pinned_tag: null,
    status: 'idle',
    status_since: now,
    vow_no_production: choices.klass.is_verifier || choices.klass.is_monk,
    consecutive_fail: { count: 0 },
    stats: { quests_done: 0, tokens_today: 0, tokens_day: now.slice(0, DATE_LENGTH) },
    created_at: now,
  });
}

async function runCharacterAdd(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const registry = await ctx.store.loadRegistry();
  if (!registry.ok) {
    registry.error.flatMap((issue) => registryIssueLines(ctx.t, issue)).forEach(ctx.io.err);
    return EXIT.failed;
  }
  const read = readChoices(input, ctx, registry.value);
  const choices = Array.isArray(read) ? read : await servedChoices(ctx, read);
  if (Array.isArray(choices)) {
    choices.forEach(ctx.io.err);
    return EXIT.failed;
  }
  const existing = await ctx.store.characters.read(choices.id);
  if (existing.ok || existing.error.code !== 'not_found') {
    ctx.io.err(ctx.t('cli.character.exists', { id: choices.id }));
    return EXIT.failed;
  }
  const written = await ctx.store.characters.write(newCharacter(choices, ctx.now()));
  if (!written.ok) {
    storeIssueLines(ctx.t, written.error).forEach(ctx.io.err);
    return EXIT.failed;
  }
  await recordCharacterCreated(ctx, written.value);
  const { klass, tribe } = choices;
  const params = {
    name: choices.name,
    id: choices.id,
    class: nameIn(ctx.locale, klass),
    level: choices.level,
  };
  ctx.io.out(ctx.t('cli.character.added', params));
  ctx.io.out(ctx.t('cli.character.tribe_model', { tribe: tribe.id, model: choices.model }));
  levelLines(ctx, choices).forEach(ctx.io.out);
  if (!tribe.enabled) ctx.io.out(ctx.t('cli.character.tribe_disabled', { tribe: tribe.id }));
  return EXIT.ok;
}

/**
 * The choices once the tribe's adapter is asked for its models (PS-23): a model it does not serve is refused, and the
 * starting level is the one it gives the model, unless `--level` said.
 */
async function servedChoices(ctx: KingdomContext, choices: Choices): Promise<Choices | string[]> {
  const declared = await declaredModelsOf(choices.tribe, ctx);
  const unserved = unservedLine(ctx, choices.tribe, choices.model, declared);
  if (unserved !== undefined) return [unserved];
  if (declared === undefined) return choices;
  const level = choices.levelSource === 'option' ? {} : levelOf(undefined, choices.model, declared);
  return { ...choices, ...level, declared };
}

/**
 * Why the character starts at its level, when the owner did not say: the model's row, or none (P1-26). A `--level`
 * above the model's row is said too (P1-43, (b) of P1-38): the Steward reads a level as the model's strength and
 * gives quests by it, so a weak model raised by hand takes quests it may not carry.
 */
function levelLines(ctx: KingdomContext, { id, level, levelSource, model, declared }: Choices): string[] {
  const ceiling = rankCeilingOf(level);
  if (levelSource === 'none') return [ctx.t('cli.character.level_unknown_model', { model })];
  if (levelSource === 'model') return [ctx.t('cli.character.level_from_model', { level, model, ceiling })];
  const suggested = startingLevelOf(model, declared);
  if (suggested === undefined || level <= suggested) return [];
  return [ctx.t('cli.character.level_above_model', { level, model, suggested, ceiling, id })];
}

export const CHARACTER_ADD: CommandSpec = {
  name: ['character', 'add'],
  summary: 'cli.character.add.summary',
  args: [{ name: '<id>', help: 'cli.character.add.arg.id' }],
  options: {
    class: { type: 'string', value: '<class>', required: true, help: 'cli.character.add.option.class' },
    tribe: { type: 'string', value: '<tribe>', help: 'cli.character.add.option.tribe' },
    model: { type: 'string', value: '<model>', help: 'cli.character.add.option.model' },
    level: { type: 'string', value: '<1-10>', help: 'cli.character.add.option.level' },
    name: { type: 'string', value: '<name>', help: 'cli.character.add.option.name' },
  },
  run: runCharacterAdd,
};
