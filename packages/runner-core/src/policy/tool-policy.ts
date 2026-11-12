// ToolPolicy = class tools + territory laws + role (implementation-plan §3.7, ADR 0007, 0008, 0013, 0017). One
// shape for every tribe: the Claude adapter writes it into `--tools` and settings.json, the others translate the
// rules; the laws go to the hook through policy.json, because a regex cannot be written as a permission rule.
import {
  AGENT_TOOL,
  APPRENTICE_RULE,
  BUILT_IN_AGENTS,
  CHECK_COMMANDS,
  GIT_PATHS,
  NO_COMMIT_RULE,
  NO_HISTORY_COMMAND,
  NO_PUSH_COMMAND,
  NO_PUSH_RULE,
  SCRATCH_RULES,
  SEARCH_COMMANDS,
  SEARCH_TOOLS,
  SHELL_TOOL,
  WRITE_TOOLS,
} from './constants.ts';
import { forbiddenPathsOf } from './forbidden-changes.ts';
import { commandLinesOf, GRAPH_COMMANDS } from '@elvaria/domain';
import type { Character, CharacterClass, Territory } from '@elvaria/domain';

import type { SpawnRole } from '../runner/roles.ts';

export interface ToolLaws {
  /** Globs relative to the plot, matched by the hook at any depth: neither read nor written. */
  readonly forbidden_paths: readonly string[];
  /** Globs read freely but never written by a tool (generated files, P1-24); matched like forbidden_paths. */
  readonly read_only_paths: readonly string[];
  /**
   * Globs the Steward may change through the assignee's patch when its CLI refuses to write them (P1-28): the hook
   * and the prompt name the convention. Empty on a territory without git, whose plot has no `git apply`.
   */
  readonly patch_paths: readonly string[];
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
  /**
   * Commands the session's command tool may run in place of Glob and Grep, whose CLI has no search tool (P1-53):
   * SEARCH_COMMANDS, even for a class without a shell. Absent when the CLI searches on its own, the class has neither
   * tool, or the plot has no git.
   */
  readonly search_commands?: readonly string[];
  /**
   * The code graph's read-only commands (PS-21, ADR 0029): GRAPH_COMMANDS, for a class with Glob or Grep that does
   * not deny a bare `Bash`, when the quest's graph is built. A class without a shell gets them alone, never its
   * territory's checks: the adapters turn them into rules of the CLI, the hook allows one plain call per line.
   */
  readonly graph_commands?: readonly string[];
}

