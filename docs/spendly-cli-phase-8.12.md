# Spendly CLI Phase 8.12: Raycast Reuse Readiness

## Status

- Status: complete; architecture research, reuse audit, provenance seam, and
  release-plan integration implemented
- Depends on: Phase 8.11 headless operation boundary
- Blocks: release-ready source handoff and Phase 9 publication-candidate freeze
- Raycast baseline reviewed: `@raycast/api@2.4.1` and
  `@raycast/utils@2.3.1`
- Last updated: 2026-09-16

## Objective

Make the Phase 8.11 operation layer safe to reuse in a future Spendly Raycast
extension without shipping an extension or adding Raycast dependencies to the
CLI release. Identify exactly what can be shared, what needs a Raycast-specific
adapter, and which packaging and authentication decisions must be completed
when extension implementation begins.

## Decision

The Spendly business-operation code can be reused by a Raycast extension. The
32 typed operations, Zod contracts, stable errors, preview/commit split,
revision and idempotency rules, cancellation hook, and authenticated gateway
interface are compatible with Raycast's managed Node.js and TypeScript runtime.

The CLI command layer cannot be reused. Commander parsing, Clack prompts,
terminal renderers, process streams, loopback login server, native keyring,
exit codes, and shell completion remain CLI-only adapters. A Raycast extension
must provide native List, Detail, Form, ActionPanel, Alert, Toast, OAuth, and
storage adapters around the same operation service.

The current source location is a packaging boundary, not a logic boundary.
`apps/cli/src/core/operations.ts` is dependency-neutral, but a public Raycast
Store extension must not reach across repositories into `apps/cli`. Before the
extension ships, move the canonical operation source and its schemas/errors to
a framework-neutral package or create a deterministic, hash-verified source
snapshot for the extension. Do not duplicate the logic by hand or invoke the
`spendly` executable from Raycast.

Phase 8.12 adds `raycast` to the adapter-owned invocation-origin type and proves
that a Raycast adapter can decorate commits without changing preview inputs.
It deliberately does not add backend `raycast` provenance yet; the future
authenticated Raycast backend wrapper must map that trusted adapter identity
to a new source value and include it in mutation idempotency fingerprints.

## Current Raycast Model

The reviewed Raycast extension model has these relevant properties:

- An extension is a TypeScript/React package whose `package.json` is also its
  Raycast manifest. Each declared command maps to a `src/<command>.ts` or
  `.tsx` entry point.
- `view` commands render Raycast's native React components. `no-view` commands
  run without pushing a view, and `menu-bar` commands render a Menu Bar Extra.
  Raycast uses its own native renderer rather than HTML, CSS, or `react-dom`.
- The managed Node.js runtime permits normal network requests. Each extension
  runs in an isolated worker with limited memory, so pagination and caches must
  remain bounded.
- List supports cursor-style loading through `onLoadMore`, `hasMore`, and
  `pageSize`. Form and `Action.SubmitForm` fit structured Spendly mutation
  input; `confirmAlert` and Toast fit confirmation and outcome feedback.
- OAuth extensions are public clients and use PKCE. `OAuth.PKCEClient` owns the
  authorization redirect and secure token-set storage, including refresh-token
  lifecycle and Raycast's automatic logout preference.
- Extension preferences and `LocalStorage` use Raycast's encrypted local
  database. LocalStorage is shared only between commands in the same extension
  and is not intended for large datasets.
- Public Store submission runs `npm run build` and `npm run publish`; publishing
  opens a pull request in the public `raycast/extensions` repository for review.
  Public extension source is therefore inspectable and cannot depend on an
  unpublished Spendly workspace package.

The npm registry reported `@raycast/api@2.4.1`, which currently requires
Node.js `>=22.22.2`. Recheck Raycast, Node, React, and API versions immediately
before scaffolding the extension.

## Reuse Audit

