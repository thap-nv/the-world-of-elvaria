// A real passkey for the specs of SEC-08 (ADR 0038): a node:crypto key pair and the bytes a browser and its
// authenticator send, authenticatorData and clientDataJSON, signed as WebAuthn signs them. No dependency: testkit
// imports no package of the repo, so the caller hands in the challenge (the domain's commandChallenge).
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

export type TestPasskeyAlgorithm = 'es256' | 'rs256' | 'ed25519';

/** What the answer says; each field can be bent to meet one refusal. */
export interface TestAnswer {
  readonly type: string;
  readonly origin: string;
  readonly rpId: string;
  /** User present (0x01) and verified (0x04) unless bent. */
  readonly flags: number;
  readonly signCount: number;
}

export interface TestAssertion {
  readonly passkey: string;
  readonly authenticator_data: string;
  readonly client_data: string;
  readonly signature: string;
}

export interface TestRegistration {
  readonly id: string;
  readonly public_key: string;
  readonly algorithm: TestPasskeyAlgorithm;
  readonly authenticator_data: string;
  readonly client_data: string;
}

export interface TestPasskey {
  /** The credential id, base64url. */
  readonly id: string;
  /** SPKI DER, base64url. */
  readonly public_key: string;
  readonly algorithm: TestPasskeyAlgorithm;
  readonly origin: string;
  /** `navigator.credentials.get` over `challenge` (base64url). */
  sign(challenge: string, bent?: Partial<TestAnswer>): TestAssertion;
  /** `navigator.credentials.create` for `challenge`, attestation none. */
  register(challenge: string, bent?: Partial<TestAnswer>): TestRegistration;
}

export const TEST_PASSKEY_ORIGIN = 'https://keep.tail1234.ts.net';
const USER_PRESENT_VERIFIED = 0x05;
const ATTESTED = 0x40;
const AAGUID_LENGTH = 16;
const ID_LENGTH = 16;

const PAIRS: Readonly<Record<TestPasskeyAlgorithm, () => { publicKey: KeyObject; privateKey: KeyObject }>> = {
  es256: () => generateKeyPairSync('ec', { namedCurve: 'P-256' }),
  rs256: () => generateKeyPairSync('rsa', { modulusLength: 2048 }),
  ed25519: () => generateKeyPairSync('ed25519'),
};

const sha256 = (data: string | Buffer): Buffer => createHash('sha256').update(data).digest();

function authenticatorData(said: TestAnswer, attested?: Buffer): Buffer {
  const count = Buffer.alloc(4);
  count.writeUInt32BE(said.signCount);
  const head = Buffer.concat([sha256(said.rpId), Buffer.of(said.flags), count]);
  if (attested === undefined) return head;
  const length = Buffer.alloc(2);
  length.writeUInt16BE(attested.length);
  // The COSE key would follow the id; the Herald reads the SPKI key instead, so a placeholder stands for it.
  return Buffer.concat([head, Buffer.alloc(AAGUID_LENGTH), length, attested, Buffer.of(0xa0)]);
}

const clientData = (said: TestAnswer, challenge: string): Buffer =>
  Buffer.from(JSON.stringify({ type: said.type, challenge, origin: said.origin, crossOrigin: false }));

/** A fresh passkey of `algorithm`, registered through `origin`. */
export function testPasskey(
  algorithm: TestPasskeyAlgorithm = 'es256',
  origin: string = TEST_PASSKEY_ORIGIN,
): TestPasskey {
  const { publicKey, privateKey } = PAIRS[algorithm]();
  const rawId = randomBytes(ID_LENGTH);
  const answer = (type: string, bent: Partial<TestAnswer>): TestAnswer => ({
    type,
    origin,
    rpId: new URL(origin).hostname,
    flags: USER_PRESENT_VERIFIED,
    signCount: 0,
    ...bent,
  });
  const passkey = {
    id: rawId.toString('base64url'),
    public_key: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
    algorithm,
    origin,
  };
  return {
    ...passkey,
    sign: (challenge, bent = {}) => {
      const said = answer('webauthn.get', bent);
      const authenticator = authenticatorData(said);
      const client = clientData(said, challenge);
      const signed = Buffer.concat([authenticator, sha256(client)]);
      const signature = sign(algorithm === 'ed25519' ? null : 'sha256', signed, privateKey);
      return {
        passkey: passkey.id,
        authenticator_data: authenticator.toString('base64url'),
        client_data: client.toString('base64url'),
        signature: signature.toString('base64url'),
      };
    },
    register: (challenge, bent = {}) => {
      const said = answer('webauthn.create', bent);
      return {
        id: passkey.id,
        public_key: passkey.public_key,
        algorithm,
        authenticator_data: authenticatorData({ ...said, flags: said.flags | ATTESTED }, rawId).toString(
          'base64url',
        ),
        client_data: clientData(said, challenge).toString('base64url'),
      };
    },
  };
}
