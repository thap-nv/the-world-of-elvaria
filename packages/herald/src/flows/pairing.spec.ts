// Pairing and sessions end to end over HTTP (ADR 0031 items 2, 3, 7; wave-1 plan P2-01b "Test"): a good code gives
// a cookie and the session file only its hash; a code works once and for five minutes; five wrong codes close
// pairing until the next `herald pair`; GET /pair changes nothing; a revoked device's next request is 401; an idle
// session ends after 30 days; and neither the log nor the files under .state/ ever hold a code or a session id.
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { PAIRING_CODE_TTL_MS, PAIRING_FAILURES_MAX, SESSION_IDLE_MS } from '../limit/limits.ts';
import { ask, cookieOf, fullDevice, harness, postCode } from '../__fixtures__/herald.ts';
import type { Harness } from '../__fixtures__/herald.ts';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe('pairing a browser with the Herald', () => {
  let h: Harness;
  afterEach(() => h.stop());

  const stateFile = (name: string) => readFile(path.join(h.store.root, '.state', name), 'utf8');
  const home = (cookie: string) => ask(h.herald.port, { headers: { cookie } });

  it('trades a good code for a session cookie, and keeps only hashes on disk', async () => {
    h = await harness();
    const code = await h.code(fullDevice());
    const answer = await postCode(h.herald.port, code);
    expect(answer.status).toBe(303);
    expect(answer.headers.location).toBe('/');
    const set = String(answer.headers['set-cookie']);
    expect(set).toMatch(
      /^elvaria_session=[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=\d+$/,
    );
    const cookie = cookieOf(answer);
    const id = cookie.split('=')[1] ?? '';
    expect((await home(cookie)).status).toBe(200);
    const sessions = await stateFile('herald-sessions.json');
    const pairing = await stateFile('herald-pairing.json');
    for (const text of [sessions, pairing, JSON.stringify(h.logged)]) {
      expect(text).not.toContain(id);
      expect(text).not.toContain(code);
    }
    expect(JSON.parse(sessions)).toMatchObject({
      version: 1,
      sessions: [{ device: 'dev_20261127_aaaaaa', created_at: '2026-11-27T03:00:00.000Z' }],
    });
    expect(h.logged).toEqual([{ kind: 'paired', device: 'dev_20261127_aaaaaa' }]);
  });

  it('adds Secure to the cookie when the request came over the tunnel’s HTTPS', async () => {
    h = await harness();
    const tunnel = { host: 'elvaria.example.ts.net', origin: 'https://elvaria.example.ts.net' };
    const answer = await postCode(h.herald.port, await h.code(fullDevice()), tunnel);
    expect(String(answer.headers['set-cookie'])).toMatch(/; Secure$/);
  });

  it('refuses a code used once already', async () => {
    h = await harness();
    const code = await h.code(fullDevice());
    expect((await postCode(h.herald.port, code)).status).toBe(303);
    const again = await postCode(h.herald.port, code);
    expect(again.status).toBe(403);
    expect(again.body).toContain('refused: code_refused');
    expect(again.headers['set-cookie']).toBeUndefined();
  });

  it('refuses a code once five minutes have passed, not before', async () => {
    h = await harness();
    const early = await h.code(fullDevice('aaaaaa'));
    const late = await h.code(fullDevice('bbbbbb'));
    h.clock.advance(PAIRING_CODE_TTL_MS - 1);
    expect((await postCode(h.herald.port, early)).status).toBe(303);
    h.clock.advance(1);
    expect((await postCode(h.herald.port, late)).status).toBe(403);
  });

  it('closes pairing after five wrong codes, until herald pair runs again (measure 4)', async () => {
    h = await harness();
    const good = await h.code(fullDevice());
    for (let wrong = 1; wrong < PAIRING_FAILURES_MAX; wrong += 1)
      expect((await postCode(h.herald.port, `guess-${wrong}`)).body).toContain('refused: code_refused');
    expect((await postCode(h.herald.port, 'guess-last')).body).toContain('refused: pairing_closed');
    const closed = await postCode(h.herald.port, good);
    expect(closed.status).toBe(403);
    expect(closed.body).toContain('refused: pairing_closed');
    expect(JSON.parse(await stateFile('herald-pairing.json'))).toEqual({
      version: 1,
      codes: [],
      failures: 5,
    });
    const fresh = await h.code(fullDevice('cccccc'));
    expect((await postCode(h.herald.port, fresh)).status).toBe(303);
  });

  it('only shows a form on GET /pair: the code stays unused and no failure counts', async () => {
    h = await harness();
    const code = await h.code(fullDevice());
    const before = await stateFile('herald-pairing.json');
    const page = await ask(h.herald.port, { path: `/pair?code=${code}` });
    expect(page.status).toBe(200);
    expect(page.body).toContain(`<input type="hidden" name="code" value="${code}">`);
    expect(page.body).toContain('<form method="post" action="/pair">');
    expect(page.body).not.toContain('<script');
    await ask(h.herald.port, { path: '/pair?code=wrong' });
    expect(await stateFile('herald-pairing.json')).toBe(before);
    expect(page.headers['set-cookie']).toBeUndefined();
    expect((await ask(h.herald.port, { path: '/pair' })).status).toBe(400);
  });

  it('refuses a malformed pairing post with 400', async () => {
    h = await harness();
    const plain = { 'content-type': 'text/plain' };
    expect((await postCode(h.herald.port, 'abc', plain)).status).toBe(400);
    expect((await postCode(h.herald.port, '')).status).toBe(400);
    expect((await ask(h.herald.port, { method: 'PUT', path: '/pair' })).status).toBe(404);
  });

  it('refuses the code of a device revoked or removed before the code was used', async () => {
    h = await harness();
    const revoked = await h.code(fullDevice('aaaaaa'));
    await h.store.devices.write({ ...fullDevice('aaaaaa'), revoked_at: '2026-11-27T10:01:00+07:00' });
    expect((await postCode(h.herald.port, revoked)).body).toContain('refused: device_revoked');
    const gone = await h.code(fullDevice('bbbbbb'));
    await rm(path.join(h.store.root, 'devices', 'dev_20261127_bbbbbb.json'));
    expect((await postCode(h.herald.port, gone)).body).toContain('refused: unknown_device');
  });
});

describe('a paired session', () => {
  let h: Harness;
  afterEach(() => h.stop());

  async function paired(): Promise<string> {
    return cookieOf(await postCode(h.herald.port, await h.code(fullDevice())));
  }
  const home = (cookie: string) => ask(h.herald.port, { headers: { cookie } });

  it('ends at the next request once its device is revoked', async () => {
    h = await harness();
    const cookie = await paired();
    expect((await home(cookie)).status).toBe(200);
    await h.store.devices.write({ ...fullDevice(), revoked_at: '2026-11-27T10:05:00+07:00' });
    const answer = await home(cookie);
    expect(answer.status).toBe(401);
    expect(answer.body).toContain('refused: device_revoked');
  });

  it('ends when its device file is gone, or the cookie is not one the Herald gave', async () => {
    h = await harness();
    const cookie = await paired();
    expect((await home('elvaria_session=forged')).status).toBe(401);
    expect((await home('other=1')).status).toBe(401);
    await rm(path.join(h.store.root, 'devices', 'dev_20261127_aaaaaa.json'));
    expect((await home(cookie)).body).toContain('refused: unknown_device');
  });

  it('ends after 30 idle days, and each use moves that end', async () => {
    h = await harness();
    const cookie = await paired();
    h.clock.advance(20 * DAY);
    expect((await home(cookie)).status).toBe(200);
    h.clock.advance(20 * DAY);
    expect((await home(cookie)).status).toBe(200);
    h.clock.advance(SESSION_IDLE_MS + 1);
    expect((await home(cookie)).status).toBe(401);
  });

  it('reads a torn session file as no session at all', async () => {
    h = await harness();
    const cookie = await paired();
    await writeFile(path.join(h.store.root, '.state', 'herald-sessions.json'), '{"version":1,"sessions":[{');
    expect((await home(cookie)).status).toBe(401);
    await writeFile(path.join(h.store.root, '.state', 'herald-sessions.json'), '{"version":2,"sessions":[]}');
    expect((await home(cookie)).status).toBe(401);
  });
});