| Layer | Reuse result | Future Raycast action |
| --- | --- | --- |
| Backend domain and ledger operations | Reusable | Keep Web, CLI, MCP, and Raycast wrappers on the same internal functions. |
| Symbolic operation registry | Reusable | Import the same typed operations; never spawn the CLI. |
| Zod inputs, outputs, and stable errors | Reusable | Move with the operation core and map validation errors to Form fields or failure Toasts. |
| JSON Schema generation | Reusable but not required for UI | Retain it for contract tests and possible Raycast AI tools; native forms use the TypeScript/Zod contract directly. |
| Abort and progress hooks | Reusable | Abort stale searches and page loads; map progress to `isLoading` and animated Toast state. |
| Convex query/mutation policy | Reusable after decoupling | Build a Raycast-authenticated gateway with the same query retry and no-automatic-commit-retry rules. |
| CLI name lookup and prompts | Not reusable | Use Raycast List/Dropdown selectors that submit stable IDs. |
| CLI human/JSON rendering | Not reusable | Render native List, Detail, Form, Alert, and Toast surfaces. |
| CLI OAuth callback and keyring | Not reusable | Use `OAuth.PKCEClient`; direct Keychain access is not acceptable for a Store extension. |
| MCP transport and schemas | Not reusable for UI | Keep JSON-RPC, tools/resources, and MCP authorization in the MCP adapter. |
| Mutation provenance | Reusable contract, new wrapper later | Use trusted origin `raycast`; never accept provenance from Form input. |

## Target Architecture

```text
CLI flags/prompts        MCP request            Raycast List/Form action
       |                      |                           |
       v                      v                           v
 CLI adapter             MCP adapter               Raycast adapter
       |                      |                           |
       +----------------------+---------------------------+
                              |
                    Spendly typed operations
                              |
                  authenticated backend gateway
                              |
                 shared domain and ledger helpers

terminal/JSON output      MCP response          native view/alert/toast
```

The Raycast adapter owns UI state, navigation, selection, OAuth lifecycle,
bounded caching, and feedback. The operation layer owns input/output validation
and one invocation of the authenticated backend contract.

## Authentication Boundary

The Raycast extension needs a distinct public Clerk OAuth application named for
Raycast. Reusing the CLI client ID would mix redirect URIs, token audience, and
revocation evidence across two independently released clients.

When implementation begins:

1. Freeze the Raycast package name, then register the exact Raycast redirect
   URI emitted for `OAuth.RedirectMethod.Web` in the new Clerk application.
2. Configure a public client, PKCE S256, consent, and only
   `openid profile email offline_access`. Never embed a client secret.
3. Use `OAuth.PKCEClient.authorizationRequest()` and `authorize()` for state,
   verifier, browser consent, and redirect handling.
4. Exchange the returned authorization code at Clerk's token endpoint using
   the request's `clientId`, `codeVerifier`, and `redirectURI`. Validate the
   token response and ID token with shared OIDC helpers before storage.
5. Store and refresh the standard token response with the Raycast OAuth client.
   Use the validated ID token to authenticate `ConvexHttpClient`.
6. Add the Raycast client ID as a separate accepted Convex auth provider and
   verify exact issuer, audience, subject-to-Spendly-user mapping, refresh,
   revocation, logout, and `ACCOUNT_SETUP_REQUIRED` behavior.

Do not import the CLI callback server, browser launcher, credential store, or
`@napi-rs/keyring`. Raycast's Store preparation guidance rejects extensions
that request direct Keychain access, and its OAuth API already provides secure
token-set storage and logout integration.

## Initial Command Mapping

Start with a small native surface rather than exposing all 32 operations as
separate root commands.

| Raycast command | Shared operations | Native surface |
| --- | --- | --- |
| Spendly Overview | `context.get`, `summary.get` | List or Detail with current-cycle totals and navigation actions |
| Search Expenses | `expenses.list`, `expenses.get` | Paginated List, filters in Dropdowns, Detail for the selected expense |
| Add Expense | supporting resource lists, `expenses.previewCreate`, `expenses.create` | Form, preview Detail, explicit confirmation, progress/success Toast |
| Manage Accounts | `accounts.list`, `accounts.get`, `accounts.transactions` | List with bounded transaction pagination and account actions |
| Account Actions | account previews/commits and transfer previews/commits | Form plus preview/confirmation; never a silent `no-view` write |

