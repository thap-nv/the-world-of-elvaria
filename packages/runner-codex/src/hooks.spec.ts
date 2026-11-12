// Elvaria's `-c` hooks and the check that runs before the trust bypass (spike Codex 2026-11-12 §3, ADR 0021).
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FIXTURES } from './__fixtures__/codex.ts';
import {
  HOOK_EVENTS,
  hookConfigArgs,
  hookLinesOf,
  hooksProblem,
  posixQuote,
  powershellQuote,
} from './hooks.ts';

const HOOK = {
  command: 'C:/node js/node.exe',
  args: ['--conditions=elvaria-dist', "C:/it's/elvaria-hook.js"],
};
const POLICY = 'D:\\Kingdom of Agents\\.runs\\q-1\\policy.json';

describe('the hook command', () => {
  it('quotes every argument for its shell, a quote inside one too', () => {
    expect(posixQuote("it's")).toBe(String.raw`'it'\''s'`);
    expect(powershellQuote("it's")).toBe("'it''s'");
  });

  it('names the policy and the dialect, and the event for PreToolUse only', () => {
    const pre = hookLinesOf(HOOK, POLICY, 'PreToolUse');
    expect(pre.command_windows).toBe(
      "& 'C:/node js/node.exe' '--conditions=elvaria-dist' 'C:/it''s/elvaria-hook.js' '--policy' 'D:\\Kingdom of Agents\\.runs\\q-1\\policy.json' '--dialect' 'codex' '--event' 'PreToolUse'",
    );
    expect(pre.command.startsWith("'C:/node js/node.exe' '--conditions=elvaria-dist' 'C:/it'\\''s/")).toBe(
      true,
    );
    expect(hookLinesOf(HOOK, POLICY, 'Stop').command).not.toContain('--event');
  });

  it('declares the four events as TOML session flags', () => {
    const args = hookConfigArgs(HOOK, POLICY);
    expect(args.filter((_, index) => index % 2 === 0)).toEqual(HOOK_EVENTS.map(() => '-c'));
    const stop = args.at(-1) ?? '';
    expect(stop.startsWith('hooks.Stop=[{hooks=[{type="command",command="')).toBe(true);
    expect(stop.endsWith(',timeout=10}]}]')).toBe(true);
    expect(stop).toContain(String.raw`command_windows="& 'C:/node js/node.exe'`);
  });
});

/** hooks/list as Codex answers for the hooks of HOOK and POLICY. */
function listed(windows: boolean, extra: Record<string, unknown>[] = []) {
  const hooks = HOOK_EVENTS.map((event) => {
    const lines = hookLinesOf(HOOK, POLICY, event);
    return {
      eventName: `${event.charAt(0).toLowerCase()}${event.slice(1)}`,
      source: 'sessionFlags',
      sourcePath: 'C:\\<session-flags>\\config.toml',
      command: windows ? lines.command_windows : lines.command,
      enabled: true,
    };
  });
  return { data: [{ cwd: 'C:/plot', hooks: [...hooks, ...extra], warnings: [], errors: [] }] };
}

describe('hooksProblem', () => {
  it('passes when Codex would run exactly Elvaria four hooks, in the form of this OS', () => {
    expect(hooksProblem(listed(true), HOOK, POLICY, true)).toBeUndefined();
    expect(hooksProblem(listed(false), HOOK, POLICY, false)).toBeUndefined();
    expect(hooksProblem(listed(false), HOOK, POLICY, true)).toMatch(
      /does not list Elvaria's SessionStart hook/,
    );
  });

  it("refuses a hook of the owner's, a plugin's or a project's, which the bypass would run unreviewed", () => {
    const user = { eventName: 'preToolUse', source: 'user', sourcePath: '~/.codex/hooks.json', command: 'x' };
    expect(hooksProblem(listed(true, [user]), HOOK, POLICY, true)).toMatch(
      /not Elvaria's, without review: preToolUse hook from user \(~\/\.codex\/hooks\.json\)/,
    );
  });

  it('refuses a hook that is off, missing or doubled, and an answer without hooks', () => {
    const off = listed(true);
    const first = off.data[0]?.hooks[0];
    if (first !== undefined) first.enabled = false;
    expect(hooksProblem(off, HOOK, POLICY, true)).toMatch(/SessionStart/);
    const twice = listed(true, [{ ...listed(true).data[0]?.hooks[0] }]);
    expect(hooksProblem(twice, HOOK, POLICY, true)).toMatch(/SessionStart/);
    expect(hooksProblem({ data: [] }, HOOK, POLICY, true)).toMatch(/listed no hooks/);
    expect(hooksProblem('nonsense', HOOK, POLICY, true)).toMatch(/listed no hooks/);
    const broken = { data: [{ hooks: [], errors: ['bad toml'] }] };
    expect(hooksProblem(broken, HOOK, POLICY, true)).toMatch(/could not load its hooks: bad toml/);
  });

  it("finds the spike's own hooks foreign to Elvaria's command (fixture hooks-list.json)", () => {
    const answer: unknown = JSON.parse(readFileSync(path.join(FIXTURES, 'hooks-list.json'), 'utf8'));
    expect(hooksProblem(answer, HOOK, POLICY, true)).toMatch(/does not list Elvaria's/);
  });
});
