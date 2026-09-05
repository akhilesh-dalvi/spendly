# Spendly CLI Phase 8: Fumadocs Documentation

## Status

- Status: In progress; Phase 7 implementation is verified and its unavailable
  Claude Code response evaluation remains a release gate
- Approved: 2026-09-05
- Branch: `feature/spendly-cli`
- Depends on: stable CLI command/JSON contracts and the completed Spendly skill
- Exit criterion: a public, searchable, responsive `/docs/cli` site whose
  commands match the production CLI build and whose examples contain only
  synthetic data

## Objective

Publish task-oriented Spendly CLI documentation through Fumadocs inside the
existing Spendly Web application. The documentation should help both terminal
users and local AI-agent users while keeping the installed CLI and versioned
JSON schemas authoritative.

This phase is documentation infrastructure and public content. Packaging and
npm release remain Phase 9.

## Approved Architecture

- Integrate Fumadocs into `apps/web`; do not create a separate docs application.
- Serve pages publicly at `/docs/cli` without Clerk authentication.
- Store public content under `apps/web/content/docs/cli`.
- Keep repository implementation notes such as this file under top-level
  `docs/`; they are not Fumadocs content and must not be published.
- Use Fumadocs MDX for typed local content and Fumadocs UI for navigation,
  table of contents, code blocks, and search.
- Use Fumadocs' built-in search initially. Do not add an external search vendor
  for the version 1 documentation corpus.
- Use a dedicated `(docs)` route group so the docs can have a documentation
  layout without inheriting authenticated application chrome.
- Reuse Spendly branding, typography, shared metadata conventions, and links
  back to the main product.

The implementation should follow the current official
[Fumadocs Next.js installation guide](https://www.fumadocs.dev/docs/manual-installation/next)
and [search guide](https://www.fumadocs.dev/docs/search). Resolve and lock exact
compatible package versions when this phase starts. Any Fumadocs or Web runtime
requirement must not silently raise the published CLI's Node.js requirement.

## Proposed File Layout

Exact filenames may follow the installed Fumadocs version, but the ownership
boundaries should remain:

```text
apps/web/
  content/docs/cli/
    index.mdx
    installation.mdx
    authentication.mdx
    cli-contract.mdx
    expenses.mdx
    accounts.mdx
    transfers.mdx
    agent-skill.mdx
    privacy.mdx
    troubleshooting.mdx
    meta.json
  src/app/(docs)/docs/cli/
    layout.tsx
    [[...slug]]/page.tsx
  src/app/api/docs/search/route.ts
  src/lib/docs/source.ts
  mdx-components.tsx
  source.config.ts
```

Do not copy backend implementation documentation into this tree.

## Content Contract

### User Journey

The landing page should lead with three clear paths:

1. Install and use Spendly from a terminal.
2. Connect safely with browser authentication.
3. Install the Spendly skill for Codex or Claude Code.

Task pages should explain the safe end-to-end workflow before presenting an
exhaustive option list. Command-reference sections should remain concise and
link to related safety behavior.

### Required Pages

- Overview and supported operations.
- Installation, updating, version checking, and uninstalling.
- Authentication, logout, keychain behavior, secure file fallback, and
  `ACCOUNT_SETUP_REQUIRED`.
- Global flags, output modes, JSON envelopes, exit codes, dates, pagination,
  stable IDs, and selector resolution.
- Expense reads, creation, correction, account assignment, and permanent
  deletion.
- Account reads, lifecycle changes, default selection, reconciliation, and
  transaction history.
- Same-currency transfers and negative-balance warnings.
- Dry runs, idempotency keys, revisions, ambiguity, conflicts, and uncertain
  mutation-result recovery.
- Spendly skill installation and the `--json --non-interactive` agent contract.
- Privacy, security boundaries, and troubleshooting.

### Source of Truth

- Installed `spendly <resource> <command> --help` defines current syntax.
- Versioned JSON schemas define machine responses and errors.
- Backend validators remain authoritative for ownership and business rules.
- Fumadocs content explains these contracts; it must not redefine them.
- Phase documents may inform writing but are not directly published.

## Documentation Verification

Add automated checks that:

- Build the production CLI before checking documentation.
- Validate command paths and option names used in copyable `spendly` examples
  against the built command tree without committing mutations.
- Validate JSON examples against the applicable versioned schemas or existing
  synthetic fixtures.
- Reject real-looking credentials, authorization headers, development
  endpoints, home-directory paths, and user financial identifiers from public
  content and generated output.
- Detect broken internal links and missing navigation entries.
- Build the complete Web application in production mode.

Browser verification must cover:

- Public access while signed out.
- Sidebar, breadcrumbs, table of contents, search, and code-copy controls.
- Keyboard navigation and visible focus.
- Mobile, tablet, and desktop layouts without horizontal overflow.
- Light and dark themes.
- Representative links from the marketing site and back to Spendly.
- No console errors or failed search requests.

## Implementation Order

1. Resolve compatible Fumadocs versions and verify runtime requirements.
2. Add MDX/source configuration and the shared provider/styles.
3. Add public docs routes, layout, navigation, and built-in search.
4. Establish Spendly visual styling and responsive behavior.
5. Author overview, installation, authentication, and CLI-contract pages.
6. Author expense, account, transfer, agent-skill, privacy, and troubleshooting
   pages from shipped code, tests, schemas, and live help.
7. Add command, schema, leakage, link, and production-build checks.
8. Run browser verification and fix accessibility or responsive issues.
9. Add canonical metadata, sitemap entries, and product navigation links.
10. Record final evidence here and hand the stable docs URL to Phase 9.

## Out of Scope

- A separate docs deployment or repository.
- A CMS, external search service, comments, or authenticated personalization.
- Publishing internal phase plans, backend endpoints, or development setup.
- Generating financial examples from a real Spendly account.
- Replacing CLI help, JSON schemas, backend validation, or the Spendly skill.
- Versioned documentation branches before a second public CLI contract exists.

## Completion Checklist

- [ ] Fumadocs is integrated into `apps/web` with locked compatible versions.
- [ ] `/docs/cli` and documentation search work without authentication.
- [ ] All required content pages are published and linked in navigation.
- [ ] Command and JSON examples pass automated contract checks.
- [ ] Public content and generated output pass leakage scanning.
- [ ] Production build and browser verification pass.
- [ ] Metadata, sitemap, canonical URLs, and product navigation are complete.
- [ ] The production documentation URL is ready for npm and skills.sh links in
      Phase 9.
