// buildChancellorPrompt: the owner's words and the context draftQuests needs (implementation-plan §3.11, §10
// question 3). A separate function from buildPrompt because the Chancellor works on no quest; P1-13 adds fields
// to the context if it needs them.
import { QUEST_TAGS_MAX, sharedGlobsOf } from '@elvaria/domain';

import { LANGUAGE_NAMES, classBlock, decreeBlock } from './blocks.ts';
import { fill, joinBlocks } from './templates.ts';
import type { BuiltPrompt } from '../runner/types.ts';
import type { Locale } from './blocks.ts';
import type { PromptTemplates } from './templates.ts';
import type { Character, PoolView, Registry, Territory } from '@elvaria/domain';

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
        `- \`${territory.id}\` (${territory.kind}): ${territory.name}; secrets allowed: ${names(territory.secrets_allowed)}${sharedOf(territory)}`,
    ),
    'No territory is attached yet.',
  );
}

export function catalogOf({ kinds, tags, scripts }: Registry) {
  return {
    kinds: list(
      kinds.map(
        (kind) =>
          `- \`${kind.id}\`: deliverable ${kind.deliverable_type}; classes ${names(kind.classes_allowed)}`,
      ),
      'None.',
    ),
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

export function buildChancellorPrompt(context: ChancellorContext, t: PromptTemplates): BuiltPrompt {
  const role = fill(t.chancellor, {
    context_budget_tokens: String(context.context_budget_tokens),
    tags_max: String(QUEST_TAGS_MAX),
    language: LANGUAGE_NAMES[context.locale],
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
    }),
  };
}
