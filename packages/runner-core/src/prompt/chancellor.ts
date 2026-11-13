// buildChancellorPrompt: the owner's words and the context draftQuests needs (implementation-plan §3.11, §10
// question 3). A separate function from buildPrompt because the Chancellor works on no quest; P1-13 adds fields
// to the context if it needs them. PS-06 adds the council's thresholds, the quest template, the way to size a
// session, each kind's seal and each class's tools, and on a second try the reply the screen sent back.
import { QUEST_TAGS_MAX, sharedGlobsOf } from '@elvaria/domain';

import { LANGUAGE_NAMES, classBlock, decreeBlock } from './blocks.ts';
import { classesOf, draftingValuesOf } from './drafting.ts';
import { fenced, fill, joinBlocks } from './templates.ts';
import type { BuiltPrompt } from '../runner/types.ts';
import type { Locale } from './blocks.ts';
import type { PromptTemplates } from './templates.ts';
import type { Character, Council, PoolView, Registry, Territory } from '@elvaria/domain';

/** The Chancellor's first reply, which the screen sent back, and why (PS-06): its second try reads both. */
export interface ReturnedReply {
  /** The reply as JSON. */
  readonly reply: string;
  /** One line per problem, in English. */
  readonly problems: readonly string[];
}

export interface ChancellorContext {
  /** What the owner said, verbatim. */
  readonly utterance: string;
  readonly locale: Locale;
  readonly decree: string | null;
  /** The kingdom's `registry/prompts/chancellor.md` (the class's `prompt_file`, P1-15), or null when it is gone. */
  readonly class_prompt: string | null;
  readonly territories: readonly Territory[];
  /** Kinds with their classes, tags and the script catalog are what a draft may name. */
  readonly registry: Registry;
  readonly roster: readonly Character[];
  readonly mana: readonly PoolView[];
  /** `kingdom.breakers.context_budget_tokens`: above it a job is split (ADR 0017). */
  readonly context_budget_tokens: number;
  /** `kingdom.dispatch.council`: work this large goes through the council (ADR 0028, PS-06). */
  readonly council: Council;
  /** Set on the second try only. */
  readonly returned?: ReturnedReply;
}

export const list = (lines: readonly string[], none: string): string =>
  lines.length === 0 ? none : lines.join('\n');
export const names = (ids: readonly string[]): string => (ids.length === 0 ? 'none' : ids.join(', '));

/** The territory's hot files (PS-05), which no draft puts in its scope; nothing when it names none. */
function sharedOf(territory: Territory): string {
  const globs = sharedGlobsOf(territory);
  return globs.length === 0 ? '' : `; shared paths: ${globs.map((glob) => `\`${glob}\``).join(', ')}`;
}

export function territoriesOf(territories: readonly Territory[]): string {
  return list(
    territories.map(
      (territory) =>
        `- \`${territory.id}\` (${territory.kind}): ${territory.name}; secrets allowed: ${names(territory.secrets_allowed)}; checks: ${names(territory.checks.map(({ id }) => id))}${sharedOf(territory)}`,
    ),
    'No territory is attached yet.',
  );
}

export function catalogOf({ kinds, tags, scripts, classes }: Registry) {
  return {
    // The seal of each kind (PS-06): a draft that leaves seal_required out takes it.
    kinds: list(
      kinds.map(
        (kind) =>
          `- \`${kind.id}\`: deliverable ${kind.deliverable_type}; classes ${names(kind.classes_allowed)}; ${kind.seal_default ? 'sealed' : 'no seal'} by default`,
      ),
      'None.',
    ),
    classes: list(classesOf(classes), 'None.'),
    tags: list(
      tags.map(
        (tag) =>
          `- \`${tag.id}\`: ${tag.name_en}${tag.description === undefined ? '' : `. ${tag.description}`}`,
      ),
      'None.',
    ),
    scripts: list(
      scripts.map(
        (script) =>
          `- \`${script.id}\` (kinds ${names(script.kinds)}; produces ${script.produces}): ${script.description} Params: \`${JSON.stringify(script.params_schema)}\``,
      ),
      'None.',
    ),
  };
}

export function rosterOf(roster: readonly Character[]): string {
  return list(
    roster.map(
      (character) =>
        `- \`${character.id}\`: ${character.class}, tribe ${character.tribe}, level ${character.level}, ${character.status}`,
    ),
    'No character yet.',
  );
}

function manaOf(pools: readonly PoolView[]): string {
  return list(
    pools.map((pool) => {
      const readings = pool.readings.map((reading) => `${reading.window} ${reading.used_pct}% used`);
      const state = pool.asleep ? 'asleep' : 'awake';
      return `- ${pool.tribe}/${pool.pool}: ${state}${readings.length === 0 ? '' : `; ${readings.join(', ')}`}`;
    }),
    'No reading yet.',
  );
}

/** The second try's block: what came back, and the first reply; nothing on the first try. */
function returnedOf(returned: ReturnedReply | undefined, t: PromptTemplates): string {
  if (returned === undefined) return '';
  return fill(t['chancellor-returned'], {
    problems: returned.problems.map((problem) => `- ${problem}`).join('\n'),
    reply: fenced(returned.reply, 'json'),
  });
}

export function buildChancellorPrompt(context: ChancellorContext, t: PromptTemplates): BuiltPrompt {
  const language = LANGUAGE_NAMES[context.locale];
  const role = fill(t.chancellor, {
    context_budget_tokens: String(context.context_budget_tokens),
    tags_max: String(QUEST_TAGS_MAX),
    language,
    council_rank: context.council.from_rank,
    council_areas: String(context.council.from_areas),
    ...draftingValuesOf(t, { language, context_budget_tokens: context.context_budget_tokens }),
  });
  return {
    system: joinBlocks([
      decreeBlock(context.decree, t),
      role,
      classBlock(context.class_prompt, 'Chancellor', t),
    ]),
    user: fill(t['chancellor-context'], {
      utterance: context.utterance.trim(),
      territories: territoriesOf(context.territories),
      ...catalogOf(context.registry),
      roster: rosterOf(context.roster),
      mana: manaOf(context.mana),
      returned: returnedOf(context.returned, t),
    }),
  };
}
