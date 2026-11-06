// A scenario names tribes, classes, kinds, scripts and tags; the kingdom it runs in may not have them all (tribes
// are data, ADR 0021; the registry is the owner's to edit, ADR 0016). Every gap is reported before the day is
// played, with a code the CLI translates, rather than a day that stalls or a quest the schema refuses.
import type { Kingdom, Registry } from '@elvaria/domain';

import type { QuestTemplate, Scenario } from './scenario.ts';

export type RegistryWhat = 'class' | 'kind' | 'script' | 'tag';

export type ScenarioProblem =
  | { readonly code: 'missing_tribe'; readonly id: string }
  | { readonly code: 'missing_entry'; readonly what: RegistryWhat; readonly id: string }
  /** The kind does not let this class take it, or the script does not serve this kind. */
  | { readonly code: 'not_allowed'; readonly kind: string; readonly id: string };

const has = (entries: readonly { readonly id: string }[], id: string): boolean =>
  entries.some((entry) => entry.id === id);

function templateProblems(template: QuestTemplate, registry: Registry): ScenarioProblem[] {
  const problems: ScenarioProblem[] = [];
  const kind = registry.kinds.find(({ id }) => id === template.kind);
  if (kind === undefined) problems.push({ code: 'missing_entry', what: 'kind', id: template.kind });
  const { cls, script } = template;
  if (cls !== undefined && !has(registry.classes, cls))
    problems.push({ code: 'missing_entry', what: 'class', id: cls });
  else if (cls !== undefined && kind !== undefined && !kind.classes_allowed.some((id) => id === cls))
    problems.push({ code: 'not_allowed', kind: template.kind, id: cls });
  const entry = registry.scripts.find(({ id }) => id === script);
  if (script !== undefined && entry === undefined)
    problems.push({ code: 'missing_entry', what: 'script', id: script });
  else if (entry !== undefined && !entry.kinds.some((id) => id === template.kind))
    problems.push({ code: 'not_allowed', kind: template.kind, id: entry.id });
  for (const tag of template.tags.filter((id) => !has(registry.tags, id)))
    problems.push({ code: 'missing_entry', what: 'tag', id: tag });
  return problems;
}

/** Each problem once, in the order the scenario names things: cast, then quest templates. */
export function scenarioProblems(
  scenario: Scenario,
  kingdom: Kingdom,
  registry: Registry,
): ScenarioProblem[] {
  const problems: ScenarioProblem[] = [];
  for (const member of scenario.cast) {
    if (!has(kingdom.tribes, member.tribe)) problems.push({ code: 'missing_tribe', id: member.tribe });
    if (!has(registry.classes, member.cls))
      problems.push({ code: 'missing_entry', what: 'class', id: member.cls });
    for (const tag of member.history.tags.filter((id) => !has(registry.tags, id)))
      problems.push({ code: 'missing_entry', what: 'tag', id: tag });
  }
  problems.push(...scenario.templates.flatMap((template) => templateProblems(template, registry)));
  const seen = new Set<string>();
  return problems.filter((problem) => {
    const key = JSON.stringify(problem);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
