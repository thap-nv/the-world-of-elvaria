// The fence on reads outside the plot (PS-11b, owner's (Q3)): the screens of the review and the quest's letter only,
// for every tribe's read tool. Paths in each OS's own form, with spaces and (Windows) a drive letter.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { agyToolCallOf } from './antigravity/tools.ts';
import { toolCallOf } from './claude/tools.ts';
import { codexToolCallOf } from './codex/tools.ts';
import { tempKingdom } from './__fixtures__/temp.ts';
import { outsideReadViolation } from './outside.ts';
import { runHook } from './run-hook.ts';
import type { TempKingdom } from './__fixtures__/temp.ts';

const WINDOWS = process.platform === 'win32';
const KINGDOM = WINDOWS
  ? 'E:\\Works\\Kingdom of Agents\\my kingdom'
  : '/Users/dev/Kingdom of Agents/my kingdom';
const PLOT = path.join(KINGDOM, '.elvaria', 'worktrees', 'q_20261117_v1s10n');
const SCREENS = path.join(KINGDOM, '.runs', 'q_20261117_v1s10n-1', 'screens');
const HOME = path.join(SCREENS, 'home.png');
const CTX = { images: [HOME], kingdom: KINGDOM, quest: 'q_20261117_v1s10n' };

const claudeRead = (file: string) => toolCallOf('Read', { file_path: file });
const outside = (file: string) => outsideReadViolation(claudeRead(file), PLOT, CTX);

describe('outsideReadViolation (PS-11b)', () => {
  it('lets a read tool open its plot, the screens of its review and the quest letter', () => {
    expect(outside(path.join(PLOT, 'src', 'app.ts'))).toBeUndefined();
    expect(outside('src/app.ts')).toBeUndefined();
    expect(outside(HOME)).toBeUndefined();
    expect(outside(path.join(KINGDOM, 'quests', 'q_20261117_v1s10n', 'handover.md'))).toBeUndefined();
  });

  it('refuses every other file outside the plot, however near the screens it lies', () => {
    expect(outside(path.join(SCREENS, 'home.ref.png'))).toMatch(/lies outside your plot/);
    // agy's read_file rule is a prefix: the hook is the exact fence.
    expect(outside(`${HOME}.bak`)).toMatch(/lies outside your plot/);
    expect(outside(path.join(KINGDOM, '.runs', 'q_20261117_0th3r1-1', 'screens', 'home.png'))).toMatch(
      /only the screens your review lists/,
    );
    expect(outside(path.join('..', '..', '..', 'kingdom.json'))).toMatch(/lies outside your plot/);
    // Another quest's letter.
    expect(outside(path.join(KINGDOM, 'quests', 'q_20261117_0th3r1', 'handover.md'))).toBeDefined();
  });

  it("guards the read tools of every tribe, and nothing else (writes have the laws and the CLI's rules)", () => {
    const elsewhere = path.join(KINGDOM, 'secret.png');
    expect(outsideReadViolation(codexToolCallOf('view_image', { path: elsewhere }), PLOT, CTX)).toBeDefined();
    expect(outsideReadViolation(codexToolCallOf('view_image', { path: HOME }), PLOT, CTX)).toBeUndefined();
    expect(outsideReadViolation(agyToolCallOf('read_file', { Path: elsewhere }), PLOT, CTX)).toBeDefined();
    expect(outsideReadViolation(toolCallOf('Write', { file_path: elsewhere }), PLOT, CTX)).toBeUndefined();
    expect(
      outsideReadViolation(toolCallOf('Bash', { command: `cat ${elsewhere}` }), PLOT, CTX),
    ).toBeUndefined();
  });

  it('opens no screen to a session without them, nor a letter without its quest', () => {
    const bare = { images: [], kingdom: undefined, quest: undefined };
    expect(outsideReadViolation(claudeRead(HOME), PLOT, bare)).toBeDefined();
    // No folder in the payload: the hook's own, where the CLI starts it.
    expect(
      outsideReadViolation(claudeRead(path.join(process.cwd(), 'a.ts')), undefined, bare),
    ).toBeUndefined();
  });

  it.runIf(WINDOWS)('reads a Windows path in any case of its drive and with either slash', () => {
    expect(outside(HOME.replace(/^E:/, 'e:'))).toBeUndefined();
    expect(outside(HOME.replaceAll('\\', '/'))).toBeUndefined();
    expect(outside(`D:${HOME.slice(2)}`)).toBeDefined();
  });

  it.runIf(!WINDOWS)('reads a POSIX path as macOS writes it', () => {
    expect(outside(HOME)).toBeUndefined();
    expect(outside(`/private${HOME}`)).toBeDefined();
  });
});

describe('the fence through the policy file of a Codex judge (PS-11b)', () => {
  let kingdom: TempKingdom;
  beforeEach(async () => {
    kingdom = await tempKingdom();
  });
  afterEach(() => kingdom.remove());

  it("refuses view_image of a file outside the plot that the review's screens do not list", async () => {
    const policy = path.join(kingdom.runDir, 'policy.json');
    const plot = path.join(kingdom.root, 'plot');
    const image = path.join(kingdom.root, '.runs', 'screens', 'home.png');
    await writeFile(policy, JSON.stringify({ version: 1, tools: ['Read'], images: [image] }), 'utf8');
    const call = (file: string) =>
      runHook({
        stdin: JSON.stringify({
          session_id: 's',
          cwd: plot,
          hook_event_name: 'PreToolUse',
          tool_name: 'view_image',
          tool_input: { path: file },
        }),
        env: kingdom.env(),
        argv: ['--policy', policy, '--dialect', 'codex', '--event', 'PreToolUse'],
        now: Date.parse('2026-11-17T12:00:00Z'),
      });
    expect((await call(image)).stdout).toBe('');
    const refused = await call(path.join(kingdom.root, 'elsewhere.png'));
    expect(refused.stdout).toMatch(/Elvaria rule: .*lies outside your plot/);
  });
});