Recommended delivery sequence:

1. Ship a read-only local prototype for overview, expense search, and accounts.
2. Add Raycast OAuth and the authenticated gateway with no cached financial
   payloads.
3. Add expense creation with preview-before-commit and fresh idempotency keys.
4. Add edit/delete and account mutations only after revision, deletion-handle,
   uncertain-outcome, and ledger-effect tests pass in the Raycast adapter.
5. Consider Raycast AI tools only as a separate product phase with human-in-the-
   loop confirmations and evals. Do not automatically mirror the MCP tool set.

Defer a menu-bar balance display and background refresh. Persistent financial
amounts create privacy, staleness, rate-limit, and shared-state concerns that
are not needed to prove the core extension experience.

## Packaging Decision Gate

The future extension implementation must choose one distribution strategy
before UI work expands:

1. **Preferred for a public Store extension:** move the canonical core to a
   versioned public package such as `@spendly/integration-core`. Publish it
   without credentials or environment configuration, pin a reviewed version in
   the Raycast extension, and either bundle it into or use an exact dependency
   from the CLI release. Test both artifacts against the same contract suite.
2. **Acceptable when a public package is undesirable:** generate a source
   snapshot into the extension with a recorded source hash, license, automated
   diff check, and a required synchronization step on every core change.
3. **Private organization extension only:** a private workspace package may be
   used if Raycast's private-store build proves it resolves and packages the
   dependency without relying on the developer checkout.

Rejected designs are a relative import from `apps/cli`, a public Store manifest
containing `workspace:*`, a manually maintained fork of operation logic, or a
runtime dependency on an installed `spendly` executable.

Do not move the core before the initial CLI release solely for folder aesthetics. The
current CLI build uses TypeScript emission with `rootDir: src`, and its package
verifier rejects local dependency protocols. A premature workspace extraction
would require a real bundling/release change. Make that change when a Raycast
prototype can verify both consumers, then rerun the CLI tarball isolation gate.

## Safety, Privacy, and Caching

- Preserve preview-before-commit. Forms collect inputs; the preview view shows
  the exact change; an explicit action confirms the commit.
- Generate idempotency keys in the Raycast adapter and retain the key only long
  enough to resolve an uncertain outcome. Never automatically retry commits.
- Pass revisions and deletion confirmation handles unchanged. Treat handles as
  opaque, user-bound, and expiring.
- Keep stable IDs in operation inputs while presenting human names in native
  selectors. Never infer an ambiguous account, category, tag, or expense.
- Do not put tokens, authorization URLs, headers, personal data, or financial
  payloads in logs, Toast details, preferences, or crash messages.
- Avoid persistent financial caching for the first release. If a read cache is
  later justified, bound its size and age, namespace it per user, mark stale
  data visibly, and clear it on logout or account change.
- Expected network and domain errors should be mapped to concise Toasts with a
  safe retry or recovery action. Keep raw causes out of production UI.

## Future Implementation Plan

1. Recheck the current Raycast APIs, runtime, Store guidelines, and Clerk OAuth
   support; record exact versions and redirect behavior.
2. Choose public, generated-snapshot, or private distribution and prove it with
   one operation imported into a minimal extension build.
3. Extract the operation core, schemas, errors, and reusable OIDC validation
   without importing Commander, Clack, process streams, the MCP SDK, or
   Raycast APIs into the core.
4. Make the CLI consume the extracted core and pass its full tests, typecheck,
   production build, shrinkwrap audit, and isolated tarball verification.
5. Scaffold the extension from the current Raycast template. Start with `view`
   commands and native components; do not add `menu-bar`, background intervals,
   or AI tools in the first slice.
