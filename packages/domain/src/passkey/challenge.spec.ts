// The challenge of a command (SEC-08, ADR 0038): canonical JSON of its id, kind and payload, hashed.
import { describe, expect, it } from 'vitest';

import { canonicalJson, commandChallenge } from './challenge.ts';
import type { SignedCommand } from './challenge.ts';
import { fakeCrypto } from './__fixtures__/fake-passkey.ts';

const SEAL = {
  id: '01JDZ0SEC08AAAAAAAAAAAAAAA',
  kind: 'seal',
  payload: { quest: 'q_20261128_7k3m2a', note: 'Đã xem' },
} as unknown as SignedCommand;

describe('canonicalJson', () => {
  it('sorts the keys of every object, keeps the order of arrays and drops undefined fields', () => {
    expect(canonicalJson({ b: 1, a: [{ d: null, c: 'x' }, 2], skip: undefined })).toBe(
      '{"a":[{"c":"x","d":null},2],"b":1}',
    );
  });

  it('writes an undefined item of an array as null, as JSON does', () => {
    expect(canonicalJson([undefined, true])).toBe('[null,true]');
  });
});

describe('commandChallenge', () => {
  it('is the same whatever order the fields were built in', () => {
    const reordered = { payload: { note: 'Đã xem', quest: 'q_20261128_7k3m2a' }, kind: 'seal', id: SEAL.id };
    expect(commandChallenge(fakeCrypto, reordered as unknown as SignedCommand)).toBe(
      commandChallenge(fakeCrypto, SEAL),
    );
  });

  it('changes with the id, the kind and the payload', () => {
    const challenge = commandChallenge(fakeCrypto, SEAL);
    const others = [
      { ...SEAL, id: '01JDZ0SEC08BBBBBBBBBBBBBBB' },
      { ...SEAL, kind: 'return' },
      { ...SEAL, payload: { quest: 'q_20261128_7k3m2b' } },
    ] as unknown as SignedCommand[];
    for (const other of others) expect(commandChallenge(fakeCrypto, other)).not.toBe(challenge);
    expect(challenge).toMatch(/^[\w-]{43}$/);
  });
});
