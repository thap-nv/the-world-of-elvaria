// One request, in a fixed order (ADR 0031 item 4): the gate (Host, Origin) for every request; then `/pair`, the one
// route without a session; then the session for everything else, the device file read again each time. Only POST
// changes state; GET /pair shows a form and checks nothing, so it cannot be used to test guesses.
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Clock, Instant, RandomSource } from '@elvaria/domain';
import type { KingdomStore } from '@elvaria/store';

import { gateRequest } from '../origin/origin.ts';
import { redeemPairingCode } from '../pairing/pairing.ts';
import { cookieValue, sessionCookie } from '../session/cookie.ts';
import { openSession, sessionDevice } from '../session/session.ts';
import { homePage, pairPage } from './pages.ts';
import { readBody, send, sendRefusal } from './respond.ts';
import { contentTypeOf, readStatic, staticPath } from './static.ts';
import type { AllowedOrigins, Gate } from '../origin/origin.ts';
import type { HeraldLog } from './log.ts';
import type { HeraldPages } from './pages.ts';
import type { HeraldRefusal } from './refusal.ts';

export interface HandleContext {
  readonly store: KingdomStore;
  readonly clock: Clock;
  readonly format: (at: Instant) => string;
  readonly random: RandomSource;
  readonly allowed: AllowedOrigins;
  readonly pages: HeraldPages;
  readonly log: HeraldLog;
  /** The client's build folder; none yet (P2-07): `/` then shows which device this is. */
  readonly staticDir: string | undefined;
}

/** What a route answers: a refusal (its page and status), or a page, a file or a redirect. */
type Reply =
  | { readonly refusal: HeraldRefusal }
  | {
      readonly status: number;
      readonly body: string | Buffer;
      readonly headers?: Readonly<Record<string, string>>;
    };

const FORM = 'application/x-www-form-urlencoded';
const SEE_OTHER = 303;
const OK = 200;

const no = (refusal: HeraldRefusal): Reply => ({ refusal });

/** POST /pair: a code from the form for a session cookie, then back to `/`. */
async function pair(req: IncomingMessage, ctx: HandleContext, gate: Gate): Promise<Reply> {
  if (!(req.headers['content-type'] ?? '').startsWith(FORM)) return no('bad_request');
  const body = await readBody(req);
  if (body === undefined) return no('body_too_large');
  const code = new URLSearchParams(body).get('code') ?? '';
  if (code === '') return no('bad_request');
  ctx.log.remember(code);
  const redeemed = await redeemPairingCode(ctx.store.root, code, ctx.clock);
  if (!redeemed.ok) return no(redeemed.error === 'locked' ? 'failed' : redeemed.error);
  // The device may have been revoked, or its file removed, between `herald pair` and now.
  const device = await ctx.store.devices.read(redeemed.value);
  if (!device.ok) return no('unknown_device');
  if (device.value.revoked_at !== undefined) return no('device_revoked');
  const session = await openSession(ctx, redeemed.value);
  if (!session.ok) return no('failed');
  ctx.log.remember(session.value);
  ctx.log.write({ kind: 'paired', device: redeemed.value });
  const cookie = sessionCookie(session.value, gate.secure);
  return { status: SEE_OTHER, body: '', headers: { Location: '/', 'Set-Cookie': cookie } };
}

async function pairRoute(req: IncomingMessage, ctx: HandleContext, gate: Gate, url: URL): Promise<Reply> {
  if (req.method === 'POST') return pair(req, ctx, gate);
  if (req.method !== 'GET') return no('not_found');
  const code = url.searchParams.get('code') ?? '';
  if (code === '') return no('bad_request');
  ctx.log.remember(code);
  return { status: OK, body: pairPage(ctx.pages, code) };
}

async function staticFile(dir: string, url: URL): Promise<Reply> {
  const file = staticPath(dir, url.pathname);
  const bytes = file === undefined ? undefined : await readStatic(file);
  if (file === undefined || bytes === undefined) return no('not_found');
  return { status: OK, body: bytes, headers: { 'Content-Type': contentTypeOf(file) } };
}

async function route(req: IncomingMessage, ctx: HandleContext): Promise<Reply> {
  const gate = gateRequest({ host: req.headers.host, origin: req.headers.origin }, ctx.allowed);
  if (!gate.ok) return no(gate.error);
  // Only the path and query are read; the base never shows (an absolute-form URL keeps its own host, unused).
  const url = new URL(req.url ?? '/', 'http://herald.invalid');
  if (url.pathname === '/pair') return pairRoute(req, ctx, gate.value, url);
  const device = await sessionDevice(ctx, cookieValue(req.headers.cookie));
  if (!device.ok) return no(device.error);
  if (req.method !== 'GET') return no('not_found');
  if (ctx.staticDir !== undefined) return staticFile(ctx.staticDir, url);
  if (url.pathname !== '/') return no('not_found');
  return { status: OK, body: homePage(ctx.pages, device.value) };
}

export async function handle(req: IncomingMessage, res: ServerResponse, ctx: HandleContext): Promise<void> {
  const reply = await route(req, ctx);
  if (!('refusal' in reply)) {
    send(res, reply.status, reply.body, reply.headers);
    return;
  }
  ctx.log.write({ kind: 'refused', refusal: reply.refusal, method: req.method ?? '' });
  // A body left unread would be parsed as the next request on this socket.
  if (reply.refusal === 'body_too_large') res.setHeader('Connection', 'close');
  sendRefusal(res, ctx.pages, reply.refusal);
}