export interface ToolPolicyInput {
  readonly role: SpawnRole;
  readonly characterClass: Pick<CharacterClass, 'tools'>;
  /** `character.tools`: a list given there replaces the class's list (schema: "Overrides of the class default"). */
  readonly character?: Pick<Character, 'tools'>;
  readonly territory?: Pick<Territory, 'laws' | 'checks' | 'commands' | 'vcs'>;
  /**
   * A verifier in its scratch plot (ADR 0022, P1-20): it gets Edit and Write, even when its class denies them, to
   * break what the tests guard and restore it, runs the territory's exclusive checks too (the Steward holds their lock
   * for its session), and loses every git command that writes history. Ignored otherwise.
   */
  readonly scratch?: boolean;
  /**
   * The Steward holds the territory's exclusive lock for this judge in its scratch plot (P1-20): it may run the
   * exclusive checks. False for a judge opened after failing checks, who reads their logs and waits for no lock
   * (P1-54). Absent: as `scratch`.
   */
  readonly exclusive?: boolean;
  /** `capabilities.search` of the tribe's adapter (P1-53): false gives the SEARCH_COMMANDS; absent, it searches itself. */
  readonly cli_search?: boolean | undefined;
  /** The quest's code graph is built and its territory has `code_graph` on (PS-21); absent: no graph commands. */
  readonly graph?: boolean;
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

/**
 * The territory's own check commands, so a character with a shell can rerun what judges it (ADR 0008). An exclusive
 * check (Docker, e2e) holds a lock across quests, so only runChecks may start it, and a judge in its scratch plot,
 * for whom the Steward holds that lock for the whole session (P1-20): `exclusive` says the caller holds it.
 */
function checkRules(territory: ToolPolicyInput['territory'], exclusive: boolean): string[] {
  if (territory === undefined) return [];
  const checks = territory.checks
    .filter((check) => exclusive || !check.exclusive)
    .flatMap((check) => commandLinesOf(check.run));
  const commands = CHECK_COMMANDS.flatMap((name) => territory.commands[name] ?? []);
  return unique([...checks, ...commands]).map((command) => `${SHELL_TOOL}(${command}:*)`);
}

/**
 * The territory's generators (P1-24), for a session that may edit files: the only way a read-only file changes, so
 * a knight that changed a glossary's source regenerates the page instead of asking the owner to (P1-16, D2).
 */
function generateRules(territory: ToolPolicyInput['territory']): string[] {
  return unique(territory?.commands.generate ?? []).map((command) => `${SHELL_TOOL}(${command}:*)`);
}

function lawsOf(territory: ToolPolicyInput['territory'], scratch: boolean): ToolLaws {
  const history = scratch ? [NO_HISTORY_COMMAND] : [];
  return {
    forbidden_paths: forbiddenPathsOf(territory),
    read_only_paths: unique(territory?.laws.read_only_paths ?? []),
    patch_paths: territory?.vcs.type === 'git' ? unique(territory.laws.patch_paths) : [],
    forbidden_commands: unique([...(territory?.laws.forbidden_commands ?? []), NO_PUSH_COMMAND, ...history]),
  };
}

/**
 * The class's rules for this session: a verifier loses the write tools (ADR 0008), except in its scratch plot,
 * where it gains them and git's own undo (ADR 0022); the class's bare deny of Edit or Write gives way there.
 */
function classRulesOf(input: ToolPolicyInput, scratch: boolean) {
  const own = input.character?.tools;
  const allow = own?.allow ?? input.characterClass.tools.allow;
  const deny = own?.deny ?? input.characterClass.tools.deny;
  if (!scratch) return { allow, deny };
  const lifted = new Set<string>(SCRATCH_RULES);
  return { allow: unique([...allow, ...SCRATCH_RULES]), deny: deny.filter((rule) => !lifted.has(rule)) };
}

/**
 * Rules every session carries, whatever its class: no push, no secret files, no hand-written generated file, no
 * write tool in git's own folder (P1-49), only the apprentice as agent. Edit rules cover Write and NotebookEdit
 * (runner-claude settings.ts); agy's settings turn them into `write_file` prefixes (runner-antigravity settings.ts).
 */
function fenceRules(laws: ToolLaws): string[] {
  const hidden = laws.forbidden_paths.map(plotPath);
  const readOnly = laws.read_only_paths.map(plotPath);
  const git = GIT_PATHS.map(plotPath);
  return [
    NO_PUSH_RULE,
    ...hidden.map((glob) => `Read(${glob})`),
    ...[...hidden, ...readOnly, ...git].map((glob) => `Edit(${glob})`),
    ...BUILT_IN_AGENTS.map((agent) => `${AGENT_TOOL}(${agent})`),
  ];
}

/**
 * What a class with Glob or Grep searches with when its tribe's CLI has no search tool (P1-53): git's own read-only
 * commands, on a git plot only. Outside git they would search a repository around the folder, or every file there
 * under the owner's `grep.fallbackToNoIndex`, dotenv files included.
 */
function searchCommandsOf(tools: readonly string[], input: ToolPolicyInput): string[] {
  if (input.cli_search !== false || input.territory?.vcs.type !== 'git') return [];
  const searches = tools.some((tool) => (SEARCH_TOOLS as readonly string[]).includes(tool));
  return searches ? [...SEARCH_COMMANDS] : [];
}

/**
 * Who asks the code graph (owner, 2026-11-11): a class that searches code, by data and alike in every tribe (ADR
 * 0016), unless it denies a bare shell (the poet, the envoy, the monk); the registry's allow lists stay as they are,
 * or a class would get a shell and its territory's checks with it.
 */
function graphCommandsOf(tools: readonly string[], deniedTools: ReadonlySet<string>, input: ToolPolicyInput) {
  if (input.graph !== true || deniedTools.has(SHELL_TOOL)) return [];
  return tools.some((tool) => (SEARCH_TOOLS as readonly string[]).includes(tool)) ? [...GRAPH_COMMANDS] : [];
}

export function toolPolicyOf(input: ToolPolicyInput): ToolPolicy {
  const verifier = input.role === 'verifier';
  const scratch = verifier && input.scratch === true;
  const { allow: classAllow, deny: classDeny } = classRulesOf(input, scratch);
  // A judge outside its scratch plot never changes a file (ADR 0008).
  const readOnly = verifier && !scratch;
  const withApprentice = input.role === 'assignee' && classAllow.includes(APPRENTICE_RULE);
  const granted = classAllow.filter(
    (rule) => rule !== APPRENTICE_RULE && !(readOnly && isWriteTool(toolOf(rule))),
  );
  // A bare deny (`Bash`, `WebFetch`) removes the tool itself, even if an override allowed one of its forms.
  const deniedTools = new Set(classDeny.filter((rule) => toolOf(rule) === rule));
  const ownTools = unique(granted.map(toolOf)).filter((tool) => !deniedTools.has(tool));
  const tools = withApprentice ? [...ownTools, AGENT_TOOL] : ownTools;
  const hasShell = tools.includes(SHELL_TOOL);
  // A verifier never regenerates what it judges (ADR 0008), not even in its scratch plot.
  const writes = !verifier && tools.some(isWriteTool);
  const shell = hasShell ? checkRules(input.territory, scratch && input.exclusive !== false) : [];
  const generate = hasShell && writes ? generateRules(input.territory) : [];
  const laws = lawsOf(input.territory, scratch);
  const fences = [
    ...(readOnly ? WRITE_TOOLS : []),
    ...(scratch ? [NO_COMMIT_RULE] : []),
    ...fenceRules(laws),
  ];
  const search = searchCommandsOf(tools, input);
  const graph = graphCommandsOf(tools, deniedTools, input);
  return {
    tools,
    allow: unique([...granted, ...shell, ...generate]),
    deny: unique([...classDeny, ...fences]),
    // The apprentice gets the character's tools without Agent, so it cannot start another (§3.12).
    apprentice: withApprentice ? { tools: ownTools } : null,
    laws,
    ...(search.length === 0 ? {} : { search_commands: search }),
    ...(graph.length === 0 ? {} : { graph_commands: graph }),
  };
}
