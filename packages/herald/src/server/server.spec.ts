// The server's gates and ceilings over real sockets on port 0 (threat model "Trước P2-01" 1, 4, 5): the three cases
// the threat model names (no cookie, a foreign origin, a foreign host), the headers of every answer and no CORS
// header, the static folder that no path leaves, the body and socket ceilings, and a port already taken.
import { mkdir, writeFile } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import path from 'node:path';

import { openKingdom } from '@elvaria/store';
import { tempDir } from '@elvaria/testkit';
import { afterEach, describe, expect, it, onTestFinished } from 'vitest';

import { BODY_BYTES_MAX, CONNECTIONS_MAX } from '../limit/limits.ts';
import {
  ask,
  cookieOf,
  format,
  fullDevice,
  harness,
  idsOf,
  KINGDOM,
  movableClock,
  PAGES,
  postCode,
  random,
} from '../__fixtures__/herald.ts';
import { startHerald } from './server.ts';
import type { Answer, Harness } from '../__fixtures__/herald.ts';

const HEADERS = {
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

const corsHeaders = (answer: Answer) =>
  Object.keys(answer.headers).filter((name) => name.startsWith('access-control'));

describe('startHerald', () => {
  let h: Harness;
  afterEach(() => h.stop());

  /** A paired browser's cookie. */
  async function paired(): Promise<string> {
    const answer = await postCode(h.herald.port, await h.code(fullDevice()));
    return cookieOf(answer);
  }

  it('listens on loopback and refuses a request without a session cookie with 401 (measure 1)', async () => {
    h = await harness();
    expect(h.herald.origin).toBe(`http://127.0.0.1:${h.herald.port}`);
    const answer = await ask(h.herald.port);
    expect(answer.status).toBe(401);
    expect(answer.body).toContain('refused: no_session');
    expect(h.logged).toEqual([{ kind: 'refused', refusal: 'no_session', method: 'GET' }]);
  });

  it('refuses a foreign Origin with 403, even with a valid cookie and on /pair (measure 1)', async () => {
    h = await harness();
    const cookie = await paired();
    const evil = { origin: 'https://evil.example', cookie };
    expect((await ask(h.herald.port, { headers: evil })).status).toBe(403);
    expect((await postCode(h.herald.port, 'x', { origin: 'https://evil.example' })).status).toBe(403);
    expect((await ask(h.herald.port, { headers: { origin: 'null', cookie } })).status).toBe(403);
    expect((await ask(h.herald.port, { headers: { origin: 'http://127.0.0.1:1', cookie } })).status).toBe(
      403,
    );
  });

  it('refuses a foreign Host with 403, the way a DNS-rebound name arrives (measure 1)', async () => {
    h = await harness();
    const cookie = await paired();
    const answer = await ask(h.herald.port, { headers: { host: `evil.example:${h.herald.port}`, cookie } });
    expect(answer.status).toBe(403);
    expect(answer.body).toContain('refused: host_refused');
    expect(
      (await ask(h.herald.port, { headers: { host: `localhost:${h.herald.port}`, cookie } })).status,
    ).toBe(200);
  });

  it('sends the four security headers on every answer and no CORS header, preflight included (measure 5)', async () => {
    h = await harness();
    const cookie = await paired();
    const answers = [
      await ask(h.herald.port, { headers: { cookie } }),
      await ask(h.herald.port),
      await ask(h.herald.port, { path: '/pair?code=abc' }),
      await ask(h.herald.port, { headers: { host: 'evil.example' } }),
      await ask(h.herald.port, {
        method: 'OPTIONS',
        headers: { cookie, origin: h.herald.origin, 'access-control-request-method': 'POST' },
      }),
    ];
    for (const answer of answers) {
      expect(answer.headers).toMatchObject(HEADERS);
      expect(corsHeaders(answer)).toEqual([]);
    }
    expect(answers.map((answer) => answer.status)).toEqual([200, 401, 200, 403, 404]);
  });

  it('serves the static folder to a session, never a path out of it (measure 5)', async () => {
    const build = await tempDir('herald build');
    const dir = path.join(build.root, 'build');
    await mkdir(path.join(dir, 'assets'), { recursive: true });
    await writeFile(path.join(dir, 'index.html'), '<p>lite</p>');
    await writeFile(path.join(dir, 'assets', 'app.js'), 'export {};');
    await writeFile(path.join(build.root, 'secret.txt'), 'outside');
    h = await harness({ staticDir: dir });
    onTestFinished(() => build.remove());
    const cookie = await paired();
    const get = (target: string) => ask(h.herald.port, { path: target, headers: { cookie } });
    expect((await get('/')).body).toBe('<p>lite</p>');
    const script = await get('/assets/app.js');
    expect(script.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(script.headers).toMatchObject(HEADERS);
    for (const target of [
      '/../secret.txt',
      '/..%2fsecret.txt',
      '/assets/..%2f..%2fsecret.txt',
      '/%2e%2e/secret.txt',
    ])
      expect((await get(target)).status).toBe(404);
    expect((await get('/assets')).status).toBe(404);
    expect((await get('/%E0%A4%A')).status).toBe(404);
    expect((await ask(h.herald.port, { path: '/../secret.txt' })).status).toBe(401);
  });

  it('answers 404 to a session for anything but GET / while there is no client build', async () => {
    h = await harness();
    const cookie = await paired();
    expect((await ask(h.herald.port, { path: '/ws', headers: { cookie } })).status).toBe(404);
    expect(
      (await ask(h.herald.port, { method: 'POST', headers: { cookie, origin: h.herald.origin } })).status,
    ).toBe(404);
    const home = await ask(h.herald.port, { headers: { cookie } });
    expect(home.body).toContain('This is Phone &lt;one&gt; (full).');
  });

  it('refuses a body over the ceiling with 413 (measure 4)', async () => {
    h = await harness();
    const answer = await postCode(h.herald.port, 'x'.repeat(BODY_BYTES_MAX));
    expect(answer.status).toBe(413);
    expect(answer.headers.connection).toBe('close');
  });

  it('closes sockets past the connection ceiling (measure 4)', async () => {
    h = await harness();
    const open = (): Promise<Socket> =>
      new Promise((resolve) => {
        const socket = connect(h.herald.port, '127.0.0.1', () => {
          resolve(socket);
        });
      });
    const sockets = await Promise.all(Array.from({ length: CONNECTIONS_MAX }, open));
    const extra = await open();
    const closed = await new Promise<boolean>((resolve) => {
      // Windows resets the dropped socket (ECONNRESET), macOS and Linux just end it: either way it closes.
      extra.on('error', () => undefined);
      extra.on('close', () => {
        resolve(true);
      });
      extra.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');
    });
    expect(closed).toBe(true);
    sockets.forEach((socket) => socket.destroy());
  });
});

describe('startHerald on a port in use', () => {
  it('answers EADDRINUSE with the port, and listens nowhere', async () => {
    const taken: Server = createServer();
    await new Promise<void>((resolve) => taken.listen(0, '127.0.0.1', resolve));
    const port = (taken.address() as { port: number }).port;
    const started = await startHerald({
      store: openKingdom('unused kingdom'),
      kingdom: KINGDOM,
      ids: idsOf(movableClock()),
      port,
      origins: [],
      clock: movableClock(),
      format,
      random,
      pages: PAGES,
      log: () => undefined,
    });
    await new Promise((resolve) => taken.close(resolve));
    expect(started).toEqual({ ok: false, error: { code: 'EADDRINUSE', port } });
  });
});
