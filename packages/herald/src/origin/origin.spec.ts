// The gate as a pure function (ADR 0031 items 4, 5): which Host and Origin pass, which source and which cookie flag
// each passing request gets.
import { describe, expect, it } from 'vitest';

import { allowedOrigins, gateRequest } from './origin.ts';

const allowed = allowedOrigins(7411, ['https://elvaria.example.ts.net', 'http://phone.lan:8080']);

describe('gateRequest', () => {
  it('lets the machine in through either loopback name, as source herald without Secure', () => {
    expect(gateRequest({ host: '127.0.0.1:7411' }, allowed)).toEqual({
      ok: true,
      value: { origin: 'http://127.0.0.1:7411', source: 'herald', secure: false },
    });
    expect(gateRequest({ host: 'LOCALHOST:7411', origin: 'http://localhost:7411' }, allowed)).toEqual({
      ok: true,
      value: { origin: 'http://localhost:7411', source: 'herald', secure: false },
    });
  });

  it('lets the tunnel in as source lite, Secure only over https, its default port left out of Host', () => {
    expect(gateRequest({ host: 'elvaria.example.ts.net' }, allowed)).toEqual({
      ok: true,
      value: { origin: 'https://elvaria.example.ts.net', source: 'lite', secure: true },
    });
    expect(gateRequest({ host: 'phone.lan:8080', origin: 'http://phone.lan:8080' }, allowed)).toEqual({
      ok: true,
      value: { origin: 'http://phone.lan:8080', source: 'lite', secure: false },
    });
  });

  it('judges by the Origin a request carries: the tunnel’s page reaching loopback is lite', () => {
    const gate = gateRequest({ host: '127.0.0.1:7411', origin: 'https://elvaria.example.ts.net' }, allowed);
    expect(gate.ok && gate.value.source).toBe('lite');
  });

  it('refuses a host off the list: none, another port, a rebound name', () => {
    for (const host of [
      undefined,
      '127.0.0.1:7412',
      '127.0.0.1',
      'evil.example:7411',
      'elvaria.example.ts.net:444',
    ])
      expect(gateRequest({ host }, allowed)).toEqual({ ok: false, error: 'host_refused' });
  });

  it('refuses an origin off the list, compared exactly', () => {
    const origins = [
      'null',
      'https://evil.example',
      'http://127.0.0.1:7412',
      'https://127.0.0.1:7411',
      'http://127.0.0.1:7411/',
      'http://127.0.0.1:7411, https://evil.example',
    ];
    for (const origin of origins)
      expect(gateRequest({ host: '127.0.0.1:7411', origin }, allowed)).toEqual({
        ok: false,
        error: 'origin_refused',
      });
  });
});
