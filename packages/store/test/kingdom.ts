// Test helpers: throwaway kingdoms in the OS temp folder and the v1 fixtures next to the migrations.
// The folder name has a space on purpose: real kingdoms live in paths like `D:\Dummy\Tool - Personal\…`.
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = fileURLToPath(new URL('../src/migrations/', import.meta.url));

export interface TempKingdom {
  readonly root: string;
  remove(): Promise<void>;
}

export async function tempKingdom(): Promise<TempKingdom> {
  const root = await mkdtemp(path.join(tmpdir(), 'elvaria kingdom '));
  return { root, remove: () => rm(root, { recursive: true, force: true }) };
}

/** The stored fixture `<contract>/v<version>.json`, as text. */
export const fixtureText = (contract: string, version = 1): string =>
  readFileSync(path.join(MIGRATIONS_DIR, contract, `v${version}.json`), 'utf8');

/** The stored fixture, parsed. */
export const fixture = (contract: string, version = 1): unknown => JSON.parse(fixtureText(contract, version));

/** Puts a file in the kingdom without the store: text as is, anything else as JSON. */
export async function plant(root: string, relative: string, content: unknown): Promise<string> {
  const target = path.join(root, ...relative.split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  const text = typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`;
  await writeFile(target, text, 'utf8');
  return target;
}

const REGISTRY_FIXTURES = {
  kinds: 'kind',
  classes: 'class',
  rituals: 'ritual',
  scripts: 'script',
  tags: 'tag',
};

/** The prompt files the class fixture names (P1-15: a registry without them does not load). */
export const FIXTURE_PROMPTS = ['registry/prompts/scribe.md', 'registry/prompts/judge.md'] as const;

/**
 * registry/ made of the five registry fixtures and the class prompts they name: a small registry that passes every
 * cross-file rule and loads.
 */
export async function plantRegistry(root: string): Promise<void> {
  for (const [file, contract] of Object.entries(REGISTRY_FIXTURES)) {
    await plant(root, `registry/${file}.json`, fixtureText(contract));
  }
  for (const prompt of FIXTURE_PROMPTS) await plant(root, prompt, '# Craft\n');
}
