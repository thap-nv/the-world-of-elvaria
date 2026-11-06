// Thirteen kinds of secret: one per pattern of redact-patterns.json, plus a treasury value with no shape that
// only the known-values list can catch. Every secret is put together at run time from pieces, so no
// secret-shaped literal sits in the repo for a scanner (or GitHub push protection) to flag. All are fake.

export interface SecretSample {
  /** A pattern id of redact-patterns.json, or `known` for a treasury value. */
  readonly kind: string;
  /** What must not appear after redaction. */
  readonly secret: string;
  /** The secret as it would show up in a transcript, a command or a tool result. */
  readonly line: string;
  /** What must still appear after redaction (the part a `keep` group leaves). */
  readonly kept?: string;
}

const join = (...parts: string[]): string => parts.join('');

const PEM_BODY = join('MIIEow', 'IBAAKCAQEA', 'fake'.repeat(12));
const JWT = [join('ey', 'JhbGciOiJIUzI1NiJ9'), join('ey', 'JzdWIiOiJ0aG9ybiJ9'), 'ZmFrZS1zaWduYXR1cmU'].join(
  '.',
);
const OPAQUE = join('opaque', 'FAKE', 'x'.repeat(20));
const URL_PASSWORD = join('Hunter2', '-FAKE-', 'pass');
const ASSIGNED = join('correct-horse', '-FAKE-', '42');

/** A value from the treasury that matches no pattern. */
export const KNOWN_SECRET = join('plain', '-FAKE-', 'treasury-value-77');

export const SECRET_SAMPLES: readonly SecretSample[] = [
  {
    kind: 'private_key',
    secret: PEM_BODY,
    line: join(
      'cat id_rsa\n',
      '-----BEGIN',
      ' RSA PRIVATE KEY-----\n',
      PEM_BODY,
      '\n-----END RSA PRIVATE KEY-----',
    ),
  },
  { kind: 'jwt', secret: JWT, line: `session cookie: ${JWT}` },
  {
    kind: 'anthropic_api_key',
    secret: join('sk-', 'ant-', 'api03-', 'FAKE'.repeat(10)),
    line: join('ANTHROPIC_API_KEY=', 'sk-', 'ant-', 'api03-', 'FAKE'.repeat(10)),
  },
  {
    kind: 'openai_api_key',
    secret: join('sk-', 'proj-', 'FAKEfake'.repeat(5)),
    line: join('codex login --api-key ', 'sk-', 'proj-', 'FAKEfake'.repeat(5)),
  },
  {
    kind: 'google_api_key',
    secret: join('AI', 'za', 'SyFAKE', '0'.repeat(29)),
    line: join(
      'curl "https://generativelanguage.googleapis.com/v1/models?key=',
      'AI',
      'za',
      'SyFAKE',
      '0'.repeat(29),
      '"',
    ),
  },
  {
    kind: 'github_fine_grained_token',
    secret: join('github', '_pat_', '11FAKE', '0'.repeat(16), '_', 'x'.repeat(30)),
    line: join(
      'git push https://',
      'github',
      '_pat_',
      '11FAKE',
      '0'.repeat(16),
      '_',
      'x'.repeat(30),
      '@github.com/o/r',
    ),
  },
  {
    kind: 'github_token',
    secret: join('gh', 'p_', 'FAKE'.repeat(9)),
    line: join('gh auth login --with-token <<< ', 'gh', 'p_', 'FAKE'.repeat(9)),
  },
  {
    kind: 'slack_token',
    secret: join('xo', 'xb-', '1234567890-0987654321-', 'FAKEfakeFAKE'),
    line: join('SLACK_BOT=', 'xo', 'xb-', '1234567890-0987654321-', 'FAKEfakeFAKE'),
  },
  {
    kind: 'aws_access_key_id',
    secret: join('AK', 'IA', 'FAKE', '0'.repeat(12)),
    line: join('aws configure set aws_access_key_id ', 'AK', 'IA', 'FAKE', '0'.repeat(12)),
  },
  {
    kind: 'bearer_token',
    secret: OPAQUE,
    line: `curl -H "Authorization: Bearer ${OPAQUE}" https://api.example.dev`,
    kept: 'Authorization: Bearer ',
  },
  {
    kind: 'url_credentials',
    secret: URL_PASSWORD,
    line: `DATABASE_URL=postgres://app:${URL_PASSWORD}@localhost:5432/elvaria`,
    kept: 'postgres://app:',
  },
  {
    kind: 'secret_assignment',
    secret: ASSIGNED,
    line: `DB_PASSWORD=${ASSIGNED}`,
    kept: 'DB_PASSWORD=',
  },
  { kind: 'known', secret: KNOWN_SECRET, line: `echo ${KNOWN_SECRET} | pnpm seed` },
];
