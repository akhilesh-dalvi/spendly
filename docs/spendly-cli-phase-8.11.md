# Spendly CLI Phase 8.11: MCP Reuse Readiness

## Status

- Status: complete for the current post-refactor checkout; shared-operation,
  MCP compatibility, automated integration, and affected terminal checks pass
- Depends on: Phase 8.9 implementation and the Phase 8.10 interactive baseline
- Feeds: Phase 8.12 Raycast reuse readiness
- Blocks: release-ready source handoff and Phase 9
- Protocol baseline reviewed: MCP `2026-07-28`
- SDK baseline implemented: official `@modelcontextprotocol/server@2.0.0`
  and `@modelcontextprotocol/client@2.0.0`
- Last updated: 2026-09-29

## Objective

Make the completed Spendly CLI implementation reusable by a later MCP server
without shipping an MCP server in the initial release. Extract and verify one headless,
transport-neutral operation layer for reads, previews, and commits while
preserving every CLI command, JSON schema, exit code, prompt, safety rule, and
backend contract.

## Implementation Progress

The reusable boundary now lives in `apps/cli/src/core/operations.ts`. It owns a
32-operation symbolic registry covering every current CLI read, preview, and
commit, along with strict Zod inputs, existing result schemas, backend function
mapping, abort/progress hooks, mutation-outcome handling, and JSON Schema
2020-12 generation. It has no Commander, Clack, output, process-stream, or MCP
SDK dependency.

CLI authentication still creates the authenticated Convex gateway. It now
constructs the shared operation service and supplies the typed invocation
origin (`cli` or `cli_agent`) through a commit-only provenance adapter. Command
and prompt helpers call symbolic operations; raw `cli/v1` names are confined to
the registry. A future MCP adapter can supply `mcp` without the shared core
inventing or trusting transport identity. The actual future backend MCP wrapper
must map that origin to a new backend source value; Phase 8.11 does not add or
write that production provenance yet. Phase 8.12 extends the same typed seam
with `raycast` for a future native extension.

The non-shipping compatibility suite registers a paginated expense-list tool,
an account resource, an expense-create preview, and an expense-create commit
with the official v2 server SDK. Calls run over linked in-memory transports and
use the same operations as the CLI. The client pins `2026-07-28`, and the server
uses the era-aware `serveStdio` factory with legacy requests rejected. This is
intentional: directly connecting a hand-constructed v2 `McpServer` retains the
legacy 2025 handshake even though v2 supports the modern protocol.

A second stream-backed check uses the SDK's actual `StdioServerTransport`. It
proves every stdout line is JSON-RPC and that a malformed `tools/call` receives
a JSON-RPC invalid-params error instead of a tool result. Shared-operation abort
coverage and MCP handler signal forwarding cover practical cancellation.

The MCP server and client packages are root-only development dependencies.
They are absent from `apps/cli/package.json`, its npm shrinkwrap, the production
build, and the verified CLI tarball.

Automated evidence recorded on 2026-09-16:

- CLI production typecheck passed.
- The full CLI suite passed: 30 files and 157 tests, including seven shared-core
  tests and four modern MCP compatibility tests.
- The backend Convex typecheck and all 37 backend tests passed; the Web
  typecheck passed.
- CLI documentation validation passed across 8 pages, 27 command paths, 69
  examples, 2 JSON examples, links, and leakage boundaries; the Spendly skill
  validation passed all 10 evaluations.
- Focused Biome checks passed for the operation core, adapters, harness, and
  affected command modules.
- `pack:verify` passed its out-of-tree package, install, executable, version,
  help, JSON, and exit-code checks.
- Static dependency checks found no MCP package in the CLI manifest,
  shrinkwrap, production dependency tree, or compiled output.

The affected Phase 8.10 real-terminal retest passed on 2026-09-29 after the
shared-operation refactor. The final local integration check on the same
post-refactor checkout also passed:

- CLI: 30 test files, 169 tests, including eight shared-operation tests and
  four MCP compatibility tests; production and development TypeScript checks
  and both builds passed.
