import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { checkHerald } from './check-herald.ts';

describe('checkHerald', () => {
  const t = translator('en');

  it('names the port and how many origins it accepts besides loopback', () => {
    expect(checkHerald(t, { port: 7411, origins: [] })).toEqual([
      { level: 'ok', text: 'Herald: port 7411, 0 origins besides loopback.', details: [] },
    ]);
  });

  it('warns of a plain-http origin off this machine, not of https or loopback ones', () => {
    const origins = [
      'https://elvaria.example.ts.net',
      'http://127.0.0.1:8080',
      'http://localhost:3000',
      'http://192.168.1.20:7411',
    ];
    const found = checkHerald(t, { port: 7411, origins });
    expect(found.map((item) => item.level)).toEqual(['ok', 'warn']);
    expect(found[1]?.text).toContain('the origin http://192.168.1.20:7411 is neither https nor loopback');
  });
});
