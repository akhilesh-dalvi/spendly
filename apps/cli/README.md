# Spendly CLI

Track expenses and manage accounts and expense cycles from a trusted local
terminal or AI agent.

## Install and sign in

macOS, Node.js 22+:

```bash
npm install --global spendly@next
spendly --version
spendly auth login
```

Use `spendly` instead of `spendly@next` for npm's default release. Check installed
`--help` for supported commands; source changes may not be published.

[User documentation](https://spendly.akhileshdalvi.com/docs/cli) ·
[Report a bug](https://github.com/akhilesh-dalvi/spendly/issues) ·
[Report a vulnerability privately](https://github.com/akhilesh-dalvi/spendly/security/advisories/new)

## Interactive use

Run `spendly` for the guided menu (0.1.5+), or `spendly --interactive` explicitly.
Both stdin and stderr must be TTYs; bare non-TTY invocation prints help.
Guided commands provide searchable choices, validated fields, previews, and
confirmations. For static numbered prompts, use `--accessible`, `ACCESSIBLE=1`,
or `TERM=dumb`.

Shell completion: `spendly completion zsh` (also supports `bash` and `fish`).

## Scripts and agents

```bash
spendly --agent --json --non-interactive context
```

`--agent` identifies agent writes; `--json` returns structured output. Both
disable prompts and reject missing required inputs. Neither can be combined
with `--interactive`, which also conflicts with `--non-interactive`.

Use returned IDs, preview with `--dry-run`, and commit with an idempotency key.
Edits require revisions; deletions also require a short-lived preview token.
For separately reviewed cycle copies, preserve `data.copySnapshot` with
`--if-copy-snapshot`. On conflicts, approve a fresh preview; never blindly retry.

See [agent skill](https://github.com/akhilesh-dalvi/spendly/blob/master/skills/spendly/SKILL.md) for write-safety procedures and
[cycle commands](https://spendly.akhileshdalvi.com/docs/cli/cycles) for copy guards
and recovery.

Credentials use the OS credential store by default. Never share credentials,
OAuth URLs, headers, environment files, or personal financial output in reports.