- Backend: 3 test files, 38 tests and the Convex TypeScript project passed;
  Web TypeScript and CLI documentation validation passed.
- Focused Biome, validation of 10 Spendly skill evaluation definitions,
  isolated package verification, the production-dependency audit, and
  `git diff --check` passed.
- A rebuilt development CLI opened the static numbered launcher in a PTY;
  choosing Exit returned code 0 with no backend write.

This is a local integration sign-off, not an immutable release-candidate or
published-package sign-off. Those remain separate release gates.

The phase is necessary because the current code is reusable at the backend
boundary but not at the CLI action boundary. `cli/v1` already centralizes
ownership, normalization, dry runs, revisions, idempotency, deletion
capabilities, pagination, and stable results. However, the functions in
`apps/cli/src/commands/*-actions.ts` currently combine those operations with
Commander options, CLI authentication, name resolution, prompts, progress,
rendering, and writes to process streams. An MCP handler must not invoke or
emulate a CLI process to use the same business workflow.

## Latest MCP Baseline

This plan targets the final MCP `2026-07-28` specification and the official
TypeScript SDK v2 as reviewed on 2026-09-16. Recheck both immediately before
implementation and record the exact SDK versions used by the compatibility
harness.

Relevant constraints are:

- MCP is JSON-RPC 2.0 with stateless, self-contained requests and per-request
  protocol metadata. Modern clients may discover capabilities through
  `server/discover`; HTTP no longer uses protocol sessions.
- Tools are model-controlled operations with JSON Schema 2020-12 input and
  optional output schemas. Business and validation failures belong in tool
  results with `isError: true`; malformed protocol requests remain JSON-RPC
  errors.
- Resources are application-controlled, read-only data identified by URIs.
  Tool and resource catalogs are deterministic, paginated, private-cache-aware
  results.
- STDIO reserves stdout exclusively for newline-delimited MCP messages. Logs
  may use stderr. Streamable HTTP uses one POST endpoint, requires origin
  validation, and should authenticate every connection.
- HTTP authorization is a new resource-server boundary using OAuth 2.1,
  Protected Resource Metadata, resource indicators, audience validation, and
  bearer tokens on every request. The CLI's Clerk browser login is not an MCP
  HTTP authorization server.
- Cancellation should stop work as soon as practical. Progress is
  request-scoped. Long-running Tasks are an optional extension and are not
  justified by the current bounded Spendly operations.
- Roots, Sampling, Logging, the legacy HTTP+SSE transport, and Dynamic Client
  Registration are deprecated for new implementations. Do not introduce them
  in the future-readiness layer.

## Reuse Audit

| Layer                                         | Current reuse result                 | Phase 8.11 action                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend domain operations                     | Reusable                             | Keep Web, CLI, and future MCP wrappers on the same internal expense, account, transfer, and ledger functions.                                                                 |
| `cli/v1` backend behavior                     | Reusable contract, CLI-named adapter | Preserve it for released CLI compatibility; extract any remaining wrapper logic needed by a future `mcp/v1` adapter into transport-neutral internal functions.                |
| Zod result schemas and domain parsers         | Reusable after relocation            | Move protocol-independent schemas and parsers to a private shared package or a dependency-neutral core module imported by both adapters.                                      |
| Convex query/mutation client and retry policy | Reusable after decoupling            | Expose a backend gateway independent of Commander, terminal output, and credential lookup. Never retry commits automatically.                                                 |
| CLI command action functions                  | Not reusable today                   | Split orchestration into headless operations plus thin CLI parsing, prompting, confirmation, progress, and rendering adapters.                                                |
| CLI authentication and credential storage     | Local implementation detail          | Inject authenticated backend access. Do not make the shared operation layer open a browser, read a keychain, or own tokens.                                                   |
| MCP transport and authorization               | New code later                       | Keep STDIO/Streamable HTTP framing, discovery, OAuth resource-server behavior, scopes, and protocol errors in the future MCP adapter.                                         |
| Human terminal and JSON output                | CLI-only                             | Keep all writers and renderers outside the shared operation layer. MCP maps results to `structuredContent`, text content, resource contents, or `isError`.                    |
| Mutation provenance                           | CLI-coupled today                    | Remove `agent` injection from shared operations. The invoking adapter supplies a typed origin that backend wrappers map without allowing callers to forge a trusted identity. |

