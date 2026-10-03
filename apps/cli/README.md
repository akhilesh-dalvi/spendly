# Spendly CLI

Spendly CLI lets you track expenses and manage Spendly accounts from a trusted
local terminal or through a local AI agent.

The initial `0.1.1` release is awaiting publication. Once it is published on
`next` for release verification, install the exact version on Node.js 22 or newer:

```bash
npm install --global spendly@0.1.1
spendly --version
spendly auth login
```

After that unchanged package passes production checks and moves to npm's
default `latest` channel, install it with `npm install --global spendly`.
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

The CLI stores credentials in the operating system credential store by
default. Never share tokens, authorization URLs, request headers, credential
files, environment variables, or personal financial output in a report.
