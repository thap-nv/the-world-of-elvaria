// The Herald's own pages: plain HTML, no script and no inline style (the CSP allows neither), every word from the
// composition root in the owner's language. The pairing page only shows a form: posting it is what uses the code.
import type { Device } from '@elvaria/domain';

import type { HeraldRefusal } from './refusal.ts';

export interface HeraldPages {
  /** `lang` of every page (`vi`, `en`). */
  readonly lang: string;
  readonly title: string;
  /** Above the pairing button: what pressing it does. */
  readonly pairPrompt: string;
  readonly pairButton: string;
  /** `/` while no client build is served: which device this browser is, and its role. */
  readonly home: (device: Device) => string;
  readonly refusals: Readonly<Record<HeraldRefusal, string>>;
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

function page(pages: HeraldPages, body: string): string {
  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(pages.lang)}">`,
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(pages.title)}</title></head>`,
    `<body><h1>${escapeHtml(pages.title)}</h1>${body}</body>`,
    '</html>',
    '',
  ].join('\n');
}

/** GET /pair?code=…: the code goes back in a hidden field of a POST form. */
export const pairPage = (pages: HeraldPages, code: string): string =>
  page(
    pages,
    [
      `<p>${escapeHtml(pages.pairPrompt)}</p>`,
      '<form method="post" action="/pair">',
      `<input type="hidden" name="code" value="${escapeHtml(code)}">`,
      `<button type="submit">${escapeHtml(pages.pairButton)}</button>`,
      '</form>',
    ].join(''),
  );

export const homePage = (pages: HeraldPages, device: Device): string =>
  page(pages, `<p>${escapeHtml(pages.home(device))}</p>`);

export const refusalPage = (pages: HeraldPages, refusal: HeraldRefusal): string =>
  page(pages, `<p>${escapeHtml(pages.refusals[refusal])}</p>`);
