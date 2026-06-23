# OpenCode Enterprise Policy Design

## Goal

Build a corporate OpenCode fork that can use only approved internal providers and hosts.

## Architecture

Add a central `EnterprisePolicy` module in `packages/core`. Every high-risk app path calls the same module: remote model discovery, provider catalog assembly, provider SDK creation, config defaults, auth flows, and outbound provider requests. The lower-level `packages/llm` transport owns a matching egress policy because it cannot import `packages/core` without reversing package dependency direction.

The default policy is strict for this fork. Allowed providers are `kurumici` and `ollama`. Allowed hosts are local addresses, `llm-gateway.internal.local`, `aihub-api.turktelekom.com.tr`, `*.internal.local`, and `*.turktelekom.com.tr`.

## Enforcement Points

- `packages/core/src/models-dev.ts`: returns an empty catalog and never fetches `https://models.dev`.
- `packages/opencode/src/config/config.ts`: seeds the default `kurumici/MiniMaxAI/MiniMax-M2.5` config and resets blocked default model refs.
- `packages/opencode/src/provider/provider.ts`: removes providers outside the allowlist and validates provider base URLs before SDK creation.
- Provider fetch wrappers validate each request URL immediately before network egress.
- `packages/opencode/src/auth/index.ts` and `packages/opencode/src/provider/auth.ts`: block user provider credentials, OAuth, API-key methods, and remote well-known config.
- `packages/opencode/src/cli/cmd/providers.ts` and app provider settings dialogs: disable external provider login/connect/custom-provider onboarding.
- `packages/llm/src/route/transport/http.ts`: validates rendered request URLs before HTTP/WebSocket transport can execute.

## Test Strategy

- Unit-test `EnterprisePolicy` provider and URL decisions in `packages/core`.
- Add provider-service tests for config providers outside the allowlist.
- Add runtime tests for blocked external base URLs.
- Add auth/config/UI-adjacent tests for disabled onboarding behavior and default config.
- Add LLM transport tests for blocking public provider hosts before request execution.
- Run targeted Bun tests from package directories, then typecheck touched packages.

## Out Of Scope For First Patch

- Proxy/firewall implementation.
- Gateway-side audit logging and DLP.
- Full localization for disabled provider-connect flows.