6. Implement the Raycast OAuth adapter and authenticated Convex gateway, then
   prove issuer/audience validation, refresh, revocation, logout, and setup
   errors with the separate Raycast client.
7. Add read commands with cancellation, bounded pagination, empty/loading/error
   states, privacy-safe diagnostics, and stable-ID selectors.
8. Add mutation Forms, previews, explicit confirmation, progress, provenance,
   conflict handling, and uncertain-outcome recovery.
9. Run core contract tests plus Raycast lint/build, local development checks,
   Store preparation checks, and authenticated user testing before publication.
10. Publish only after the public-source and dependency model has been reviewed;
    `npm run publish` opens a Raycast Store pull request and does not publish an
    extension from the Spendly repository alone.

## Verification Checklist

- [x] Current official Raycast runtime, manifest, UI, OAuth, storage, security,
      build, and publication documentation reviewed.
- [x] Shared operations have no Commander, Clack, process-stream, keyring, MCP,
      React, or Raycast API dependency.
- [x] Raycast can supply an adapter-owned `raycast` mutation origin without
      changing preview inputs or trusting user-provided provenance.
- [x] The CLI release contains no Raycast runtime dependency or extension
      entrypoint.
- [x] Reusable and adapter-only responsibilities are recorded for every major
      CLI layer.
- [x] Public Store packaging constraints and acceptable sharing strategies are
      recorded before extension implementation.
- [x] A separate Clerk public-client, redirect, token storage, Convex audience,
      refresh, and logout design is recorded.
- [x] Initial native commands and the preview/confirm mutation flow are mapped
      to the shared operation registry.
- [x] The future extension is explicitly deferred from the initial CLI release scope.
- [x] Full CLI tests, CLI typecheck, focused formatting, dependency leakage,
      and diff checks pass.

## Implementation Evidence

Recorded on 2026-09-16:

- The npm registry reported `@raycast/api@2.4.1` with Node.js `>=22.22.2` and
  `@raycast/utils@2.3.1` with its current peer requirements.
- The full CLI suite passed: 30 files and 158 tests, including the new Raycast
  invocation-origin coverage and the existing MCP compatibility harness.
- The CLI production typecheck passed.
- Focused Biome checks passed for the operation source and test; Markdown files
  are outside the configured Biome inputs.
- `git diff --check` passed.
- Static checks found no `@raycast/*` dependency in the CLI manifest or npm
  shrinkwrap.

## Exit Criterion

Phase 8.12 is complete when the shared operation service is demonstrably usable
from a Raycast-owned adapter, no Raycast dependency or UI code enters the CLI
artifact, the public Store packaging and separate OAuth boundaries are explicit,
and the roadmap contains a bounded future extension implementation phase. A
running or published Raycast extension is not part of this phase.

## References

- [Raycast Getting Started](https://developers.raycast.com/basics/getting-started)
- [Raycast manifest](https://developers.raycast.com/information/manifest)
- [Raycast file structure](https://developers.raycast.com/information/file-structure)
- [Raycast List and pagination](https://developers.raycast.com/api-reference/user-interface/list)
- [Raycast Form](https://developers.raycast.com/api-reference/user-interface/form)
- [Raycast actions](https://developers.raycast.com/api-reference/user-interface/actions)
- [Raycast alerts](https://developers.raycast.com/api-reference/feedback/alert)
- [Raycast OAuth](https://developers.raycast.com/api-reference/oauth)
- [Raycast preferences](https://developers.raycast.com/api-reference/preferences)
- [Raycast storage](https://developers.raycast.com/api-reference/storage)
- [Raycast security](https://developers.raycast.com/information/security)
- [Prepare an extension for the Store](https://developers.raycast.com/basics/prepare-an-extension-for-store)
- [Publish an extension](https://developers.raycast.com/basics/publish-an-extension)
- [Raycast CLI](https://developers.raycast.com/information/developer-tools/cli)
- [Clerk public clients and PKCE](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth)
