// Whether a ToolPolicy stops a shell command: the fences only (deny rules and laws), not the whole permission
// model of a CLI. FakeRunner enforces it when it declares `tool_gate`, so the conformance suite can tell a gate
// that blocks from one that only claims to.
import { SHELL_TOOL } from './constants.ts';
import type { ToolPolicy } from './tool-policy.ts';

const BASH_RULE = /^Bash\((.+)\)$/;

/** Claude syntax: `Bash(git push:*)` is a prefix on word boundaries, `Bash(pnpm test)` an exact command. */
function bashRuleMatches(rule: string, command: string): boolean {
  if (rule === SHELL_TOOL) return true;
  const specifier = BASH_RULE.exec(rule)?.[1];
  if (specifier === undefined) return false;
  if (!specifier.endsWith(':*')) return command === specifier;
  const prefix = specifier.slice(0, -':*'.length);
  return command === prefix || command.startsWith(`${prefix} `);
}

/** Why the policy refuses `command`, or undefined when no fence stops it. */
export function commandRefusal(policy: ToolPolicy, command: string): string | undefined {
  const line = command.trim();
  if (!policy.tools.includes(SHELL_TOOL)) return 'no shell tool in this session';
  const rule = policy.deny.find((deny) => bashRuleMatches(deny, line));
  if (rule !== undefined) return `denied by rule ${rule}`;
  const law = policy.laws.forbidden_commands.find((pattern) => new RegExp(pattern, 'i').test(line));
  return law === undefined ? undefined : `forbidden by law /${law}/`;
}
