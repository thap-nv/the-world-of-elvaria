import { describe, expect, it } from 'vitest';

import { promptMaxOf, shellOf } from './capabilities.ts';

describe('promptMaxOf', () => {
  const capabilities = { prompt_max_chars: { win32: 28_000, darwin: 0, linux: 1.5 } };

  it('reads the limit the adapter declares for the operating system', () => {
    expect(promptMaxOf(capabilities, 'win32')).toBe(28_000);
  });

  it('reads none where the adapter declares none, or no positive whole number', () => {
    expect(promptMaxOf(capabilities, 'darwin')).toBeUndefined();
    expect(promptMaxOf(capabilities, 'linux')).toBeUndefined();
    expect(promptMaxOf({ prompt_max_chars: { darwin: 1 } }, 'win32')).toBeUndefined();
    expect(promptMaxOf({}, 'win32')).toBeUndefined();
    expect(promptMaxOf(undefined, 'win32')).toBeUndefined();
    expect(promptMaxOf(capabilities, 'constructor')).toBeUndefined();
  });
});

describe('shellOf', () => {
  const capabilities = { shell: { win32: 'Windows PowerShell (powershell.exe)', darwin: '  ' } };

  it('names the shell the adapter declares for the operating system', () => {
    expect(shellOf(capabilities, 'win32')).toBe('Windows PowerShell (powershell.exe)');
  });

  it('names none for an operating system the adapter left out or left blank', () => {
    expect(shellOf(capabilities, 'linux')).toBeUndefined();
    expect(shellOf(capabilities, 'darwin')).toBeUndefined();
  });

  it('names none for an adapter without the field, without capabilities, or an unknown platform', () => {
    expect(shellOf({}, 'win32')).toBeUndefined();
    expect(shellOf(undefined, 'win32')).toBeUndefined();
    expect(shellOf(capabilities, 'constructor')).toBeUndefined();
  });
});
