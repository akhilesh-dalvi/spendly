# Mutation Safety and Recovery

Read this reference before any Spendly mutation or whenever a read is
ambiguous, stale, uncertain, destructive, or produces an important warning.

## One-intent protocol

1. Identify one requested mutation and its exact target. Do not expand a
   singular request into a batch.
2. Resolve stable IDs and current revision or revisions through JSON reads.
3. Generate a fresh opaque idempotency key, preferably a UUID. Never derive it
   from personal or financial content.
4. Run the server-backed dry run with the same domain inputs as the intended
   commit.
5. Compare normalized IDs, values, date, currency, sources, revisions,
   warnings, and every affected balance with the user's intent.
6. Commit once by removing `--dry-run`, retaining the reviewed inputs, and
   adding the expected revision or revisions and idempotency key.
7. Report what changed, durable IDs, new revisions, ledger references,
   balances, warnings, and the exact next action when one remains.

Do not reuse a key for a different input or intent. Retention-backed replay is
a correctness mechanism, not an audit log.

## Ambiguity

If a name resolves to multiple resources, stop and show only the safe candidate
details returned by Spendly. Do not choose the first, fuzzy-match, or commit.
Ask the user to select one candidate, then continue with its stable ID and a new
preview.

## Revision conflict

Never automatically retry a revision conflict. Read the current resource and
explain the material change. If the change affects intent, ask for direction.
If the intent still applies, run a new preview against the new revision and use
a fresh key for the newly reviewed attempt.

## Uncertain transport result

Mutations are not automatically retried. When a timeout or disconnect leaves
the result uncertain:

1. Read the affected resource when that can prove whether the commit happened.
2. If uncertainty remains, explicitly repeat the exact commit command with the
   same idempotency key and unchanged inputs.
3. If that exact retry is also uncertain, stop and report that the outcome is
   unknown. Do not loop or switch keys.

Validation, authentication, revision, idempotency, and confirmation failures
are not transport uncertainty and must not be retried under this rule.

## Destructive intent

Expense deletion is permanent. A description or name alone is not a safe
target. Resolve and preview one exact expense, surface its identity, revision,
balance effect, and permanence, then commit only if the user explicitly
authorized permanent deletion of that exact state. Use only the preview's
short-lived confirmation token and a fresh key.

Spendly does not support permanent account deletion, direct ledger mutation,
or completed-transfer edit/delete. Explain the boundary and offer archival or
a separately authorized compensating transfer only when it matches the user's
goal.

## Negative balances and unexpected effects

Negative account balances are allowed, not silent. Surface the account,
currency, current balance, signed change, and resulting balance before commit.
Proceed only when the existing instruction covers that result or the user
approves it after seeing the warning.

Stop for any normalization or balance effect outside the user's stated intent.
Do not change amounts, currencies, dates, selectors, or account direction to
make a warning disappear.

## Privacy

Never inspect keychain records, token stores, environment files, raw OAuth
responses, or authorization headers. Never copy financial JSON to external
services. Use only the CLI's stable output and redacted diagnostics.
