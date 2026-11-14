// What `elvaria tribe check` says a tribe's adapter declares, per OS (P1-46; fix/cli-lines, (97)): every OS the adapter
// names, not only this machine's, since the owner may run the kingdom on another.
import { TribeSchema } from '@elvaria/domain';
import type { AdapterCapabilities } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { capabilityLines } from './check-declared.ts';

const TRIBE = TribeSchema.parse({ id: 'gemini', adapter: 'antigravity', enabled: true, max_concurrent: 1 });
const CAPS: AdapterCapabilities = {
  headless: true,
  context_file: true,
  events: true,
  tool_gate: true,
  usage: true,
  structured_output: true,
  resume: true,
  compact: false,
  subagent: false,
  auth: ['login'],
};
const LIMIT = 'The longest user prompt its CLI takes, in characters:';

describe('capabilityLines', () => {
  it('names the prompt limit of every OS the adapter declares one for, after the shell', () => {
    const lines = capabilityLines(translator('en'), TRIBE, {
      ...CAPS,
      shell: { win32: 'Windows PowerShell (powershell.exe)' },
      prompt_max_chars: { win32: 26_000, darwin: 200_000 },
    });
    expect(lines.slice(1, 4)).toEqual([
      'It lacks: compact, subagent.',
      'Its sessions run commands in: win32: Windows PowerShell (powershell.exe).',
      `${LIMIT} win32: 26000; darwin: 200000; the Steward passes over a judge of this tribe whose review prompt is longer.`,
    ]);
  });

  it('says nothing of a limit the adapter does not declare, or declares as no whole positive number', () => {
    const none = capabilityLines(translator('en'), TRIBE, CAPS);
    const odd = capabilityLines(translator('en'), TRIBE, {
      ...CAPS,
      prompt_max_chars: { linux: 0, darwin: 1.5 },
    });
    for (const lines of [none, odd]) expect(lines.some((line) => line.startsWith(LIMIT))).toBe(false);
    expect(none).toContain('It declares no shell, so its prompt names none.');
  });
});
