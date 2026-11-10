// The shell a session runs commands in (P1-40): its tribe's adapter declares it per OS (`capabilities.shell`), the
// Steward picks this OS's (shellOf), and the prompt names it above the commands. agy runs PowerShell on Windows,
// Claude Code runs Git Bash; an adapter that declares nothing leaves the prompt as before.
import { shellOf } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { CHECKS, DIFF, LETTER, QUEST, REGISTRY, SABLE, TERRITORY, THORN } from '../__fixtures__/world.ts';
import { buildPrompt } from './build-prompt.ts';
import { loadPromptTemplates } from './templates.ts';
import type { AssigneePromptInput, VerifierPromptInput } from './build-prompt.ts';

const templates = await loadPromptTemplates();

const base = {
  locale: 'en',
  decree: null,
  quest: QUEST,
  territory: TERRITORY,
  registry: REGISTRY,
  scriptures: [],
  gazetteer: null,
  class_prompt: null,
} as const;

const assignee: AssigneePromptInput = {
  ...base,
  role: 'assignee',
  character: THORN,
  skills: [],
  handover_path: 'D:/Elvaria kingdom/quests/q/handover.md',
  continuation: null,
};

const verifier: VerifierPromptInput = {
  ...base,
  role: 'verifier',
  character: SABLE,
  handover: LETTER,
  diff: DIFF,
  partial: null,
  checks: CHECKS,
};

/** What the adapters of this repo declare (runner-antigravity, runner-claude). */
const AGY = { shell: { win32: 'Windows PowerShell (powershell.exe)' } };
const CLAUDE = { shell: { win32: 'Git Bash' } };

describe('the shell of the session (P1-40)', () => {
  it('names PowerShell to an agy session on Windows, above the commands it may run', () => {
    const shell = shellOf(AGY, 'win32');
    for (const input of [assignee, verifier]) {
      const { system } = buildPrompt({ ...input, shell }, templates);
      const named = system.indexOf(
        'Your shell is Windows PowerShell (powershell.exe): write each command in its syntax.',
      );
      expect(named).toBeGreaterThan(system.indexOf('# Your shell'));
      expect(named).toBeLessThan(system.indexOf('Your shell runs only the commands below'));
    }
  });

  it('names bash to a Claude session on Windows', () => {
    const { system } = buildPrompt({ ...assignee, shell: shellOf(CLAUDE, 'win32') }, templates);
    expect(system).toContain('Your shell is Git Bash: write each command in its syntax.');
  });

  it('says nothing about the shell where the adapter declares none, as before', () => {
    const before = buildPrompt(verifier, templates).system;
    for (const shell of [shellOf(AGY, 'darwin'), shellOf({}, 'win32'), ' ']) {
      const { system } = buildPrompt({ ...verifier, shell }, templates);
      expect(system).toBe(before);
      expect(system).not.toContain('Your shell is');
    }
    expect(before).toContain('# Your shell\n\nYour shell runs only the commands below');
  });
});
