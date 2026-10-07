# Spendly CLI

Spendly CLI lets you track expenses and manage Spendly accounts and expense cycles from a trusted
local terminal or through a local AI agent.

The initial `0.1.2` release is available on npm for macOS. Install it on
Node.js 22 or newer:

```bash
npm install --global spendly@0.1.2
spendly --version
spendly auth login
```

Use `npm install --global spendly` for the default release, or the pinned command
above for the exact initial version. Production authentication and Codex
read-only skill use have been verified; broader validation remains follow-up work.
Spendly will remain in the `0.x` series while real users prove the CLI contract
is dependable enough for `1.0.0`.

Start with the [Spendly CLI documentation](https://spendly.akhileshdalvi.com/docs/cli).
Report ordinary problems through
[GitHub issues](https://github.com/akhilesh-dalvi/spendly/issues) and security
problems through
[private vulnerability reporting](https://github.com/akhilesh-dalvi/spendly/security/advisories/new).

For a guided terminal flow, run:

```bash
spendly --interactive
```

The launcher and command-specific `--interactive` mode use searchable choices,
checkbox-style multiselects, validated text and date fields, previews, and safe
confirmations. `›` marks the focused choice, and brackets mark the active date
segment, for example `[2026]-09-15`. Expense amount prompts show the currency
configured during Spendly onboarding. Explicit flags remain available for
scripts and AI agents.

For static, screen-reader-friendly numbered prompts without cursor redraws, add
`--accessible` or set `ACCESSIBLE=1`. Spendly also selects this mode when
`TERM=dumb`. Generate local command and global-option completion with
`spendly completion zsh`, `spendly completion bash`, or
`spendly completion fish`.

## Expense cycles

Check `spendly cycles --help` for support in your installed version; older
releases only offer list/current. Cycle writes also require a compatible backend.

```bash
spendly cycles list
spendly cycles get CYCLE_ID
spendly cycles add --interactive --dry-run
spendly cycles edit CYCLE_ID --name "Updated name" --dry-run
spendly cycles delete CYCLE_ID --dry-run
```

Explicit creation uses `--name`, `--start-date`, and `--end-date-exclusive`.
Dates are half-open: September uses September 1 to October 1. Cycles cannot
overlap. Creation can copy all or selected categories and optional plans from
an owned cycle. Date edits do not reassign existing expenses. Deletion requires
no linked expenses and permanently removes the cycle's categories.

Agent/script commits use `--agent --json --non-interactive`, stable IDs, and
`--idempotency-key`. Copying writes automatically obtain and commit the same
copy snapshot in guided, human, and direct modes. For a separately reviewed dry
run, capture `data.copySnapshot` and commit with `--if-copy-snapshot HASH`, keeping
the source, selections, and plan inputs identical. The hash is 64 lowercase hex
characters; the flag requires `--copy-from-cycle-id` and cannot accompany
`--dry-run`. A source with explicit copy-none still gets an empty-selection guard;
creation without a source is unchanged.

`CYCLE_COPY_CONFLICT` (exit 5) means stop and approve a fresh preview, not blindly
retry or change the payload. For an uncertain write, replay the original inputs,
snapshot, key, and agent mode with `--non-interactive`. An explicit snapshot skips
new preview/source reads, allowing backend idempotency to return a saved result
even if the source changed or was deleted.

Edits require `--if-revision`; deletions additionally require the short-lived
`--confirmation-token` returned by a dry run.
See [cycle commands](https://spendly.akhileshdalvi.com/docs/cli/cycles) for flags,
copy overrides, JSON results, and recovery.

The CLI stores credentials in the operating system credential store by
default. Never share tokens, authorization URLs, request headers, credential
files, environment variables, or personal financial output in a report.
