// ToolPolicy = class tools + territory laws + role (implementation-plan §3.7, ADR 0007, 0008, 0013, 0017). One
// shape for every tribe: the Claude adapter writes it into `--tools` and settings.json, the others translate the
// rules; the laws go to the hook through policy.json, because a regex cannot be written as a permission rule.
import {
  AGENT_TOOL,
  APPRENTICE_RULE,
  BUILT_IN_AGENTS,
  CHECK_COMMANDS,
  NO_PUSH_COMMAND,
  NO_PUSH_RULE,
  SECRET_FILES,
  SHELL_TOOL,
  WRITE_TOOLS,
} from './constants.ts';
import type { SpawnRole } from '../runner/roles.ts';
import type { Character, CharacterClass, Territory } from '@elvaria/domain';

export interface ToolLaws {
  /** Globs relative to the plot, matched by the hook at any depth. */
  readonly forbidden_paths: readonly string[];
  /** Regular expressions matched by the hook against shell commands, case-insensitively. */
  readonly forbidden_commands: readonly string[];
}

export interface ToolPolicy {
  /** Tools that exist in the session (Claude `--tools`); everything else is absent, not merely denied. */
  readonly tools: readonly string[];
  /** Permission rules in Claude Code syntax: `Read`, `Bash(pnpm test:*)`. Deny wins over allow. */
  readonly allow: readonly string[];
  readonly deny: readonly string[];
  /** The apprentice this character may start (§3.12), with its tools; null when it may start none. */
  readonly apprentice: { readonly tools: readonly string[] } | null;
  readonly laws: ToolLaws;
}

export interface ToolPolicyInput {
  readonly role: SpawnRole;
  readonly characterClass: Pick<CharacterClass, 'tools'>;
  /** `character.tools`: a list given there replaces the class's list (schema: "Overrides of the class default"). */
  readonly character?: Pick<Character, 'tools'>;
  readonly territory?: Pick<Territory, 'laws' | 'checks' | 'commands'>;
}

const unique = (items: readonly string[]): string[] => [...new Set(items)];

/** `Bash(git diff:*)` → `Bash`; a bare `Read` → `Read`. */
export const toolOf = (rule: string): string => {
  const open = rule.indexOf('(');
  return open === -1 ? rule : rule.slice(0, open);
};

const isWriteTool = (tool: string): boolean => (WRITE_TOOLS as readonly string[]).includes(tool);

/** A path of the laws as a Claude rule relative to the plot: `infra/secrets/**` → `./infra/secrets/**`. */
const plotPath = (glob: string): string => `./${glob.replaceAll('\\', '/').replace(/^\.?\//, '')}`;

/** The territory's own check commands, so a character with a shell can rerun what judges it (ADR 0008). */
function checkRules(territory: ToolPolicyInput['territory']): string[] {
  if (territory === undefined) return [];
  // An exclusive check (Docker, e2e) holds a lock across quests; only runChecks may start it.
  const checks = territory.checks.filter((check) => !check.exclusive).map((check) => check.run);
  const commands = CHECK_COMMANDS.flatMap((name) => territory.commands[name] ?? []);
  return unique([...checks, ...commands]).map((command) => `${SHELL_TOOL}(${command}:*)`);
}

function lawsOf(territory: ToolPolicyInput['territory']): ToolLaws {
  return {
    forbidden_paths: unique([...SECRET_FILES, ...(territory?.laws.forbidden_paths ?? [])]),
    forbidden_commands: unique([...(territory?.laws.forbidden_commands ?? []), NO_PUSH_COMMAND]),
  };
}

/** Rules every session carries, whatever its class: no push, no secret files, only the apprentice as agent. */
function fenceRules(laws: ToolLaws): string[] {
  const paths = laws.forbidden_paths.map(plotPath);
  return [
    NO_PUSH_RULE,
    ...paths.map((glob) => `Read(${glob})`),
    ...paths.map((glob) => `Edit(${glob})`),
    ...BUILT_IN_AGENTS.map((agent) => `${AGENT_TOOL}(${agent})`),
  ];
}

export function toolPolicyOf(input: ToolPolicyInput): ToolPolicy {
  const own = input.character?.tools;
  const classAllow = own?.allow ?? input.characterClass.tools.allow;
  const classDeny = own?.deny ?? input.characterClass.tools.deny;
  const verifier = input.role === 'verifier';
  const withApprentice = input.role === 'assignee' && classAllow.includes(APPRENTICE_RULE);
  const granted = classAllow.filter(
    (rule) => rule !== APPRENTICE_RULE && !(verifier && isWriteTool(toolOf(rule))),
  );
  // A bare deny (`Bash`, `WebFetch`) removes the tool itself, even if an override allowed one of its forms.
  const deniedTools = new Set(classDeny.filter((rule) => toolOf(rule) === rule));
  const ownTools = unique(granted.map(toolOf)).filter((tool) => !deniedTools.has(tool));
  const tools = withApprentice ? [...ownTools, AGENT_TOOL] : ownTools;
  const shell = tools.includes(SHELL_TOOL) ? checkRules(input.territory) : [];
  const laws = lawsOf(input.territory);
  return {
    tools,
    allow: unique([...granted, ...shell]),
    deny: unique([...classDeny, ...(verifier ? WRITE_TOOLS : []), ...fenceRules(laws)]),
    // The apprentice gets the character's tools without Agent, so it cannot start another (§3.12).
    apprentice: withApprentice ? { tools: ownTools } : null,
    laws,
  };
}
