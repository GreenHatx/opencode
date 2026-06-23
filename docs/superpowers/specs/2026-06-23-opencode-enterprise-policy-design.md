# OpenCode Enterprise Policy Design

## Goal

Build a corporate OpenCode fork that can use only approved internal providers and hosts.

## Architecture

Add a central `EnterprisePolicy` module in `packages/core`. Every high-risk path calls the same module: remote model discovery, provider catalog assembly, provider SDK creation, and outbound provider requests.

The default policy is strict for this fork. Allowed providers are `kurumici` and `ollama`. Allowed hosts are local addresses, `llm-gateway.internal.local`, `aihub-api.turktelekom.com.tr`, `*.internal.local`, and `*.turktelekom.com.tr`.

## Enforcement Points

- `packages/core/src/models-dev.ts`: returns an empty catalog and never fetches `https://models.dev`.
- `packages/opencode/src/provider/provider.ts`: removes providers outside the allowlist and validates provider base URLs before SDK creation.
- Provider fetch wrappers validate each request URL immediately before network egress.
- Later UI/CLI work disables credential onboarding and custom provider screens so users see the policy earlier, but runtime remains authoritative.

## Test Strategy

- Unit-test `EnterprisePolicy` provider and URL decisions in `packages/core`.
- Add provider-service tests for config providers outside the allowlist.
- Add runtime tests for blocked external base URLs.
- Run targeted Bun tests from package directories, then typecheck touched packages.

## Out Of Scope For First Patch

- Proxy/firewall implementation.
- Gateway-side audit logging and DLP.
- Full UI copy/localization for all disabled provider-connect flows.
