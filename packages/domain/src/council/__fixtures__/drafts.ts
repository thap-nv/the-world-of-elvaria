// Descriptions in the quest template and sub-quest drafts built on them, for the council's specs.
import { QuestDraftSchema } from '../../schema/quest/quest-draft.ts';
import type { QuestDraft } from '../../schema/quest/quest-draft.ts';

/** A description with every section of the template; `skip` leaves sections out, `steps` replaces the steps. */
export function described(
  skip: readonly string[] = [],
  steps = '1. Add the code.\n2. Add its test.',
): string {
  const sections: readonly (readonly [string, string])[] = [
    ['Goal', 'The doctor names its reasons in the owner’s language.'],
    ['Steps', steps],
    ['Files', '- `apps/cli/src/doctor/**`'],
    ['Done when', '- check `typecheck` passes\n- `pnpm --filter @elvaria/cli test` is green'],
    ['Do not touch', 'None.'],
    ['Known traps', 'None known.'],
  ];
  return sections
    .filter(([heading]) => !skip.includes(heading))
    .map(([heading, text]) => `## ${heading}\n\n${text}`)
    .join('\n\n');
}

/** A rank D knight's sub-quest on `elvaria`, in the template, scoped to `scope` (none when empty) unless `fields` say otherwise. */
export const subquest = (
  ref: string,
  scope: readonly string[],
  fields: Readonly<Record<string, unknown>> = {},
): QuestDraft =>
  QuestDraftSchema.parse({
    ref,
    title: `Part ${ref}`,
    description: described(),
    kind: 'build',
    rank: 'D',
    territory: 'elvaria',
    tier: 'session',
    class_required: 'knight',
    tags: ['backend'],
    ...(scope.length === 0 ? {} : { scope_paths: [...scope] }),
    depends_on_refs: [],
    estimate: { tokens: 200_000, minutes: 30, context: 80_000 },
    secrets_required: [],
    ...fields,
  });
