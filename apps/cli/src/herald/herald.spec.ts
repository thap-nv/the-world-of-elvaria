// `elvaria herald` end to end (P2-01b): the CLI starts the Herald on port 0 over a kingdom founded by `init`, a browser
// is paired with the link `herald pair` prints, and `herald revoke` ends its session at the next request. Real sockets
// on loopback, no mana. A port in use is the system's code and exit 1, on every OS. (P2-01c) The paired browser opens
// a world stream at /ws, gets the snapshot, sends a command into inbox/, and the revoke closes its stream.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import type { TempDir } from '../__fixtures__/cli.ts';
import { heldIo, send, worldStream } from '../__fixtures__/herald.ts';

describe('elvaria herald', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  async function startHerald(...extra: string[]) {
    const held = heldIo();
    const exit = run(held.io, 'herald', '--kingdom', kingdom, '--port', '0', ...extra);
    await Promise.race([held.listening, exit]);
    const origin = /http:\/\/127\.0\.0\.1:\d+/.exec(printed(held.io))?.[0] ?? '';
    return { ...held, exit, origin };
  }

  async function pair(...args: string[]): Promise<{ code: string; text: string }> {
    const io = testIo();
    expect(await run(io, 'herald', 'pair', ...args, '--kingdom', kingdom)).toBe(0);
    const text = printed(io);
    return { code: /\/pair\?code=([\w-]+)/.exec(text)?.[1] ?? '', text };
  }

  it('pairs a browser through the link it prints, and a revoke ends the session at the next request', async () => {
    const herald = await startHerald();
    expect(herald.origin).not.toBe('');
    const stranger = await send(herald.origin, '/');
    expect(stranger.status).toBe(401);
    expect(stranger.body).toContain('Trình duyệt này chưa ghép đôi');

    const paired = await pair('--role', 'full', '--label', 'Laptop');
    expect(paired.text).toContain(`http://127.0.0.1:7411/pair?code=${paired.code}`);
    const page = await send(herald.origin, `/pair?code=${paired.code}`);
    expect(page.status).toBe(200);
    expect(page.body).toContain('<form method="post" action="/pair">');
    const posted = await send(herald.origin, '/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: herald.origin },
      body: `code=${paired.code}`,
    });
    expect(posted.status).toBe(303);
    const cookie = (posted.headers['set-cookie']?.[0] ?? '').split(';')[0] ?? '';
    expect(cookie).toMatch(/^elvaria_session=/);
    const home = await send(herald.origin, '/', { headers: { Cookie: cookie } });
    expect(home.status).toBe(200);
    expect(home.body).toContain('Trình duyệt này là thiết bị «Laptop», vai Toàn quyền.');

    const stream = worldStream(herald.origin, cookie);
    await stream.opened;
    expect((await stream.first('snapshot')).state).toMatchObject({ quests: {}, sandbox: false });
    stream.send({ type: 'command', ref: 'w1', kind: 'wake', payload: { tribe: 'claude' } });
    const accepted = await stream.first('accepted');
    const written = await readFile(
      path.join(kingdom, 'inbox', `${String(accepted.command_id)}.json`),
      'utf8',
    );
    expect(JSON.parse(written)).toMatchObject({ kind: 'wake', source: 'herald' });
    stream.send({ type: 'command', ref: 'w2', kind: 'no_such_kind', payload: {} });
    expect(await stream.first('refused')).toEqual({ type: 'refused', ref: 'w2', reason: 'invalid_message' });

    const id = /dev_\d{8}_[0-9a-z]{6}/.exec(paired.text)?.[0] ?? '';
    const listed = testIo();
    expect(await run(listed, 'herald', 'devices', '--kingdom', kingdom)).toBe(0);
    const row = listed.printed.out.find((line) => line.includes(id)) ?? '';
    // Created and last seen, both at the test's fixed clock.
    expect(row.match(/2026-11-06T09:00:00/g)).toHaveLength(2);

    expect(await run(testIo(), 'herald', 'revoke', id, '--kingdom', kingdom)).toBe(0);
    const after = await send(herald.origin, '/', { headers: { Cookie: cookie } });
    expect(after.status).toBe(401);
    expect(after.body).toContain('Thiết bị này đã bị thu hồi.');
    expect(await stream.closed).toBe(4401);

    herald.stop();
    expect(await herald.exit).toBe(0);
    const log = printed(herald.io);
    expect(log).toContain(`Đã ghép đôi thiết bị ${id}.`);
    expect(log).toContain('Sứ giả đã dừng.');
    expect(log).toContain(`Thiết bị ${id} mở luồng thế giới.`);
    expect(log).toContain(`Thiết bị ${id} gửi lệnh wake: đã vào inbox/.`);
    expect(log).toContain(`Thiết bị ${id} gửi lệnh no_such_kind: từ chối (invalid_message).`);
    expect(log).toContain(`Thiết bị ${id} đóng luồng thế giới.`);
    expect(log).not.toContain(paired.code);
    expect(log).not.toContain(cookie.slice('elvaria_session='.length));
  });

  it('answers in English, and names the origins it accepts besides loopback', async () => {
    const herald = await startHerald('--locale', 'en');
    const refused = await send(herald.origin, '/', { headers: { Origin: 'https://evil.example' } });
    expect(refused.status).toBe(403);
    expect(refused.body).toContain('The Herald takes no request from this page.');
    herald.stop();
    expect(await herald.exit).toBe(0);
    expect(printed(herald.io)).toContain('Refused a GET request: origin_refused.');
  });

  it('says a port in use with its code and exits 1', async () => {
    const taken = createServer();
    await new Promise<void>((resolve) => taken.listen({ host: '127.0.0.1', port: 0 }, resolve));
    const { port } = taken.address() as AddressInfo;
    try {
      const io = testIo();
      expect(await run(io, 'herald', '--kingdom', kingdom, '--port', String(port), '--locale', 'en')).toBe(1);
      expect(printed(io)).toContain(`Port ${port} is in use (EADDRINUSE)`);
    } finally {
      await new Promise((resolve) => taken.close(resolve));
    }
  });

  it('refuses a port that is not one', async () => {
    for (const port of ['70000', 'abc', '-1']) {
      const io = testIo();
      expect(await run(io, 'herald', '--kingdom', kingdom, `--port=${port}`, '--locale', 'en')).toBe(2);
      expect(printed(io)).toContain(`--port takes a number from 0 to 65535, not «${port}».`);
    }
  });
});
