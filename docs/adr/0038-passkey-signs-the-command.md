# ADR 0038 · A passkey signs one command: its id, kind and payload

- Status: accepted · 2026-11-28 (SEC-08; ADR 0031 item 6 left the format to the task)
- Related: [ADR 0031](0031-herald-pairing-and-session-cookie.md) item 6, [ADR 0037](0037-paired-devices-carry-a-role.md), [ADR 0005](0005-single-writer-steward-inbox.md), [ADR 0002](0002-pure-domain-package.md); [threat model](../plans/phase-2-threat-model.md) V8, B3

## Context

ADR 0031 asks a phone's command of group 2 or 3 for a WebAuthn assertion whose challenge is the hash of its `kind` and `payload`, verified with `node:crypto` and no new dependency. Three things were left open: what stops the same signature from approving the same order twice, where the public keys live so the Steward can check again (ADR 0037 item 4), and how a key is registered when only the owner's commands write device files.

## Decision

1. **Challenge.** SHA-256 of the canonical JSON (keys sorted, undefined left out) of `{ id, kind, payload }` of the inbox command, base64url. The id is the Herald's fresh ULID, so the challenge cannot be known before the Herald answers; a copied signature fails on another file, and the file of the same id is applied once. The Herald computes it on the command it will write and sends it back (`challenge`); the client signs it (`navigator.credentials.get`, user verification required) and answers `confirm`.
2. **What is checked** (`checkConfirmation`, pure, `domain/src/passkey`, the hash and the signature through a `PasskeyCrypto` port): the passkey is the device's and not revoked; the signature over `authenticatorData ‖ SHA-256(clientDataJSON)` verifies (ES256, RS256 or Ed25519 over SPKI); clientDataJSON is `webauthn.get` with our challenge from the passkey's origin, not cross-origin; `rpIdHash` is the hash of that origin's host; user present and verified; the counter moves on (0 after 0 passes: synced passkeys keep none). Refusals: `passkey_required`, `passkey_unknown`, `passkey_revoked`, `passkey_mismatch`, `passkey_invalid`.
3. **Twice.** The Herald writes the assertion into the command (`confirmation`, optional, inbox v1); the Steward checks it again against the device file before `deviceMay`, and writes the new counter back. A wrong signature is refused in every group.
4. **Keys live in the device file** (`passkeys`, optional, device v1): id, SPKI public key, algorithm, origin, counter, `added_at`, `revoked_at`. Only the Steward writes them, applying `add_passkey` (the sending device, any role), `revoke_device` with `passkey` (one key) and the device commands below.
5. **Registration.** `enroll` gets a fresh 32-byte challenge, `register` sends `create()`'s answer with attestation `none` and the key as SPKI (`getPublicKey()`), so nothing parses CBOR; the Herald checks the ceremony (`webauthn.create`, our challenge, the tunnel's origin, the authenticator's credential id, a key of the named algorithm) and writes `add_passkey`. A device's first passkey needs no signature but only within 5 minutes of its pairing (the code printed on the machine, or by a `pair_device` from a device with a passkey); later ones need the signature of a live one. Loopback never registers: WebAuthn needs the tunnel's HTTPS host.
6. **Devices from the phone.** `pair_device`, `set_device`, `revoke_device` are group 3, so a full device with a passkey only; the Herald draws the new device's id (`pair_device`) and answers with its pairing code.

## Consequences

- No dependency; the domain stays pure (base64url and the byte layout are its own, hashing comes in through the port).
- A command of group 2 or 3 from the phone costs one round trip and one user verification more.
- Anything that writes the kingdom folder can still add a key to a device without one, or write `source: cli` (threat model R2): the second check catches the Herald's mistakes, not the OS user.
- The browser half (`navigator.credentials`) belongs to the task that builds `apps/lite`; the protocol messages are its contract.
