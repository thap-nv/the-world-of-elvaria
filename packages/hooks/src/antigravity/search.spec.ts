// Search on agy (P1-53): agy has no search tool under `-p`, so runner-core's policy.json names `git grep` and
// `git ls-files` for a class with Glob or Grep (`search_commands`) and the settings allow them as prefixes. The hook
// lets a scout without a shell run one plain search per line, refuses the rest with the way to search, and refuses
// the git grep options that run a program or reach past the tracked files to every class, a shell or not.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DC1_LAWS } from '../__fixtures__/claude-payloads.ts';
import { tempKingdom } from '../__fixtures__/temp.ts';
import { runHook } from '../run-hook.ts';
import { DEFER_TO_SETTINGS } from './translate.ts';
import type { TempKingdom } from '../__fixtures__/temp.ts';

const NOW = Date.parse('2026-11-11T12:00:00Z');
const PLOT = 'C:/Users/elvaria/dc1-se-team/.elvaria/worktrees/q_20261111_s3arch';
const SEARCH = ['git grep', 'git ls-files'];
const SCOUT = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];
const JUDGE = ['Read', 'Glob', 'Grep', 'Bash'];

let kingdom: TempKingdom;
let policy: string;
beforeEach(async () => {
  kingdom = await tempKingdom();
  policy = path.join(kingdom.runDir, 'policy.json');
});
afterEach(() => kingdom.remove());

/** What runner-core's writePolicyFile writes for this class; `search_commands` only when it was granted. */
const withPolicy = (tools: readonly string[], search?: readonly string[]) =>
  writeFile(
    policy,
    JSON.stringify({
      version: 1,
      tools,
      laws: DC1_LAWS,
      ...(search === undefined ? {} : { search_commands: search }),
    }),
    'utf8',
  );

async function decide(command: string): Promise<Record<string, unknown>> {
  const input = {
    conversationId: 'c-1',
    workspacePaths: [PLOT],
    stepIdx: 1,
    toolCall: { name: 'run_command', args: { CommandLine: command } },
  };
  const argv = ['PreToolUse', '--policy', policy];
  const { stdout } = await runHook({ stdin: JSON.stringify(input), env: kingdom.env(), argv, now: NOW });
  return stdout === '' ? {} : (JSON.parse(stdout) as Record<string, unknown>);
}

describe('a scout of the Gemini tribe, without a shell (P1-53)', () => {
  beforeEach(() => withPolicy(SCOUT, SEARCH));

  it('defers a plain search to the settings, which allow its prefix', async () => {
    for (const command of [
      "git grep -n -e 'P1-53' -- 'docs/implementation-plan.md'",
      'git grep -n Open docs\\plan.md',
      "git ls-files 'docs/*.md'",
    ]) {
      expect(await decide(command)).toEqual(DEFER_TO_SETTINGS);
    }
  });

  it('refuses a search line that does more, with how to search', async () => {
    const decision = await decide('git grep -n x; Remove-Item -Recurse src');
    expect(decision).toMatchObject({ decision: 'deny' });
    expect(decision.reason).toMatch(
      /^Elvaria rule: run_command: your class has no shell, only git grep and git ls-files, each alone on its line .* this line has ; outside quotes\./,
    );
    const [line] = (await kingdom.log()).events;
    expect(line).toMatchObject({ type: 'agent.tool.blocked', data: { tool: 'bash' } });
    expect(await decide('git grep "$(Remove-Item src)"')).toMatchObject({ decision: 'deny' });
  });

  it('refuses any other command, and names the search it may run', async () => {
    const decision = await decide("Select-String -Path docs -Pattern 'x'");
    expect(decision.reason).toMatch(
      /^Elvaria rule: run_command: your class has no Bash; to search files, run git grep or git ls-files alone; do the work/,
    );
  });

  it('refuses the options that run a program or reach past the tracked files', async () => {
    for (const command of [
      'git grep -nOecho x',
      'git grep --no-ind SECRET',
      'git grep --untracked x',
      'git grep --textconv x',
    ]) {
      const decision = await decide(command);
      expect(decision).toMatchObject({ decision: 'deny' });
      expect(decision.reason).toMatch(/^Elvaria rule: run_command: git grep -\S+ is refused: /);
    }
  });

  it('still refuses a forbidden path the line names, as a law', async () => {
    const decision = await decide("git grep -n 'KEY' -- '.env'");
    expect(decision.reason).toMatch(/^Elvaria law of this territory: .*\.env/);
  });
});

describe('a class with a shell, or without search commands (P1-53)', () => {
  it("leaves a judge's search to the settings, and refuses it the same options", async () => {
    await withPolicy(JUDGE, SEARCH);
    expect(await decide("git grep -n 'x' -- 'src'")).toEqual(DEFER_TO_SETTINGS);
    expect(await decide('git grep --open-files-in-pager=code x')).toMatchObject({ decision: 'deny' });
  });

  it('gives a class without a shell no search when the policy grants none', async () => {
    await withPolicy(SCOUT);
    const decision = await decide("git grep -n 'x'");
    expect(decision.reason).toMatch(/^Elvaria rule: run_command: your class has no Bash; do the work/);
  });
});
