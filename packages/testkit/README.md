# @elvaria/testkit

Test tools that every package needs and that must not be copied again (architecture-health V7, K6; rule R7):
throwaway folders, git repos and fake secrets. Dev-only: a workspace lists it in `devDependencies` and imports it only from
`*.spec.ts`, `__fixtures__/` and config files (`DEV_ONLY` in `packages/config/boundaries.mjs`, ADR 0001).

## Does

- `tempDir(label)`: a new folder `elvaria <label> <random>` in the OS temp folder. The name always has a space,
  like the owner's real paths (implementation-plan §6). `remove()` deletes it with what is in it.
- `RM_TEMP`: the options of that `rm`, retrying while Windows holds a file a moment (EBUSY, EPERM; P1-39). The
  same numbers as `RM_RETRY` of `@elvaria/store`, for running code; store's `remove.spec.ts` checks they agree.
- `gitRepo(folder, files?)`: a repo on `main` with its own identity, no signing, `core.autocrlf = false`, and one
  commit holding `files` (default: a `README.md`). `commitFiles(repo, files, message?)` commits more and returns
  the sha.
- `git(cwd, ...args)`: git without a shell and without the caller's `GIT_*` variables (`envWithoutGit`), so a spec
  running inside husky's pre-push never writes into the repo being pushed.
- `SECRET_SAMPLES`, `KNOWN_SECRET`: one fake secret per pattern of `@elvaria/eventlog`'s `redact-patterns.json`, plus
  a treasury value with no shape, each inside the line it would show up in. Built from pieces at run time, so no
  scanner flags the repo. The event log checks its redactor with them, the Herald that none reaches a client.
- `testPasskey(algorithm?, origin?)` (SEC-08): a real `node:crypto` key pair (ES256, RS256 or Ed25519) and the bytes
  a browser and its authenticator send, `sign(challenge)` as `navigator.credentials.get` and `register(challenge)`
  as `create` with attestation `none`; each field of the answer can be bent to meet one refusal. The caller hands in
  the challenge, since testkit imports no workspace.

## Does not

- Import any workspace: it sits below everything, so any package's specs can use it.
- Build kingdoms, quests or territories: those builders know the domain and stay in each package's `__fixtures__/`.
- Ship: running code may not import it (ESLint `no-restricted-imports` and dependency-cruiser).

## Depends on

- Node only at run time (`node:fs`, `node:os`, `node:path`, `node:child_process`, `node:crypto`); `git` on PATH for the git
  helpers. No third-party package.
- `@elvaria/config` (dev only: `tsconfig.json` extends its `tsconfig/node.json`).

## How to test

`pnpm --filter @elvaria/testkit test`. The GIT_DIR spec points `GIT_DIR` at a repo outside and checks it did not
move.