## Target Architecture

```text
Commander flags / prompts                 future MCP tool or resource request
            |                                           |
            v                                           v
     CLI input adapter                           MCP protocol adapter
            |                                           |
            +------------> Spendly operations <---------+
                              |
                       authenticated gateway
                              |
                    shared backend facade logic
                              |
                  shared domain and ledger helpers

CLI renderer / exit code                   MCP result / protocol error mapper
```

The shared operation layer must:

- accept typed structured inputs rather than Commander `Command` objects or
  stringly terminal options;
- return typed structured results without writing stdout/stderr or rendering
  human text;
- accept an injected authenticated gateway, optional abort signal, and optional
  progress sink; require adapters to resolve local dates and idempotency keys
  before invoking an operation so transport policy stays outside the core;
- expose symbolic operations instead of scattering raw Convex function names
  through command handlers;
- preserve stable-ID selection, local-date semantics, dry-run/commit parity,
  idempotency, revisions, and deletion confirmation capabilities;
- surface typed domain failures so CLI and MCP adapters can map them without
  parsing formatted messages;
- keep authentication, authorization scopes, consent UI, protocol metadata,
  caching, and transport lifecycle outside the domain workflow; and
- have no dependency on Commander, Clack, Node process streams, or the MCP SDK.

The preferred source boundary is a framework-neutral workspace package such as
`@spendly/integration-core`. Its release form may be private, public, or bundled
depending on the consumer. Phase 8.12 records the additional public Raycast
Store distribution constraint. Future adapters must consume the canonical core
rather than importing CLI command modules or spawning the `spendly` executable.

## Future MCP Surface Mapping

Phase 8.11 documents and tests a mapping; it does not expose a production MCP
server.

- Use tools for filtered/paginated reads and every preview or commit operation
  because those calls are model-controlled and accept arguments.
- Reserve resources for bounded read-only context with stable Spendly URIs,
  such as an account or expense snapshot. Do not mirror the entire account into
  an eagerly listed resource catalog or claim subscriptions before a privacy
  and invalidation design exists.
- Define both input and output schemas from the shared Zod contracts. MCP
  `structuredContent` must match the output schema; a concise serialized text
  block remains available for compatible clients.
- Keep tool ordering deterministic and mark user-specific catalogs and
  financial resource results with private cache scope.
- Preserve the existing preview-before-commit workflow. A commit requires the
  same explicit idempotency key and revision inputs as the non-interactive CLI;
  expense deletion also requires the short-lived confirmation handle returned
  by preview.
- Treat confirmation tokens and future continuation handles as opaque,
  user-bound, expiring handles and revalidate authorization on every call.
- Map input, conflict, ambiguity, expiry, and business-rule failures to MCP
  tool execution errors. Reserve JSON-RPC errors for malformed or unsupported
  MCP requests.
- Do not add Tasks, prompts, elicitation, resource subscriptions, or MCP Apps
  merely to prove reuse. Those require separate product decisions.

## Authentication and Provenance Boundary

Two possible future deployments need different adapters:

1. A local STDIO server inherits a deliberately provisioned credential through
   its launch environment or another explicitly approved bootstrap mechanism.
   It must never start the CLI browser-login or terminal prompt flow on the MCP
   stdout channel.
2. A remote Streamable HTTP server is an OAuth resource server. It needs its
   own Protected Resource Metadata, canonical resource URI, scopes, issuer and
   audience validation, origin checks, and step-up authorization behavior.
   The current CLI OAuth client is not sufficient for this role.

Phase 8.11 must also define an adapter-owned invocation-origin contract. The
current optional backend `agent` boolean maps only to `cli` or `cli_agent` and
would mislabel an MCP mutation. Preserve backward compatibility for `cli/v1`,
but ensure shared backend logic can later receive an MCP-specific origin from a
dedicated wrapper. Provenance is descriptive and must never become an
authorization decision.

