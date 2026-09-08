# OpenCode Private Enterprise Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce internal-only provider and host policy in OpenCode Private.

**Architecture:** Add a central policy module in `packages/core`, call it from model discovery, config loading, provider runtime construction, auth/UI/CLI flows, and the lower-level LLM transport package.

**Tech Stack:** TypeScript, Bun test, Effect services, OpenCode monorepo.

---

### Task 1: Enterprise Policy Core

**Files:**
- Create: `packages/core/src/enterprise-policy.ts`
- Test: `packages/core/test/enterprise-policy.test.ts`

- [x] Write failing unit tests for allowed providers, blocked providers, allowed internal hosts, and blocked public hosts.
- [x] Implement provider and URL allowlist helpers.
- [x] Run `bun test test/enterprise-policy.test.ts` from `packages/core`.

### Task 2: Block Remote Model Discovery

**Files:**
- Modify: `packages/core/src/models-dev.ts`
- Test: `packages/core/test/models.test.ts`

- [x] Add a test proving `ModelsDev.get()` does not call `https://models.dev` under enterprise policy.
- [x] Return an empty catalog when no local model file exists.
- [x] Run the targeted `models.test.ts` cases from `packages/core`.

### Task 3: Enforce Provider Runtime Policy

**Files:**
- Modify: `packages/opencode/src/provider/provider.ts`
- Test: `packages/opencode/test/provider/provider.test.ts`

- [x] Add tests proving external config providers and external base URLs are rejected.
- [x] Filter provider catalog/config/auth/plugin providers through `EnterprisePolicy`.
- [x] Validate resolved base URLs and fetch request URLs before SDK creation/network egress.
- [x] Run targeted provider tests from `packages/opencode`.

### Task 4: Disable External Auth and Custom Provider Onboarding

**Files:**
- Modify: `packages/opencode/src/auth/index.ts`
- Modify: `packages/opencode/src/provider/auth.ts`
- Modify: `packages/opencode/src/cli/cmd/providers.ts`
- Modify: `packages/app/src/components/dialog-connect-provider.tsx`
- Modify: `packages/app/src/components/dialog-select-provider.tsx`
- Modify: `packages/app/src/components/settings-providers.tsx`
- Modify: `packages/app/src/components/settings-v2/providers.tsx`
- Test: `packages/opencode/test/auth/auth.test.ts`
- Test: `packages/opencode/test/plugin/auth-override.test.ts`

- [x] Block user-stored provider credentials with `Feature disabled by administrator.`
- [x] Hide provider auth methods and disable CLI login.
- [x] Remove custom provider entry points from UI provider selection/settings.
- [x] Run targeted auth/provider tests and app typecheck.

### Task 5: Enforce Lower-Level LLM Egress

**Files:**
- Create: `packages/llm/src/enterprise-policy.ts`
- Modify: `packages/llm/src/route/transport/http.ts`
- Test: `packages/llm/test/enterprise-policy.test.ts`

- [x] Add failing LLM transport test for `https://api.openai.com/v1`.
- [x] Validate rendered request URLs before HTTP/WebSocket transport can execute.
- [x] Run targeted LLM tests and typecheck.

### Task 6: Seed Enterprise Default Config

**Files:**
- Modify: `packages/core/src/enterprise-policy.ts`
- Modify: `packages/opencode/src/config/config.ts`
- Test: `packages/opencode/test/config/config.test.ts`

- [x] Seed default provider `kurumici` with MiniMax M2.5 and internal gateway.
- [x] Reset blocked configured `model` and `small_model` values to the enterprise default.
- [x] Run targeted config/provider tests and typecheck.

### Task 7: Verification

**Files:**
- Modify only touched source/tests if verification fails.

- [x] Run `bun typecheck` from `packages/core`.
- [x] Run `bun typecheck` from `packages/opencode`.
- [x] Run `bun typecheck` from `packages/llm`.
- [x] Run `bun typecheck` from `packages/app`.
- [x] Run targeted tests for core, opencode, and llm policy.

### Task 8: Sync Windows/MSI Packaging Into The Policy

The Windows packaging work (desktop MSI seed, private MSI, WSL install, uninstall script) landed
after Tasks 1-7 and re-introduced enterprise values as literals outside the policy module. Fold them
back in so `EnterprisePolicy` stays the single source of truth.

**Files:**
- Modify: `packages/core/src/enterprise-policy.ts`
- Modify: `packages/desktop/src/main/opencode-config.ts`
- Modify: `packages/desktop/src/main/wsl/runtime.ts`
- Modify: `packages/desktop/src/renderer/index.tsx`
- Modify: `packages/opencode/src/config/config.ts`
- Modify: `packages/opencode/src/installation/index.ts`
- Create: `packages/opencode/script/enterprise-config-seed.ts`
- Modify: `.github/workflows/build-opencode-private-msi.yml`
- Test: `packages/core/test/enterprise-policy.test.ts`
- Test: `packages/desktop/src/main/opencode-config.test.ts`

- [x] Own the config schema URL in the policy (`DEFAULT_CONFIG_SCHEMA_URL`, `configSchemaURL`) and
      validate the `OPENCODE_CONFIG_SCHEMA_URL` override against the host allowlist.
- [x] Own the install source in the policy (`DEFAULT_INSTALL_URL`, `ALLOWED_INSTALL_HOSTS`,
      `isInstallURLAllowed`, `assertInstallURLAllowed`, `installURL`) and validate the
      `OPENCODE_INSTALL_URL` override.
- [x] Stop the WSL installer from fetching `https://opencode.ai/install`; use the sanctioned source.
- [x] Drop the remote `opencode.ai` notification icon from the desktop renderer.
- [x] Seed the full enterprise default config (provider + model) on Windows instead of a bare
      `$schema`, via `defaultConfigJSON()`.
- [x] Generate the MSI config seed from the policy at build time and ship it as an MSI component so
      the installer cannot drift from the policy module.
- [x] Assert in the MSI smoke test that a fresh install is seeded with the enterprise provider/model.
- [x] Run targeted core and desktop policy tests.
