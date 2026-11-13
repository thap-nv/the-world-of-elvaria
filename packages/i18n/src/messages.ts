// Display strings for the CLI and the UI (ADR 0014, implementation-plan §4.1). Vietnamese is the reference and
// the default; `pnpm i18n:check` holds every other locale to the same keys and placeholders.
import en from './locales/en.json' with { type: 'json' };
import vi from './locales/vi.json' with { type: 'json' };

export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
/** What the owner reads unless `kingdom.owner.locale` says otherwise. */
export const DEFAULT_LOCALE: Locale = 'vi';

export type MessageKey = keyof typeof vi.messages;
export type Params = Readonly<Record<string, string | number>>;
export type Translate = (key: MessageKey, params?: Params) => string;

/** One locale file: `version` like every JSON file of the repo, then flat dotted keys. */
export interface LocaleFile {
  readonly version: number;
  readonly messages: Readonly<Record<string, string>>;
}

export const LOCALE_FILES: Readonly<Record<Locale, LocaleFile>> = { vi, en };

// Typed against the Vietnamese keys, so a key missing in English fails typecheck before i18n:check runs.
const MESSAGES: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = {
  vi: vi.messages,
  en: en.messages,
};

const PLACEHOLDER = /\{([a-z_][a-z0-9_]*)\}/g;

/** Placeholder names in a template, sorted and without repeats. */
export function placeholdersOf(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((match) => match[1] ?? ''))].sort();
}

/** Fills `{name}` placeholders. One without a value stays as written, so a missing param shows in review. */
export function format(template: string, params: Params = {}): string {
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** `t` for one locale: `const t = translator(kingdom.owner.locale); t('locale.vi')`. */
export function translator(locale: Locale): Translate {
  const catalog = MESSAGES[locale];
  return (key, params) => format(catalog[key], params);
}

export const isLocale = (value: string): value is Locale => (LOCALES as readonly string[]).includes(value);

/** A key built from data (a theme part's id, PS-24) that the catalog has: the caller shows the id when it has not. */
export const isMessageKey = (key: string): key is MessageKey => Object.hasOwn(vi.messages, key);
