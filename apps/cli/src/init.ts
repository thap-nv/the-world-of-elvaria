// `elvaria init`: a new kingdom folder with the default registry and two tribes (implementation-plan §2.2,
// §3.14). The store lays the folder out; the registry comes from @elvaria/registry-default, which only the
// composition root may hand to it (§1.3).
import path from 'node:path';

import { AbsPathSchema, KingdomSchema, NAME_MAX_LENGTH, isTimeZone, zonedTime } from '@elvaria/domain';
import type { Kingdom } from '@elvaria/domain';
import type { Locale } from '@elvaria/i18n';
import { REGISTRY_ROOT, registryFiles } from '@elvaria/registry-default';
import { initKingdom, toPortable } from '@elvaria/store';

import { textOption } from './args.ts';
import { EXIT } from './command.ts';
import { storeIssueLines } from './issues.ts';
import { kingdomDir } from './kingdom-context.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from './command.ts';

const PROFESSIONS = ['developer', 'ba', 'marketing', 'researcher', 'other'] as const;
type Profession = (typeof PROFESSIONS)[number];
const isProfession = (value: string): value is Profession =>
  (PROFESSIONS as readonly string[]).includes(value);

/**
 * The tribes a new kingdom starts with (ADR 0018, 0021): Claude Code for the claude tribe, Antigravity for the
 * gemini tribe with its Claude/GPT pool off, so that tribe really is the Gemini model family (§9.1 item 17).
 * `elvaria doctor` fills `tool` once it finds each CLI.
 */
export const DEFAULT_TRIBES = [
  { id: 'claude', adapter: 'claude_code', enabled: true, max_concurrent: 2 },
  {
    id: 'gemini',
    adapter: 'antigravity',
    enabled: true,
    max_concurrent: 1,
    pools: { gemini_models: { enabled: true }, claude_gpt_models: { enabled: false } },
  },
] as const;

export interface KingdomChoices {
  readonly name: string;
  readonly profession: Profession;
  readonly locale: Locale;
  readonly tz: string;
  /** Absolute, with `/`. */
  readonly treasury: string;
  readonly createdAt: string;
}

/** kingdom.json for a new kingdom: the owner's choices, every other setting at its schema default. */
export function newKingdom(choices: KingdomChoices): Kingdom {
  return KingdomSchema.parse({
    version: 1,
    name: choices.name,
    created_at: choices.createdAt,
    tz: choices.tz,
    owner: { profession: choices.profession, locale: choices.locale },
    paths: { treasury: choices.treasury },
    tribes: DEFAULT_TRIBES,
    mana: {},
    breakers: {},
    schedule: {},
    dispatch: {},
    bell: {},
    tunnel: {},
    theme: 'fantasy',
    ui: {},
  });
}

/** What the owner typed, checked field by field so each mistake gets its own sentence. */
function readChoices(input: CommandInput, ctx: CliContext): KingdomChoices | string[] {
  const { t, io } = ctx;
  const problems: string[] = [];
  const name = textOption(input, 'name') ?? '';
  if (name.length === 0 || name.length > NAME_MAX_LENGTH)
    problems.push(t('cli.error.name_length', { max: NAME_MAX_LENGTH }));
  const profession = textOption(input, 'profession') ?? 'developer';
  if (!isProfession(profession))
    problems.push(t('cli.error.choice', { option: '--profession', choices: PROFESSIONS.join(', ') }));
  const tz = textOption(input, 'tz') ?? io.timeZone;
  if (!isTimeZone(tz)) problems.push(t('cli.error.time_zone', { tz }));
  const treasuryPath = textOption(input, 'treasury') ?? path.join(io.home, '.elvaria', 'treasury.json');
  const treasury = toPortable(path.resolve(io.cwd, treasuryPath), io.platform);
  if (!AbsPathSchema.safeParse(treasury).success)
    problems.push(t('cli.error.absolute_path', { path: treasury }));
  const time = zonedTime(tz);
  if (problems.length > 0 || !time.ok || !isProfession(profession)) return problems;
  const createdAt = time.value.format(io.clock.now());
  return { name, profession, locale: ctx.locale, tz, treasury, createdAt };
}

async function runInit(input: CommandInput, ctx: CliContext): Promise<ExitCode> {
  const { t, io } = ctx;
  const dir = kingdomDir(input, io);
  if (dir === undefined) {
    io.err(t('cli.error.no_kingdom'));
    return EXIT.usage;
  }
  const choices = readChoices(input, ctx);
  if (Array.isArray(choices)) {
    choices.forEach(io.err);
    return EXIT.usage;
  }
  const created = await initKingdom(dir, newKingdom(choices), {
    root: REGISTRY_ROOT,
    files: registryFiles(),
  });
  if (!created.ok) {
    storeIssueLines(t, created.error).forEach(io.err);
    return EXIT.failed;
  }
  const tribes = created.value.tribes.map((tribe) => `${tribe.id} (${tribe.adapter})`).join(', ');
  io.out(t('cli.init.done', { name: choices.name, dir }));
  io.out(t('cli.init.tribes', { tribes, dir }));
  io.out(t('cli.init.next', { dir }));
  return EXIT.ok;
}

export const INIT: CommandSpec = {
  name: ['init'],
  summary: 'cli.init.summary',
  args: [],
  options: {
    name: { type: 'string', value: '<name>', required: true, help: 'cli.init.option.name' },
    profession: { type: 'string', value: '<profession>', help: 'cli.init.option.profession' },
    tz: { type: 'string', value: '<zone>', help: 'cli.init.option.tz' },
    treasury: { type: 'string', value: '<file>', help: 'cli.init.option.treasury' },
  },
  run: runInit,
};
