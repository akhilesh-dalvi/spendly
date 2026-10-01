# Spendly CLI Phase 2: Authentication

## Status

- Phase: Complete for the configured development environment
- Last updated: 2026-09-01
- Branch: `feature/spendly-cli`
- Detailed contract:
  [Spendly CLI Requirements and Implementation Plan](spendly-cli-requirements-and-implementation-plan.md)

The separate Phase 1 production OAuth client-ID prerequisite remains open.
Production auth stays disabled locally until that public identifier and its
matching production provider configuration are approved.

## Implemented

- Added OAuth authorization-code login for a public client using PKCE S256,
  cryptographically random state and nonce values, and no client secret.
- Added strict validation of the configured issuer and required HTTPS discovery
  endpoints while allowing standard providers to publish additional OIDC
  metadata fields.
- Added RS256 ID-token verification against the provider JWKS, including exact
  issuer, audience, nonce, subject, issued-at, and expiry checks.
- Added a `127.0.0.1` callback server on an OS-assigned port. It accepts one
  callback, validates state before provider errors, ignores unrelated paths,
  applies no-store browser headers, and expires after five minutes.
- Added macOS and Linux browser launching plus a printed same-machine URL
  fallback through `auth login --no-browser` or a failed browser launch.
- Added namespaced OS-keychain sessions. Credentials are keyed by the exact
  issuer and client-ID pair.
- Added the explicit `--allow-file-storage` fallback. Its directory and file
  are owner-only (`0700` and `0600`), ownership and file type are checked, and
  writes use exclusive temporary files, synchronization, and atomic rename.
- Stored only the ID token, refresh token, expiry, identity subject, login time,
  issuer, client ID, and schema version. OAuth access tokens and PKCE verifiers
  are never persisted.
- Added automatic refresh near token expiry, forced-refresh development proof,
  subject continuity checks, and a hard 30-day browser-reauthorization limit.
- Added `auth status` and `auth logout`. Logout always attempts local removal and
  reports whether provider refresh-token revocation was confirmed.
- Added the stable `ACCOUNT_SETUP_REQUIRED` error when Clerk authentication
  succeeds but no matching Spendly backend user exists.
- Expanded structured-output and debug redaction for OAuth codes, token fields,
  PKCE verifiers, client secrets, authorization headers, and cookies.

## Security Behavior

- Provider authentication failures invalidate local credentials; temporary
  network failures leave a valid refresh token available for retry.
- A refresh that resolves to a different subject invalidates the session.
- Invalid, malformed, wrongly owned, symlinked, or broadly readable fallback
  credentials are rejected. Corrupt fallback data can still be removed safely.
- A successful keychain write removes any stale plaintext fallback. Logout
  attempts cleanup of both stores even when fallback use was not enabled for
  that command.
- Authorization codes, refresh tokens, ID tokens, access tokens, and PKCE
  verifiers are absent from normal output, JSON output, debug diagnostics, and
  error messages.

## Verification

Passed on 2026-09-01:

```text
pnpm exec biome check apps/cli/src
pnpm -C apps/cli check-types
pnpm -C apps/cli check-types:development
pnpm build:cli
pnpm test:cli
pnpm pack:cli
git diff --check
```

Results:

- 13 test files and 58 tests passed.
- Tests cover loopback callback isolation, PKCE request shape, OIDC signature and
  claim validation, browser fallback, session refresh/expiry, revocation cleanup,
  credential permissions, namespace isolation, account setup, and leakage.
- Production and source-development TypeScript targets passed.
- The production CLI built successfully.
- `spendly-0.1.0.tgz` installed and ran in a fresh directory outside the
  repository; version, help, JSON, and exit-code checks passed.

## Live Development Proof

The configured development Clerk OAuth application and Convex deployment passed
the complete real flow on 2026-09-01:

1. `auth login --no-browser` opened a random loopback callback and presented the
   Clerk consent page in the same-machine browser.
2. Consent returned through the callback, the token exchange completed, the ID
   token validated, and the session was stored in the operating-system keychain.
3. Convex authenticated the same Clerk subject and returned the Spendly user with
   currency `INR`.
4. `auth status --json --non-interactive` confirmed the stored identity.
5. `auth refresh-test --json --non-interactive` completed a real refresh-token
   exchange and re-proved the same Convex identity.
6. `auth logout --json --non-interactive` confirmed provider revocation and local
   credential removal.

No manual verification remains for Phase 2 in the development environment.
