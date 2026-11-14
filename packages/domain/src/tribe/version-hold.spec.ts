// Holding a tribe whose CLI changed since its last passing check (A1b of the lessons of 2026-11-13).
import { describe, expect, it } from 'vitest';

import { checkedVersionOf, versionHoldsOf } from './version-hold.ts';
import type { TribeId } from '../core/ids.ts';
import type { Tribe } from '../schema/tribe.ts';

const CLAUDE = 'claude' as TribeId;
const GEMINI = 'gemini' as TribeId;
const CODEX = 'codex' as TribeId;
const AGY = 'C:/Users/owner/.gemini/bin/agy.exe';
const OLD_CODEX = 'C:/Users/owner/.vscode/extensions/openai.chatgpt-26.1106.51428-win32-x64/bin/codex.exe';
const tool = (version: string, checked?: string): NonNullable<Tribe['tool']> => ({
  path: 'C:/tools/cli.exe',
  version,
  auth: 'login',
  ...(checked === undefined ? {} : { checked_version: checked }),
});

describe('checkedVersionOf', () => {
  it('is the version the last check passed on, else the pinned one, else none', () => {
    expect(checkedVersionOf({ tool: tool('1.5.7', '1.5.6') })).toBe('1.5.6');
    expect(checkedVersionOf({ tool: tool('1.5.6') })).toBe('1.5.6');
    expect(checkedVersionOf({})).toBeUndefined();
  });
});

describe('versionHoldsOf', () => {
  it('holds a tribe whose CLI updated itself, or whose CLI is gone, in kingdom order (2026-11-14)', () => {
    const tribes = [
      { id: GEMINI, tool: tool('1.5.6') },
      { id: CODEX, tool: tool('0.167.0-alpha.4.1') },
      { id: CLAUDE, tool: tool('2.1.330', '2.1.322') },
    ];
    const found = {
      [GEMINI]: { path: AGY, version: '1.5.8' },
      [CODEX]: { path: OLD_CODEX, version: undefined },
      [CLAUDE]: { path: 'C:/claude.exe', version: '2.1.330' },
    };
    expect(versionHoldsOf(tribes, found)).toEqual([
      { tribe: GEMINI, path: AGY, version: '1.5.8', checked: '1.5.6' },
      { tribe: CODEX, path: OLD_CODEX, version: undefined, checked: '0.167.0-alpha.4.1' },
      { tribe: CLAUDE, path: 'C:/claude.exe', version: '2.1.330', checked: '2.1.322' },
    ]);
  });

  it('holds nothing on the checked version, on a CLI that did not answer, or without a pin', () => {
    const tribes = [
      { id: GEMINI, tool: tool('1.5.7', '1.5.7') },
      { id: CLAUDE, tool: tool('2.1.322') },
      { id: CODEX },
    ];
    const found = {
      [GEMINI]: { path: AGY, version: '1.5.7' },
      [CODEX]: { path: OLD_CODEX, version: '0.168.0' },
    };
    expect(versionHoldsOf(tribes, found)).toEqual([]);
  });
});