## Implementation Plan

1. Inventory each read, preview, and commit action and record its parsing,
   lookup, backend, safety, rendering, and authentication responsibilities.
2. Introduce typed input/output contracts and a headless authenticated backend
   gateway. Consolidate duplicate query, mutation, schema-parse, and uncertain
   outcome behavior behind it.
3. Extract one operation per current command. Keep human exact-name lookup and
   prompt collection in the CLI adapter; make stable IDs the core contract.
4. Move reusable schemas, date/amount parsing, error types, and selectors to the
   shared boundary without widening the published npm package unintentionally.
5. Change CLI command handlers into thin adapters that resolve global options,
   collect input, call the operation, and render the returned result.
6. Extract backend wrapper logic that is still specific to `cli/v1` but is
   needed by a future MCP namespace. Preserve the released `cli/v1` function
   names and shapes.
7. Move mutation-origin injection to the adapter boundary and document the
   backward-compatible path for future `mcp` provenance.
8. Generate representative JSON Schema 2020-12 input and output definitions
   from the shared contracts and reject schemas that cannot be consumed by the
   official MCP SDK.
9. Add a non-shipping compatibility harness with the current official
   `@modelcontextprotocol/server` v2 package. Register at least one paginated
   read tool, one read-only resource, one mutation preview, and one commit
   handler by calling the same operations used by the CLI. Exclude the harness
   and MCP SDK from the published CLI tarball.
10. Run the full local CLI, backend, Web, docs, skill, and package checks.
    Repeat affected Phase 8.10 terminal paths after the refactor; keep
    source-baseline checks in the release workflow; Phase 9 freezes the
    immutable publication candidate after production configuration.

## Verification Checklist

- [x] No production MCP endpoint, server entrypoint, OAuth resource server, or
      new public command is shipped in the initial release.
- [x] Every CLI read, preview, and commit reaches a typed headless operation;
      command modules contain only CLI adapter responsibilities.
- [x] The shared operation package has no imports from Commander, Clack, CLI
      output modules, process streams, or the MCP SDK.
- [x] Shared operations can run with an injected fake gateway and without a
      TTY, process-global environment, credential store, or renderer.
- [x] The CLI's command syntax, JSON envelopes, error codes, exit codes,
      pagination, and human output remain compatible.
- [x] Preview/commit parity, no automatic commit retry, idempotency replay,
      revision conflicts, deletion-token expiry/use, and account ledger effects
      remain covered at the shared-operation and adapter levels.
- [x] Backend Web and `cli/v1` wrappers still share the same domain mutation
      implementation, and a future namespace can call it without importing a
      CLI-specific wrapper.
- [x] Mutation source is adapter-owned, included in idempotency fingerprints,
      and cannot be mislabeled as CLI solely because the core was reused.
- [x] Representative MCP v2 tools/resources compile and pass in-memory calls
      using the same operation functions as CLI tests.
- [x] Generated input/output schemas validate representative tool arguments,
      structured results, arrays, nullable values, cursors, and stable errors.
- [x] Compatibility tests prove that MCP business failures map to tool
      execution errors while malformed calls map to protocol errors.
- [x] STDIO harness output contains only MCP JSON-RPC on stdout; diagnostics
      use stderr and all request handlers honor cancellation where practical.
- [x] The MCP SDK and compatibility harness are absent from `npm pack`, the
      production CLI dependency graph, and normal CLI startup.
- [x] Full local integration gates and affected Phase 8.10 terminal checks pass
      against the current post-refactor checkout.

## Exit Criterion

Phase 8.11 is complete for the current checkout: every CLI operation uses the
same headless typed service as the non-shipping MCP v2 compatibility harness,
the CLI contract and backend provenance are preserved, and the post-refactor
automated suite plus affected manual terminal verification passed. The Phase 9
publication-candidate freeze is separate.

## References

- [MCP `2026-07-28` specification](https://modelcontextprotocol.io/specification/2026-07-28)
- [MCP `2026-07-28` changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [MCP resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)
- [MCP STDIO transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio)
- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [Official MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)
