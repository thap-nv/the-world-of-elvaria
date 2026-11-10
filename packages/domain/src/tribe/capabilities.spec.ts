import { describe, expect, it } from 'vitest';

import { shellOf } from './capabilities.ts';

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
